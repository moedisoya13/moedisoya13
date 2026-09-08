"""긱뉴스 수집.

실측(Actions 러너, 2026-09-07) 근거:
  - https://news.hada.io/rss/news 는 200 을 돌려주는 Atom 피드(50건)다.
    entry 에 title / link / id / published(+published_parsed) / summary(HTML) 가 들어 있고,
    link 는 https://news.hada.io/topic?id=NNNNN 형태다.
  - feeds.hada.io 는 DNS 조회에 실패한다(존재하지 않는 호스트). 쓰지 않는다.
  - https://news.hada.io/rss/topics 는 404 다. 존재하지 않는 피드다.
  - https://news.hada.io/new 는 CloudFront 가 403 Forbidden 을 돌려준다.
    User-Agent 를 바꿔도(레포 UA / Mozilla/5.0 / UA 없음) 전부 403 이므로
    UA 문제가 아니라 CDN 단의 접근 차단이다. 우회하지 않고 HTML 크롤링을 포기하며,
    사람이 눌러서 여는 링크로만 쓴다(SITE_NEW_URL).

Show GN 관련 실측(Actions 러너, 2026-09-08):
  - Show GN 전용 피드는 존재하지 않는다.
    /rss/show, /rss/showgn, /rss/show_gn, /rss/ask, /feed/show 는 전부 404 다.
    /rss/news?type=show 와 ?category=show 는 200 이지만 응답 바이트가 /rss/news 와
    완전히 동일하다(45221) — 쿼리 파라미터를 무시한다.
    /show HTML 은 /new 과 같이 CloudFront 가 403 을 돌려준다.
  - /rss/news 의 entry 에는 category/tag 요소가 아예 없다(50건 중 0건).
    카테고리를 알려주는 필드가 없으므로 남는 단서는 제목뿐이다.
  - 실제로 50건 중 5건의 제목이 'Show GN:' 으로 시작했다. 이 접두사가 유일한
    식별 수단이다(is_show_gn). 작성자가 접두사를 빠뜨리면 놓치는데, 피드가 주는
    정보가 이것뿐이라 피할 수 없는 한계다.

즉 실질적으로 쓸 수 있는 소스는 /rss/news 하나뿐이다.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import html
import re
import urllib.parse
import warnings

import feedparser
import requests
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning

FEED_URLS = ("https://news.hada.io/rss/news",)
SITE_NEW_URL = "https://news.hada.io/new"

USER_AGENT = "geeknews-digest/1.0 (+https://github.com/moedisoya13/moedisoya13)"
TIMEOUT_SECONDS = 10
MAX_BYTES = 2 * 1024 * 1024

# link 의 동일성 판정에서 떼어낼 트래킹 파라미터.
_TRACKING_PARAMS = re.compile(r"^(utm_|fbclid$|gclid$|ref$|ref_src$)")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# Show GN 글의 제목 접두사. 전각 콜론도 함께 받는다.
_SHOW_GN = re.compile(r"^\s*show\s*gn\s*[:：]", re.IGNORECASE)


@dataclasses.dataclass(frozen=True)
class Item:
    title: str
    url: str
    body: str
    published: dt.datetime | None
    source: str

    @property
    def key(self) -> str:
        return normalize_url(self.url)


def normalize_url(url: str) -> str:
    """동일 글을 같은 키로 묶기 위한 URL 정규화."""
    parsed = urllib.parse.urlsplit(url.strip())
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=False)
    query = [(k, v) for k, v in query if not _TRACKING_PARAMS.match(k)]
    path = parsed.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit(
        (parsed.scheme.lower(), parsed.netloc.lower(), path, urllib.parse.urlencode(sorted(query)), "")
    )


def is_safe_url(url: str) -> bool:
    """카톡 메시지에 실어도 되는 링크인지. https 만 허용한다."""
    try:
        parsed = urllib.parse.urlsplit(url.strip())
    except ValueError:
        return False
    return parsed.scheme == "https" and bool(parsed.netloc)


def clean_text(raw: str) -> str:
    """HTML 조각에서 사람이 읽을 텍스트만 남긴다."""
    with warnings.catch_warnings():
        # 요약문이 URL 한 줄일 때 bs4 가 "파일명 같다"고 경고한다. 여기서는 무의미하다.
        warnings.simplefilter("ignore", MarkupResemblesLocatorWarning)
        text = BeautifulSoup(raw or "", "html.parser").get_text(" ", strip=True)
    text = html.unescape(text)
    text = _CONTROL_CHARS.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def _fetch(url: str) -> bytes:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_SECONDS)
    resp.raise_for_status()
    if len(resp.content) > MAX_BYTES:
        raise ValueError(f"응답이 너무 큽니다: {len(resp.content)} bytes")
    return resp.content


def parse_feed(body: bytes, source: str) -> list[Item]:
    """Atom/RSS 본문에서 Item 목록을 만든다. 네트워크를 타지 않으므로 테스트 대상."""
    feed = feedparser.parse(body)
    items: list[Item] = []
    for entry in feed.entries:
        link = (entry.get("link") or "").strip()
        title = clean_text(entry.get("title") or "")
        if not link or not title or not is_safe_url(link):
            continue
        published = None
        parsed = entry.get("published_parsed") or entry.get("updated_parsed")
        if parsed:
            published = dt.datetime(*parsed[:6], tzinfo=dt.timezone.utc)
        items.append(
            Item(
                title=title,
                url=link,
                body=clean_text(entry.get("summary") or entry.get("description") or ""),
                published=published,
                source=source,
            )
        )
    return items


def is_show_gn(item: Item) -> bool:
    """Show GN 글인지 제목으로 판정한다.

    피드에 category/tag 가 전혀 없어 제목 접두사가 유일한 단서다. 위 모듈
    주석의 실측 근거 참고.
    """
    return bool(_SHOW_GN.match(item.title))


def merge(groups: list[list[Item]]) -> list[Item]:
    """여러 피드 결과를 정규화 URL 기준으로 합치고 최신순으로 정렬한다.

    앞선 그룹을 우선 채택한다(첫 피드가 주 소스).
    """
    merged: dict[str, Item] = {}
    for group in groups:
        for item in group:
            merged.setdefault(item.key, item)
    ordered = list(merged.values())
    # published 가 없는 항목은 뒤로 보낸다.
    oldest = dt.datetime.min.replace(tzinfo=dt.timezone.utc)
    ordered.sort(key=lambda i: i.published or oldest, reverse=True)
    return ordered


def within(items: list[Item], hours: int, now: dt.datetime | None = None) -> list[Item]:
    """최근 N시간 이내 항목만 남긴다. published 가 없으면 남긴다(판단 불가)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(hours=hours)
    return [i for i in items if i.published is None or i.published >= cutoff]


def collect(log) -> list[Item]:
    """모든 피드를 훑어 Item 목록을 만든다.

    개별 피드 실패는 경고로 넘기고 나머지로 진행한다.
    전부 실패하면 RuntimeError 를 올려 워크플로가 빨간불이 되게 한다.
    """
    groups: list[list[Item]] = []
    for url in FEED_URLS:
        try:
            items = parse_feed(_fetch(url), source=url)
        except Exception as exc:  # 개별 피드 장애를 파이프라인 전체로 번지게 하지 않는다
            log(f"경고: 피드 수집 실패 {url} -> {type(exc).__name__}: {exc}")
            continue
        log(f"피드 {url}: {len(items)}건")
        groups.append(items)

    if not groups:
        raise RuntimeError("모든 피드 수집에 실패했습니다.")
    return merge(groups)

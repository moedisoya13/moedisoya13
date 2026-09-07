"""긱뉴스 엔드포인트 실측 스크립트 (일회성).

개발 환경에서는 hada.io 가 egress 정책으로 차단되어 있어 RSS 필드명과
/new 페이지 구조를 확인할 수 없다. Actions 러너에서 이 스크립트를 돌려
실제 응답을 아티팩트로 회수한 뒤, 그것을 근거로 파서를 작성한다.
"""

from __future__ import annotations

import collections
import pathlib
import sys

import feedparser
import requests
from bs4 import BeautifulSoup

TARGETS = {
    "feeds_rss_news": "https://feeds.hada.io/rss/news",
    "feeds_rss_topics": "https://feeds.hada.io/rss/topics",
    "news_rss_news": "https://news.hada.io/rss/news",
    "news_new": "https://news.hada.io/new",
}

OUT = pathlib.Path("probe-out")
UA = "geeknews-digest-probe/0.1 (+https://github.com/moedisoya13/moedisoya13)"
MAX_BYTES = 2 * 1024 * 1024


def fetch(name: str, url: str) -> tuple[str, bytes] | None:
    print(f"\n{'=' * 70}\n[{name}] GET {url}")
    try:
        resp = requests.get(url, headers={"User-Agent": UA}, timeout=15)
    except requests.RequestException as exc:
        print(f"  !! 요청 실패: {type(exc).__name__}: {exc}")
        return None

    body = resp.content[:MAX_BYTES]
    print(f"  status         : {resp.status_code}")
    print(f"  content-type   : {resp.headers.get('content-type')}")
    print(f"  final url      : {resp.url}")
    print(f"  bytes          : {len(resp.content)}")
    if resp.status_code != 200:
        print(f"  body[:300]     : {body[:300]!r}")
        return None

    suffix = ".html" if "html" in (resp.headers.get("content-type") or "") else ".xml"
    path = OUT / f"{name}{suffix}"
    path.write_bytes(body)
    print(f"  saved          : {path}")
    return name, body


def describe_rss(name: str, body: bytes) -> None:
    feed = feedparser.parse(body)
    print(f"  [RSS] bozo={feed.bozo} entries={len(feed.entries)}")
    if feed.bozo:
        print(f"  [RSS] bozo_exception={feed.get('bozo_exception')!r}")
    print(f"  [RSS] feed keys: {sorted(feed.feed.keys())}")
    for i, entry in enumerate(feed.entries[:3]):
        print(f"  --- entry[{i}] keys: {sorted(entry.keys())}")
        for key in ("title", "link", "id", "published", "updated", "author"):
            if key in entry:
                print(f"      {key:10}= {str(entry[key])[:160]!r}")
        for key in ("summary", "description"):
            if key in entry:
                print(f"      {key:10}= {str(entry[key])[:300]!r}")


def describe_html(name: str, body: bytes) -> None:
    soup = BeautifulSoup(body, "html.parser")
    print(f"  [HTML] title={soup.title.get_text(strip=True) if soup.title else None!r}")

    # topic?id=NNN 형태 링크가 글 목록의 핵심 신호일 것으로 보고, 그 조상 구조를 훑는다.
    anchors = [a for a in soup.find_all("a", href=True) if "topic?id=" in a["href"]]
    print(f"  [HTML] 'topic?id=' 링크 수: {len(anchors)}")

    parent_shapes = collections.Counter()
    for a in anchors:
        chain = []
        node = a
        for _ in range(3):
            node = node.parent
            if node is None or node.name is None:
                break
            cls = ".".join(node.get("class") or [])
            chain.append(f"{node.name}{'.' + cls if cls else ''}")
        parent_shapes[" < ".join(chain)] += 1
    print("  [HTML] 링크 조상 체인 상위 5종:")
    for shape, count in parent_shapes.most_common(5):
        print(f"      {count:3}x  {shape}")

    print("  [HTML] 앞쪽 링크 5개 샘플:")
    for a in anchors[:5]:
        cls = ".".join(a.get("class") or [])
        print(f"      href={a['href']!r} class={cls!r} text={a.get_text(strip=True)[:80]!r}")

    # 목록 컨테이너 후보: class 에 topic/item/list 가 들어간 요소들
    print("  [HTML] class 빈도 상위 25종:")
    classes = collections.Counter()
    for el in soup.find_all(class_=True):
        for cls in el.get("class"):
            classes[f"{el.name}.{cls}"] += 1
    for cls, count in classes.most_common(25):
        print(f"      {count:4}x  {cls}")


def main() -> int:
    OUT.mkdir(exist_ok=True)
    fetched = {}
    for name, url in TARGETS.items():
        result = fetch(name, url)
        if result:
            fetched[name] = result[1]

    for name, body in fetched.items():
        print(f"\n{'-' * 70}\n[{name}] 구조 분석")
        if name == "news_new":
            describe_html(name, body)
        else:
            describe_rss(name, body)

    if not fetched:
        print("\n!! 어떤 엔드포인트에서도 200을 받지 못했다.")
        return 1
    print(f"\n성공한 엔드포인트: {sorted(fetched)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

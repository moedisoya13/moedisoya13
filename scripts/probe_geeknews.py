"""긱뉴스 엔드포인트 실측 스크립트 (일회성) — 2차.

1차 결과:
  - feeds.hada.io          : DNS 조회 실패 (존재하지 않는 호스트)
  - news.hada.io/rss/news  : 200, Atom, 50 entries
  - news.hada.io/new       : 403 Forbidden

2차 목적:
  - /new 403 이 User-Agent 때문인지, 러너 IP 자체가 막힌 것인지 구분
  - /rss/topics 가 있는지 확인
  - fixture 로 쓸 Atom 응답 저장
"""

from __future__ import annotations

import collections
import pathlib
import sys

import feedparser
import requests
from bs4 import BeautifulSoup

OUT = pathlib.Path("probe-out")
MAX_BYTES = 2 * 1024 * 1024

REPO_UA = "geeknews-digest/0.1 (+https://github.com/moedisoya13/moedisoya13)"
PLAIN_UA = "Mozilla/5.0"
NO_UA = None

FEEDS = {
    "rss_news": "https://news.hada.io/rss/news",
    "rss_topics": "https://news.hada.io/rss/topics",
}


def get(url: str, ua: str | None) -> requests.Response | None:
    headers = {"User-Agent": ua} if ua else {}
    try:
        return requests.get(url, headers=headers, timeout=15)
    except requests.RequestException as exc:
        print(f"  !! 요청 실패: {type(exc).__name__}: {exc}")
        return None


def report(resp: requests.Response | None, label: str) -> None:
    if resp is None:
        return
    print(f"  [{label}] status={resp.status_code} type={resp.headers.get('content-type')!r} "
          f"bytes={len(resp.content)} server={resp.headers.get('server')!r}")
    if resp.status_code != 200:
        print(f"  [{label}] body[:200]={resp.content[:200]!r}")


def probe_new() -> bytes | None:
    """/new 403 의 원인을 UA 별로 나눠 확인한다."""
    url = "https://news.hada.io/new"
    print(f"\n{'=' * 70}\n[/new] UA 별 응답 비교: {url}")
    ok_body = None
    for label, ua in (("repo-ua", REPO_UA), ("plain-ua", PLAIN_UA), ("no-ua", NO_UA)):
        resp = get(url, ua)
        report(resp, label)
        if resp is not None and resp.status_code == 200 and ok_body is None:
            ok_body = resp.content[:MAX_BYTES]
            (OUT / "news_new.html").write_bytes(ok_body)
            print(f"  [{label}] saved probe-out/news_new.html")
    if ok_body is None:
        print("  => /new 는 어떤 UA 로도 열리지 않는다. HTML 크롤링은 포기하고 RSS 단독으로 간다.")
    return ok_body


def probe_feed(name: str, url: str) -> bytes | None:
    print(f"\n{'=' * 70}\n[{name}] GET {url}")
    resp = get(url, REPO_UA)
    report(resp, name)
    if resp is None or resp.status_code != 200:
        return None
    body = resp.content[:MAX_BYTES]
    (OUT / f"{name}.xml").write_bytes(body)
    print(f"  saved probe-out/{name}.xml")

    feed = feedparser.parse(body)
    print(f"  [RSS] bozo={feed.bozo} entries={len(feed.entries)} version={feed.version!r}")
    for i, entry in enumerate(feed.entries[:2]):
        print(f"  --- entry[{i}]")
        for key in ("title", "link", "id", "published", "author"):
            if key in entry:
                print(f"      {key:10}= {str(entry[key])[:120]!r}")
        summary = entry.get("summary", "")
        text = BeautifulSoup(summary, "html.parser").get_text(" ", strip=True)
        print(f"      summary_text= {text[:200]!r}")
    return body


def main() -> int:
    OUT.mkdir(exist_ok=True)
    probe_new()
    ok = [name for name, url in FEEDS.items() if probe_feed(name, url) is not None]
    print(f"\n사용 가능한 피드: {ok}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

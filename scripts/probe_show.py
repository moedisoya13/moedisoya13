"""Show GN 수집 경로 실측용 일회성 프로브.

개발 세션에서는 egress 정책상 hada.io 에 닿을 수 없어, Actions 러너에서 실제
응답을 받아 남긴다. 확인이 끝나면 이 스크립트와 워크플로는 삭제한다.

확인할 것:
  1) Show GN 전용 피드 엔드포인트가 존재하는가(후보 일괄 타진)
  2) 없다면 /rss/news 안에서 Show GN 글을 식별할 수 있는가
     (category/tag 요소가 있는가, 없다면 제목 접두사로 걸러지는가)
"""

import re
import sys

import feedparser
import requests

UA = "geeknews-digest/1.0 (+https://github.com/moedisoya13/moedisoya13)"
TIMEOUT = 10

CANDIDATES = [
    "https://news.hada.io/rss/show",
    "https://news.hada.io/rss/showgn",
    "https://news.hada.io/rss/show_gn",
    "https://news.hada.io/rss/news?type=show",
    "https://news.hada.io/rss/news?category=show",
    "https://news.hada.io/rss/topics?type=show",
    "https://news.hada.io/rss/ask",
    "https://news.hada.io/feed/show",
    "https://news.hada.io/show",
    "https://news.hada.io/rss/news",
]


def probe(url: str) -> tuple[str, bytes | None]:
    try:
        resp = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT)
    except Exception as exc:  # noqa: BLE001 - 무엇이 나오든 그대로 기록한다
        return f"EXC {type(exc).__name__}: {exc}", None
    ctype = resp.headers.get("content-type", "?")
    note = f"status={resp.status_code} type={ctype} bytes={len(resp.content)}"
    if resp.status_code != 200:
        return note, None
    return note, resp.content


def main() -> int:
    news_body = None
    print("=" * 72)
    print("1) 엔드포인트 후보 타진")
    print("=" * 72)
    for url in CANDIDATES:
        note, body = probe(url)
        entries = ""
        if body and b"<" in body[:200]:
            parsed = feedparser.parse(body)
            if parsed.entries:
                entries = f" entries={len(parsed.entries)} first={parsed.entries[0].get('title','?')!r}"
        print(f"{url}\n    {note}{entries}")
        if url.endswith("/rss/news") and body:
            news_body = body

    if not news_body:
        print("\n/rss/news 를 못 받아 2단계를 건너뜁니다.")
        return 1

    print()
    print("=" * 72)
    print("2) /rss/news 안에서 Show GN 식별 가능성")
    print("=" * 72)
    parsed = feedparser.parse(news_body)
    print(f"전체 entry: {len(parsed.entries)}건")

    show = [e for e in parsed.entries if re.match(r"\s*show\s*gn\s*[::]", e.get("title", ""), re.I)]
    print(f"제목이 'Show GN:' 으로 시작하는 entry: {len(show)}건")
    for e in show:
        print(f"    - {e.get('title')}  ({e.get('link')})  published={e.get('published')}")

    print("\nentry 가 가진 키:")
    print(f"    {sorted(parsed.entries[0].keys())}")
    tagged = [e for e in parsed.entries if e.get("tags")]
    print(f"category/tag 를 가진 entry: {len(tagged)}건")
    for e in tagged[:5]:
        print(f"    - {e.get('title')[:40]!r} tags={e.get('tags')}")

    print("\n원본 XML 첫 entry 조각:")
    text = news_body.decode("utf-8", "replace")
    match = re.search(r"<(entry|item)[ >].*?</\1>", text, re.S)
    print(match.group(0)[:1500] if match else "(entry 를 찾지 못함)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

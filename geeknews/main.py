"""긱뉴스 다이제스트 파이프라인.

수집 → 중복 제거 → 요약 → 카카오톡 '나에게 보내기' → 아카이브.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys

from . import kakao, rotate
from .secrets import from_env, mask
from .sources import SITE_NEW_URL, Item, collect, within
from .summarize import summarize

KST = dt.timezone(dt.timedelta(hours=9))
MAX_ITEMS = kakao.MAX_LIST_ITEMS
WINDOW_HOURS = 24
SEEN_LIMIT = 200

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATE_PATH = ROOT / "state" / "seen.json"
DIGEST_DIR = ROOT / "digests"


def log(message: str) -> None:
    print(mask(str(message)), flush=True)


def load_seen() -> list[str]:
    if not STATE_PATH.exists():
        return []
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        log("경고: state/seen.json 을 읽을 수 없어 빈 목록으로 시작합니다.")
        return []
    keys = data.get("keys") if isinstance(data, dict) else None
    return [k for k in keys if isinstance(k, str)] if isinstance(keys, list) else []


def save_seen(previous: list[str], added: list[str]) -> None:
    # 최근 것이 앞으로 오도록 두고, 오래된 꼬리를 잘라낸다.
    merged = added + [k for k in previous if k not in set(added)]
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(
        json.dumps({"keys": merged[:SEEN_LIMIT]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_digest(day: dt.date, items: list[Item], summaries: list[dict[str, str]]) -> pathlib.Path:
    DIGEST_DIR.mkdir(parents=True, exist_ok=True)
    path = DIGEST_DIR / f"{day.isoformat()}.md"
    lines = [f"# 긱뉴스 {day.isoformat()}", ""]
    for item, summary in zip(items, summaries):
        lines += [
            f"## {summary['title']}",
            "",
            summary["summary"],
            "",
            f"- 원문: {item.url}",
            f"- 출처: {item.source}",
            "",
        ]
    lines.append(f"수집 페이지: {SITE_NEW_URL}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="긱뉴스 일일 다이제스트")
    parser.add_argument("--dry-run", action="store_true", help="발송하지 않고 결과만 출력")
    args = parser.parse_args(argv)

    now = dt.datetime.now(dt.timezone.utc)
    today = now.astimezone(KST).date()

    items = within(collect(log), hours=WINDOW_HOURS, now=now)
    log(f"최근 {WINDOW_HOURS}시간 항목: {len(items)}건")

    seen = load_seen()
    seen_keys = set(seen)
    fresh = [i for i in items if i.key not in seen_keys][:MAX_ITEMS]
    if not fresh:
        log("새로 보낼 항목이 없습니다. 발송을 건너뜁니다.")
        return 0
    log(f"발송 후보 {len(fresh)}건: " + " / ".join(i.title for i in fresh))

    summaries = summarize(fresh, from_env("ANTHROPIC_API_KEY"), log)
    entries = [
        {"title": s["title"], "summary": s["summary"], "url": i.url}
        for i, s in zip(fresh, summaries)
    ]

    rest_api_key = from_env("KAKAO_REST_API_KEY")
    refresh_token = from_env("KAKAO_REFRESH_TOKEN")
    header = f"긱뉴스 {today.isoformat()}"

    if args.dry_run:
        log("dry-run: 발송하지 않습니다. 만들어진 템플릿은 다음과 같습니다.")
        log(json.dumps(kakao.build_list_template(header, entries), ensure_ascii=False, indent=2))
        return 0

    if rest_api_key is None or refresh_token is None:
        log("KAKAO_REST_API_KEY / KAKAO_REFRESH_TOKEN 이 없어 발송을 건너뜁니다 "
            "(시크릿을 등록하면 다음 실행부터 자동으로 보냅니다).")
        log(json.dumps(kakao.build_list_template(header, entries), ensure_ascii=False, indent=2))
        return 0

    tokens = kakao.refresh_tokens(rest_api_key, refresh_token)
    kakao.send(tokens.access, header, entries, log)

    if tokens.new_refresh is not None:
        repo = os.environ.get("GITHUB_REPOSITORY", "")
        if repo:
            rotate.handle(repo, tokens.new_refresh, from_env("GH_PAT"), from_env("GITHUB_TOKEN"), log)
        else:
            log("경고: 새 refresh_token 을 받았지만 GITHUB_REPOSITORY 를 알 수 없습니다.")

    path = write_digest(today, fresh, summaries)
    save_seen(seen, [i.key for i in fresh])
    log(f"아카이브 기록: {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

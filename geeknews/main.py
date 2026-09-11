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
from .sources import SITE_NEW_URL, Item, collect, is_show_gn, within
from .summarize import summarize

KST = dt.timezone(dt.timedelta(hours=9))
# 하루에 보낼 건수. 카카오 리스트 템플릿 한 통이 2~3건이라, 이 값이 3을 넘으면
# 여러 통으로 나눠 보낸다(6건이면 3+3 으로 두 통, 알림도 두 번).
# 분할은 kakao.chunk_sizes 가 알아서 하므로 이 숫자만 바꾸면 된다.
MAX_ITEMS = 6
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


def prioritize(items: list[Item], limit: int) -> list[Item]:
    """Show GN 을 앞에 깔고 남은 자리를 최신 글로 채운다.

    Show GN 은 하루 1~5건으로 들쭉날쭉해서, 그것만 보내면 아예 못 보내는 날이
    생긴다. 그래서 우선순위만 주고 분량은 최신 글로 채워 항상 limit 을 맞춘다.
    두 그룹 모두 원래의 최신순을 유지한다.
    """
    show = [i for i in items if is_show_gn(i)]
    rest = [i for i in items if not is_show_gn(i)]
    return (show + rest)[:limit]


def digest_path(day: dt.date) -> pathlib.Path:
    return DIGEST_DIR / f"{day.isoformat()}.md"


def already_sent(day: dt.date) -> bool:
    """그날 다이제스트가 이미 나갔는지 본다.

    아카이브 파일은 발송에 성공한 뒤에만 쓰이고 곧바로 커밋되므로, 파일의 존재가
    곧 '오늘 몫은 이미 갔다'는 뜻이다. 백업 스케줄이 1차와 겹쳐도 두 번 보내지
    않게 막는 것이 이 함수의 목적이다.

    state/seen.json 으로는 대신할 수 없다. 그쪽은 '같은 글'만 막을 뿐이어서,
    1차 이후 피드에 새 글이 올라와 있으면 백업 실행이 그 새 글들로 두 번째
    묶음을 만들어 그대로 보내 버린다.
    """
    return digest_path(day).exists()


def write_digest(day: dt.date, items: list[Item], summaries: list[dict[str, str]]) -> pathlib.Path:
    """그날의 아카이브를 남긴다.

    --force 재발송이면 파일이 이미 있다. 이때 덮어쓰면 먼저 나간 메시지의 기록이
    사라지므로, 구분선을 두고 이어 붙인다. 아카이브는 '실제로 나간 것'의 기록이다.
    """
    DIGEST_DIR.mkdir(parents=True, exist_ok=True)
    path = digest_path(day)
    lines: list[str] = []
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

    if path.exists():
        previous = path.read_text(encoding="utf-8").rstrip("\n")
        body = previous + "\n\n---\n\n" + "\n".join(lines).rstrip("\n")
    else:
        body = "\n".join([f"# 긱뉴스 {day.isoformat()}", ""] + lines + [f"수집 페이지: {SITE_NEW_URL}"])

    path.write_text(body + "\n", encoding="utf-8")
    return path


def _preview(header: str, entries: list[dict[str, str]], log) -> None:
    """발송하지 않고, 실제로 나갈 메시지들을 그대로 보여준다."""
    sizes = kakao.chunk_sizes(len(entries))
    log(f"메시지 {len(sizes)}통으로 나뉩니다: {sizes}")
    offset = 0
    for index, size in enumerate(sizes, start=1):
        part = entries[offset : offset + size]
        offset += size
        part_header = header if len(sizes) == 1 else f"{header} ({index}/{len(sizes)})"
        template = (
            kakao.build_list_template(part_header, part)
            if size >= kakao.MIN_LIST_ITEMS
            else kakao.build_text_template(part_header, part)
        )
        log(json.dumps(template, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="긱뉴스 일일 다이제스트")
    parser.add_argument("--dry-run", action="store_true", help="발송하지 않고 결과만 출력")
    parser.add_argument(
        "--force",
        action="store_true",
        help="오늘자 다이제스트가 이미 있어도 다시 보낸다(중복 발송 가드 해제)",
    )
    args = parser.parse_args(argv)

    now = dt.datetime.now(dt.timezone.utc)
    today = now.astimezone(KST).date()

    if already_sent(today) and not args.dry_run and not args.force:
        log(f"오늘({today.isoformat()})자 다이제스트가 이미 있습니다. 중복 발송을 건너뜁니다 "
            "(다시 보내려면 --force).")
        return 0

    items = within(collect(log), hours=WINDOW_HOURS, now=now)
    log(f"최근 {WINDOW_HOURS}시간 항목: {len(items)}건")

    seen = load_seen()
    seen_keys = set(seen)
    fresh = prioritize([i for i in items if i.key not in seen_keys], MAX_ITEMS)
    if not fresh:
        log("새로 보낼 항목이 없습니다. 발송을 건너뜁니다.")
        return 0
    shown = sum(1 for i in fresh if is_show_gn(i))
    log(f"발송 후보 {len(fresh)}건 (Show GN {shown}건 우선): "
        + " / ".join(i.title for i in fresh))

    summaries = summarize(fresh, from_env("ANTHROPIC_API_KEY"), log)
    entries = [
        {"title": s["title"], "summary": s["summary"], "url": i.url}
        for i, s in zip(fresh, summaries)
    ]

    rest_api_key = from_env("KAKAO_REST_API_KEY")
    refresh_token = from_env("KAKAO_REFRESH_TOKEN")
    header = f"긱뉴스 {today.isoformat()}"

    if args.dry_run:
        log("dry-run: 발송하지 않습니다. 만들어질 메시지는 다음과 같습니다.")
        _preview(header, entries, log)
        return 0

    if rest_api_key is None or refresh_token is None:
        log("KAKAO_REST_API_KEY / KAKAO_REFRESH_TOKEN 이 없어 발송을 건너뜁니다 "
            "(시크릿을 등록하면 다음 실행부터 자동으로 보냅니다).")
        _preview(header, entries, log)
        return 0

    tokens = kakao.refresh_tokens(rest_api_key, refresh_token, from_env("KAKAO_CLIENT_SECRET"))
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

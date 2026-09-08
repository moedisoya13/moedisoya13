"""오늘자 중복 발송 가드.

백업 스케줄(KST 09:20)은 1차가 버려졌을 때만 실제로 일해야 한다. 1차가 이미
보냈다면 백업 실행은 수집·요약·발송 어디에도 손대지 않고 즉시 끝나야 한다.
"""

import datetime as dt

import pytest

from geeknews import main as main_mod


@pytest.fixture
def digest_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(main_mod, "DIGEST_DIR", tmp_path)
    return tmp_path


@pytest.fixture
def today():
    return dt.datetime.now(dt.timezone.utc).astimezone(main_mod.KST).date()


@pytest.fixture
def no_collect(monkeypatch):
    """수집을 시도하면 곧바로 실패시킨다 — 가드가 그 앞에서 끊는지 보려고."""

    def boom(_log):
        raise AssertionError("가드가 막았어야 하는데 수집이 실행됐습니다")

    monkeypatch.setattr(main_mod, "collect", boom)


def test_already_sent_follows_digest_file(digest_dir, today):
    assert main_mod.already_sent(today) is False
    (digest_dir / f"{today.isoformat()}.md").write_text("# 긱뉴스\n", encoding="utf-8")
    assert main_mod.already_sent(today) is True


def test_yesterday_digest_does_not_block_today(digest_dir, today):
    (digest_dir / f"{today - dt.timedelta(days=1)}.md").write_text("# 어제\n", encoding="utf-8")
    assert main_mod.already_sent(today) is False


def test_main_skips_when_today_digest_exists(digest_dir, today, no_collect):
    (digest_dir / f"{today.isoformat()}.md").write_text("# 긱뉴스\n", encoding="utf-8")
    assert main_mod.main([]) == 0


def test_force_bypasses_the_guard(digest_dir, today, monkeypatch):
    (digest_dir / f"{today.isoformat()}.md").write_text("# 긱뉴스\n", encoding="utf-8")
    monkeypatch.setattr(main_mod, "collect", lambda _log: [])
    # 가드를 지나 수집까지 갔고, 보낼 것이 없어 정상 종료한다.
    assert main_mod.main(["--force"]) == 0


def test_dry_run_bypasses_the_guard(digest_dir, today, monkeypatch):
    (digest_dir / f"{today.isoformat()}.md").write_text("# 긱뉴스\n", encoding="utf-8")
    monkeypatch.setattr(main_mod, "collect", lambda _log: [])
    assert main_mod.main(["--dry-run"]) == 0


def test_main_runs_when_no_digest_yet(digest_dir, monkeypatch):
    monkeypatch.setattr(main_mod, "collect", lambda _log: [])
    assert main_mod.main([]) == 0


# --- Show GN 우선 선정 -------------------------------------------------------


def _item(title: str, idx: int) -> main_mod.Item:
    return main_mod.Item(
        title=title,
        url=f"https://news.hada.io/topic?id={idx}",
        body="",
        published=dt.datetime(2026, 9, 8, 0, idx, tzinfo=dt.timezone.utc),
        source="https://news.hada.io/rss/news",
    )


def test_show_gn_goes_first_and_rest_fills_the_quota():
    items = [
        _item("최신1", 1),
        _item("Show GN: 쇼1", 2),
        _item("최신2", 3),
        _item("Show GN: 쇼2", 4),
        _item("최신3", 5),
        _item("최신4", 6),
        _item("최신5", 7),
    ]
    picked = [i.title for i in main_mod.prioritize(items, 6)]
    assert picked[:2] == ["Show GN: 쇼1", "Show GN: 쇼2"]
    # 남은 자리는 최신 글로 채워 항상 정원을 맞춘다.
    assert picked[2:] == ["최신1", "최신2", "최신3", "최신4"]


def test_prioritize_keeps_newest_first_within_each_group():
    items = [_item("Show GN: 먼저", 1), _item("최신", 2), _item("Show GN: 나중", 3)]
    assert [i.title for i in main_mod.prioritize(items, 3)] == [
        "Show GN: 먼저",
        "Show GN: 나중",
        "최신",
    ]


def test_prioritize_without_any_show_gn_is_plain_truncation():
    items = [_item(f"최신{n}", n) for n in range(1, 6)]
    assert [i.title for i in main_mod.prioritize(items, 3)] == ["최신1", "최신2", "최신3"]


def test_show_gn_beyond_the_quota_is_truncated():
    items = [_item(f"Show GN: 쇼{n}", n) for n in range(1, 9)]
    picked = main_mod.prioritize(items, 6)
    assert len(picked) == 6
    assert all(main_mod.is_show_gn(i) for i in picked)


# --- 재발송 시 아카이브 보존 --------------------------------------------------


def test_write_digest_appends_instead_of_overwriting(digest_dir, today):
    first = [_item("첫 통", 1)]
    main_mod.write_digest(today, first, [{"title": "첫 통", "summary": "요약A"}])
    main_mod.write_digest(today, [_item("두 번째 통", 2)], [{"title": "두 번째", "summary": "요약B"}])

    text = (digest_dir / f"{today.isoformat()}.md").read_text(encoding="utf-8")
    # 먼저 나간 기록이 살아 있고, 뒤엣것이 구분선 아래 붙는다.
    assert "요약A" in text and "요약B" in text
    assert text.index("요약A") < text.index("---") < text.index("요약B")
    assert text.count(f"# 긱뉴스 {today.isoformat()}") == 1

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

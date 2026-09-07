import datetime as dt
import pathlib

from geeknews import sources

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "geeknews_rss.xml"
NOW = dt.datetime(2026, 9, 7, 9, 0, tzinfo=dt.timezone.utc)  # KST 18:00


def parsed():
    return sources.parse_feed(FIXTURE.read_bytes(), source="fixture")


def test_parse_extracts_atom_fields():
    items = parsed()
    first = items[0]
    assert first.title.startswith("Show GN: PolyView")
    assert first.url == "https://news.hada.io/topic?id=33317"
    assert first.published == dt.datetime(2026, 9, 7, 8, 47, 49, tzinfo=dt.timezone.utc)
    # summary 는 HTML 태그가 벗겨진 평문이어야 한다.
    assert "<strong>" not in first.body
    assert "PolyView" in first.body


def test_parse_drops_non_https_links():
    urls = [i.url for i in parsed()]
    assert not any(u.startswith("http://") for u in urls)


def test_within_filters_by_window():
    recent = sources.within(parsed(), hours=24, now=NOW)
    titles = [i.title for i in recent]
    assert "오래된 글 - 윈도우 밖이라 걸러져야 함" not in titles
    assert len(recent) == 2


def test_merge_dedupes_by_normalized_url_and_prefers_first_group():
    items = parsed()
    primary = items[0]
    duplicate = sources.Item(
        title="중복본",
        url=primary.url + "&utm_source=twitter",
        body="",
        published=primary.published,
        source="secondary",
    )
    merged = sources.merge([[primary], [duplicate]])
    assert len(merged) == 1
    assert merged[0].source == "fixture"


def test_merge_sorts_newest_first():
    merged = sources.merge([parsed()])
    stamps = [i.published for i in merged if i.published]
    assert stamps == sorted(stamps, reverse=True)


def test_normalize_url_strips_tracking_and_trailing_slash():
    a = sources.normalize_url("https://News.Hada.io/topic?id=1&utm_medium=x")
    b = sources.normalize_url("https://news.hada.io/topic?id=1")
    assert a == b


def test_is_safe_url_rejects_dangerous_schemes():
    assert sources.is_safe_url("https://news.hada.io/topic?id=1")
    assert not sources.is_safe_url("http://news.hada.io/topic?id=1")
    assert not sources.is_safe_url("javascript:alert(1)")
    assert not sources.is_safe_url("https://")


def test_collect_raises_when_every_feed_fails(monkeypatch):
    def boom(url):
        raise RuntimeError("network down")

    monkeypatch.setattr(sources, "_fetch", boom)
    messages = []
    try:
        sources.collect(messages.append)
    except RuntimeError as exc:
        assert "모든 피드" in str(exc)
    else:
        raise AssertionError("모든 피드가 죽으면 예외를 올려야 한다")
    assert any("경고" in m for m in messages)


def test_collect_survives_partial_feed_failure(monkeypatch):
    """피드가 여러 개일 때 하나가 죽어도 나머지로 진행해야 한다."""
    body = FIXTURE.read_bytes()

    def flaky(url):
        if url.endswith("broken"):
            raise RuntimeError("boom")
        return body

    monkeypatch.setattr(sources, "FEED_URLS", ("https://news.hada.io/broken", "https://news.hada.io/rss/news"))
    monkeypatch.setattr(sources, "_fetch", flaky)
    messages = []
    items = sources.collect(messages.append)
    assert items
    assert any("경고" in m for m in messages)

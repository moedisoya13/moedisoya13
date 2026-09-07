import json

import pytest

from geeknews import kakao
from geeknews.secrets import SecretStr

ENTRIES = [
    {"title": "제목1", "summary": "요약1", "url": "https://news.hada.io/topic?id=1"},
    {"title": "제목2", "summary": "요약2", "url": "https://news.hada.io/topic?id=2"},
    {"title": "제목3", "summary": "요약3", "url": "https://news.hada.io/topic?id=3"},
    {"title": "제목4", "summary": "요약4", "url": "https://news.hada.io/topic?id=4"},
]


def test_list_template_caps_at_three_items():
    template = kakao.build_list_template("긱뉴스 2026-09-07", ENTRIES)
    assert template["object_type"] == "list"
    assert len(template["contents"]) == kakao.MAX_LIST_ITEMS == 3
    assert template["contents"][0]["link"]["web_url"] == "https://news.hada.io/topic?id=1"
    assert template["header_link"]["web_url"] == "https://news.hada.io/new"


def test_list_template_rejects_unsafe_link():
    bad = [{"title": "t", "summary": "s", "url": "javascript:alert(1)"}]
    with pytest.raises(kakao.KakaoError):
        kakao.build_list_template("헤더", bad)


def test_text_template_respects_200_char_limit():
    long_entries = [
        {"title": "가" * 80, "summary": "나" * 80, "url": "https://news.hada.io/topic?id=1"}
        for _ in range(3)
    ]
    template = kakao.build_text_template("긱뉴스 2026-09-07", long_entries)
    assert template["object_type"] == "text"
    assert len(template["text"]) <= kakao.MAX_TEXT_CHARS


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or json.dumps(payload or {})

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def test_send_uses_list_template_when_accepted(monkeypatch):
    seen = []

    def fake_post(access, template):
        seen.append(template["object_type"])
        return FakeResponse(200, {"result_code": 0})

    monkeypatch.setattr(kakao, "_post", fake_post)
    kinds = kakao.send(SecretStr("token-value"), "헤더", ENTRIES[:3], lambda m: None)
    assert kinds == ["list"]
    assert seen == ["list"]


def test_send_falls_back_to_text_when_list_rejected(monkeypatch):
    seen = []

    def fake_post(access, template):
        kind = template["object_type"]
        seen.append(kind)
        if kind == "list":
            return FakeResponse(400, {"msg": "invalid template", "code": -2})
        return FakeResponse(200, {"result_code": 0})

    monkeypatch.setattr(kakao, "_post", fake_post)
    kinds = kakao.send(SecretStr("token-value"), "헤더", ENTRIES[:3], lambda m: None)
    assert kinds == ["text"]
    assert seen == ["list", "text"]


def test_send_raises_when_both_templates_fail(monkeypatch):
    monkeypatch.setattr(kakao, "_post", lambda a, t: FakeResponse(401, {"msg": "expired"}))
    with pytest.raises(kakao.KakaoError):
        kakao.send(SecretStr("token-value"), "헤더", ENTRIES[:3], lambda m: None)


def test_send_error_message_masks_token(monkeypatch):
    secret = SecretStr("leaky-token-abcdef")
    monkeypatch.setattr(
        kakao, "_post", lambda a, t: FakeResponse(401, None, text="bad token leaky-token-abcdef")
    )
    logged = []
    with pytest.raises(kakao.KakaoError) as excinfo:
        kakao.send(secret, "헤더", ENTRIES[:3], logged.append)
    assert "leaky-token-abcdef" not in str(excinfo.value)
    assert not any("leaky-token-abcdef" in m for m in logged)


class RecordingPost:
    """requests.post 를 대신해 전송된 form 데이터를 붙잡는다."""

    def __init__(self, payload):
        self.payload = payload
        self.sent = None

    def __call__(self, url, data=None, timeout=None, **kwargs):
        self.sent = data
        return FakeResponse(200, self.payload)


def test_refresh_tokens_omits_client_secret_when_absent(monkeypatch):
    """Client Secret 을 끈 앱에 빈 값을 보내면 거부되므로 키 자체가 없어야 한다."""
    post = RecordingPost({"access_token": "at-value"})
    monkeypatch.setattr(kakao.requests, "post", post)

    kakao.refresh_tokens(SecretStr("rest-key"), SecretStr("refresh-value"))
    assert "client_secret" not in post.sent


def test_refresh_tokens_sends_client_secret_when_given(monkeypatch):
    post = RecordingPost({"access_token": "at-value"})
    monkeypatch.setattr(kakao.requests, "post", post)

    kakao.refresh_tokens(
        SecretStr("rest-key"), SecretStr("refresh-value"), SecretStr("secret-value")
    )
    assert post.sent["client_secret"] == "secret-value"
    assert post.sent["grant_type"] == "refresh_token"


def test_refresh_tokens_surfaces_rotated_refresh_token(monkeypatch):
    post = RecordingPost({"access_token": "at-value", "refresh_token": "new-refresh"})
    monkeypatch.setattr(kakao.requests, "post", post)

    tokens = kakao.refresh_tokens(SecretStr("rest-key"), SecretStr("old-refresh"))
    assert tokens.new_refresh is not None
    assert tokens.new_refresh.reveal() == "new-refresh"


def test_refresh_tokens_error_masks_secret(monkeypatch):
    secret = SecretStr("client-secret-leaky")

    def failing_post(url, data=None, timeout=None, **kwargs):
        return FakeResponse(401, None, text="bad request client-secret-leaky")

    monkeypatch.setattr(kakao.requests, "post", failing_post)
    with pytest.raises(kakao.KakaoError) as excinfo:
        kakao.refresh_tokens(SecretStr("rest-key"), SecretStr("refresh-value"), secret)
    assert "client-secret-leaky" not in str(excinfo.value)


# --- 여러 통으로 나눠 보내기 -------------------------------------------------

def entries_of(count):
    return [
        {"title": f"제목{i}", "summary": f"요약{i}", "url": f"https://news.hada.io/topic?id={i}"}
        for i in range(1, count + 1)
    ]


def test_chunk_sizes_never_leaves_a_single_item():
    """리스트 템플릿은 최소 2건이라, 마지막에 1건만 남는 분할이 나오면 안 된다."""
    for total in range(2, 31):
        sizes = kakao.chunk_sizes(total)
        assert sum(sizes) == total
        assert all(kakao.MIN_LIST_ITEMS <= s <= kakao.MAX_LIST_ITEMS for s in sizes), (total, sizes)


def test_chunk_sizes_known_cases():
    assert kakao.chunk_sizes(1) == [1]      # 텍스트 템플릿으로 처리
    assert kakao.chunk_sizes(2) == [2]
    assert kakao.chunk_sizes(3) == [3]
    assert kakao.chunk_sizes(4) == [2, 2]   # 3+1 이 아니라 2+2
    assert kakao.chunk_sizes(5) == [3, 2]
    assert kakao.chunk_sizes(6) == [3, 3]   # 하루 6건 = 두 통
    assert kakao.chunk_sizes(7) == [3, 2, 2]


def test_send_splits_six_entries_into_two_list_messages(monkeypatch):
    sent = []

    def fake_post(access, template):
        sent.append(template)
        return FakeResponse(200, {"result_code": 0})

    monkeypatch.setattr(kakao, "_post", fake_post)
    kinds = kakao.send(SecretStr("t"), "긱뉴스 2026-09-07", entries_of(6), lambda m: None)

    assert kinds == ["list", "list"]
    assert [len(t["contents"]) for t in sent] == [3, 3]
    # 헤더에 순번이 붙어야 한다
    assert sent[0]["header_title"] == "긱뉴스 2026-09-07 (1/2)"
    assert sent[1]["header_title"] == "긱뉴스 2026-09-07 (2/2)"
    # 6건이 순서대로, 중복 없이 실려야 한다
    urls = [c["link"]["web_url"] for t in sent for c in t["contents"]]
    assert urls == [e["url"] for e in entries_of(6)]


def test_send_single_message_has_no_part_suffix(monkeypatch):
    sent = []
    monkeypatch.setattr(kakao, "_post",
                        lambda a, t: (sent.append(t), FakeResponse(200, {"result_code": 0}))[1])
    kakao.send(SecretStr("t"), "긱뉴스 2026-09-07", entries_of(3), lambda m: None)
    assert sent[0]["header_title"] == "긱뉴스 2026-09-07"


def test_send_uses_text_template_for_lone_entry(monkeypatch):
    """1건뿐이면 리스트를 아예 시도하지 않고 텍스트로 보낸다."""
    sent = []
    monkeypatch.setattr(kakao, "_post",
                        lambda a, t: (sent.append(t), FakeResponse(200, {"result_code": 0}))[1])
    kinds = kakao.send(SecretStr("t"), "헤더", entries_of(1), lambda m: None)
    assert kinds == ["text"]
    assert [t["object_type"] for t in sent] == ["text"]


def test_send_raises_if_a_later_message_fails(monkeypatch):
    """두 번째 통이 실패하면 조용히 넘어가지 않고 예외를 올려야 한다."""
    calls = {"n": 0}

    def flaky(access, template):
        calls["n"] += 1
        return FakeResponse(200, {"result_code": 0}) if calls["n"] == 1 else FakeResponse(400, {"msg": "nope"})

    monkeypatch.setattr(kakao, "_post", flaky)
    with pytest.raises(kakao.KakaoError):
        kakao.send(SecretStr("t"), "헤더", entries_of(6), lambda m: None)

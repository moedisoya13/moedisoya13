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
    kind = kakao.send(SecretStr("token-value"), "헤더", ENTRIES, lambda m: None)
    assert kind == "list"
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
    kind = kakao.send(SecretStr("token-value"), "헤더", ENTRIES, lambda m: None)
    assert kind == "text"
    assert seen == ["list", "text"]


def test_send_raises_when_both_templates_fail(monkeypatch):
    monkeypatch.setattr(kakao, "_post", lambda a, t: FakeResponse(401, {"msg": "expired"}))
    with pytest.raises(kakao.KakaoError):
        kakao.send(SecretStr("token-value"), "헤더", ENTRIES, lambda m: None)


def test_send_error_message_masks_token(monkeypatch):
    secret = SecretStr("leaky-token-abcdef")
    monkeypatch.setattr(
        kakao, "_post", lambda a, t: FakeResponse(401, None, text="bad token leaky-token-abcdef")
    )
    logged = []
    with pytest.raises(kakao.KakaoError) as excinfo:
        kakao.send(secret, "헤더", ENTRIES, logged.append)
    assert "leaky-token-abcdef" not in str(excinfo.value)
    assert not any("leaky-token-abcdef" in m for m in logged)

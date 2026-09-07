import traceback

from geeknews import secrets


def test_secretstr_never_reveals_value_in_text():
    token = secrets.SecretStr("super-secret-token-value")
    assert "super-secret" not in str(token)
    assert "super-secret" not in repr(token)
    assert "super-secret" not in f"{token}"
    assert "super-secret" not in f"토큰: {token!r}"
    assert token.reveal() == "super-secret-token-value"


def test_secretstr_hidden_in_traceback():
    token = secrets.SecretStr("another-secret-value")
    try:
        raise ValueError(f"실패: {token}")
    except ValueError:
        text = traceback.format_exc()
    assert "another-secret" not in text


def test_mask_removes_registered_values():
    secrets.SecretStr("registered-secret-abc")
    assert "registered-secret-abc" not in secrets.mask("body registered-secret-abc tail")


def test_mask_removes_token_patterns_without_registration():
    assert "abcdef123" not in secrets.mask("Authorization: Bearer abcdef123")
    assert "zzz" not in secrets.mask('{"access_token":"zzz"}')
    assert "sk-ant-secret" not in secrets.mask("key=sk-ant-secret-42")


def test_from_env_returns_none_when_blank(monkeypatch):
    monkeypatch.setenv("SOME_KEY", "   ")
    assert secrets.from_env("SOME_KEY") is None
    monkeypatch.setenv("SOME_KEY", "value123")
    assert secrets.from_env("SOME_KEY").reveal() == "value123"

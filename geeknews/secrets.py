"""시크릿 취급 유틸.

원칙:
  - 시크릿은 모듈 전역 상수로 두지 않고, 필요한 함수에 인자로만 전달한다.
  - 모든 시크릿은 SecretStr 로 감싼다. repr/str 이 값을 내주지 않으므로
    실수로 print, f-string, traceback 에 섞여도 값이 새지 않는다.
  - 로그·예외에 외부 응답 본문을 실을 때는 반드시 mask() 를 통과시킨다.
"""

from __future__ import annotations

import os
import re

_REDACTED = "***"

# 값을 모르는 상태에서도 지워야 하는 패턴들.
_PATTERNS = (
    re.compile(r"(?i)\bBearer\s+[\w.\-]+"),
    re.compile(r'(?i)"(access_token|refresh_token|id_token)"\s*:\s*"[^"]*"'),
    re.compile(r"(?i)\b(sk-ant-[\w\-]+)"),
)

# mask() 가 지워야 할, 이번 실행에서 실제로 쥐고 있는 시크릿 값들.
_known: set[str] = set()


class SecretStr:
    """값을 감춘 채로 들고 다니는 문자열. 실제 값은 reveal() 로만 꺼낸다."""

    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        self._value = value
        register(value)

    def reveal(self) -> str:
        return self._value

    def __bool__(self) -> bool:
        return bool(self._value)

    def __len__(self) -> int:
        # 길이까지 감출 필요는 없지만, 값 자체는 절대 노출하지 않는다.
        return len(self._value)

    def __str__(self) -> str:
        return _REDACTED

    def __repr__(self) -> str:
        return f"SecretStr({_REDACTED})"

    def __format__(self, spec: str) -> str:
        return _REDACTED

    def __eq__(self, other: object) -> bool:
        if isinstance(other, SecretStr):
            return self._value == other._value
        return NotImplemented

    def __hash__(self) -> int:
        return hash(("SecretStr", self._value))


def register(value: str | None) -> None:
    """이후 mask() 호출에서 지울 값을 등록한다. 런타임에 받은 토큰에도 쓴다."""
    if value and len(value) >= 8:
        _known.add(value)


def mask(text: str) -> str:
    """알려진 시크릿 값과 토큰 패턴을 지운 문자열을 돌려준다."""
    if not text:
        return text
    for value in sorted(_known, key=len, reverse=True):
        text = text.replace(value, _REDACTED)
    for pattern in _PATTERNS:
        text = pattern.sub(_REDACTED, text)
    return text


def from_env(name: str) -> SecretStr | None:
    """환경변수에서 시크릿을 읽는다. 비어 있으면 None (호출부가 판단)."""
    raw = (os.environ.get(name) or "").strip()
    return SecretStr(raw) if raw else None


def gha_add_mask(value: str) -> None:
    """GitHub Actions 로그 뷰어에서도 가려지도록 마스크를 등록한다."""
    register(value)
    if os.environ.get("GITHUB_ACTIONS") == "true" and value:
        print(f"::add-mask::{value}", flush=True)

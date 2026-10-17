"""config.json (API 키·필터 프리셋·표시 옵션) 과 overrides.json (수동 좌표) 읽고 쓰기.

둘 다 xlsx 가 있는 작업 폴더에 둔다 — 앱을 다른 폴더로 옮기면 설정도 함께 간다.
"""
from __future__ import annotations

import json
import math
import os
import pathlib
import re
import time
from typing import Any

CONFIG_NAME = "config.json"
OVERRIDES_NAME = "overrides.json"
CACHE_NAME = "geocode_cache.json"

DEFAULTS: dict[str, Any] = {
    "api_key": "",
    "presets": [],          # [{"name": "서부권", "regions": ["28177", "41190"]}]
    "active_preset": None,
    "theme": "light",       # light | dark
    "color_mode": "focus",  # focus(주목 모드) | dealer(대리점별 색)
    "tiles": False,
    "aliases": {},          # {"가양유통": "(주)가양유통"} — 같은 대리점으로 취급(선택)
}


def _read(path: pathlib.Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _write(path: pathlib.Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)  # 키·좌표 파일은 본인만 읽게 (Windows 에선 무시됨)
    except OSError:
        pass
    tmp.replace(path)


class ConfigError(ValueError):
    pass


_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{8,128}$")
_THEMES = ("light", "dark")
_COLOR_MODES = ("focus", "dealer")


def _short_str(v: Any, limit: int, what: str) -> str:
    if not isinstance(v, str) or len(v) > limit or any(ch in v for ch in "\r\n\x00"):
        raise ConfigError(f"{what}: 문자열 길이 {limit} 이하여야 합니다")
    return v.strip()


def validate_patch(patch: dict[str, Any]) -> dict[str, Any]:
    """프런트/외부에서 온 설정 변경을 형·길이·허용값 기준으로 걸러 돌려준다. 모르는 키는 버린다."""
    if not isinstance(patch, dict):
        raise ConfigError("객체가 아닙니다")
    out: dict[str, Any] = {}
    for k, v in patch.items():
        if k == "api_key":
            key = _short_str(v, 128, "api_key")
            if key and not _KEY_RE.match(key):
                raise ConfigError("api_key: 영문·숫자 8~128자여야 합니다")
            out[k] = key
        elif k == "theme":
            if v not in _THEMES:
                raise ConfigError("theme")
            out[k] = v
        elif k == "color_mode":
            if v not in _COLOR_MODES:
                raise ConfigError("color_mode")
            out[k] = v
        elif k == "tiles":
            out[k] = bool(v)
        elif k == "active_preset":
            out[k] = None if v is None else _short_str(v, 100, "active_preset")
        elif k == "presets":
            if not isinstance(v, list) or len(v) > 100:
                raise ConfigError("presets: 100개 이하 목록이어야 합니다")
            presets = []
            for item in v:
                if not isinstance(item, dict):
                    raise ConfigError("presets")
                name = _short_str(item.get("name"), 100, "presets.name")
                regions = item.get("regions")
                if not isinstance(regions, list) or len(regions) > 400 or not all(isinstance(r, str) and len(r) <= 10 for r in regions):
                    raise ConfigError("presets.regions")
                presets.append({"name": name, "regions": regions})
            out[k] = presets
        elif k == "aliases":
            if not isinstance(v, dict) or len(v) > 500:
                raise ConfigError("aliases")
            out[k] = {_short_str(a, 100, "aliases"): _short_str(b, 100, "aliases") for a, b in v.items()}
        # 그 밖의 키는 무시
    return out


def validate_coord(lat: Any, lng: Any) -> tuple[float, float]:
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError) as exc:
        raise ConfigError("좌표는 숫자여야 합니다") from exc
    if not (math.isfinite(la) and math.isfinite(ln)) or not (-90 <= la <= 90) or not (-180 <= ln <= 180):
        raise ConfigError("좌표 범위를 벗어났습니다")
    return la, ln


class Config:
    def __init__(self, folder: pathlib.Path):
        self.folder = folder
        self.path = folder / CONFIG_NAME
        self.data: dict[str, Any] = {**DEFAULTS, **_read(self.path)}

    @property
    def api_key(self) -> str:
        return self.data.get("api_key") or os.environ.get("KAKAO_REST_API_KEY", "")

    def update(self, patch: dict[str, Any]) -> None:
        self.data.update(validate_patch(patch))
        self.save()

    def save(self) -> None:
        _write(self.path, self.data)

    def public(self) -> dict[str, Any]:
        """프런트로 보내는 형태 — 키는 마스킹."""
        key = self.api_key
        out = {**self.data, "api_key": "", "has_key": bool(key)}
        if key:
            out["api_key_masked"] = key[:4] + "…" + key[-2:] if len(key) > 6 else "••••"
        return out


class Overrides:
    def __init__(self, folder: pathlib.Path):
        self.path = folder / OVERRIDES_NAME
        self.data: dict[str, dict] = _read(self.path)

    def set(self, address_key: str, lat: float, lng: float, note: str = "") -> None:
        lat, lng = validate_coord(lat, lng)
        self.data[address_key] = {"lat": lat, "lng": lng, "note": note, "ts": time.time()}
        _write(self.path, self.data)

    def remove(self, address_key: str) -> None:
        if address_key in self.data:
            del self.data[address_key]
            _write(self.path, self.data)

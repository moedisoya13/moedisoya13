"""config.json (API 키·필터 프리셋·표시 옵션) 과 overrides.json (수동 좌표) 읽고 쓰기.

둘 다 xlsx 가 있는 작업 폴더에 둔다 — 앱을 다른 폴더로 옮기면 설정도 함께 간다.
"""
from __future__ import annotations

import json
import os
import pathlib
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
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


class Config:
    def __init__(self, folder: pathlib.Path):
        self.folder = folder
        self.path = folder / CONFIG_NAME
        self.data: dict[str, Any] = {**DEFAULTS, **_read(self.path)}

    @property
    def api_key(self) -> str:
        return self.data.get("api_key") or os.environ.get("KAKAO_REST_API_KEY", "")

    def update(self, patch: dict[str, Any]) -> None:
        for k, v in patch.items():
            if k in DEFAULTS:
                self.data[k] = v
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
        self.data[address_key] = {"lat": lat, "lng": lng, "note": note, "ts": time.time()}
        _write(self.path, self.data)

    def remove(self, address_key: str) -> None:
        if address_key in self.data:
            del self.data[address_key]
            _write(self.path, self.data)

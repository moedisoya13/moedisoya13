"""단독 HTML / CSV 내보내기.

HTML 은 CSS·JS·Leaflet·경계 데이터·거래처 데이터를 모두 인라인해서 파일 하나로 공유할 수 있다.
외부 요청은 Google Fonts 링크 하나만 남고, 그것도 없으면 시스템 글꼴로 동작한다.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import pathlib
import re

from .pipeline import Pipeline

WEB_DIR = pathlib.Path(__file__).resolve().parents[1] / "web"
_LINK = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>')
_SCRIPT = re.compile(r'<script\s+src="([^"]+)"\s*></script>')
_FONT_LINK = re.compile(r'<link[^>]+fonts\.googleapis\.com[^>]*>\s*')


def _safe_json(obj) -> str:
    """JSON 문자열 안의 '<' 를 \\u003c 로 — </script> 뿐 아니라 <!--<script> 같은 토크나이저 탈출도 막는다.
    JSON 에서 '<' 는 문자열 안에만 올 수 있으므로 의미는 변하지 않는다."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("<", "\\u003c")


def build_html(payload: dict, boundaries_json: str | None = None, web_dir: pathlib.Path = WEB_DIR) -> str:
    html = (web_dir / "index.html").read_text(encoding="utf-8")

    def inline_css(m: re.Match) -> str:
        href = m.group(1)
        if href.startswith("http"):
            return m.group(0)
        css = (web_dir / href).read_text(encoding="utf-8")
        # leaflet.css 의 상대 이미지 경로는 마커 아이콘용이라 쓰지 않음 — 그대로 둠
        return f"<style>\n{css}\n</style>"

    def inline_js(m: re.Match) -> str:
        src = m.group(1)
        if src.startswith("http"):
            return m.group(0)
        js = (web_dir / src).read_text(encoding="utf-8").replace("</script>", "<\\/script>")
        return f"<script>\n{js}\n</script>"

    html = _LINK.sub(inline_css, html)
    html = _SCRIPT.sub(inline_js, html)
    # 공유 파일은 외부 요청을 하지 않게 — 글꼴 링크 제거(시스템 글꼴로 표시)
    html = _FONT_LINK.sub("", html)
    if boundaries_json is None:
        boundaries_json = (web_dir / "data" / "boundaries.json").read_text(encoding="utf-8")
    inject = (
        "<script>\n"
        f"window.CSM_DATA = {_safe_json(payload)};\n"
        f"window.CSM_BOUNDARIES = {boundaries_json.replace('<', '\\u003c')};\n"
        "</script>\n"
    )
    return html.replace("<!-- CSM:INLINE -->", inject, 1)


def export_html(pipeline: Pipeline, out_dir: pathlib.Path | None = None) -> pathlib.Path:
    out_dir = out_dir or pipeline.folder
    name = f"CSM_map_{dt.date.today().isoformat()}.html"
    out = out_dir / name
    out.write_text(build_html(pipeline.payload(for_export=True)), encoding="utf-8")
    return out


def csv_safe(value) -> object:
    """엑셀 수식 인젝션 방지: = + - @ 탭 등으로 시작하는 셀은 작은따옴표를 앞에 붙여 문자열로 고정."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def export_csv(pipeline: Pipeline, out_dir: pathlib.Path | None = None) -> pathlib.Path:
    out_dir = out_dir or pipeline.folder
    out = out_dir / f"CSM_geocoded_{dt.date.today().isoformat()}.csv"
    with out.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["구분", "대리점명", "거래처명", "주소", "시도", "시군구", "위도", "경도", "정밀도", "출처", "파일", "행"])
        for s in pipeline.dataset.stores:
            w.writerow([csv_safe(v) for v in ["거래처", s.dealer_name, s.name, s.address, s.sido, s.sgg_name, s.lat, s.lng, s.precision, s.provider, s.source, s.row]])
        for d in pipeline.dataset.dealers:
            if d.address:
                w.writerow([csv_safe(v) for v in ["대리점", d.name, "", d.address, d.sido, d.sgg_name, d.lat, d.lng, d.precision, d.provider, "", ""]])
    return out

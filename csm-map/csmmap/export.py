"""단독 HTML / CSV 내보내기.

HTML 은 CSS·JS·Leaflet·경계 데이터·거래처 데이터를 모두 인라인해서 파일 하나로 공유할 수 있다.
외부 요청은 Google Fonts 링크 하나만 남고, 그것도 없으면 시스템 글꼴로 동작한다.
"""
from __future__ import annotations

import base64
import csv
import datetime as dt
import json
import pathlib
import re

from . import model
from .pipeline import Pipeline

WEB_DIR = pathlib.Path(__file__).resolve().parents[1] / "web"
_LINK = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>')
_SCRIPT = re.compile(r'<script\s+src="([^"]+)"\s*></script>')
_FONT_LINK = re.compile(r'<link[^>]+fonts\.googleapis\.com[^>]*>\s*')
_CSS_URL = re.compile(r'url\("?([^")]+\.woff2)"?\)')


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
        css_path = web_dir / href
        css = css_path.read_text(encoding="utf-8")

        def embed_font(u: re.Match) -> str:
            font = (css_path.parent / u.group(1)).resolve()
            if not str(font).startswith(str(web_dir.resolve())) or not font.is_file():
                return u.group(0)
            data = base64.b64encode(font.read_bytes()).decode("ascii")
            return f'url("data:font/woff2;base64,{data}")'

        css = _CSS_URL.sub(embed_font, css)  # 공유 파일에서도 같은 글꼴로 보이게
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
    safe_boundaries = boundaries_json.replace("<", "\\u003c")  # f-string 밖에서 — 3.12 미만 호환
    inject = (
        "<script>\n"
        f"window.CSM_DATA = {_safe_json(payload)};\n"
        f"window.CSM_BOUNDARIES = {safe_boundaries};\n"
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
        w.writerow(["구분", "대리점명", "거래처명", "주소", "시도", "시군구", "위도", "경도", "정밀도", "사유", "출처", "파일", "행"])
        for s in pipeline.dataset.stores:
            w.writerow([csv_safe(v) for v in ["거래처", s.dealer_name, s.name, s.address, s.sido, s.sgg_name, s.lat, s.lng, s.precision, s.reason, s.provider, s.source, s.row]])
        for d in pipeline.dataset.dealers:
            if d.address:
                w.writerow([csv_safe(v) for v in ["대리점", d.name, "", d.address, d.sido, d.sgg_name, d.lat, d.lng, d.precision, d.reason, d.provider, "", ""]])
    return out


# ---------------------------------------------------------------------------
# 정정 요청 목록 (xlsx) — 주소 검색에 실패한 거래처·대리점을 담당자에게 보내 정정받기 위한 파일
# ---------------------------------------------------------------------------
CORRECTION_COLUMNS = [
    ("번호", 6), ("구분", 8), ("대리점명", 18), ("거래처명", 24), ("현재 주소", 52), ("사유", 26),
    ("주소상 시군구", 16), ("원본 위치", 18), ("수정 주소", 52), ("비고", 24),
]
FIX_COL = 9  # '수정 주소' 열 (1-based)


def correction_rows(pipeline: Pipeline) -> list[list]:
    rows = []
    for s in pipeline.dataset.stores:
        if s.precision == model.NEEDS_FIX:
            where = f"{s.source} {s.row}행" if s.source else ""
            rows.append(["거래처", s.dealer_name, s.name, s.address, s.reason, s.sgg_name, where])
    for d in pipeline.dataset.dealers:
        if d.address and d.precision == model.NEEDS_FIX:
            rows.append(["대리점", d.name, "", d.address, d.reason, d.sgg_name, "대리점 목록(H:I열)"])
    rows.sort(key=lambda r: (r[0] != "거래처", r[1], r[2]))
    return [[i + 1, *r] for i, r in enumerate(rows)]


def _text(cell, value) -> None:
    """문자열은 항상 '문자열 셀'로 — openpyxl 은 '=' 로 시작하면 수식으로 쓰기 때문(수식 인젝션 방지)."""
    cell.value = value
    if isinstance(value, str):
        cell.data_type = "s"


def export_corrections(pipeline: Pipeline, out_dir: pathlib.Path | None = None) -> tuple[pathlib.Path, int]:
    """정정 필요 건을 xlsx 로. (경로, 건수) 를 돌려준다. 0건이면 ValueError."""
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    rows = correction_rows(pipeline)
    if not rows:
        raise ValueError("정정할 항목이 없습니다")
    out_dir = out_dir or pipeline.folder
    out = out_dir / f"CSM_정정요청_{dt.date.today().isoformat()}.xlsx"

    from .excel import OWN_OUTPUT_TITLE

    wb = openpyxl.Workbook()
    wb.properties.title = OWN_OUTPUT_TITLE  # 같은 폴더에 있어도 원본 데이터로 읽지 않게 표시
    wb.properties.creator = "csm-map"
    ws = wb.active
    ws.title = "정정 요청"
    head_fill = PatternFill("solid", fgColor="E8F1FE")
    fix_fill = PatternFill("solid", fgColor="FFF6CC")
    thin = Side(style="thin", color="CCCCCC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for c, (title, width) in enumerate(CORRECTION_COLUMNS, start=1):
        cell = ws.cell(row=1, column=c)
        _text(cell, title)
        cell.font = Font(bold=True, color="0017C1" if c == FIX_COL else "1A1A1C")
        cell.fill = fix_fill if c == FIX_COL else head_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border
        ws.column_dimensions[get_column_letter(c)].width = width
    for r, values in enumerate(rows, start=2):
        for c in range(1, len(CORRECTION_COLUMNS) + 1):
            cell = ws.cell(row=r, column=c)
            if c <= len(values):
                _text(cell, values[c - 1])
            cell.border = border
            cell.alignment = Alignment(vertical="center", wrap_text=c in (5, 6, FIX_COL))
            if c == FIX_COL:
                cell.fill = fix_fill
    ws.freeze_panes = "E2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(CORRECTION_COLUMNS))}{len(rows) + 1}"
    ws.row_dimensions[1].height = 22

    guide = wb.create_sheet("안내")
    lines = [
        ("CSM 거래처 지도 — 주소 정정 요청", True),
        ("", False),
        ("아래 거래처·대리점은 카카오 주소 검색에서 위치를 찾지 못했습니다.", False),
        ("'정정 요청' 시트의 노란 칸 「수정 주소」에 정확한 도로명 또는 지번 주소를 적어 회신해 주세요.", False),
        ("", False),
        ("주소 작성 예: 경기도 부천시 소사구 범안로 103   (건물명·층·호는 없어도 됩니다)", False),
        ("", False),
        ("회신받은 뒤 반영 방법", True),
        ("1. CSM.xlsx 에서 해당 행의 주소를 수정 주소로 바꿉니다 — 거래처는 D열, 대리점은 I열.", False),
        ("2. 앱을 다시 실행하면 바뀐 주소만 새로 검색합니다(이전 결과는 캐시에 남아 다시 묻지 않습니다).", False),
        ("3. 그래도 찾지 못하면 다음 정정 요청 목록에 다시 나타납니다.", False),
        ("", False),
        (f"작성: {dt.datetime.now().strftime('%Y-%m-%d %H:%M')} · 대상 {len(rows)}건 · "
         f"원본 {', '.join(f.name for f in pipeline.dataset.files) or '-'}", False),
    ]
    for i, (text, bold) in enumerate(lines, start=1):
        cell = guide.cell(row=i, column=1)
        _text(cell, text)
        cell.font = Font(bold=bold, size=13 if i == 1 else 11)
    guide.column_dimensions["A"].width = 100

    wb.save(out)
    try:
        import os
        os.chmod(out, 0o600)
    except OSError:
        pass
    return out, len(rows)

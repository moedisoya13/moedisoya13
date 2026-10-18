import csv
import re

from csmmap import model
from csmmap.config import Config
from csmmap.export import build_html, export_csv, export_html
from csmmap.pipeline import Pipeline


def make_pipeline(folder, regions):
    p = Pipeline(folder, regions, Config(folder), demo=True)
    p.geocode()
    return p


def test_pipeline_demo_assigns_regions(folder, regions):
    p = make_pipeline(folder, regions)
    pl = p.payload()
    counts = pl["meta"]["counts"]
    assert counts["approx"] == 11 and counts["needs_fix"] == 1   # 주소 없는 1건은 정정 필요
    by_name = {s["name"]: s for s in pl["stores"]}
    assert by_name["샘플마트 화정점"]["sgg_name"] == "고양시 덕양구"
    assert by_name["샘플마트 서해점"]["sgg_name"] == "서해구"
    assert by_name["샘플마트 주소없음"]["lat"] is None and by_name["샘플마트 주소없음"]["reason"] == "주소 없음"
    dealers = {d["name"]: d for d in pl["dealers"]}
    assert dealers["(주)한빛유통"]["lat"] is not None and dealers["한빛유통"]["lat"] is None
    assert pl["meta"]["demo"] is True


def test_override_then_cached_apply(folder, regions):
    p = make_pipeline(folder, regions)
    sid = next(s.id for s in p.dataset.stores if s.name == "샘플마트 양천점")
    p.set_override(sid, 37.5665, 126.9780)
    s = next(s for s in p.dataset.stores if s.id == sid)
    assert s.precision == model.MANUAL and s.sgg_name == "중구"
    # 새 파이프라인은 네트워크 없이 overrides 를 반영한다
    p2 = Pipeline(folder, regions, Config(folder), demo=True)
    p2.apply_cached()
    s2 = next(s for s in p2.dataset.stores if s.id == sid)
    assert s2.precision == model.MANUAL and s2.lat == 37.5665
    p2.clear_override(sid)
    assert sid not in {k for k in p2.overrides.data}


def test_export_html_is_self_contained(folder, regions):
    p = make_pipeline(folder, regions)
    out = export_html(p)
    html = out.read_text(encoding="utf-8")
    assert "window.CSM_DATA" in html and "window.CSM_BOUNDARIES" in html
    local = [m for m in re.findall(r'(?:src|href)="([^"]+)"', html) if not m.startswith(("http", "data:", "#"))]
    assert local == [], local
    assert "</script>" not in html.split("window.CSM_DATA")[1].split("\n")[0]
    assert out.stat().st_size < 3_000_000  # 글꼴 내장 포함


def test_build_html_escapes_script_close(regions, folder):
    p = make_pipeline(folder, regions)
    payload = p.payload()
    payload["stores"][0]["name"] = "x</script><b>"
    html = build_html(payload)
    data_line = next(l for l in html.splitlines() if l.startswith("window.CSM_DATA"))
    assert "</script>" not in data_line and "x\\u003c/script>" in data_line


def test_export_csv(folder, regions):
    p = make_pipeline(folder, regions)
    out = export_csv(p)
    rows = list(csv.reader(out.open(encoding="utf-8-sig")))
    assert rows[0][0] == "구분"
    assert sum(1 for r in rows[1:] if r[0] == "거래처") == 12
    assert sum(1 for r in rows[1:] if r[0] == "대리점") == 4

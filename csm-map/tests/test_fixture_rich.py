"""스크린샷·화면 확인용 합성 데이터(make_rich) — 데모 모드로 띄워도 캐시의 '정확' 좌표가 쓰이고,
좌표가 주소의 시군구 안에 있으며, 겹치는 영업권의 대리점끼리 색이 갈리는지."""
from make_fixture import RICH_DEALERS, make_rich

from csmmap import model
from csmmap.config import Config
from csmmap.pipeline import Pipeline


def test_rich_fixture_loads_as_exact_points(tmp_path, regions):
    make_rich(tmp_path)
    p = Pipeline(tmp_path, regions, Config(tmp_path), demo=True)
    p.geocode()
    pl = p.payload()
    counts = pl["meta"]["counts"]
    total = sum(n for _, _, spread in RICH_DEALERS for _, _, n in spread) + 1   # + 주소 미기재 1건
    assert len(pl["stores"]) == total
    assert counts["exact"] >= total - 10 and counts["needs_fix"] >= 2 and counts.get("approx", 0) == 0
    for s in pl["stores"]:
        if s["precision"] == model.EXACT:
            hit = regions.locate(s["lat"], s["lng"])
            assert hit is not None and hit.display == s["sgg_name"], s["name"]
    dealers = {d["name"]: d for d in pl["dealers"]}
    assert dealers["온새상사"]["lat"] is None            # 주소 없는 대리점
    assert dealers["가람유통"]["hue"] != dealers["해솔유통"]["hue"]   # 부천 오정·부평·계양에서 겹침
    assert dealers["다온식품"]["hue"] != dealers["해솔유통"]["hue"]


def test_rich_fixture_is_deterministic(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    make_rich(a); make_rich(b)
    import openpyxl
    rows = lambda f: [[c.value for c in r] for r in openpyxl.load_workbook(f / "CSM.xlsx").active.iter_rows()]
    assert rows(a) == rows(b)

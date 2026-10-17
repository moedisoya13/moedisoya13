import json
import urllib.error

import pytest

from csmmap import model
from csmmap.geocode import Cache, Geocoder, KakaoClient, KakaoError, cache_key


class FakeClient:
    """주소 → 응답 사전으로 Kakao 클라이언트를 흉내 낸다."""

    def __init__(self, address=None, fail=None):
        self.address_map = address or {}
        self.fail = fail
        self.calls = []

    def address(self, q):
        self.calls.append(("address", q))
        if self.fail:
            raise self.fail
        return self.address_map.get(q)

    def keyword(self, q):  # pragma: no cover - 호출되면 실패해야 한다
        raise AssertionError("거래처명 키워드 검색은 호출되면 안 된다")


ADDR = "경기도 부천시 소사구 범안로 103, 1층 전체 (범박동)"


def test_cache_roundtrip(tmp_path):
    c = Cache(tmp_path / "cache.json")
    from csmmap.geocode import GeoResult
    c.put("k", GeoResult(37.5, 126.9, model.EXACT, "kakao:address", "q", 1.0))
    c.save()
    c2 = Cache(tmp_path / "cache.json")
    assert c2.get("k").lat == 37.5 and len(c2) == 1
    c2.drop("k"); assert c2.get("k") is None


def test_region_point_stays_inside_its_district(regions, tmp_path):
    g = Geocoder(regions, Cache(tmp_path / "c.json"), None, demo=True)
    for r in regions.regions:
        if r.sido not in ("서울특별시", "인천광역시"):
            continue
        res = g.approx(f"{r.sido} {r.display} 테스트로 {r.code}")
        assert regions.locate(res.lat, res.lng).code == r.code, r.display


def test_demo_is_deterministic_approx(regions, tmp_path):
    g = Geocoder(regions, Cache(tmp_path / "c.json"), None, demo=True)
    a = g.geocode_one(ADDR); b = g.geocode_one(ADDR)
    assert a.precision == model.APPROX and (a.lat, a.lng) == (b.lat, b.lng)
    assert regions.locate(a.lat, a.lng) is not None
    assert g.geocode_one("주소아님").precision == model.FAILED


def test_exact_hit_on_simplified_variant(regions, tmp_path):
    fake = FakeClient(address={"경기도 부천시 소사구 범안로 103": {"x": "126.80", "y": "37.47"}})
    g = Geocoder(regions, Cache(tmp_path / "c.json"), fake)
    r = g.geocode_one(ADDR, "월드식자재마트")
    assert r.precision == model.EXACT and r.query == "경기도 부천시 소사구 범안로 103"
    assert g.cache.get(cache_key(ADDR)).precision == model.EXACT
    # 두 번째는 캐시 적중 — API 호출 없음
    n = len(fake.calls)
    assert g.geocode_one(ADDR).precision == model.EXACT and len(fake.calls) == n


def test_address_miss_is_needs_fix_without_keyword_search(regions, tmp_path):
    fake = FakeClient()  # 어떤 변형에도 결과 없음
    g = Geocoder(regions, Cache(tmp_path / "c.json"), fake)
    r = g.geocode_one(ADDR, "월드식자재마트")
    assert r.precision == model.NEEDS_FIX and r.reason == "주소 검색 결과 없음"
    assert regions.locate(r.lat, r.lng).display == "부천시 소사구"     # 주소상 시군구 중심 부근
    assert all(kind == "address" for kind, _ in fake.calls)            # 키워드 검색 없음
    # 캐시되어 재실행 때 API 를 다시 부르지 않는다
    n = len(fake.calls)
    assert g.geocode_one(ADDR, "월드식자재마트").precision == model.NEEDS_FIX and len(fake.calls) == n
    # 강제 재검색이면 다시 묻는다
    g.geocode_one(ADDR, "월드식자재마트", force=True)
    assert len(fake.calls) > n


def test_needs_fix_without_region_has_no_coords(regions, tmp_path):
    g = Geocoder(regions, Cache(tmp_path / "c.json"), FakeClient())
    r = g.geocode_one("어딘가 알수없는 주소 1")
    assert r.precision == model.NEEDS_FIX and r.lat is None and "시군구 인식 불가" in r.reason


def test_empty_address_is_needs_fix(regions, tmp_path):
    for demo in (True, False):
        g = Geocoder(regions, Cache(tmp_path / "c.json"), None if demo else FakeClient(), demo=demo)
        r = g.geocode_one("   ")
        assert r.precision == model.NEEDS_FIX and r.reason == "주소 없음" and r.lat is None


def test_legacy_keyword_cache_entry_is_ignored(regions, tmp_path):
    path = tmp_path / "c.json"
    path.write_text(json.dumps({cache_key(ADDR): {"lat": 37.47, "lng": 126.8, "precision": "keyword",
                                                   "provider": "kakao:keyword", "query": "x", "ts": 0}}), encoding="utf-8")
    fake = FakeClient(address={"경기도 부천시 소사구 범안로 103": {"x": "126.80", "y": "37.47"}})
    g = Geocoder(regions, Cache(path), fake)
    r = g.geocode_one(ADDR)
    assert r.precision == model.EXACT and fake.calls  # 예전 키워드 결과를 쓰지 않고 주소로 다시 조회


def test_api_error_falls_back_to_approx_and_records_error(regions, tmp_path):
    fake = FakeClient(fail=KakaoError("키 거부"))
    g = Geocoder(regions, Cache(tmp_path / "c.json"), fake)
    r = g.geocode_one(ADDR)
    assert r.precision == model.APPROX and "키 거부" in g.last_error
    assert g.cache.get(cache_key(ADDR)) is None  # 주소 문제가 아니므로 정정 대상도, 캐시 대상도 아니다


def test_override_wins(regions, tmp_path):
    g = Geocoder(regions, Cache(tmp_path / "c.json"), None, overrides={cache_key(ADDR): {"lat": 1.0, "lng": 2.0}}, demo=True)
    r = g.geocode_one(ADDR)
    assert (r.lat, r.lng, r.precision) == (1.0, 2.0, model.MANUAL)


def test_geocode_many_progress(regions, tmp_path):
    g = Geocoder(regions, Cache(tmp_path / "c.json"), None, demo=True)
    seen = []
    res = g.geocode_many([("a", ADDR, ""), ("b", "서울특별시 양천구 중앙로 268", "")], progress=lambda d, t, i, r: seen.append((d, t)))
    assert set(res) == {"a", "b"} and seen == [(1, 2), (2, 2)]


def test_kakao_client_401_raises(monkeypatch):
    class Resp:
        def __init__(self, code): self.code = code
    def opener(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)
    c = KakaoClient("bad", opener=opener)
    with pytest.raises(KakaoError):
        c.address("x")


def test_kakao_client_parses(monkeypatch):
    import io
    class R(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def opener(req, timeout):
        assert req.get_header("Authorization") == "KakaoAK key"
        return R(json.dumps({"documents": [{"x": "1", "y": "2"}]}).encode())
    c = KakaoClient("key", opener=opener)
    assert c.address("q") == {"x": "1", "y": "2"}

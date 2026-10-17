import json
import urllib.error

import pytest

from csmmap import model
from csmmap.geocode import Cache, Geocoder, KakaoClient, KakaoError, cache_key


class FakeClient:
    """주소 → 응답 사전으로 Kakao 클라이언트를 흉내 낸다."""

    def __init__(self, address=None, keyword=None, fail=None):
        self.address_map = address or {}
        self.keyword_map = keyword or {}
        self.fail = fail
        self.calls = []

    def address(self, q):
        self.calls.append(("address", q))
        if self.fail:
            raise self.fail
        return self.address_map.get(q)

    def keyword(self, q):
        self.calls.append(("keyword", q))
        return self.keyword_map.get(q)


ADDR = "경기도 부천시 소사구 범안로 103, 1층 전체 (범박동)"


def test_cache_roundtrip(tmp_path):
    c = Cache(tmp_path / "cache.json")
    from csmmap.geocode import GeoResult
    c.put("k", GeoResult(37.5, 126.9, model.EXACT, "kakao:address", "q", 1.0))
    c.save()
    c2 = Cache(tmp_path / "cache.json")
    assert c2.get("k").lat == 37.5 and len(c2) == 1
    c2.drop("k"); assert c2.get("k") is None


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


def test_keyword_fallback_requires_same_region(regions, tmp_path):
    fake = FakeClient(keyword={"월드식자재마트 부천시 소사구": {"x": "126.80", "y": "37.47", "address_name": "경기 부천시 소사구 범박동 1"}})
    g = Geocoder(regions, Cache(tmp_path / "c.json"), fake)
    assert g.geocode_one(ADDR, "월드식자재마트").precision == model.KEYWORD
    fake2 = FakeClient(keyword={"월드식자재마트 부천시 소사구": {"x": "127.0", "y": "37.5", "address_name": "서울 강남구 x"}})
    g2 = Geocoder(regions, Cache(tmp_path / "c2.json"), fake2)
    assert g2.geocode_one(ADDR, "월드식자재마트").precision == model.APPROX


def test_api_error_falls_back_to_approx_and_records_error(regions, tmp_path):
    fake = FakeClient(fail=KakaoError("키 거부"))
    g = Geocoder(regions, Cache(tmp_path / "c.json"), fake)
    r = g.geocode_one(ADDR)
    assert r.precision == model.APPROX and "키 거부" in g.last_error


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

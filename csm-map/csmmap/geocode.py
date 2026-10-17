"""지오코딩: Kakao Local API → 키워드 폴백 → 시군구 중심 근사.

순서 (geocode_one):
  0. 수동 보정(overrides) 가 있으면 그대로 (precision=manual)
  1. 캐시 적중 (성공 결과만; 실패는 retry 요청 시 다시 시도)
  2. Kakao 주소 검색: 원문 → 점점 단순한 변형 순으로
  3. Kakao 키워드 검색: '거래처명 시군구'. 결과의 시군구가 주소의 시군구와 같을 때만 채택
  4. 근사: 주소 텍스트의 시군구 중심 + 결정적 지터 (같은 주소는 항상 같은 자리)
  5. 실패
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from typing import Callable

from . import model
from .normalize import address_variants, clean_text, parse_region
from .regions import RegionIndex

KAKAO_ADDRESS = "https://dapi.kakao.com/v2/local/search/address.json"
KAKAO_KEYWORD = "https://dapi.kakao.com/v2/local/search/keyword.json"
USER_AGENT = "csm-map/0.1 (+local desktop app)"
JITTER_DEG = 0.012  # 근사 배치 지터 반경(약 1.3km) — 같은 구 안에서 점이 겹치지 않게


@dataclass
class GeoResult:
    lat: float | None
    lng: float | None
    precision: str
    provider: str = ""
    query: str = ""
    ts: float = 0.0

    def ok(self) -> bool:
        return self.lat is not None and self.lng is not None


class KakaoError(RuntimeError):
    pass


class Cache:
    """geocode_cache.json — 정규화 주소 → GeoResult. 성공만 저장, 스레드 안전."""

    def __init__(self, path: pathlib.Path):
        self.path = path
        self._lock = threading.Lock()
        self._data: dict[str, dict] = {}
        if path.exists():
            try:
                self._data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self._data = {}

    def get(self, key: str) -> GeoResult | None:
        d = self._data.get(key)
        return GeoResult(**d) if d else None

    def put(self, key: str, result: GeoResult) -> None:
        with self._lock:
            self._data[key] = asdict(result)

    def drop(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def save(self) -> None:
        with self._lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(self.path)

    def __len__(self) -> int:
        return len(self._data)


def cache_key(address: str) -> str:
    return clean_text(address)


def _jitter(seed: str) -> tuple[float, float]:
    h = hashlib.sha1(seed.encode("utf-8")).digest()
    a = (int.from_bytes(h[:4], "big") / 2**32) * 2 - 1
    b = (int.from_bytes(h[4:8], "big") / 2**32) * 2 - 1
    return a * JITTER_DEG, b * JITTER_DEG


class KakaoClient:
    def __init__(self, api_key: str, opener=None, timeout: float = 8.0):
        self.api_key = api_key
        self.timeout = timeout
        self._open = opener or urllib.request.urlopen
        self._lock = threading.Lock()
        self._next_allowed = 0.0

    def _get(self, url: str, params: dict) -> dict:
        req = urllib.request.Request(
            url + "?" + urllib.parse.urlencode(params),
            headers={"Authorization": f"KakaoAK {self.api_key}", "User-Agent": USER_AGENT},
        )
        for attempt in range(4):
            with self._lock:
                wait = self._next_allowed - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            try:
                with self._open(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                if exc.code == 429 and attempt < 3:
                    with self._lock:
                        self._next_allowed = time.monotonic() + 0.5 * (2 ** attempt)
                    continue
                if exc.code in (401, 403):
                    raise KakaoError("카카오 REST API 키가 거부되었습니다(401/403). 키와 '카카오맵' 활성화 여부를 확인하세요.") from exc
                raise KakaoError(f"카카오 API 오류 HTTP {exc.code}") from exc
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt < 3:
                    time.sleep(0.4 * (attempt + 1))
                    continue
                raise KakaoError(f"카카오 API 연결 실패: {exc}") from exc
        raise KakaoError("카카오 API 재시도 한도 초과")

    def address(self, query: str) -> dict | None:
        docs = self._get(KAKAO_ADDRESS, {"query": query, "size": 1}).get("documents") or []
        return docs[0] if docs else None

    def keyword(self, query: str) -> dict | None:
        docs = self._get(KAKAO_KEYWORD, {"query": query, "size": 3}).get("documents") or []
        return docs[0] if docs else None


class Geocoder:
    def __init__(
        self,
        regions: RegionIndex,
        cache: Cache,
        client: KakaoClient | None = None,
        overrides: dict[str, dict] | None = None,
        demo: bool = False,
        workers: int = 4,
    ):
        self.regions = regions
        self.cache = cache
        self.client = client
        self.overrides = overrides or {}
        self.demo = demo or client is None
        self.workers = workers
        self.last_error: str | None = None

    # ---- 단건 ----
    def approx(self, address: str) -> GeoResult:
        sido, sgg = parse_region(address)
        region = self.regions.by_name(sido, sgg) if sgg else None
        if not region:
            return GeoResult(None, None, model.FAILED, provider="approx", query=address, ts=time.time())
        lat, lng = region.centroid
        dlat, dlng = _jitter(cache_key(address))
        return GeoResult(lat + dlat, lng + dlng, model.APPROX, provider="approx", query=region.display, ts=time.time())

    def geocode_one(self, address: str, name: str = "", force: bool = False) -> GeoResult:
        key = cache_key(address)
        if not key:
            return GeoResult(None, None, model.FAILED, ts=time.time())
        if key in self.overrides:
            o = self.overrides[key]
            return GeoResult(o["lat"], o["lng"], model.MANUAL, provider="manual", ts=o.get("ts", 0))
        if not force:
            hit = self.cache.get(key)
            if hit and hit.ok() and (not self.demo or hit.precision != model.APPROX):
                return hit
        if self.demo:
            return self.approx(address)

        assert self.client is not None
        try:
            for variant in address_variants(address):
                doc = self.client.address(variant)
                if doc:
                    res = GeoResult(float(doc["y"]), float(doc["x"]), model.EXACT, "kakao:address", variant, time.time())
                    self.cache.put(key, res)
                    return res
            sido, sgg = parse_region(address)
            if name:
                doc = self.client.keyword(f"{name} {sgg}".strip())
                if doc and _same_region(doc.get("address_name", ""), sgg):
                    res = GeoResult(float(doc["y"]), float(doc["x"]), model.KEYWORD, "kakao:keyword", name, time.time())
                    self.cache.put(key, res)
                    return res
        except KakaoError as exc:
            self.last_error = str(exc)
        res = self.approx(address)
        if res.ok():
            self.cache.put(key, res)
        return res

    # ---- 일괄 ----
    def geocode_many(
        self,
        items: list[tuple[str, str, str]],   # (id, address, name)
        progress: Callable[[int, int, str, GeoResult], None] | None = None,
        force: bool = False,
    ) -> dict[str, GeoResult]:
        results: dict[str, GeoResult] = {}
        total = len(items)
        done = 0
        if self.demo or self.workers <= 1:
            for id_, addr, name in items:
                results[id_] = self.geocode_one(addr, name, force)
                done += 1
                if progress:
                    progress(done, total, id_, results[id_])
        else:
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                futs = {pool.submit(self.geocode_one, addr, name, force): id_ for id_, addr, name in items}
                for fut in as_completed(futs):
                    id_ = futs[fut]
                    results[id_] = fut.result()
                    done += 1
                    if progress:
                        progress(done, total, id_, results[id_])
        self.cache.save()
        return results


def _same_region(address_name: str, sgg: str) -> bool:
    if not sgg:
        return True
    _, found = parse_region(address_name)
    return found.replace(" ", "") == sgg.replace(" ", "")

"""지오코딩: Kakao 주소 검색만 쓴다. 실패하면 '정정 필요'로 따로 분류한다.

순서 (geocode_one):
  0. 수동 보정(overrides) 가 있으면 그대로 (precision=manual)
  1. 캐시 적중
  2. 데모(키 없음)면 시군구 중심 근사 (precision=approx, 검색하지 않음)
  3. Kakao 주소 검색: 원문 → 점점 단순한 변형 순으로 → 적중하면 exact
  4. 모두 결과 없음 → needs_fix(사유 기록). 시군구를 읽을 수 있으면 그 중심 부근에 둔다.
     거래처명 키워드 검색은 같은 이름의 다른 지점을 잡을 위험이 있어 하지 않는다.
  API 오류는 주소 문제가 아니므로 needs_fix 가 아니라 approx 로 두고 캐시하지 않는다.
"""
from __future__ import annotations

import hashlib
import json
import math
import pathlib
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, fields
from typing import Callable

from . import model
from .normalize import address_variants, clean_text, parse_region
from .regions import RegionIndex

KAKAO_ADDRESS = "https://dapi.kakao.com/v2/local/search/address.json"
USER_AGENT = "csm-map/0.2 (+local desktop app)"
REASON_NOT_FOUND = "주소 검색 결과 없음"
REASON_EMPTY = "주소 없음"
REASON_NO_REGION = "시군구 인식 불가"
JITTER_DEG = 0.012  # 근사 배치 지터 반경(약 1.3km) — 같은 구 안에서 점이 겹치지 않게


@dataclass
class GeoResult:
    lat: float | None
    lng: float | None
    precision: str
    provider: str = ""
    query: str = ""
    ts: float = 0.0
    reason: str = ""

    def ok(self) -> bool:
        return self.lat is not None and self.lng is not None


class KakaoError(RuntimeError):
    pass


class Cache:
    """geocode_cache.json — 정규화 주소 → GeoResult. 적중(exact)과 정정 필요(needs_fix)를 저장, 스레드 안전."""

    def __init__(self, path: pathlib.Path):
        self.path = path
        self._lock = threading.Lock()
        self._data: dict[str, dict] = {}
        if path.exists():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                self._data = loaded if isinstance(loaded, dict) else {}
            except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                self._data = {}

    def get(self, key: str) -> GeoResult | None:
        """손상되거나 조작된 엔트리(모르는 키, 비정상 precision, 무한/범위 밖 좌표)는 없는 것으로 친다."""
        d = self._data.get(key)
        if not isinstance(d, dict):
            return None
        try:
            r = GeoResult(**{k: d.get(k) for k in _FIELDS if k in d})
        except TypeError:
            return None
        if r.precision not in model.PRECISIONS or not all(isinstance(v, str) for v in (r.provider, r.query, r.reason)):
            return None  # 예전 'keyword' 엔트리도 여기서 탈락 → 주소 검색만으로 다시 조회
        if r.ok() and not _finite_coord(r.lat, r.lng):
            return None
        return r

    def put(self, key: str, result: GeoResult) -> None:
        with self._lock:
            self._data[key] = asdict(result)

    def drop(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def save(self) -> None:
        with self._lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")
            try:
                import os
                os.chmod(tmp, 0o600)
            except OSError:
                pass
            tmp.replace(self.path)

    def __len__(self) -> int:
        return len(self._data)


_FIELDS = tuple(f.name for f in fields(GeoResult))


def _finite_coord(lat, lng) -> bool:
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    return math.isfinite(la) and math.isfinite(ln) and -90 <= la <= 90 and -180 <= ln <= 180


def _xy(doc: dict) -> tuple[float, float] | None:
    """Kakao 응답의 x(경도)/y(위도). 숫자가 아니거나 무한·범위 밖이면 None."""
    lat, lng = doc.get("y"), doc.get("x")
    return (float(lat), float(lng)) if _finite_coord(lat, lng) else None


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
    def _region_point(self, address: str, precision: str, provider: str, reason: str = "") -> GeoResult:
        """주소 텍스트의 시군구 중심 + 결정적 지터(같은 주소는 항상 같은 자리). 시군구를 못 읽으면 좌표 없음."""
        sido, sgg = parse_region(address)
        region = self.regions.by_name(sido, sgg) if sgg else None
        if not region:
            if precision == model.NEEDS_FIX:
                why = " · ".join(x for x in (reason, REASON_NO_REGION) if x)
                return GeoResult(None, None, model.NEEDS_FIX, provider=provider, query=address, ts=time.time(), reason=why)
            return GeoResult(None, None, model.FAILED, provider=provider, query=address, ts=time.time(), reason=REASON_NO_REGION)
        lat, lng = region.centroid
        dlat, dlng = _jitter(cache_key(address))
        # 작은 시군구에서는 지터가 경계를 넘을 수 있다 → 그 시군구 안에 들어올 때까지 반경을 줄인다
        for _ in range(4):
            hit = self.regions.locate(lat + dlat, lng + dlng)
            if hit is not None and hit.code == region.code:
                break
            dlat, dlng = dlat / 2, dlng / 2
        else:
            dlat = dlng = 0.0
        return GeoResult(lat + dlat, lng + dlng, precision, provider=provider, query=region.display, ts=time.time(), reason=reason)

    def approx(self, address: str) -> GeoResult:
        """검색하지 않은 근사 — 데모 모드, API 오류 시."""
        return self._region_point(address, model.APPROX, "approx")

    def needs_fix(self, address: str, reason: str = REASON_NOT_FOUND) -> GeoResult:
        """검색했지만 찾지 못함 — 원천 주소 정정 요청 대상."""
        return self._region_point(address, model.NEEDS_FIX, "kakao:none", reason)

    def geocode_one(self, address: str, name: str = "", force: bool = False) -> GeoResult:
        key = cache_key(address)
        if not key:
            return GeoResult(None, None, model.NEEDS_FIX, provider="", ts=time.time(), reason=REASON_EMPTY)
        if key in self.overrides:
            o = self.overrides[key]
            return GeoResult(o["lat"], o["lng"], model.MANUAL, provider="manual", ts=o.get("ts", 0))
        if not force:
            hit = self.cache.get(key)
            if hit and hit.precision in (model.EXACT, model.NEEDS_FIX):
                return hit
        if self.demo:
            return self.approx(address)

        assert self.client is not None
        try:
            for variant in address_variants(address):
                doc = self.client.address(variant)
                xy = _xy(doc) if doc else None
                if xy:
                    res = GeoResult(xy[0], xy[1], model.EXACT, "kakao:address", variant, time.time())
                    self.cache.put(key, res)
                    return res
        except KakaoError as exc:
            # 키 거부·연결 실패 등은 주소 탓이 아니다 → 정정 대상으로 만들지 않고, 캐시도 하지 않는다
            self.last_error = str(exc)
            return self.approx(address)
        res = self.needs_fix(address)
        self.cache.put(key, res)  # 재실행 때 같은 주소로 API 를 다시 부르지 않게. 주소를 고치면 키가 바뀐다
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


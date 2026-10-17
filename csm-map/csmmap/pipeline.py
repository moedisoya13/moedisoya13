"""엑셀 → 지오코딩 → 권역 귀속 → 프런트 JSON. 서버와 export 가 공유하는 한 줄기."""
from __future__ import annotations

import datetime as dt
import pathlib
from typing import Callable

from . import model
from .config import CACHE_NAME, Config, Overrides, validate_coord
from .excel import load_folder
from .geocode import Cache, Geocoder, GeoResult, KakaoClient
from .normalize import parse_region
from .regions import RegionIndex

Progress = Callable[[int, int, str, GeoResult], None]


class Pipeline:
    def __init__(self, folder: pathlib.Path, regions: RegionIndex, config: Config, demo: bool = False):
        self.folder = folder
        self.regions = regions
        self.config = config
        self.demo = demo
        self.overrides = Overrides(folder)
        self.cache = Cache(folder / CACHE_NAME)
        self.dataset: model.Dataset = load_folder(folder)
        self.geocoded = False
        self.last_error: str | None = None

    # ---- 단계 ----
    def rescan(self) -> None:
        self.dataset = load_folder(self.folder)
        self.geocoded = False

    def make_geocoder(self) -> Geocoder:
        client = KakaoClient(self.config.api_key) if (self.config.api_key and not self.demo) else None
        return Geocoder(self.regions, self.cache, client, overrides=self.overrides.data, demo=self.demo or client is None)

    def apply_cached(self) -> None:
        """네트워크 없이 캐시·수동보정만 적용 — 서버 기동 직후 즉시 그릴 수 있게."""
        g = Geocoder(self.regions, self.cache, None, overrides=self.overrides.data, demo=True)
        for s in self.dataset.stores:
            hit = g.overrides.get(s.address.strip())
            res = g.cache.get(s.address.strip())
            if hit:
                res = GeoResult(hit["lat"], hit["lng"], model.MANUAL, "manual")
            if res and res.ok():
                self._apply(s, res)
        for d in self.dataset.dealers:
            if d.address:
                res = g.cache.get(d.address.strip())
                if res and res.ok():
                    self._apply(d, res)
        self._assign_regions()

    def geocode(self, progress: Progress | None = None, force: bool = False) -> None:
        geocoder = self.make_geocoder()
        items = [(s.id, s.address, s.name) for s in self.dataset.stores if s.address]
        items += [(d.id, d.address, d.name) for d in self.dataset.dealers if d.address]
        results = geocoder.geocode_many(items, progress=progress, force=force)
        by_id = {s.id: s for s in self.dataset.stores}
        by_id.update({d.id: d for d in self.dataset.dealers})
        for id_, res in results.items():
            self._apply(by_id[id_], res)
        self._assign_regions()
        self.geocoded = True
        self.last_error = geocoder.last_error

    def set_override(self, store_id: str, lat: float, lng: float) -> None:
        lat, lng = validate_coord(lat, lng)
        target = next((x for x in self.dataset.stores + self.dataset.dealers if x.id == store_id), None)
        if not target:
            raise KeyError(store_id)
        self.overrides.set(target.address.strip(), lat, lng, note=target.name)
        self._apply(target, GeoResult(lat, lng, model.MANUAL, "manual"))
        self._assign_regions()

    def clear_override(self, store_id: str) -> None:
        target = next((x for x in self.dataset.stores + self.dataset.dealers if x.id == store_id), None)
        if target:
            self.overrides.remove(target.address.strip())
            self.cache.drop(target.address.strip())

    # ---- 내부 ----
    @staticmethod
    def _apply(obj, res: GeoResult) -> None:
        obj.lat, obj.lng = res.lat, res.lng
        obj.precision = res.precision if res.ok() else model.FAILED
        obj.provider = res.provider

    def _assign_regions(self) -> None:
        for obj in [*self.dataset.stores, *self.dataset.dealers]:
            region = None
            address = getattr(obj, "address", "")
            # 근사 좌표는 주소 텍스트에서 나온 것이므로 텍스트 귀속이 우선 (지터가 옆 구로 넘어갈 수 있음)
            if obj.precision == model.APPROX and address:
                sido, sgg = parse_region(address)
                region = self.regions.by_name(sido, sgg) if sgg else None
            if region is None and obj.lat is not None and obj.lng is not None:
                region = self.regions.locate(obj.lat, obj.lng)
            if region is None and address:
                sido, sgg = parse_region(address)
                region = self.regions.by_name(sido, sgg) if sgg else None
            if region:
                obj.sido, obj.sgg_code, obj.sgg_name = region.sido, region.code, region.display
            else:
                obj.sido = obj.sgg_code = obj.sgg_name = ""

    # ---- 출력 ----
    def payload(self, for_export: bool = False) -> dict:
        """for_export=True 면 로컬 경로 등 공유 파일에 들어가면 안 되는 정보를 뺀다."""
        meta = {
            "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
            "folder": str(self.folder),
            "geocoded": self.geocoded,
            "demo": self.demo or not self.config.api_key,
            "provider": "demo(근사)" if (self.demo or not self.config.api_key) else "Kakao Local API",
            "boundaries": self.regions.meta,
            "cache_size": len(self.cache),
            "last_error": self.last_error,
        }
        if for_export:
            meta.pop("folder", None)
            meta.pop("last_error", None)
        return self.dataset.to_json(meta)

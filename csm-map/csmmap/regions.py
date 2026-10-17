"""시군구 경계 (TopoJSON) 로드와 좌표→권역 귀속.

외부 GIS 의존성 없이 순수 파이썬으로 TopoJSON 을 복원하고 point-in-polygon 을 계산한다.
256개 폴리곤 × 수백 점 규모라 bbox 프리필터만으로 충분히 빠르다.
"""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass, field

from .normalize import display_sgg, region_key

DEFAULT_PATH = pathlib.Path(__file__).resolve().parents[1] / "web" / "data" / "boundaries.json"

Ring = list[tuple[float, float]]


@dataclass
class Region:
    code: str          # 시군구 코드 5자리
    sido: str          # 시도 이름
    name: str          # 경계 데이터 원 이름 ('고양시덕양구')
    display: str       # 표시 이름 ('고양시 덕양구')
    polygons: list[list[Ring]]   # MultiPolygon: [polygon][ring(0=outer)]
    bbox: tuple[float, float, float, float]  # lng_min, lat_min, lng_max, lat_max
    label: tuple[float, float] | None = None  # (lng, lat) 내부 라벨점
    key: str = field(default="")

    def __post_init__(self) -> None:
        self.key = region_key(self.sido, self.name)

    @property
    def centroid(self) -> tuple[float, float]:
        """(lat, lng). 라벨점이 있으면 그걸, 없으면 bbox 중심."""
        if self.label:
            return self.label[1], self.label[0]
        return (self.bbox[1] + self.bbox[3]) / 2, (self.bbox[0] + self.bbox[2]) / 2


def _decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    tf = topo.get("transform")
    arcs = []
    for arc in topo["arcs"]:
        pts, x, y = [], 0, 0
        for dx, dy in arc:
            if tf:
                x += dx
                y += dy
                pts.append((x * tf["scale"][0] + tf["translate"][0], y * tf["scale"][1] + tf["translate"][1]))
            else:
                pts.append((dx, dy))
        arcs.append(pts)
    return arcs


def _ring(arc_idx: list[int], arcs) -> Ring:
    ring: Ring = []
    for i in arc_idx:
        pts = arcs[i] if i >= 0 else list(reversed(arcs[~i]))
        if ring and ring[-1] == pts[0]:
            pts = pts[1:]
        ring.extend(pts)
    return ring


def _point(topo: dict, coords) -> tuple[float, float]:
    tf = topo.get("transform")
    if tf:
        return coords[0] * tf["scale"][0] + tf["translate"][0], coords[1] * tf["scale"][1] + tf["translate"][1]
    return coords[0], coords[1]


def _point_in_ring(x: float, y: float, ring: Ring) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


class RegionIndex:
    def __init__(self, regions: list[Region], sido_names: list[str], meta: dict):
        self.regions = regions
        self.sido_names = sido_names
        self.meta = meta
        self._by_key = {r.key: r for r in regions}
        self._by_code = {r.code: r for r in regions}

    @classmethod
    def load(cls, path: pathlib.Path = DEFAULT_PATH) -> "RegionIndex":
        topo = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        arcs = _decode_arcs(topo)
        labels: dict[str, tuple[float, float]] = {}
        for g in topo["objects"].get("labels", {}).get("geometries", []):
            if g.get("type") == "Point":
                labels[g["properties"]["sgg"]] = _point(topo, g["coordinates"])
        regions: list[Region] = []
        for g in topo["objects"]["sgg"]["geometries"]:
            p = g["properties"]
            if g["type"] == "Polygon":
                polys = [[_ring(r, arcs) for r in g["arcs"]]]
            elif g["type"] == "MultiPolygon":
                polys = [[_ring(r, arcs) for r in poly] for poly in g["arcs"]]
            else:
                continue
            xs = [pt[0] for poly in polys for pt in poly[0]]
            ys = [pt[1] for poly in polys for pt in poly[0]]
            regions.append(Region(
                code=str(p["sgg"]), sido=p["sidonm"], name=p["sggnm"], display=display_sgg(p["sggnm"]),
                polygons=polys, bbox=(min(xs), min(ys), max(xs), max(ys)), label=labels.get(str(p["sgg"])),
            ))
        sidos = sorted({r.sido for r in regions})
        return cls(regions, sidos, topo.get("meta", {}))

    def locate(self, lat: float, lng: float) -> Region | None:
        """좌표가 속한 시군구. 바깥 링 안이고 구멍 링 밖이면 포함."""
        for r in self.regions:
            if not (r.bbox[0] <= lng <= r.bbox[2] and r.bbox[1] <= lat <= r.bbox[3]):
                continue
            for poly in r.polygons:
                if _point_in_ring(lng, lat, poly[0]) and not any(_point_in_ring(lng, lat, h) for h in poly[1:]):
                    return r
        return None

    def by_name(self, sido: str, sgg: str) -> Region | None:
        """주소 텍스트 파싱 결과로 찾기. 공백 차이('고양시 덕양구' vs '고양시덕양구') 는 키에서 흡수."""
        r = self._by_key.get(region_key(sido, sgg))
        if r:
            return r
        # 시도만 바뀐 경우(옛 이름) 대비: 시군구 이름만으로 유일하면 채택
        cands = [x for x in self.regions if x.name.replace(" ", "") == sgg.replace(" ", "")]
        return cands[0] if len(cands) == 1 else None

    def by_code(self, code: str) -> Region | None:
        return self._by_code.get(code)

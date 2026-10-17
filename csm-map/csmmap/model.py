"""데이터 모델. 프런트와 주고받는 JSON 의 단일 진실 공급원."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

# 좌표 정밀도. 지도에서는 색이 아니라 '형태'로 구분한다 (가이드북: 색만으로 식별하지 않음).
EXACT = "exact"      # 주소 지오코딩 적중
KEYWORD = "keyword"  # 거래처명 키워드 검색으로 보정
MANUAL = "manual"    # 사용자가 지도에서 직접 지정 (overrides.json)
APPROX = "approx"    # 시군구 중심 근사 (점선 중공 링으로 표시)
FAILED = "failed"    # 좌표 없음 (지도에 없고 미해결 패널·표에만)
PRECISIONS = (EXACT, KEYWORD, MANUAL, APPROX, FAILED)


@dataclass
class Store:
    id: str
    name: str
    dealer_id: str
    dealer_name: str
    address: str
    addr_norm: str = ""
    lat: float | None = None
    lng: float | None = None
    precision: str = FAILED
    provider: str = ""
    sido: str = ""
    sgg_code: str = ""
    sgg_name: str = ""
    source: str = ""
    row: int = 0


@dataclass
class Dealer:
    id: str
    name: str
    address: str = ""
    lat: float | None = None
    lng: float | None = None
    precision: str = FAILED
    provider: str = ""
    sido: str = ""
    sgg_code: str = ""
    sgg_name: str = ""
    color_idx: int = 0
    store_ids: list[str] = field(default_factory=list)
    similar_to: list[str] = field(default_factory=list)


@dataclass
class SourceFile:
    name: str
    sheet: str
    modified: str  # ISO 8601
    stores: int
    dealers: int


@dataclass
class Dataset:
    stores: list[Store]
    dealers: list[Dealer]
    files: list[SourceFile]
    warnings: list[str] = field(default_factory=list)

    def to_json(self, meta: dict[str, Any] | None = None) -> dict[str, Any]:
        counts = {p: 0 for p in PRECISIONS}
        for s in self.stores:
            counts[s.precision] = counts.get(s.precision, 0) + 1
        return {
            "stores": [asdict(s) for s in self.stores],
            "dealers": [asdict(d) for d in self.dealers],
            "files": [asdict(f) for f in self.files],
            "warnings": list(self.warnings),
            "meta": {"counts": counts, **(meta or {})},
        }

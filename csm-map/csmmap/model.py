"""데이터 모델. 프런트와 주고받는 JSON 의 단일 진실 공급원."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

# 좌표 정밀도. 지도에서는 색이 아니라 '형태'로 구분한다 (가이드북: 색만으로 식별하지 않음).
EXACT = "exact"          # 카카오 주소 검색 적중
MANUAL = "manual"        # 사용자가 지도에서 직접 지정 (overrides.json)
NEEDS_FIX = "needs_fix"  # 주소 검색을 했지만 결과 없음 / 주소 빈칸 → 원천 데이터 정정 요청 대상.
                         #   시군구를 읽을 수 있으면 그 중심 부근에 흐린 점선 마름모로 표시
APPROX = "approx"        # 검색하지 않은 근사(데모·키 없음·API 오류) — 시군구 중심, 점선 원
FAILED = "failed"        # 검색하지 않았고 시군구도 모름 — 지도에 없음
PRECISIONS = (EXACT, MANUAL, NEEDS_FIX, APPROX, FAILED)
# 거래처명 키워드 검색은 엉뚱한 지점을 잡을 위험이 있어 쓰지 않는다 (v0.2).


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
    reason: str = ""
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
    reason: str = ""
    sido: str = ""
    sgg_code: str = ""
    sgg_name: str = ""
    color_idx: int = 0   # 거래처 수 순위 (목록 정렬용)
    hue: int = 0         # 지도 색 슬롯 0–7 (palette.assign_hues — 영업권이 겹치는 대리점끼리 다른 색)
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

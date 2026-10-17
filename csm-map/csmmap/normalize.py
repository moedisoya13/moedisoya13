"""주소·명칭 정규화.

지오코더는 '경기도 부천시 소사구 범안로 103, 1층 전체 (범박동)' 같은 부가정보가 붙은 주소에서
자주 실패한다. 그래서 원문 → 괄호 제거 → 쉼표 뒤 제거 → 층·호·동(건물) 제거 → 도로명+번호만,
순서로 점점 단순한 변형을 만들어 차례로 시도한다.
"""
from __future__ import annotations

import re
from collections import defaultdict

# 2026년 행정구역 개편 이후 명칭. 주소 원문은 옛 이름을 쓸 수 있으므로 경계 데이터 이름으로 맞춘다.
SIDO_ALIASES = {
    "서울": "서울특별시", "서울시": "서울특별시",
    "인천": "인천광역시", "인천시": "인천광역시",
    "경기": "경기도",
    "부산": "부산광역시", "대구": "대구광역시", "대전": "대전광역시", "울산": "울산광역시",
    "광주": "전남광주통합특별시", "광주광역시": "전남광주통합특별시", "전라남도": "전남광주통합특별시", "전남": "전남광주통합특별시",
    "전라북도": "전북특별자치도", "전북": "전북특별자치도",
    "강원도": "강원특별자치도", "강원": "강원특별자치도",
    "제주도": "제주특별자치도", "제주": "제주특별자치도",
    "세종시": "세종특별자치시", "세종": "세종특별자치시",
    "충북": "충청북도", "충남": "충청남도", "경북": "경상북도", "경남": "경상남도",
}

_WS = re.compile(r"\s+")
_PAREN = re.compile(r"\s*[\(（][^\)）]*[\)）]")
_FLOOR_UNIT = re.compile(
    r"(,\s*)?(지하\s*)?(B\d+|\d+(~\d+)?|[가-힣A-Z])\s*(층|호|동)(\s*(일부|전체|상가동|상가))?(\s*[·,]\s*\d+\s*호)*",
)
_ROAD = re.compile(r"^(.*?\S+(?:로|길)\s*\d+(?:-\d+)?)(?:\s|,|$)")


def clean_text(value: object) -> str:
    """셀 값 → 앞뒤 공백·중복 공백 정리한 문자열. None 은 ''."""
    if value is None:
        return ""
    return _WS.sub(" ", str(value)).strip()


def address_variants(address: str) -> list[str]:
    """단순해지는 순서의 주소 변형 목록 (중복 제거, 원문 먼저)."""
    base = clean_text(address)
    if not base:
        return []
    out: list[str] = []

    def add(v: str) -> None:
        v = clean_text(v).rstrip(",")
        if v and v not in out:
            out.append(v)

    add(base)
    no_paren = _PAREN.sub("", base)
    add(no_paren)
    add(no_paren.split(",")[0])
    add(_FLOOR_UNIT.sub("", no_paren.split(",")[0]))
    m = _ROAD.match(no_paren)
    if m:
        add(m.group(1))
    return out


def normalize_sido(token: str) -> str:
    return SIDO_ALIASES.get(token, token)


def parse_region(address: str) -> tuple[str, str]:
    """주소 텍스트에서 (시도, 시군구) 를 뽑는다. '경기도 고양시 덕양구 …' → ('경기도', '고양시 덕양구').

    좌표 기반 권역 귀속이 실패했을 때의 폴백이며, 경계 데이터 이름과의 매칭은 regions.region_key 가 한다.
    """
    tokens = clean_text(address).split(" ")
    if not tokens or not tokens[0]:
        return "", ""
    sido = normalize_sido(tokens[0])
    if len(tokens) < 2:
        return sido, ""
    sgg = tokens[1]
    # '고양시 덕양구', '부천시 소사구', '청주시 흥덕구' 처럼 시 아래 구가 있는 경우
    if sgg.endswith("시") and len(tokens) >= 3 and tokens[2].endswith("구") and not tokens[2].endswith("지구"):
        sgg = f"{sgg} {tokens[2]}"
    # 세종특별자치시 는 시군구 계층이 없다
    if sido == "세종특별자치시":
        sgg = "세종특별자치시"
    return sido, sgg


def region_key(sido: str, sgg: str) -> str:
    """경계 데이터와 주소 파싱 양쪽에서 같은 키가 나오게 공백을 제거해 결합."""
    return f"{clean_text(sido).replace(' ', '')}|{clean_text(sgg).replace(' ', '')}"


def display_sgg(sggnm: str) -> str:
    """경계 데이터의 '고양시덕양구' → '고양시 덕양구'. '시흥시', '미추홀구' 는 그대로."""
    m = re.match(r"^(.+?시)(.+구)$", sggnm)
    if m and len(m.group(1)) >= 2 and len(m.group(2)) >= 2:
        return f"{m.group(1)} {m.group(2)}"
    return sggnm


_CORP = re.compile(r"\(주\)|주식회사|㈜|\(유\)|유한회사|\s")


def dealer_key(name: str) -> str:
    """'(주)가양유통' 과 '가양유통' 을 같은 키로 — 유사 명칭 탐지용(병합은 하지 않음)."""
    return _CORP.sub("", clean_text(name)).lower()


def similar_dealer_groups(names: list[str]) -> list[list[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    for n in names:
        key = dealer_key(n)
        if key and n not in groups[key]:
            groups[key].append(n)
    return [sorted(g) for g in groups.values() if len(g) > 1]


def initials(name: str, n: int = 2) -> str:
    """대리점 배지용 이니셜: '(주)대상유통' → '대상', 'G마트' → 'G마'."""
    core = _CORP.sub("", clean_text(name))
    return (core or clean_text(name))[:n]

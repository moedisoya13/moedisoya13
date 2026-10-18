"""테스트·화면 확인용 합성 CSM.xlsx 생성 (실제 거래처 데이터는 공개 저장소에 커밋하지 않는다).

    python tools/make_fixture.py [출력.xlsx]        작은 테스트용(12행)
    python tools/make_fixture.py --rich <폴더>      스크린샷용(약 140행 + 좌표 캐시)


양식만 실제 파일과 같게: B 대리점명 / C 거래처명 / D 주소, H 대리점명 / I 주소.
주소는 실제 도로명 형식을 흉내 낸 가상의 값이다.
"""
from __future__ import annotations

import pathlib
import sys

import openpyxl

ROWS = [
    # (대리점명, 거래처명, 주소)
    ("(주)한빛유통", "샘플마트 범박점", "경기도 부천시 소사구 범안로 103, 1층 전체 (범박동)"),
    ("(주)한빛유통", "샘플마트 역곡점", "경기도 부천시 원미구 지봉로 116"),
    ("한빛유통", "샘플마트 오정점", "경기도 부천시 오정구 고리울로64번길 25-3"),
    ("동녘유통", "샘플마트 화정점", "경기도 고양시 덕양구 화신로260번길 74"),
    ("동녘유통", "샘플마트 영종점", "인천광역시 영종구 운중로 140-23, 1층 (중산동)"),
    ("바다상사", "샘플마트 양천점 ", "서울특별시 양천구 중앙로 268"),
    ("바다상사", "샘플마트 강서점", "서울특별시 강서구 강서로 254, 상가동 지하 1층 (화곡동, 샘플아파트)"),
    ("바다상사", "샘플마트 미추홀점", "인천광역시 미추홀구 경인로 214"),
    ("바다상사", "샘플마트 강화점", "인천광역시 강화군 강화읍 중앙로 68 (강화농협 하나로마트)"),
    ("바다상사", "샘플마트 주소없음", ""),
    ("들녘식품", "샘플마트 서해점", "인천광역시 서해구 청라에메랄드로76번길 21 (청라동, H빌딩)"),
    ("들녘식품", "샘플마트 시흥점", "경기도 시흥시 배곧4로 32-32"),
]
DEALERS = [
    ("(주)한빛유통", "경기도 부천시 원미구 길주로 210"),
    ("한빛유통", ""),
    ("동녘유통", "경기도 고양시 덕양구 고양대로 1955"),
    ("바다상사", "서울특별시 강서구 공항대로 200"),
    ("들녘식품", "인천광역시 남동구 인주대로 800"),
]


def make(path: pathlib.Path) -> pathlib.Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "CSM"
    ws["B1"], ws["C1"], ws["D1"], ws["H1"], ws["I1"] = "대리점명", "거래처명", "주소", "대리점명", "주소"
    for i, (d, n, a) in enumerate(ROWS, start=2):
        ws.cell(row=i, column=2, value=d)
        ws.cell(row=i, column=3, value=n)
        ws.cell(row=i, column=4, value=a or None)
    for i, (d, a) in enumerate(DEALERS, start=2):
        ws.cell(row=i, column=8, value=d)
        ws.cell(row=i, column=9, value=a or None)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path


# ── 화면 확인·스크린샷용 큰 합성 데이터 ──────────────────────────────
# 상호·도로명은 모두 지어낸 값('샘플로' 등)이고, 시군구 이름만 실제 행정구역을 쓴다.
_SIDO = {"인천": "인천광역시", "서울": "서울특별시", "경기": "경기도"}
RICH_DEALERS = [
    # (대리점명, 거점 시군구 또는 None, [(시군구, 거래처 수)...])
    ("가람유통", ("경기", "부천시 원미구"), [("경기", "부천시 원미구", 6), ("경기", "부천시 소사구", 4), ("경기", "부천시 오정구", 3), ("인천", "부평구", 2), ("인천", "계양구", 2)]),
    ("누리상사", ("서울", "강서구"), [("서울", "강서구", 7), ("서울", "양천구", 3), ("서울", "마포구", 2), ("경기", "김포시", 2)]),
    ("다온식품", ("인천", "부평구"), [("인천", "부평구", 7), ("인천", "계양구", 3), ("인천", "미추홀구", 2), ("인천", "서해구", 2)]),
    ("마루유통", ("인천", "남동구"), [("인천", "남동구", 6), ("인천", "연수구", 3), ("경기", "시흥시", 3), ("인천", "미추홀구", 1)]),
    ("바름상사", ("서울", "양천구"), [("서울", "양천구", 5), ("서울", "구로구", 3), ("서울", "영등포구", 3), ("서울", "강서구", 2)]),
    ("새봄유통", ("서울", "구로구"), [("서울", "구로구", 5), ("서울", "금천구", 3), ("경기", "광명시", 3), ("서울", "관악구", 2)]),
    ("아라식품", ("인천", "연수구"), [("인천", "연수구", 5), ("인천", "남동구", 2), ("인천", "제물포구", 2), ("인천", "영종구", 2)]),
    ("자람유통", ("경기", "김포시"), [("경기", "김포시", 5), ("인천", "검단구", 3), ("인천", "강화군", 2), ("인천", "서해구", 2)]),
    ("하늘상사", ("인천", "미추홀구"), [("인천", "미추홀구", 6), ("인천", "제물포구", 3), ("인천", "남동구", 2)]),
    ("한결유통", ("서울", "영등포구"), [("서울", "영등포구", 4), ("서울", "동작구", 3), ("서울", "관악구", 2), ("서울", "마포구", 2)]),
    ("늘봄식품", ("경기", "시흥시"), [("경기", "시흥시", 4), ("경기", "안산시 단원구", 3), ("경기", "광명시", 2)]),
    ("솔빛유통", ("경기", "고양시 덕양구"), [("경기", "고양시 덕양구", 4), ("경기", "파주시", 2), ("서울", "마포구", 1)]),
    ("해솔유통", ("인천", "계양구"), [("인천", "계양구", 4), ("인천", "부평구", 2), ("경기", "부천시 오정구", 2), ("인천", "검단구", 2)]),
    ("온새상사", None, [("경기", "평택시", 2), ("경기", "안산시 단원구", 2)]),
]
_BRANDS = ["샘플마트", "예시마트", "가상식자재", "데모할인마트", "테스트마트"]
RICH_FIX_EVERY = 23   # 이 간격마다 '찾지 못한 주소'(정정 필요)로 만든다


def make_rich(folder: pathlib.Path, seed: int = 7) -> pathlib.Path:
    """CSM.xlsx + geocode_cache.json(시군구 안의 임의 좌표를 '정확'으로) — --demo 로 띄워도 실제처럼 보인다."""
    import random
    import time

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
    from csmmap import model
    from csmmap.geocode import Cache, Geocoder, GeoResult, cache_key
    from csmmap.regions import RegionIndex

    rnd = random.Random(seed)
    regions = RegionIndex.load()
    folder.mkdir(parents=True, exist_ok=True)
    cache = Cache(folder / "geocode_cache.json")
    geo = Geocoder(regions, cache, demo=True)

    def point_in(sido: str, sgg: str) -> tuple[float, float]:
        r = regions.by_name(_SIDO[sido], sgg)
        assert r, (sido, sgg)
        x0, y0, x1, y1 = r.bbox
        for _ in range(2000):
            lat, lng = rnd.uniform(y0, y1), rnd.uniform(x0, x1)
            hit = regions.locate(lat, lng)
            if hit is not None and hit.code == r.code:
                return lat, lng
        return r.centroid

    rows, dealers, k = [], [], 0
    for name, home, spread in RICH_DEALERS:
        addr = ""
        if home:
            addr = f"{_SIDO[home[0]]} {home[1]} 샘플대로 {rnd.randint(10, 400)}"
            lat, lng = point_in(*home)
            cache.put(cache_key(addr), GeoResult(lat, lng, model.EXACT, "kakao:address", addr, time.time()))
        dealers.append((name, addr))
        for sido, sgg, n in spread:
            for i in range(n):
                k += 1
                short = sgg.split()[-1].rstrip("시군구") or sgg
                store = f"{rnd.choice(_BRANDS)} {short}{i + 1}호점"
                a = f"{_SIDO[sido]} {sgg} 샘플로{rnd.randint(1, 90)}번길 {rnd.randint(1, 60)}"
                if k % RICH_FIX_EVERY == 0:
                    a += " (없는 주소)"
                    cache.put(cache_key(a), geo.needs_fix(a))
                else:
                    lat, lng = point_in(sido, sgg)
                    cache.put(cache_key(a), GeoResult(lat, lng, model.EXACT, "kakao:address", a, time.time()))
                rows.append((name, store, a))
    rows.append(("온새상사", "샘플마트 주소미기재점", ""))
    cache.save()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "CSM"
    ws["B1"], ws["C1"], ws["D1"], ws["H1"], ws["I1"] = "대리점명", "거래처명", "주소", "대리점명", "주소"
    for i, (d, n, a) in enumerate(rows, start=2):
        ws.cell(row=i, column=2, value=d)
        ws.cell(row=i, column=3, value=n)
        ws.cell(row=i, column=4, value=a or None)
    for i, (d, a) in enumerate(dealers, start=2):
        ws.cell(row=i, column=8, value=d)
        ws.cell(row=i, column=9, value=a or None)
    out = folder / "CSM.xlsx"
    wb.save(out)
    return out


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--rich":
        print(make_rich(pathlib.Path(sys.argv[2])))
        sys.exit()
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "CSM_sample.xlsx"
    print(make(out))

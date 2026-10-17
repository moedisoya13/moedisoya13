"""테스트용 합성 CSM.xlsx 생성 (실제 거래처 데이터는 공개 저장소에 커밋하지 않는다).

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


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "CSM_sample.xlsx"
    print(make(out))

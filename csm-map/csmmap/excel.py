"""xlsx 로드. 폴더 안의 모든 *.xlsx 를 읽어 거래처·대리점 목록으로 만든다.

기대 양식 (CSM.xlsx):
  B 대리점명 | C 거래처명 | D 주소          ← 거래처 블록 (헤더 1행)
  H 대리점명 | I 주소                       ← 대리점 블록 (I 가 채워지면 대리점도 지도에 표시)
열 위치는 헤더 텍스트로 찾고, 못 찾으면 위 고정 위치를 쓴다.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import pathlib
from dataclasses import dataclass

import openpyxl

from .model import Dataset, Dealer, SourceFile, Store
from .normalize import clean_text, similar_dealer_groups

HEADER_SCAN_ROWS = 5
MAX_FILE_BYTES = 50 * 1024 * 1024  # 이보다 큰 xlsx 는 건너뛴다 (압축 폭탄·메모리 보호)


@dataclass
class ColumnMap:
    store_dealer: int
    store_name: int
    store_addr: int
    dealer_name: int | None
    dealer_addr: int | None
    header_row: int


FALLBACK = ColumnMap(store_dealer=2, store_name=3, store_addr=4, dealer_name=8, dealer_addr=9, header_row=1)


def detect_columns(ws) -> ColumnMap:
    """헤더 행에서 '대리점명/거래처명/주소' 블록 두 개를 찾는다."""
    for r in range(1, HEADER_SCAN_ROWS + 1):
        cells = {c: clean_text(ws.cell(row=r, column=c).value) for c in range(1, ws.max_column + 1)}
        dealers = [c for c, v in cells.items() if v == "대리점명"]
        names = [c for c, v in cells.items() if v == "거래처명"]
        addrs = [c for c, v in cells.items() if v in ("주소", "거래처주소", "대리점주소")]
        if not (dealers and names and addrs):
            continue
        store_name = names[0]
        store_addr = min((a for a in addrs if a > store_name), default=None)
        store_dealer = max((d for d in dealers if d < store_name), default=dealers[0])
        if store_addr is None:
            continue
        second_dealer = next((d for d in dealers if d > store_addr), None)
        dealer_addr = None
        if second_dealer is not None:
            dealer_addr = next((a for a in addrs if a > second_dealer), None)
        return ColumnMap(store_dealer, store_name, store_addr, second_dealer, dealer_addr, r)
    return FALLBACK


def dealer_id(name: str) -> str:
    return "d" + hashlib.sha1(clean_text(name).encode("utf-8")).hexdigest()[:8]


def iter_xlsx(folder: pathlib.Path) -> list[pathlib.Path]:
    return sorted(
        p for p in folder.glob("*.xlsx")
        if not p.name.startswith("~$") and not p.name.startswith(".")
    )


def load_folder(folder: pathlib.Path) -> Dataset:
    stores: list[Store] = []
    dealers: dict[str, Dealer] = {}
    files: list[SourceFile] = []
    warnings: list[str] = []

    for fi, path in enumerate(iter_xlsx(folder)):
        if path.stat().st_size > MAX_FILE_BYTES:
            warnings.append(f"{path.name}: {MAX_FILE_BYTES // (1024 * 1024)}MB 를 넘어 건너뜀")
            continue
        try:
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        except Exception as exc:  # 손상·잠김 파일은 건너뛰고 경고
            warnings.append(f"{path.name}: 열 수 없음 ({exc.__class__.__name__})")
            continue
        if not wb.worksheets:
            warnings.append(f"{path.name}: 워크시트가 없음")
            wb.close()
            continue
        ws = wb["CSM"] if "CSM" in wb.sheetnames else wb.worksheets[0]
        # read_only 모드에서는 max_column 이 None 일 수 있어 일반 모드로 다시 연다
        if ws.max_column is None or ws.max_column < 4:
            wb.close()
            wb = openpyxl.load_workbook(path, data_only=True)
            ws = wb["CSM"] if "CSM" in wb.sheetnames else wb.worksheets[0]
        cols = detect_columns(ws)
        n_stores = n_dealers = 0

        for r, row in enumerate(ws.iter_rows(min_row=cols.header_row + 1, values_only=True), start=cols.header_row + 1):
            def cell(idx: int | None) -> str:
                if idx is None or idx - 1 >= len(row):
                    return ""
                return clean_text(row[idx - 1])

            dname, sname, saddr = cell(cols.store_dealer), cell(cols.store_name), cell(cols.store_addr)
            if sname:
                if not dname:
                    warnings.append(f"{path.name} {r}행: '{sname}' 대리점명 없음")
                    dname = "(대리점 미지정)"
                d = dealers.setdefault(dealer_id(dname), Dealer(id=dealer_id(dname), name=dname))
                sid = f"s{fi}-{r}"
                stores.append(Store(id=sid, name=sname, dealer_id=d.id, dealer_name=dname,
                                    address=saddr, source=path.name, row=r))
                d.store_ids.append(sid)
                n_stores += 1
                if not saddr:
                    warnings.append(f"{path.name} {r}행: '{sname}' 주소 없음")

            hname = cell(cols.dealer_name)
            if hname:
                d = dealers.setdefault(dealer_id(hname), Dealer(id=dealer_id(hname), name=hname))
                haddr = cell(cols.dealer_addr)
                if haddr and not d.address:
                    d.address = haddr
                n_dealers += 1

        wb.close()
        files.append(SourceFile(
            name=path.name, sheet=ws.title,
            modified=dt.datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
            stores=n_stores, dealers=n_dealers,
        ))

    # 대리점 색 인덱스는 거래처 수 내림차순 (並び順に意味)
    ordered = sorted(dealers.values(), key=lambda d: (-len(d.store_ids), d.name))
    for i, d in enumerate(ordered):
        d.color_idx = i
    for group in similar_dealer_groups([d.name for d in ordered]):
        for d in ordered:
            if d.name in group:
                d.similar_to = [n for n in group if n != d.name]
        warnings.append("유사 대리점명: " + " ↔ ".join(group))

    return Dataset(stores=stores, dealers=ordered, files=files, warnings=warnings)

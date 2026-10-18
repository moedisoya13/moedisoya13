"""Windows 휴대용 실행 폴더(zip) 빌더 — Python 을 설치하지 않은 PC 에서도 그대로 실행된다.

구성
  CSM-Map/
    run_csm_map.bat      ← 더블클릭
    읽어주세요.txt
    CSM.xlsx             ← --xlsx 로 준 파일 (선택)
    app/                 ← csm_map.py · csmmap/ · web/
    runtime/             ← Windows x64 CPython (NuGet 공식 패키지 'python', 게시자 Python Software Foundation)

재현 절차
  1. NuGet 에서 python.<버전>.nupkg 를 받아, NuGet 카탈로그에 기록된 SHA512 와 대조한다.
  2. tools/ 폴더를 runtime/ 으로 풀고, 테스트·IDLE·tkinter 등 쓰지 않는 부분을 지워 용량을 줄인다.
  3. openpyxl · et_xmlfile · defusedxml 순수 파이썬 휠을 runtime/Lib/site-packages 에 푼다.
  4. runtime/python3XX._pth 로 모듈 경로를 고정한다(PYTHONPATH 등 외부 환경을 무시하는 격리 모드).

사용
  python tools/make_portable.py --xlsx D:/CSM.xlsx --out dist/
  python tools/make_portable.py --nupkg python.3.14.8.nupkg   # 이미 받은 파일 사용(해시는 그래도 검증)
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
PY_VERSION = "3.14.8"
WHEELS = ["openpyxl==3.1.5", "et_xmlfile==2.0.0", "defusedxml==0.7.1"]
NUGET_PKG = "https://api.nuget.org/v3-flatcontainer/python/{v}/python.{v}.nupkg"
NUGET_REG = "https://api.nuget.org/v3/registration5-semver1/python/{v}.json"
BUNDLE = "CSM-Map"

# runtime 에서 지울 것 — 이 앱이 쓰지 않는 표준 라이브러리 일부와 개발용 파일
STRIP_DIRS = [
    "Lib/test", "Lib/idlelib", "Lib/tkinter", "Lib/turtledemo", "Lib/ensurepip", "Lib/lib2to3",
    "Lib/pydoc_data", "Lib/venv", "Lib/site-packages", "tcl", "include", "libs", "Scripts", "Tools", "Doc",
]
STRIP_FILES = ["DLLs/_tkinter.pyd", "DLLs/tcl86t.dll", "DLLs/tk86t.dll", "Lib/turtle.py"]

# app/ 에 넣을 것 / 뺄 것
APP_INCLUDE = ["csm_map.py", "README.md", "csmmap", "web"]
APP_EXCLUDE_PARTS = {"__pycache__", "tests", "tools", "build", "dist", "screenshots", ".pytest_cache"}
APP_EXCLUDE_SUFFIX = {".pyc", ".pyo", ".tmp"}


# ---------------------------------------------------------------- 순수 함수(테스트 대상)
def pth_lines(dll_name: str) -> list[str]:
    """python3XX._pth 내용. 경로는 python.exe 기준 상대경로."""
    assert dll_name.lower().startswith("python3") and dll_name.lower().endswith(".dll")
    return ["Lib", "DLLs", r"Lib\site-packages", r"..\app"]


def bat_text() -> str:
    """run_csm_map.bat — ASCII 만 사용(코드페이지와 무관하게 동작).
    "%~dp0" 는 끝 역슬래시가 닫는 따옴표를 이스케이프하므로 폴더 인자는 "%~dp0." 로 넘긴다."""
    lines = [
        "@echo off",
        "setlocal",
        "title CSM Map",
        'cd /d "%~dp0"',
        'if not exist "%~dp0runtime\\python.exe" (',
        "  echo [CSM Map] runtime\\python.exe not found. Unzip the whole folder first, then run this file again.",
        "  pause",
        "  exit /b 1",
        ")",
        '"%~dp0runtime\\python.exe" -X utf8 "%~dp0app\\csm_map.py" --folder "%~dp0." %*',
        "if errorlevel 1 (",
        "  echo.",
        "  echo [CSM Map] Stopped with an error. See the messages above.",
        "  pause",
        ")",
        "endlocal",
    ]
    return "\r\n".join(lines) + "\r\n"


def should_copy(rel: pathlib.PurePath) -> bool:
    if any(part in APP_EXCLUDE_PARTS for part in rel.parts):
        return False
    return rel.suffix not in APP_EXCLUDE_SUFFIX


SECRET_FILES = {"config.json", "overrides.json", "geocode_cache.json", ".env"}
_HEX32 = __import__("re").compile(rb"(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])")


def secret_scan(root: pathlib.Path) -> list[str]:
    """번들에 개발자 설정 파일이나 카카오 REST 키 형식(32자리 16진) 문자열이 있으면 목록을 돌려준다."""
    found = []
    for f in root.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(root).as_posix()
        if f.name in SECRET_FILES:
            found.append(f"설정 파일: {rel}")
        elif f.suffix in {".py", ".js", ".html", ".css", ".json", ".md", ".txt", ".bat"} and "/runtime/" not in f"/{rel}":
            if f.name == "boundaries.json":
                continue
            if _HEX32.search(f.read_bytes().lower()):
                found.append(f"키 형식 문자열: {rel}")
    return found


def readme_text(py_version: str, with_xlsx: bool) -> str:
    xlsx_line = "이 폴더에 들어 있는 CSM.xlsx 를 그대로 씁니다." if with_xlsx else "이 폴더에 CSM.xlsx 를 넣어 주세요."
    text = f"""CSM 거래처 지도 — 휴대용 실행 폴더
=====================================

■ 실행 (Python 설치 필요 없음)
  1. zip 을 통째로 원하는 곳에 압축 해제합니다. (zip 안에서 바로 실행하면 안 됩니다)
  2. {xlsx_line}
  3. run_csm_map.bat 를 더블클릭합니다.
     → 검은 창(진행 로그)과 함께 Edge 앱 창이 열립니다. 앱 창을 닫으면 프로그램도 끝납니다.

■ 정확한 위치를 얻으려면 — 카카오 REST API 키
  앱 창 오른쪽 위 「근사 위치 · 키 설정」(또는 맨 오른쪽 설정 버튼) → 「카카오 REST API 키」 붙여넣기 → 저장.
  키가 없으면 주소에 적힌 시군구 중심 부근에 '근사' 위치로만 표시됩니다.
  키 발급: developers.kakao.com → 내 애플리케이션 → 앱 키 → REST API 키
  401/403 오류가 나면 카카오 콘솔에서 「카카오맵」 사용 설정을 켜 주세요.

■ 화면 사용
  위쪽 「권역」에서 시군구를 체크하면 그 권역만 지도로 새로 그립니다(이름 붙여 저장 가능).
  지도 둘레의 흐린 시군구를 누르면 권역에 더해집니다. 대리점(목록이나 지도의 이니셜 원)에 마우스를 올리면
  납품 거래처까지 선이 그려지고, 누르면 고정되어 자세한 카드가 열립니다. 점 색 = 소속 대리점.

■ 주소 정정 요청
  카카오 주소 검색으로 찾지 못한 거래처는 거래처명으로 대신 찾지 않고 '정정 필요'로 따로 모읍니다.
  지도에는 시군구 중심 부근에 흐린 점선 마름모로만 표시됩니다.
  왼쪽 아래 「주소 정정 필요」 → 「정정 요청 엑셀 만들기」 → CSM_정정요청_날짜.xlsx 생성
  → 담당자에게 보내 노란 칸 「수정 주소」를 받음 → CSM.xlsx 의 주소(거래처 D열 · 대리점 I열)를 고침
  → 앱을 다시 실행하면 바뀐 주소만 새로 검색합니다.

■ 이 폴더에 생기는 파일
  config.json            API 키·저장한 필터·화면 설정 (키가 평문으로 들어 있으니 공유 주의)
  geocode_cache.json     주소 → 좌표 캐시
  overrides.json         지도에서 직접 지정한 위치
  CSM_map_날짜.html       내보낸 단독 지도 (거래처 정보가 들어 있으니 공유 범위 주의)
  CSM_geocoded_날짜.csv   좌표 포함 CSV
  CSM_정정요청_날짜.xlsx   정정 요청 목록

■ 문제 해결
  - 창이 바로 닫힘: run_csm_map.bat 를 cmd 창에서 실행하면 오류 문구를 볼 수 있습니다.
  - Edge 가 없으면 기본 브라우저로 열립니다.
  - 회사 보안 프로그램이 runtime\\python.exe 실행을 막으면 IT 담당자에게 예외 등록을 요청하세요.
    (Python Software Foundation 서명 파일입니다)
  - 앱 창 없이 지도 HTML 만 만들기: cmd 에서  run_csm_map.bat --export-only

구성: Python {py_version} (Windows x64, NuGet 공식 패키지) · openpyxl · defusedxml
만든 날: {dt.date.today().isoformat()}
"""
    return "\ufeff" + text.replace("\n", "\r\n")


# ---------------------------------------------------------------- 다운로드·검증
def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "csm-map-portable-builder"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def expected_sha512(version: str) -> str:
    reg = json.loads(_get(NUGET_REG.format(v=version)))
    leaf = json.loads(_get(reg["catalogEntry"]))
    if leaf.get("packageHashAlgorithm", "SHA512").upper() != "SHA512":
        raise RuntimeError("알 수 없는 해시 알고리즘")
    authors = leaf.get("authors", "")
    if "Python Software Foundation" not in authors:
        raise RuntimeError(f"게시자가 예상과 다릅니다: {authors!r}")
    return leaf["packageHash"]


def fetch_nupkg(version: str, dest: pathlib.Path, local: pathlib.Path | None) -> pathlib.Path:
    data = local.read_bytes() if local else _get(NUGET_PKG.format(v=version))
    got = base64.b64encode(hashlib.sha512(data).digest()).decode()
    want = expected_sha512(version)
    if got != want:
        raise RuntimeError("NuGet 패키지 SHA512 불일치 — 중단합니다")
    out = dest / f"python.{version}.nupkg"
    out.write_bytes(data)
    print(f"  python {version} nupkg {len(data) / 1e6:.1f}MB · SHA512 일치")
    return out


# ---------------------------------------------------------------- 조립
def extract_runtime(nupkg: pathlib.Path, runtime: pathlib.Path) -> None:
    with zipfile.ZipFile(nupkg) as z:
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            if not name.startswith("tools/") or name.endswith("/"):
                continue
            rel = pathlib.PurePosixPath(name[len("tools/"):])
            if ".." in rel.parts:
                raise RuntimeError(f"의심스러운 경로: {name}")
            target = runtime / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)


def strip_runtime(runtime: pathlib.Path) -> int:
    removed = 0
    for d in STRIP_DIRS:
        p = runtime / d
        if p.is_dir():
            removed += sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
            shutil.rmtree(p)
    for f in STRIP_FILES:
        p = runtime / f
        if p.is_file():
            removed += p.stat().st_size
            p.unlink()
    for p in list(runtime.rglob("__pycache__")):
        shutil.rmtree(p, ignore_errors=True)
    return removed


def install_wheels(site: pathlib.Path, work: pathlib.Path) -> list[str]:
    site.mkdir(parents=True, exist_ok=True)
    wheel_dir = work / "wheels"
    subprocess.run([sys.executable, "-m", "pip", "download", "--no-deps", "--only-binary=:all:",
                    "-q", "-d", str(wheel_dir), *WHEELS], check=True)
    names = []
    for whl in sorted(wheel_dir.glob("*.whl")):
        if not whl.name.endswith("-none-any.whl"):
            raise RuntimeError(f"순수 파이썬 휠이 아닙니다: {whl.name}")
        with zipfile.ZipFile(whl) as z:
            for n in z.namelist():
                if n.startswith("/") or ".." in pathlib.PurePosixPath(n).parts:
                    raise RuntimeError(f"의심스러운 경로: {n}")
            z.extractall(site)
        names.append(whl.name)
    return names


def copy_app(app: pathlib.Path) -> int:
    n = 0
    for item in APP_INCLUDE:
        src = ROOT / item
        if src.is_file():
            app.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, app / item)
            n += 1
            continue
        for f in src.rglob("*"):
            rel = f.relative_to(ROOT)
            if f.is_file() and should_copy(rel):
                (app / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, app / rel)
                n += 1
    return n


def build(out_dir: pathlib.Path, xlsx: pathlib.Path | None, version: str, local_nupkg: pathlib.Path | None) -> pathlib.Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        bundle = work / BUNDLE
        runtime = bundle / "runtime"
        nupkg = fetch_nupkg(version, work, local_nupkg)
        extract_runtime(nupkg, runtime)
        if not (runtime / "python.exe").is_file():
            raise RuntimeError("runtime/python.exe 가 없습니다 — 패키지 구조가 바뀌었는지 확인하세요")
        freed = strip_runtime(runtime)
        print(f"  runtime 정리 {freed / 1e6:.1f}MB 제거")
        wheels = install_wheels(runtime / "Lib" / "site-packages", work)
        print(f"  휠: {', '.join(wheels)}")
        dll = next(p.name for p in runtime.glob("python3*.dll") if p.name.lower() != "python3.dll")
        pth = runtime / (dll[:-4] + "._pth")
        pth.write_text("\r\n".join(pth_lines(dll)) + "\r\n", encoding="ascii")
        print(f"  {pth.name}: {', '.join(pth_lines(dll))}")
        print(f"  앱 파일 {copy_app(bundle / 'app')}개")
        (bundle / "run_csm_map.bat").write_bytes(bat_text().encode("ascii"))
        (bundle / "읽어주세요.txt").write_bytes(readme_text(version, bool(xlsx)).encode("utf-8"))
        if xlsx:
            shutil.copy2(xlsx, bundle / "CSM.xlsx")
        leaks = secret_scan(bundle)
        if leaks:  # 개발자 키·설정이 섞여 나가는 일을 원천 차단
            raise RuntimeError("번들에 민감 정보가 있어 중단합니다: " + "; ".join(leaks))
        print("  민감 정보 검사: 없음")
        out = out_dir / f"CSM-Map-portable-{dt.date.today().strftime('%Y%m%d')}.zip"
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for f in sorted(bundle.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(work).as_posix())
    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    print(f"완료: {out} ({out.stat().st_size / 1e6:.1f}MB) sha256={digest}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=pathlib.Path, default=ROOT / "dist")
    ap.add_argument("--xlsx", type=pathlib.Path, help="함께 넣을 CSM.xlsx (저장소에는 커밋하지 않음)")
    ap.add_argument("--python", default=PY_VERSION, help=f"NuGet python 패키지 버전 (기본 {PY_VERSION})")
    ap.add_argument("--nupkg", type=pathlib.Path, help="이미 받은 nupkg 경로")
    a = ap.parse_args()
    if a.xlsx and not a.xlsx.is_file():
        ap.error(f"xlsx 없음: {a.xlsx}")
    build(a.out, a.xlsx, a.python, a.nupkg)
    return 0


if __name__ == "__main__":
    sys.exit(main())

# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 스펙: web/ (HTML·CSS·JS·Leaflet·경계 데이터) 를 exe 에 함께 담는다.
#   pyinstaller build/csm_map.spec   (csm-map 폴더에서 실행)
import pathlib
ROOT = pathlib.Path(SPECPATH).resolve().parent

a = Analysis(
    [str(ROOT / "csm_map.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[(str(ROOT / "web"), "web")],
    hiddenimports=["openpyxl", "openpyxl.cell._writer"],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "PIL", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="csm_map",
    console=True,            # 진행 로그가 보이게 콘솔 창 유지 (False 로 바꾸면 창 없이 실행)
    icon=None,
    upx=False,
    onefile=True,
)

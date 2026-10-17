@echo off
rem CSM 거래처 지도 — Windows 단일 실행파일 빌드
rem 사용: csm-map 폴더에서  build\build_exe.bat
cd /d "%~dp0\.."
python -m pip install -r requirements-build.txt || goto :fail
python -m PyInstaller --noconfirm --clean --distpath build\dist --workpath build\work build\csm_map.spec || goto :fail
echo.
echo  완료: build\dist\csm_map.exe  (CSM.xlsx 와 같은 폴더에 두고 더블클릭)
exit /b 0
:fail
echo  빌드 실패 — 위 로그를 확인하세요.
exit /b 1

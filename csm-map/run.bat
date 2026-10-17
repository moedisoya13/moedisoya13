@echo off
rem 파이썬으로 바로 실행 (exe 를 만들지 않았을 때)
cd /d "%~dp0"
python csm_map.py %*
if errorlevel 1 pause

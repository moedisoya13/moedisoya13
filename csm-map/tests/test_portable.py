"""휴대용 번들 빌더의 순수 함수 (네트워크 없이)."""
import pathlib

import make_portable as mp


def test_pth_lines_isolate_paths():
    lines = mp.pth_lines("python314.dll")
    assert lines == ["Lib", "DLLs", r"Lib\site-packages", r"..\app"]
    assert "import site" not in lines  # 사용자 site-packages 를 읽지 않는다


def test_bat_is_ascii_crlf_and_quotes_folder_safely():
    bat = mp.bat_text()
    assert bat.isascii() and "\r\n" in bat and "\n" not in bat.replace("\r\n", "")
    assert '--folder "%~dp0."' in bat          # "%~dp0" 는 끝 역슬래시가 따옴표를 이스케이프함
    assert '"%~dp0runtime\\python.exe"' in bat and "-X utf8" in bat


def test_should_copy_excludes_dev_files():
    P = pathlib.PurePosixPath
    assert mp.should_copy(P("csmmap/server.py"))
    assert mp.should_copy(P("web/vendor/leaflet/leaflet.js"))
    for bad in ("csmmap/__pycache__/x.pyc", "tests/test_x.py", "docs/screenshots/a.png", "csmmap/x.pyc"):
        assert not mp.should_copy(P(bad)), bad


def test_readme_has_bom_crlf_and_flow():
    t = mp.readme_text("3.14.8", True)
    assert t.startswith("﻿") and "\r\n" in t
    assert "정정 요청" in t and "run_csm_map.bat" in t and "3.14.8" in t


def test_secret_scan_blocks_config_and_key_strings(tmp_path):
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "ok.js").write_text("const x = 1;", encoding="utf-8")
    assert mp.secret_scan(tmp_path) == []
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    (tmp_path / "app" / "leak.js").write_text('const k = "0123456789abcdef0123456789abcdef";', encoding="utf-8")
    found = mp.secret_scan(tmp_path)
    assert any("config.json" in f for f in found) and any("leak.js" in f for f in found)

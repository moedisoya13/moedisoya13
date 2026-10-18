"""적대적 점검: 같은 PC 의 다른 웹사이트(브라우저) 가 로컬 서버를 공격하는 시나리오."""
import json
import threading
import urllib.error
import urllib.request

import pytest

from csmmap.config import Config, ConfigError, validate_coord, validate_patch
from csmmap.export import csv_safe
from csmmap.pipeline import Pipeline
from csmmap.server import MAX_BODY, serve


@pytest.fixture
def srv(folder, regions):
    p = Pipeline(folder, regions, Config(folder), demo=True)
    p.apply_cached()
    httpd, state, port = serve(p, port=0, auto_exit=False)
    threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True).start()
    yield f"http://127.0.0.1:{port}", state
    httpd.shutdown(); httpd.server_close()


def req(url, method="GET", body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Content-Type": "application/json"} if data is not None and "Content-Type" not in (headers or {}) else {}
    h.update(headers or {})
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=5) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


# ---- 인증 ----
def test_api_requires_token(srv):
    base, state = srv
    assert req(base + "/api/state")[0] == 401
    assert req(base + "/api/quit", "POST", {})[0] == 401
    assert req(base + "/api/state", headers={"X-CSM-Token": "wrong"})[0] == 401
    st, d = req(base + "/api/state", headers={"X-CSM-Token": state.token})
    assert st == 200 and len(d["data"]["stores"]) == 12
    st, _ = req(base + f"/api/ping?t={state.token}")
    assert st == 200


def test_launch_token_is_single_use_and_exchanged(srv):
    base, state = srv
    launch = state.launch_token
    r = urllib.request.Request(base + f"/?t={launch}")
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    opener = urllib.request.build_opener(NoRedirect)
    try:
        opener.open(r, timeout=5)
        assert False, "302 expected"
    except urllib.error.HTTPError as e:
        assert e.code == 302 and e.headers["Location"] == f"/#k={state.token}"
    # 두 번째는 교환되지 않고 그냥 페이지(토큰 없음)
    with urllib.request.urlopen(base + f"/?t={launch}", timeout=5) as resp:
        assert resp.status == 200 and b"<!doctype html>" in resp.read()[:40]
    # launch 토큰으로는 API 를 못 쓴다
    assert req(base + "/api/state", headers={"X-CSM-Token": launch})[0] == 401


def test_csrf_simple_request_without_token_is_rejected(srv, folder):
    """text/plain 단순 요청은 preflight 없이 전송되지만 토큰이 없어 거부되어야 한다."""
    base, _ = srv
    st, _ = req(base + "/api/config", "POST", raw=b'{"api_key":"ATTACKER00"}',
                headers={"Content-Type": "text/plain", "Origin": "https://evil.example"})
    assert st in (401, 403)
    st, _ = req(base + "/api/config", "POST", raw=b'{"api_key":"ATTACKER00"}', headers={"Content-Type": "text/plain"})
    assert st == 401  # Origin 이 없는(비브라우저) 요청도 토큰 없이는 거부
    assert '"ATTACKER00"' not in (folder / "config.json").read_text(encoding="utf-8") if (folder / "config.json").exists() else True


def test_dns_rebinding_host_header_is_rejected(srv):
    base, state = srv
    port = base.rsplit(":", 1)[1]
    for host in ("evil.example", f"evil.example:{port}", "127.0.0.1.evil.example"):
        st, _ = req(base + "/api/state", headers={"Host": host, "X-CSM-Token": state.token})
        assert st == 403, host
        assert req(base + "/", headers={"Host": host})[0] == 403
    assert req(base + "/api/state", headers={"Host": f"localhost:{port}", "X-CSM-Token": state.token})[0] == 200


def test_foreign_origin_is_rejected_even_with_token(srv):
    base, state = srv
    st, _ = req(base + "/api/state", headers={"X-CSM-Token": state.token, "Origin": "https://evil.example"})
    assert st == 403
    st, _ = req(base + "/api/state", headers={"X-CSM-Token": state.token, "Origin": base})
    assert st == 200


def test_preflight_is_refused(srv):
    base, _ = srv
    st, _ = req(base + "/api/config", "OPTIONS", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert st == 403


# ---- 입력 검증 ----
def test_body_size_limit(srv):
    """서버는 Content-Length 만 보고 본문을 읽기 전에 거절한 뒤 연결을 닫는다. 부하가 있으면 클라이언트가
    본문을 다 보내기 전에 닫혀 400 대신 연결 끊김을 받기도 하는데, 그것도 거절이다(테스트가 가끔 깨지던 원인)."""
    base, state = srv
    raw = b'{"theme":"' + b"A" * (MAX_BODY + 10) + b'"}'
    try:
        st, d = req(base + "/api/config", "POST", raw=raw, headers={"X-CSM-Token": state.token})
    except (urllib.error.URLError, ConnectionError) as e:
        reason = getattr(e, "reason", e)
        assert isinstance(reason, (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)), e
        return
    assert st == 400


def test_config_validation_rejects_bad_values(srv):
    base, state = srv
    h = {"X-CSM-Token": state.token}
    assert req(base + "/api/config", "POST", {"api_key": "abc\r\nX-Injected: 1"}, h)[0] == 400
    assert req(base + "/api/config", "POST", {"theme": "<script>"}, h)[0] == 400
    assert req(base + "/api/config", "POST", {"presets": "notalist"}, h)[0] == 400
    st, d = req(base + "/api/config", "POST", {"theme": "dark", "junk": "x", "api_key": "abcdef1234"}, h)
    assert st == 200 and "junk" not in d["config"] and d["config"]["api_key"] == ""


def test_override_validation(srv):
    base, state = srv
    h = {"X-CSM-Token": state.token}
    sid = req(base + "/api/state", headers=h)[1]["data"]["stores"][0]["id"]
    assert req(base + "/api/override", "POST", {"id": sid, "lat": "nan", "lng": 1}, h)[0] == 400
    assert req(base + "/api/override", "POST", {"id": sid, "lat": 37.5, "lng": 999}, h)[0] == 400
    assert req(base + "/api/override", "POST", {"id": "nope", "lat": 37.5, "lng": 127.0}, h)[0] == 404
    assert req(base + "/api/override", "POST", {"id": ["x"], "lat": 37.5, "lng": 127.0}, h)[0] == 400
    assert req(base + "/api/override", "POST", {"id": sid, "lat": 37.5, "lng": 127.0}, h)[0] == 200
    assert req(base + "/api/export", "POST", {"format": "../../x"}, h)[0] == 400
    assert req(base + "/api/config", "POST", raw=b"[1,2]", headers=h)[0] == 400


def test_validate_helpers():
    with pytest.raises(ConfigError):
        validate_coord(float("inf"), 0)
    with pytest.raises(ConfigError):
        validate_patch({"aliases": {"a": "b\n"}})
    assert validate_patch({"tiles": 1, "unknown": 1}) == {"tiles": True}


# ---- 응답 헤더 / 정적 파일 ----
def test_security_headers_and_static_scope(srv):
    base, state = srv
    r = urllib.request.urlopen(base + "/", timeout=5)
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["X-Frame-Options"] == "DENY"
    assert "Python" not in r.headers.get("Server", "")
    for path in ("/../csmmap/server.py", "/..%2fcsmmap%2fserver.py", "/js/../../csm_map.py", "/data/../../tests/conftest.py"):
        assert req(base + path)[0] == 404, path


# ---- 내보내기 ----
def test_csv_formula_injection_guard():
    assert csv_safe("=1+1") == "'=1+1"
    assert csv_safe("@SUM(A1)") == "'@SUM(A1)"
    assert csv_safe("-5") == "'-5"
    assert csv_safe("정상 주소") == "정상 주소" and csv_safe(3.5) == 3.5


def test_export_html_has_no_local_path(folder, regions):
    from csmmap.export import build_html
    p = Pipeline(folder, regions, Config(folder), demo=True)
    p.geocode()
    html = build_html(p.payload(for_export=True))
    assert str(folder) not in html
    assert '"folder"' not in html


# ---- 저장 실패 안내 ----
def test_export_file_locked_gives_fix_not_traceback(srv, monkeypatch):
    """Windows 에서 같은 이름의 파일이 엑셀에 열려 있으면 PermissionError — 원인 코드 대신 해결 방법을 돌려준다."""
    import csmmap.server as server_mod
    def locked(_p):
        raise PermissionError(13, "Permission denied", r"C:\CSM\CSM_geocoded_2026-10-18.csv")
    monkeypatch.setattr(server_mod, "export_csv", locked)
    base, state = srv
    st, d = req(base + "/api/export", "POST", {"format": "csv"}, {"X-CSM-Token": state.token})
    assert st == 409 and d["code"] == "file_locked"
    assert "CSM_geocoded_2026-10-18.csv" in d["error"] and "닫고 다시" in d["error"]
    assert "Errno" not in d["error"] and "PermissionError" not in d["error"]


def test_export_disk_error_is_friendly(srv, monkeypatch):
    import errno
    import csmmap.server as server_mod
    def full(_p):
        raise OSError(errno.ENOSPC, "No space left on device")
    monkeypatch.setattr(server_mod, "export_html", full)
    base, state = srv
    st, d = req(base + "/api/export", "POST", {"format": "html"}, {"X-CSM-Token": state.token})
    assert st == 500 and d["code"] == "io" and "저장 공간" in d["error"]

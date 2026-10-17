import json
import threading
import urllib.request

import pytest

from csmmap.config import Config
from csmmap.pipeline import Pipeline
from csmmap.server import serve


@pytest.fixture
def server(folder, regions):
    p = Pipeline(folder, regions, Config(folder), demo=True)
    p.apply_cached()
    httpd, state, port = serve(p, port=0, auto_exit=False)
    TOKEN["token"] = state.token
    t = threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{port}", state
    httpd.shutdown(); httpd.server_close()


TOKEN = {"token": ""}


def get(url):
    req = urllib.request.Request(url, headers={"X-CSM-Token": TOKEN["token"]})
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "X-CSM-Token": TOKEN["token"]}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.status, json.loads(r.read())


def test_state_and_static(server):
    base, _ = server
    st, ctype, body = get(base + "/api/state")
    d = json.loads(body)
    assert st == 200 and d["data"]["meta"]["geocoded"] is False and len(d["data"]["stores"]) == 12
    assert d["config"]["has_key"] is False
    st, ctype, body = get(base + "/")
    assert st == 200 and "text/html" in ctype and b"CSM:INLINE" in body
    st, ctype, _ = get(base + "/js/app.js")
    assert st == 200 and "javascript" in ctype


def test_path_traversal_blocked(server):
    base, _ = server
    with pytest.raises(urllib.error.HTTPError) as e:
        get(base + "/../csmmap/server.py")
    assert e.value.code == 404


def test_scan_geocode_export(server):
    base, state = server
    st, r = post(base + "/api/scan", {})
    assert st == 200 and len(r["data"]["stores"]) == 12
    st, r = post(base + "/api/geocode", {})
    assert st == 202 and r["started"] is True
    state.job.join(timeout=10)
    assert state.job_status["running"] is False and state.job_status["done"] == 16  # 거래처 12(빈 주소 포함) + 주소 있는 대리점 4
    st, r = post(base + "/api/export", {"format": "csv"})
    assert st == 200 and r["name"].startswith("CSM_geocoded_")
    st, r = post(base + "/api/config", {"theme": "dark", "api_key": "abcdef0123456789", "junk": 1})
    assert r["config"]["theme"] == "dark" and r["config"]["has_key"] is True and r["config"]["api_key"] == ""
    assert "junk" not in r["config"]


def test_ping_marks_alive(server):
    base, state = server
    assert state.last_ping is None
    st, _, body = get(base + "/api/ping")
    assert st == 200 and state.last_ping is not None

"""로컬 HTTP 서버 — 정적 web/ 서빙 + /api/* + SSE 진행률 + 하트비트 자동 종료.

표준 라이브러리만 사용한다. 127.0.0.1 에만 바인딩하며, 브라우저 창이 닫혀 하트비트(/api/ping)가
끊기면 스스로 종료한다 (자동 종료는 --keep-alive 로 끌 수 있다).

보안 모델 — 같은 PC 의 브라우저에 열린 *다른* 웹사이트가 공격자다:
  * 모든 /api/* 는 기동 때 만든 세션 토큰(X-CSM-Token 헤더 또는 ?t=)이 있어야 한다.
    앱 창을 여는 URL 에는 **1회용 launch 토큰**만 들어간다(프로세스 인자로 노출되므로). 서버는 그것을
    한 번 받으면 폐기하고 세션 토큰을 URL fragment(#k=) 로 넘겨 주며, 페이지는 sessionStorage 로 옮긴 뒤 지운다.
    → 다른 사이트는 토큰을 모르므로 CSRF(단순 요청) 가 통하지 않고, 커스텀 헤더는 preflight 를 유발해 차단된다.
  * Host 헤더가 127.0.0.1/localhost 가 아니면 거부 → DNS 리바인딩으로 같은 출처가 되어도 읽을 수 없다.
  * Origin 헤더가 있으면 우리 출처여야 한다. 요청 본문은 1MB 까지. 응답에 CSP·nosniff·frame-ancestors 'none'.
"""
from __future__ import annotations

import hmac
import json
import mimetypes
import pathlib
import queue
import secrets
import threading
import time
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import __version__
from .config import ConfigError
from .export import export_csv, export_html
from .pipeline import Pipeline

WEB_DIR = pathlib.Path(__file__).resolve().parents[1] / "web"
PING_TIMEOUT = 45.0          # 초. 이 시간 동안 핑이 없으면 종료
MAX_BODY = 1_000_000         # 요청 본문 상한(바이트)
ALLOWED_HOSTS = ("127.0.0.1", "localhost", "[::1]")
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://*.basemaps.cartocdn.com; "
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"
)
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/json", ".json")


class AppState:
    def __init__(self, pipeline: Pipeline, auto_exit: bool = True):
        self.pipeline = pipeline
        self.auto_exit = auto_exit
        self.token = secrets.token_urlsafe(24)          # 세션 토큰: /api/* 에 필요
        self.launch_token: str | None = secrets.token_urlsafe(24)  # 1회용: 창을 여는 URL 에만
        self.subscribers: list[queue.Queue] = []
        self.sub_lock = threading.Lock()
        self.job: threading.Thread | None = None
        self.job_status: dict = {"running": False, "done": 0, "total": 0}
        self.last_ping: float | None = None
        self.server: ThreadingHTTPServer | None = None
        self.port: int = 0
        self.started = time.monotonic()

    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/?t={self.launch_token}"

    def consume_launch(self, supplied: str) -> bool:
        if self.launch_token and hmac.compare_digest(supplied, self.launch_token):
            self.launch_token = None
            return True
        return False

    # ---- SSE ----
    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        with self.sub_lock:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self.sub_lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def broadcast(self, event: str, data: dict) -> None:
        with self.sub_lock:
            subs = list(self.subscribers)
        for q in subs:
            q.put((event, data))

    # ---- 지오코딩 작업 ----
    def start_geocode(self, force: bool = False) -> bool:
        if self.job and self.job.is_alive():
            return False
        self.job_status = {"running": True, "done": 0, "total": 0}

        def progress(done, total, id_, res):
            self.job_status.update(done=done, total=total)
            self.broadcast("progress", {"done": done, "total": total, "id": id_,
                                        "precision": res.precision, "ok": res.ok()})

        def run():
            try:
                self.pipeline.geocode(progress=progress, force=force)
                self.broadcast("done", {"data": self.pipeline.payload()})
            except Exception as exc:  # 작업 스레드 예외는 UI 로 전달
                traceback.print_exc()
                self.broadcast("error", {"message": f"{exc.__class__.__name__}: {exc}"})
            finally:
                self.job_status["running"] = False

        self.job = threading.Thread(target=run, daemon=True, name="geocode")
        self.job.start()
        return True

    # ---- 종료 ----
    def shutdown(self) -> None:
        if self.server:
            threading.Thread(target=self.server.shutdown, daemon=True).start()

    def watchdog(self) -> None:
        while True:
            time.sleep(5)
            if not self.auto_exit or self.last_ping is None:
                continue
            if time.monotonic() - self.last_ping > PING_TIMEOUT and not self.job_status["running"]:
                print("브라우저 창이 닫혀 종료합니다.")
                self.shutdown()
                return


class BadRequest(ValueError):
    pass


def make_handler(state: AppState):
    class Handler(BaseHTTPRequestHandler):
        server_version = f"csm-map/{__version__}"
        sys_version = ""  # 파이썬 버전 노출 안 함

        # ---- 로그: 토큰이 섞일 수 있는 쿼리는 지운다 ----
        def log_message(self, fmt, *args):
            if args and "/api/ping" in str(args[0]):
                return
            args = tuple(a.split("?", 1)[0] if isinstance(a, str) and "?t=" in a else a for a in args)
            super().log_message(fmt, *args)

        # ---- helpers ----
        def _headers(self, extra: dict | None = None):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)

        def _json(self, obj, status=HTTPStatus.OK):
            body = json.dumps(obj, ensure_ascii=False, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self._headers({"Content-Type": "application/json; charset=utf-8", "Content-Length": str(len(body))})
            self.end_headers()
            self.wfile.write(body)

        def _deny(self, status=HTTPStatus.FORBIDDEN, msg="forbidden"):
            self._json({"error": msg}, status)

        def _host_ok(self) -> bool:
            host = (self.headers.get("Host") or "").strip().lower()
            name = host.rsplit(":", 1)[0] if not host.startswith("[") or "]:" in host else host
            if name.startswith("[") and "]:" in host:
                name = host.split("]:")[0] + "]"
            return name in ALLOWED_HOSTS

        def _origin_ok(self) -> bool:
            origin = self.headers.get("Origin")
            if origin is None or origin == "null":
                return origin is None
            o = urlparse(origin)
            return o.scheme == "http" and o.hostname in ("127.0.0.1", "localhost", "::1") and o.port == state.port

        def _token_ok(self, query: dict) -> bool:
            supplied = self.headers.get("X-CSM-Token") or (query.get("t") or [""])[0]
            return bool(supplied) and hmac.compare_digest(supplied, state.token)

        def _body(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                raise BadRequest("요청 본문이 너무 큽니다")
            if not n:
                return {}
            try:
                data = json.loads(self.rfile.read(n).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise BadRequest("JSON 본문이 아닙니다") from exc
            if not isinstance(data, dict):
                raise BadRequest("객체가 아닙니다")
            return data

        def _static(self, rel: str):
            try:
                path = (WEB_DIR / rel).resolve()
                path.relative_to(WEB_DIR)
            except (ValueError, OSError):
                return self._deny(HTTPStatus.NOT_FOUND, "not found")
            if not path.is_file():
                return self._deny(HTTPStatus.NOT_FOUND, "not found")
            ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
            if ctype.startswith("text/") or "javascript" in ctype or "json" in ctype:
                ctype += "; charset=utf-8"
            data = path.read_bytes()
            self.send_response(HTTPStatus.OK)
            extra = {"Content-Type": ctype, "Content-Length": str(len(data))}
            if ctype.startswith("text/html"):
                extra["Content-Security-Policy"] = CSP
            self._headers(extra)
            self.end_headers()
            self.wfile.write(data)

        def _gate(self, api: bool) -> dict | None:
            """공통 검문. 통과하면 쿼리 dict, 아니면 응답을 보내고 None."""
            if not self._host_ok() or not self._origin_ok():
                self._deny(); return None
            url = urlparse(self.path)
            query = parse_qs(url.query)
            if api and not self._token_ok(query):
                self._deny(HTTPStatus.UNAUTHORIZED, "토큰이 없거나 틀립니다 — 앱을 다시 실행하세요"); return None
            return query

        def do_OPTIONS(self):  # CORS preflight 는 항상 거부(헤더 없음)
            self._deny()

        # ---- GET ----
        def do_GET(self):
            p = urlparse(self.path).path
            is_api = p.startswith("/api/")
            query = self._gate(is_api)
            if query is None:
                return None
            if p == "/":
                t = (query.get("t") or [""])[0]
                if t and (state.consume_launch(t) or hmac.compare_digest(t, state.token)):
                    # launch 토큰 → 세션 토큰 교환. fragment 는 서버 로그·프로세스 인자에 남지 않는다
                    self.send_response(HTTPStatus.FOUND)
                    self._headers({"Location": f"/#k={state.token}", "Content-Length": "0"})
                    self.end_headers()
                    return None
                return self._static("index.html")
            if p == "/api/state":
                return self._json({
                    "version": __version__,
                    "config": state.pipeline.config.public(),
                    "data": state.pipeline.payload(),
                    "job": state.job_status,
                })
            if p == "/api/ping":
                state.last_ping = time.monotonic()
                return self._json({"ok": True, "job": state.job_status})
            if p == "/api/events":
                return self._sse()
            if is_api:
                return self._deny(HTTPStatus.NOT_FOUND, "not found")
            return self._static(p.lstrip("/"))

        def _sse(self):
            q = state.subscribe()
            try:
                self.send_response(HTTPStatus.OK)
                self._headers({"Content-Type": "text/event-stream; charset=utf-8", "Connection": "keep-alive"})
                self.end_headers()
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
                while True:
                    try:
                        event, data = q.get(timeout=15)
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                        continue
                    payload = json.dumps(data, ensure_ascii=False, allow_nan=False)
                    self.wfile.write(f"event: {event}\ndata: {payload}\n\n".encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
                pass
            finally:
                state.unsubscribe(q)

        # ---- POST ----
        def do_POST(self):
            p = urlparse(self.path).path
            if self._gate(True) is None:
                return None
            try:
                body = self._body()
                if p == "/api/scan":
                    state.pipeline.rescan()
                    state.pipeline.apply_cached()
                    return self._json({"data": state.pipeline.payload()})
                if p == "/api/geocode":
                    started = state.start_geocode(force=bool(body.get("force")))
                    return self._json({"started": started, "job": state.job_status}, HTTPStatus.ACCEPTED)
                if p == "/api/config":
                    state.pipeline.config.update(body)
                    if "api_key" in body:
                        state.pipeline.geocoded = False
                    return self._json({"config": state.pipeline.config.public()})
                if p == "/api/override":
                    sid = body.get("id")
                    if not isinstance(sid, str) or len(sid) > 64:
                        raise BadRequest("id")
                    if body.get("clear"):
                        state.pipeline.clear_override(sid)
                    else:
                        state.pipeline.set_override(sid, body.get("lat"), body.get("lng"))
                    return self._json({"data": state.pipeline.payload()})
                if p == "/api/export":
                    fmt = body.get("format", "html")
                    if fmt not in ("html", "csv"):
                        raise BadRequest("format")
                    out = export_csv(state.pipeline) if fmt == "csv" else export_html(state.pipeline)
                    return self._json({"path": str(out), "name": out.name})
                if p == "/api/quit":
                    self._json({"ok": True})
                    state.shutdown()
                    return None
                return self._deny(HTTPStatus.NOT_FOUND, "not found")
            except (BadRequest, ConfigError, ValueError) as exc:
                return self._json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except KeyError as exc:
                return self._json({"error": f"없는 항목: {exc}"}, HTTPStatus.NOT_FOUND)
            except Exception as exc:
                traceback.print_exc()
                return self._json({"error": f"{exc.__class__.__name__}: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    return Handler


def serve(pipeline: Pipeline, port: int = 0, auto_exit: bool = True) -> tuple[ThreadingHTTPServer, AppState, int]:
    state = AppState(pipeline, auto_exit=auto_exit)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(state))
    httpd.daemon_threads = True
    state.server = httpd
    state.port = httpd.server_address[1]
    threading.Thread(target=state.watchdog, daemon=True, name="watchdog").start()
    return httpd, state, state.port

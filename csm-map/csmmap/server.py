"""로컬 HTTP 서버 — 정적 web/ 서빙 + /api/* + SSE 진행률 + 하트비트 자동 종료.

표준 라이브러리만 사용한다. 127.0.0.1 에만 바인딩하며, 브라우저 창이 닫혀 하트비트(/api/ping)가
끊기면 스스로 종료한다 (자동 종료는 --keep-alive 로 끌 수 있다).
"""
from __future__ import annotations

import json
import mimetypes
import pathlib
import queue
import threading
import time
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from . import __version__
from .export import export_csv, export_html
from .pipeline import Pipeline

WEB_DIR = pathlib.Path(__file__).resolve().parents[1] / "web"
PING_TIMEOUT = 45.0  # 초. 이 시간 동안 핑이 없으면 종료
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/json", ".json")


class AppState:
    def __init__(self, pipeline: Pipeline, auto_exit: bool = True):
        self.pipeline = pipeline
        self.auto_exit = auto_exit
        self.subscribers: list[queue.Queue] = []
        self.sub_lock = threading.Lock()
        self.job: threading.Thread | None = None
        self.job_status: dict = {"running": False, "done": 0, "total": 0}
        self.last_ping: float | None = None
        self.server: ThreadingHTTPServer | None = None
        self.started = time.monotonic()

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


def make_handler(state: AppState):
    class Handler(BaseHTTPRequestHandler):
        server_version = f"csm-map/{__version__}"

        def log_message(self, fmt, *args):  # 조용히
            if args and "/api/ping" in str(args[0]):
                return
            super().log_message(fmt, *args)

        # ---- helpers ----
        def _json(self, obj, status=HTTPStatus.OK):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _body(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            if not n:
                return {}
            return json.loads(self.rfile.read(n).decode("utf-8"))

        def _static(self, rel: str):
            path = (WEB_DIR / rel).resolve()
            if not str(path).startswith(str(WEB_DIR)) or not path.is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
            data = path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or "javascript" in ctype or "json" in ctype else ""))
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)

        # ---- GET ----
        def do_GET(self):
            url = urlparse(self.path)
            p = url.path
            if p == "/":
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
            return self._static(p.lstrip("/"))

        def _sse(self):
            q = state.subscribe()
            try:
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "keep-alive")
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
                    payload = json.dumps(data, ensure_ascii=False)
                    self.wfile.write(f"event: {event}\ndata: {payload}\n\n".encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                state.unsubscribe(q)

        # ---- POST ----
        def do_POST(self):
            p = urlparse(self.path).path
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
                    if body.get("clear"):
                        state.pipeline.clear_override(body["id"])
                    else:
                        state.pipeline.set_override(body["id"], float(body["lat"]), float(body["lng"]))
                    return self._json({"data": state.pipeline.payload()})
                if p == "/api/export":
                    fmt = body.get("format", "html")
                    out = export_csv(state.pipeline) if fmt == "csv" else export_html(state.pipeline)
                    return self._json({"path": str(out), "name": out.name})
                if p == "/api/quit":
                    self._json({"ok": True})
                    state.shutdown()
                    return None
                return self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            except Exception as exc:
                traceback.print_exc()
                return self._json({"error": f"{exc.__class__.__name__}: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    return Handler


def serve(pipeline: Pipeline, port: int = 0, auto_exit: bool = True) -> tuple[ThreadingHTTPServer, AppState, int]:
    state = AppState(pipeline, auto_exit=auto_exit)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(state))
    httpd.daemon_threads = True
    state.server = httpd
    threading.Thread(target=state.watchdog, daemon=True, name="watchdog").start()
    return httpd, state, httpd.server_address[1]

"""CSM 거래처 지도 — 진입점.

같은 폴더의 *.xlsx(B 대리점명·C 거래처명·D 주소 / H 대리점명·I 주소) 를 읽어 지오코딩하고,
구(區) 단위 지도 위에 거래처·대리점을 시각화하는 로컬 미니 앱을 띄운다.

  python csm_map.py                  # 이 파일(또는 exe)이 있는 폴더의 xlsx 로 앱 창 열기
  python csm_map.py --folder D:\\CSM  # 다른 폴더
  python csm_map.py --demo           # 카카오 키 없이 근사 좌표로 미리보기
  python csm_map.py --export-only    # 창 없이 단독 HTML 만 생성
  python csm_map.py --no-browser --port 8765 --keep-alive   # 개발/테스트용
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import threading
import time

from csmmap import __version__
from csmmap.config import Config
from csmmap.export import export_html
from csmmap.launcher import open_app_window
from csmmap.pipeline import Pipeline
from csmmap.regions import RegionIndex
from csmmap.server import serve


def default_folder() -> pathlib.Path:
    if getattr(sys, "frozen", False):  # PyInstaller exe 옆
        return pathlib.Path(sys.executable).resolve().parent
    return pathlib.Path(__file__).resolve().parent


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="CSM 거래처 지도 미니 앱", formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--folder", type=pathlib.Path, default=default_folder(), help="xlsx 가 있는 폴더 (기본: 앱 위치)")
    ap.add_argument("--port", type=int, default=0, help="고정 포트 (기본: 자동)")
    ap.add_argument("--demo", action="store_true", help="API 호출 없이 시군구 중심 근사 좌표로 표시")
    ap.add_argument("--no-browser", action="store_true", help="브라우저를 열지 않음")
    ap.add_argument("--keep-alive", action="store_true", help="브라우저가 닫혀도 서버 유지")
    ap.add_argument("--export-only", action="store_true", help="단독 HTML 만 만들고 종료")
    ap.add_argument("--version", action="version", version=f"csm-map {__version__}")
    args = ap.parse_args(argv)

    folder: pathlib.Path = args.folder.resolve()
    if not folder.is_dir():
        print(f"폴더가 없습니다: {folder}", file=sys.stderr)
        return 2

    config = Config(folder)  # 키는 설정 화면(⚙) 또는 환경변수 KAKAO_REST_API_KEY 로 — 명령줄 인자는 셸 기록에 남으므로 받지 않는다
    regions = RegionIndex.load()
    pipeline = Pipeline(folder, regions, config, demo=args.demo)
    print(f"csm-map {__version__} · 폴더: {folder}")
    print(f"  파일 {len(pipeline.dataset.files)}개 · 거래처 {len(pipeline.dataset.stores)} · 대리점 {len(pipeline.dataset.dealers)}"
          f" · 모드: {'데모(근사)' if pipeline.demo or not config.api_key else 'Kakao'}")
    for w in pipeline.dataset.warnings:
        print("  !", w)

    if args.export_only:
        def progress(done, total, *_):
            print(f"\r  지오코딩 {done}/{total}", end="", flush=True)
        pipeline.geocode(progress=progress)
        print()
        out = export_html(pipeline)
        print(f"  → {out}")
        return 0

    pipeline.apply_cached()
    httpd, state, port = serve(pipeline, port=args.port, auto_exit=not (args.keep_alive or args.no_browser))
    url = state.url()  # 1회용 launch 토큰이 붙은 주소 — 처음 여는 창 하나만 API 를 쓸 수 있다
    print(f"  서버: http://127.0.0.1:{port}/")
    if args.no_browser:
        print(f"  브라우저로 열기(1회용 주소): {url}")

    # 키가 있거나 데모면 기동과 함께 지오코딩 시작 — UI 는 SSE 로 진행률을 받는다
    if pipeline.demo or config.api_key:
        threading.Timer(0.5, state.start_geocode).start()

    if not args.no_browser:
        how = open_app_window(url)
        print("  창:", "앱 모드" if how == "app" else "기본 브라우저")

    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        time.sleep(0.1)
    return 0


if __name__ == "__main__":
    sys.exit(main())

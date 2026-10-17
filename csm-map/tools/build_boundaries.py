"""시군구 경계 TopoJSON 생성기 (개발용, 런타임에는 쓰이지 않음).

원본: vuski/admdongkor 행정동 경계 GeoJSON (통계청 행정구역 경계를 가공한 공개 데이터).
  https://github.com/vuski/admdongkor  → ver{VERSION}/HangJeongDong_ver{VERSION}.geojson (약 34MB)

처리는 デジタル庁 policy-dashboard-assets 의 행정구역 폴리곤 가공 방식을 따른다:
  1. 면적 5만㎡ 미만 소섬·방파제 제거  (-filter-islands)
  2. 기초단체(시군구) 단위로 결합         (-dissolve sgg)
  3. 단순화·양자화로 경량화                (-simplify, TopoJSON quantization)
결과: web/data/boundaries.json  (objects: sgg 시군구 / sido 시도 / labels 시군구 내부 라벨점)

사용:
  python tools/build_boundaries.py                 # 다운로드 후 생성
  python tools/build_boundaries.py --source x.geojson   # 이미 받은 파일 사용
요구: node + npx (mapshaper 는 npx 로 자동 설치)
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import urllib.request

VERSION = "20261001"
SOURCE_URL = (
    "https://raw.githubusercontent.com/vuski/admdongkor/master/"
    f"ver{VERSION}/HangJeongDong_ver{VERSION}.geojson"
)
OUT = pathlib.Path(__file__).resolve().parents[1] / "web" / "data" / "boundaries.json"
SIMPLIFY = "5%"


def download(dst: pathlib.Path) -> None:
    print(f"다운로드: {SOURCE_URL}")
    with urllib.request.urlopen(SOURCE_URL, timeout=120) as resp, dst.open("wb") as fh:
        shutil.copyfileobj(resp, fh)
    print(f"  → {dst} ({dst.stat().st_size/1e6:.1f} MB)")


def run_mapshaper(src: pathlib.Path, out: pathlib.Path, npm_prefix: str | None) -> None:
    cmd = ["npx"]
    if npm_prefix:
        cmd += ["--prefix", npm_prefix]
    cmd += [
        "mapshaper", "-i", str(src), "name=dong",
        "-filter-islands", "min-area=50000m2", "remove-empty",
        "-dissolve", "sgg", "copy-fields=sidonm,sggnm,sido", "name=sgg",
        "-simplify", "visvalingam", "weighted", SIMPLIFY, "keep-shapes",
        "-clean",
        "-dissolve", "sido", "copy-fields=sidonm", "name=sido", "+",
        "-points", "inner", "name=labels", "+", "target=sgg",
        "-o", "target=sgg,sido,labels", "format=topojson", "quantization=1e5", str(out),
    ]
    print("mapshaper:", " ".join(cmd))
    subprocess.run(cmd, check=True)


def annotate(out: pathlib.Path) -> None:
    """메타 정보(출처·버전)를 TopoJSON 최상위에 기록하고 요약을 출력한다."""
    data = json.loads(out.read_text(encoding="utf-8"))
    data["meta"] = {
        "version": VERSION,
        "source": "vuski/admdongkor (통계청 행정구역 경계 가공)",
        "source_url": SOURCE_URL,
        "processing": "filter-islands 50000m2, dissolve sgg/sido, visvalingam " + SIMPLIFY + ", quantization 1e5",
    }
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    objs = data["objects"]
    print(f"완료: {out} ({out.stat().st_size/1024:.0f} KB)")
    for name, layer in objs.items():
        print(f"  {name}: {len(layer['geometries'])} features")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", help="이미 내려받은 행정동 GeoJSON 경로")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--npm-prefix", help="mapshaper 가 설치된 npm prefix (없으면 npx 가 내려받음)")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(args.source) if args.source else pathlib.Path(tmp) / "dong.geojson"
        if not args.source:
            download(src)
        run_mapshaper(src, out, args.npm_prefix)
    annotate(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())

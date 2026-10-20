#!/usr/bin/env python3
"""ComfyUI-MangaScreen 을 ComfyUI 없이 돌린다: 그레이스케일 원화 → 흑백 만화 원고.

노드 소스(github.com/ashukae/ComfyUI-MangaScreen)를 고정 커밋으로 받아, 그 안의 함수를
그대로 부른다. 알고리즘을 다시 구현하지 않으므로 결과가 ComfyUI 의 워크플로우와 같다.

    python manga_screen.py gen.png                       # 그레이스케일 원화 → manga-out/gen_manga.png
    python manga_screen.py *.png --params series.json    # 한 번 맞춘 값을 시리즈 전체에 고정 적용
    python manga_screen.py gen.png --report              # 톤 면적 + 설정 민감도만 출력
    python manga_screen.py color.png --preset lite       # 컬러 원화: Manga Levels 를 먼저 거침

처리 순서는 워크플로우(workflows/Manga-Lite.json)와 같다:
    작업 크기 2MP(lanczos, 32배수) → [Manga Levels] → Manga Finish → Manga Panel

의존성: numpy, opencv-python(-headless), Pillow. torch 는 필요 없다 — 노드 모듈은 ComfyUI
텐서를 주고받을 때만 torch 를 쓰고, 여기서 부르는 함수들은 numpy 배열만 다룬다.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import pathlib
import subprocess
import sys
import types

import cv2
import numpy as np
from PIL import Image, ImageOps

REPO = "https://github.com/ashukae/ComfyUI-MangaScreen"
PINNED = "d0eb8dcc6c45274e3eee118ff0dabe05b56039b9"  # v0.2.1, 이 커밋으로 검증함

# 워크플로우(QWEN-Manga.json / Manga-Lite.json)에 저장된 값. README 표의 기본값과 다른 곳은
# screen_lines 하나(README 200, 워크플로우 250)이고, 워크플로우 쪽을 따른다.
DEFAULTS = {
    "megapixels": 2.0,
    "levels": None,            # [black, white, gamma] 또는 None(건너뜀)
    "screen_lines": 250,
    "white_point": 0.80,
    "black_point": 0.30,
    "light_tone": 0.18,
    "dark_tone": 0.42,
    "gradation": 1.0,
    "pen_threshold": 0.30,
    "white_lines": 0.4,
    "panel": "original",       # None 이면 Manga Panel 을 건너뛴다
    "crop_x": 0.5,
    "crop_y": 0.4,
    "border": 5,
    "margin": 60,
    "paper": "white",
    "ink": 0.5,
}
PRESETS = {
    # 처음부터 그레이스케일로 생성한 원화: 명암이 이미 정리돼 있어 Levels 없이 바로 Finish.
    "gray": {},
    # 컬러 일러스트(Manga-Lite 워크플로우): 밝게 끌어올려 피부·밝은 색을 종이로 보낸다.
    "lite": {"levels": [0.20, 0.70, 1.3]},
}


# ── 노드 소스 ────────────────────────────────────────────────────────────────

def node_source(src: str | None) -> pathlib.Path:
    """--src > $MANGASCREEN_SRC > 캐시(없으면 고정 커밋을 받아 둔다)."""
    if src or os.environ.get("MANGASCREEN_SRC"):
        path = pathlib.Path(src or os.environ["MANGASCREEN_SRC"]).expanduser()
        if not (path / "__init__.py").exists():
            sys.exit(f"ComfyUI-MangaScreen 소스가 아님: {path}")
        return path
    cache = pathlib.Path(os.environ.get("XDG_CACHE_HOME", "~/.cache")).expanduser()
    path = cache / "manga-screen" / f"ComfyUI-MangaScreen-{PINNED[:7]}"
    if (path / "__init__.py").exists():
        return path
    path.mkdir(parents=True, exist_ok=True)
    git = ["git", "-C", str(path)]
    try:
        subprocess.run([*git, "init", "-q"], check=True)
        subprocess.run([*git, "fetch", "-q", "--depth", "1", REPO, PINNED], check=True)
        subprocess.run([*git, "checkout", "-q", "FETCH_HEAD"], check=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        sys.exit(f"소스를 받지 못함({e}). git clone {REPO} 후 --src 로 경로를 넘겨 주세요.")
    return path


def load_node(src: pathlib.Path) -> types.ModuleType:
    if importlib.util.find_spec("torch") is None:
        # 모듈 맨 위의 `import torch` 만 통과시키면 된다. 여기서 쓰는 함수는 torch 를 부르지 않는다.
        sys.modules["torch"] = types.ModuleType("torch")
    spec = importlib.util.spec_from_file_location("comfyui_mangascreen", src / "__init__.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── 워크플로우 단계 ──────────────────────────────────────────────────────────

def working_size(img: Image.Image, megapixels: float) -> Image.Image:
    """ImageScaleToTotalPixels(lanczos, megapixels, resolution_steps=32) 와 같은 크기."""
    if not megapixels:
        return img
    scale = math.sqrt(megapixels * 1024 * 1024 / (img.width * img.height))
    w = round(img.width * scale / 32) * 32
    h = round(img.height * scale / 32) * 32
    return img.resize((w, h), Image.LANCZOS)


def manga_levels(rgb: np.ndarray, black: float, white: float, gamma: float) -> np.ndarray:
    """MangaLevels 노드를 numpy 로 옮긴 것(노드 쪽은 torch 텐서 연산 3줄)."""
    f = rgb.astype(np.float32) / 255
    g = f @ np.float32([0.299, 0.587, 0.114])
    g = np.clip((g - black) / max(white - black, 1e-3), 0, 1) ** (1 / gamma)
    return np.repeat((g * 255).clip(0, 255).astype(np.uint8)[..., None], 3, axis=2)


def pen_map(path: str, shape: tuple[int, int]) -> np.ndarray:
    """흰 선/검은 바탕 선화(Manga Lineart 출력)를 선 강도 0..1 로."""
    m = np.asarray(Image.open(path).convert("RGB"), np.float32).mean(-1) / 255
    return cv2.resize(m, (shape[1], shape[0]), interpolation=cv2.INTER_AREA)


def manga_panel(node, white_page: np.ndarray, p: dict) -> np.ndarray:
    """MangaPanel 노드와 같은 처리. white_page: True = 종이."""
    page = ~white_page
    k = page.shape[1] / 1024
    border = round(p["border"] * k)
    if p["border"] and not border:
        border = 1      # 작은 그림에서 0 으로 반올림되면 upstream cut_panel 이 컷 전체를 칠한다
    margin = round(p["margin"] * k)
    if border:
        framed = node.cut_panel(page, node.FRAMES[p["panel"]], p["crop_x"], p["crop_y"], border, margin)
    else:               # 같은 이유(p[-0:] 은 배열 전체)로 테두리 없음은 직접 자른다
        framed = np.pad(page_crop(page, node.FRAMES[p["panel"]], p["crop_x"], p["crop_y"]), margin)
    return np.clip(node.print_look(framed, p["paper"], p["ink"], k), 0, 255).astype(np.uint8)


def page_crop(page, ratio, x, y):
    """cut_panel 의 자르기 부분만(테두리 없이)."""
    h, w = page.shape
    cw, ch = (w, h) if ratio is None else ((w, round(w / ratio)) if w / h <= ratio else (round(h * ratio), h))
    cw, ch = min(cw, w), min(ch, h)
    x0, y0 = round((w - cw) * x), round((h - ch) * y)
    return page[y0:y0 + ch, x0:x0 + cw]


# ── 톤 계획 리포트: "설정의 감도가 높다" 를 숫자로 ──────────────────────────────

def tone_report(node, rgb: np.ndarray, p: dict, delta: float = 0.03) -> dict:
    """네 면(종이/옅은 톤/짙은 톤/베타)의 면적과, white/black_point 를 ±delta 움직였을 때
    면이 바뀌는 픽셀 비율. 이 비율이 크면 원화의 명암이 문턱값 근처에 몰려 있다는 뜻이라,
    값을 고정해 두고 쓰려면 원화 쪽 명암을 먼저 안정시켜야 한다."""
    L = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    k = L.shape[1] / 1024
    V = node.value_map(L, node.ink_layer(L, k), k)

    def plan(white, black):
        return node.tone_plan(V, k, white, (white + black) / 2, black)

    w, b = p["white_point"], p["black_point"]
    base = plan(w, b)
    share = np.bincount(base.ravel(), minlength=4) / base.size
    flip = {f"{name}{sign}{delta:g}": float((plan(*args) != base).mean())
            for name, sign, args in [("white_point", "-", (w - delta, b)), ("white_point", "+", (w + delta, b)),
                                     ("black_point", "-", (w, b - delta)), ("black_point", "+", (w, b + delta))]}
    return {"area": dict(zip(["paper", "light_tone", "dark_tone", "beta"], map(float, share))), "flip": flip}


def print_report(name: str, r: dict) -> None:
    area = "  ".join(f"{k} {v:5.1%}" for k, v in r["area"].items())
    flip = "  ".join(f"{k} → {v:5.1%}" for k, v in r["flip"].items())
    worst = max(r["flip"].values())
    # 대략의 기준: 게시물 원화(최대 16%)가 '민감', 같은 그림에 Levels 를 건 것(5.7%)이 '보통'
    verdict = "안정" if worst < 0.03 else "보통" if worst < 0.08 else "민감 — 원화 명암을 먼저 고정하세요"
    print(f"{name}\n  면적  {area}\n  변동  {flip}\n  판정  {verdict} (최대 {worst:.1%})")


# ── CLI ──────────────────────────────────────────────────────────────────────

def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("inputs", nargs="+", help="원화 이미지 경로")
    ap.add_argument("-o", "--out-dir", default="manga-out")
    ap.add_argument("--preset", choices=PRESETS, default="gray",
                    help="gray: 그레이스케일로 생성한 원화(기본). lite: 컬러 원화, Manga Levels 를 먼저 적용")
    ap.add_argument("--params", help="고정 파라미터 JSON(--save-params 로 만든 것). 프리셋 위에 덮어쓰고, 명시한 옵션이 그 위에 덮어쓴다")
    ap.add_argument("--save-params", help="이번에 쓴 파라미터를 JSON 으로 저장")
    ap.add_argument("--src", help="ComfyUI-MangaScreen 체크아웃 경로(기본: 고정 커밋을 캐시에 받음)")
    ap.add_argument("--pen", help="펜 선 맵(흰 선/검은 바탕, 예: Manga Lineart 출력). 입력이 여러 개면 쓰지 않음")
    ap.add_argument("--report", action="store_true", help="이미지를 쓰지 않고 톤 면적과 설정 민감도만 출력")
    ap.add_argument("--compare", action="store_true", help="원화|결과 나란히 붙인 _compare.png 도 저장")
    g = ap.add_argument_group("파라미터(기본값은 워크플로우와 같음)")
    g.add_argument("--megapixels", type=float, help="작업 크기. 0 이면 원본 크기 그대로(그때는 --screen-lines 를 폭/5 이하로)")
    g.add_argument("--levels", type=lambda s: [float(x) for x in s.split(",")], metavar="B,W,G",
                   help="Manga Levels black,white,gamma 를 먼저 적용")
    g.add_argument("--no-levels", dest="levels", action="store_const", const="off", help="Levels 건너뜀")
    for key in ("screen_lines",):
        g.add_argument("--" + key.replace("_", "-"), type=int)
    for key in ("white_point", "black_point", "light_tone", "dark_tone", "gradation", "pen_threshold",
                "white_lines", "crop_x", "crop_y", "ink"):
        g.add_argument("--" + key.replace("_", "-"), type=float)
    for key in ("border", "margin"):
        g.add_argument("--" + key, type=int)
    g.add_argument("--panel", help="original / '4:3 wide' / '16:9 wide' / '3:4 tall' / 1:1")
    g.add_argument("--no-panel", dest="panel", action="store_const", const="off", help="Manga Panel 건너뜀(순수 흑백 2값)")
    g.add_argument("--paper", choices=["white", "off-white", "cream"])
    return ap.parse_args(argv)


def resolve_params(args) -> dict:
    p = dict(DEFAULTS) | PRESETS[args.preset]
    if args.params:
        p |= json.loads(pathlib.Path(args.params).read_text(encoding="utf-8"))
    p |= {k: v for k, v in vars(args).items() if k in DEFAULTS and v is not None}
    for k in ("levels", "panel"):
        if p[k] == "off":
            p[k] = None
    unknown = set(p) - set(DEFAULTS)
    if unknown:
        sys.exit(f"알 수 없는 파라미터: {sorted(unknown)}")
    if p["levels"] is not None and len(p["levels"]) != 3:
        sys.exit("--levels 는 black,white,gamma 세 값")
    return p


def main(argv=None) -> int:
    args = parse_args(argv)
    p = resolve_params(args)
    node = load_node(node_source(args.src))
    if p["panel"] is not None and p["panel"] not in node.FRAMES:
        sys.exit(f"--panel 은 {list(node.FRAMES)} 중 하나")
    if args.save_params:
        pathlib.Path(args.save_params).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(args.save_params).write_text(json.dumps(p, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.pen and len(args.inputs) > 1:
        print("--pen 은 입력이 하나일 때만 씁니다(선 맵은 그림마다 다름). 이번엔 무시.", file=sys.stderr)
    out_dir = pathlib.Path(args.out_dir)
    if not args.report:
        out_dir.mkdir(parents=True, exist_ok=True)

    for path in args.inputs:
        # LoadImage 처럼 EXIF 회전을 먼저 적용
        src = working_size(ImageOps.exif_transpose(Image.open(path)).convert("RGB"), p["megapixels"])
        rgb = np.asarray(src)
        if p["levels"]:
            rgb = manga_levels(rgb, *p["levels"])
        if args.report:
            print_report(path, tone_report(node, rgb, p))
            continue
        pen = pen_map(args.pen, rgb.shape[:2]) if args.pen and len(args.inputs) == 1 else None
        white = node.finish(rgb, p["screen_lines"], p["white_point"], p["black_point"], p["light_tone"],
                            p["dark_tone"], p["gradation"], pen, p["pen_threshold"], p["white_lines"])
        if p["panel"] is None:
            result = np.repeat((white * np.uint8(255))[..., None], 3, axis=2)
        else:
            result = manga_panel(node, white, p)
        stem = pathlib.Path(path).stem
        Image.fromarray(result).save(out_dir / f"{stem}_manga.png")
        if args.compare:
            h = result.shape[0]
            left = np.asarray(src.resize((round(src.width * h / src.height), h), Image.LANCZOS))
            Image.fromarray(np.hstack([left, result])).save(out_dir / f"{stem}_compare.png")
        print(out_dir / f"{stem}_manga.png", f"{result.shape[1]}x{result.shape[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Playable web build of the gray-box map: the bare mannequin ("base body", BB) walks the level in the
map's camera and throws the boxing motions imported onto it.  Exports everything a one-screen browser
page needs (plain canvas 2D, no library) into one folder.

    python examples/map/play.py build -o out/play --bake out/map_45b --bb out/bb2 \\
        --clip onetwo=out/onetwo3/5m/clip.npz --clip inout=out/inout3/5m/clip.npz
    python examples/map/play.py build -o out/play --only level,page      # re-export without the sprites
    python examples/map/play.py check -o out/play                        # manifest <-> files

What the page gets (``out/play``: ``index.html`` + ``assets/``):

    level.png         the level, lit and shaded exactly like ``graybox.py render`` (grid, shadows, AO,
                      outline), one image on the bake's world-locked pixel grid
    level_depth.png   per pixel: camera depth, 16 bits in R (high byte) and G (low byte) between the
                      manifest's ``depth_lo`` / ``depth_hi`` (65535 = nothing there); B = 255 where the
                      ground there is in sunlight, 0 in the level's own shadow
    terrain.png       one pixel per ``cell`` metres of the layout: R, G = ground height in millimetres
                      + 32768 (16 bits); B = 255 walkable, 0 blocked (level edge, cliff faces both sides,
                      steep steps, water, tree trunks, rocks)
    sprites_N.webp    BB frames on a transparent background, 8 facings x (idle, walk, run, one-two,
                      transitions); atlas page N, at most PAGE_W x PAGE_H (a phone decodes one page at a time)
    sprites_data_N.png  the same rectangles: R, G = depth of the pixel relative to the depth of the
                      figure's ground point, ``(R*256 + G - 32768) / depth_scale`` world units (negative =
                      nearer); B = 255 where the figure's own shadow falls on flat ground; A = 255
    manifest.json     camera (world -> pixel/depth), file names, encodings, frames [x, y, w, h, ox, oy, page],
                      animations, every file's bytes (``files``: the page's progress bar)

The page composites per pixel: a sprite pixel shows where root depth + its offset is nearer than the
level's depth (so trees and cliffs hide the figure), its shadow darkens only ground pixels at the depth
the flat shadow expects.  See README "플레이 빌드".
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))
import graybox  # noqa: E402
import isocam  # noqa: E402
import level as lv  # noqa: E402

TEMPLATE = HERE / "play" / "index.html"
FACINGS = tuple(range(0, 360, 45))  # layout convention: 0 = +x (screen right), 90 = +z (towards the camera)
DEPTH_EMPTY = 65535
SPRITE_DEPTH_SCALE = 512.0  # sprite depth offsets: 1/512 world unit steps (2 mm), +-64 units; coarser steps
#                             than the old 1/2048 pack smaller (the occlusion tests need ~1 cm)
HEIGHT_ZERO = 32768  # terrain heights: millimetres + this
SUN_CELL = 0.0625  # metres: the ground's own sun map (where the level shades the ground), see export_level
LIT, GROUND = 128, 64  # level_depth.png B channel bits: sunlit, walkable ground (grass / path / water)
DEFAULT_ONETWO = "out/onetwo4/5m/clip.npz"  # the one-two, wrist range "human"
ATLAS_MAX_AREA = 4096 * 4096  # the largest canvas every browser reads back (iOS Safari: 16.7 M pixels)
PAGE_W, PAGE_H = 4096, 2048  # sprite atlas pages (pack_atlas_pages): each decoded on its own, 34 MB at most


# ---------------------------------------------------------------- encodings (the page decodes these)
def pack_depth16(depth: np.ndarray, valid: np.ndarray, lo: float, hi: float, extra: Optional[np.ndarray] = None):
    """(H, W) depths -> (H, W, 4) uint8: R, G = 16-bit position between lo and hi (0..65534; 65535 =
    not valid), B = ``extra`` (uint8, default 0), A = 255 (opaque: the browser keeps the bytes as they are)."""
    q = np.clip(np.round((np.asarray(depth, np.float64) - lo) / (hi - lo) * (DEPTH_EMPTY - 1)), 0, DEPTH_EMPTY - 1)
    q = np.where(valid, q, DEPTH_EMPTY).astype(np.uint32)
    out = np.zeros(q.shape + (4,), np.uint8)
    out[..., 0], out[..., 1] = q >> 8, q & 255
    out[..., 2] = 0 if extra is None else extra
    out[..., 3] = 255
    return out


def unpack_depth16(rgba: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Inverse of ``pack_depth16``: depths, +inf where nothing is."""
    q = rgba[..., 0].astype(np.float64) * 256 + rgba[..., 1]
    return np.where(q >= DEPTH_EMPTY, np.inf, lo + q / (DEPTH_EMPTY - 1) * (hi - lo))


def pack_offset16(off: np.ndarray, valid: np.ndarray, extra: Optional[np.ndarray] = None) -> np.ndarray:
    """Sprite depth offsets (world units) -> RGBA: R, G = round(off * SPRITE_DEPTH_SCALE) + 32768."""
    q = np.clip(np.round(np.asarray(off, np.float64) * SPRITE_DEPTH_SCALE) + 32768, 0, 65535)
    q = np.where(valid, q, 32768).astype(np.uint32)
    out = np.zeros(q.shape + (4,), np.uint8)
    out[..., 0], out[..., 1] = q >> 8, q & 255
    out[..., 2] = 0 if extra is None else extra
    out[..., 3] = 255
    return out


def unpack_offset16(rgba: np.ndarray) -> np.ndarray:
    return ((rgba[..., 0].astype(np.float64) * 256 + rgba[..., 1]) - 32768) / SPRITE_DEPTH_SCALE


def pack_height(h_m: np.ndarray, walk: np.ndarray) -> np.ndarray:
    q = np.clip(np.round(np.asarray(h_m, np.float64) * 1000) + HEIGHT_ZERO, 0, 65535).astype(np.uint32)
    out = np.zeros(q.shape + (4,), np.uint8)
    out[..., 0], out[..., 1], out[..., 2], out[..., 3] = q >> 8, q & 255, np.where(walk, 255, 0), 255
    return out


def unpack_height(rgba: np.ndarray):
    return (rgba[..., 0].astype(np.float64) * 256 + rgba[..., 1] - HEIGHT_ZERO) / 1000.0, rgba[..., 2] >= 128


def save_rgba(arr: np.ndarray, path: str):
    from PIL import Image

    Image.fromarray(np.ascontiguousarray(arr), "RGBA" if arr.shape[-1] == 4 else "RGB").save(path, optimize=True)


def load_rgba(path: str) -> np.ndarray:
    from PIL import Image

    return np.asarray(Image.open(path).convert("RGBA"))


def to_u8(img: np.ndarray) -> np.ndarray:
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


# ---------------------------------------------------------------- camera as one affine map
def world_to_screen(cam) -> List[List[float]]:
    """3x4 rows: pixel x, pixel y, camera depth of a world point (x, y, z, 1) (orthographic camera)."""
    R, t = cam.viewmat[:3, :3], cam.viewmat[:3, 3]
    s = cam.A[0, 0]
    rows = [np.r_[s * R[0], s * t[0] + cam.A[0, 3]], np.r_[cam.A[1, 1] * R[1], cam.A[1, 1] * t[1] + cam.A[1, 3]],
            np.r_[R[2], t[2]]]
    return [[float(v) for v in r] for r in rows]


# ---------------------------------------------------------------- walkable cells
def walk_grid(level: lv.Level, cell: float = 0.25, body: float = 0.25, step: float = 0.15, edge: float = 0.35):
    """Heights (nz, nx) and walkable flags of the level on ``cell``-metre cells (cell centres).

    Blocked: within ``edge`` of the level's rim; both cells of any neighbour pair whose heights differ by
    more than ``step`` (cliff faces and the sides of ramps and plateaus - the ramp's own slope, 0.08 m per
    cell, and the hills, < 0.06, stay walkable); water; within trunk radius + ``body`` of a tree; inside
    a rock's footprint grown by ``body`` * 0.6."""
    sx, sz = level.size
    nx, nz = int(round(sx / cell)), int(round(sz / cell))
    x = -sx / 2 + (np.arange(nx) + 0.5) * cell
    z = -sz / 2 + (np.arange(nz) + 0.5) * cell
    X, Z = np.meshgrid(x, z)
    H = level.height(X, Z)
    ok = level.surface(X, Z) != lv.MAT["water"]
    ok &= (np.abs(X) <= sx / 2 - edge) & (np.abs(Z) <= sz / 2 - edge)
    jump_x = np.abs(np.diff(H, axis=1)) > step
    jump_z = np.abs(np.diff(H, axis=0)) > step
    steep = np.zeros_like(ok)
    steep[:, :-1] |= jump_x
    steep[:, 1:] |= jump_x
    steep[:-1, :] |= jump_z
    steep[1:, :] |= jump_z
    ok &= ~steep
    for e in level.of("tree"):
        rt = float(e.get("trunk", 0.06 * float(e["height"])))
        ok &= np.hypot(X - e["at"][0], Z - e["at"][1]) > rt + body
    for e in level.of("rock"):
        c, s = math.cos(math.radians(e.get("rot", 0.0))), math.sin(math.radians(e.get("rot", 0.0)))
        dx, dz = X - e["at"][0], Z - e["at"][1]
        u, v = dx * c + dz * s, -dx * s + dz * c
        a, b = e["size"][0] / 2 + 0.6 * body, e["size"][2] / 2 + 0.6 * body
        ok &= (u / a) ** 2 + (v / b) ** 2 > 1
    return dict(x=x, z=z, height=H, walk=ok, cell=cell, origin=(-sx / 2, -sz / 2))


def cell_of(grid: dict, xm: float, zm: float):
    ox, oz = grid["origin"]
    return int(math.floor((zm - oz) / grid["cell"])), int(math.floor((xm - ox) / grid["cell"]))


def reachable(grid: dict, start_xz) -> np.ndarray:
    """Cells reachable from the start by 4-neighbour steps over walkable cells."""
    from scipy.ndimage import label

    lab, _ = label(grid["walk"])
    j, i = cell_of(grid, *start_xz)
    return (lab == lab[j, i]) & grid["walk"]


# ---------------------------------------------------------------- level layers
def export_level(st: graybox.Stage, assets: str, cell: float = 0.25, log=print) -> dict:
    t0 = time.time()
    W, H = st.cam.width, st.cam.height
    img, L = st.frame(0, 0, W, H, layers=True)
    valid = L["alpha"] > 0.5
    lit = L["sun"] > 0.5
    d = L["depth"][valid]
    lo, hi = float(np.floor(d.min() - 1.0)), float(np.ceil(d.max() + 1.0))
    save_rgba(to_u8(img), os.path.join(assets, "level.png"))
    m = st.mat
    ground_px = valid & ((m == lv.MAT["grass"]) | (m == lv.MAT["path"]) | (m == lv.MAT["water"]))
    flags = (np.where(lit, LIT, 0) | np.where(ground_px, GROUND, 0)).astype(np.uint8)
    save_rgba(pack_depth16(L["depth"], valid, lo, hi, flags), os.path.join(assets, "level_depth.png"))
    sun = ground_sun(st, SUN_CELL)
    save_rgba(np.repeat(np.where(sun, 255, 0).astype(np.uint8)[..., None], 3, -1), os.path.join(assets, "sun.png"))
    # how much the level's own shadow darkens walkable ground (per channel): the page darkens with it
    ground = valid & ((m == lv.MAT["grass"]) | (m == lv.MAT["path"]))
    ratio = np.median(img[ground & ~lit], 0) / np.maximum(np.median(img[ground & lit], 0), 1e-3)
    grid = walk_grid(st.level, cell)
    save_rgba(pack_height(grid["height"], grid["walk"]), os.path.join(assets, "terrain.png"))
    # camera depth change per screen row down on flat ground (negative: lower on screen = nearer)
    a, b = (isocam.unproject_to_plane(st.cam, 0.5, y, lv.GROUND) for y in (0.5, 1.5))
    flat_row = float(isocam.project(st.cam, b)[2] - isocam.project(st.cam, a)[2])
    log(f"[level] {W}x{H} art px, depth {lo:g}..{hi:g}, shadow ratio {np.round(ratio, 3).tolist()}, "
        f"terrain {grid['walk'].shape[1]}x{grid['walk'].shape[0]} cells of {cell} m, "
        f"{grid['walk'].mean() * 100:.0f}% walkable ({time.time() - t0:.1f}s)")
    return dict(color="level.png", depth="level_depth.png", size=[W, H], depth_lo=lo, depth_hi=hi,
                depth_empty=DEPTH_EMPTY, background=[float(v) for v in graybox.BACKGROUND],
                shadow_ratio=[round(float(v), 4) for v in ratio], flat_depth_per_row=flat_row,
                depth_flags=dict(lit=LIT, ground=GROUND),
                sun=dict(file="sun.png", cell=SUN_CELL, origin=[-st.level.size[0] / 2, -st.level.size[1] / 2],
                         size=[int(sun.shape[1]), int(sun.shape[0])],
                         note="the ground's own sunlight (the level's shadows only), one pixel per cell: R >= 128 = lit"),
                terrain=dict(file="terrain.png", cell=cell, origin=list(grid["origin"]),
                             size=[int(grid["walk"].shape[1]), int(grid["walk"].shape[0])], height_zero=HEIGHT_ZERO,
                             height_scale=1000.0))


def ground_sun(st: graybox.Stage, cell: float = SUN_CELL) -> np.ndarray:
    """(nz, nx) bool: is the GROUND at each cell centre in the sun (the level's own shadows: trees, cliffs,
    rocks)?  What decides whether a figure standing there is lit - not whatever covers its feet on screen
    (a tree crown between the camera and the feet is in the sun itself)."""
    from pixelsplat.shadow import visibility  # noqa: PLC0415

    sx, sz = st.level.size
    nx, nz = int(round(sx / cell)), int(round(sz / cell))
    x = -sx / 2 + (np.arange(nx) + 0.5) * cell
    z = -sz / 2 + (np.arange(nz) + 0.5) * cell
    X, Z = np.meshgrid(x, z)
    Hm = st.level.height(X, Z)
    U = lv.UNITS_PER_M
    P = np.stack([X * U, lv.GROUND + Hm * U, Z * U], -1)
    e = 0.5 * cell
    gx = (st.level.height(X + e, Z) - st.level.height(X - e, Z)) / (2 * e)
    gz = (st.level.height(X, Z + e) - st.level.height(X, Z - e)) / (2 * e)
    n = np.stack([-gx, np.ones_like(gx), -gz], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    vis = visibility(st.sm, P, bias=0.06, pcf=1, normals=n)
    return vis > 0.5


# ---------------------------------------------------------------- sprites
def flat_stage(spec: isocam.RefCam, folder: str, density: int = 0) -> graybox.Stage:
    """A small flat meadow with the same camera and sun as the level: what the sprites are lit on.
    ``density`` 0 = from the scale (the calibrated scale times a whole number)."""
    if not density:
        density = max(1, int(round(spec.px_per_unit / isocam.scale_for(spec.elev)[0])))
    layout = {"name": "sprite_stage", "size": [10, 10], "grid": {"minor": 0, "major": 0}, "elements": []}
    _, data = graybox.bake(lv.Level(layout), spec, spacing=0.25, shadow_res=128 * density, log=lambda *a: None,
                           density=density)
    np.savez_compressed(os.path.join(folder, graybox.BAKE_FILE), **data)
    Path(folder, "layout_used.json").write_text(json.dumps(layout))
    return graybox.Stage(folder)


class SpriteRenderer:
    """Renders BB frames on the flat stage: the figure's ground point sits on the centre of pixel
    (cx, cy) of the stage camera; the frame window is (W, H) art px with that pixel at (AX, AY)."""

    W, H, AX, AY = 84, 58, 44, 42  # at density 1; times the stage's density

    def __init__(self, st: graybox.Stage, man: graybox.Mannequin):
        self.st, self.man = st, man
        d = st.density
        self.W, self.H, self.AX, self.AY = self.W * d, self.H * d, self.AX * d, self.AY * d
        c = isocam.project(st.cam, st.level.to_world(0.0, 0.0))
        self.cx, self.cy = int(math.floor(c[0])), int(math.floor(c[1]))
        self.ground = isocam.unproject_to_plane(st.cam, self.cx + 0.5, self.cy + 0.5, lv.GROUND)
        self.root_depth = float(isocam.project(st.cam, self.ground)[2])

    def render(self, mats: np.ndarray, facing: float) -> dict:
        placed = self.man.place(mats, self.ground, facing)
        x0, y0 = self.cx - self.AX, self.cy - self.AY
        img, L = self.st.frame(x0, y0, self.W, self.H, actors=[(self.man, placed)], layers=True)
        actor = L["actor"]
        shadow = ~actor & (L["alpha"] > 0.5) & (L["sun"] < 0.5)
        off = np.where(actor, L["depth"] - self.root_depth, 0.0)
        return dict(color=img, actor=actor, shadow=shadow, offset=off)


def strip_root(mats: np.ndarray, root) -> np.ndarray:
    """Bone matrices with the root's ground-plane travel taken out (the figure stays over its anchor;
    the page moves it by the root motion instead).  Height is kept."""
    out = np.asarray(mats, np.float64).copy()
    out[:, :, 3] -= np.array([root[0], 0.0, root[2]])
    return out.astype(np.float32)


def sprite_sequences(onetwo: str, max_frames: int = 0):
    """The moves (``moves.py``) as (name, [Frame], meta) in render order."""
    import moves as mv  # noqa: PLC0415

    m = mv.Moves(onetwo)
    seqs = []
    for name, frames in m.loops().items():
        meta = dict(kind="loop", fps=mv.FPS)
        if name in ("walk", "run"):
            stride = (mv.WALK_SPEED if name == "walk" else mv.RUN_SPEED) * len(frames) / mv.FPS
            meta.update(kind="gait", stride_m=round(stride, 5), speed=round(stride * mv.FPS / len(frames), 5),
                        frames_per_cycle=len(frames))
        seqs.append((name, frames, meta))
    seqs.append(("onetwo", m.onetwo(), dict(kind="action", fps=mv.FPS, source=onetwo, then="idle",
                                            chain_from=m.chain_from())))
    for name, t in m.transitions().items():
        meta = dict(kind="transition", fps=mv.FPS, source=t["source"], target=t["target"], enter=t["enter"],
                    exit=t["exit"], advance=[[round(float(a), 6), round(float(b), 6)] for a, b in t["advance"]])
        seqs.append((name, t["frames"], meta))
    if max_frames:
        seqs = [(n, f[:max_frames], dict(m, advance=m["advance"][:max_frames]) if "advance" in m else m)
                for n, f, m in seqs]
    return seqs


def _render_worker(args):
    """One process: one stage + mannequin, a list of (facing, sequence index) jobs -> cropped frames."""
    bb, spec_t, splats, density, jobs, poses, threads, log_path = args
    import torch  # noqa: PLC0415

    torch.set_num_threads(threads)
    spec = isocam.RefCam(*spec_t[:3], view=tuple(spec_t[3]))
    tmp = tempfile.mkdtemp(prefix="bb_stage_")
    try:
        st = flat_stage(spec, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    man = graybox.Mannequin(bb, splats, density=density, raster_k=512 if density > 1 else None)
    sr = SpriteRenderer(st, man)
    out = []
    t0 = time.time()
    for n, (facing, key, i) in enumerate(jobs):
        r = sr.render(poses[key][i], facing)
        out.append(crop_frame(r, sr))
        if log_path and (n + 1) % 25 == 0:
            with open(log_path, "a") as f:
                el = time.time() - t0
                f.write(f"[sprites] worker {os.getpid()}: {n + 1}/{len(jobs)} ({el:.0f}s, ~{el / (n + 1) * (len(jobs) - n - 1):.0f}s left)\n")
    return out


def crop_frame(r: dict, sr: "SpriteRenderer") -> dict:
    cover = r["actor"] | r["shadow"]
    ys, xs = np.nonzero(cover)
    if len(ys) == 0:
        raise RuntimeError("an empty sprite frame (the figure left the render window?)")
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    if y0 == 0 or x0 == 0 or y1 == sr.H or x1 == sr.W:
        raise RuntimeError(f"a sprite frame touches the render window's edge ({x0},{y0})-({x1},{y1}): enlarge it")
    sl = (slice(y0, y1), slice(x0, x1))
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    rgba[..., :3] = to_u8(r["color"][sl])
    rgba[..., 3] = np.where(r["actor"][sl], 255, 0)
    rgba[..., :3] *= (rgba[..., 3:] > 0)  # nothing hidden under transparent pixels (smaller files, exact decode)
    data = pack_offset16(r["offset"][sl], r["actor"][sl], np.where(r["shadow"][sl], 255, 0).astype(np.uint8))
    return dict(rgba=rgba, data=data, ox=int(x0 - sr.AX), oy=int(y0 - sr.AY))


def _frame_key(mats: np.ndarray, facing: float, spec: isocam.RefCam, density: int, splats: int, bb: str) -> str:
    import hashlib  # noqa: PLC0415

    h = hashlib.sha1(np.round(np.asarray(mats, np.float64), 7).astype(np.float32).tobytes())
    # (realpath: the same figure reached through a symlinked out/ - a git worktree - keeps its cached frames)
    h.update(repr((float(facing), spec.elev, spec.az, spec.px_per_unit, density, splats, os.path.realpath(bb),
                   SpriteRenderer.W, SpriteRenderer.H, SPRITE_DEPTH_SCALE)).encode())
    return h.hexdigest()


def render_sprites(bb: str, onetwo: str, spec: isocam.RefCam, density: int = 1, facings=FACINGS, splats: int = 1000,
                   max_frames: int = 0, workers: int = 2, threads: int = 2, log=print, log_path: Optional[str] = None,
                   cache: Optional[str] = None):
    """All frames: (frames, anims, info).  ``frames`` = de-duplicated list of dicts (rgba crop, data crop,
    ox, oy); ``anims`` = {name: {per-facing frame indices, kind, fps, ...}}.  Rendered by ``workers``
    processes (each with its own stage and mannequin), facings split between them."""
    import multiprocessing as mp  # noqa: PLC0415

    import gzip  # noqa: PLC0415
    import pickle  # noqa: PLC0415

    seqs = sprite_sequences(onetwo, max_frames)
    poses = {name: [f.mats() for f in frames] for name, frames, _ in seqs}
    every = [(f, name, i) for f in facings for name, frames, _ in seqs for i in range(len(frames))]
    keys = {j: _frame_key(poses[j[1]][j[2]], j[0], spec, density, splats, bb) for j in every}
    store: Dict[str, dict] = {}
    if cache and os.path.exists(cache):  # frames rendered before from the very same pose, camera and figure
        with gzip.open(cache, "rb") as fh:
            store = pickle.load(fh)
    jobs = [j for j in every if keys[j] not in store]
    t0 = time.time()
    log(f"[sprites] {len(every)} frames ({len(facings)} facings x {len(every) // len(facings)}); {len(every) - len(jobs)} "
        f"from the cache, {len(jobs)} to render with {workers} workers")
    spec_t = (spec.elev, spec.az, spec.px_per_unit, list(spec.view))
    parts = [p for p in (jobs[k::workers] for k in range(max(workers, 1))) if p]
    args = [(bb, spec_t, splats, density, p, poses, threads, log_path) for p in parts]
    if len(args) > 1:
        with mp.get_context("spawn").Pool(len(args)) as pool:
            results = pool.map(_render_worker, args)
    else:
        results = [_render_worker(a) for a in args]
    for part, res in zip(parts, results):
        for job, fr in zip(part, res):
            store[keys[job]] = fr
    if cache and jobs:
        tmp = cache + ".tmp"
        with gzip.open(tmp, "wb", compresslevel=3) as fh:
            pickle.dump({keys[j]: store[keys[j]] for j in every}, fh)
        os.replace(tmp, cache)
    rendered = {j: store[keys[j]] for j in every}
    frames: List[dict] = []
    seen: Dict[bytes, int] = {}

    def add(fr) -> int:  # identical frames (a still idle, a held pose) are stored once
        key = fr["rgba"].tobytes() + fr["data"].tobytes() + np.array([fr["ox"], fr["oy"], *fr["rgba"].shape]).tobytes()
        if key not in seen:
            seen[key] = len(frames)
            frames.append(fr)
        return seen[key]

    anims: Dict[str, dict] = {}
    for name, fr_list, meta in seqs:
        anims[name] = dict(meta, frames=[[add(rendered[(f, name, i)]) for i in range(len(fr_list))] for f in facings])
    log(f"[sprites] {len(jobs)} frames rendered, {len(frames)} distinct of {len(every)} ({time.time() - t0:.0f}s)")
    return frames, anims, dict(splats=splats * density * density, bb=bb, color=list(graybox.BB_COLOR), density=density)


def pack_atlas(frames: List[dict], width: int = 0):
    """Shelf packing (tallest first, 1 px gap).  Returns (colour atlas, data atlas, rects [x, y, w, h]).
    ``width`` 0 = the narrowest power of two from 1024 whose atlas is about as tall as wide."""
    if not width:
        area = sum((f["rgba"].shape[0] + 1) * (f["rgba"].shape[1] + 1) for f in frames)
        width = 1024
        while width * width < area * 1.15 and width < 4096:
            width *= 2
    order = sorted(range(len(frames)), key=lambda i: (-frames[i]["rgba"].shape[0], -frames[i]["rgba"].shape[1]))
    rects = [None] * len(frames)
    x = y = shelf = 0
    for i in order:
        h, w = frames[i]["rgba"].shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 1, 0
        rects[i] = [x, y, w, h]
        x, shelf = x + w + 1, max(shelf, h)
    H = y + shelf
    if H * width > ATLAS_MAX_AREA:
        raise RuntimeError(f"sprite atlas {width}x{H} is larger than a phone browser reads back ({ATLAS_MAX_AREA} px)")
    color = np.zeros((H, width, 4), np.uint8)
    data = np.zeros((H, width, 4), np.uint8)
    data[..., 3] = 255
    data[..., 0] = 128  # (offset 0 where nothing is)
    for f, (x, y, w, h) in zip(frames, rects):
        color[y:y + h, x:x + w] = f["rgba"]
        data[y:y + h, x:x + w] = f["data"]
    return color, data, rects


def pack_atlas_pages(frames: List[dict], width: int = PAGE_W, page_h: int = PAGE_H):
    """Shelf packing (tallest first, 1 px gap) onto pages of at most ``width`` x ``page_h``: a phone decodes one
    page at a time (4096 x 2048 = 8.4 M pixels, 34 MB decoded), and more clips only add pages - no page nears the
    16.7 M pixel canvas limit of iOS Safari.  Returns ([(colour, data)] per page, rects [x, y, w, h, page])."""
    order = sorted(range(len(frames)), key=lambda i: (-frames[i]["rgba"].shape[0], -frames[i]["rgba"].shape[1]))
    rects = [None] * len(frames)
    heights = []
    x = y = shelf = page = 0
    for i in order:
        h, w = frames[i]["rgba"].shape[:2]
        if w > width or h > page_h:
            raise RuntimeError(f"a sprite frame {w}x{h} is larger than an atlas page {width}x{page_h}")
        if x + w > width:
            x, y, shelf = 0, y + shelf + 1, 0
        if y + h > page_h:
            heights.append(y - 1)
            x = y = shelf = 0
            page += 1
        rects[i] = [x, y, w, h, page]
        x, shelf = x + w + 1, max(shelf, h)
    heights.append(y + shelf)
    pages = []
    for p, H in enumerate(heights):
        color = np.zeros((H, width, 4), np.uint8)
        data = np.zeros((H, width, 4), np.uint8)
        data[..., 3] = 255
        data[..., 0] = 128  # (offset 0 where nothing is)
        pages.append((color, data))
    for f, (x, y, w, h, p) in zip(frames, rects):
        pages[p][0][y:y + h, x:x + w] = f["rgba"]
        pages[p][1][y:y + h, x:x + w] = f["data"]
    return pages, rects


def save_webp_lossless(arr: np.ndarray, path: str):
    """Lossless WebP (exact bytes, about half a PNG's size here); verified to decode exactly in Chromium by
    tests/test_play_page.py."""
    from PIL import Image

    Image.fromarray(np.ascontiguousarray(arr), "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6, exact=True)


def check_start(st: graybox.Stage, at, cell: float, log=print):
    """The start spot, moved to the nearest walkable cell reachable over the level if it is not walkable."""
    grid = walk_grid(st.level, cell)
    j, i = cell_of(grid, *at)
    ok = 0 <= j < grid["walk"].shape[0] and 0 <= i < grid["walk"].shape[1] and grid["walk"][j, i]
    if ok:
        return [float(at[0]), float(at[1])]
    from scipy.ndimage import label  # noqa: PLC0415

    lab, _ = label(grid["walk"])
    big = np.argmax(np.bincount(lab.ravel())[1:]) + 1  # the largest walkable region
    jj, ii = np.nonzero(lab == big)
    k = int(np.argmin((grid["x"][ii] - at[0]) ** 2 + (grid["z"][jj] - at[1]) ** 2))
    new = [float(grid["x"][ii[k]]), float(grid["z"][jj[k]])]
    log(f"[build] WARNING: the start {list(at)} is not walkable; using the nearest walkable spot {new}")
    return new


# ---------------------------------------------------------------- the whole build
def build(a, log=print):
    assets = os.path.join(a.out, "assets")
    os.makedirs(assets, exist_ok=True)
    only = set(a.only.split(","))
    st = graybox.Stage(a.bake)
    man_path = os.path.join(assets, "manifest.json")
    manifest = json.loads(Path(man_path).read_text()) if os.path.exists(man_path) else {}
    lv_demo = st.level.demo.get("stand", {"at": [0.0, 0.0], "facing": 90})
    import moves as mv  # noqa: PLC0415

    manifest.update(version=2, name="BB field test", layout=st.level.name, density=st.density,
                    camera=dict(elev=st.spec.elev, az=st.spec.az, px_per_unit=st.spec.px_per_unit,
                                world_to_screen=world_to_screen(st.cam), units_per_m=lv.UNITS_PER_M,
                                ground_y=lv.GROUND, note="row 0: pixel x, row 1: pixel y, row 2: camera depth "
                                                         "(smaller = nearer) of world (x, y, z, 1)"),
                    start=dict(at=check_start(st, lv_demo["at"], a.cell, log),
                               facing=int(round(float(lv_demo.get("facing", 90)) / 45.0)) % 8 * 45),
                    walk_speed=round(mv.WALK_SPEED, 5), run_speed=round(mv.RUN_SPEED, 5))
    if "level" in only:
        manifest["level"] = export_level(st, assets, a.cell, log=log)
    if "sprites" in only:
        frames, anims, info = render_sprites(a.bb, a.onetwo, st.spec, st.density, max_frames=a.max_frames,
                                             workers=a.workers, threads=a.threads, log=log,
                                             log_path=a.out.rstrip("/") + "_render.log",
                                             cache=a.cache or a.out.rstrip("/") + "_sprite_cache.pkl.gz")
        pages, rects = pack_atlas_pages(frames)
        for old in os.listdir(assets):  # earlier atlases (one file each, or pages)
            if old.startswith("sprites") and old.endswith((".png", ".webp")):
                os.remove(os.path.join(assets, old))
        ext = "webp" if a.webp else "png"
        page_files = []
        for p, (color, data) in enumerate(pages):
            cname, dname = f"sprites_{p}.{ext}", f"sprites_data_{p}.png"
            (save_webp_lossless if a.webp else save_rgba)(color, os.path.join(assets, cname))
            save_rgba(data, os.path.join(assets, dname))
            page_files.append(dict(color=cname, data=dname, size=[int(color.shape[1]), int(color.shape[0])]))
        log(f"[sprites] {len(pages)} atlas pages: " + ", ".join(f"{q['size'][0]}x{q['size'][1]}" for q in page_files))
        manifest.pop("sprites", None)
        manifest["sprites"] = dict(pages=page_files, depth_scale=SPRITE_DEPTH_SCALE,
                                   depth_zero=32768, facings=list(FACINGS), anims=anims, mannequin=info,
                                   frames=[r[:4] + [f["ox"], f["oy"], r[4]] for r, f in zip(rects, frames)],
                                   frame_note="[x, y, w, h, ox, oy, page]: rectangle in both atlases of that page; "
                                              "its top-left pixel lies (ox, oy) from the anchor pixel (the pixel "
                                              "that holds the figure's ground point)")
    manifest["files"] = asset_sizes(assets, manifest)
    Path(man_path).write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False))
    if "page" in only:
        shutil.copyfile(TEMPLATE, os.path.join(a.out, "index.html"))
    problems = check(a.out)
    if problems:
        raise SystemExit("[check] " + "\n[check] ".join(problems))
    sizes = {f: os.path.getsize(os.path.join(a.out, f)) for f in ["index.html"] + [
        "assets/" + n for n in sorted(os.listdir(assets))] if os.path.exists(os.path.join(a.out, f))}
    log("[build] " + ", ".join(f"{k} {v / 1024:.0f} KB" for k, v in sizes.items()) +
        f"; total {sum(sizes.values()) / 1e6:.2f} MB")


def atlas_pages(sprites: dict) -> List[dict]:
    """The manifest's atlas pages: [{color, data, size}] (``pages``), or the one pair of older builds."""
    return sprites.get("pages") or [dict(color=sprites["color"], data=sprites["data"])]


def asset_sizes(assets: str, manifest: dict) -> Dict[str, int]:
    """Bytes of every file the page downloads (it shows the download's progress with them)."""
    names = []
    if "level" in manifest:
        L = manifest["level"]
        names += [L["color"], L["depth"], L["terrain"]["file"]] + ([L["sun"]["file"]] if "sun" in L else [])
    if "sprites" in manifest:
        names += [f for p in atlas_pages(manifest["sprites"]) for f in (p["color"], p["data"])]
    return {n: os.path.getsize(os.path.join(assets, n)) for n in names if os.path.exists(os.path.join(assets, n))}


def check(folder: str) -> List[str]:
    """Problems with an exported folder (empty = consistent): files present, sizes and rectangles agree."""
    out = []
    assets = os.path.join(folder, "assets")
    try:
        m = json.loads(Path(assets, "manifest.json").read_text())
    except (OSError, ValueError) as err:
        return [f"manifest.json: {err}"]
    if not os.path.exists(os.path.join(folder, "index.html")):
        out.append("index.html missing")
    if "level" in m:
        L = m["level"]
        for k in ("color", "depth"):
            p = os.path.join(assets, L[k])
            if not os.path.exists(p):
                out.append(f"{L[k]} missing")
            elif list(load_rgba(p).shape[1::-1]) != L["size"]:
                out.append(f"{L[k]} is not {L['size']}")
        for T in [L["terrain"]] + ([L["sun"]] if "sun" in L else []):
            p = os.path.join(assets, T["file"])
            if not os.path.exists(p):
                out.append(f"{T['file']} missing")
            elif list(load_rgba(p).shape[1::-1]) != T["size"]:
                out.append(f"{T['file']} is not {T['size']}")
    else:
        out.append("no level in the manifest")
    if "sprites" in m:
        S = m["sprites"]
        sizes = []  # per page: (H, W), or None
        for pg in atlas_pages(S):
            shapes = {}
            for k in ("color", "data"):
                p = os.path.join(assets, pg[k])
                if not os.path.exists(p):
                    out.append(f"{pg[k]} missing")
                else:
                    shapes[k] = load_rgba(p).shape
            if len(set(shapes.values())) > 1:
                out.append(f"sprite atlases differ in size: {shapes}")
            hw = next(iter(shapes.values()))[:2] if shapes else None
            if hw and "size" in pg and list(hw[::-1]) != pg["size"]:
                out.append(f"{pg['color']} is not {pg['size']}")
            if hw and hw[0] * hw[1] > ATLAS_MAX_AREA:
                out.append(f"{pg['color']} has more pixels than a phone browser reads back ({ATLAS_MAX_AREA})")
            sizes.append(hw)
        for i, fr in enumerate(S["frames"]):
            x, y, w, h = fr[:4]
            p = fr[6] if len(fr) > 6 else 0
            if not 0 <= p < len(sizes):
                out.append(f"frame {i}: no atlas page {p}")
                continue
            if sizes[p] is None:
                continue
            Hh, Ww = sizes[p]
            if x < 0 or y < 0 or x + w > Ww or y + h > Hh or w <= 0 or h <= 0:
                out.append(f"frame {i} lies outside the atlas")
        for f, b in m.get("files", {}).items():
            q = os.path.join(assets, f)
            if os.path.exists(q) and os.path.getsize(q) != b:
                out.append(f"{f}: {os.path.getsize(q)} bytes, the manifest says {b}")
        n = len(S["frames"])
        for name, an in S["anims"].items():
            if "of" in an:
                if an["of"] not in S["anims"]:
                    out.append(f"anim {name} refers to missing {an['of']}")
                continue
            if len(an["frames"]) != len(S["facings"]):
                out.append(f"anim {name}: {len(an['frames'])} facings, expected {len(S['facings'])}")
            lens = {len(f) for f in an["frames"]}
            if len(lens) != 1:
                out.append(f"anim {name}: facings have different frame counts {lens}")
            if any(not (0 <= i < n) for f in an["frames"] for i in f):
                out.append(f"anim {name}: frame index out of range")
            nf = len(an["frames"][0]) if an["frames"] else 0
            if nf < 1:
                out.append(f"anim {name}: no frames")
            if "root" in an and len(an["root"]) != nf:
                out.append(f"anim {name}: {len(an['root'])} root motion entries for {nf} frames")
            if an.get("kind") == "transition":
                if len(an.get("advance", [])) != nf:
                    out.append(f"anim {name}: {len(an.get('advance', []))} advance entries for {nf} frames")
                for k in ("source", "target"):
                    if an.get(k) not in S["anims"]:
                        out.append(f"anim {name}: {k} {an.get(k)!r} is not an animation")
    else:
        out.append("no sprites in the manifest")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="export the level layers, the BB sprites and the page")
    b.add_argument("-o", "--out", default="out/play4")
    b.add_argument("--bake", default=graybox.default_out(isocam.RefCam().elev, 3),
                   help="baked level folder (graybox.py build --density 3)")
    b.add_argument("--bb", default="out/bb2", help="baked bare mannequin (mitten hands)")
    b.add_argument("--onetwo", default=DEFAULT_ONETWO, help="the imported one-two clip (60 fps; its first frame is "
                                                             "the guard the idle breathes around)")
    b.add_argument("--workers", type=int, default=4, help="sprite rendering processes")
    b.add_argument("--cache", default=None, help="rendered-frame cache (default: <out>_sprite_cache.pkl.gz, next to the "
                                                "folder: frames whose pose did not change are not rendered again)")
    b.add_argument("--png", dest="webp", action="store_false",
                   help="colour atlas as PNG instead of lossless WebP (the data atlas is always PNG)")
    b.add_argument("--only", default="level,sprites,page", help="comma list of: level, sprites, page")
    b.add_argument("--cell", type=float, default=0.25, help="terrain cell (metres)")
    b.add_argument("--max-frames", type=int, default=0, help="render at most this many frames per animation (tests)")
    b.add_argument("--threads", type=int, default=1, help="torch threads per worker")
    c = sub.add_parser("check", help="manifest <-> files")
    c.add_argument("-o", "--out", default="out/play4")
    a = ap.parse_args()
    if a.cmd == "check":
        problems = check(a.out)
        print("\n".join(problems) if problems else "[check] ok")
        raise SystemExit(1 if problems else 0)
    for path, what in ((os.path.join(a.bake, graybox.BAKE_FILE), "--bake (graybox.py build)"), (a.onetwo, "--onetwo"),
                       (os.path.join(a.bb, "model.pt"), "--bb")):
        if "sprites" in a.only or what.startswith("--bake"):
            if not os.path.exists(path) and not (what == "--bb" and os.path.isdir(a.bb)):
                raise SystemExit(f"[build] {what}: {path} does not exist")
    import torch  # noqa: PLC0415

    if a.threads > 0:
        torch.set_num_threads(a.threads)
    t0 = time.time()
    build(a)
    print(f"[build] done in {time.time() - t0:.0f}s -> {a.out}/index.html")


if __name__ == "__main__":
    main()

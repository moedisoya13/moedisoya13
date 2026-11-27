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
    sprites.png       BB frames on a transparent background, 8 facings x (walk, one-two, step in/out)
    sprites_data.png  the same rectangles: R, G = depth of the pixel relative to the depth of the
                      figure's ground point, ``(R*256 + G - 32768) / depth_scale`` world units (negative =
                      nearer); B = 255 where the figure's own shadow falls on flat ground; A = 255
    manifest.json     camera (world -> pixel/depth), file names, encodings, frames, animations

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
SPRITE_DEPTH_SCALE = 2048.0  # sprite depth offsets: 1/2048 world unit steps, +-16 units
HEIGHT_ZERO = 32768  # terrain heights: millimetres + this
WALK_FRAMES = 24
CLIP_FPS = 30.0
WALK_SPEED = 1.4  # metres per second the page walks at (the demo path uses 1.25)
IDLE = dict(clip="onetwo", first=0, count=18, fps=15.0)  # the guard at the start of the one-two, ping-pong


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
    save_rgba(pack_depth16(L["depth"], valid, lo, hi, np.where(lit, 255, 0).astype(np.uint8)),
              os.path.join(assets, "level_depth.png"))
    # how much the level's own shadow darkens walkable ground (per channel): the page darkens with it
    m = st.mat
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
                terrain=dict(file="terrain.png", cell=cell, origin=list(grid["origin"]),
                             size=[int(grid["walk"].shape[1]), int(grid["walk"].shape[0])], height_zero=HEIGHT_ZERO,
                             height_scale=1000.0))


# ---------------------------------------------------------------- sprites
def flat_stage(spec: isocam.RefCam, folder: str) -> graybox.Stage:
    """A small flat meadow with the same camera and sun as the level: what the sprites are lit on."""
    layout = {"name": "sprite_stage", "size": [10, 10], "grid": {"minor": 0, "major": 0}, "elements": []}
    _, data = graybox.bake(lv.Level(layout), spec, spacing=0.25, shadow_res=128, log=lambda *a: None)
    np.savez_compressed(os.path.join(folder, graybox.BAKE_FILE), **data)
    Path(folder, "layout_used.json").write_text(json.dumps(layout))
    return graybox.Stage(folder)


class SpriteRenderer:
    """Renders BB frames on the flat stage: the figure's ground point sits on the centre of pixel
    (cx, cy) of the stage camera; the frame window is (W, H) art px with that pixel at (AX, AY)."""

    W, H, AX, AY = 72, 52, 38, 38

    def __init__(self, st: graybox.Stage, man: graybox.Mannequin):
        self.st, self.man = st, man
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


def load_clips(specs: Sequence[str]) -> Dict[str, object]:
    import clip as cl  # noqa: PLC0415 (examples/soldier, on sys.path once a Mannequin exists)

    out = {}
    for s in specs:
        name, path = s.split("=", 1)
        c = cl.Clip.load(path)
        step = max(1, int(round(c.fps / CLIP_FPS)))
        out[name] = (c.sub(0, len(c), step), path)
    return out


def render_sprites(bb: str, clip_specs: Sequence[str], spec: isocam.RefCam, facings=FACINGS, splats: int = 1000,
                   max_frames: int = 0, log=print):
    """All frames: (frames, anims).  ``frames`` = list of dicts (rgba crop, data crop, ox, oy);
    ``anims`` = {name: {per-facing frame indices, fps, root motion ...}}."""
    tmp = tempfile.mkdtemp(prefix="bb_stage_")
    try:
        st = flat_stage(spec, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    man = graybox.Mannequin(bb, splats)
    import motion  # noqa: PLC0415

    sr = SpriteRenderer(st, man)
    clips = load_clips(clip_specs)
    frames: List[dict] = []
    anims: Dict[str, dict] = {}
    t0 = time.time()

    def add(r) -> int:
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
        data = pack_offset16(r["offset"][sl], r["actor"][sl], np.where(r["shadow"][sl], 255, 0).astype(np.uint8))
        frames.append(dict(rgba=rgba, data=data, ox=int(x0 - sr.AX), oy=int(y0 - sr.AY)))
        return len(frames) - 1

    # one sequence of poses per animation: (name, [(mats_rig, root_xz_rel)], fps)
    seqs = []
    n = WALK_FRAMES if not max_frames else min(WALK_FRAMES, max_frames)
    walk = [man.mats("walk", i / WALK_FRAMES) for i in range(n)]  # treadmill: the page moves the figure
    seqs.append(("walk", [(m, None) for m in walk], None))
    for name, (c, _) in clips.items():
        poses = []
        n = len(c) if not max_frames else min(len(c), max_frames)
        root0 = c.root[0].astype(np.float64)
        for i in range(n):
            with man.sculpt.worn():
                mats, root = c.pose(i)
            poses.append((strip_root(mats, root), (root - root0)[[2, 0]]))  # (forward = rig +z, side = rig +x)
        seqs.append((name, poses, c.fps))
    total = len(facings) * sum(len(p) for _, p, _ in seqs)
    done = 0
    for name, poses, fps in seqs:
        per_facing = []
        for f in facings:
            idx = []
            for mats, _ in poses:
                idx.append(add(sr.render(mats, f)))
                done += 1
                if done % 50 == 0:
                    el = time.time() - t0
                    log(f"[sprites] {done}/{total} frames ({el:.0f}s, about {el / done * (total - done):.0f}s left)")
            per_facing.append(idx)
        a = dict(frames=per_facing)
        if name == "walk":
            a.update(loop=True, stride_m=motion.STRIDE / lv.UNITS_PER_M, frames_per_cycle=len(poses))
        else:
            U = lv.UNITS_PER_M
            a.update(loop=False, fps=float(fps), root=[[round(float(r[0]) / U, 5), round(float(r[1]) / U, 5)]
                                                      for _, r in poses], source=clips[name][1])
        anims[name] = a
    if "onetwo" in anims:
        anims["idle"] = dict(of="onetwo", first=IDLE["first"],
                             count=min(IDLE["count"], len(anims["onetwo"]["frames"][0])), fps=IDLE["fps"], pingpong=True)
    log(f"[sprites] {len(frames)} frames rendered ({time.time() - t0:.0f}s)")
    return frames, anims, dict(splats=splats, bb=bb, color=list(graybox.BB_COLOR))


def pack_atlas(frames: List[dict], width: int = 1024):
    """Shelf packing (tallest first, 1 px gap).  Returns (colour atlas, data atlas, rects [x, y, w, h])."""
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
    color = np.zeros((H, width, 4), np.uint8)
    data = np.zeros((H, width, 4), np.uint8)
    data[..., 3] = 255
    data[..., 0] = 128  # (offset 0 where nothing is)
    for f, (x, y, w, h) in zip(frames, rects):
        color[y:y + h, x:x + w] = f["rgba"]
        data[y:y + h, x:x + w] = f["data"]
    return color, data, rects


# ---------------------------------------------------------------- the whole build
def build(a, log=print):
    assets = os.path.join(a.out, "assets")
    os.makedirs(assets, exist_ok=True)
    only = set(a.only.split(","))
    st = graybox.Stage(a.bake)
    man_path = os.path.join(assets, "manifest.json")
    manifest = json.loads(Path(man_path).read_text()) if os.path.exists(man_path) else {}
    lv_demo = st.level.demo.get("stand", {"at": [0.0, 0.0], "facing": 90})
    manifest.update(version=1, name="BB field test", layout=st.level.name,
                    camera=dict(elev=st.spec.elev, az=st.spec.az, px_per_unit=st.spec.px_per_unit,
                                world_to_screen=world_to_screen(st.cam), units_per_m=lv.UNITS_PER_M,
                                ground_y=lv.GROUND, note="row 0: pixel x, row 1: pixel y, row 2: camera depth "
                                                         "(smaller = nearer) of world (x, y, z, 1)"),
                    start=dict(at=[float(v) for v in lv_demo["at"]],
                               facing=int(round(float(lv_demo.get("facing", 90)) / 45.0)) % 8 * 45),
                    walk_speed=WALK_SPEED)
    if "level" in only:
        manifest["level"] = export_level(st, assets, a.cell, log=log)
    if "sprites" in only:
        frames, anims, info = render_sprites(a.bb, a.clip, st.spec, max_frames=a.max_frames, log=log)
        color, data, rects = pack_atlas(frames)
        save_rgba(color, os.path.join(assets, "sprites.png"))
        save_rgba(data, os.path.join(assets, "sprites_data.png"))
        manifest["sprites"] = dict(color="sprites.png", data="sprites_data.png", depth_scale=SPRITE_DEPTH_SCALE,
                                   depth_zero=32768, facings=list(FACINGS), anims=anims, mannequin=info,
                                   frames=[r + [f["ox"], f["oy"]] for r, f in zip(rects, frames)],
                                   frame_note="[x, y, w, h, ox, oy]: rectangle in both atlases; its top-left "
                                              "pixel lies (ox, oy) from the anchor pixel (the pixel that holds "
                                              "the figure's ground point)")
    Path(man_path).write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    if "page" in only:
        shutil.copyfile(TEMPLATE, os.path.join(a.out, "index.html"))
    problems = check(a.out)
    if problems:
        raise SystemExit("[check] " + "\n[check] ".join(problems))
    sizes = {f: os.path.getsize(os.path.join(a.out, f)) for f in ["index.html"] + [
        "assets/" + n for n in sorted(os.listdir(assets))] if os.path.exists(os.path.join(a.out, f))}
    log("[build] " + ", ".join(f"{k} {v / 1024:.0f} KB" for k, v in sizes.items()) +
        f"; total {sum(sizes.values()) / 1e6:.2f} MB")


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
        T = L["terrain"]
        p = os.path.join(assets, T["file"])
        if not os.path.exists(p):
            out.append(f"{T['file']} missing")
        elif list(load_rgba(p).shape[1::-1]) != T["size"]:
            out.append(f"{T['file']} is not {T['size']}")
    else:
        out.append("no level in the manifest")
    if "sprites" in m:
        S = m["sprites"]
        shapes = {}
        for k in ("color", "data"):
            p = os.path.join(assets, S[k])
            if not os.path.exists(p):
                out.append(f"{S[k]} missing")
            else:
                shapes[k] = load_rgba(p).shape
        if len(set(shapes.values())) > 1:
            out.append(f"sprite atlases differ in size: {shapes}")
        if shapes:
            Hh, Ww = next(iter(shapes.values()))[:2]
            for i, (x, y, w, h, ox, oy) in enumerate(S["frames"]):
                if x < 0 or y < 0 or x + w > Ww or y + h > Hh or w <= 0 or h <= 0:
                    out.append(f"frame {i} lies outside the atlas")
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
            if not an.get("loop") and len(an.get("root", [])) != len(an["frames"][0]):
                out.append(f"anim {name}: {len(an.get('root', []))} root motion entries for {len(an['frames'][0])} frames")
    else:
        out.append("no sprites in the manifest")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="export the level layers, the BB sprites and the page")
    b.add_argument("-o", "--out", default="out/play")
    b.add_argument("--bake", default=graybox.default_out(isocam.RefCam().elev), help="baked level folder (graybox.py build)")
    b.add_argument("--bb", default="out/bb2", help="baked bare mannequin (mitten hands)")
    b.add_argument("--clip", action="append", default=None,
                   help="name=path of an imported clip (repeatable); default: onetwo=out/onetwo3/5m/clip.npz and "
                        "inout=out/inout3/5m/clip.npz")
    b.add_argument("--only", default="level,sprites,page", help="comma list of: level, sprites, page")
    b.add_argument("--cell", type=float, default=0.25, help="terrain cell (metres)")
    b.add_argument("--max-frames", type=int, default=0, help="render at most this many frames per animation (tests)")
    b.add_argument("--threads", type=int, default=2)
    c = sub.add_parser("check", help="manifest <-> files")
    c.add_argument("-o", "--out", default="out/play")
    a = ap.parse_args()
    if a.cmd == "check":
        problems = check(a.out)
        print("\n".join(problems) if problems else "[check] ok")
        raise SystemExit(1 if problems else 0)
    if a.clip is None:
        a.clip = ["onetwo=out/onetwo3/5m/clip.npz", "inout=out/inout3/5m/clip.npz"]
    import torch  # noqa: PLC0415

    if a.threads > 0:
        torch.set_num_threads(a.threads)
    t0 = time.time()
    build(a)
    print(f"[build] done in {time.time() - t0:.0f}s -> {a.out}/index.html")


if __name__ == "__main__":
    main()

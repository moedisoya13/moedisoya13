"""Colossus: the walking Nike filling an iPhone screen, seen from human eye level.

Pixel-art grid × integer pixel size = the phone's native resolution, e.g.
131 × 284 pixels × 9 = 1179 × 2556 (iPhone 15 / 15 Pro / 16).

What makes her read as a *colossus* rather than a statuette:
  * the camera stands at human eye height (≈1.6 m) on the ground and looks up;
    the horizon therefore sits at eye level, low in the frame
  * giant flagstones recede to the horizon and fade into dusk haze
  * tiny people stand on the plaza; their heads all touch the horizon line
  * a real shadow map: she casts a long shadow on the plaza and on herself
  * a slower, heavier gait and a small camera jolt at every footfall

    python examples/nike/colossus.py -o out/nike_colossus                # walk loop + still
    python examples/nike/colossus.py -o out/nike_colossus --clips orbit  # slow orbit
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))
import nike  # noqa: E402
from pixelsplat.camera import Camera, look_at  # noqa: E402
from pixelsplat.raster import RasterConfig  # noqa: E402
from pixelsplat.shade import (FrameConfig, Light, ShadeConfig, aces, linear_to_srgb,  # noqa: E402
                              postprocess, render_gbuffer_frame, shade, srgb_to_linear)
from pixelsplat.shadow import make_shadow_map, visibility, world_points  # noqa: E402
from pixelsplat.skin import pose_splats  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402

SCREENS = {  # native portrait resolutions
    "iphone15": (1179, 2556), "iphone16": (1179, 2556), "iphone15pro": (1179, 2556),
    "iphone16pro": (1206, 2622), "iphone15promax": (1290, 2796), "iphone16promax": (1320, 2868),
}
UNIT_M = 20.0  # 1 model unit = 20 m → she stands ≈37 m tall (Statue of Liberty ≈46 m)
GROUND = nike.GROUND
TILE = nike.SPEED / 2  # flagstone size; the plaza repeats exactly every half walk cycle → seamless loops


@dataclass
class Look:
    # low dusk sun from her left (screen right), a little in front: warm marble, deep shadows
    sun_dir: tuple = (0.86, 0.42, 0.30)
    sun_col: tuple = (1.0, 0.74, 0.50)
    sun_int: float = 3.4
    rim_dir: tuple = (-0.75, 0.35, -0.55)  # cool rim from behind on the shadow side
    rim_col: tuple = (0.50, 0.62, 1.0)
    rim_int: float = 1.1
    zenith: tuple = (0.07, 0.09, 0.22)  # sky colours, linear
    horizon: tuple = (0.95, 0.50, 0.30)
    ambient: tuple = (0.12, 0.13, 0.22)
    ground_albedo: tuple = (0.62, 0.56, 0.50)  # sRGB
    fog: float = 0.22  # per model unit
    dither_levels: int = 28


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16.0


def phone_camera(eye, target, w, h, vfov_deg) -> Camera:
    V = look_at(eye, target)
    f = (h / 2.0) / math.tan(math.radians(vfov_deg) / 2.0)
    A = np.array([[f, 0, w / 2.0, 0], [0, f, h / 2.0, 0], [0, 0, 1.0, 0]])
    return Camera(V, A, w, h, False)


def _hash2(i, j):
    h = (i * 73856093) ^ (j * 19349663)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def tonemap(lin):
    return linear_to_srgb(aces(lin))


def environment(cam: Camera, look: Look, sm, contact=None, ss: int = 2) -> tuple:
    """Sky + plaza behind the statue, (H,W,3) sRGB, plus per-pixel ground distance (inf for sky).

    ``contact`` = (x, z) of her feet: a soft contact shadow so she stands *on* the plaza."""
    hi = Camera(cam.viewmat, np.diag([ss, ss, 1.0]) @ cam.A, cam.width * ss, cam.height * ss, False)
    rays = hi.pixel_rays().astype(np.float64)
    eye = hi.position
    up = rays[..., 1]
    hz, zn = np.asarray(look.horizon), np.asarray(look.zenith)
    s = np.clip(up / 0.55, 0, 1) ** 0.7
    sky = hz * (1 - s[..., None]) + zn * s[..., None]
    # the sun: a big stylised disc with a wide warm glow
    Ls = np.asarray(look.sun_dir) / np.linalg.norm(look.sun_dir)
    cosang = np.clip((rays * Ls).sum(-1), -1, 1)
    ang = np.degrees(np.arccos(cosang))
    glow = 0.9 * np.exp(-(ang / 9.0) ** 2) + 0.45 * np.exp(-(ang / 40.0) ** 2)
    sky = sky + np.asarray(look.sun_col)[None, None] * glow[..., None]
    sky = np.where((ang < 2.6)[..., None], np.asarray((3.2, 2.6, 1.7)), sky)
    ground = up < -1e-4
    t = np.where(ground, (GROUND - eye[1]) / np.where(ground, up, -1), np.inf)
    P = eye + rays * np.where(ground, t, 0)[..., None]
    i, j = np.floor(P[..., 0] / TILE).astype(np.int64), np.floor(P[..., 2] / TILE).astype(np.int64)
    fx, fz = P[..., 0] / TILE - i, P[..., 2] / TILE - j
    mortar = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fz, 1 - fz)) < 0.035
    var = 0.86 + 0.22 * _hash2(i, j)
    alb = srgb_to_linear(np.asarray(look.ground_albedo)) * var[..., None] * np.where(mortar, 0.45, 1.0)[..., None]
    L = np.asarray(look.sun_dir) / np.linalg.norm(look.sun_dir)
    vis = visibility(sm, P, bias=0.02, pcf=1) if sm is not None else 1.0
    sun = np.asarray(look.sun_col) * look.sun_int * max(L[1], 0) * np.where(ground, vis, 1.0)[..., None]
    amb = np.ones(P.shape[:-1])
    if contact is not None:
        r = np.sqrt(((P[..., 0] - contact[0]) / 0.34) ** 2 + ((P[..., 2] - contact[1]) / 0.26) ** 2)
        amb = 1 - 0.75 * np.ceil(np.clip(1 - r, 0, 1) * 3) / 3  # quantized (pixel-art) contact shadow
        sun = sun * (1 - 0.6 * (1 - amb))[..., None]
    lit = alb / np.pi * sun * 1.3 + alb * np.asarray(look.ambient) * 0.9 * amb[..., None]
    fogk = 1 - np.exp(-np.where(ground, t, 0) * look.fog)
    lit = lit * (1 - fogk[..., None]) + hz * fogk[..., None]
    lin = np.where(ground[..., None], lit, sky)
    lin = lin.reshape(cam.height, ss, cam.width, ss, 3).mean((1, 3))
    dist = np.where(ground, t, np.inf).reshape(cam.height, ss, cam.width, ss).min((1, 3))
    img = tonemap(lin)
    # ordered dither into a limited number of tones: retro gradient bands instead of smooth ramps
    H, W = img.shape[:2]
    thr = np.tile(BAYER4, (H // 4 + 1, W // 4 + 1))[:H, :W, None]
    q = look.dither_levels
    img = np.floor(img * q + thr) / q
    return np.clip(img, 0, 1).astype(np.float32), dist


# ---------------------------------------------------------------- people for scale
PERSON_M = 1.72


def person_mask(hpx: int) -> np.ndarray:
    """Pixel-art silhouette of a standing person, ``hpx`` pixels tall."""
    hpx = max(hpx, 2)
    if hpx < 8:  # far away: a one-pixel-wide figure reads as a person, a block does not
        return np.ones((hpx, 1), bool)
    w = max(3, int(round(hpx * 0.34)))
    v = (np.arange(hpx) + 0.5) / hpx
    u = (np.arange(w) + 0.5) / w - 0.5
    U, Vv = np.meshgrid(u, v)
    head = ((U / 0.32) ** 2 + ((Vv - 0.09) / 0.10) ** 2) <= 1.0
    body = (Vv > 0.17) & (Vv < 0.58) & (np.abs(U) < 0.5 - 0.15 * (Vv - 0.17))
    legs = (Vv >= 0.55) & ((np.abs(U - 0.17) < 0.13) | (np.abs(U + 0.17) < 0.13))
    m = head | body | legs
    return m


def plaza_people(period: float, seed: int = 4):
    """(x, z) positions of onlookers; the pattern repeats every ``period`` along z (seamless loops)."""
    rng = np.random.default_rng(seed)
    base = []
    for _ in range(9):
        side = rng.choice([-1, 1])
        x = side * rng.uniform(0.45, 2.4)
        z = rng.uniform(0, period)
        n = rng.integers(1, 4)  # small groups
        for k in range(n):
            base.append((x + rng.uniform(-0.06, 0.06), z + rng.uniform(-0.06, 0.06)))
    return [(x, z + k * period) for k in range(-4, 6) for x, z in base]


def draw_people(img, cam: Camera, people, statue_depth, statue_mask, look: Look):
    h_units = PERSON_M / UNIT_M
    eye = cam.position
    fwd = cam.viewmat[2, :3]
    P = cam.A @ cam.viewmat
    hz = tonemap(np.asarray(look.horizon))
    order = sorted(people, key=lambda q: -np.linalg.norm(np.array([q[0], GROUND, q[1]]) - eye))
    for x, z in order:
        foot = np.array([x, GROUND, z, 1.0])
        head = np.array([x, GROUND + h_units, z, 1.0])
        dz = float((foot[:3] - eye) @ fwd)
        if dz < 1.0:  # behind or too close to the camera
            continue
        a, b = P @ foot, P @ head
        fx, fy = a[0] / a[2], a[1] / a[2]
        hy = b[1] / b[2]
        hpx = int(round(fy - hy))
        if hpx < 2 or hpx > 60:
            continue
        m = person_mask(hpx)
        y0, x0 = int(round(hy)), int(round(fx - m.shape[1] / 2))
        H, W = img.shape[:2]
        fogk = 1 - math.exp(-np.linalg.norm(foot[:3] - eye) * look.fog)
        col = np.array([0.07, 0.06, 0.09]) * (1 - fogk) + hz * fogk
        for yy in range(m.shape[0]):
            for xx in range(m.shape[1]):
                Y, X = y0 + yy, x0 + xx
                if m[yy, xx] and 0 <= Y < H and 0 <= X < W:
                    if statue_mask[Y, X] and statue_depth[Y, X] < dz:
                        continue
                    img[Y, X] = col
    return img


# ---------------------------------------------------------------- frames
class Colossus:
    def __init__(self, out_dir, model_path=None, look=Look(), app=True):
        self.model = SplatModel.load(model_path or os.path.join(out_dir, "nike_splats.pt"))
        self.skel = nike.make_skeleton()
        self.W = torch.as_tensor(nike.skin_weights(self.skel, self.model.means.detach().numpy()))
        if app:
            nike.bone_patches(self.model, self.W, 120)
        self.app = app
        self.look = look
        self.shade_cfg = ShadeConfig(
            lights=[Light(look.sun_dir, look.sun_col, look.sun_int), Light(look.rim_dir, look.rim_col, look.rim_int)],
            sky=look.ambient, ground=(0.10, 0.07, 0.06), env_strength=1.0, outline=0.28, outline_depth=0.08,
            background=(0, 0, 0))

    def frame(self, w, h, phase, advance, cam_az, cam_dist, eye_h, look_y, vfov, people, shake=0.0):
        mats, root = nike.walk_pose(self.skel, phase, advance)
        with torch.no_grad():
            pose = pose_splats(self.model, self.W, torch.as_tensor(mats))
        a = math.radians(cam_az)
        track = np.array([0.0, 0.0, advance])
        eye = track + np.array([math.sin(a) * cam_dist, GROUND + eye_h, math.cos(a) * cam_dist])
        target = track + np.array([0.0, look_y, -0.15])
        if shake:
            # a short jolt every time a foot lands (phase 0 and 0.5)
            dt = (phase % 0.5)
            jolt = shake * math.exp(-dt / 0.05) * math.cos(2 * math.pi * dt / 0.09)
            target[1] += math.tan(math.radians(jolt)) * np.linalg.norm(target - eye)
        cam = phone_camera(eye, target, w, h, vfov)
        means, R, scales = pose
        sm = make_shadow_map(means, R, scales, self.model.opacity(), self.look.sun_dir,
                             center=(0.0, -0.1, advance - 0.2), extent=1.45, res=320)
        fc = FrameConfig(raster=RasterConfig(tile=4, k=256, hard=self.app), shade=self.shade_cfg, snap=self.app)
        gb = render_gbuffer_frame(self.model, cam, fc, pose)
        mask = gb["alpha"] > self.shade_cfg.alpha_threshold
        P = world_points(cam, np.where(mask, gb["depth"], 1.0))
        vis = np.where(mask, visibility(sm, P, bias=0.025, pcf=1), 1.0)
        bg, _ = environment(cam, self.look, sm, contact=(float(root[0]), float(root[2]) + 0.02))
        img = postprocess(shade(gb, cam, self.shade_cfg, light_vis=[vis, None]), gb, self.shade_cfg, cam,
                          background=bg)
        return draw_people(img, cam, people, gb["depth"], mask, self.look)


def to_screen(img, pixel, sw, sh):
    big = np.repeat(np.repeat(img, pixel, 0), pixel, 1)
    y0 = (big.shape[0] - sh) // 2
    x0 = (big.shape[1] - sw) // 2
    return big[y0:y0 + sh, x0:x0 + sw]


def render_clip(out_dir, name, total, render_fn, pixel, sw, sh, fps, loops=4, preview_div=3):
    """Render ``total`` frames straight to PNG files (nothing is kept in memory, so long clips at
    phone resolution fit in RAM) and resume if frames already exist; then encode MP4 + GIF preview."""
    tmp = os.path.join(out_dir, "_frames_" + name)
    os.makedirs(tmp, exist_ok=True)
    t0 = time.time()
    for i in range(total):
        path = os.path.join(tmp, f"{i:04d}.png")
        if os.path.exists(path):
            continue
        img = to_screen(render_fn(i), pixel, sw, sh)
        Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path + ".part.png")
        os.replace(path + ".part.png", path)
        if i % 12 == 0:
            print(f"[colossus] {name} frame {i}/{total} ({time.time() - t0:.0f}s)", flush=True)
    mp4 = os.path.join(out_dir, name + ".mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", str(loops - 1), "-framerate", str(fps), "-i",
                    os.path.join(tmp, "%04d.png"),
                    # H.264 4:2:0 needs even sizes: 1179 px → 1178 px (one column off the edge, imperceptible)
                    "-vf", "crop=floor(iw/2)*2:floor(ih/2)*2:0:0",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "14",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)
    # small looping GIF preview (1/3 size, still pixel-exact because the pixel size is a multiple of 3)
    ims = []
    for i in range(total):
        im = Image.open(os.path.join(tmp, f"{i:04d}.png"))
        ims.append(im.resize((im.width // preview_div, im.height // preview_div), Image.NEAREST))
    ims[0].save(os.path.join(out_dir, name + "_preview.gif"), save_all=True, append_images=ims[1:],
                duration=int(round(1000 / fps)), loop=0)
    shutil.rmtree(tmp)
    return mp4


def main():
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-o", "--out", default="out/nike_colossus")
    ap.add_argument("--model", default=None, help="splat model (.pt); default <out>/nike_splats.pt")
    ap.add_argument("--screen", default="iphone15", help="preset (%s) or WxH" % ", ".join(SCREENS))
    ap.add_argument("--pixel", type=int, default=9, help="screen pixels per art pixel")
    ap.add_argument("--clips", default="walk,still", help="walk,still,orbit")
    ap.add_argument("--cycle-frames", type=int, default=36, help="frames per walk cycle (slower = heavier)")
    ap.add_argument("--cycles", type=int, default=2, help="walk cycles per loop")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--az", type=float, default=12.0, help="camera azimuth around her (deg, 0 = in front)")
    ap.add_argument("--dist", type=float, default=1.55, help="camera distance (model units; 1 unit = 20 m)")
    ap.add_argument("--eye", type=float, default=1.6, help="camera height above the plaza (metres)")
    ap.add_argument("--look-y", type=float, default=-0.12, help="height the camera looks at (model units)")
    ap.add_argument("--vfov", type=float, default=66.0)
    ap.add_argument("--shake", type=float, default=0.35, help="footfall jolt (deg)")
    ap.add_argument("--no-app", action="store_true", help="disable Almost Pixel Perfect")
    ap.add_argument("--max-frames", type=int, default=0, help="debug: stop after N frames")
    a = ap.parse_args()
    sw, sh = SCREENS[a.screen] if a.screen in SCREENS else map(int, a.screen.lower().split("x"))
    gw, gh = math.ceil(sw / a.pixel), math.ceil(sh / a.pixel)
    os.makedirs(a.out, exist_ok=True)
    print(f"[colossus] screen {sw}x{sh}, art grid {gw}x{gh} × {a.pixel}px")
    col = Colossus(a.out, a.model, app=not a.no_app)
    n = a.cycle_frames
    period = nike.SPEED * a.cycles
    people = plaza_people(period)
    eye_h = a.eye / UNIT_M
    clips = set(a.clips.split(","))
    t0 = time.time()

    def render(i, total, orbit=False):
        phase = (i / n) % 1.0
        adv = nike.SPEED * i / n
        az = a.az + (360.0 * i / total if orbit else 0.0)
        return col.frame(gw, gh, phase, adv, az, a.dist, eye_h, a.look_y, a.vfov, people, a.shake)

    if "walk" in clips:
        total = n * a.cycles
        if a.max_frames:
            total = min(total, a.max_frames)
        mp4 = render_clip(a.out, "colossus_walk", total, lambda i: render(i, total), a.pixel, sw, sh, a.fps)
        print("[colossus] wrote", mp4)
    if "still" in clips:
        img = to_screen(render(int(0.62 * n), n), a.pixel, sw, sh)
        Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(
            os.path.join(a.out, "colossus_wallpaper.png"))
        print("[colossus] wrote colossus_wallpaper.png")
    if "orbit" in clips:
        total = n * 4
        if a.max_frames:
            total = min(total, a.max_frames)
        mp4 = render_clip(a.out, "colossus_orbit", total, lambda i: render(i, n * 4, orbit=True), a.pixel, sw, sh,
                          a.fps, loops=2)
        print("[colossus] wrote", mp4)
    print(f"[colossus] done ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()

"""Gray-box level in the reference game's camera (orthographic 3/4 top-down, world-locked pixel grid).

    python examples/map/graybox.py build   -o out/map          # layout.json -> splats -> baked level
    python examples/map/graybox.py render  -o out/map          # overview, reference-view still, BB for scale
    python examples/map/graybox.py clip    -o out/map          # the BB walks a path, the camera follows
    python examples/map/graybox.py compare -o out/map --ref-video ref.mp4 --ref-time 15.0

How a picture is made (all with the engine's own pieces: rasterize, G-buffer vote / despeckle, deferred
shading, shadow maps, patch snapping):

    build   the level's splats are rasterized ONCE into a G-buffer that covers the whole level, on a pixel
            grid that is fixed in the world, plus one shadow map of the level for the sun
    frame   = a window of that G-buffer  +  the posed mannequin rasterized into a small window and merged
            by depth  ->  sun visibility (level map x mannequin map)  ->  shade  ->  outline  ->  upscale

The static world costs nothing per frame and cannot shimmer when the camera pans (see isocam.py).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Optional, Sequence

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))
import isocam  # noqa: E402
import level as lv  # noqa: E402
from pixelsplat import gbuffer as gbuf  # noqa: E402
from pixelsplat.camera import Camera, orbit_camera  # noqa: E402
from pixelsplat.raster import RasterConfig, rasterize  # noqa: E402
from pixelsplat.shade import (Light, ShadeConfig, gbuffer_from_render, postprocess, render_gbuffer_frame, shade,  # noqa: E402
                              stylized, upscale)
from pixelsplat.shadow import ShadowMap, make_shadow_map, visibility  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402

BAKE_FILE, SPLAT_FILE = "level_bake.npz", "level_splats.pt"
# Sun as seen by the reference camera: shadows fall to the screen's left and a little towards the viewer,
# about 0.7 body heights long (read off the standing character at 15 s; an estimate).
SUN_ALT, SUN_AZ_REL = 52.0, 100.0  # altitude; azimuth measured like the camera's, relative to it (90 = screen right)
BACKGROUND = (0.075, 0.075, 0.11)
GUARD = 4  # art pixels shaded beyond the frame (>= the widest neighbourhood: SSAO reaches 3 px)


def sun_direction(spec: isocam.RefCam) -> np.ndarray:
    """World direction TOWARDS the sun."""
    az, alt = math.radians(spec.az + SUN_AZ_REL), math.radians(SUN_ALT)
    return np.array([math.sin(az) * math.cos(alt), math.sin(alt), math.cos(az) * math.cos(alt)])


BB_COLOR = (0.86, 0.60, 0.36)  # flat warm clay: the one accent in a grey level, so the figure reads at 16 px


def graybox_shade(sun) -> ShadeConfig:
    """Neutral daylight for untextured greys: a white sun, a weak cool fill from the camera's side, a
    grey sky; the engine's stylized options without its colour grading, bloom or low-key exposure."""
    fill = np.array([-sun[0], 0.6, -sun[2]])  # from the side the sun does not reach
    base = ShadeConfig(lights=[Light(tuple(sun), (1.0, 0.98, 0.95), 2.8), Light(tuple(fill), (0.80, 0.86, 1.0), 0.35)],
                       sky=(0.25, 0.27, 0.31), ground=(0.09, 0.09, 0.09), background=BACKGROUND)
    return stylized(base, low_key=False, bloom=0.0, glow=0.0, rim=0.0, ssao=0.0, saturation=1.0, tint_strength=0.08,
                    contrast=0.18, terminator=0.6, cavity=0.2, ridge=0.12)


# ---------------------------------------------------------------- rasterizing something big, in chunks
def raster_tiled(means, R, scales, opacity, feats, cam: Camera, rc: RasterConfig, chunk: int = 256,
                 max_k: int = 1024) -> dict:
    """The engine's ``rasterize`` over a large ORTHOGRAPHIC image, one window at a time (bounded memory:
    the rasterizer is dense per tile).  Returns a plain numpy G-buffer like ``gbuffer_from_render``."""
    H, W = cam.height, cam.width
    pix = isocam.project(cam, means.numpy())
    rad = 3.0 * scales.max(1).values.numpy() * cam.A[0, 0] + 2.0
    out = dict(alpha=np.zeros((H, W), np.float32), albedo=np.zeros((H, W, 3), np.float32),
               rough=np.ones((H, W), np.float32), metal=np.zeros((H, W), np.float32),
               normal=np.zeros((H, W, 3), np.float32), depth=np.zeros((H, W), np.float32),
               id=np.full((H, W), -1, np.int64))
    for y0 in range(0, H, chunk):
        for x0 in range(0, W, chunk):
            w, h = min(chunk, W - x0), min(chunk, H - y0)
            sel = ((pix[:, 0] > x0 - rad) & (pix[:, 0] < x0 + w + rad) & (pix[:, 1] > y0 - rad) &
                   (pix[:, 1] < y0 + h + rad))
            if not sel.any():
                continue
            idx = torch.as_tensor(np.nonzero(sel)[0])
            sub = isocam.window(cam, x0, y0, w, h)
            cfg = rc
            with torch.no_grad():
                while True:
                    o = rasterize(means[idx], R[idx], scales[idx], opacity[idx], feats[idx], R[idx][..., 2], sub, cfg)
                    if not (o["overflow_occupied"] > 0.01 and o["overflow_open"] > 0 and cfg.k < max_k):
                        break
                    cfg = replace(cfg, k=cfg.k * 2)
            g = gbuffer_from_render(o)
            g["id"] = np.where(g["id"] >= 0, idx.numpy()[np.maximum(g["id"], 0)], -1)
            for key in out:
                out[key][y0:y0 + h, x0:x0 + w] = g[key]
    return out


def model_tensors(model: SplatModel):
    with torch.no_grad():
        return model.means.detach(), model.rot().detach(), model.scales().detach(), model.opacity().detach(), \
            model.material().detach()


# ---------------------------------------------------------------- build: layout -> splats -> baked level
def grid_overlay(level: lv.Level, cam: Camera, P: np.ndarray, mat: np.ndarray, albedo: np.ndarray) -> np.ndarray:
    """One-pixel scale lines on walkable ground, every ``grid.minor`` metres (darker every ``grid.major``).
    Drawn per PIXEL from the pixel's world position, so the lines stay one pixel wide and crisp."""
    U = lv.UNITS_PER_M
    xm, zm = P[..., 0] / U, P[..., 2] / U
    o = isocam.unproject_to_plane(cam, 0.0, 0.0, lv.GROUND)
    ex = (isocam.unproject_to_plane(cam, 1.0, 0.0, lv.GROUND) - o) / U  # metres per pixel step right
    ey = (isocam.unproject_to_plane(cam, 0.0, 1.0, lv.GROUND) - o) / U  # ... and per pixel step down
    half_x = 0.5 * max(abs(ex[0]), abs(ey[0]))
    half_z = 0.5 * max(abs(ex[2]), abs(ey[2]))
    walk = (mat == lv.MAT["grass"]) | (mat == lv.MAT["path"])
    out = albedo.copy()
    for step, k in ((float(level.grid.get("minor", 1.0)), 0.90), (float(level.grid.get("major", 5.0)), 0.74)):
        if step <= 0:
            continue
        on = (np.abs(xm - np.round(xm / step) * step) < half_x) | (np.abs(zm - np.round(zm / step) * step) < half_z)
        out[walk & on] = albedo[walk & on] * k
    return out


def bake(level: lv.Level, spec: isocam.RefCam, spacing: float = 0.125, shadow_res: int = 1024, log=print):
    t0 = time.time()
    sp = level.splats(spacing)
    model = lv.to_model(sp)
    log(f"[build] {len(sp)} splats ({time.time() - t0:.1f}s): " +
        ", ".join(f"{m} {int((sp.mat == i).sum())}" for i, m in enumerate(lv.MATERIALS)))
    cam = isocam.level_camera(spec, *level.bounds_world())
    T = model_tensors(model)
    rc = RasterConfig(tile=4, k=48, hard=True, cutoff=2.0)
    gb = raster_tiled(*T, cam.scaled(2), rc)
    gb = gbuf.select_downsample(gb, 2, 0.5, "medoid", tie_covers=True)
    gb = gbuf.despeckle(gb, 0.5, depth_tol=0.25)
    log(f"[build] level G-buffer {cam.width}x{cam.height} art px, {float((gb['alpha'] > 0.5).mean()) * 100:.0f}% covered "
        f"({time.time() - t0:.1f}s)")
    covered = gb["alpha"] > 0.5
    mat = np.where(covered & (gb["id"] >= 0), sp.mat[np.maximum(gb["id"], 0)], -1)
    P = gbuf.world_positions(cam, gb["depth"])
    gb["albedo"] = grid_overlay(level, cam, P, mat, gb["albedo"])
    # the level's shadow map: the same splats seen from the sun
    sun = sun_direction(spec)
    lo, hi = level.bounds_world()
    centre, extent = 0.5 * (lo + hi), 0.5 * float(np.linalg.norm(hi - lo)) + 0.5
    lcam = orbit_camera(math.degrees(math.atan2(sun[0], sun[2])), math.degrees(math.asin(sun[1])), shadow_res,
                        shadow_res, radius=isocam.RADIUS, ortho=True, ortho_extent=extent, target=tuple(centre))
    sg = raster_tiled(*T, lcam, RasterConfig(tile=4, k=64, hard=True, cutoff=2.0, cull_backfaces=False))
    log(f"[build] sun shadow map {shadow_res}^2, texel {2 * extent / shadow_res:.3f} units ({time.time() - t0:.1f}s)")
    data = dict(alpha=gb["alpha"], albedo=gb["albedo"], normal=gb["normal"], depth=gb["depth"], mat=mat.astype(np.int16),
                rough=gb["rough"], cam_view=cam.viewmat, cam_A=cam.A, cam_size=np.array([cam.width, cam.height]),
                sun=sun, sm_view=lcam.viewmat, sm_A=lcam.A, sm_depth=sg["depth"].astype(np.float32),
                sm_covered=sg["alpha"] > 0.5, spec=np.array([spec.elev, spec.az, spec.px_per_unit, *spec.view]),
                spacing=np.array(spacing))
    return model, data


def cmd_build(a):
    os.makedirs(a.out, exist_ok=True)
    level = lv.Level.load(a.layout)
    spec = isocam.RefCam(elev=a.elev, az=a.az, px_per_unit=a.px_per_unit, view=(a.view_w, a.view_h))
    model, data = bake(level, spec, a.spacing, a.shadow_res)
    np.savez_compressed(os.path.join(a.out, BAKE_FILE), **data)
    torch.save(model.state_dict(), os.path.join(a.out, SPLAT_FILE))
    shutil.copyfile(a.layout or lv.DEFAULT_LAYOUT, os.path.join(a.out, "layout_used.json"))
    w, d = spec.ground_footprint()
    print(f"[build] camera: orthographic, elevation {spec.elev:g} deg, {spec.px_per_unit:g} art px per unit "
          f"({spec.px_per_unit * lv.UNITS_PER_M:.2f} px per metre); one {spec.view[0]}x{spec.view[1]} screen shows "
          f"{w / lv.UNITS_PER_M:.1f} m x {d / lv.UNITS_PER_M:.1f} m of ground; a 1.75 m pole is "
          f"{spec.person_px():.1f} px tall")
    print(f"[build] saved {a.out}/{BAKE_FILE}, {a.out}/{SPLAT_FILE}")


# ---------------------------------------------------------------- the stage: baked level + actors
class Mannequin:
    """The bare mannequin ("base body") of examples/soldier as an actor: a thinned copy of its splats,
    rigid per-bone binding, patch snapping.

    Why thinned: the figure is about 6 x 16 art pixels, so ALL its splats fall into a handful of raster
    tiles, and the rasterizer's cost grows with the splats per tile (60k splats: > 10 s a frame; 1000,
    each grown to keep the surface closed: well under a second, same picture at this size)."""

    def __init__(self, folder: str, splats: int = 1000, patches: int = 24, seed: int = 0, color=BB_COLOR,
                 shadow_splats: int = 350):
        sys.path.insert(0, str(HERE.parent / "soldier"))
        import motion  # noqa: PLC0415
        import soldier  # noqa: PLC0415

        self.motion, self.soldier = motion, soldier
        self.sculpt, model, bones = soldier.load_model(folder)
        n = model.n
        if splats and n > splats:
            keep = np.sort(np.random.default_rng(seed).choice(n, splats, replace=False))
            grow = 0.5 * math.log(n / splats)  # area per splat grows n/splats times -> radius by its root
            kt = torch.as_tensor(keep)
            model.prune(kt)
            with torch.no_grad():
                model.log_scales += grow
            bones = bones[keep]
        if color is not None:  # one flat colour instead of the rig's debug colours (joint beads, discs)
            with torch.no_grad():
                c = torch.as_tensor(np.asarray(color, np.float32)).clamp(1e-3, 1 - 1e-3)
                model.albedo_logit.copy_(torch.log(c / (1 - c)).expand_as(model.albedo_logit))
        self.model, self.bones = model, bones
        # the sun's shadow map only needs the silhouette: an even thinner set, grown again
        step = max(1, model.n // max(shadow_splats, 1))
        self.shadow_idx = torch.arange(0, model.n, step)
        self.shadow_grow = math.sqrt(step)
        self.R = soldier.Renderer(model, bones, app=True, patches=patches)
        self.skel = soldier.SKEL
        self.height = soldier.H

    def mats(self, pose: str = "stand", phase: float = 0.0) -> np.ndarray:
        with self.sculpt.worn():
            if pose == "walk":
                return self.motion.walk_pose(self.skel, phase % 1.0)[0]
            rots, root = self.motion.stand_rots()
            return self.skel.world_mats(rots, root_offset=root)

    @staticmethod
    def place(mats: np.ndarray, world_pos, facing_deg: float) -> np.ndarray:
        """Rest->posed bone matrices moved so the figure stands on ``world_pos`` (a ground point), facing
        ``facing_deg`` (layout convention: 0 = +x, 90 = +z; the rig's own front is +z)."""
        psi = math.radians(90.0 - facing_deg)
        c, s = math.cos(psi), math.sin(psi)
        Rw = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        out = np.asarray(mats, np.float64).copy()
        out[:, :, :3] = Rw @ out[:, :, :3]
        out[:, :, 3] = out[:, :, 3] @ Rw.T + np.array([world_pos[0], world_pos[1] - lv.GROUND, world_pos[2]])
        return out.astype(np.float32)


class Stage:
    def __init__(self, folder: str):
        d = np.load(os.path.join(folder, BAKE_FILE))
        self.gb = {k: d[k] for k in ("alpha", "albedo", "normal", "depth", "rough")}
        self.mat = d["mat"]
        w, h = (int(v) for v in d["cam_size"])
        self.cam = Camera(d["cam_view"], d["cam_A"], w, h, True)
        s = d["spec"]
        self.spec = isocam.RefCam(float(s[0]), float(s[1]), float(s[2]), (int(s[3]), int(s[4])))
        self.sun = d["sun"]
        res = d["sm_depth"].shape[0]
        self.sm = ShadowMap(Camera(d["sm_view"], d["sm_A"], res, res, True), d["sm_depth"], d["sm_covered"])
        self.shade_cfg = graybox_shade(self.sun)
        self.level = lv.Level.load(os.path.join(folder, "layout_used.json"))

    # -- G-buffer of a window, with actors merged in by depth
    def gbuffer(self, x0: int, y0: int, w: int, h: int, actors: Sequence = ()):
        cam = isocam.window(self.cam, x0, y0, w, h)
        H, W = self.cam.height, self.cam.width
        gb = dict(alpha=np.zeros((h, w), np.float32), albedo=np.zeros((h, w, 3), np.float32),
                  rough=np.ones((h, w), np.float32), metal=np.zeros((h, w), np.float32),
                  normal=np.zeros((h, w, 3), np.float32), depth=np.zeros((h, w), np.float32))
        ax0, ay0, ax1, ay1 = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
        if ax1 > ax0 and ay1 > ay0:
            for k in ("alpha", "albedo", "normal", "depth", "rough"):
                gb[k][ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0] = self.gb[k][ay0:ay1, ax0:ax1]
        actor_mask = np.zeros((h, w), bool)
        shadow_maps = []
        for man, mats in actors:
            with torch.no_grad():
                pose = man.R.pose(mats)
            means = pose[0]
            c = means.mean(0).numpy()
            # small window around the figure (whole pixels of the same lattice)
            p = isocam.project(cam, c)
            half = int(math.ceil(0.75 * man.height * self.spec.px_per_unit)) + 4
            wx0, wy0 = int(math.floor(p[0])) - half, int(math.floor(p[1])) - half
            wx1, wy1 = min(wx0 + 2 * half, w), min(wy0 + 2 * half, h)
            wx0, wy0 = max(wx0, 0), max(wy0, 0)
            if wx1 - wx0 >= 4 and wy1 - wy0 >= 4:
                sub = isocam.window(cam, wx0, wy0, wx1 - wx0, wy1 - wy0)
                g = render_gbuffer_frame(man.model, sub, man.R.config(), pose=pose)
                sl = (slice(wy0, wy1), slice(wx0, wx1))
                front = (g["alpha"] > 0.5) & ((gb["alpha"][sl] <= 0.5) | (g["depth"] < gb["depth"][sl]))
                for k in gb:
                    gb[k][sl] = np.where(front if gb[k].ndim == 2 else front[..., None], g[k], gb[k][sl])
                actor_mask[sl] |= front
            si = man.shadow_idx
            shadow_maps.append(make_shadow_map(means[si], pose[1][si], pose[2][si] * man.shadow_grow,
                                               man.model.opacity().detach()[si], self.sun, center=c,
                                               extent=0.85 * man.height, res=96))
        return cam, gb, actor_mask, shadow_maps

    def sun_visibility(self, cam, gb, shadow_maps, crisp: bool = True, actor_mask=None) -> np.ndarray:
        P = gbuf.world_positions(cam, gb["depth"]).astype(np.float64)
        vis = visibility(self.sm, P, bias=0.06, pcf=1, normals=gb["normal"])
        if crisp:  # hard-edged pixel shadows, like the reference; the 3x3 majority removes single-pixel teeth
            from scipy.ndimage import median_filter

            vis = median_filter((vis > 0.5).astype(np.float32), size=3, mode="nearest")
        for sm in shadow_maps:
            v = visibility(sm, P, bias=0.03, pcf=1, normals=gb["normal"])
            if crisp:
                # on the ground one tap: a 3x3 filter + threshold would eat the figure's 1-2 pixel thin
                # shadow; on the figure itself the filtered value (one tap self-shadows in a checker pattern)
                hard = visibility(sm, P, bias=0.03, pcf=0, normals=gb["normal"])
                v = (v > 0.5).astype(np.float32) if actor_mask is None else np.where(actor_mask, v > 0.5, hard)
            vis = vis * v
        return np.where(gb["alpha"] > 0.5, vis, 1.0).astype(np.float32)

    def frame(self, x0: int, y0: int, w: Optional[int] = None, h: Optional[int] = None, actors: Sequence = (),
              outline: float = 0.35, ao: float = 0.45, mode: str = "lit", guard: int = GUARD) -> np.ndarray:
        """One art-resolution picture (h, w, 3) sRGB of the window whose top-left pixel is (x0, y0).

        It is shaded ``guard`` pixels larger on every side and then cut: ambient occlusion, the outline
        and the shadow filter look at neighbouring pixels, so without the band a pixel near the frame
        would change when the frame moves."""
        w, h = w or self.spec.view[0], h or self.spec.view[1]
        if guard > 0:
            return self.frame(x0 - guard, y0 - guard, w + 2 * guard, h + 2 * guard, actors, outline, ao, mode,
                              guard=0)[guard:-guard, guard:-guard]
        cam, gb, actor_mask, sms = self.gbuffer(x0, y0, w, h, actors)
        sc = self.shade_cfg
        mask = gb["alpha"] > 0.5
        if mode == "albedo":
            return np.where(mask[..., None], gb["albedo"], np.asarray(sc.background, np.float32))
        if mode == "normal":
            return np.where(mask[..., None], gb["normal"] * 0.5 + 0.5, np.asarray(sc.background, np.float32))
        vis = self.sun_visibility(cam, gb, sms, actor_mask=actor_mask)
        lin = shade(gb, cam, sc, light_vis=[vis, None])
        P = gbuf.world_positions(cam, gb["depth"])
        if ao > 0:  # the engine's SSAO at the scene's scale (its default radius is for a 2-unit model)
            occ = gbuf.ssao(gb, P, radius_px=3.0, world_radius=0.6)
            lin = lin * (1 - ao * (1 - occ[..., None]))
        img = postprocess(lin, gb, sc, cam)
        if outline > 0:
            img = np.where(edge_mask(gb, P)[..., None], img * (1 - outline), img)
        return img.astype(np.float32)

    # -- convenience
    def window_at(self, focus_world, anchor=(0.5, 0.5), view=None):
        """Float pixel position of the top-left corner of a screen showing ``focus_world`` at ``anchor``."""
        spec = self.spec if view is None else replace(self.spec, view=view)
        return isocam.view_origin(self.cam, spec, focus_world, anchor)


def edge_mask(gb: dict, P: np.ndarray, plane_tol: float = 0.16) -> np.ndarray:
    """Outline pixels: the near side of a depth step, measured as the neighbour's distance from this
    pixel's tangent plane (a plain depth-difference test would fire all over ground seen at a low angle)."""
    mask = gb["alpha"] > 0.5
    d = np.where(mask, gb["depth"], 1e9)
    n = gb["normal"]
    edge = np.zeros(mask.shape, bool)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb_d = gbuf._shift(d, dy, dx, 0.0)  # outside the image counts as nearer: no outline at the frame
        nb_P = gbuf._shift(P, dy, dx)
        off = np.abs(((nb_P - P) * n).sum(-1))
        edge |= mask & (nb_d > d) & ((off > plane_tol) | (nb_d > 1e8))
    return edge


# ---------------------------------------------------------------- output helpers
def save_png(img: np.ndarray, path: str):
    from PIL import Image

    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)


def save_clip(frames: Sequence[np.ndarray], folder: str, name: str, fps: int):
    """GIF + MP4 (frames are already upscaled; nearest-neighbour everywhere, no smoothing)."""
    from PIL import Image

    ims = [Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)) for f in frames]
    # one palette for the whole clip (fitted on 8 frames): no colour flicker, and a far smaller file
    pick = np.linspace(0, len(ims) - 1, min(8, len(ims))).astype(int)
    pal = Image.fromarray(np.concatenate([np.asarray(ims[i]) for i in pick], 1)).quantize(
        colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    gif = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in ims]
    gif[0].save(os.path.join(folder, name + ".gif"), save_all=True, append_images=gif[1:],
                duration=int(round(1000 / fps)), loop=0)
    if shutil.which("ffmpeg"):
        tmp = os.path.join(folder, "_frames_" + name)
        os.makedirs(tmp, exist_ok=True)
        for i, im in enumerate(ims):
            im.save(os.path.join(tmp, f"{i:04d}.png"))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", os.path.join(tmp, "%04d.png"),
                        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "14",
                        os.path.join(folder, name + ".mp4")], check=True)
        shutil.rmtree(tmp)


def reference_art(frame: np.ndarray, pitch: float = 8.745) -> np.ndarray:
    """A frame of the reference video (H, W, 3 in 0..1) resampled onto its own art-pixel grid.
    ``pitch`` = video pixels per art pixel (measured: 8.745); the grid's phase is found per frame,
    because the reference scrolls its art grid with the ground."""
    g = frame.mean(-1)
    offs = []
    for axis in (1, 0):
        d = np.abs(np.diff(g, axis=axis)).mean(axis=1 - axis)
        z = ((d - d.mean()) * np.exp(-2j * np.pi * (np.arange(len(d)) + 1.0) / pitch)).sum()
        offs.append((-np.angle(z) * pitch / (2 * np.pi)) % pitch)  # where the art-pixel edges are
    H, W = g.shape
    xs, ys = np.arange(offs[0] + pitch / 2, W - 3, pitch), np.arange(offs[1] + pitch / 2, H - 3, pitch)
    xi, yi = np.round(xs[xs > 3]).astype(int), np.round(ys[ys > 3]).astype(int)
    acc = 0
    for dy in (-2, 0, 2):
        for dx in (-2, 0, 2):
            acc = acc + frame[yi[:, None] + dy, xi[None, :] + dx]
    return (acc / 9).astype(np.float32)


def video_frame(path: str, t: float) -> np.ndarray:
    from PIL import Image

    tmp = os.path.join(os.environ.get("TMPDIR", "/tmp"), f"graybox_ref_{os.getpid()}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", path, "-frames:v", "1", tmp], check=True)
    img = np.asarray(Image.open(tmp).convert("RGB"), np.float32) / 255.0
    os.remove(tmp)
    return img


# ---------------------------------------------------------------- commands
def _bb_color(a):
    return None if a.bb_color == "own" else tuple(float(v) for v in a.bb_color.split(","))


def _stand_actor(st: Stage, man: Mannequin, at, facing, pose="stand", phase=0.0):
    return man, man.place(man.mats(pose, phase), st.level.to_world(at[0], at[1]), facing)


def figure_height_px(st: Stage, man: Mannequin) -> int:
    """Rows the standing mannequin covers on screen (measured on a flat spot of the baked level)."""
    at = st.level.demo.get("stand", {"at": [0, 0]})["at"]
    foot = st.level.to_world(at[0], at[1])
    fx, fy = st.window_at(foot, (0.5, 0.75), (48, 48))
    _, _, mask, _ = st.gbuffer(int(fx), int(fy), 48, 48, [_stand_actor(st, man, at, 90)])
    rows = np.nonzero(mask.any(1))[0]
    return int(rows[-1] - rows[0] + 1) if len(rows) else 0


def cmd_render(a):
    st = Stage(a.out)
    t0 = time.time()
    S = a.scale
    # (a) the whole level in the reference's camera
    full = st.frame(0, 0, st.cam.width, st.cam.height)
    save_png(upscale(full, max(2, S // 2)), os.path.join(a.out, "overview.png"))
    save_png(upscale(st.frame(0, 0, st.cam.width, st.cam.height, mode="albedo"), 2), os.path.join(a.out, "overview_albedo.png"))
    print(f"[render] overview {st.cam.width}x{st.cam.height} art px ({time.time() - t0:.1f}s)")
    if a.no_bb:
        return
    man = Mannequin(a.bb, a.bb_splats, color=_bb_color(a))
    demo = st.level.demo
    stand = demo.get("stand", {"at": [0.0, 0.0], "facing": 90})
    actors = [_stand_actor(st, man, stand["at"], stand.get("facing", 90))]
    walk = demo.get("walk")
    if walk:  # a second figure in mid-stride, a few metres along the demo path
        p, heading = lv.polyline_point(walk["points"], 3.0)
        actors.append(_stand_actor(st, man, p, heading, "walk", 0.18))
    # (b) one reference-sized screen with the mannequin(s) for scale
    fx, fy = st.window_at(st.level.to_world(*stand["at"]), (0.42, 0.56))
    img = st.frame(int(round(fx)), int(round(fy)), actors=actors)
    save_png(upscale(img, S), os.path.join(a.out, "view_bb.png"))
    save_png(upscale(st.frame(int(round(fx)), int(round(fy))), S), os.path.join(a.out, "view_empty.png"))
    # close-up crop of the same pixels (no re-rendering: just a bigger nearest-neighbour upscale)
    c = isocam.project(isocam.window(st.cam, int(round(fx)), int(round(fy)), *st.spec.view),
                       st.level.to_world(*stand["at"], lift=0.9))
    cx, cy = int(c[0]), int(c[1])
    crop = img[max(cy - 22, 0):cy + 22, max(cx - 26, 0):cx + 52]
    save_png(upscale(crop, 3 * S), os.path.join(a.out, "bb_closeup.png"))
    px = figure_height_px(st, man)
    print(f"[render] view_bb / bb_closeup; the standing mannequin covers {px} art px in height "
          f"(reference character: about 16) ({time.time() - t0:.1f}s)")
    json.dump({"figure_px": px, "view": list(st.spec.view), "elev": st.spec.elev, "px_per_unit": st.spec.px_per_unit},
              open(os.path.join(a.out, "render.json"), "w"), indent=1)


def cmd_clip(a):
    st = Stage(a.out)
    man = Mannequin(a.bb, a.bb_splats, color=_bb_color(a))
    walk = st.level.demo["walk"]
    pts, speed = walk["points"], float(walk.get("speed", 1.25))
    length = lv.polyline_length(pts)
    n = int(a.seconds * a.fps) if a.seconds else int(length / speed * a.fps)
    stride_m = man.motion.STRIDE / lv.UNITS_PER_M  # metres the walk cycle travels per cycle
    W, H = st.spec.view
    frames, t0 = [], time.time()
    cam_pos = None
    for i in range(n):
        s = min(i / a.fps * speed, length)
        p, heading = lv.polyline_point(pts, s)
        # turn smoothly at the path's corners (heading eased over +-0.6 m)
        _, h0 = lv.polyline_point(pts, max(s - 0.6, 0.0))
        _, h1 = lv.polyline_point(pts, min(s + 0.6, length))
        dh = (h1 - h0 + 180) % 360 - 180
        heading = h0 + 0.5 * dh
        world = st.level.to_world(p[0], p[1])
        mats = man.place(man.mats("walk", s / stride_m), world, heading)
        target = np.array(st.window_at(st.level.to_world(p[0], p[1], lift=0.0), (0.5, 0.58)))
        cam_pos = target if cam_pos is None else cam_pos + (target - cam_pos) * min(1.0, a.follow)
        (ix, fx), (iy, fy) = isocam.split_subpixel(cam_pos[0]), isocam.split_subpixel(cam_pos[1])
        img = st.frame(ix, iy, W + 1, H + 1, actors=[(man, mats)])
        frames.append(isocam.subpixel_crop(img, fx, fy, a.scale, W, H))
        if (i + 1) % 20 == 0:
            print(f"[clip] {i + 1}/{n} frames ({time.time() - t0:.0f}s)", flush=True)
    save_clip(frames, a.out, a.name, a.fps)
    print(f"[clip] {a.name}.mp4 / .gif: {n} frames at {a.fps} fps, {W}x{H} art px x{a.scale} "
          f"({time.time() - t0:.0f}s, {(time.time() - t0) / max(n, 1):.2f}s per frame)")


def cmd_compare(a):
    st = Stage(a.out)
    from PIL import Image

    if a.ref_frame:
        ref_full = np.asarray(Image.open(a.ref_frame).convert("RGB"), np.float32) / 255.0
    else:
        ref_full = video_frame(a.ref_video, a.ref_time)
    ref = reference_art(ref_full, a.pitch)
    h, w = ref.shape[:2]
    man = Mannequin(a.bb, a.bb_splats, color=_bb_color(a))
    spot = st.level.demo.get("compare", st.level.demo.get("stand", {"at": [0, 0], "facing": 90}))
    foot = st.level.to_world(*spot["at"])
    ax, ay = (float(v) for v in a.anchor.split(","))
    fx, fy = st.window_at(foot, (ax, ay), (w, h))
    ours = st.frame(int(round(fx)), int(round(fy)), w, h, actors=[_stand_actor(st, man, spot["at"], spot.get("facing", 90))])
    S = a.scale
    gap = np.full((h * S, 2 * S, 3), 1.0, np.float32)
    side = np.concatenate([upscale(ref, S), gap, upscale(ours, S)], 1)
    save_png(side, os.path.join(a.out, "compare.png"))
    # the same two pictures around the character, larger
    cx, cy = int(ax * w), int(ay * h)
    box = (slice(max(cy - 34, 0), cy + 14), slice(max(cx - 40, 0), cx + 40))
    zoom = np.concatenate([upscale(ref[box], 2 * S), np.full((ref[box].shape[0] * 2 * S, 2 * S, 3), 1.0, np.float32),
                           upscale(ours[box], 2 * S)], 1)
    save_png(zoom, os.path.join(a.out, "compare_closeup.png"))
    print(f"[compare] reference art grid {w}x{h} (pitch {a.pitch} video px) | ours {w}x{h}; "
          f"saved compare.png, compare_closeup.png")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("-o", "--out", default="out/map")
        p.add_argument("--bb", default="out/bb", help="folder of the baked mannequin (examples/soldier ... --outfit none)")
        p.add_argument("--bb-splats", type=int, default=1000, help="thin the mannequin to this many splats (0 = all)")
        p.add_argument("--bb-color", default=",".join(str(v) for v in BB_COLOR),
                       help="flat sRGB colour r,g,b of the mannequin, or 'own' for the colours it was baked with")
        p.add_argument("--scale", type=int, default=6, help="nearest-neighbour upscale of the saved pictures")
        p.add_argument("--threads", type=int, default=2,
                       help="torch CPU threads (the per-frame work is small: more threads only fight each other "
                            "on a busy machine; 0 = torch's default)")
        return p

    b = common(sub.add_parser("build", help="layout -> splats -> baked level G-buffer + sun shadow map"))
    b.add_argument("--layout", default=None, help="layout json (default: examples/map/layout.json)")
    b.add_argument("--spacing", type=float, default=0.125, help="splat lattice step in metres")
    b.add_argument("--elev", type=float, default=30.0, help="camera elevation in degrees (reference: about 30)")
    b.add_argument("--az", type=float, default=0.0)
    b.add_argument("--px-per-unit", type=float, default=9.6, help="art pixels per world unit (1.80 units = 1.75 m)")
    b.add_argument("--view-w", type=int, default=211)
    b.add_argument("--view-h", type=int, default=124)
    b.add_argument("--shadow-res", type=int, default=1024)
    b.set_defaults(fn=cmd_build)
    r = common(sub.add_parser("render", help="overview + reference-sized view with the mannequin for scale"))
    r.add_argument("--no-bb", action="store_true")
    r.set_defaults(fn=cmd_render)
    c = common(sub.add_parser("clip", help="the mannequin walks the demo path, the camera follows"))
    c.add_argument("--fps", type=int, default=20)
    c.add_argument("--seconds", type=float, default=0.0, help="0 = the whole path")
    c.add_argument("--follow", type=float, default=1.0, help="camera catch-up per frame (1 = locked on)")
    c.add_argument("--name", default="walk_follow")
    c.set_defaults(fn=cmd_clip, scale=4)
    m = common(sub.add_parser("compare", help="reference frame | our gray box, same pixel grid"))
    m.add_argument("--ref-video", default=None)
    m.add_argument("--ref-time", type=float, default=15.0)
    m.add_argument("--ref-frame", default=None, help="a full-resolution frame of the reference instead of --ref-video")
    m.add_argument("--pitch", type=float, default=8.745, help="video pixels per art pixel of the reference")
    m.add_argument("--anchor", default="0.535,0.58", help="where the character's feet are in the reference frame (0..1)")
    m.set_defaults(fn=cmd_compare, scale=4)
    a = ap.parse_args()
    if a.cmd == "compare" and not (a.ref_video or a.ref_frame):
        ap.error("compare needs --ref-video or --ref-frame")
    if a.threads > 0:
        torch.set_num_threads(a.threads)
    a.fn(a)


if __name__ == "__main__":
    main()

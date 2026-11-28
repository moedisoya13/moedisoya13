"""Gray-box level in the reference game's camera (orthographic 3/4 top-down, world-locked pixel grid).

    python examples/map/graybox.py build                       # layout.json -> splats -> baked level (out/map_45)
    python examples/map/graybox.py render                      # overview, reference-view still, BB for scale
    python examples/map/graybox.py clip                        # the BB walks a path, the camera follows
    python examples/map/graybox.py compare --ref-video ref.mp4 --ref-time 15.0
    python examples/map/graybox.py build --elev 30             # the 30 degree option: 9.6 px per unit, out/map_30

The bake folder defaults to one per camera (``-o`` to choose another); ``build`` refuses to replace a bake
made with another camera unless ``--force``.

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
                              srgb_to_linear, stylized, upscale)
from pixelsplat.shadow import ShadowMap, make_shadow_map, visibility  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402

BAKE_FILE, SPLAT_FILE = "level_bake.npz", "level_splats.pt"
# Sun as seen by the reference camera: shadows fall to the screen's left and a little towards the viewer
# (read off the standing character at 15 s; an estimate).  What was read is a SCREEN shape, so it is kept
# as one: the shadow of a vertical pole, in units of the pole's own height on screen (x right, y down).
# It was first tuned as altitude 52 deg / azimuth 100 deg (relative to the camera, 90 = screen right) under
# a 30 deg camera; under another elevation the same screen shadow needs another sun (45 deg: about 57.7 / 97.1).
SUN_ALT_30, SUN_AZ_REL_30 = 52.0, 100.0
BACKGROUND = (0.075, 0.075, 0.11)
GUARD = 4  # art pixels shaded beyond the frame (>= the widest neighbourhood: SSAO reaches 3 px), x density
# Pixel density: how many art pixels stand for one art pixel of the reference grid (1 = the measured
# 11.1 px per unit at 45 deg; 3 = 33.3, the BB about 48 px tall).  Everything tuned in art pixels scales
# with it - the SSAO ring, the guard band, the level's and the figure's shadow-map texels, the figure's
# splat count; what is tuned in world units (lattice spacing, SSAO world radius, depth tolerances) does not.
# Lines stay ONE art pixel (grid, outline): see README "밀도".
SPACING_1 = 0.125  # metres between lattice splats at density 1; the default is this / density (README "밀도")
SSAO_PX = 3.0  # SSAO ring radius in art pixels at density 1
ACTOR_SHADOW_RES = 96  # the figure's own sun shadow map, texels, at every density: its texel is 0.032 units (1 art
#                        px at density 3); finer maps (192, 288) give the same shadow on flat ground at 5-9x the cost


def pole_shadow_on_screen(alt_deg: float, az_rel_deg: float, elev_deg: float):
    """(x, y) on screen of the tip of a vertical pole's shadow, relative to its foot, in units of the
    pole's screen height (orthographic: independent of the pixel scale)."""
    alt, az, e = (math.radians(v) for v in (alt_deg, az_rel_deg, elev_deg))
    gx, gz = -math.sin(az) / math.tan(alt), -math.cos(az) / math.tan(alt)  # shadow on the ground per unit height
    return gx / math.cos(e), gz * math.tan(e)


SUN_SHADOW_ON_SCREEN = pole_shadow_on_screen(SUN_ALT_30, SUN_AZ_REL_30, 30.0)  # (-0.888, +0.078)


def sun_direction(spec: isocam.RefCam) -> np.ndarray:
    """World direction TOWARDS the sun that casts ``SUN_SHADOW_ON_SCREEN`` under the camera ``spec``."""
    sx, sy = SUN_SHADOW_ON_SCREEN
    e = math.radians(spec.elev)
    gx, gz = sx * math.cos(e), sy / math.tan(e)  # the ground shadow that projects to that screen shape
    alt = math.atan2(1.0, math.hypot(gx, gz))
    az = math.radians(spec.az) + math.atan2(-gx, -gz)
    return np.array([math.sin(az) * math.cos(alt), math.sin(alt), math.cos(az) * math.cos(alt)])


BB_COLOR = (0.86, 0.60, 0.36)  # flat warm clay: the one accent in a grey level, so the figure reads at 16 px
# Cliff faces turned to the camera get no sun (it shines from the screen's right and a little from behind)
# and little sky, so with only the shared lighting they went near-black: median (34, 35, 41) against the
# background (19, 19, 28) - a wall read as a hole in the world.  Real walls there are lit by the bright
# meadow in front of them; this adds that bounce, on cliff pixels only (times albedo and how vertical the
# face is), so the rest of the look is unchanged.  Measured in README "벽".
WALL_BOUNCE = 0.45
BOUNCE_COLOR = (1.0, 0.98, 0.95)  # the sun's colour: the meadow is neutral grey


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
def pixel_steps_on_surface(cam: Camera, normal: np.ndarray):
    """World displacement (…,3) along the surface for one pixel step right and one step down, per pixel
    of an orthographic camera, on the tangent plane with that ``normal``: the screen step slid along the
    viewing ray onto the surface.  On a slope that faces the camera a pixel covers less ground than on
    flat ground, on one that faces away more (how much depends on the camera's elevation)."""
    R = cam.viewmat[:3, :3]
    sx, sy, f = R[0] / cam.A[0, 0], R[1] / cam.A[1, 1], R[2]  # one pixel right / down, the ray direction
    n = np.asarray(normal, np.float64)
    nf = n @ f
    nf = np.where(np.abs(nf) < 0.2, np.copysign(0.2, nf + 1e-12), nf)  # grazing: bounded (walls get no grid)
    return tuple(s - (n @ s / nf)[..., None] * f for s in (sx, sy))


GRID_TIE = 1e-3  # the line band is shifted by this fraction of its half-width (see ``grid_line_masks``)


def grid_line_masks(cam: Camera, P: np.ndarray, step: float, normal: Optional[np.ndarray] = None):
    """(on_x, on_z): pixels that draw the lines x = k*step and z = k*step (metres), one pixel wide.

    A line is drawn by the pixels whose world coordinate lies in a band of the width ONE pixel covers
    there (the larger of the pixel's right / down step along that axis: one pixel per row, or per column,
    whichever way the line runs).  The band is half-open and shifted by a hair (``GRID_TIE``) towards
    negative coordinates: a line that falls exactly on the boundary between two pixels - the x = 0 line
    does, because ``isocam.origin_camera`` pins the world origin to a pixel corner - then belongs to
    exactly one of them (the one on the negative side) instead of passing the test on both, and float
    noise in the world positions (far smaller than the shift) cannot flip it."""
    U = lv.UNITS_PER_M
    n = np.array([0.0, 1.0, 0.0]) if normal is None else normal
    ex, ey = (s / U for s in pixel_steps_on_surface(cam, n))  # metres per pixel step right / down
    out = []
    for axis in (0, 2):
        c = P[..., axis] / U
        half = 0.5 * np.maximum(np.abs(ex[..., axis]), np.abs(ey[..., axis]))
        d = c - np.round(c / step) * step  # signed distance to the nearest line
        out.append((d >= -half * (1 + GRID_TIE)) & (d < half * (1 - GRID_TIE)))
    return out[0], out[1]


def grid_overlay(level: lv.Level, cam: Camera, P: np.ndarray, mat: np.ndarray, albedo: np.ndarray,
                 normal: Optional[np.ndarray] = None) -> np.ndarray:
    """One-pixel scale lines on walkable ground, every ``grid.minor`` metres (darker every ``grid.major``).
    Drawn per PIXEL from the pixel's world position, so the lines stay one pixel wide and crisp; the
    half-width of a line is half the ground one pixel covers THERE (``normal``: per-pixel surface normals,
    so ramps and hills also get one-pixel lines; None = flat ground everywhere)."""
    walk = (mat == lv.MAT["grass"]) | (mat == lv.MAT["path"])
    out = albedo.copy()
    for step, k in ((float(level.grid.get("minor", 1.0)), 0.90), (float(level.grid.get("major", 5.0)), 0.74)):
        if step <= 0:
            continue
        on_x, on_z = grid_line_masks(cam, P, step, normal)
        on = walk & (on_x | on_z)
        out[on] = albedo[on] * k
    return out


def bake(level: lv.Level, spec: isocam.RefCam, spacing: float = 0.125, shadow_res: int = 1024, log=print,
         density: int = 1):
    """Splats of the level -> the whole level's G-buffer (2x supersampled, voted, despeckled) + the sun's
    shadow map.  ``density`` is only recorded (the scale is already in ``spec``): the Stage reads it to
    scale what is tuned in art pixels."""
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
    gb["albedo"] = grid_overlay(level, cam, P, mat, gb["albedo"], gb["normal"])
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
                spacing=np.array(spacing), density=np.array(int(density)))
    return model, data


def default_out(elev: float, density: int = 1) -> str:
    """Where a bake goes when ``-o`` is not given: one folder per camera, so a 45 degree bake never
    lands on top of a 30 degree one (out/map_45, out/map_30, ...), nor a denser one on either
    (out/map_45x3)."""
    return f"out/map_{elev:g}".replace(".", "_") + (f"x{density}" if density != 1 else "")


def bake_spec(folder: str) -> Optional[np.ndarray]:
    """(elev, az, px_per_unit, view_w, view_h) of the bake in ``folder``, or None if there is none."""
    path = os.path.join(folder, BAKE_FILE)
    if not os.path.exists(path):
        return None
    with np.load(path) as d:
        return np.asarray(d["spec"], np.float64)


def resolve_build_args(a, warn=print):
    """Fill in what the build command line left open: the scale for the elevation (the calibrated value at
    30 / 45, an unmeasured estimate otherwise, with a warning) and the output folder (one per camera)."""
    density = int(getattr(a, "density", 1) or 1)
    if density < 1:
        raise SystemExit(f"[build] --density must be a whole number 1 or more (got {density})")
    a.density = density
    if a.px_per_unit is None:
        base, calibrated = isocam.scale_for(a.elev)
        a.px_per_unit = round(base * density, 4)
        if not calibrated:
            warn(f"[build] WARNING: no measured scale for elevation {a.elev:g} deg (measured: "
                 f"{', '.join(f'{e:g} -> {s:g}' for e, s in sorted(isocam.CALIBRATED.items()))}); using the "
                 f"straight-line estimate {a.px_per_unit:g} px per unit. The mannequin will not be exactly 16 px: "
                 f"check render.json (figure_px) after 'render' and pass --px-per-unit")
    if getattr(a, "view_w", None) is None:
        a.view_w = isocam.RefCam().view[0] * density
    if getattr(a, "view_h", None) is None:
        a.view_h = isocam.RefCam().view[1] * density
    if getattr(a, "shadow_res", None) is None:
        a.shadow_res = 1024 * density
    if getattr(a, "spacing", None) is None:
        # the same number of lattice steps per art pixel as at density 1 (1.4): a coarser lattice leaves a
        # splat's round rim on every edge (dotted plateau / ramp edges, faceted cones at density 3)
        a.spacing = round(SPACING_1 / density, 6)
    if a.out is None:
        a.out = default_out(a.elev, density)
    return a


def cmd_build(a):
    resolve_build_args(a)
    spec = isocam.RefCam(elev=a.elev, az=a.az, px_per_unit=a.px_per_unit, view=(a.view_w, a.view_h))
    old = bake_spec(a.out)
    new = np.array([spec.elev, spec.az, spec.px_per_unit, *spec.view], np.float64)
    if old is not None and not np.allclose(old, new) and not a.force:
        raise SystemExit(f"[build] {a.out} already holds a bake made with another camera (elev {old[0]:g}, az {old[1]:g}, "
                         f"{old[2]:g} px per unit, view {int(old[3])}x{int(old[4])}); this one is elev {spec.elev:g}, "
                         f"az {spec.az:g}, {spec.px_per_unit:g} px per unit. Choose another -o folder, or add --force "
                         f"to replace it")
    os.makedirs(a.out, exist_ok=True)
    level = lv.Level.load(a.layout)
    model, data = bake(level, spec, a.spacing, a.shadow_res, density=a.density)
    np.savez_compressed(os.path.join(a.out, BAKE_FILE), **data)
    torch.save(model.state_dict(), os.path.join(a.out, SPLAT_FILE))
    shutil.copyfile(a.layout or lv.DEFAULT_LAYOUT, os.path.join(a.out, "layout_used.json"))
    w, d = spec.ground_footprint()
    print(f"[build] camera: orthographic, elevation {spec.elev:g} deg, {spec.px_per_unit:g} art px per unit "
          f"({spec.px_per_unit * lv.UNITS_PER_M:.2f} px per metre); one {spec.view[0]}x{spec.view[1]} screen shows "
          f"{w / lv.UNITS_PER_M:.1f} m x {d / lv.UNITS_PER_M:.1f} m of ground; a 1.75 m pole is "
          f"{spec.person_px():.1f} px tall; density x{a.density}, lattice {a.spacing:g} m, sun map {a.shadow_res}^2")
    print(f"[build] saved {a.out}/{BAKE_FILE}, {a.out}/{SPLAT_FILE}")


# ---------------------------------------------------------------- the stage: baked level + actors
class Mannequin:
    """The bare mannequin ("base body") of examples/soldier as an actor: a thinned copy of its splats,
    rigid per-bone binding, patch snapping.

    Why thinned: the figure is about 6 x 16 art pixels, so ALL its splats fall into a handful of raster
    tiles, and the rasterizer's cost grows with the splats per tile (60k splats: > 10 s a frame; 1000,
    each grown to keep the surface closed: well under a second, same picture at this size)."""

    def __init__(self, folder: str, splats: int = 1000, patches: int = 24, seed: int = 0, color=BB_COLOR,
                 shadow_splats: int = 350, density: int = 1, raster_k: Optional[int] = None):
        """``splats`` / ``shadow_splats`` are for density 1; ``splats`` grows with ``density`` squared (the figure
        covers density^2 times the pixels; fewer splats grown larger leave a lumpy outline).  ``raster_k``:
        the rasterizer's slots per tile to START with (it doubles on overflow anyway; a dense figure
        always overflows the default 256 once, which costs a whole wasted pass)."""
        density = max(1, int(density))
        splats = splats * density * density if splats else splats
        shadow_splats = shadow_splats * density  # the shadow is a silhouette: it needs fewer than the figure
        self.density, self.raster_k = density, raster_k
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
        self.density = int(d["density"]) if "density" in d.files else 1
        self.actor_window = "tight"  # or "square" (the old fixed window; same pixels, ~10x slower at density 3)

    # -- G-buffer of a window, with actors merged in by depth
    def gbuffer(self, x0: int, y0: int, w: int, h: int, actors: Sequence = ()):
        cam = isocam.window(self.cam, x0, y0, w, h)
        H, W = self.cam.height, self.cam.width
        d = self.density
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
            # a window just around the figure (whole pixels of the same lattice): the splats' screen
            # boxes (3 sigma, the rasterizer's cutoff) + a margin for the clean-up filters.  The dense
            # rasterizer pays for every pixel x slot of the window, so this is ~10x cheaper than a fixed
            # square at density 3, and pixel for pixel the same picture (tests/test_map.py)
            if self.actor_window == "square":  # the old fixed square (kept to test the two agree)
                p = isocam.project(cam, c)
                half = int(math.ceil(0.75 * man.height * self.spec.px_per_unit)) + 4
                wx0, wy0 = int(math.floor(p[0])) - half, int(math.floor(p[1])) - half
                wx1, wy1 = wx0 + 2 * half, wy0 + 2 * half
            else:
                P = isocam.project(cam, means.numpy())
                rad = 3.0 * pose[2].max(1).values.numpy() * float(cam.A[0, 0]) + 3.0
                wx0, wy0 = int(math.floor((P[:, 0] - rad).min())), int(math.floor((P[:, 1] - rad).min()))
                wx1, wy1 = int(math.ceil((P[:, 0] + rad).max())), int(math.ceil((P[:, 1] + rad).max()))
            wx1, wy1 = min(wx1, w), min(wy1, h)
            wx0, wy0 = max(wx0, 0), max(wy0, 0)
            if wx1 - wx0 >= 4 and wy1 - wy0 >= 4:
                sub = isocam.window(cam, wx0, wy0, wx1 - wx0, wy1 - wy0)
                cfg = man.R.config()
                if man.raster_k:
                    cfg = replace(cfg, raster=replace(cfg.raster, k=int(man.raster_k)))
                g = render_gbuffer_frame(man.model, sub, cfg, pose=pose)
                sl = (slice(wy0, wy1), slice(wx0, wx1))
                front = (g["alpha"] > 0.5) & ((gb["alpha"][sl] <= 0.5) | (g["depth"] < gb["depth"][sl]))
                for k in gb:
                    gb[k][sl] = np.where(front if gb[k].ndim == 2 else front[..., None], g[k], gb[k][sl])
                actor_mask[sl] |= front
            si = man.shadow_idx
            shadow_maps.append(make_shadow_map(means[si], pose[1][si], pose[2][si] * man.shadow_grow,
                                               man.model.opacity().detach()[si], self.sun, center=c,
                                               extent=0.85 * man.height, res=ACTOR_SHADOW_RES,
                                               k=int(man.raster_k or 256)))
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
              outline: float = 0.35, ao: float = 0.45, mode: str = "lit", guard: Optional[int] = None,
              layers: bool = False):
        """One art-resolution picture (h, w, 3) sRGB of the window whose top-left pixel is (x0, y0).

        It is shaded ``guard`` pixels larger on every side and then cut: ambient occlusion, the outline
        and the shadow filter look at neighbouring pixels, so without the band a pixel near the frame
        would change when the frame moves.  ``layers`` (lit mode): also return a dict of the per-pixel
        layers behind the picture - ``alpha``, ``depth`` (camera depth, smaller = nearer), ``actor``
        (pixels the actors cover) and ``sun`` (sun visibility 0..1, actors' shadows included)."""
        w, h = w or self.spec.view[0], h or self.spec.view[1]
        if guard is None:
            guard = GUARD * self.density
        if guard > 0:
            out = self.frame(x0 - guard, y0 - guard, w + 2 * guard, h + 2 * guard, actors, outline, ao, mode,
                             guard=0, layers=layers)
            cut = (slice(guard, -guard), slice(guard, -guard))
            if layers:
                return out[0][cut], {k: v[cut] for k, v in out[1].items()}
            return out[cut]
        cam, gb, actor_mask, sms = self.gbuffer(x0, y0, w, h, actors)
        sc = self.shade_cfg
        mask = gb["alpha"] > 0.5
        if mode == "albedo":
            return np.where(mask[..., None], gb["albedo"], np.asarray(sc.background, np.float32))
        if mode == "normal":
            return np.where(mask[..., None], gb["normal"] * 0.5 + 0.5, np.asarray(sc.background, np.float32))
        vis = self.sun_visibility(cam, gb, sms, actor_mask=actor_mask)
        lin = shade(gb, cam, sc, light_vis=[vis, None])
        if WALL_BOUNCE > 0:  # sunlight bounced off the meadow onto cliff faces (see WALL_BOUNCE)
            wall = (self.mat_window(x0, y0, w, h) == lv.MAT["cliff"]) & ~actor_mask & mask
            side = (1.0 - np.abs(gb["normal"][..., 1]))[..., None]
            lin = lin + np.where(wall[..., None], WALL_BOUNCE * np.asarray(BOUNCE_COLOR, np.float32) * side *
                                 srgb_to_linear(gb["albedo"]), 0.0)
        P = gbuf.world_positions(cam, gb["depth"])
        if ao > 0:  # the engine's SSAO at the scene's scale (its default radius is for a 2-unit model)
            occ = gbuf.ssao(gb, P, radius_px=SSAO_PX * self.density, world_radius=0.6)
            lin = lin * (1 - ao * (1 - occ[..., None]))
        img = postprocess(lin, gb, sc, cam)
        if outline > 0:
            img = np.where(edge_mask(gb, P)[..., None], img * (1 - outline), img)
        if layers:
            return img.astype(np.float32), dict(alpha=gb["alpha"], depth=gb["depth"], actor=actor_mask, sun=vis)
        return img.astype(np.float32)

    def mat_window(self, x0: int, y0: int, w: int, h: int) -> np.ndarray:
        """Material index (into ``level.MATERIALS``) of the baked level in a window; -1 = nothing."""
        out = np.full((h, w), -1, self.mat.dtype)
        H, W = self.mat.shape
        ax0, ay0, ax1, ay1 = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
        if ax1 > ax0 and ay1 > ay0:
            out[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0] = self.mat[ay0:ay1, ax0:ax1]
        return out

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
def _mannequin(a, st: "Stage") -> Mannequin:
    """The BB for a stage: ``--bb-splats`` is for density 1 and grows with the stage's density squared."""
    return Mannequin(a.bb, a.bb_splats, color=_bb_color(a), density=st.density,
                     raster_k=512 if st.density > 1 else None)


def _bb_color(a):
    return None if a.bb_color == "own" else tuple(float(v) for v in a.bb_color.split(","))


def _stand_actor(st: Stage, man: Mannequin, at, facing, pose="stand", phase=0.0):
    return man, man.place(man.mats(pose, phase), st.level.to_world(at[0], at[1]), facing)


def figure_height_px(st: Stage, man: Mannequin) -> int:
    """Rows the standing mannequin covers on screen (measured on a flat spot of the baked level)."""
    at = st.level.demo.get("stand", {"at": [0, 0]})["at"]
    foot = st.level.to_world(at[0], at[1])
    n = 48 * st.density
    fx, fy = st.window_at(foot, (0.5, 0.75), (n, n))
    _, _, mask, _ = st.gbuffer(int(fx), int(fy), n, n, [_stand_actor(st, man, at, 90)])
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
    man = _mannequin(a, st)
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
    D = st.density
    crop = img[max(cy - 22 * D, 0):cy + 22 * D, max(cx - 26 * D, 0):cx + 52 * D]
    save_png(upscale(crop, max(1, 3 * S // D)), os.path.join(a.out, "bb_closeup.png"))
    px = figure_height_px(st, man)
    print(f"[render] view_bb / bb_closeup; the standing mannequin covers {px} art px in height "
          f"(reference character: about 16) ({time.time() - t0:.1f}s)")
    json.dump({"figure_px": px, "view": list(st.spec.view), "elev": st.spec.elev, "px_per_unit": st.spec.px_per_unit},
              open(os.path.join(a.out, "render.json"), "w"), indent=1)


def cmd_clip(a):
    st = Stage(a.out)
    man = _mannequin(a, st)
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
    man = _mannequin(a, st)
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


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def elevation(text):
        try:
            v = float(text)
            isocam.RefCam(elev=v)
        except ValueError as err:
            raise argparse.ArgumentTypeError(str(err)) from None
        return v

    def common(p):
        p.add_argument("-o", "--out", default=None,
                       help=f"bake folder (build: one per camera, e.g. {default_out(45)} / {default_out(30)}; "
                            f"other commands: {default_out(isocam.RefCam().elev)})")
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
    b.add_argument("--spacing", type=float, default=None,
                   help=f"splat lattice step in metres (default {SPACING_1:g} / density)")
    b.add_argument("--density", type=int, default=1,
                   help="art pixels per reference art pixel: 1 = the measured grid (11.1 px per unit at 45 deg, "
                        "BB ~16 px), 3 = three times finer (33.3, BB ~48 px).  Scales the scale, the screen, the "
                        "sun map and the default folder (out/map_45x3); the look is tuned to stay the same")
    dflt = isocam.RefCam()
    b.add_argument("--elev", type=elevation, default=dflt.elev,
                   help=f"camera elevation in degrees, {isocam.ELEV_RANGE[0]:g}-{isocam.ELEV_RANGE[1]:g} (chosen: 45; "
                        f"the measurements allow about 25-45; 30 is the other calibrated choice)")
    b.add_argument("--az", type=float, default=dflt.az)
    b.add_argument("--px-per-unit", type=float, default=None,
                   help="art pixels per world unit (1.80 units = 1.75 m); default: the calibrated value for the "
                        "elevation (11.1 at 45 deg, 9.6 at 30 deg: standing mannequin about 16 px), an estimate "
                        "with a warning for any other elevation")
    b.add_argument("--force", action="store_true", help="replace a bake in -o that was made with another camera")
    b.add_argument("--view-w", type=int, default=None, help=f"screen width in art px (default {dflt.view[0]} x density)")
    b.add_argument("--view-h", type=int, default=None, help=f"screen height in art px (default {dflt.view[1]} x density)")
    b.add_argument("--shadow-res", type=int, default=None, help="sun shadow map texels per side (default 1024 x density)")
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
    return ap


def main():
    ap = build_parser()
    a = ap.parse_args()
    if a.cmd == "compare" and not (a.ref_video or a.ref_frame):
        ap.error("compare needs --ref-video or --ref-frame")
    if a.cmd != "build" and a.out is None:
        a.out = default_out(isocam.RefCam().elev)
    if a.cmd != "build" and not os.path.exists(os.path.join(a.out, BAKE_FILE)):
        ap.error(f"no bake in {a.out}: run 'build' first (or pass -o with the bake folder)")
    try:
        lv.Level.load(a.layout if a.cmd == "build" else os.path.join(a.out, "layout_used.json"))
    except lv.LayoutError as err:
        raise SystemExit(str(err)) from None
    if a.threads > 0:
        torch.set_num_threads(a.threads)
    a.fn(a)


if __name__ == "__main__":
    main()

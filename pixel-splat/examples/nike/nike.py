"""Winged Victory (Nike of Samothrace) — sculpted procedurally, splatted, made to walk.

There is no 3D model file for this example, so the statue is *sculpted* here
with signed distance fields: headless, armless, wet drapery clinging to the
torso, a rolled mantle around the hips, cloth streaming behind the legs and two
large feathered wings.  It is then

  1. meshed (marching cubes) and painted as weathered Parian marble,
  2. baked into quad splats (G-buffer training, rest pose = standing),
  3. skinned to a small skeleton, and
  4. animated with a procedural walk cycle (2-bone leg IK keeps feet planted).

Coordinates: y up, the figure faces +z, +x is her left.  Ground at y = -1.

    python examples/nike/nike.py all -o out/nike      # sculpt + bake + animate
    python examples/nike/nike.py sculpt -o out/nike   # just the mesh preview
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
from pathlib import Path

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pixelsplat import sdf  # noqa: E402
from pixelsplat.camera import fit_radius_for_fov, orbit_camera  # noqa: E402
from pixelsplat.gt import render_gbuffer  # noqa: E402
from pixelsplat.mesh import Part  # noqa: E402
from pixelsplat.raster import RasterConfig  # noqa: E402
from pixelsplat.shade import FrameConfig, Light, ShadeConfig, render_frame, upscale  # noqa: E402
from pixelsplat.skin import (Bone, Skeleton, distance_weights, pose_splats, rot_axis,  # noqa: E402
                             rot_x, rot_y, rot_z)
from pixelsplat.splats import SplatModel  # noqa: E402
from pixelsplat.train import TrainConfig, assign_patches, train  # noqa: E402

V = lambda *a: np.array(a, np.float32)  # noqa: E731
GROUND = -1.0

# ---------------------------------------------------------------- landmarks
HIP = {s: V(s * 0.10, -0.06, 0.0) for s in (-1, 1)}
KNEE = {s: V(s * 0.10, -0.50, 0.015) for s in (-1, 1)}
ANKLE = {s: V(s * 0.10, -0.92, -0.005) for s in (-1, 1)}
TOE = {s: V(s * 0.10, -0.975, 0.15) for s in (-1, 1)}
THIGH_LEN = float(np.linalg.norm(KNEE[1] - HIP[1]))
SHIN_LEN = float(np.linalg.norm(ANKLE[1] - KNEE[1]))


def wing_frame(s):
    """Leading edge of a wing as a polyline, matched to the Louvre statue's profile.

    Seen from the side the wing sweeps almost horizontally *backwards* from the
    shoulder blade: the top edge rises in a gentle arch a little above the
    shoulders, then curls down at the far end — a long, swept-back crescent.
    Seen from the front the two wings open into a modest V (≈2.4× shoulder half-width).
    """
    return [V(s * 0.09, 0.50, -0.09), V(s * 0.22, 0.70, -0.26), V(s * 0.34, 0.81, -0.48),
            V(s * 0.43, 0.80, -0.73), V(s * 0.49, 0.64, -0.96)]


def _poly_tangent(pts, t, eps=0.02):
    a, b = _lerp_poly(pts, max(t - eps, 0)), _lerp_poly(pts, min(t + eps, 1))
    return (b - a) / np.linalg.norm(b - a)


def wing_feathers(s):
    """Feather blades (base, tip, radius, half_thickness, normal) for one wing."""
    poly = wing_frame(s)
    down = V(s * 0.38, -1.0, 0.0)  # feathers fan slightly outward → broad from the front
    down = down / np.linalg.norm(down)
    out = []

    def frame(u, sweep_deg):
        T = _poly_tangent(poly, u)
        Dp = down - (down @ T) * T
        Dp = Dp / np.linalg.norm(Dp)
        a = math.radians(sweep_deg)
        d = math.cos(a) * Dp + math.sin(a) * T
        d = d / np.linalg.norm(d)
        n = np.cross(T, d)
        return d, n / np.linalg.norm(n)

    def sweep(u):
        return 15 + 50 * u  # feathers rake further back toward the tip

    def length(u):  # crescent: long in the middle, short at the root and the curled tip
        return float(np.interp(u, [0.0, 0.4, 0.75, 1.0], [0.32, 0.52, 0.43, 0.20]))

    # vane under everything so the wing reads as one solid mass
    for u in np.linspace(0.03, 0.97, 10):
        d, n = frame(u, sweep(u))
        b = _lerp_poly(poly, u) - n * 0.007
        out.append((b, b + d * length(u) * 0.78, 0.075, 0.010, n))
    # flight feathers with rounded (scalloped) tips
    for i, u in enumerate(np.linspace(0.02, 1.0, 24)):
        d, n = frame(u, sweep(u))
        b = _lerp_poly(poly, u) + n * (0.0035 * (i % 2))
        out.append((b, b + d * length(u), 0.046, 0.012, n))
    # three rows of shingled coverts over the upper half
    for row, (off, L, lift, r) in enumerate(((0.03, 0.12, 0.014, 0.036), (0.10, 0.13, 0.010, 0.038),
                                             (0.18, 0.15, 0.006, 0.040))):
        for j, u in enumerate(np.linspace(0.03, 0.93 - 0.05 * row, 15)):
            d, n = frame(u, sweep(u))
            b = _lerp_poly(poly, u) + d * off + n * (lift + 0.003 * (j % 2))
            out.append((b, b + d * min(L, length(u) - off), r, 0.011, n))
    return out


def _lerp_poly(pts, t):
    """Point at arc-length fraction t along a polyline."""
    seg = [np.linalg.norm(pts[i + 1] - pts[i]) for i in range(len(pts) - 1)]
    L = t * sum(seg)
    for i, sl in enumerate(seg):
        if L <= sl or i == len(seg) - 1:
            return pts[i] + (pts[i + 1] - pts[i]) * min(L / sl, 1.0)
        L -= sl


# ---------------------------------------------------------------- sculpture
def body_sdf(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    # torso: pelvis, belly, rib cage (leaning forward), shoulders, breasts
    torso = sdf.union([
        sdf.ellipsoid(p, (0, -0.03, -0.01), (0.195, 0.155, 0.135)),
        sdf.ellipsoid(p, (0, 0.14, 0.035), (0.135, 0.16, 0.105)),
        sdf.ellipsoid(p, (0, 0.37, 0.05), (0.165, 0.17, 0.115)),
        sdf.capsule(p, (-0.18, 0.525, 0.02), (0.18, 0.525, 0.02), 0.068),
        sdf.ellipsoid(p, (0.08, 0.375, 0.13), (0.066, 0.06, 0.05)),
        sdf.ellipsoid(p, (-0.08, 0.375, 0.13), (0.066, 0.06, 0.05)),
    ], 0.06)
    # broken neck: tapered column cut by a rough plane
    neck = sdf.round_cone(p, (0, 0.50, 0.03), (0, 0.70, 0.075), 0.066, 0.055)
    cut = y - 0.64 - 0.012 * (sdf.value_noise(p, 18, seed=5, octaves=2) - 0.5) + 0.05 * z
    neck = np.maximum(neck, cut)
    # broken arm stumps
    stumps = []
    for s in (-1, 1):
        a, b = V(s * 0.18, 0.53, 0.02), V(s * 0.27, 0.45, 0.045)
        st = sdf.round_cone(p, a, b, 0.07, 0.062)
        n = (b - a) / np.linalg.norm(b - a)
        plane = ((p - (a + 0.75 * (b - a))) * n).sum(-1) + 0.01 * (sdf.value_noise(p, 20, seed=7 + s, octaves=2) - 0.5)
        stumps.append(np.maximum(st, plane))
    torso = sdf.union([torso, neck] + stumps, 0.04)
    # chiton: fine wet-drapery folds sweeping diagonally over the torso
    warp = 7.0 * sdf.value_noise(p, 3.0, seed=21, octaves=2)
    folds = np.sin(58 * (0.72 * x + 0.55 * y + 0.25 * z) + warp) + 0.35 * np.sin(110 * (0.3 * x + 0.9 * y) + warp)
    torso = torso - 0.0048 * folds * np.clip((0.56 - y) * 6, 0, 1)
    # cord belt under the bust
    ell = (np.sqrt((x / 0.152) ** 2 + ((z - 0.045) / 0.112) ** 2) - 1.0) * 0.13
    belt = np.sqrt(ell ** 2 + (y - 0.305 + 0.02 * z) ** 2) - 0.013
    # himation: a heavy rolled mantle slanting around the hips
    th = np.arctan2(z / 0.15, x / 0.205)
    ring = np.stack([0.21 * np.cos(th), -0.085 + 0.095 * np.cos(th - 2.6), 0.155 * np.sin(th) - 0.01], -1)
    himation = sdf.length(p - ring) - (0.048 + 0.008 * np.sin(6 * th + 4 * y))
    # legs wrapped in clinging cloth (hem flares at the ankle) + bare feet
    legs = []
    for s in (-1, 1):
        cx = s * 0.10
        ang = np.arctan2(z - 0.0, x - cx)
        leg = sdf.union([
            sdf.round_cone(p, HIP[s], KNEE[s], 0.118, 0.074),
            sdf.round_cone(p, KNEE[s], ANKLE[s] + V(0, 0.06, 0), 0.07, 0.048),
            sdf.round_cone(p, V(cx, -0.74, 0.0), V(cx, -0.885, -0.01), 0.055, 0.074),
        ], 0.04)
        lw = 4.0 * sdf.value_noise(p, 2.5, seed=31 + s, octaves=2)
        leg = leg - 0.011 * np.sin(8 * ang + 7 * y + 5 * s * z + lw) * np.clip((-0.08 - y) * 8, 0, 1)
        foot = sdf.union([
            sdf.ellipsoid(p, V(cx, -0.955, 0.055), (0.046, 0.038, 0.105)),
            sdf.capsule(p, ANKLE[s] + V(0, 0.0, -0.01), V(cx, -0.955, 0.02), 0.038),
        ], 0.03)
        legs.append(sdf.smin(leg, foot, 0.02))
    # cloth panel between the thighs (front) with vertical folds
    panel = sdf.flat_capsule(p, (0, -0.10, 0.04), (0, -0.66, 0.05), 0.095, 0.02, (0, 0, 1))
    panel = panel - 0.008 * np.sin(26 * x + 6 * y + 3.0 * sdf.value_noise(p, 3, seed=41, octaves=1))
    d = sdf.union([torso, belt, himation], 0.05)
    d = sdf.smin(d, sdf.union([panel] + legs, 0.06), 0.045)
    return np.maximum(d, GROUND + 0.002 - y)  # nothing below the ground


def trail_sdf(p):
    """Drapery streaming back behind the legs (wind-blown)."""
    tubes = []
    for i in range(5):
        x0 = -0.08 + 0.045 * i
        a = V(x0, -0.07 - 0.025 * i, -0.12)
        b = V(x0 * 1.3 + 0.05, -0.84 + 0.05 * i, -0.28 - 0.035 * i)
        tubes.append(sdf.round_cone(p, a, b, 0.058, 0.026))
    sheet = sdf.flat_capsule(p, (0.02, -0.12, -0.15), (0.07, -0.72, -0.30), 0.10, 0.024, (0.0, 0.25, -0.97))
    d = sdf.union(tubes + [sheet], 0.06)
    return d - 0.006 * np.sin(30 * p[..., 0] + 8 * p[..., 1] + 3 * sdf.value_noise(p, 3, seed=51, octaves=1))


def wing_sdf(p, s):
    poly = wing_frame(s)
    radii = [0.056, 0.048, 0.040, 0.033, 0.024]
    parts = [sdf.round_cone(p, poly[i], poly[i + 1], radii[i], radii[i + 1]) for i in range(len(poly) - 1)]
    parts += [sdf.flat_capsule(p, b, t, r, ht, n) for b, t, r, ht, n in wing_feathers(s)]
    return sdf.union(parts, 0.006)


def wing_aabb(s):
    pts = np.stack(wing_frame(s) + [t for _, t, _, _, _ in wing_feathers(s)])
    return pts.min(0) - 0.08, pts.max(0) + 0.08


COMPONENTS = {
    "body": (body_sdf, (V(-0.33, -1.0, -0.24), V(0.33, 0.72, 0.26))),
    "trail": (trail_sdf, (V(-0.16, -0.95, -0.46), V(0.24, 0.0, -0.06))),
    "wingL": (lambda p: wing_sdf(p, 1), wing_aabb(1)),
    "wingR": (lambda p: wing_sdf(p, -1), wing_aabb(-1)),
}
UNION_K = 0.02
HERO_AZ = 20  # 3/4 front view where both wings open into a V
CENTER = (0.0, -0.08, -0.28)  # framing centre (body + swept-back wings)
EXTENT = 1.4  # half-height the camera frames


def full_sdf(p):
    d = None
    for fn, _ in COMPONENTS.values():
        e = fn(p)
        d = e if d is None else sdf.smin(d, e, UNION_K)
    return d


def component_labels(p):
    names = list(COMPONENTS)
    return np.argmin(np.stack([COMPONENTS[n][0](p) for n in names], 1), 1), names


def sculpt(voxel=0.0075, log=print):
    t0 = time.time()
    verts, faces = sdf.mesh_components(COMPONENTS, voxel, k=UNION_K)
    log(f"[sculpt] marching cubes: {len(verts)} verts {len(faces)} faces ({time.time() - t0:.1f}s)")
    nrm = sdf.sdf_normal(full_sdf, verts)
    # weathered Parian marble: cavities grey, soft mottling, slightly warm
    ao = sdf.ambient_occlusion(full_sdf, verts, nrm)
    mott = sdf.value_noise(verts, 5.0, seed=11, octaves=4)
    vein = sdf.value_noise(verts * V(1, 3, 1), 9.0, seed=3, octaves=2)
    base = V(0.87, 0.85, 0.81)
    col = base[None] * (0.80 + 0.22 * mott[:, None]) * (0.94 + 0.06 * vein[:, None])
    col = col * (0.42 + 0.58 * ao[:, None] ** 1.2)
    col = col * V(1.0, 0.99, 0.965)[None]
    log(f"[sculpt] painted marble ({time.time() - t0:.1f}s)")
    part = Part("nike", verts, faces, nrm.astype(np.float32), vert_colors=np.clip(col, 0, 1).astype(np.float32),
                base_color=V(1, 1, 1), roughness=0.55, metallic=0.0)
    return [part]


# ---------------------------------------------------------------- skeleton
def make_skeleton():
    bones = [
        Bone("pelvis", None, V(0, -0.06, 0), V(0, 0.16, 0.02)),
        Bone("chest", "pelvis", V(0, 0.16, 0.02), V(0, 0.64, 0.06)),
    ]
    for s, side in ((1, "L"), (-1, "R")):
        bones += [Bone("thigh" + side, "pelvis", HIP[s], KNEE[s]),
                  Bone("shin" + side, "thigh" + side, KNEE[s], ANKLE[s]),
                  Bone("foot" + side, "shin" + side, ANKLE[s], TOE[s])]
    for s, side in ((1, "L"), (-1, "R")):
        poly = wing_frame(s)
        bones.append(Bone("wing" + side, "chest", poly[0], poly[-1]))
    bones.append(Bone("trail", "pelvis", V(0.03, -0.05, -0.12), V(0.09, -0.85, -0.33)))
    return Skeleton(bones)


def skin_weights(skel: Skeleton, points: np.ndarray) -> np.ndarray:
    lab, names = component_labels(points)
    B = len(skel)
    idx = skel.index
    allowed = np.ones((len(points), B), bool)
    wing_bones = [idx["wingL"], idx["wingR"]]
    allowed[:, wing_bones] = False
    allowed[:, idx["trail"]] = False
    for side in ("L", "R"):
        m = lab == names.index("wing" + side)
        allowed[m] = False
        allowed[np.ix_(m, [idx["wing" + side], idx["chest"]])] = True
    m = lab == names.index("trail")
    allowed[m] = False
    allowed[np.ix_(m, [idx["trail"], idx["pelvis"], idx["thighL"], idx["thighR"]])] = True
    w = distance_weights(points, skel, sigma=0.055, allowed=allowed)
    return w


# ---------------------------------------------------------------- walk cycle
def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


STRIDE = 0.17  # half stride (foot travels ±STRIDE around the hip)
STANCE = 0.6  # fraction of the cycle a foot is on the ground
SPEED = 2 * STRIDE / STANCE  # world units per cycle that keeps feet planted


def foot_target(psi):
    """Ankle (z, y) relative to the moving root + foot pitch, for leg phase psi∈[0,1)."""
    psi = psi % 1.0
    ankle_h = ANKLE[1][1]
    if psi < STANCE:
        s = psi / STANCE
        z = STRIDE - 2 * STRIDE * s
        heel = 0.045 * smoothstep((s - 0.65) / 0.35)  # heel lifts before toe-off
        pitch = -8 * (1 - smoothstep(s / 0.15)) + 28 * smoothstep((s - 0.7) / 0.3)
        return z, ankle_h + heel, pitch
    s = (psi - STANCE) / (1 - STANCE)
    z = -STRIDE + 2 * STRIDE * smoothstep(s)
    y = ankle_h + 0.045 * (1 - smoothstep(s / 0.25)) + 0.075 * math.sin(math.pi * s)
    pitch = 28 * (1 - smoothstep(s / 0.4)) - 8 * smoothstep((s - 0.6) / 0.4)
    return z, y, pitch


def _frame(d, axis):
    d = d / np.linalg.norm(d)
    a = axis - (axis @ d) * d
    a = a / np.linalg.norm(a)
    return np.stack([d, a, np.cross(d, a)], 1)


def walk_pose(skel: Skeleton, phase: float, advance: float = 0.0):
    """Bone matrices for walk phase∈[0,1). ``advance`` = root forward distance (z)."""
    tau = 2 * math.pi
    bob = 0.014 * math.cos(2 * tau * (phase - 0.3))
    sway = 0.016 * math.cos(tau * (phase - 0.3))
    root = np.array([sway, -0.03 + bob, advance])
    R_pelvis = rot_y(-6 * math.cos(tau * phase)) @ rot_z(2.5 * math.cos(tau * (phase - 0.3))) @ rot_x(4.0)
    # Nike leans into the wind: chest pitched forward, breathing with the steps
    R_chest = rot_y(9 * math.cos(tau * phase)) @ rot_x(9 + 1.5 * math.sin(2 * tau * phase - 0.5))
    rots = {"pelvis": R_pelvis, "chest": R_chest}
    # pelvis world transform (rotation about its head, then root offset)
    ph = skel.bones[skel.index["pelvis"]].head
    G_p = np.eye(4)
    G_p[:3, :3] = R_pelvis
    G_p[:3, 3] = ph - R_pelvis @ ph + root
    fwd = R_pelvis @ np.array([0, 0, 1.0])
    for s, side in ((1, "L"), (-1, "R")):
        psi = phase + (0.0 if side == "L" else 0.5)
        tz, ty, pitch = foot_target(psi)
        H = G_p[:3, :3] @ HIP[s] + G_p[:3, 3]
        A = np.array([HIP[s][0] + root[0] * 0.6, ty, tz + advance])
        D = A - H
        d = float(np.clip(np.linalg.norm(D), abs(THIGH_LEN - SHIN_LEN) + 1e-3, THIGH_LEN + SHIN_LEN - 1e-4))
        ex = D / np.linalg.norm(D)
        A = H + ex * d
        b = fwd - (fwd @ ex) * ex
        b = b / np.linalg.norm(b)
        a = (THIGH_LEN ** 2 - SHIN_LEN ** 2 + d * d) / (2 * d)
        h = math.sqrt(max(THIGH_LEN ** 2 - a * a, 0))
        K = H + ex * a + b * h
        hinge_new = np.cross(fwd, ex)  # knee hinge axis (pelvis-side), perpendicular to the leg plane
        hinge_rest = np.array([1.0, 0, 0])
        W_thigh = _frame(K - H, hinge_new) @ _frame(KNEE[s] - HIP[s], hinge_rest).T
        W_shin = _frame(A - K, hinge_new) @ _frame(ANKLE[s] - KNEE[s], hinge_rest).T
        W_foot = rot_y(-6 * math.cos(tau * phase)) @ rot_x(pitch)
        rots["thigh" + side] = R_pelvis.T @ W_thigh
        rots["shin" + side] = W_thigh.T @ W_shin
        rots["foot" + side] = W_shin.T @ W_foot
    for s, side in ((1, "L"), (-1, "R")):
        poly = wing_frame(s)
        lead = (poly[2] - poly[0]) / np.linalg.norm(poly[2] - poly[0])
        flap = 5.0 * math.sin(2 * tau * phase - 1.3) + 2.0 * math.sin(tau * phase)
        rots["wing" + side] = rot_axis(lead, s * flap) @ rot_y(s * 2.5 * math.sin(2 * tau * phase - 2.0))
    rots["trail"] = (rot_x(-6 - 7 * math.sin(2 * tau * phase - 2.2))
                     @ rot_z(7 * math.sin(tau * phase - 1.6)) @ rot_y(-8 * math.cos(tau * phase - 1.2)))
    return skel.world_mats(rots, root_offset=root), root


# ---------------------------------------------------------------- pipeline
def save_png(img, path):
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)


def save_anim(frames, out_dir, name, fps):
    ims = [Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)) for f in frames]
    ims[0].save(os.path.join(out_dir, name + ".gif"), save_all=True, append_images=ims[1:],
                duration=int(round(1000 / fps)), loop=0)
    if shutil.which("ffmpeg"):
        tmp = os.path.join(out_dir, "_frames_" + name)
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp)
        for i, im in enumerate(ims):
            im.save(os.path.join(tmp, f"{i:04d}.png"))
        # loop the clip 3x in the mp4 so short cycles are watchable
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "2", "-framerate", str(fps), "-i",
                        os.path.join(tmp, "%04d.png"), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-crf", "15", os.path.join(out_dir, name + ".mp4")], check=True)
        shutil.rmtree(tmp)


def nike_shade(key=(-0.55, 0.75, 0.75), rim=(0.85, 0.35, -0.6), **kw):
    sc = ShadeConfig(
        lights=[Light(key, (1.0, 0.92, 0.80), 3.0),  # warm key (default: front-left, above)
                Light(rim, (0.55, 0.65, 1.0), 1.5)],  # cool rim from behind
        sky=(0.16, 0.18, 0.26), ground=(0.05, 0.045, 0.05), outline=0.3, ground_y=GROUND,
        shadow_radius=(0.30, 0.22), **kw)
    return sc


def cmd_sculpt(a):
    os.makedirs(a.out, exist_ok=True)
    parts = sculpt(a.voxel)
    p = parts[0]
    np.savez_compressed(os.path.join(a.out, "nike_mesh.npz"), verts=p.verts, faces=p.faces,
                        normals=p.normals, colors=p.vert_colors)
    try:
        import trimesh
        trimesh.Trimesh(p.verts, p.faces, vertex_colors=(p.vert_colors * 255).astype(np.uint8),
                        process=False).export(os.path.join(a.out, "nike.glb"))
    except Exception as e:  # noqa: BLE001
        print("[sculpt] glb export skipped:", e)
    # quick GT previews
    row = []
    for az in (25, 90, 180, 300):
        cam = orbit_camera(az, 8, 200, 200, radius=fit_radius_for_fov(30, EXTENT), fov_deg=30, target=CENTER)
        g = render_gbuffer(parts, cam, 2)
        a_ = np.maximum(g[..., 9:10], 1e-6)
        row.append(np.where(g[..., 9:10] > 0.5, g[..., :3] / a_, 0.1))
    save_png(np.concatenate(row, 1), os.path.join(a.out, "sculpt_albedo.png"))
    return parts


def load_parts(out):
    z = np.load(os.path.join(out, "nike_mesh.npz"))
    return [Part("nike", z["verts"], z["faces"], z["normals"], vert_colors=z["colors"], base_color=V(1, 1, 1),
                 roughness=0.55, metallic=0.0)]


def cmd_bake(a):
    parts = load_parts(a.out)
    # the statue already lives in the normalized frame (height ≈ 2, centred) — no renormalisation,
    # so the skeleton coordinates stay valid
    cfg = TrainConfig(n_splats=a.splats, res=a.res, n_views=a.views, iters=a.iters, seed=0,
                      elev_range=(-10.0, 40.0), extent=EXTENT, target=CENTER)
    model = train(parts, cfg)
    assign_patches(model, 80)
    torch.save(model.state_dict(), os.path.join(a.out, "nike_splats.pt"))
    json.dump({"splats": model.n, **{k: str(v) for k, v in vars(cfg).items()}},
              open(os.path.join(a.out, "nike_splats.json"), "w"), indent=1)
    return model


def cmd_animate(a):
    model = SplatModel.load(os.path.join(a.out, "nike_splats.pt"))
    skel = make_skeleton()
    W = torch.as_tensor(skin_weights(skel, model.means.detach().numpy()))
    n = a.cycle_frames
    px = a.px
    radius = fit_radius_for_fov(30, EXTENT)

    def frame(cam, phase, advance, sc, snap=False, mode="lit"):
        mats, root = walk_pose(skel, phase, advance)
        pose = pose_splats(model, W, torch.as_tensor(mats))
        sc.shadow_center = (float(root[0]), float(root[2]))
        return render_frame(model, cam, FrameConfig(raster=RasterConfig(tile=4, k=256), shade=sc,
                                                    snap=snap, mode=mode), pose=pose)

    t0 = time.time()
    clips = set(a.clips.split(","))
    # 1) in-place walk cycle, 3/4 view, seamless loop
    frames = []
    if "cycle" not in clips:
        n_cycle = 0
    else:
        n_cycle = n
    for i in range(n_cycle):
        cam = orbit_camera(HERO_AZ, 10, int(px * 1.0), px, radius=radius, target=CENTER)
        frames.append(upscale(frame(cam, i / n, 0.0, nike_shade()), a.scale))
    if frames:
        save_anim(frames, a.out, "walk_cycle", a.fps)
        print(f"[animate] walk_cycle {n} frames ({time.time() - t0:.0f}s)")
    # 2) walking across the screen, side view, camera fixed, patch snapping on
    cycles = 3 if "across" in clips else 0
    total = SPEED * cycles
    frames = []
    for i in range(n * cycles):
        adv = -total / 2 + SPEED * i / n
        cam = orbit_camera(90, 6, int(px * 2.0), px, radius=radius + 0.4, target=CENTER)
        # key light from the camera side (+x) so the visible flank is lit
        sc = nike_shade(key=(0.6, 0.7, 0.45), rim=(-0.7, 0.4, -0.6))
        frames.append(upscale(frame(cam, (i / n) % 1, adv, sc, snap=True), a.scale))
    if frames:
        save_anim(frames, a.out, "walk_across", a.fps)
        print(f"[animate] walk_across {len(frames)} frames ({time.time() - t0:.0f}s)")
    # 3) walking in place while the camera orbits (dynamic lighting showcase)
    cycles = 4 if "orbit" in clips else 0
    frames = []
    for i in range(n * cycles):
        az = HERO_AZ + 360 * i / (n * cycles)
        cam = orbit_camera(az, 10, int(px * 1.0), px, radius=radius, target=CENTER)
        frames.append(upscale(frame(cam, (i / n) % 1, 0.0, nike_shade()), a.scale))
    if frames:
        save_anim(frames, a.out, "walk_orbit", a.fps)
        print(f"[animate] walk_orbit {len(frames)} frames ({time.time() - t0:.0f}s)")
    # 4) stills: 8 phases of the cycle + G-buffer debug of one frame
    cam = orbit_camera(HERO_AZ, 10, int(px * 1.0), px, radius=radius, target=CENTER)
    stills = [frame(cam, k / 8, 0.0, nike_shade()) for k in range(8)]
    sheet = np.concatenate([np.concatenate(stills[:4], 1), np.concatenate(stills[4:], 1)], 0)
    save_png(upscale(sheet, max(1, a.scale // 2)), os.path.join(a.out, "walk_sheet.png"))
    dbg = [frame(cam, 0.1, 0.0, nike_shade(), mode=m) for m in ("lit", "albedo", "normal", "depth", "patches")]
    save_png(upscale(np.concatenate(dbg, 1), max(1, a.scale // 2)), os.path.join(a.out, "gbuffer.png"))
    print(f"[animate] done ({time.time() - t0:.0f}s)")


def main():
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["sculpt", "bake", "animate", "all"])
    ap.add_argument("-o", "--out", default="out/nike")
    ap.add_argument("--voxel", type=float, default=0.0075, help="sculpt resolution (world units)")
    ap.add_argument("--splats", type=int, default=28000)
    ap.add_argument("--res", type=int, default=208)
    ap.add_argument("--views", type=int, default=48)
    ap.add_argument("--iters", type=int, default=1500)
    ap.add_argument("--px", type=int, default=128, help="pixel-art height")
    ap.add_argument("--scale", type=int, default=5)
    ap.add_argument("--cycle-frames", type=int, default=28, help="frames per walk cycle (2 steps)")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--clips", default="cycle,across,orbit", help="which animations to render")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    if a.cmd in ("sculpt", "all"):
        cmd_sculpt(a)
    if a.cmd in ("bake", "all"):
        cmd_bake(a)
    if a.cmd in ("animate", "all"):
        cmd_animate(a)


if __name__ == "__main__":
    main()

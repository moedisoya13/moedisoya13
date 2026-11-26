"""Soldier - a human-proportioned figure built for motion: skeleton, joint beads, turntables, mannequin.

Stage 1 of the soldier example (the costume comes in stage 2 and hangs on the same bones):

  rig.py     layer 1  real proportions, joint positions, 28 bones, rotation limits
  body.py    layers 2-4  one solid per bone: joint beads, waist/neck turntables, mannequin flesh
  motion.py  walk loop (planted feet, heel strike -> toe-off), turntable demo, costume helper bones
  soldier.py this file: sculpt -> bake -> animate, plus `verify` (all the numbers in the README)

Unlike the Nike, every splat belongs to exactly ONE bone (rigid binding), so no surface is ever
stretched; the beads and turntables keep the joints closed instead.

    python examples/soldier/soldier.py sculpt  -o out/soldier                 # meshes, one per bone
    python examples/soldier/soldier.py bake    -o out/soldier --iters 0       # splats (0 = no training)
    python examples/soldier/soldier.py animate -o out/soldier --app           # sheets + GIFs
    python examples/soldier/soldier.py verify  -o out/soldier                 # proportions, gaps, feet, loop

Coordinates: y up, he faces +z, +x is his left.  Ground at y = -1, body height rig.H.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(1, str(Path(__file__).resolve().parents[1] / "nike"))
import body  # noqa: E402
import motion  # noqa: E402
import rig  # noqa: E402
import look  # noqa: E402  (examples/nike/look.py: the shared render look)
import nike  # noqa: E402  (examples/nike/nike.py: bone_patches, save_png, save_anim, nike_shade)
from pixelsplat import sdf  # noqa: E402
from pixelsplat.camera import fit_radius_for_fov, orbit_camera  # noqa: E402
from pixelsplat.gt import render_gbuffer  # noqa: E402
from pixelsplat.mesh import Part  # noqa: E402
from pixelsplat.raster import RasterConfig  # noqa: E402
from pixelsplat.shade import FrameConfig, render_frame, render_gbuffer_frame, upscale  # noqa: E402
from pixelsplat.skin import pose_splats  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402
from pixelsplat.train import TrainConfig, train  # noqa: E402

H, GROUND = rig.H, rig.GROUND
SKEL = rig.SKELETON
CENTER = (0.0, GROUND + 0.52 * H, 0.0)  # framing centre
EXTENT = 0.60 * H  # half-height the camera frames (leaves room for the plume of stage 2)
HERO_AZ = 28
CULL_MARGIN = 0.0035 * H  # a surface point this deep inside another bone counts as buried
MESH_FILE, SPLAT_FILE, BONE_FILE = "soldier_mesh.npz", "soldier_splats.pt", "soldier_bones.npy"


# ---------------------------------------------------------------- sculpt
@dataclass
class Sculpt:
    """One mesh per bone.  ``keep[i]`` marks the faces that can be seen in some pose; the others are
    buried inside a neighbouring bone whatever the pose and get no splats."""
    names: List[str]
    verts: List[np.ndarray]
    faces: List[np.ndarray]
    normals: List[np.ndarray]
    colors: List[np.ndarray]
    keep: List[np.ndarray]

    def parts(self, culled: bool = True) -> List[Part]:
        return [Part(n, v, (f[k] if culled else f), nr, vert_colors=c, base_color=np.ones(3, np.float32),
                     roughness=body.ROUGHNESS, metallic=0.0)
                for n, v, f, nr, c, k in zip(self.names, self.verts, self.faces, self.normals, self.colors, self.keep)]

    @property
    def bone_index(self) -> np.ndarray:
        """part number -> bone number in the skeleton."""
        return np.array([SKEL.index[n] for n in self.names])

    def owners(self) -> np.ndarray:
        return np.concatenate([np.full(len(v), SKEL.index[n]) for n, v in zip(self.names, self.verts)])

    def area(self, culled: bool) -> float:
        return float(sum(p.area for p in self.parts(culled)))

    def posed_parts(self, mats: np.ndarray, culled: bool = False) -> List[Part]:
        """The meshes moved rigidly by a pose (for ground-truth renders of a posed figure)."""
        out = []
        for p in self.parts(culled):
            M = np.asarray(mats[SKEL.index[p.name]], np.float32)
            out.append(Part(p.name, p.verts @ M[:, :3].T + M[:, 3], p.faces, p.normals @ M[:, :3].T,
                            vert_colors=p.vert_colors, base_color=p.base_color, roughness=p.roughness, metallic=0.0))
        return out

    def save(self, path: str):
        cat = lambda xs: np.concatenate(xs) if xs else np.zeros(0)  # noqa: E731
        np.savez_compressed(path, names=np.array(self.names), verts=cat(self.verts), faces=cat(self.faces),
                            normals=cat(self.normals), colors=cat(self.colors), keep=cat(self.keep),
                            n_verts=np.array([len(v) for v in self.verts]), n_faces=np.array([len(f) for f in self.faces]))

    @classmethod
    def load(cls, path: str) -> "Sculpt":
        z = np.load(path)
        nv, nf = np.cumsum(z["n_verts"])[:-1], np.cumsum(z["n_faces"])[:-1]
        sp = lambda a, cuts: [np.ascontiguousarray(x) for x in np.split(a, cuts)]  # noqa: E731
        return cls([str(n) for n in z["names"]], sp(z["verts"], nv), sp(z["faces"], nf), sp(z["normals"], nv),
                   sp(z["colors"], nv), sp(z["keep"], nf))


def visibility_poses(n_random: int = 48, seed: int = 0, cycle: int = 16) -> List[np.ndarray]:
    """Bone matrices of the poses used to decide what can ever be seen: the rotation limits (ends,
    corners, random whole-body poses) plus the walk and turntable loops."""
    mats = [SKEL.world_mats(r) for r in rig.limit_poses(n_random, seed)]
    for i in range(cycle):
        mats.append(motion.walk_pose(SKEL, i / cycle)[0])
        mats.append(motion.turn_pose(SKEL, i / cycle, bend=12.0)[0])
    return mats


def sculpt(voxel: float = 0.0075, cull: bool = True, margin: float = CULL_MARGIN, n_random: int = 48,
           log=print) -> Sculpt:
    """Mesh every bone's solid on its own grid, paint it, and mark the faces no pose can show."""
    t0 = time.time()
    names, verts, faces, normals, colors = [], [], [], [], []
    for b in body.BONES:
        vx = body.voxel_for(b, voxel)
        v, f = sdf.mesh_components(body.components(b), vx, k=0.0, pad=2.5 * vx)
        lo, hi = body.BOXES[b]
        if (v.min(0) < lo + vx).any() or (v.max(0) > hi - vx).any():
            raise ValueError(f"solid of bone {b!r} touches its box in body.BOXES - enlarge the box")
        fn = lambda p, _b=b: body.bone_sdf(_b, p)  # noqa: E731
        n = sdf.sdf_normal(fn, v).astype(np.float32)  # from the SDF, so the triangle winding does not matter
        names.append(b), verts.append(v), faces.append(f), normals.append(n), colors.append(body.paint(b, v))
    sc = Sculpt(names, verts, faces, normals, colors, [np.ones(len(f), bool) for f in faces])
    log(f"[sculpt] {len(names)} bone meshes, {sum(map(len, verts))} verts, {sum(map(len, faces))} faces, "
        f"area {sc.area(False):.3f} ({time.time() - t0:.1f}s)")
    if cull:
        poses = visibility_poses(n_random)
        buried = body.never_visible(np.concatenate(verts), sc.owners(), poses, margin)
        start = 0
        for i, (v, f) in enumerate(zip(verts, faces)):
            seen = ~buried[start:start + len(v)]
            for _ in range(2):  # keep two more rings of triangles around everything that can show
                near = seen[f].any(1)
                seen[f[near]] = True
            sc.keep[i] = seen[f].any(1)
            start += len(v)
        a0, a1 = sc.area(False), sc.area(True)
        log(f"[sculpt] buried in every one of {len(poses)} poses: {100 * (1 - a1 / a0):.1f}% of the surface "
            f"dropped (area {a0:.3f} -> {a1:.3f}) ({time.time() - t0:.1f}s)")
    return sc


def cmd_sculpt(a) -> Sculpt:
    os.makedirs(a.out, exist_ok=True)
    sc = sculpt(a.voxel)
    sc.save(os.path.join(a.out, MESH_FILE))
    try:
        import trimesh
        scene = trimesh.Scene()
        for p in sc.parts(False):
            scene.add_geometry(trimesh.Trimesh(p.verts, p.faces, vertex_colors=(p.vert_colors * 255).astype(np.uint8),
                                               process=False), node_name=p.name)
        scene.export(os.path.join(a.out, "soldier.glb"))
    except Exception as e:  # noqa: BLE001
        print("[sculpt] glb export skipped:", e)
    row = []
    for az in (25, 90, 180, 300):
        cam = orbit_camera(az, 6, 150, 200, radius=fit_radius_for_fov(30, EXTENT), fov_deg=30, target=CENTER)
        g = render_gbuffer(sc.parts(True), cam, 2)
        al = np.maximum(g[..., 9:10], 1e-6)
        row.append(np.where(g[..., 9:10] > 0.5, g[..., :3] / al, 0.1))
    nike.save_png(np.concatenate(row, 1), os.path.join(a.out, "sculpt_albedo.png"))
    return sc


# ---------------------------------------------------------------- bake
def _train_tracking_prune(parts, cfg: TrainConfig):
    """``train`` + which of the initial splats survived its final prune.

    The splat -> bone label lives in ``model.part`` (set by SplatModel.from_mesh), which the core's
    prune may or may not carry along; recording the prune mask makes this independent of that."""
    seen = {}
    orig = SplatModel.prune

    def prune(self, keep):
        seen["keep"] = keep.detach().cpu().numpy().astype(bool)
        orig(self, keep)

    SplatModel.prune = prune
    try:
        model = train(parts, cfg)
    finally:
        SplatModel.prune = orig
    return model, seen.get("keep", np.ones(model.n, bool))


def one_hot(bones: np.ndarray) -> torch.Tensor:
    """(N,) bone numbers -> (N,B) skinning weights with a single 1 per row: rigid binding."""
    W = torch.zeros(len(bones), len(SKEL))
    W[torch.arange(len(bones)), torch.as_tensor(bones, dtype=torch.long)] = 1.0
    return W


def bake(sc: Sculpt, n_splats: int = 30000, res: int = 192, views: int = 48, iters: int = 0, elev=(-20.0, 35.0),
         seed: int = 0, log=print):
    """Splats on the bone meshes (+ optional G-buffer training in the rest pose).  Returns (model, bones).

    Training only ever sees the rest pose, so it must not touch what the rest pose hides: splats whose
    centre is inside (or within half a splat radius of) another bone's solid keep their
    mesh-initialised state - they are exactly the ones that show up when a joint bends."""
    parts = sc.parts(True)
    cfg = TrainConfig(n_splats=n_splats, res=res, n_views=views, iters=iters, seed=seed, elev_range=tuple(elev),
                      extent=EXTENT, target=CENTER)
    init = SplatModel.from_mesh(parts, n_splats, seed=seed)  # the very state train() starts from
    bones0 = sc.bone_index[np.asarray(init.part)]
    model, kept = _train_tracking_prune(parts, cfg)
    if iters <= 0:
        assert torch.equal(model.means, init.means)
        return model, bones0
    radius = float(init.scales().detach().mean())
    rest = SKEL.world_mats({})
    shielded = body.inside_other(init.means.detach().numpy(), bones0, rest, margin=-0.5 * radius)
    sel = kept | shielded
    with torch.no_grad():
        for name in ("means", "quats", "log_scales", "opacity_logit", "albedo_logit", "rough_logit", "metal_logit"):
            full = getattr(init, name).data.clone()
            trained = getattr(model, name).data
            rows = torch.as_tensor(np.nonzero(kept)[0])
            use = torch.as_tensor(~shielded[kept])
            full[rows[use]] = trained[use]
            setattr(model, name, torch.nn.Parameter(full[torch.as_tensor(sel)].clone()))
        model.patch = torch.zeros(int(sel.sum()), dtype=torch.long)
    model.part = np.asarray(init.part)[sel]
    log(f"[bake] {int(sel.sum())} splats; {int(shielded.sum())} near/inside a neighbouring bone kept untrained, "
        f"{int((~sel).sum())} pruned")
    return model, bones0[sel]


def cmd_bake(a):
    sc = Sculpt.load(os.path.join(a.out, MESH_FILE))
    model, bones = bake(sc, a.splats, a.res, a.views, a.iters, (a.elev_lo, a.elev_hi))
    torch.save(model.state_dict(), os.path.join(a.out, SPLAT_FILE))
    np.save(os.path.join(a.out, BONE_FILE), bones.astype(np.int16))
    json.dump({"splats": model.n, "iters": a.iters, "res": a.res, "views": a.views,
               "per_bone": {b.name: int((bones == i).sum()) for i, b in enumerate(SKEL.bones) if (bones == i).any()}},
              open(os.path.join(a.out, "soldier_splats.json"), "w"), indent=1)
    print(f"[bake] saved {model.n} splats on {len(np.unique(bones))} bones")
    return model, bones


def label_by_solid(points: np.ndarray) -> np.ndarray:
    """Fallback splat -> bone label when no label file exists: the bone whose surface is nearest."""
    d = np.stack([np.abs(body.bone_sdf(b, points)) for b in body.BONES], 1)
    return np.array([SKEL.index[b] for b in body.BONES])[d.argmin(1)]


def load_model(out: str):
    model = SplatModel.load(os.path.join(out, SPLAT_FILE))
    path = os.path.join(out, BONE_FILE)
    bones = np.load(path).astype(np.int64) if os.path.exists(path) else None
    if bones is None or len(bones) != model.n:
        print("[soldier] no matching bone labels - labelling splats by the nearest bone surface")
        bones = label_by_solid(model.means.detach().numpy())
    return model, bones


# ---------------------------------------------------------------- render
def soldier_shade(az: float = HERO_AZ, **kw):
    """The Nike studio lights, turned with the camera so every view is lit from the same side."""
    turn = rig.euler(yaw=az - HERO_AZ)
    key = tuple(turn @ np.array(kw.pop("key", (-0.55, 0.75, 0.75))))
    rim = tuple(turn @ np.array(kw.pop("rim", (0.85, 0.35, -0.6))))
    sc = nike.nike_shade(key=key, rim=rim, **kw)
    sc.shadow_radius = (0.34, 0.24)
    return sc


def camera(az=HERO_AZ, el=8.0, px=192, aspect=0.75, target=CENTER, extent=EXTENT):
    return orbit_camera(az, el, int(round(px * aspect)), px, radius=fit_radius_for_fov(30, extent), target=target)


class Renderer:
    """The Nike example's frame path (pose -> render_frame through look.upgrade) for a rigid model."""

    def __init__(self, model, bones, app: bool = True, look_name: str = "stylized", patches: int = 80):
        self.model, self.bones, self.app, self.look = model, np.asarray(bones), app, look_name
        self.W = one_hot(self.bones)
        if app:
            self.n_patches = nike.bone_patches(model, self.W, patches)  # patches never straddle two bones
        self.patch = model.patch.clone()

    def pose(self, mats):
        return pose_splats(self.model, self.W, torch.as_tensor(np.asarray(mats, np.float32)))

    def config(self, shade=None, mode="lit") -> FrameConfig:
        fc = FrameConfig(raster=RasterConfig(tile=4, k=256, hard=self.app), shade=shade or soldier_shade(),
                         snap=self.app, mode=mode)
        return look.upgrade(fc, self.look)

    def frame(self, cam, mats, root=(0.0, 0.0, 0.0), shade=None, mode="lit", az=None):
        """mode: lit | albedo | normal | depth | patches | bones.  ``az`` = camera azimuth, to turn the
        lights with the camera (default: lights for the hero view)."""
        sc = shade or soldier_shade(HERO_AZ if az is None else az)
        sc.shadow_center = (float(root[0]), float(root[2]))
        if mode == "bones":  # colour by bone instead of by patch
            self.model.patch = torch.as_tensor(self.bones)
            try:
                return render_frame(self.model, cam, self.config(sc, "patches"), pose=self.pose(mats))
            finally:
                self.model.patch = self.patch
        return render_frame(self.model, cam, self.config(sc, mode), pose=self.pose(mats))

    def coverage(self, cam, mats) -> np.ndarray:
        """Raw no-blend coverage mask (no clean-up, no snapping): what the splats really cover."""
        fc = FrameConfig(raster=RasterConfig(tile=4, k=512, hard=True), snap=False)
        return render_gbuffer_frame(self.model, cam, fc, pose=self.pose(mats))["alpha"] > 0.5


def sheet(frames: Sequence[np.ndarray], cols: int) -> np.ndarray:
    rows = [np.concatenate(frames[i:i + cols], 1) for i in range(0, len(frames), cols)]
    return np.concatenate(rows, 0)


def named_poses() -> Dict[str, Dict[str, np.ndarray]]:
    """Poses at the ends of the rotation limits, one joint (group) at a time - the gap tests and the
    joint close-ups use these."""
    L = rig.local_rot
    P: Dict[str, Dict[str, np.ndarray]] = {"rest": {}}
    P["shoulder_up"] = {"upperarmL": L("upperarmL", pitch=-170), "upperarmR": L("upperarmR", roll=-90),
                        "clavL": L("clavL", roll=20), "clavR": L("clavR", roll=-20)}
    P["shoulder_back"] = {"upperarmL": L("upperarmL", pitch=50), "upperarmR": L("upperarmR", pitch=-90, roll=20),
                          "clavL": L("clavL", yaw=15), "clavR": L("clavR", yaw=15)}
    P["elbow_bent"] = {"upperarmL": L("upperarmL", pitch=-40, roll=15), "forearmL": L("forearmL", pitch=-145),
                       "upperarmR": L("upperarmR", roll=-35), "forearmR": L("forearmR", pitch=-90, yaw=-80)}
    P["wrist"] = {"upperarmL": L("upperarmL", roll=25), "handL": L("handL", pitch=70),
                  "upperarmR": L("upperarmR", roll=-25), "handR": L("handR", pitch=-70, roll=-30)}
    P["hip_flex"] = {"thighL": L("thighL", pitch=-120), "shinL": L("shinL", pitch=90),
                     "thighR": L("thighR", pitch=20)}
    P["hip_spread"] = {"thighL": L("thighL", roll=45), "thighR": L("thighR", roll=-45, yaw=-40)}
    P["knee_bent"] = {"thighL": L("thighL", pitch=-60), "shinL": L("shinL", pitch=140),
                      "thighR": L("thighR", pitch=-25), "shinR": L("shinR", pitch=70)}
    P["ankle_toe"] = {"thighL": L("thighL", pitch=-30), "footL": L("footL", pitch=45), "toeL": L("toeL", pitch=-60),
                      "thighR": L("thighR", roll=-15), "footR": L("footR", pitch=-20, roll=15, yaw=-10)}
    P["waist_left"] = {"chest": L("chest", yaw=40)}
    P["waist_right"] = {"chest": L("chest", yaw=-40)}
    P["waist_bend"] = {"chest": L("chest", pitch=25, yaw=40)}
    P["waist_arch"] = {"chest": L("chest", pitch=-10, roll=12, yaw=-40)}
    P["neck_left"] = {"head": L("head", yaw=70)}
    P["neck_right"] = {"head": L("head", yaw=-70)}
    P["neck_nod"] = {"neck": L("neck", pitch=20), "head": L("head", pitch=25, yaw=70)}
    P["neck_back"] = {"neck": L("neck", pitch=-15, roll=10), "head": L("head", pitch=-20, yaw=-70, roll=-10)}
    for name, rots in P.items():
        assert not rig.check_limits(rots), (name, rig.check_limits(rots))
    return P


CLOSEUPS = (  # pose, joint to look at, camera azimuth, elevation
    ("knee_bent", "kneeL", 75, 5), ("hip_flex", "hipL", 60, 5), ("elbow_bent", "elbowL", 70, 10),
    ("shoulder_up", "shoulderR", -35, 15), ("ankle_toe", "ankleL", 80, 8), ("waist_bend", "waist", 150, 5),
    ("waist_left", "waist", 20, 5), ("neck_left", "head", 20, 5), ("neck_nod", "head", 200, 12))


def cmd_animate(a):
    model, bones = load_model(a.out)
    R = Renderer(model, bones, app=a.app, look_name=a.look)
    sfx = "_app" if a.app else ""
    if a.app:
        print(f"[animate] Almost Pixel Perfect: {R.n_patches} single-bone patches")
    px, n = a.px, a.cycle_frames
    clips = set(a.clips.split(","))
    t0 = time.time()
    save = lambda img, name, scale=None: nike.save_png(upscale(img, scale or max(1, a.scale // 2)),  # noqa: E731
                                                       os.path.join(a.out, f"{name}{sfx}.png"))
    rest = SKEL.world_mats({})
    WALK_AZ, TURN_AZ, TURN_EL = HERO_AZ + 35, 12, 14
    if "sheets" in clips:
        # rest pose from four sides
        save(sheet([R.frame(camera(az, 6, px), rest, az=az) for az in (0, 90, 180, 270)], 4), "rest_sheet")
        # walk: 8 phases, seen from the side-front
        stills = [R.frame(camera(WALK_AZ, 8, px), *motion.walk_pose(SKEL, k / 8), az=WALK_AZ) for k in range(8)]
        save(sheet(stills, 4), "walk_sheet")
        # turntables: 8 phases, from the front and a little above so both discs show
        stills = [R.frame(camera(TURN_AZ, TURN_EL, px), *motion.turn_pose(SKEL, k / 8), az=TURN_AZ) for k in range(8)]
        save(sheet(stills, 4), "turn_sheet")
        print(f"[animate] sheets ({time.time() - t0:.0f}s)")
    if "joints" in clips:
        poses = named_poses()
        joints = {j.name: j for j in rig.JOINTS}
        shots = []
        for pose_name, joint, az, el in CLOSEUPS:
            mats = SKEL.world_mats(poses[pose_name])
            M = mats[SKEL.index[joints[joint].bone]]
            tgt = M[:, :3] @ joints[joint].pos + M[:, 3]
            cam = camera(az, el, int(px * 0.75), 1.0, target=tuple(tgt), extent=0.16 * H)
            shots.append(R.frame(cam, mats, az=az))
        save(sheet(shots, 3), "joints_sheet")
        print(f"[animate] joint close-ups ({time.time() - t0:.0f}s)")
    if "gbuffer" in clips:
        mats, root = motion.walk_pose(SKEL, 0.1)
        cam = camera(WALK_AZ, 8, px)
        modes = ("lit", "albedo", "normal", "depth", "patches", "bones")
        save(sheet([R.frame(cam, mats, root, mode=m, az=WALK_AZ) for m in modes], 6), "gbuffer")
        print(f"[animate] g-buffer ({time.time() - t0:.0f}s)")
    if "walk" in clips:  # on the spot, seamless loop
        frames = [upscale(R.frame(camera(WALK_AZ, 8, px), *motion.walk_pose(SKEL, i / n), az=WALK_AZ), a.scale)
                  for i in range(n)]
        nike.save_anim(frames, a.out, "walk_cycle" + sfx, a.fps)
        print(f"[animate] walk_cycle {n} frames ({time.time() - t0:.0f}s)")
    if "across" in clips:  # really travelling: the planted foot must stay put on screen
        cycles = 2
        frames = []
        for i in range(n * cycles):
            adv = motion.STRIDE * (i / n - cycles / 2)
            cam = orbit_camera(90, 5, int(px * 2.0), px, radius=fit_radius_for_fov(30, EXTENT) + 0.5, target=CENTER)
            frames.append(upscale(R.frame(cam, *motion.walk_pose(SKEL, (i / n) % 1, adv), az=90), a.scale))
        nike.save_anim(frames, a.out, "walk_across" + sfx, a.fps)
        print(f"[animate] walk_across {len(frames)} frames ({time.time() - t0:.0f}s)")
    if "turn" in clips:
        frames = [upscale(R.frame(camera(TURN_AZ, TURN_EL, px), *motion.turn_pose(SKEL, i / n), az=TURN_AZ), a.scale)
                  for i in range(n)]
        nike.save_anim(frames, a.out, "turn_cycle" + sfx, a.fps)
        print(f"[animate] turn_cycle {n} frames ({time.time() - t0:.0f}s)")
    print(f"[animate] done ({time.time() - t0:.0f}s)")


# ---------------------------------------------------------------- verify
def measure(sc: Sculpt) -> Dict[str, float]:
    """Proportions measured on the meshes, standing to attention (arms straight down), as fractions of H."""
    mats = SKEL.world_mats(rig.anatomical_rots())
    posed = {p.name: p.verts for p in sc.posed_parts(mats, culled=False)}
    cat = lambda *names: np.concatenate([posed[n] for n in names])  # noqa: E731
    h = lambda y: float(y - GROUND) / H  # noqa: E731
    m = dict(rig.measure_joints())
    head = posed["head"]
    m["vertex"] = h(head[:, 1].max())
    front = head[(np.abs(head[:, 0]) < 0.012 * H) & (head[:, 2] > 0.02 * H)]
    m["chin"] = h(front[:, 1].min())
    # eye level = the bottom of the eye socket: the deepest valley of the face profile beside the nose
    strip = head[(np.abs(np.abs(head[:, 0]) - 0.018 * H) < 0.005 * H) & (head[:, 2] > 0)]
    ys = np.linspace(rig.CHIN[1] + 0.03 * H, rig.VERTEX[1] - 0.03 * H, 60)
    near = np.abs(strip[None, :, 1] - ys[:, None]) < 0.005 * H
    prof = np.where(near, strip[None, :, 2], -np.inf).max(1)  # how far forward the face reaches at each height
    valley = [min(prof[:i + 1].max(), prof[i:].max()) - prof[i] for i in range(len(ys))]
    m["eye"] = h(ys[int(np.argmax(valley))])
    sh = cat("clavL", "clavR", "upperarmL", "upperarmR")
    band = sh[np.abs(sh[:, 1] - (rig.SHOULDER[1][1] - 0.015 * H)) < 0.045 * H]
    m["shoulder_width"] = float(band[:, 0].max() - band[:, 0].min()) / H
    hp = cat("pelvis", "thighL", "thighR")
    band = hp[np.abs(hp[:, 1] - rig.HIP[1][1]) < 0.02 * H]
    m["hip_width"] = float(band[:, 0].max() - band[:, 0].min()) / H
    m["fingertip"] = h(posed["handL"][:, 1].min())
    ft = cat("footL", "toeL")
    m["foot_length"] = float(ft[:, 2].max() - ft[:, 2].min()) / H
    m["foot_width"] = float(ft[:, 0].max() - ft[:, 0].min()) / H
    return {k: float(v) for k, v in m.items()}


def proportion_table(sc: Sculpt):
    m = measure(sc)
    return [(k, t, m[k], 100 * (m[k] - t) / t) for k, t in rig.RATIO.items()]


def holes8(mask: np.ndarray) -> int:
    """Empty pixels with at least 5 of their 8 neighbours covered."""
    p = np.pad(mask, 1).astype(np.int32)
    nb = sum(p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx]
             for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))
    return int(((~mask) & (nb >= 5)).sum())


def erode(mask: np.ndarray) -> np.ndarray:
    p = np.pad(mask, 1)
    out = np.ones_like(mask)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out &= p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx]
    return out


def gap_report(R: Renderer, sc: Sculpt, poses: Dict[str, np.ndarray], views=((20, 8), (110, 8), (200, 8)),
               px: int = 192) -> Dict[str, Dict[str, float]]:
    """For every pose: holes in the no-blend splat coverage, three ways.

      holes8   empty pixels with >= 5 of 8 neighbours covered - this also counts the real slits between
               limbs, so ``slits`` gives the same count on the true silhouette for comparison
      missing  pixels strictly inside the true silhouette (the posed, un-culled meshes) that no splat covers
      culled   pixels where the culled meshes show something different from the full meshes (must be 0)"""
    out = {}
    for name, mats in poses.items():
        h8 = miss = cul = sil = slits = 0
        for az, el in views:
            cam = camera(az, el, px)
            cov = R.coverage(cam, mats)
            full = render_gbuffer(sc.posed_parts(mats, False), cam, 2)
            part = render_gbuffer(sc.posed_parts(mats, True), cam, 2)
            gt = full[..., 9] > 0.5
            inner = erode(gt)
            h8 += holes8(cov)
            slits += holes8(gt)
            miss += int((inner & ~cov).sum())
            both = (full[..., 9] > 0.99) & (part[..., 9] > 0.99)
            cul += int(((full[..., 9] > 0.99) != (part[..., 9] > 0.99)).sum()
                       + (both & (np.abs(full[..., 6] - part[..., 6]) > 0.02)).sum())
            sil += int(inner.sum())
        out[name] = dict(holes8=h8, slits=slits, missing=miss, culled=cul, silhouette=sil)
    return out


def sdf_gap_report(poses: Dict[str, np.ndarray], n: int = 16) -> Dict[str, object]:
    """Joint continuity on the solids themselves (no splats involved).

      shared_ball  worst distance (must be < 0) from the joint's shared ball to BOTH bones' solids, rest pose
      pivot        largest disagreement between parent and child about where a joint is, over all poses
      posed_ball   the same ball test in world space, both solids moved by every pose (must be < 0)
      core         the path that leaves the joint into the parent and into the child (1.5 ball radii each
                   way, along the bones) stays this deep inside the posed union, as a fraction of the
                   ball radius, in the worst pose (must be clearly < 0: solid material through the joint)"""
    rng = np.random.default_rng(0)
    d = rng.normal(size=(300, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    ball = max(max(float(body.bone_sdf(j.bone, j.pos + 0.97 * j.shared * d).max()),
                   float(body.bone_sdf(j.parent, j.pos + 0.97 * j.shared * d).max())) for j in rig.JOINTS)
    pivot, posed_ball, core, where = 0.0, -1.0, -1.0, ""
    mid = {b.name: 0.5 * (np.asarray(b.head, float) + np.asarray(b.tail, float)) for b in SKEL.bones}
    t = np.linspace(0, 1, n)[:, None]
    for pose_name, mats in poses.items():
        mats = np.asarray(mats, np.float64)
        inv = body.invert(mats)
        for j in rig.JOINTS:
            Mc, Mp = mats[SKEL.index[j.bone]], mats[SKEL.index[j.parent]]
            jc, jp = body.apply(Mc, j.pos[None])[0], body.apply(Mp, j.pos[None])[0]
            pivot = max(pivot, float(np.linalg.norm(jc - jp)))
            pts = jc + 0.97 * j.shared * d
            posed_ball = max(posed_ball, float(body.posed_bone_sdf(j.bone, pts, mats, inv).max()),
                             float(body.posed_bone_sdf(j.parent, pts, mats, inv).max()))
            ends = []
            for bone, M in ((j.parent, Mp), (j.bone, Mc)):
                v = mid[bone] - j.pos
                step = min(1.5 * j.shared, 0.9 * float(np.linalg.norm(v)))
                ends.append(body.apply(M, (j.pos + step * v / np.linalg.norm(v))[None])[0])
            path = np.concatenate([ends[0] + t * (jc - ends[0]), jc + t * (ends[1] - jc)])
            c = float(body.posed_union_sdf(path, mats).max()) / j.shared
            if c > core:
                core, where = c, f"{j.name} in {pose_name}"
    return dict(shared_ball=ball, pivot=pivot, posed_ball=posed_ball, core=core, core_worst_at=where)


def turntable_report(steps: int = 9) -> Dict[str, float]:
    """Does the outline at a turntable change while it turns?

    The radius of the posed union is probed along 48 rays around the yaw axis at 7 heights, from just
    inside the bottom of the disc to three disc-half-heights above its middle (where the turning bone
    starts).  Two numbers per turntable, both the largest change against the rest pose:

      *_static    rays fixed to the parent, inside the disc: 0 means the turning bone never sticks out
                  past the disc (true for the waist; at the neck the jaw overhangs the disc by design)
      *_turning   rays turning with the child: 0 means everything the child sweeps over is a body of
                  revolution about the yaw axis, so the junction looks the same at every angle"""
    out = {}
    for joint, bone, limit in (("waist", "chest", motion.WAIST_TURN), ("head", "head", motion.NECK_TURN)):
        t = rig.TURNTABLE[joint]
        c = rig.WAIST if joint == "waist" else rig.HEAD
        ang = np.linspace(0, 2 * math.pi, 48, endpoint=False)
        ys = c[1] + np.linspace(-0.9, 3.0, 7) * t["half_height"] * H
        base = np.stack([np.full_like(ys, c[0]), ys, np.full_like(ys, c[2])], 1)[:, None, :]

        def radius(mats, turn=0.0):
            a = ang - math.radians(turn)  # rot_y(turn) carries the direction at angle a to a - turn
            dirs = np.stack([np.cos(a), np.zeros_like(a), np.sin(a)], 1)
            lo = np.zeros((len(ys), len(ang)))
            hi = np.full_like(lo, 2.5 * t["radius"] * H)
            for _ in range(20):  # bisection for the outermost surface along each ray
                m = 0.5 * (lo + hi)
                inside = body.posed_union_sdf(base + m[..., None] * dirs[None], mats) < 0
                lo, hi = np.where(inside, m, lo), np.where(inside, hi, m)
            return 0.5 * (lo + hi)

        ref = radius(SKEL.world_mats({}))
        static = turning = 0.0
        for yaw in np.linspace(-limit, limit, steps):
            mats = SKEL.world_mats({bone: rig.local_rot(bone, yaw=yaw)})
            static = max(static, float(np.abs(radius(mats)[:2] - ref[:2]).max()))  # inside the disc
            turning = max(turning, float(np.abs(radius(mats, yaw) - ref).max()))
        out[joint + "_static"], out[joint + "_turning"] = static, turning
        out[joint + "_radius"] = float(ref[:2].mean())
    return out


def rigid_report(model, bones: np.ndarray, poses: Sequence[np.ndarray], pairs: int = 4000) -> Dict[str, float]:
    """One-hot weights + how much the distance between two splats of the same bone changes under a pose."""
    W = one_hot(bones)
    hot = bool(((W == 0) | (W == 1)).all() and (W.sum(1) == 1).all())
    rng = np.random.default_rng(0)
    order = np.argsort(bones, kind="stable")
    sb = bones[order]
    i = rng.integers(0, len(bones), pairs)
    first = np.searchsorted(sb, sb[i], "left")
    last = np.searchsorted(sb, sb[i], "right")
    j = first + (rng.integers(0, 1 << 30, pairs) % (last - first))
    i, j = order[i], order[j]
    x = model.means.detach()
    d0 = (x[i] - x[j]).norm(dim=1)
    s0 = model.scales().detach()
    worst = worst_scale = 0.0
    for mats in poses:
        with torch.no_grad():
            means, _, scales = pose_splats(model, W, torch.as_tensor(np.asarray(mats, np.float32)))
        worst = max(worst, float(((means[i] - means[j]).norm(dim=1) - d0).abs().max()))
        worst_scale = max(worst_scale, float((scales / s0 - 1).abs().max()))
    return dict(one_hot=hot, max_distance_change=worst, max_scale_change=worst_scale)


def foot_report(sc: Optional[Sculpt] = None, steps: int = 400) -> Dict[str, float]:
    """Planted feet over a travelling walk cycle (advance = STRIDE * phase).

    Each leg is followed through ONE of its own cycles (heel strike to heel strike), so its planted
    point is one world position.  Speeds are world units per cycle (the body moves STRIDE per cycle)."""
    rec = {s: [] for s in (1, -1)}
    reach, bad = 0.0, []
    low = {s: [] for s in (1, -1)}
    root_y, knee = [], 0.0
    foot_v = {}
    if sc is not None:
        idx = {n: i for i, n in enumerate(sc.names)}
        foot_v = {s: (sc.verts[idx["foot" + side]], sc.verts[idx["toe" + side]]) for side, s in rig.SIDES}
    for side, s in rig.SIDES:
        for k in range(steps):
            ph = k / steps - (0.0 if s > 0 else 0.5)  # this leg's phase psi = k / steps
            info = {}
            rots, root = motion.walk_rots(SKEL, ph, motion.STRIDE * ph, info)
            bad += rig.check_limits(rots)
            root_y.append(root[1])
            knee = max(knee, rig.joint_angles("shin" + side, rots["shin" + side])[0])
            mats = SKEL.world_mats(rots, root_offset=root)
            reach = max(reach, info["L"]["reach"], info["R"]["reach"])
            f = motion.foot_world(SKEL, mats, s)
            rec[s].append((info[side]["contact"], f))
            if sc is not None:
                Mf, Mt = mats[SKEL.index["foot" + side]], mats[SKEL.index["toe" + side]]
                y = min(float((foot_v[s][0] @ Mf[:, :3].T + Mf[:, 3])[:, 1].min()),
                        float((foot_v[s][1] @ Mt[:, :3].T + Mt[:, 3])[:, 1].min()))
                low[s].append((info[side]["contact"], y - GROUND))
    out = dict(max_reach=reach, limit_violations=len(bad), root_low=float(min(root_y)), root_high=float(max(root_y)),
               max_knee_bend_deg=float(knee))
    slide = head = 0.0
    for s in (1, -1):
        for contacts, key in ((("heel", "sole"), "heel"),  # the heel pivot: from heel strike until the heel lifts
                              (("sole", "toe"), "toe"),  # the toe hinge: from foot-flat until toe-off
                              (("sole",), "ankle"), (("toe",), "toe_tip")):
            pts = np.array([f[key] for c, f in rec[s] if c in contacts])
            slide = max(slide, float(np.abs(pts - pts.mean(0)).max()))
        head = max(head, max(abs(f["heading"]) for c, f in rec[s] if c is not None),
                   max(abs(f["toe_heading"]) for c, f in rec[s] if c is not None))
    out.update(stance_slide=slide, stance_heading_deg=head)
    if sc is not None:
        st = np.array([y for s in (1, -1) for c, y in low[s] if c is not None])
        sw = np.array([y for s in (1, -1) for c, y in low[s] if c is None])
        out.update(ground_stance_min=float(st.min()), ground_stance_max=float(st.max()), ground_swing_min=float(sw.min()),
                   swing_clearance_max=float(sw.max()))
    eps = 1e-4

    def speed(ph0, ph1):
        a, b = (motion.foot_world(SKEL, motion.walk_pose(SKEL, ph, motion.STRIDE * ph)[0], 1) for ph in (ph0, ph1))
        return max(float(np.linalg.norm(b[k] - a[k])) for k in ("ankle", "heel", "toe")) / (ph1 - ph0)

    mid = motion.STANCE + 0.5 * (1 - motion.STANCE)
    out.update(landing_speed=speed(1.0 - eps, 1.0), liftoff_speed=speed(motion.STANCE, motion.STANCE + eps),
               mid_swing_speed=speed(mid - eps, mid + eps), body_speed=motion.STRIDE)
    return out


def loop_report(fn=None, steps: int = 240) -> Dict[str, float]:
    """Seam of a loop: pose(1) vs pose(0), and how velocity changes from one step to the next (bone
    heads and tails, units per cycle).  A smooth motion's step-to-step velocity change shrinks 4x when
    the steps get 4x finer; a kink (a jump in velocity) does not shrink at all:

      kink  = (largest change with 4x finer steps) / (largest change): ~0.25 = smooth, ~1 = a kink"""
    fn = fn or (lambda ph: motion.walk_pose(SKEL, ph, 0.0)[0])
    pts = np.stack([np.concatenate([b.head, b.tail]) for b in SKEL.bones]).reshape(len(SKEL), 2, 3).astype(np.float64)

    def world(ph):
        M = np.asarray(fn(ph), np.float64)
        return np.einsum("bij,bkj->bki", M[:, :, :3], pts) + M[:, None, :, 3]

    def jumps(n):
        pos = np.stack([world(k / n) for k in range(n + 1)])
        vel = (pos[1:] - pos[:-1]) * n
        return np.abs(np.concatenate([vel[1:] - vel[:-1], vel[:1] - vel[-1:]])).max((1, 2, 3)), float(np.abs(vel).max())

    seam = float(np.abs(np.asarray(fn(1.0), np.float64) - np.asarray(fn(0.0), np.float64)).max())
    jump, speed = jumps(steps)
    fine, _ = jumps(4 * steps)
    return dict(seam_position=seam, seam_velocity_jump=float(jump[-1]), max_velocity_jump=float(jump.max()),
                median_velocity_jump=float(np.median(jump)), max_speed=speed, kink=float(fine.max() / jump.max()),
                seam_kink=float(fine[-1] / max(jump[-1], 1e-12)))


def cull_report(sc: Sculpt, model, bones, n_random: int = 200, seed: int = 123) -> Dict[str, float]:
    """How much surface was dropped as buried, and how many of the splats that remain are buried in
    every pose of a FRESH set of poses (not the ones used for culling).  For comparison the same count
    for splats spread over the un-culled meshes."""
    poses = visibility_poses(n_random, seed)
    radius = float(model.scales().detach().mean())
    x = model.means.detach().numpy()
    out = dict(area_full=sc.area(False), area_kept=sc.area(True), splat_radius=radius, test_poses=len(poses))
    out["dropped_area_fraction"] = 1 - out["area_kept"] / out["area_full"]
    raw = SplatModel.from_mesh(sc.parts(False), model.n, seed=1)
    xr, br = raw.means.detach().numpy(), sc.bone_index[np.asarray(raw.part)]
    for label, margin in (("centre", 0.0), ("whole_splat", radius)):
        out[f"never_visible_{label}"] = float(body.never_visible(x, bones, poses, margin).mean())
        out[f"never_visible_{label}_without_culling"] = float(body.never_visible(xr, br, poses, margin).mean())
    out["hidden_at_rest"] = float(body.inside_other(x, bones, SKEL.world_mats({}), 0.0).mean())
    return out


CHECKS = ("proportions", "rigid", "sdf", "feet", "loop", "cull", "gaps")


def cmd_verify(a):
    sc = Sculpt.load(os.path.join(a.out, MESH_FILE))
    model, bones = load_model(a.out)
    checks = set(a.checks.split(","))
    path = os.path.join(a.out, "soldier_verify.json")
    rep = json.load(open(path)) if os.path.exists(path) else {}
    t0 = time.time()
    named = {k: SKEL.world_mats(r) for k, r in named_poses().items()}
    walk = {f"walk_{k:02d}": motion.walk_pose(SKEL, k / 16)[0] for k in range(16)}
    turn = {f"turn_{k}": motion.turn_pose(SKEL, k / 8)[0] for k in range(8)}
    allp = {**named, **walk, **turn}
    if "proportions" in checks:
        print("== 1. proportions (fraction of body height H; measured standing to attention)")
        rows = proportion_table(sc)
        for k, t, m, dev in rows:
            print(f"   {k:15s} target {t:.3f}  measured {m:.4f}  {dev:+5.1f}%")
        rep["proportions"] = {k: dict(target=t, measured=m, deviation_pct=dev) for k, t, m, dev in rows}
    if "rigid" in checks:
        print("== 2. rigid binding")
        rep["rigid"] = rigid_report(model, bones, list(allp.values()))
        print("  ", rep["rigid"])
    if "sdf" in checks:
        print("== 3a. joints on the solids (no splats)")
        limit = {f"limit_{i}": SKEL.world_mats(r) for i, r in enumerate(rig.limit_poses(40, seed=7))}
        rep["sdf"] = sdf_gap_report({**allp, **limit})
        rep["sdf"]["poses"] = len(allp) + len(limit)
        rep["turntable"] = turntable_report()
        print("  ", rep["sdf"], "\n  ", rep["turntable"])
    if "gaps" in checks:
        print("== 3b. holes in the no-blend splat coverage")
        R = Renderer(model, bones, app=False)
        views = ((35, 8), (125, 12), (215, 8))
        gaps = gap_report(R, sc, named, views, a.px)
        gaps.update(gap_report(R, sc, {k: v for k, v in walk.items() if int(k[-2:]) % 2 == 0}, views[:2], a.px))
        gaps.update(gap_report(R, sc, {k: v for k, v in turn.items() if int(k[-1]) % 2 == 0}, views[:2], a.px))
        for k, g in gaps.items():
            print(f"   {k:14s} holes8 {g['holes8']:4d} (true slits {g['slits']:4d})  missing {g['missing']:4d} of "
                  f"{g['silhouette']:6d} ({100 * g['missing'] / g['silhouette']:.2f}%)  culled-diff {g['culled']}")
        rep["gaps"] = gaps
    if "feet" in checks:
        print("== 4. planted feet (travelling walk)")
        rep["feet"] = foot_report(sc)
        print("  ", rep["feet"])
    if "loop" in checks:
        print("== 5. loop seams")
        rep["loop_walk"] = loop_report()
        rep["loop_turn"] = loop_report(lambda ph: motion.turn_pose(SKEL, ph)[0])
        print("   walk", rep["loop_walk"], "\n   turn", rep["loop_turn"])
    if "cull" in checks:
        print("== buried surface")
        rep["cull"] = cull_report(sc, model, bones)
        print("  ", rep["cull"])
    json.dump(rep, open(path, "w"), indent=1)
    print(f"[verify] done ({time.time() - t0:.0f}s) -> {path}")
    return rep


def main():
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["sculpt", "bake", "animate", "verify", "all"])
    ap.add_argument("-o", "--out", default="out/soldier")
    ap.add_argument("--voxel", type=float, default=0.0075, help="sculpt resolution (world units)")
    ap.add_argument("--splats", type=int, default=30000)
    ap.add_argument("--res", type=int, default=192)
    ap.add_argument("--views", type=int, default=48)
    ap.add_argument("--iters", type=int, default=0, help="G-buffer training steps (0 = mesh-initialised splats)")
    ap.add_argument("--elev-lo", type=float, default=-20.0, help="lowest training camera elevation (deg)")
    ap.add_argument("--elev-hi", type=float, default=35.0, help="highest training camera elevation (deg)")
    ap.add_argument("--px", type=int, default=192, help="pixel-art height")
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--cycle-frames", type=int, default=24, help="frames per loop")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--clips", default="sheets,joints,gbuffer,walk,turn",
                    help="what to render: sheets, joints, gbuffer, walk, across, turn")
    ap.add_argument("--checks", default="proportions,rigid,sdf,feet,loop,cull",
                    help="verify: which checks to run (" + ", ".join(CHECKS) + "); gaps renders ~40 views, run it alone")
    ap.add_argument("--look", default="stylized", choices=look.LOOKS)
    ap.add_argument("--app", action="store_true",
                    help='"Almost Pixel Perfect": single-bone patch snapping + no-blend recombine (outputs *_app)')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    if a.cmd in ("sculpt", "all"):
        cmd_sculpt(a)
    if a.cmd in ("bake", "all"):
        cmd_bake(a)
    if a.cmd in ("animate", "all"):
        cmd_animate(a)
    if a.cmd == "verify":
        cmd_verify(a)


if __name__ == "__main__":
    main()

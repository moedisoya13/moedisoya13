"""Motion clips for the soldier: a sequence of poses that can be saved, loaded, replayed and blended.

A clip is what ``retarget.py`` produces from a video and what ``mocap.py render`` plays:

    fps        frames per second
    bones      names of the bones the clip stores (body + whatever costume helpers existed when it was made)
    quat       (T, B, 4) LOCAL rotation of every bone per frame, quaternions (w, x, y, z)
    root       (T, 3)    root offset per frame (what ``Skeleton.world_mats(rots, root_offset=...)`` takes)
    contact    (T, 2)    how firmly the left / right foot is planted (0..1)
    flight     (T,)      True while both feet are off the ground
    drive      (T, 4)    what the costume helper drive was given: gait phase, walk amount, chest / head spin
    meta       dict      where the clip came from (video name, frame range, model hash, code version,
                         retarget parameters, joint-limit report)

Playing a clip does NOT trust the stored helper bones (skirt, cape, plume): by default they are driven
again from the body pose with the current ``motion.drive_helpers``, so a clip made before the costume
rig changed still plays on the changed rig (``Player``).
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from scipy.spatial.transform import Rotation

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion  # noqa: E402
import rig  # noqa: E402

FORMAT = 1
SIDES = ("L", "R")


# ---------------------------------------------------------------- quaternions (w, x, y, z)
def mat_to_quat(R: np.ndarray) -> np.ndarray:
    """(..., 3, 3) rotation matrices -> (..., 4) unit quaternions with w >= 0."""
    R = np.asarray(R, np.float64)
    q = Rotation.from_matrix(R.reshape(-1, 3, 3)).as_quat()  # scipy's order is (x, y, z, w)
    q = np.concatenate([q[:, 3:], q[:, :3]], 1)
    q = np.where(q[:, :1] < 0, -q, q)
    return q.reshape(R.shape[:-2] + (4,))


def quat_to_mat(q: np.ndarray) -> np.ndarray:
    q = np.asarray(q, np.float64)
    q = q / np.linalg.norm(q, axis=-1, keepdims=True)
    w, x, y, z = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    return np.stack([np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], -1),
                     np.stack([2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], -1),
                     np.stack([2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], -1)], -2)


def slerp(q0: np.ndarray, q1: np.ndarray, t) -> np.ndarray:
    """Shortest-way interpolation between unit quaternions, (..., 4); ``t`` broadcasts over the leading axes."""
    q0, q1 = np.asarray(q0, np.float64), np.asarray(q1, np.float64)
    t = np.asarray(t, np.float64)[..., None]
    d = np.sum(q0 * q1, -1, keepdims=True)
    q1 = np.where(d < 0, -q1, q1)
    d = np.clip(np.abs(d), 0.0, 1.0)
    th = np.arccos(d)
    small = th < 1e-5
    s = np.where(small, 1.0, np.sin(th))
    a = np.where(small, 1 - t, np.sin((1 - t) * th) / s)
    b = np.where(small, t, np.sin(t * th) / s)
    out = a * q0 + b * q1
    return out / np.linalg.norm(out, axis=-1, keepdims=True)


def geodesic_deg(Ra: np.ndarray, Rb: np.ndarray) -> np.ndarray:
    """Angle (degrees) between rotations, (..., 3, 3)."""
    Ra, Rb = np.asarray(Ra, np.float64), np.asarray(Rb, np.float64)
    D = np.swapaxes(Ra, -1, -2) @ Rb
    c = (np.trace(D, axis1=-2, axis2=-1) - 1.0) / 2.0
    s = np.linalg.norm(Ra - Rb, axis=(-2, -1)) / np.sqrt(8.0)  # = sin(angle / 2): precise near 0
    return np.degrees(np.where(c > 0.9, 2.0 * np.arcsin(np.clip(s, 0, 1)), np.arccos(np.clip(c, -1.0, 1.0))))


# ---------------------------------------------------------------- the clip
def body_bones() -> List[str]:
    """Bones a clip must define; everything else in the skeleton is a costume helper that is driven."""
    return list(rig.GEOMETRY_BONES)


def drive(rots: Dict[str, np.ndarray], phase: float = 0.0, walk: float = 0.0, chest_spin: float = 0.0,
          head_spin: float = 0.0, state: Optional[dict] = None, dt: float = 1.0 / 30.0) -> Dict[str, np.ndarray]:
    """The ONE place this pipeline calls ``motion.drive_helpers`` (skirt, cape, plume from the body pose).

    The first five arguments are the signature the rig promises to keep.  ``state`` / ``dt`` (cloth that
    falls back at a limited speed instead of snapping) are passed on only if the rig's function takes
    them, so the pipeline runs on the rig both before and after that feature."""
    kw = {}
    if state is not None and _DRIVE_TAKES_PREV:
        kw = dict(prev=state, dt=dt)
    return motion.drive_helpers(rots, phase, walk, chest_spin, head_spin, **kw)


def _takes_prev() -> bool:
    import inspect
    try:
        p = inspect.signature(motion.drive_helpers).parameters
    except (TypeError, ValueError):
        return False
    return "prev" in p and "dt" in p


_DRIVE_TAKES_PREV = _takes_prev()


@dataclass
class Clip:
    fps: float
    bones: List[str]
    quat: np.ndarray  # (T, B, 4)
    root: np.ndarray  # (T, 3)
    contact: Optional[np.ndarray] = None  # (T, 2)
    flight: Optional[np.ndarray] = None  # (T,)
    drive: Optional[np.ndarray] = None  # (T, 4): phase, walk, chest_spin, head_spin
    meta: dict = field(default_factory=dict)

    def __post_init__(self):
        T = len(self.root)
        self.quat = np.asarray(self.quat, np.float32)
        self.root = np.asarray(self.root, np.float32)
        self.contact = np.zeros((T, 2), np.float32) if self.contact is None else np.asarray(self.contact, np.float32)
        self.flight = np.zeros(T, bool) if self.flight is None else np.asarray(self.flight, bool)
        self.drive = np.zeros((T, 4), np.float32) if self.drive is None else np.asarray(self.drive, np.float32)
        assert self.quat.shape == (T, len(self.bones), 4), (self.quat.shape, T, len(self.bones))

    def __len__(self):
        return len(self.root)

    @property
    def duration(self) -> float:
        return len(self) / self.fps

    # ---- building
    @classmethod
    def from_rots(cls, fps: float, frames: Sequence[Dict[str, np.ndarray]], roots, bones: Optional[List[str]] = None,
                  **kw) -> "Clip":
        """From a list of {bone: 3x3 local rotation} dicts (bones missing from a dict are at rest)."""
        bones = bones or [b.name for b in rig.SKELETON.bones]
        eye = np.eye(3)
        R = np.stack([np.stack([np.asarray(f.get(b, eye), np.float64) for b in bones]) for f in frames])
        return cls(fps, list(bones), mat_to_quat(R), np.asarray(roots, np.float32), **kw)

    # ---- reading
    def rots(self, i: int, helpers: bool = True) -> Dict[str, np.ndarray]:
        """{bone: 3x3 local rotation} of frame ``i`` for the bones the current skeleton knows."""
        M = quat_to_mat(self.quat[i])
        body = set(body_bones())
        return {b: M[k] for k, b in enumerate(self.bones) if b in rig.PARENT and (helpers or b in body)}

    def body_rots(self, i: int) -> Dict[str, np.ndarray]:
        return self.rots(i, helpers=False)

    def pose(self, i: int, state: Optional[dict] = None, stored_helpers: bool = False):
        """(bone matrices, root) of frame ``i``, ready for ``Renderer.frame``.  The costume helpers are
        driven afresh from the body pose (pass the same ``state`` dict frame after frame for cloth
        inertia) unless ``stored_helpers``."""
        rots = self.rots(i, helpers=stored_helpers)
        if not stored_helpers:
            ph, walk, cs, hs = (float(v) for v in self.drive[i])
            drive(rots, ph, walk, cs, hs, state=state, dt=1.0 / self.fps)
        root = self.root[i].astype(np.float64)
        return rig.SKELETON.world_mats(rots, root_offset=root), root

    def sub(self, a: int, b: int, step: int = 1) -> "Clip":
        s = slice(a, b, step)
        meta = dict(self.meta, sub=[int(a), int(b), int(step)])
        return Clip(self.fps / step, list(self.bones), self.quat[s], self.root[s], self.contact[s], self.flight[s],
                    self.drive[s], meta)

    def resample(self, fps: float) -> "Clip":
        """The same motion at another frame rate (rotations slerped, positions lerped)."""
        T = len(self)
        n = max(int(round((T - 1) * fps / self.fps)) + 1, 1)
        x = np.arange(n) * self.fps / fps
        i0 = np.clip(np.floor(x).astype(int), 0, T - 1)
        i1 = np.clip(i0 + 1, 0, T - 1)
        t = (x - i0).astype(np.float32)
        lerp = lambda a: a[i0] * (1 - t[:, None]) + a[i1] * t[:, None]  # noqa: E731
        return Clip(fps, list(self.bones), slerp(self.quat[i0], self.quat[i1], t[:, None]), lerp(self.root),
                    lerp(self.contact), self.flight[np.round(x).astype(int).clip(0, T - 1)], lerp(self.drive),
                    dict(self.meta, resampled_from=self.fps))

    # ---- files
    def save(self, path: str):
        np.savez_compressed(path, format=np.array(FORMAT), fps=np.array(float(self.fps)), bones=np.array(self.bones),
                            quat=self.quat, root=self.root, contact=self.contact, flight=self.flight, drive=self.drive,
                            meta=np.array(json.dumps(self.meta, ensure_ascii=False, default=_jsonable)))

    @classmethod
    def load(cls, path: str) -> "Clip":
        z = np.load(path, allow_pickle=False)
        if int(z["format"]) > FORMAT:
            raise ValueError(f"{path}: clip format {int(z['format'])} is newer than this code ({FORMAT})")
        return cls(float(z["fps"]), [str(b) for b in z["bones"]], z["quat"], z["root"], z["contact"], z["flight"],
                   z["drive"], json.loads(str(z["meta"])))


def _jsonable(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, np.bool_):
        return bool(o)
    return str(o)


class Player:
    """Plays a clip frame after frame, keeping the cloth state between frames (so skirt and cape that were
    lifted fall back at their own speed).  ``loop`` wraps around, moving on by the clip's travel each time."""

    def __init__(self, clip: Clip, loop: bool = False, stored_helpers: bool = False):
        self.clip, self.loop, self.stored = clip, loop, stored_helpers
        self.state: dict = {}
        self.travel = np.asarray(clip.meta.get("loop_travel", [0.0, 0.0, 0.0]), np.float64)

    def pose(self, i: int):
        T = len(self.clip)
        lap, k = (divmod(i, T) if self.loop else (0, min(max(i, 0), T - 1)))
        mats, root = self.clip.pose(k, state=self.state, stored_helpers=self.stored)
        if lap:
            shift = lap * self.travel
            mats = mats.copy()
            mats[:, :, 3] += shift.astype(mats.dtype)
            root = root + shift
        return mats, root


# ---------------------------------------------------------------- joining clips
def _common(a: Clip, b: Clip) -> Tuple[List[str], np.ndarray, np.ndarray]:
    bones = [x for x in a.bones if x in b.bones]
    ia = np.array([a.bones.index(x) for x in bones])
    ib = np.array([b.bones.index(x) for x in bones])
    return bones, ia, ib


def _ease(n: int) -> np.ndarray:
    """n weights rising smoothly from just above 0 to just below 1."""
    x = (np.arange(n) + 1.0) / (n + 1.0)
    return x * x * (3 - 2 * x)


def blend(a: Clip, b: Clip, overlap: int) -> Clip:
    """``a`` followed by ``b``, cross-faded over ``overlap`` frames (the last frames of ``a`` with the
    first of ``b``).  Rotations are slerped.  The root is blended by its VELOCITY in the ground plane, so
    ``b`` carries on from wherever ``a`` got to instead of sliding towards its own start; height is
    blended directly.  Feet are not re-planted: during the overlap they may slip (see ``retarget.foot_slip``)."""
    if abs(a.fps - b.fps) > 1e-6:
        b = b.resample(a.fps)
    overlap = int(min(overlap, len(a) - 1, len(b) - 1))
    bones, ia, ib = _common(a, b)
    na = len(a) - overlap
    w = _ease(overlap)
    quat = np.concatenate([a.quat[:na, ia], slerp(a.quat[na:, ia], b.quat[:overlap, ib], w[:, None]), b.quat[overlap:, ib]])
    lerp = lambda x, y: x * (1 - w[:, None]) + y * w[:, None]  # noqa: E731
    # root: integrate blended ground-plane steps (frame j -> j + 1 of the result)
    n = len(quat)
    wf = np.concatenate([np.zeros(na), w, np.ones(n - na - overlap)])  # weight of ``b`` per result frame
    da, db = np.diff(a.root.astype(np.float64), axis=0), np.diff(b.root.astype(np.float64), axis=0)
    root = np.zeros((n, 3))
    root[0] = a.root[0]
    for j in range(n - 1):
        sa = da[j] if j < len(da) else None
        sb = db[min(max(j - na, 0), len(db) - 1)] if len(db) else None
        wj = wf[j + 1]
        if sa is None:
            step = sb
        elif sb is None or wj == 0.0:
            step = sa
        else:
            step = (1 - wj) * sa + wj * sb
        root[j + 1] = root[j] + step
    root[:, 1] = np.concatenate([a.root[:na, 1], lerp(a.root[na:, 1:2], b.root[:overlap, 1:2])[:, 0], b.root[overlap:, 1]])
    contact = np.concatenate([a.contact[:na], lerp(a.contact[na:], b.contact[:overlap]), b.contact[overlap:]])
    drv = np.concatenate([a.drive[:na], lerp(a.drive[na:], b.drive[:overlap]), b.drive[overlap:]])
    flight = np.concatenate([a.flight[:na], a.flight[na:] & b.flight[:overlap], b.flight[overlap:]])
    meta = dict(blend=dict(a=a.meta.get("name", "?"), b=b.meta.get("name", "?"), overlap=overlap, at=na))
    return Clip(a.fps, bones, quat, root, contact, flight, drv, meta)


def make_loop(c: Clip, start: int, end: int, overlap: int = 4) -> Clip:
    """A clip that repeats seamlessly: frames [start, end) of ``c``, whose last ``overlap`` frames are bent
    towards the frames just before ``start`` (so frame ``end`` would be frame ``start`` again).  Choose
    ``start`` / ``end`` one gait cycle apart, e.g. two left heel strikes (``retarget.cycle_bounds``).
    ``meta['loop_travel']`` is how far the root moves per lap; ``Player(loop=True)`` adds it each time."""
    n = end - start
    overlap = int(max(0, min(overlap, n - 1, start)))
    quat = c.quat[start:end].copy()
    root = c.root[start:end].astype(np.float64).copy()
    contact, drv, flight = c.contact[start:end].copy(), c.drive[start:end].copy(), c.flight[start:end].copy()
    travel = (c.root[end] - c.root[start]).astype(np.float64) if end < len(c) else root[-1] - root[0]
    travel[1] = 0.0
    if overlap:
        w = _ease(overlap)
        tail = slice(n - overlap, n)
        pre = slice(start - overlap, start)
        quat[tail] = slerp(quat[tail], c.quat[pre], w[:, None])
        # the frames before ``start``, moved on by one lap, are what the tail has to arrive at
        target = c.root[pre].astype(np.float64) + travel
        root[tail] = root[tail] * (1 - w[:, None]) + target * w[:, None]
        contact[tail] = contact[tail] * (1 - w[:, None]) + c.contact[pre] * w[:, None]
    meta = dict(c.meta, loop=[int(start), int(end)], loop_overlap=overlap, loop_travel=[float(v) for v in travel])
    return Clip(c.fps, list(c.bones), quat, root, contact, flight, drv, meta)

"""Retarget: 33 pose landmarks per frame (MediaPipe's layout) -> soldier rig rotations + a root path.

    capture (world landmarks, hip-centred, metres; image landmarks; visibility)
      -> clean      drop unsure points, spikes and points that stretch a bone; bridge the gaps along the
                    skeleton; low-pass without lag, harder on still points than on fast ones
      -> to_rig     MediaPipe axes (x right, y DOWN, z AWAY from the camera) -> rig axes (y up, +z towards
                    the camera, +x = image right); scaled so the body is the soldier's size
      -> solve_pose bone DIRECTIONS only (the soldier keeps his own bone lengths): pelvis from the hip line
                    and the lean of the trunk, chest from the shoulder line, head from ears and nose, limbs
                    from their two segments (the plane of elbow / knee fixes the twist), feet from the
                    heel -> toe line and the ankle above it.  Every joint is brought inside the rig's limits;
                    how far it had to be moved is recorded.
      -> contacts   which foot is planted when (height above the ground + speed, with hysteresis)
      -> root       a planted foot is a fixed footprint in the world and the pelvis is found backwards from
                    it; with both feet off the ground the centre of mass flies a parabola under gravity
      -> foot IK    planted feet are put exactly on their footprints (motion.leg_ik), blended in and out
      -> helpers    skirt, cape, plume from the body pose (motion.drive_helpers)
      -> Clip

World of the result: the camera's.  The camera looks along -z, so the rig's "front view" (azimuth 0) is
the view of the video.  Landmark order and names: ``LM``.

Two places wrap rig API that is still moving, so nothing else here has to change when it does:
``limit_rot`` (the rig's "nearest rotation inside the limits") and ``clip.drive`` (costume helper bones).
"""
from __future__ import annotations

import math
import sys
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.signal import butter, filtfilt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import clip as clip_mod  # noqa: E402
import motion  # noqa: E402
import rig  # noqa: E402
from clip import Clip  # noqa: E402
from pixelsplat.skin import rot_x, rot_y  # noqa: E402

VERSION = "mocap-1"
H, GROUND, SKEL = rig.H, rig.GROUND, rig.SKELETON
UNITS_PER_M = H / 1.75  # the soldier is a 1.75 m man, H units tall
GRAVITY = 9.81 * UNITS_PER_M  # rig units / s^2
MP_TO_RIG = np.diag([1.0, -1.0, -1.0])  # a half turn about x: handedness is kept, left stays left
SIDE_KEYS = (("L", 1, "left"), ("R", -1, "right"))

LM = ["nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
      "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow",
      "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index",
      "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
      "left_heel", "right_heel", "left_foot_index", "right_foot_index"]
IDX = {n: i for i, n in enumerate(LM)}
CONNECTIONS = [(0, 2), (2, 7), (0, 5), (5, 8), (9, 10), (11, 12), (11, 13), (13, 15), (15, 19), (15, 17), (17, 19),
               (12, 14), (14, 16), (16, 20), (16, 18), (18, 20), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27),
               (27, 29), (29, 31), (27, 31), (24, 26), (26, 28), (28, 30), (30, 32), (28, 32)]

EX, EY, EZ = np.eye(3)


# ---------------------------------------------------------------- small maths
def unit(v, fallback=None):
    n = float(np.linalg.norm(v))
    if n < 1e-9:
        return np.array(EY if fallback is None else fallback, float)
    return np.asarray(v, float) / n


def smoothstep(x):
    x = min(max(float(x), 0.0), 1.0)
    return x * x * (3 - 2 * x)


def perp(v, axis):
    """The part of v perpendicular to the unit vector ``axis``."""
    return v - (v @ axis) * axis


def shortest_arc(a, b) -> np.ndarray:
    """The smallest rotation that takes unit vector a to unit vector b."""
    c = float(a @ b)
    ax = np.cross(a, b)
    s = float(np.linalg.norm(ax))
    if s < 1e-9:
        if c > 0:
            return np.eye(3)
        ax = unit(perp(EX, a), EZ)  # half a turn: any axis across a will do
        return rig.rot_axis(ax, 180.0)
    return rig.rot_axis(ax / s, math.degrees(math.atan2(s, c)))


def frame_yx(y, x_hint) -> np.ndarray:
    """Right-handed frame [x y z] with y exact and x as near ``x_hint`` as it can be."""
    y = unit(y)
    x = unit(perp(np.asarray(x_hint, float), y), perp(EX, y))
    return np.stack([x, y, np.cross(x, y)], 1)


def frame_xy(x, y_hint) -> np.ndarray:
    """Right-handed frame [x y z] with x exact and y as near ``y_hint`` as it can be."""
    x = unit(x, EX)
    y = unit(perp(np.asarray(y_hint, float), x), perp(EY, x))
    return np.stack([x, y, np.cross(x, y)], 1)


def mix_dirs(a, wa: float, b):
    """Unit vector between two directions (weight ``wa`` on a); the heavier one if they cancel."""
    v = wa * np.asarray(a, float) + (1 - wa) * np.asarray(b, float)
    if np.linalg.norm(v) < 1e-3:
        return unit(a if wa >= 0.5 else b)
    return unit(v)


def heading_pitch(W: np.ndarray) -> Tuple[float, float]:
    """(heading, pitch) in degrees of a foot's world rotation: where its toes point in the ground plane
    (0 = +z, + = towards +x) and how far they point down (+)."""
    f = W @ EZ
    return math.degrees(math.atan2(f[0], f[2])), math.degrees(math.asin(float(np.clip(-f[1], -1, 1))))


# ---------------------------------------------------------------- the rig seen as joint angles
def _frames() -> Dict[str, np.ndarray]:
    """Rest orientation of every bone's anatomical frame (identity except the A-posed arms), derived
    from the public ``rig.local_rot`` so it follows whatever the rig defines."""
    F = {}
    for b in SKEL.bones:
        F[b.name] = np.eye(3) if b.parent is None else np.asarray(rig.local_rot(b.name), float).T @ F[b.parent]
    return F


FRAME = _frames()


def limit_rot(bone: str, R_local: np.ndarray) -> Tuple[np.ndarray, float]:
    """(nearest local rotation inside the joint limits, how many degrees the input was outside).

    THE adapter for the rig's limit function.  Uses ``rig.clamp_rot`` when the rig has it; otherwise
    clips the Euler angles (cruder: not the nearest rotation, and blind at roll = +-90)."""
    lim = rig.limits(bone)
    if lim is None:
        return R_local, 0.0
    ang = rig.joint_angles(bone, R_local)
    if all(lo - 1e-6 <= a <= hi + 1e-6 for a, (lo, hi) in zip(ang, lim)):
        return R_local, 0.0
    fn = getattr(rig, "clamp_rot", None)
    if fn is not None:
        R, _, excess = fn(bone, R_local)
        return np.asarray(R, float), float(excess)
    best = None
    for cand in (ang, (ang[0] + 180.0, ang[1] + 180.0, 180.0 - ang[2])):
        c = [min(max(0.5 * (lo + hi) + ((a - 0.5 * (lo + hi) + 180.0) % 360.0 - 180.0), lo), hi)
             for a, (lo, hi) in zip(cand, lim)]
        R = rig.local_rot(bone, *c)
        e = float(clip_mod.geodesic_deg(R, R_local))
        if best is None or e < best[1]:
            best = (R, e)
    return best


def fk(rots: Dict[str, np.ndarray], root=(0.0, 0.0, 0.0)) -> np.ndarray:
    """``Skeleton.world_mats`` in float64: (B, 3, 4) rest -> posed matrices."""
    out = {}
    for b in SKEL.bones:
        R = np.asarray(rots.get(b.name, np.eye(3)), np.float64)
        head = np.asarray(b.head, np.float64)
        T = np.eye(4)
        T[:3, :3] = R
        T[:3, 3] = head - R @ head
        if b.parent is None:
            T[:3, 3] += np.asarray(root, np.float64)
            out[b.name] = T
        else:
            out[b.name] = out[b.parent] @ T
    return np.stack([out[b.name][:3] for b in SKEL.bones])


def at(mats: np.ndarray, bone: str, p) -> np.ndarray:
    M = mats[SKEL.index[bone]]
    return M[:, :3] @ np.asarray(p, np.float64) + M[:, 3]


# ---------------------------------------------------------------- the soldier's own 33 landmarks
def _landmark_table() -> List[Tuple[str, np.ndarray]]:
    """landmark number -> (bone it rides on, rest position): where MediaPipe's points sit on the soldier."""
    V, Yh = rig.V, rig.Y
    t: Dict[str, Tuple[str, np.ndarray]] = {}
    eye_h = rig.RATIO["eye"]
    t["nose"] = ("head", V(0.0, Yh(eye_h - 0.0185), 0.062 * H))
    for name, s, _ in SIDE_KEYS:
        side = "left" if s > 0 else "right"
        t[side + "_eye_inner"] = ("head", V(s * 0.008 * H, Yh(eye_h), 0.046 * H))
        t[side + "_eye"] = ("head", V(s * 0.017 * H, Yh(eye_h), 0.045 * H))
        t[side + "_eye_outer"] = ("head", V(s * 0.026 * H, Yh(eye_h), 0.041 * H))
        t[side + "_ear"] = ("head", V(s * 0.0445 * H, Yh(eye_h - 0.007), -0.0045 * H))
        t["mouth_" + side] = ("head", V(s * 0.012 * H, Yh(0.893), 0.047 * H))
        t[side + "_shoulder"] = ("upperarm" + name, rig.SHOULDER[s])
        t[side + "_elbow"] = ("forearm" + name, rig.ELBOW[s])
        t[side + "_wrist"] = ("hand" + name, rig.WRIST[s])
        a, hand = rig.ARM_AXIS[s], rig.RATIO["hand"] * H
        t[side + "_index"] = ("hand" + name, rig.WRIST[s] + 0.75 * hand * a + V(0.0, 0.0, 0.018 * H))
        t[side + "_pinky"] = ("hand" + name, rig.WRIST[s] + 0.65 * hand * a + V(0.0, 0.0, -0.020 * H))
        t[side + "_thumb"] = ("hand" + name, rig.WRIST[s] + 0.35 * hand * a + V(0.0, 0.0, 0.030 * H))
        t[side + "_hip"] = ("thigh" + name, rig.HIP[s])
        t[side + "_knee"] = ("shin" + name, rig.KNEE[s])
        t[side + "_ankle"] = ("foot" + name, rig.ANKLE[s])
        x, sole = rig.ANKLE[s][0], GROUND + 0.011 * H  # heel and toe tip at the same height: flat foot = level
        t[side + "_heel"] = ("foot" + name, V(x, sole, -rig.HEEL_BACK * rig.FOOT_LEN + 0.010 * H))
        t[side + "_foot_index"] = ("toe" + name, V(x, sole, rig.TOE_TIP[s][2]))
    return [t[n] for n in LM]


LANDMARK_TABLE = _landmark_table()
_LM_BONE = np.array([SKEL.index[b] for b, _ in LANDMARK_TABLE])
_LM_REST = np.stack([p for _, p in LANDMARK_TABLE])


def rig_landmarks(mats: np.ndarray) -> np.ndarray:
    """(33, 3) world positions of the soldier's landmarks under a pose (matrices from ``fk`` / world_mats)."""
    M = np.asarray(mats, np.float64)[_LM_BONE]
    return np.einsum("nij,nj->ni", M[:, :, :3], _LM_REST) + M[:, :, 3]


REST_LM = rig_landmarks(fk({}))

# segment masses (fractions of body mass) and where each segment's centre of mass lies along its bone
# (Winter, "Biomechanics and Motor Control of Human Movement", table 4.1; trunk split thorax+abdomen / pelvis)
_SEGMENTS = [("pelvis", 0.142, 0.20), ("chest", 0.355, 0.45), ("neck", 0.012, 0.50), ("head", 0.069, 0.45)]
for _n, _s, _ in SIDE_KEYS:
    _SEGMENTS += [("upperarm" + _n, 0.028, 0.436), ("forearm" + _n, 0.016, 0.430), ("hand" + _n, 0.006, 0.506),
                  ("thigh" + _n, 0.100, 0.433), ("shin" + _n, 0.0465, 0.433), ("foot" + _n, 0.0145, 0.50)]
_SEG_BONE = np.array([SKEL.index[b] for b, _, _ in _SEGMENTS])
_SEG_MASS = np.array([m for _, m, _ in _SEGMENTS]) / sum(m for _, m, _ in _SEGMENTS)
_SEG_REST = np.stack([np.asarray(SKEL.bones[SKEL.index[b]].head, float) * (1 - f)
                      + np.asarray(SKEL.bones[SKEL.index[b]].tail, float) * f for b, _, f in _SEGMENTS])


def center_of_mass(mats: np.ndarray) -> np.ndarray:
    """Whole-body centre of mass under a pose (segment masses of an average man)."""
    M = np.asarray(mats, np.float64)[_SEG_BONE]
    return _SEG_MASS @ (np.einsum("nij,nj->ni", M[:, :, :3], _SEG_REST) + M[:, :, 3])


# ---------------------------------------------------------------- cleaning the landmark tracks
def despike(x: np.ndarray, k: float = 6.0, floor: float = 0.0) -> Tuple[np.ndarray, np.ndarray]:
    """Single-frame outliers along axis 0.  A sample is compared with the mean of its two neighbours
    (so steady fast motion does not count, only a kink); one further off than k robust deviations of that
    difference over the whole track (and ``floor``), and further than both neighbours' own differences,
    is replaced by the neighbours' mean.  NaNs pass through.  Returns (cleaned, mask of replaced samples)."""
    x = np.asarray(x, np.float64)
    if len(x) < 5:
        return x.copy(), np.zeros(x.shape, bool)
    r = np.zeros_like(x)
    mid = 0.5 * (x[:-2] + x[2:])
    r[1:-1] = x[1:-1] - mid
    with np.errstate(invalid="ignore"):
        mad = 1.4826 * np.nanmedian(np.abs(r[1:-1]), 0)
        big = np.abs(r) > np.maximum(k * mad, floor)
        peak = np.zeros_like(big)
        peak[1:-1] = (np.abs(r[1:-1]) >= np.nan_to_num(np.abs(r[:-2]))) & (np.abs(r[1:-1]) >= np.nan_to_num(np.abs(r[2:])))
    bad = big & peak
    out = x.copy()
    out[1:-1] = np.where(bad[1:-1], mid, x[1:-1])
    return out, bad


def fill_gaps(x: np.ndarray, ok: np.ndarray) -> np.ndarray:
    """Linear interpolation of the samples where ``ok`` is False (ends are held).  x (T, ...), ok (T,)."""
    x = np.asarray(x, np.float64).copy()
    idx = np.flatnonzero(ok)
    if len(idx) == 0:
        return np.zeros_like(x)
    if len(idx) == len(x):
        return x
    t = np.arange(len(x))
    flat = x.reshape(len(x), -1)
    for c in range(flat.shape[1]):
        flat[:, c] = np.interp(t, idx, flat[idx, c])
    return flat.reshape(x.shape)


def _parents() -> List[Tuple[int, Optional[int]]]:
    """(landmark, the landmark it hangs from) in an order that has every parent before its children."""
    out: List[Tuple[int, Optional[int]]] = [(IDX[n], None) for n in LM[:11]]
    for side in ("left", "right"):
        chain = [("hip", None), ("shoulder", None), ("knee", "hip"), ("ankle", "knee"), ("heel", "ankle"), ("foot_index", "ankle"),
                 ("elbow", "shoulder"), ("wrist", "elbow"), ("pinky", "wrist"), ("index", "wrist"), ("thumb", "wrist")]
        out += [(IDX[f"{side}_{a}"], None if b is None else IDX[f"{side}_{b}"]) for a, b in chain]
    return out


def fill_gaps_skeleton(X: np.ndarray, ok: np.ndarray) -> np.ndarray:
    """Fill missing landmarks (T, 33, 3).  A missing point of a limb is not interpolated on its own - during
    a fast swing a straight line between where it was and where it reappears cuts the corner and bends the
    limb - but RELATIVE to the joint it hangs from: the direction from that joint is interpolated and the
    distance kept, then the (already filled) joint's position is added back."""
    X = np.asarray(X, np.float64).copy()
    for j, parent in _parents():
        if ok[:, j].all():
            continue
        if parent is None or not ok[:, j].any():
            X[:, j] = fill_gaps(X[:, j], ok[:, j])
            continue
        rel = X[:, j] - X[:, parent]
        length = np.linalg.norm(rel, axis=-1)
        rel_f = fill_gaps(rel, ok[:, j])
        len_f = fill_gaps(length, ok[:, j])
        n = np.linalg.norm(rel_f, axis=-1)
        rel_f = rel_f * (len_f / np.maximum(n, 1e-9))[:, None]
        X[:, j] = np.where(ok[:, j, None], X[:, j], X[:, parent] + rel_f)
    return X


def one_euro(x: np.ndarray, fps: float, min_cutoff: float = 2.5, beta: float = 1.5, d_cutoff: float = 1.0,
             both_ways: bool = True) -> np.ndarray:
    """One Euro filter along axis 0 (Casiez et al. 2012): a low-pass whose cutoff rises with speed - still
    points are steadied, fast ones are not dragged.  ``both_ways`` averages a forward and a backward pass,
    which cancels the lag (possible because the whole clip is known)."""
    x = np.asarray(x, np.float64)

    def run(v):
        alpha = lambda c: 1.0 / (1.0 + fps / (2 * math.pi * c))  # noqa: E731
        out = np.empty_like(v)
        out[0] = v[0]
        dx = np.zeros_like(v[0])
        ad = alpha(d_cutoff)
        for i in range(1, len(v)):
            dx = dx + ad * ((v[i] - out[i - 1]) * fps - dx)
            a = alpha(min_cutoff + beta * np.abs(dx))
            out[i] = out[i - 1] + a * (v[i] - out[i - 1])
        return out

    if len(x) < 2:
        return x.copy()
    f = run(x)
    return 0.5 * (f + run(x[::-1])[::-1]) if both_ways else f


def lowpass(x: np.ndarray, fps: float, cutoff: float) -> np.ndarray:
    """Zero-phase low-pass along axis 0 (2nd-order Butterworth run forwards and backwards: no lag, and
    much less loss just below the cutoff than a one-pole filter).  Too short a clip or a cutoff at the
    sampling limit: returned as is."""
    x = np.asarray(x, np.float64)
    wn = cutoff / (0.5 * fps)
    if wn >= 0.95 or len(x) < 12:
        return x.copy()
    b, a = butter(2, wn)
    return filtfilt(b, a, x, axis=0, padlen=min(9, len(x) - 1))


def adaptive_lowpass(x: np.ndarray, fps: float, still_hz: float, fast_hz: float, v_lo: float, v_hi: float) -> np.ndarray:
    """The One Euro idea without its lag or its loss on fast motion: every point (x: (T, J, D)) gets a hard
    low-pass while it is still (kills jitter) and a light one while it moves fast (keeps the motion); in
    between the two results are mixed by the point's own speed (units of x per second)."""
    fast = lowpass(x, fps, fast_hz)
    slow = lowpass(x, fps, still_hz)
    if len(x) < 3:
        return fast
    speed = np.linalg.norm(np.gradient(fast, axis=0), axis=-1) * fps
    speed = _rolling(speed, max(int(round(0.05 * fps)), 1), np.mean)
    w = np.clip((speed - v_lo) / max(v_hi - v_lo, 1e-9), 0.0, 1.0)
    w = (w * w * (3 - 2 * w))[..., None]
    return w * fast + (1 - w) * slow


def _rolling(x: np.ndarray, half: int, fn) -> np.ndarray:
    """``fn`` (np.mean / np.min / ...) over a centred window of 2 * half + 1 samples along axis 0."""
    T = len(x)
    pad = np.concatenate([np.repeat(x[:1], half, 0), x, np.repeat(x[-1:], half, 0)])
    return fn(np.stack([pad[i:i + T] for i in range(2 * half + 1)]), 0)


@dataclass
class Params:
    """Every number the retarget uses (stored in the clip's meta)."""
    # cleaning
    min_visibility: float = 0.5  # landmarks MediaPipe is less sure of than this are treated as missing
    max_gap_s: float = 0.25  # gaps longer than this are still bridged, but reported
    spike_k: float = 6.0  # a kink this many robust deviations out of line ...
    spike_floor_m: float = 0.04  # ... and at least this far (metres) is a spike
    length_tol: float = 0.4  # a bone seen this much longer / shorter than usual has a wrong end point (0 = off)
    filter: str = "adaptive"  # "adaptive" (zero-phase, speed-dependent cutoff) | "one_euro" | "none"
    cutoff_still_hz: float = 3.0  # adaptive: cutoff for a landmark that is not moving
    cutoff_fast_hz: float = 9.0  # adaptive: cutoff for a landmark that moves fast
    speed_lo: float = 0.05  # adaptive: below this speed (m/s) "still", above ``speed_hi`` "fast"
    speed_hi: float = 0.4
    euro_min_cutoff: float = 2.5  # one_euro: cutoff for a still landmark, Hz
    euro_beta: float = 1.5  # one_euro: extra Hz of cutoff per m/s
    euro_d_cutoff: float = 1.0
    # pose
    waist_share: float = 0.5  # how much of the trunk's lean the waist takes (the rest tilts the pelvis)
    neck_share: float = 0.4  # how much of the head's nod / tilt the neck base takes (the rest: head joint)
    shrug: float = 0.2  # collar bone lift per degree the upper arm is raised above ``shrug_from``
    shrug_from: float = 60.0
    # contacts (rig units, seconds)
    h_on: float = 0.030  # a sole lower than this above the ground ...
    v_on: float = 0.7  # ... and slower than this starts a contact
    h_off: float = 0.045  # higher than this ...
    v_off: float = 1.0  # ... or faster than this ends it
    v_settle: float = 0.3  # a foot still slowing down sharply above this speed has not quite landed yet
    min_contact_s: float = 0.06
    max_hole_s: float = 0.045
    ground_window_s: float = 1.0  # the ground under the feet is the lower envelope over this long
    use_image: bool = True  # use the image landmarks (2D track) for the provisional root
    fov_deg: float = 50.0  # assumed horizontal field of view (only matters for motion towards the camera)
    # root
    time_scale: float = 1.0  # playback speed of the video: 0.5 = half-speed slow motion (gravity is scaled)
    blend_s: float = 0.07  # contacts fade in / out over this long
    pitch_dead: float = 3.0  # a planted foot pitched less than about this is taken to be flat, degrees
    flight_xz: str = "auto"  # where a flight lands, in the ground plane.  "momentum": the centre of mass keeps
    #   the velocity the legs gave it; "image": follow the 2D track (depth from the change of size - poor);
    #   "mixed": across the picture from the image, in depth by momentum; "auto": "mixed" with a 2D track,
    #   "momentum" without
    depth_weight: float = 0.3  # how much the depth part of a foot's speed counts when contacts are first looked
    #   for (depth from one camera = the person's size in pixels x a guessed focal length: the least reliable axis)
    reach: float = 0.999  # planted legs never straighten further than this fraction of their length
    foot_ik: bool = True


# ---------------------------------------------------------------- landmarks -> rig space
_SCALE_PAIRS = [("left_hip", "left_knee"), ("right_hip", "right_knee"), ("left_knee", "left_ankle"),
                ("right_knee", "right_ankle"), ("left_shoulder", "left_elbow"), ("right_shoulder", "right_elbow"),
                ("left_elbow", "left_wrist"), ("right_elbow", "right_wrist")]


def body_scale(P: np.ndarray) -> float:
    """Rig length / observed length, from the clip medians of the limb segments and the trunk."""
    def length(X):
        seg = sum(np.linalg.norm(X[..., IDX[a], :] - X[..., IDX[b], :], axis=-1) for a, b in _SCALE_PAIRS)
        hips = 0.5 * (X[..., IDX["left_hip"], :] + X[..., IDX["right_hip"], :])
        sh = 0.5 * (X[..., IDX["left_shoulder"], :] + X[..., IDX["right_shoulder"], :])
        return seg + 2.0 * np.linalg.norm(sh - hips, axis=-1)
    obs = float(np.median(length(P)))
    return float(length(REST_LM)) / max(obs, 1e-9)


_RIGID = [("left_shoulder", "left_elbow"), ("left_elbow", "left_wrist"), ("left_hip", "left_knee"), ("left_knee", "left_ankle"),
          ("left_ankle", "left_heel"), ("left_heel", "left_foot_index"), ("left_ankle", "left_foot_index"),
          ("left_hip", "right_hip"), ("left_shoulder", "right_shoulder")]
_RIGID += [(a.replace("left", "right"), b.replace("left", "right")) for a, b in _RIGID[:7]]


def length_outliers(X: np.ndarray, ok: np.ndarray, tol: float = 0.4) -> np.ndarray:
    """Landmarks that break the skeleton: bones do not change length, so when the distance between two
    landmarks of one bone is more than ``tol`` off its usual value, one of the two is wrong - the one that
    jumped (larger kink against its neighbours in time).  Returns the mask (T, 33) of landmarks to drop."""
    T = len(X)
    bad = np.zeros(ok.shape, bool)
    kink = np.zeros(ok.shape)
    if T >= 3:
        with np.errstate(invalid="ignore"):
            kink[1:-1] = np.nan_to_num(np.linalg.norm(X[1:-1] - 0.5 * (X[:-2] + X[2:]), axis=-1))
            kink[0], kink[-1] = np.nan_to_num(np.linalg.norm(X[0] - X[1], axis=-1)), np.nan_to_num(np.linalg.norm(X[-1] - X[-2], axis=-1))
    for a, b in _RIGID:
        i, j = IDX[a], IDX[b]
        both = ok[:, i] & ok[:, j]
        if both.sum() < 5:
            continue
        d = np.linalg.norm(X[:, i] - X[:, j], axis=-1)
        med = float(np.median(d[both]))
        off = both & (np.abs(d / max(med, 1e-9) - 1.0) > tol)
        worse_i = kink[:, i] >= kink[:, j]
        bad[:, i] |= off & worse_i
        bad[:, j] |= off & ~worse_i
    return bad


def clean(world: np.ndarray, visibility: Optional[np.ndarray], fps: float, par: Params) -> Tuple[np.ndarray, dict]:
    """(T, 33, 3) raw landmark tracks -> cleaned tracks + a report of what was done."""
    X = np.asarray(world, np.float64).copy()
    T = len(X)
    ok = np.isfinite(X).all(-1)
    if visibility is not None:
        ok &= np.asarray(visibility) >= par.min_visibility
    X[~ok] = np.nan
    Xs, spikes = despike(X, k=par.spike_k, floor=par.spike_floor_m)
    spikes = spikes.any(-1, keepdims=True) & ok[..., None]  # one bad coordinate: the whole point is replaced
    mid = np.full_like(X, np.nan)
    mid[1:-1] = 0.5 * (X[:-2] + X[2:])
    X = np.where(spikes & np.isfinite(mid), mid, X)
    broken = length_outliers(X, ok, par.length_tol) if par.length_tol > 0 else np.zeros(ok.shape, bool)
    ok &= ~broken
    X[~ok] = np.nan
    longest = np.zeros(X.shape[1], int)
    for j in range(X.shape[1]):
        run = 0
        for i in range(T):
            run = 0 if ok[i, j] else run + 1
            longest[j] = max(longest[j], run)
    X = fill_gaps_skeleton(X, ok)
    if par.filter == "adaptive":
        X = adaptive_lowpass(X, fps, par.cutoff_still_hz, par.cutoff_fast_hz, par.speed_lo, par.speed_hi)
    elif par.filter == "one_euro":
        X = one_euro(X, fps, par.euro_min_cutoff, par.euro_beta, par.euro_d_cutoff)
    max_gap = int(round(par.max_gap_s * fps))
    report = dict(missing_ratio={LM[j]: round(float(1 - ok[:, j].mean()), 4) for j in range(X.shape[1]) if not ok[:, j].all()},
                  long_gaps={LM[j]: int(longest[j]) for j in range(X.shape[1]) if longest[j] > max_gap},
                  spikes_removed=int(spikes.any(-1).sum()), bone_length_outliers=int(broken.sum()), never_seen=[LM[j] for j in range(X.shape[1]) if not ok[:, j].any()])
    return X, report


def axes_check(P: np.ndarray) -> dict:
    """Does the body look like a body in rig axes?  With the right conversion the face is in FRONT of the
    ears as seen from the pelvis (hip line x spine = forward) and the knees bend forward.  A mirrored or
    flipped conversion drives both numbers towards 0."""
    g = lambda n: P[:, IDX[n]]  # noqa: E731
    hips, sh = 0.5 * (g("left_hip") + g("right_hip")), 0.5 * (g("left_shoulder") + g("right_shoulder"))
    fwd = np.cross(g("left_hip") - g("right_hip"), sh - hips)
    face = g("nose") - 0.5 * (g("left_ear") + g("right_ear"))
    out = dict(face_in_front=float(np.mean(np.sum(fwd * face, -1) > 0)))
    bends = []
    for side in ("left", "right"):
        th, shn = g(side + "_knee") - g(side + "_hip"), g(side + "_ankle") - g(side + "_knee")
        knee_out = np.cross(np.cross(th, shn), th)  # the way the shin leaves the thigh's line
        bent = np.linalg.norm(np.cross(th, shn), axis=-1) > 0.25 * np.linalg.norm(th, axis=-1) * np.linalg.norm(shn, axis=-1)
        if bent.any():
            bends.append(float(np.mean(np.sum(knee_out[bent] * fwd[bent], -1) < 0)))
    out["knees_bend_forward"] = float(np.mean(bends)) if bends else None
    out["head_above_hips"] = float(np.mean((g("nose") - hips)[:, 1] > 0))
    return out


# ---------------------------------------------------------------- one pose
@dataclass
class Calib:
    """What is measured once per clip."""
    F_head: np.ndarray
    F_foot: Dict[int, np.ndarray]
    la: float  # hip centre -> waist joint
    lb: float  # waist joint -> shoulder centre
    hand: Dict[int, np.ndarray]  # takes the wrist -> knuckles direction of the rest pose onto the forearm's line


def _head_frame(P) -> np.ndarray:
    x = P[IDX["left_ear"]] - P[IDX["right_ear"]]
    fwd = P[IDX["nose"]] - 0.5 * (P[IDX["left_ear"]] + P[IDX["right_ear"]])
    x = unit(x, EX)
    z = unit(perp(fwd, x), perp(EZ, x))
    return np.stack([x, np.cross(z, x), z], 1)


def _foot_frame(P, side: str) -> np.ndarray:
    """[sideways, up, forward] of a foot: forward is heel -> toe tip (the longest line in the foot, so the
    steadiest); the ankle, above that line, says which way is up."""
    heel = P[IDX[side + "_heel"]]
    z = unit(P[IDX[side + "_foot_index"]] - heel, EZ)
    y = unit(perp(P[IDX[side + "_ankle"]] - heel, z), perp(EY, z))
    return np.stack([np.cross(y, z), y, z], 1)


def _toe_flat_table(s: int) -> Tuple[np.ndarray, np.ndarray]:
    """While the heel is up and the toes lie flat on the ground, the line heel -> toe tip is less steep
    than the foot itself (the toes do not tilt).  (seen angle, foot pitch) pairs to undo that, from the
    soldier's own foot: the foot turns about the toe hinge, the tip stays where it is."""
    side = "left" if s > 0 else "right"
    heel, tip, hinge = REST_LM[IDX[side + "_heel"]], REST_LM[IDX[side + "_foot_index"]], rig.TOE[s]
    pitch = np.linspace(0.0, 89.0, 90)
    seen = []
    for pdeg in pitch:
        h = hinge + rot_x(pdeg) @ (heel - hinge)
        d = tip - h
        seen.append(math.degrees(math.atan2(-d[1], d[2])))
    return np.array(seen), pitch


TOE_FLAT = {s: _toe_flat_table(s) for _, s, _ in SIDE_KEYS}


def planted_pitch(seen, s: int):
    """Pitch of a planted foot from the pitch of its heel -> toe line (degrees, + = heel up)."""
    seen = np.asarray(seen, float)
    return np.where(seen > 0, np.interp(seen, *TOE_FLAT[s]), seen)


def calibrate() -> Calib:
    hips = 0.5 * (REST_LM[IDX["left_hip"]] + REST_LM[IDX["right_hip"]])
    sh = 0.5 * (REST_LM[IDX["left_shoulder"]] + REST_LM[IDX["right_shoulder"]])
    hand = {}
    for name, s, side in SIDE_KEYS:
        v = 0.5 * (REST_LM[IDX[side + "_index"]] + REST_LM[IDX[side + "_pinky"]]) - REST_LM[IDX[side + "_wrist"]]
        hand[s] = shortest_arc(unit(FRAME["forearm" + name].T @ v), -EY)
    return Calib(_head_frame(REST_LM), {s: _foot_frame(REST_LM, side) for _, s, side in SIDE_KEYS},
                 float(np.linalg.norm(rig.WAIST - hips)), float(np.linalg.norm(sh - rig.WAIST)), hand)


def solve_pose(P: np.ndarray, cal: Calib, par: Params, hand_conf: Optional[Dict[int, float]] = None
               ) -> Tuple[Dict[str, np.ndarray], Dict[str, float]]:
    """One frame: (33, 3) landmarks in rig axes -> ({bone: local rotation}, {bone: degrees clamped}).
    Only directions between landmarks are used, so origin and scale of ``P`` do not matter."""
    g = lambda n: P[IDX[n]]  # noqa: E731
    rots: Dict[str, np.ndarray] = {}
    excess: Dict[str, float] = {}

    def place(bone: str, A_parent: np.ndarray, A_target: np.ndarray) -> np.ndarray:
        """Give ``bone`` the anatomical world frame A_target as far as its limits allow; return what it got."""
        Fp, Fb = FRAME[rig.PARENT[bone]], FRAME[bone]
        R, ex = limit_rot(bone, Fp @ A_parent.T @ A_target @ Fb.T)
        rots[bone] = R
        if ex > 1e-6:
            excess[bone] = ex
        return A_parent @ Fp.T @ R @ Fb

    # ---- trunk: pelvis from the hip line, chest from the shoulder line; the lean of the spine is shared
    hips = 0.5 * (g("left_hip") + g("right_hip"))
    sh = 0.5 * (g("left_shoulder") + g("right_shoulder"))
    spine = unit(sh - hips)
    xp = unit(g("left_hip") - g("right_hip"), EX)
    sp = unit(perp(spine, xp), perp(EY, xp))
    up0 = perp(EY, xp)
    if np.linalg.norm(up0) < 0.2:  # hip line nearly vertical (lying on a side): no "lean" to speak of
        y_p = sp
    else:
        up0 = unit(up0)
        lean = math.degrees(math.atan2(float(np.cross(up0, sp) @ xp), float(up0 @ sp)))  # + = forward
        (p_lo, p_hi) = rig.limits("chest")[0]
        waist = min(max(par.waist_share * lean, p_lo), p_hi)
        tilt = lean - math.degrees(math.atan2(cal.lb * math.sin(math.radians(waist)),
                                               cal.la + cal.lb * math.cos(math.radians(waist))))
        y_p = rig.rot_axis(xp, tilt) @ up0
    A_pelvis = np.stack([xp, y_p, np.cross(xp, y_p)], 1)
    rots["pelvis"] = A_pelvis
    # the waist joint sits ``la`` up the pelvis; the shoulder centre is ``lb`` from it, on the observed spine line
    c = float(y_p @ spine)
    L = cal.la * c + math.sqrt(max(cal.lb ** 2 - cal.la ** 2 * (1 - c * c), 0.0))
    A_chest = place("chest", A_pelvis, frame_xy(g("left_shoulder") - g("right_shoulder"), L * spine - cal.la * y_p))

    # ---- head: its whole orientation from ears and nose; the neck base takes a share of nod and tilt
    A_head_t = _head_frame(P) @ cal.F_head.T
    p, y, r = rig.euler_angles(A_chest.T @ A_head_t)
    A_neck = place("neck", A_chest, A_chest @ rig.euler(par.neck_share * p, 0.0, par.neck_share * r))
    place("head", A_neck, A_head_t)

    # ---- arms
    for name, s, side in SIDE_KEYS:
        d_u = unit(g(side + "_elbow") - g(side + "_shoulder"))
        d_f = unit(g(side + "_wrist") - g(side + "_elbow"))
        # collar bone: not observable from these landmarks; it lifts with the arm (shoulder rhythm)
        raised = math.degrees(math.acos(float(np.clip(-(A_chest.T @ d_u)[1], -1, 1))))
        (r_lo, r_hi) = rig.limits("clav" + name)[2]
        lift = min(max(s * par.shrug * max(raised - par.shrug_from, 0.0), r_lo), r_hi)
        A_clav = place("clav" + name, A_chest, A_chest @ rig.euler(roll=lift))
        # upper arm: its direction, twisted so that the elbow's hinge is across the plane the arm bends in;
        # a straight arm has no such plane - then the twist of a plain swing from the rest pose
        bend = float(np.linalg.norm(np.cross(d_u, d_f)))
        w = smoothstep((bend - 0.10) / 0.25)
        x_swing = A_clav @ shortest_arc(-EY, A_clav.T @ d_u) @ EX
        hinge = np.cross(-d_u, unit(perp(d_f, d_u), EZ)) if bend > 1e-6 else x_swing
        A_upper = place("upperarm" + name, A_clav, frame_yx(-d_u, mix_dirs(hinge, w, x_swing)))
        A_fore = place("forearm" + name, A_upper, frame_yx(-d_f, mix_dirs(hinge, w, A_upper @ EX)))
        # hand: direction only (the rig's wrist has no twist)
        conf = 1.0 if hand_conf is None else hand_conf.get(s, 1.0)
        v = cal.hand[s] @ A_fore.T @ unit(0.5 * (g(side + "_index") + g(side + "_pinky")) - g(side + "_wrist"), -(A_fore @ EY))
        hp = -math.degrees(math.asin(float(np.clip(v[2], -1, 1))))
        hr = math.degrees(math.atan2(v[0], -v[1]))
        place("hand" + name, A_fore, A_fore @ rig.euler(pitch=conf * hp, roll=conf * hr))

    # ---- legs
    for name, s, side in SIDE_KEYS:
        d_t = unit(g(side + "_knee") - g(side + "_hip"))
        d_s = unit(g(side + "_ankle") - g(side + "_knee"))
        toes = unit(g(side + "_foot_index") - g(side + "_heel"), A_pelvis @ EZ)
        bend = float(np.linalg.norm(np.cross(d_t, d_s)))
        w = smoothstep((bend - 0.08) / 0.22)
        # straight knee: the foot shows which way the leg is turned; failing that a plain swing
        x_swing = A_pelvis @ shortest_arc(-EY, A_pelvis.T @ d_t) @ EX
        across = perp(toes, d_s)
        wf = smoothstep((float(np.linalg.norm(across)) - 0.25) / 0.35)
        x_straight = mix_dirs(np.cross(-d_s, unit(across, EZ)), wf, x_swing)
        hinge = np.cross(d_t, unit(perp(d_s, d_t), -EZ)) if bend > 1e-6 else x_straight
        A_thigh = place("thigh" + name, A_pelvis, frame_yx(-d_t, mix_dirs(hinge, w, x_straight)))
        A_shin = place("shin" + name, A_thigh, frame_yx(-d_s, mix_dirs(hinge, w, A_thigh @ EX)))
        A_foot = _foot_frame(P, side) @ cal.F_foot[s].T
        place("foot" + name, A_shin, A_foot)
        rots["toe" + name] = np.eye(3)  # set later, from the ground
    return rots, excess


# ---------------------------------------------------------------- the legs over time
class LegTracks:
    """What the root solve needs of every frame, with the root at the origin (index 0 = left, 1 = right)."""

    def __init__(self, frames: List[Dict[str, np.ndarray]]):
        T = len(frames)
        self.T = T
        z = lambda *shape: np.zeros((T, 2) + shape)  # noqa: E731
        self.hip, self.knee, self.ankle, self.tip, self.heel = z(3), z(3), z(3), z(3), z(3)
        self.W_foot, self.heading, self.pitch = z(3, 3), z(), z()
        self.com = np.zeros((T, 3))
        self.W_pelvis = np.zeros((T, 3, 3))
        for t, rots in enumerate(frames):
            M = fk(rots)
            self.com[t] = center_of_mass(M)
            self.W_pelvis[t] = M[SKEL.index["pelvis"]][:, :3]
            for k, (name, s, _) in enumerate(SIDE_KEYS):
                self.hip[t, k] = at(M, "thigh" + name, rig.HIP[s])
                self.knee[t, k] = at(M, "shin" + name, rig.KNEE[s])
                self.ankle[t, k] = at(M, "foot" + name, rig.ANKLE[s])
                # the sole under the toe tip, carried by the FOOT bone: the foot's forward axis is the
                # observed heel -> toe line, so this is where the toe tip was seen (bent toes or not)
                self.tip[t, k] = at(M, "foot" + name, [rig.TOE_TIP[s][0], GROUND, rig.TOE_TIP[s][2]])
                self.heel[t, k] = at(M, "foot" + name, rig.HEEL[s])
                W = M[SKEL.index["foot" + name]][:, :3]
                self.W_foot[t, k] = W
                self.heading[t, k], self.pitch[t, k] = heading_pitch(W)
        self.low = np.minimum(self.tip[..., 1], self.heel[..., 1])  # lowest point of each sole (y)


def _ball_ground(s: int) -> np.ndarray:
    """Rest position of the point of the sole under the toe hinge (the ball of the foot)."""
    return np.array([rig.TOE[s][0], GROUND, rig.TOE[s][2]])


def footprint_ankle(G_xz, heading: float, pitch: float, s: int) -> Tuple[np.ndarray, np.ndarray]:
    """A planted foot: ball of the foot on the ground at ``G_xz``, toes pointing along ``heading``, pitched
    ``pitch`` degrees - about the toe hinge when the heel is up (+), about the heel when the toes are up (-),
    exactly as the walk loop plants its feet.  Returns (ankle position, foot rotation), world."""
    Ry = rot_y(heading)
    pivot = rig.TOE[s] if pitch >= 0 else rig.HEEL[s]
    G = np.array([G_xz[0], GROUND, G_xz[1]])
    W = Ry @ rot_x(pitch)
    return G + Ry @ (pivot - _ball_ground(s)) + W @ (rig.ANKLE[s] - pivot), W


def flatten_pitch(pitch, dead: float):
    """A planted foot's pitch with the small values squeezed to 0 (a standing foot is flat, not +-2 deg)."""
    pitch = np.asarray(pitch, float)
    if dead <= 0:
        return pitch
    return pitch * (1.0 - np.exp(-(pitch / dead) ** 2))


def circular_mean(deg) -> float:
    a = np.radians(np.asarray(deg, float))
    return math.degrees(math.atan2(np.sin(a).mean(), np.cos(a).mean()))


def image_root(Pw: np.ndarray, image: np.ndarray, size, fps: float, par: Params,
               weight: Optional[np.ndarray] = None) -> Tuple[np.ndarray, np.ndarray]:
    """Provisional root path from the 2D track.  The world landmarks (rig axes, rig units, hip-centred) are
    fitted to the image landmarks of the same frame by a scale and a shift: the scale is pixels per unit at
    the person's distance, the shift is where the hip centre is in the picture.  With a pinhole camera
    that is the person's position: x = (u - cx) / scale, y = -(v - cy) / scale, z = -focal / scale.
    Returns (root (T, 3) in rig axes up to a constant, scale (T,))."""
    Wd, Ht = float(size[0]), float(size[1])
    uv = np.asarray(image, np.float64)[..., :2] * np.array([Wd, Ht])
    uv = uv * np.array([1.0, -1.0])  # image y runs down
    X = Pw[..., :2]
    w = np.ones(uv.shape[:2]) if weight is None else np.asarray(weight, float) + 1e-6
    w = w / w.sum(1, keepdims=True)
    um, Xm = np.einsum("tj,tjk->tk", w, uv), np.einsum("tj,tjk->tk", w, X)
    du, dX = uv - um[:, None], X - Xm[:, None]
    scale = np.einsum("tj,tjk,tjk->t", w, du, dX) / np.maximum(np.einsum("tj,tjk,tjk->t", w, dX, dX), 1e-12)
    scale = np.maximum(scale, 1e-6)
    scale_s = lowpass(scale, fps, 1.0)  # distance changes slowly: steady it hard
    origin = um - scale[:, None] * Xm  # where the hip centre (world origin) is in the picture
    focal = 0.5 * Wd / math.tan(math.radians(par.fov_deg) / 2.0)
    root = np.stack([(origin[:, 0] - 0.5 * Wd) / scale_s, (origin[:, 1] + 0.5 * Ht) / scale_s, -focal / scale_s], 1)
    return lowpass(root, fps, 6.0), scale_s


def lowest_foot_root(K: LegTracks) -> np.ndarray:
    """Provisional root path without a 2D track: whichever sole is lowest is taken to stand still on the
    ground.  (Cannot see a jump: with both feet in the air the body stays glued to the lower one.)"""
    T = K.T
    root = np.zeros((T, 3))
    root[:, 1] = GROUND - K.low.min(1)
    for t in range(1, T):
        k = int(np.argmin(0.5 * (K.low[t] + K.low[t - 1])))
        root[t, [0, 2]] = root[t - 1, [0, 2]] - (K.tip[t, k, [0, 2]] - K.tip[t - 1, k, [0, 2]])
    return root


def detect_contact(height: np.ndarray, speed: np.ndarray, fps: float, par: Params,
                   speed_before: Optional[np.ndarray] = None) -> np.ndarray:
    """One foot: planted (True) per frame from its height above the ground and its speed, with hysteresis
    (stricter to start a contact than to keep it), short flickers removed and short holes closed.

    ``speed`` is used to START a contact and should look ahead (how far the foot moves from this frame
    to the next: a foot planted from now on does not move); ``speed_before`` is used to KEEP it and
    should look back (a foot planted up to now has not moved).  That way neither edge is blurred."""
    T = len(height)
    keep = speed if speed_before is None else speed_before
    c = np.zeros(T, bool)
    on = False
    for t in range(T):
        if on:
            on = height[t] < par.h_off and keep[t] < par.v_off
        else:
            on = height[t] < par.h_on and speed[t] < par.v_on
            if on and t + 1 < T and speed[t] > par.v_settle and speed[t + 1] < 0.5 * speed[t] and height[t + 1] < par.h_on:
                on = False  # still arriving: pin it on the next frame, where it has stopped
        c[t] = on
    hole, short = int(round(par.max_hole_s * fps)), max(int(round(par.min_contact_s * fps)), 1)
    for value, limit in ((False, hole), (True, short - 1)):  # close holes first, then drop flickers
        t = 0
        while t < T:
            if c[t] == value:
                e = t
                while e < T and c[e] == value:
                    e += 1
                inner = t > 0 and e < T
                if e - t <= limit and (inner or value):
                    c[t:e] = not value
                t = e
            else:
                t += 1
    return c


def intervals(c: np.ndarray) -> List[Tuple[int, int]]:
    """[(first, last)] of every run of True."""
    out, t, T = [], 0, len(c)
    while t < T:
        if c[t]:
            e = t
            while e + 1 < T and c[e + 1]:
                e += 1
            out.append((t, e))
            t = e + 1
        else:
            t += 1
    return out


def find_contacts(K: LegTracks, prov: np.ndarray, fps: float, par: Params, depth_weight: float = 1.0
                  ) -> Tuple[np.ndarray, dict]:
    """(T, 2) planted flags from the provisional root path.  ``depth_weight`` scales the part of a foot's
    speed that is along the camera's line of sight (z), the part a single camera sees worst."""
    T = K.T
    low = prov[:, None, 1] + K.low  # world height of each sole's lowest point
    half = max(int(round(0.5 * par.ground_window_s * fps)), 1)
    ground = _rolling(_rolling(low.min(1), half, np.min), max(half // 2, 1), np.mean)  # lower envelope
    height = low - ground[:, None]
    ball = prov[:, None] + K.tip  # (toe tip: it stays put from flat foot to toe-off)
    n = max(int(round(fps / 30.0)), 1)  # compare positions about 1/30 s apart, whatever the frame rate
    step = np.linalg.norm((ball[n:] - ball[:-n]) * np.array([1.0, 1.0, depth_weight]), axis=-1) * fps / n if T > n else np.zeros((0, 2))
    ahead = np.concatenate([step, np.repeat(step[-1:], n, 0)]) if len(step) else np.zeros((T, 2))
    behind = np.concatenate([np.repeat(step[:1], n, 0), step]) if len(step) else np.zeros((T, 2))
    # jittery landmarks: a planted foot then "moves" and "hovers" too.  The thresholds rise with the
    # jitter seen where a foot is surely down (the lower, slower foot of each frame)
    par = replace(par)
    low_k = np.argmin(height, 1)
    v_still = float(np.median(np.minimum(ahead, behind)[np.arange(T), low_k])) if T > 4 else 0.0
    h_still = float(np.median(height.min(1))) if T > 4 else 0.0
    par.v_on, par.v_off = max(par.v_on, 3.0 * v_still), max(par.v_off, 4.5 * v_still)
    par.h_on, par.h_off = max(par.h_on, 2.5 * h_still), max(par.h_off, 3.75 * h_still)
    contact = np.stack([detect_contact(height[:, k], ahead[:, k], fps, par, behind[:, k]) for k in (0, 1)], 1)
    return contact, dict(height=height, speed_ahead=ahead, speed_behind=behind, ground=ground,
                         thresholds=dict(h_on=round(par.h_on, 4), h_off=round(par.h_off, 4), v_on=round(par.v_on, 3),
                                         v_off=round(par.v_off, 3), still_speed=round(v_still, 3), still_height=round(h_still, 4)))


def depth_scale(root: np.ndarray, prov: np.ndarray, grounded: np.ndarray) -> Optional[float]:
    """How much the depth (z) of the 2D-tracked path has to be stretched to agree with the path the planted
    legs give: the image knows depth only through the person's size in pixels, times a focal length that
    was guessed.  Uses frame-to-frame steps while planted.  None = not enough motion in depth to tell."""
    both = grounded[1:] & grounded[:-1]
    a, b = np.diff(prov[:, 2])[both], np.diff(root[:, 2])[both]
    if len(a) < 6 or float(np.abs(a).sum()) < 0.25 or float(a @ a) < 1e-6:
        return None
    k = float(a @ b) / float(a @ a)
    r = float(a @ b) / max(math.sqrt(float(a @ a) * float(b @ b)), 1e-12)
    return k if (r > 0.8 and 0.3 < k < 3.0) else None


def solve_root(K: LegTracks, contact: np.ndarray, fps: float, par: Params, prov: Optional[np.ndarray] = None,
               flight_xz: str = "momentum") -> Tuple[np.ndarray, dict]:
    """Root path (T, 3) from the contacts.  See the module docstring; details:

    * a contact's footprint (where the ball of the foot is, which way the toes point) is fixed when the
      contact starts: its heading is the mean heading of the foot over the contact, its place is where the
      foot is at that moment given the root so far;
    * with one foot planted the root is exactly "footprint minus leg"; with two, a blend whose weights
      fade over ``blend_s`` so the hand-over is smooth;
    * frames with no contact are a flight: the centre of mass keeps its horizontal velocity and follows
      y = y0 + v0 t - g t^2 / 2, with v0 chosen so that it leaves from the take-off height and arrives at
      the landing height (both known from the planted frames either side)."""
    T = K.T
    g = GRAVITY * par.time_scale ** 2
    pitch = np.stack([planted_pitch(K.pitch[:, k], SIDE_KEYS[k][1]) for k in (0, 1)], 1)
    pitch = np.clip(flatten_pitch(pitch, par.pitch_dead), -40.0, 85.0)
    ramp = max(int(round(par.blend_s * fps)), 1)
    ivs = [intervals(contact[:, k]) for k in (0, 1)]
    which = -np.ones((T, 2), int)
    u = np.zeros((T, 2))
    prints: List[List[dict]] = [[], []]
    for k in (0, 1):
        for n, (a, b) in enumerate(ivs[k]):
            which[a:b + 1, k] = n
            tt = np.arange(a, b + 1)
            u[a:b + 1, k] = np.minimum(1.0, np.minimum((tt - a + 1) / ramp, (b - tt + 1) / ramp))
            prints[k].append(dict(a=a, b=b, heading=circular_mean(K.heading[a:b + 1, k]), G=None))
    root = np.full((T, 3), np.nan)
    grounded = contact.any(1)
    last = None  # last grounded frame
    flights = []

    def edge_velocity(t0: int, step: int) -> Optional[np.ndarray]:
        """Per-frame velocity of the centre of mass AT planted frame t0, from the planted frames on one
        side of it (step -1: before, +1: after).  Needs no footprint position: with a foot planted the
        centre of mass moves exactly as "footprint - leg + offset" does, whatever the footprint is.  A
        parabola is fitted (the body is pushing off / braking, its speed is changing) and its slope taken
        at t0."""
        k = max((0, 1), key=lambda q: (contact[t0, q], u[t0, q]))
        n = which[t0, k]
        if n < 0:
            return None
        fp = prints[k][n]
        ts = [t0]
        while 0 <= ts[-1] + step < T and which[ts[-1] + step, k] == n and len(ts) < 6:
            ts.append(ts[-1] + step)
        if len(ts) < 3:
            return None
        c = np.array([footprint_ankle((0.0, 0.0), fp["heading"], pitch[j, k], SIDE_KEYS[k][1])[0] - K.ankle[j, k] + K.com[j]
                      for j in ts])
        x = np.array(ts, float) - t0
        co = np.polyfit(x, c, 2 if len(ts) >= 5 else 1)
        return co[-2]

    def com_velocity(a: int, b: Optional[int] = None) -> np.ndarray:
        """Per-frame velocity of the centre of mass during the flight from planted frame ``a`` (to planted
        frame ``b``): the mean of what the legs say just before take-off and just after landing."""
        vs = [v for v in (edge_velocity(a, -1), edge_velocity(b, 1) if b is not None else None) if v is not None]
        if not vs:
            return (prov[min(a + 1, T - 1)] - prov[a]) if prov is not None else np.zeros(3)
        return np.mean(vs, 0)

    for t in range(T):
        ks = [k for k in (0, 1) if contact[t, k]]
        if not ks:
            continue
        held = [k for k in ks if prints[k][which[t, k]]["G"] is not None]
        cands = {}
        if held:
            for k in held:
                fp = prints[k][which[t, k]]
                cands[k] = footprint_ankle(fp["G"], fp["heading"], pitch[t, k], SIDE_KEYS[k][1])[0] - K.ankle[t, k]
            wsum = sum(u[t, k] for k in held)
            root[t] = sum(u[t, k] * cands[k] for k in held) / wsum
        else:  # touching down out of a flight (or the first frame): where the body has got to by itself
            if last is None:
                xz = prov[t, [0, 2]] if prov is not None else np.zeros(2)
            else:
                v = com_velocity(last, t)
                xz = (root[last] + K.com[last] + v * (t - last) - K.com[t])[[0, 2]]
                if prov is not None and flight_xz in ("image", "mixed"):
                    seen = root[last, [0, 2]] + (prov[t, [0, 2]] - prov[last, [0, 2]])
                    xz = seen if flight_xz == "image" else np.array([seen[0], xz[1]])
            root[t, [0, 2]] = xz
        for k in ks:
            fp = prints[k][which[t, k]]
            if fp["G"] is None:  # new contact: its footprint is under the foot as it is now
                a0 = footprint_ankle((0.0, 0.0), fp["heading"], pitch[t, k], SIDE_KEYS[k][1])[0]
                fp["G"] = (root[t] + K.ankle[t, k] - a0)[[0, 2]]
        if not held:
            ys = [footprint_ankle(prints[k][which[t, k]]["G"], prints[k][which[t, k]]["heading"], pitch[t, k],
                                  SIDE_KEYS[k][1])[0][1] - K.ankle[t, k, 1] for k in ks]
            root[t, 1] = float(np.mean(ys))
        # planted legs must not be asked to stretch beyond their length
        for k in ks:
            fp = prints[k][which[t, k]]
            ankle = footprint_ankle(fp["G"], fp["heading"], pitch[t, k], SIDE_KEYS[k][1])[0]
            d = ankle - (root[t] + K.hip[t, k])
            lim = par.reach * (rig.THIGH_LEN + rig.SHIN_LEN)
            horiz2 = d[0] ** 2 + d[2] ** 2
            if d @ d > lim * lim and horiz2 < lim * lim and d[1] < 0:
                root[t, 1] -= (-d[1]) - math.sqrt(lim * lim - horiz2)
        last = t

    # flights
    t = 0
    while t < T:
        if grounded[t]:
            t += 1
            continue
        e = t
        while e + 1 < T and not grounded[e + 1]:
            e += 1
        a, b = (t - 1 if t > 0 else None), (e + 1 if e + 1 < T else None)
        idx = np.arange(t, e + 1)
        info = dict(first=int(t), last=int(e), frames=int(e - t + 1))
        if a is not None and b is not None:
            ca, cb = root[a] + K.com[a], root[b] + K.com[b]
            n = b - a
            tau = (idx - a) / fps
            Tf = n / fps
            com = ca + (cb - ca) * ((idx - a) / n)[:, None]
            v0 = (cb[1] - ca[1] + 0.5 * g * Tf * Tf) / Tf
            com[:, 1] = ca[1] + v0 * tau - 0.5 * g * tau * tau
            root[idx] = com - K.com[idx]
            info.update(seconds=round(Tf, 4), takeoff_speed=round(float(v0), 4),
                        takeoff_speed_from_legs=round(float((edge_velocity(a, -1) if edge_velocity(a, -1) is not None
                                                             else np.zeros(3))[1] * fps), 4),
                        rise=round(float(max(v0, 0.0) ** 2 / (2 * g)), 4),
                        travel=round(float(np.hypot(cb[0] - ca[0], cb[2] - ca[2])), 4))
        elif a is not None:  # the clip ends in the air
            v = com_velocity(a) * fps
            tau = (idx - a) / fps
            com = root[a] + K.com[a] + v * tau[:, None]
            com[:, 1] -= 0.5 * g * tau * tau
            root[idx] = com - K.com[idx]
            info["open"] = "end"
        elif b is not None:  # the clip starts in the air
            if prov is not None:
                root[idx] = prov[idx] + (root[b] - prov[b])
            else:
                root[idx] = root[b]
            info["open"] = "start"
        else:
            root[idx] = prov[idx] if prov is not None else 0.0
            info["open"] = "both"
        flights.append(info)
        t = e + 1
    return root, dict(prints=prints, which=which, weight=u, pitch=pitch, flights=flights, gravity=g)


def gravity_from_image(prov: np.ndarray, flight: np.ndarray, fps: float) -> List[float]:
    """Downward acceleration of the 2D-tracked root during each flight (rig units / s^2) - what gravity
    looks like in this video.  Real time gives about ``GRAVITY``; slow motion at speed k gives k^2 of it."""
    out = []
    for a, b in intervals(flight):
        if b - a + 1 >= 5:
            tt = np.arange(a, b + 1) / fps
            out.append(float(-2.0 * np.polyfit(tt, prov[a:b + 1, 1], 2)[0]))
    return out


# ---------------------------------------------------------------- planted feet: inverse kinematics
def _leg_from_ik(rots, name: str, s: int, W_pelvis, hip, ankle, knee, W_foot):
    # the knee keeps bending the way the retargeted thigh faces (its forward axis).  The knee's own
    # position would say the same for a bent leg, but nothing (only jitter) for a straight one
    D = unit(ankle - hip)
    fwd = W_pelvis @ rots["thigh" + name] @ EZ
    if np.linalg.norm(perp(fwd, D)) < 1e-3:
        fwd = knee - hip
        if np.linalg.norm(perp(fwd, D)) < 1e-4:
            fwd = W_pelvis @ EZ + 0.1 * (W_pelvis @ EY)
    W_thigh, W_shin, reach = motion.leg_ik(hip, ankle, fwd, s)
    ex = {}
    rots["thigh" + name], ex["thigh" + name] = limit_rot("thigh" + name, W_pelvis.T @ W_thigh)
    W_thigh = W_pelvis @ rots["thigh" + name]
    rots["shin" + name], ex["shin" + name] = limit_rot("shin" + name, W_thigh.T @ W_shin)
    W_shin = W_thigh @ rots["shin" + name]
    rots["foot" + name], ex["foot" + name] = limit_rot("foot" + name, W_shin.T @ W_foot)
    return reach, ex


def plant_feet(frames: List[Dict[str, np.ndarray]], root: np.ndarray, K: LegTracks, sol: dict, contact: np.ndarray,
               fps: float, par: Params) -> Tuple[np.ndarray, List[Dict[str, float]], dict]:
    """Put every planted foot on its footprint (two-bone IK), fade the correction in before and out after
    each contact, bend the toes flat while the heel is up, and keep every sole above the ground.
    Edits ``frames`` in place.  Returns (contact weight (T, 2), per-frame limit excess, statistics)."""
    T = K.T
    ramp = max(int(round(par.blend_s * fps)), 1)
    weight = np.zeros((T, 2))
    excess: List[Dict[str, float]] = [dict() for _ in range(T)]
    moved, lifted, reach_max = 0.0, 0.0, 0.0
    for k, (name, s, _) in enumerate(SIDE_KEYS):
        d_pos = np.zeros((T, 3))  # correction of the ankle position
        d_rot = np.tile(np.eye(3), (T, 1, 1))  # correction of the foot's world rotation
        for fp in sol["prints"][k]:
            a, b = fp["a"], fp["b"]
            for t in range(a, b + 1):
                ankle, W = footprint_ankle(fp["G"], fp["heading"], sol["pitch"][t, k], s)
                d_pos[t] = ankle - (root[t] + K.ankle[t, k])
                d_rot[t] = W @ K.W_foot[t, k].T
                weight[t, k] = 1.0
            for edge, step in ((a, -1), (b, 1)):  # fade out on both sides of the contact
                qe = clip_mod.mat_to_quat(d_rot[edge])
                for j in range(1, ramp + 1):
                    t = edge + step * j
                    if t < 0 or t >= T or contact[t, k]:
                        break
                    w = 1.0 - smoothstep(j / (ramp + 1.0))
                    if w > weight[t, k]:
                        weight[t, k] = w
                        d_pos[t] = w * d_pos[edge]
                        d_rot[t] = clip_mod.quat_to_mat(clip_mod.slerp(np.array([1.0, 0, 0, 0]), qe, w))
        for t in range(T):
            rots = frames[t]
            W_pelvis = K.W_pelvis[t]
            W_foot = d_rot[t] @ K.W_foot[t, k]
            ankle = root[t] + K.ankle[t, k] + d_pos[t]
            # toes: flat on the ground while the heel is up and the foot is (nearly) planted
            pitch_now = heading_pitch(W_foot)[1]
            (toe_lo, toe_hi) = rig.limits("toe" + name)[0]
            toe = -min(max(pitch_now, 0.0), -toe_lo) * weight[t, k]
            rots["toe" + name] = rig.local_rot("toe" + name, pitch=toe)
            # nothing below the ground: heel, ball, toe tip
            pts = [rig.HEEL[s], _ball_ground(s), rot_x(toe) @ (np.array([rig.TOE_TIP[s][0], GROUND, rig.TOE_TIP[s][2]]) - rig.TOE[s]) + rig.TOE[s]]
            lowest = min(float((ankle + W_foot @ (p - rig.ANKLE[s]))[1]) for p in pts)
            if lowest < GROUND:
                ankle = ankle + np.array([0.0, GROUND - lowest, 0.0])
                lifted = max(lifted, GROUND - lowest)
            shift = float(np.linalg.norm(ankle - (root[t] + K.ankle[t, k])))
            turn = float(clip_mod.geodesic_deg(W_foot, K.W_foot[t, k]))
            if not par.foot_ik or (shift < 1e-7 and turn < 1e-5):
                continue
            moved = max(moved, shift)
            reach, ex = _leg_from_ik(rots, name, s, W_pelvis, root[t] + K.hip[t, k], ankle, root[t] + K.knee[t, k], W_foot)
            reach_max = max(reach_max, reach)
            excess[t].update({b: e for b, e in ex.items() if e > 1e-6})
    return weight, excess, dict(max_ankle_correction=moved, max_lift=lifted, max_reach=reach_max)


# ---------------------------------------------------------------- the whole thing
def gait_phase(contact: np.ndarray, fps: float) -> np.ndarray:
    """A phase that advances by 1 between successive left-foot touchdowns (for the cloth's sway)."""
    T = len(contact)
    starts = [a for a, _ in intervals(contact[:, 0]) if a > 0]
    if len(starts) < 2:
        return np.arange(T) / fps  # one "cycle" per second
    period = float(np.median(np.diff(starts)))
    ph = np.interp(np.arange(T), starts, np.arange(len(starts)), left=np.nan, right=np.nan)
    first, lastk = starts[0], starts[-1]
    ph[:first] = (np.arange(first) - first) / period
    ph[lastk:] = len(starts) - 1 + (np.arange(lastk, T) - lastk) / period
    return ph


def retarget(capture: dict, par: Optional[Params] = None, log=print) -> Tuple[Clip, dict]:
    """capture: dict with ``world`` (T, 33, 3) MediaPipe world landmarks (metres), ``fps``, and optionally
    ``visibility`` (T, 33), ``image`` (T, 33, 2+) normalised image landmarks with ``size`` (width, height),
    ``cam`` (T, 2, 3) per-frame stabilising transforms, ``detected`` (T,), ``meta``.
    Returns (clip, report)."""
    par = par or Params()
    fps = float(capture["fps"])
    world = np.asarray(capture["world"], np.float64)
    T = len(world)
    vis = capture.get("visibility")
    vis = None if vis is None else np.asarray(vis, np.float64)
    detected = np.asarray(capture.get("detected", np.ones(T, bool)), bool)
    if vis is not None:
        vis = np.where(detected[:, None], vis, 0.0)
    world = np.where(detected[:, None, None], world, np.nan)
    Xc, clean_rep = clean(world, vis, fps, par)
    scale = body_scale(Xc)
    P = (Xc @ MP_TO_RIG.T) * scale  # rig axes, soldier-sized, hip-centred
    report: dict = dict(frames=T, fps=fps, undetected_frames=int((~detected).sum()), cleaning=clean_rep,
                        body_scale=round(scale, 4), axes=axes_check(P))
    cal = calibrate()

    # ---- poses
    frames, ex_pose = [], []
    for t in range(T):
        conf = None
        if vis is not None:
            conf = {s: smoothstep((min(vis[t, IDX[side + "_index"]], vis[t, IDX[side + "_pinky"]]) - 0.3) / 0.4)
                    for _, s, side in SIDE_KEYS}
        rots, ex = solve_pose(P[t], cal, par, conf)
        frames.append(rots)
        ex_pose.append(ex)

    # ---- root
    K = LegTracks(frames)
    prov, has_image = None, False
    if par.use_image and capture.get("image") is not None and capture.get("size") is not None:
        img = np.asarray(capture["image"], np.float64)[..., :2]
        size = np.asarray(capture["size"], np.float64)
        img = np.where(detected[:, None, None], img, np.nan)
        ok = np.isfinite(img).all(-1)
        for j in range(img.shape[1]):
            img[:, j] = fill_gaps(img[:, j], ok[:, j])
        if capture.get("cam") is not None:  # undo camera pan / zoom: pixels of the first frame
            cam = np.asarray(capture["cam"], np.float64)
            px = img * size
            px = np.einsum("tij,tnj->tni", cam[:, :, :2], px) + cam[:, None, :, 2]
            img = px / size
        if par.filter != "none":
            img = lowpass(img, fps, par.cutoff_fast_hz)
        prov, px_per_unit = image_root(P, img, size, fps, par, weight=vis)
        has_image = True
        report["image"] = dict(pixels_per_unit=[round(float(px_per_unit.min()), 2), round(float(px_per_unit.max()), 2)])
    if prov is None:
        prov = lowest_foot_root(K)
    mode = par.flight_xz
    if not has_image:
        contact, cinfo = find_contacts(K, prov, fps, par)
        mode = "momentum"
    else:
        # depth counts little at first.  The planted phases found that way then tell how much the image's
        # depth has to be stretched (the focal length was a guess); with that the contacts are found again,
        # depth counting fully.  Where a flight lands is still not taken from the image's depth.
        contact, cinfo = find_contacts(K, prov, fps, par, par.depth_weight)
        root0, _ = solve_root(K, contact, fps, par, prov, "momentum")
        k = depth_scale(root0, prov, contact.any(1))
        report["image"]["depth_scale"] = None if k is None else round(k, 3)
        if k is not None:
            prov = prov.copy()
            prov[:, 2] *= k
            contact, cinfo = find_contacts(K, prov, fps, par, 1.0)
        if mode == "auto":
            mode = "mixed"
    root, sol = solve_root(K, contact, fps, par, prov if has_image else None, mode)
    flight = ~contact.any(1)
    report["root"] = dict(source="image track + contacts" if has_image else "contacts only (no 2D track: jumps cannot be seen)",
                          flight_xz=mode, contact_thresholds=cinfo["thresholds"],
                          contacts={n: len(sol["prints"][k]) for k, (n, _, _) in enumerate(SIDE_KEYS)},
                          flights=sol["flights"], gravity=round(sol["gravity"], 4), time_scale=par.time_scale)
    if has_image:
        gs = gravity_from_image(prov, flight, fps)
        if gs:
            gm = float(np.median(gs))
            report["root"]["gravity_seen_in_image"] = dict(per_flight=[round(v, 3) for v in gs], median=round(gm, 3),
                                                           implied_time_scale=round(math.sqrt(max(gm, 1e-6) / GRAVITY), 3))
    # ---- planted feet
    weight, ex_ik, ik_stats = plant_feet(frames, root, K, sol, contact, fps, par)
    report["foot_ik"] = {k: round(float(v), 5) for k, v in ik_stats.items()}

    # ---- limits report
    limits: Dict[str, dict] = {}
    for bone in rig.GEOMETRY_BONES:
        e = np.array([max(ex_pose[t].get(bone, 0.0), ex_ik[t].get(bone, 0.0)) for t in range(T)])
        if (e > 0.01).any():
            limits[bone] = dict(max_deg=round(float(e.max()), 2), mean_deg=round(float(e.mean()), 3),
                                mean_when_clamped_deg=round(float(e[e > 0.01].mean()), 2),
                                frames_ratio=round(float((e > 0.01).mean()), 4))
    report["limits"] = limits

    # ---- costume helpers
    phase = gait_phase(contact, fps)
    speed = np.linalg.norm(np.gradient(root[:, [0, 2]], axis=0), axis=1) * fps if T > 1 else np.zeros(T)
    walk = np.clip(speed / (motion.STRIDE / 1.0), 0.0, 1.0) * np.clip(weight.max(1), 0.0, 1.0)
    walk = _rolling(walk, max(int(round(0.15 * fps)), 1), np.mean)
    drv = np.zeros((T, 4))
    state: dict = {}
    for t in range(T):
        drv[t, :2] = phase[t] % 1.0, walk[t]
        clip_mod.drive(frames[t], float(drv[t, 0]), float(drv[t, 1]), state=state, dt=1.0 / fps)
    meta = dict(version=VERSION, params=asdict(par), source=capture.get("meta", {}), limits=limits,
                helpers=list(rig.HELPER_BONES), skeleton=[b.name for b in SKEL.bones])
    c = Clip.from_rots(fps, frames, root, contact=weight, flight=flight, drive=drv, meta=meta)
    report["slip"] = foot_slip(c)
    return c, report


# ---------------------------------------------------------------- measuring a clip
def foot_slip(c: Clip, planted: float = 0.999) -> dict:
    """How honest the feet are (world units): ``slide`` = how far the supporting point of a planted foot
    (heel while the toes are up, ball of the foot otherwise) moves along the ground between two frames
    and over a whole contact; ``float`` = how far that point is off the ground; ``sink`` = how far any
    sole point of any frame is below the ground (0 = never)."""
    T = len(c)
    out = dict(slide_step_max=0.0, slide_contact_max=0.0, float_max=0.0, sink_max=0.0, planted_frames=0)
    pts = np.zeros((T, 2, 3, 3))  # heel, ball, toe tip
    pitch = np.zeros((T, 2))
    for t in range(T):
        M = fk(c.body_rots(t), c.root[t])
        for k, (name, s, _) in enumerate(SIDE_KEYS):
            pts[t, k, 0] = at(M, "foot" + name, rig.HEEL[s])
            pts[t, k, 1] = at(M, "toe" + name, _ball_ground(s))  # on the toe bone: it lies flat while the heel is up
            pts[t, k, 2] = at(M, "toe" + name, [rig.TOE_TIP[s][0], GROUND, rig.TOE_TIP[s][2]])
            pitch[t, k] = heading_pitch(M[SKEL.index["foot" + name]][:, :3])[1]
    out["sink_max"] = float(max(GROUND - pts[..., 1].min(), 0.0))
    for k in (0, 1):
        for a, b in intervals(c.contact[:, k] >= planted):
            out["planted_frames"] += b - a + 1
            travelled = 0.0
            for t in range(a, b + 1):
                p = 0 if pitch[t, k] < -1e-3 else 1
                out["float_max"] = max(out["float_max"], abs(float(pts[t, k, p, 1] - GROUND)))
                if t < b:
                    step = float(np.linalg.norm((pts[t + 1, k, p] - pts[t, k, p])[[0, 2]]))
                    out["slide_step_max"] = max(out["slide_step_max"], step)
                    travelled += step
            out["slide_contact_max"] = max(out["slide_contact_max"], travelled)
    return {k: (round(v, 6) if isinstance(v, float) else v) for k, v in out.items()}


def bone_directions(rots: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
    """World direction of every body bone (head -> tail) under a pose."""
    M = fk(rots)
    out = {}
    for b in rig.GEOMETRY_BONES:
        bone = SKEL.bones[SKEL.index[b]]
        out[b] = M[SKEL.index[b]][:, :3] @ unit(np.asarray(bone.tail, float) - np.asarray(bone.head, float))
    return out


def compare(est: Clip, truth: Clip) -> dict:
    """Round-trip errors of a retargeted clip against the clip its landmarks were made from.

    per bone: ``local`` = angle between the two local rotations (degrees; includes twist and how a bend is
    shared between neighbouring joints, which 33 points cannot always tell), ``direction`` = angle
    between the two world directions of the bone (what the eye sees).  Root: after removing the constant
    ground-plane offset (a clip has no absolute position)."""
    T = min(len(est), len(truth))
    bones = [b for b in rig.GEOMETRY_BONES if b in est.bones and b in truth.bones]
    loc = {b: np.zeros(T) for b in bones}
    dire = {b: np.zeros(T) for b in bones}
    for t in range(T):
        ra, rb = est.body_rots(t), truth.body_rots(t)
        da, db = bone_directions(ra), bone_directions(rb)
        for b in bones:
            loc[b][t] = float(clip_mod.geodesic_deg(ra[b], rb[b]))
            dire[b][t] = math.degrees(math.acos(float(np.clip(da[b] @ db[b], -1, 1))))
    d = est.root[:T].astype(np.float64) - truth.root[:T].astype(np.float64)
    d[:, [0, 2]] -= d[:, [0, 2]].mean(0)
    stat = lambda v: dict(mean=round(float(np.mean(v)), 3), max=round(float(np.max(v)), 3))  # noqa: E731
    agree = float(np.mean((est.contact[:T] >= 0.5) == (truth.contact[:T] >= 0.5)))
    return dict(frames=T, bones={b: dict(local=stat(loc[b]), direction=stat(dire[b])) for b in bones},
                local_mean=round(float(np.mean([loc[b].mean() for b in bones])), 3),
                direction_mean=round(float(np.mean([dire[b].mean() for b in bones])), 3),
                direction_max=round(float(np.max([dire[b].max() for b in bones])), 3),
                root=dict(rms=[round(float(v), 5) for v in np.sqrt((d ** 2).mean(0))],
                          max=[round(float(v), 5) for v in np.abs(d).max(0)]),
                contact_agreement=round(agree, 4), flight_agreement=round(float(np.mean(est.flight[:T] == truth.flight[:T])), 4))


def cycle_bounds(c: Clip) -> List[int]:
    """Frames at which the left foot touches down - natural places to cut a loop."""
    return [a for a, _ in intervals(c.contact[:, 0] >= 0.999) if a > 0]

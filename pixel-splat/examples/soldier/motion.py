"""Soldier motion: walk loop, turntable demo, standing pose, and the drive of the costume helper bones.

Every ``*_rots`` function returns ``(rots, root)``: a dict of local 3x3 rotations per bone (what
``Skeleton.world_mats`` takes) and the root offset.  ``*_pose`` returns ``(mats, root)`` like the Nike
example's ``walk_pose``, ready for ``pose_splats``.

Walk loop - what keeps the feet honest:
  * the foot path is written in WORLD space: a planted foot is a fixed point (heel first, then the
    whole sole, then the toe hinge) and its heading never changes - the pelvis may turn above it;
  * the swinging foot eases in and out, so it lifts off and lands with zero world speed;
  * two-bone IK puts the knee; the pelvis height is DERIVED from the feet (the highest it can be with
    both legs still a little bent), so the legs never run out of length - the one thing that could
    drag a planted foot - and the up/down bob of the walk falls out by itself.
Pass ``advance = STRIDE * phase`` to really travel; ``advance = 0`` walks on the spot (treadmill).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import rig  # noqa: E402
from pixelsplat.skin import Skeleton, rot_x  # noqa: E402

TAU = 2 * math.pi
H = rig.H

# ---------------------------------------------------------------- walk parameters
STRIDE = 0.64 * H  # distance one foot travels per cycle (two steps)
STANCE = 0.62  # fraction of the cycle a foot is on the ground
SPEED = STRIDE  # world units per cycle (the name the Nike example uses)
HEEL_ROCK = 0.16  # part of the stance spent rolling from the heel onto the sole
HEEL_OFF = 0.40  # part of the stance after which the heel lifts
PITCH_STRIKE = -14.0  # foot pitch at heel strike (toes up), degrees
PITCH_OFF = 38.0  # foot pitch at toe-off (heel up)
SWING_LIFT = 0.038 * H  # extra ankle height in mid swing
SWING_HOLD = 0.20  # part of the swing the foot keeps its toe-off pitch before it swings through
ROOT_CAP = 0.012 * H  # the pelvis never rides higher than this far below standing height (knees stay soft)
ROOT_SOFT = 0.004 * H  # how softly the pelvis height blends between "left leg limits" and "right leg limits"
ROOT_SWAY = 0.012 * H  # sideways shift towards the planted leg
MID_STANCE = STANCE / 2  # phase at which the left foot is under the hip
MAX_REACH = 0.995  # legs never straighten further than this fraction of their length


def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def smootherstep(x):
    """0 -> 1 with zero speed AND zero acceleration at both ends (a step whose ends do not jolt)."""
    x = min(max(x, 0.0), 1.0)
    return x * x * x * (x * (6 * x - 15) + 10)


def soft_pos(x, eps=3.0):
    """Smooth max(x, 0): exactly 0 for x <= 0, exactly x for x >= eps, and in between a curve whose
    slope runs continuously from 0 to 1 (so nothing driven by it jerks, and nothing falls short)."""
    if x <= 0.0:
        return 0.0
    if x >= eps:
        return x
    t = x / eps
    return x * t * t * (3.0 - 2.0 * t)


def soft_max(values, k=1.0):
    """Smooth maximum (log-sum-exp): never below the true maximum, at most k * ln(n) above it."""
    top = max(values)
    return top + k * math.log(sum(math.exp((v - top) / k) for v in values))


def _about(pivot_rest, pivot_world, pitch, point_rest):
    """Where ``point_rest`` of the foot ends up when the foot is pitched about a fixed pivot."""
    return pivot_world + rot_x(pitch) @ (point_rest - pivot_rest)


def foot_path(psi: float, s: int) -> Dict[str, object]:
    """One foot over leg phase psi in [0,1), in the PLANT frame: a world-fixed frame whose origin is
    the foot's rest position while it is planted (z forward).  psi = 0 is heel strike.

    Returns ankle position (relative to the rest ankle), foot pitch, toe-hinge angle (both degrees,
    + = toes down), and which point is pinned to the ground: "heel", "sole", "toe" or None (swing)."""
    psi = psi % 1.0
    A0, T0, Hc = rig.ANKLE[s], rig.TOE[s], rig.HEEL[s]
    if psi < STANCE:
        t = psi / STANCE
        if t < HEEL_ROCK:
            pitch = PITCH_STRIKE * (1 - smootherstep(t / HEEL_ROCK))
            return dict(ankle=_about(Hc, Hc, pitch, A0) - A0, pitch=pitch, toe=0.0, contact="heel")
        if t < HEEL_OFF:
            return dict(ankle=np.zeros(3), pitch=0.0, toe=0.0, contact="sole")
        pitch = PITCH_OFF * smootherstep((t - HEEL_OFF) / (1 - HEEL_OFF))
        return dict(ankle=_about(T0, T0, pitch, A0) - A0, pitch=pitch, toe=-pitch, contact="toe")
    t = (psi - STANCE) / (1 - STANCE)
    start = _about(T0, T0, PITCH_OFF, A0) - A0  # where toe-off left the ankle
    end = _about(Hc, Hc, PITCH_STRIKE, A0) - A0 + np.array([0.0, 0.0, STRIDE])  # next heel strike, one stride on
    ankle = start + (end - start) * smootherstep(t)  # zero world speed at both ends
    ankle[1] += SWING_LIFT * math.sin(math.pi * t) ** 2
    pitch = PITCH_OFF + (PITCH_STRIKE - PITCH_OFF) * smootherstep((t - SWING_HOLD) / (1 - SWING_HOLD))
    toe = -PITCH_OFF * (1 - smoothstep(t / 0.70))  # toes straighten out during the swing (slowly: the shoe is long)
    return dict(ankle=ankle, pitch=pitch, toe=toe, contact=None)


def plant_shift(psi: float) -> float:
    """z of the plant frame's origin relative to the body, for a body that advances STRIDE per cycle."""
    return STRIDE * (MID_STANCE - (psi % 1.0))


def _basis(d, hinge):
    d = d / np.linalg.norm(d)
    a = hinge - (hinge @ d) * d
    a = a / np.linalg.norm(a)
    return np.stack([d, a, np.cross(d, a)], 1)


def leg_ik(hip, ankle, fwd, s: int):
    """World rotations (relative to the rest pose) of thigh and shin that put the ankle on its
    target with the knee bending towards ``fwd``.  Also returns reach = distance / leg length."""
    l1, l2 = rig.THIGH_LEN, rig.SHIN_LEN
    D = ankle - hip
    dist = float(np.linalg.norm(D))
    d = min(max(dist, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.99999)
    ex = D / dist
    b = fwd - (fwd @ ex) * ex
    b = b / np.linalg.norm(b)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    knee = hip + ex * a + b * h
    hinge = np.cross(b, ex)  # knee axis, perpendicular to the plane the leg bends in
    x = np.array([1.0, 0.0, 0.0])
    W_thigh = _basis(knee - hip, hinge) @ _basis(rig.KNEE[s] - rig.HIP[s], x).T
    W_shin = _basis(hip + ex * d - knee, hinge) @ _basis(rig.ANKLE[s] - rig.KNEE[s], x).T
    return W_thigh, W_shin, dist / (l1 + l2)


def soft_min(values, k):
    """Smooth minimum (never above the true minimum)."""
    m = min(values)
    return m - k * math.log(sum(math.exp(-(v - m) / k) for v in values))


def root_height(R_pelvis, root_xz, ankles) -> float:
    """Highest pelvis offset (y) at which both legs still reach their ankles with MAX_REACH to spare,
    blended softly and capped at ROOT_CAP below standing.  This is what makes the body bob: it rides
    over the planted leg and sinks when both feet are far apart."""
    ph = rig.PELVIS
    reach2 = (MAX_REACH * (rig.THIGH_LEN + rig.SHIN_LEN)) ** 2
    hs = [-ROOT_CAP]
    for s, ankle in ankles.items():
        hip = R_pelvis @ (rig.HIP[s] - ph) + ph  # hip without the root offset
        dx, dz = ankle[0] - hip[0] - root_xz[0], ankle[2] - hip[2] - root_xz[1]
        hs.append(ankle[1] - hip[1] + math.sqrt(max(reach2 - dx * dx - dz * dz, 1e-9)))
    return soft_min(hs, ROOT_SOFT)


def _pelvis_world(R_pelvis, root):
    ph = rig.PELVIS
    return lambda p: R_pelvis @ (p - ph) + ph + root


# ---------------------------------------------------------------- balance of a gait (centre of mass, ZMP)
# A loop whose pelvis just glides along at a constant speed is not balanced: the swinging leg and arms
# carry the centre of mass ahead in early single support - exactly when a real body slows down, rising
# over its planted leg (an inverted pendulum) - so the ground would have to pull (examples/soldier/qc.py,
# README "걷기 균형").  The loops below therefore choose the pelvis's forward travel so that the WHOLE
# body's centre of mass moves the way gravity allows: its ground point "ZMP" (where the floor pushes)
# stays on the planted foot, rolling from heel to ball.  For a body of height y over the ground:
#     x'' = (y'' + g) / y * (x - p)            p = the ZMP, 0 factor in flight (ballistic)
# solved once per loop on a periodic grid (a linear system); the pelvis offset that puts the centre of
# mass on that path is found by a few fixed-point steps.  The masses are de Leva's (as in qc.py).
G_ACC = 9.81
M_PER_UNIT = 1.75 / H  # metres per world unit (1.80 units = a 1.75 m man)
_DE_LEVA_TRUNK_MM = (145.7, 215.5, 170.7)  # low, middle, upper trunk (de Leva 1996, males)


def _com_table():
    mid_hip = 0.5 * (rig.HIP[1] + rig.HIP[-1])
    top = rig.NECK
    tot = sum(_DE_LEVA_TRUNK_MM)
    navel = mid_hip + (top - mid_hip) * _DE_LEVA_TRUNK_MM[0] / tot
    xiph = mid_hip + (top - mid_hip) * (_DE_LEVA_TRUNK_MM[0] + _DE_LEVA_TRUNK_MM[1]) / tot
    segs = [("head", rig.VERTEX + 0.5002 * (top - rig.VERTEX), 0.0694)]
    for a, b, f, m in ((top, xiph, 0.5066, 0.1596), (xiph, navel, 0.4502, 0.1633), (navel, mid_hip, 0.6115, 0.1117)):
        q = a + f * (b - a)
        segs.append(("chest" if q[1] >= rig.WAIST[1] else "pelvis", q, m))
    for side, s in rig.SIDES:
        for bone, a, b, f, m in (("upperarm", rig.SHOULDER[s], rig.ELBOW[s], 0.5772, 0.0271),
                                 ("forearm", rig.ELBOW[s], rig.WRIST[s], 0.4574, 0.0162),
                                 ("hand", rig.WRIST[s], rig.FINGERTIP[s], 0.3624, 0.0061),
                                 ("thigh", rig.HIP[s], rig.KNEE[s], 0.4095, 0.1416),
                                 ("shin", rig.KNEE[s], rig.ANKLE[s], 0.4459, 0.0433)):
            segs.append((bone + side, a + f * (b - a), m))
        heel = -rig.HEEL_BACK * rig.FOOT_LEN
        z = heel + 0.4415 * (float(rig.TOE_TIP[s][2]) - heel)
        ank = rig.ANKLE[s]
        segs.append(("foot" + side, np.array([ank[0], rig.GROUND + 0.5 * (ank[1] - rig.GROUND), z]), 0.0137))
    idx = np.array([rig.SKELETON.index[b] for b, _, _ in segs])
    pts = np.array([q for _, q, _ in segs], np.float64)
    mass = np.array([m for _, _, m in segs])
    return idx, pts, mass / mass.sum()


_COM = _com_table()


def mass_points(mats: np.ndarray) -> np.ndarray:
    """(S, 3) world positions of the body segments' centres of mass (weights: ``_COM[2]``)."""
    idx, pts, _ = _COM
    M = np.asarray(mats, np.float64)[idx]
    return np.einsum("sij,sj->si", M[:, :, :3], pts) + M[:, :, 3]


def multibody_zmp(seg: np.ndarray, dt: float, periodic: bool = True, travel: float = 0.0) -> np.ndarray:
    """(T, 2) ZMP [x, z] of point masses ``seg`` (T, S, 3, world units) sampled dt apart (ground y = GROUND):
    the point the floor must push through for the segments to accelerate as they do (qc.zmp).  ``periodic``:
    one loop that advances ``travel`` along z per period."""
    _, _, mass = _COM
    y = (seg - np.array([0.0, rig.GROUND, 0.0])) * M_PER_UNIT
    if periodic:
        T = len(y)
        flat = y.copy()
        flat[..., 2] -= (travel * M_PER_UNIT * np.arange(T) / T)[:, None]  # a steady glide does not accelerate
        a = (np.roll(flat, -1, 0) - 2 * flat + np.roll(flat, 1, 0)) / dt ** 2
    else:
        a = np.gradient(np.gradient(y, dt, axis=0), dt, axis=0)
    fy = np.einsum("s,ts->t", mass, a[..., 1] + G_ACC)
    out = np.stack([np.einsum("s,ts->t", mass, (a[..., 1] + G_ACC) * y[..., k] - a[..., k] * y[..., 1]) for k in (0, 2)], 1)
    return out / fy[:, None] / M_PER_UNIT


def com_of(mats: np.ndarray) -> np.ndarray:
    """World centre of mass of a pose (rest->posed bone matrices of ``rig.SKELETON``)."""
    idx, pts, mass = _COM
    M = np.asarray(mats, np.float64)[idx]
    return np.einsum("s,sk->k", mass, np.einsum("sij,sj->si", M[:, :, :3], pts) + M[:, :, 3])


def zmp_follow(p: np.ndarray, c: np.ndarray, dt: float, travel: float) -> np.ndarray:
    """Periodic solution of x'' = c (x - p) on a grid of N samples dt apart, for a ZMP track ``p`` that
    advances ``travel`` per period (p[i] - travel * i / N is periodic).  Returns x (absolute)."""
    N = len(p)
    t = np.arange(N) / N
    pr = np.asarray(p, np.float64) - travel * t
    D2 = (np.roll(np.eye(N), 1, 1) + np.roll(np.eye(N), -1, 1) - 2 * np.eye(N)) / dt ** 2
    xr = np.linalg.solve(D2 - np.diag(c), -np.asarray(c) * pr)
    return xr + travel * t


def periodic_d2(y: np.ndarray, dt: float) -> np.ndarray:
    return (np.roll(y, -1) - 2 * y + np.roll(y, 1)) / dt ** 2


def fourier_fit(y: np.ndarray, harmonics) -> np.ndarray:
    """Least-squares coefficients [c0, a_k, b_k ...] of y over one period sampled at i / N."""
    N = len(y)
    ph = np.arange(N) / N
    A = _fourier_basis(ph, harmonics)
    return np.linalg.lstsq(A, y, rcond=None)[0]


def _fourier_basis(ph, harmonics) -> np.ndarray:
    ph = np.atleast_1d(np.asarray(ph, np.float64))
    cols = [np.ones_like(ph)]
    for k in harmonics:
        cols += [np.cos(TAU * k * ph), np.sin(TAU * k * ph)]
    return np.stack(cols, -1)


def fourier_eval(coef: np.ndarray, harmonics, phase, deriv: int = 0) -> float:
    """Value (or d^n / dphase^n) of a ``fourier_fit`` series at ``phase``."""
    ph = float(phase)
    out = coef[0] if deriv == 0 else 0.0
    for j, k in enumerate(harmonics):
        a, b = coef[1 + 2 * j], coef[2 + 2 * j]
        w = TAU * k
        if deriv == 0:
            out += a * math.cos(w * ph) + b * math.sin(w * ph)
        elif deriv == 1:
            out += w * (-a * math.sin(w * ph) + b * math.cos(w * ph))
        else:
            out += -w * w * (a * math.cos(w * ph) + b * math.sin(w * ph))
    return float(out)


def smooth_below(limit: np.ndarray, harmonics, margin: float = 0.0, acc_max: Optional[float] = None,
                 period: float = 1.0) -> np.ndarray:
    """The highest smooth periodic curve (a Fourier series with these harmonics, highest on average) that
    stays below ``limit`` (sampled at i / N) everywhere.  A pelvis that rides exactly on its leg-reach limit
    follows the limit's corners (where the limiting leg changes) - a kink the eye sees and the vertical
    acceleration shows (-1 g -> +0.8 g within 5 frames); this one rounds them off from below."""
    from scipy.optimize import linprog

    N = len(limit)
    ph = np.arange(N) / N
    A = _fourier_basis(ph, harmonics)
    A_ub, b_ub = [A], [np.asarray(limit) - margin]
    if acc_max is not None:  # |d2y/dt2| <= acc_max (world units / s^2) at every sample: linear in the coefficients
        D = np.zeros_like(A)
        for j, k in enumerate(harmonics):
            w = TAU * k
            D[:, 1 + 2 * j] = -w * w * np.cos(w * ph)
            D[:, 2 + 2 * j] = -w * w * np.sin(w * ph)
        D /= period ** 2
        A_ub += [D, -D]
        b_ub += [np.full(N, acc_max), np.full(N, acc_max)]
    res = linprog(-A.mean(0), A_ub=np.concatenate(A_ub), b_ub=np.concatenate(b_ub),
                  bounds=[(None, None)] * A.shape[1], method="highs")
    if not res.success:
        raise RuntimeError(f"smooth_below: {res.message}")
    return res.x


def leg_limits(R_pelvis, root_xz, ankles, reach: float = MAX_REACH) -> Dict[int, float]:
    """Per leg: the highest pelvis offset (y) at which it still reaches its ankle at ``reach`` x its length."""
    ph = rig.PELVIS
    reach2 = (reach * (rig.THIGH_LEN + rig.SHIN_LEN)) ** 2
    out = {}
    for s, ankle in ankles.items():
        hip = R_pelvis @ (rig.HIP[s] - ph) + ph
        dx, dz = ankle[0] - hip[0] - root_xz[0], ankle[2] - hip[2] - root_xz[1]
        out[s] = ankle[1] - hip[1] + math.sqrt(max(reach2 - dx * dx - dz * dz, 1e-9))
    return out


def stand_rots(arm_out: float = 10.0, elbow: float = 8.0) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
    """Relaxed standing: arms hang a little away from the body, elbows slightly bent."""
    rots = {}
    for side, s in rig.SIDES:
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=2.0, roll=s * arm_out)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-elbow)
    return rots, np.zeros(3)


def _walk_core(phase: float, advance: float = 0.0, dz: float = 0.0, height: Optional[float] = None,
               info: Optional[dict] = None, helpers: bool = True, dx: Optional[float] = None):
    """The walk pose with the pelvis ``dz`` ahead of its even glide, ``dx`` to the side (None = the old
    sway, ROOT_SWAY) and at ``height`` (None = the old rule: as high as both legs allow, ``root_height``).
    ``walk_rots`` passes the balanced values."""
    c1 = math.cos(TAU * phase)  # +1 when the left heel strikes (left leg forward)
    over = math.cos(TAU * (phase - MID_STANCE))  # +1 when the body is over the left foot
    bob = math.cos(2 * TAU * (phase - MID_STANCE))  # +1 over either foot, -1 with both feet down
    yaw_p = -5.0 * c1  # the hip of the leading leg comes forward
    R_pelvis = rig.euler(pitch=2.0, yaw=yaw_p, roll=3.0 * over)  # the swing side of the pelvis drops
    # feet first (world space), then the pelvis height they allow
    feet, ankles = {}, {}
    for side, s in rig.SIDES:
        psi = (phase + (0.0 if s > 0 else 0.5)) % 1.0
        f = foot_path(psi, s)
        origin = np.array([0.0, 0.0, advance + plant_shift(psi)])  # plant frame -> world
        feet[s], ankles[s] = (psi, f, origin), rig.ANKLE[s] + origin + f["ankle"]
    sway = ROOT_SWAY * over if dx is None else dx
    if height is None:
        height = root_height(R_pelvis, (sway, advance + dz), ankles)
    root = np.array([sway, height, advance + dz])
    rots = {"pelvis": R_pelvis}
    # trunk: counter-turn at the waist turntable, shoulders stay level, head keeps looking ahead
    chest_yaw = 4.0 * c1  # world heading of the chest
    rots["chest"] = rig.local_rot("chest", pitch=2.5 + 1.0 * bob, yaw=chest_yaw - yaw_p, roll=-2.4 * over)
    rots["neck"] = rig.local_rot("neck", pitch=-3.0 - 1.0 * bob, roll=-0.4 * over)
    rots["head"] = rig.local_rot("head", pitch=-1.5, yaw=-chest_yaw)
    # legs: two-bone IK onto the ankles
    to_world = _pelvis_world(R_pelvis, root)
    fwd = rig.euler(yaw=0.5 * yaw_p) @ np.array([0.0, 0.0, 1.0])  # knees point between hips and feet
    for side, s in rig.SIDES:
        psi, f, origin = feet[s]
        W_thigh, W_shin, reach = leg_ik(to_world(rig.HIP[s]), ankles[s], fwd, s)
        W_foot = rot_x(f["pitch"])  # pure pitch in the world: the foot's heading never changes
        rots["thigh" + side] = R_pelvis.T @ W_thigh
        rots["shin" + side] = W_thigh.T @ W_shin
        rots["foot" + side] = W_shin.T @ W_foot
        rots["toe" + side] = rig.local_rot("toe" + side, pitch=f["toe"])
        if info is not None:
            info[side] = dict(psi=psi, contact=f["contact"], ankle=ankles[s], reach=reach, pitch=f["pitch"],
                              origin=origin)
    # arms: swing against the legs (left arm is back when the left leg is forward)
    for side, s in rig.SIDES:
        sw = c1 * s
        rots["clav" + side] = rig.local_rot("clav" + side, yaw=-s * 2.0 * sw)
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=-3.0 + 21.0 * sw, roll=s * 9.0)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-(19.0 - 11.0 * sw), yaw=s * 8.0)
        rots["hand" + side] = rig.local_rot("hand" + side, pitch=-6.0)
    if info is not None:
        info["_limits"] = (R_pelvis, (sway, advance + dz), ankles)
    if helpers:
        drive_helpers(rots, phase=phase, walk=1.0)
    return rots, root


WALK_PERIOD = 0.8  # seconds per cycle the walk is balanced for (the play page: STRIDE 1.12 m at 1.4 m/s)
_WALK_DZ_H = (2, 4, 6, 8)  # harmonics of the forward offset (it repeats every step: even only)
_WALK_DX_H = (1, 3, 5)  # ... of the sideways sway (it changes sides every step: odd only)
ZMP_INSET = 0.008 * H  # the floor pushes a little inside the ankle line (the arch side), world units
_WALK_H_H = (2, 4, 6)  # ... and of the pelvis height
WALK_REACH = 0.99  # the pelvis stays low enough for the legs to reach with this fraction of their length
WALK_PELVIS_ACC = 0.45 * G_ACC / M_PER_UNIT  # ... and never rises or sinks faster than this (world units / s^2)


def walk_zmp_ref(phase: float) -> np.ndarray:
    """Where the floor should push ([x, z], world units, advance = STRIDE * phase): on the planted foot,
    rolling from a quarter of the way from heel to ball, to the ball; in double support from the trailing
    ball to the leading foot."""
    d = STANCE - 0.5  # double support at the start of each half cycle

    def foot(origin, s, u):
        heel, ball = origin + rig.HEEL[s][2], origin + rig.TOE[s][2]
        return np.array([rig.ANKLE[s][0] - s * ZMP_INSET, heel + (0.25 + 0.75 * u) * (ball - heel)])

    ph = phase % 1.0
    cyc = STRIDE * math.floor(phase)
    zL = STRIDE * MID_STANCE + cyc
    if ph < d:  # right ball -> left foot
        return foot(STRIDE * (MID_STANCE - 0.5) + cyc, -1, 1.0) * (1 - ph / d) + foot(zL, 1, 0.0) * (ph / d)
    if ph < 0.5:
        return foot(zL, 1, (ph - d) / (0.5 - d))
    zR = STRIDE * (MID_STANCE + 0.5) + cyc
    if ph < 0.5 + d:
        u = (ph - 0.5) / d
        return foot(zL, 1, 1.0) * (1 - u) + foot(zR, -1, 0.0) * u
    return foot(zR, -1, (ph - 0.5 - d) / (0.5 - d))


def _balance_loop(core, zmp_ref, travel: float, period: float, dz_h, h_h, n: int = 120, rounds: int = 6,
                  height_fn=None, reach: float = MAX_REACH, height_margin: float = 0.0005 * H, dx_h=(1, 3, 5),
                  relax: float = 1.0, height_acc: Optional[float] = None):
    """Shared by the walk and the run: the pelvis's forward offset (Fourier coefficients over the phase) that
    puts the centre of mass on the balanced path, and the pelvis height (coefficients) - the smooth curve
    under the legs' reach (``height_fn`` = None) or ``height_fn(limits)`` for a designed one."""
    ph = np.arange(n) / n
    dt = period / n
    dz = np.zeros(n)
    dx = np.zeros(n)
    hgt = [None] * n
    out = {}
    for _ in range(rounds):
        com, lim = np.zeros((n, 3)), np.zeros(n)
        seg = np.zeros((n, len(_COM[0]), 3))
        for i, f in enumerate(ph):
            info: dict = {}
            rots, root = core(f, travel * f, dz[i], hgt[i], info=info, helpers=False, dx=dx[i])
            mats = rig.SKELETON.world_mats(rots, root_offset=root)
            com[i] = com_of(mats)
            seg[i] = mass_points(mats)
            Rp, rxz, ank = info["_limits"]
            lim[i] = min(leg_limits(Rp, rxz, ank, reach).values())
        y = (com[:, 1] - rig.GROUND) * M_PER_UNIT
        c = (periodic_d2(y, dt) + G_ACC) / y
        c = np.maximum(c, 0.0)
        p = np.array([zmp_ref(f) for f in ph])
        # the whole body moved by d(t) moves the ZMP by d - (y / (y'' + g)) d'': the correction that puts the
        # multi-body ZMP (swinging limbs included, not just the centre of mass) on the reference
        z0 = multibody_zmp(seg, dt, travel=travel)
        err = zmp_follow(p[:, 1] - z0[:, 1], c, dt, 0.0)
        err_x = zmp_follow(p[:, 0] - z0[:, 0], c, dt, 0.0)
        out["dz"] = fourier_fit(dz + relax * err, dz_h)
        dz = _fourier_basis(ph, dz_h) @ out["dz"]
        out["dx"] = fourier_fit(dx + relax * err_x, dx_h)
        dx = _fourier_basis(ph, dx_h) @ out["dx"]
        if height_fn is None:
            out["h"] = smooth_below(np.minimum(lim, -ROOT_CAP), h_h, height_margin, height_acc, period)
        else:
            out["h"] = height_fn(ph, lim)
        hgt = list(_fourier_basis(ph, h_h) @ out["h"])
    out.update(dz_h=dz_h, h_h=h_h, dx_h=dx_h, period=period, travel=travel, n=n,
               com_err=float(max(np.abs(err).max(), np.abs(err_x).max())))
    return out


_BALANCE_CACHE: Dict[tuple, dict] = {}


def walk_balance(period: float = WALK_PERIOD) -> dict:
    """The walk's balanced pelvis track (computed once per period, about a second)."""
    key = ("walk", round(float(period), 6), STRIDE, STANCE)
    if key not in _BALANCE_CACHE:
        _BALANCE_CACHE[key] = _balance_loop(_walk_core, walk_zmp_ref, STRIDE, period, _WALK_DZ_H, _WALK_H_H,
                                            reach=WALK_REACH, dx_h=_WALK_DX_H, height_acc=WALK_PELVIS_ACC)
    return _BALANCE_CACHE[key]


def walk_rots(skel: Skeleton, phase: float, advance: float = 0.0, info: Optional[dict] = None):
    """Local rotations + root offset for walk phase in [0,1).  ``info`` (optional dict) receives the
    world targets of both feet and the leg reach, for tests.  The pelvis follows ``walk_balance``: it
    slows while it rises over the planted leg and gains speed again as it falls onto the next one, and its
    height is a smooth curve under what the legs reach (README "걷기 균형")."""
    b = walk_balance()
    dz = fourier_eval(b["dz"], b["dz_h"], phase)
    h = fourier_eval(b["h"], b["h_h"], phase)
    dx = fourier_eval(b["dx"], b["dx_h"], phase)
    return _walk_core(phase, advance, dz, h, info, dx=dx)


def walk_pose(skel: Skeleton, phase: float, advance: float = 0.0):
    """(B,3,4) rest->posed matrices + root offset, same call as the Nike example's walk_pose."""
    rots, root = walk_rots(skel, phase, advance)
    return skel.world_mats(rots, root_offset=root), root


# ---------------------------------------------------------------- run loop (a jog with a flight phase)
# Built like the walk: feet first, in WORLD space (a planted foot is a fixed point - it lands near flat,
# rolls onto the ball and pushes off; the swinging foot leaves and lands with zero world speed, its heel
# kicked up behind on the way), legs by two-bone IK, the pelvis's height designed (ballistic in flight,
# dipping in stance) and its forward / sideways travel balanced like the walk's (``_balance_loop``: in flight
# nothing pushes, so the body glides; in stance the floor pushes through the planted foot).
RUN_PERIOD = 40 / 60  # seconds per cycle (two steps): 90 steps a minute per leg, 180 in all
RUN_SPEED_MS = 3.75  # metres per second
RUN_STRIDE = RUN_SPEED_MS * RUN_PERIOD / M_PER_UNIT  # world units per cycle (2.5 m)
RUN_STANCE = 0.27  # fraction of the cycle a foot is down (0.18 s); each step has 0.23 x 0.667 s = 0.15 s of flight
RUN_MID = RUN_STANCE / 2
RUN_STRIKE = -7.0  # foot pitch at touchdown (degrees, toes up a little: lands on the outer heel / midfoot)
RUN_ROLL = 0.22  # part of the stance spent rolling flat
RUN_HEEL_OFF = 0.25  # part of the stance after which the heel lifts
RUN_PITCH_OFF = 42  # foot pitch at toe-off
RUN_LIFT = 0.13 * H  # extra ankle height at the top of the heel kick
RUN_NARROW = 0.018 * H  # runners put their feet nearer the midline than walkers
RUN_BOUNCE = 0.6  # the pelvis's up-and-down as a fraction of a free fall's (see run_height_shape)
RUN_REACH = 0.985  # the pelvis stays low enough for the stance leg to keep a little bend
_RUN_DZ_H = (2, 4, 6, 8)
_RUN_DX_H = (1, 3, 5)
_RUN_H_H = (2, 4, 6, 8, 10, 12)


def run_foot_path(psi: float, s: int) -> Dict[str, object]:
    """One foot of the run over leg phase psi in [0,1) (0 = touchdown), in its plant frame (see ``foot_path``)."""
    psi = psi % 1.0
    A0, T0, Hc = rig.ANKLE[s], rig.TOE[s], rig.HEEL[s]
    if psi < RUN_STANCE:
        t = psi / RUN_STANCE
        if t < RUN_ROLL:
            pitch = RUN_STRIKE * (1 - smootherstep(t / RUN_ROLL))
            return dict(ankle=_about(Hc, Hc, pitch, A0) - A0, pitch=pitch, toe=0.0, contact="heel")
        if t < RUN_HEEL_OFF:
            return dict(ankle=np.zeros(3), pitch=0.0, toe=0.0, contact="sole")
        pitch = RUN_PITCH_OFF * smootherstep((t - RUN_HEEL_OFF) / (1 - RUN_HEEL_OFF))
        return dict(ankle=_about(T0, T0, pitch, A0) - A0, pitch=pitch, toe=-pitch, contact="toe")
    t = (psi - RUN_STANCE) / (1 - RUN_STANCE)
    start = _about(T0, T0, RUN_PITCH_OFF, A0) - A0
    end = _about(Hc, Hc, RUN_STRIKE, A0) - A0 + np.array([0.0, 0.0, RUN_STRIDE])
    ankle = start + (end - start) * smoothstep(t)
    # up and down in one arch (the foot leaves and lands moving: a runner's foot is not set down gently).  A
    # foot that came down early would hang at the landing spot far ahead of a body in flight and pull the
    # whole loop's pelvis down to reach it
    ankle[1] += RUN_LIFT * math.sin(math.pi * t ** 1.3)
    pitch = RUN_PITCH_OFF + (RUN_STRIKE - RUN_PITCH_OFF) * smootherstep((t - 0.12) / 0.80)
    toe = -RUN_PITCH_OFF * (1 - smootherstep(t / 0.5))
    return dict(ankle=ankle, pitch=pitch, toe=toe, contact=None)


def _soft_clamp(x: float, lo: float, hi: float, eps: float) -> float:
    """x kept inside [lo, hi], bending smoothly onto the bound over the last ``eps`` (degrees)."""
    x = lo + soft_pos(x - lo, eps)
    return hi - soft_pos(hi - x, eps)


def run_zmp_ref(phase: float) -> np.ndarray:
    """[x, z] the floor pushes through while a foot is down: from just behind the ankle to the ball."""
    ph = phase % 1.0
    cyc = RUN_STRIDE * math.floor(phase)
    for s, start in ((1, 0.0), (-1, 0.5)):
        u = ph - start
        if 0.0 <= u < RUN_STANCE:
            origin = RUN_STRIDE * (RUN_MID + start) + cyc
            heel, ball = origin + rig.HEEL[s][2], origin + rig.TOE[s][2]
            return np.array([rig.ANKLE[s][0] - s * (RUN_NARROW + ZMP_INSET),
                             heel + (0.35 + 0.65 * u / RUN_STANCE) * (ball - heel)])
    return np.array([0.0, RUN_STRIDE * phase])  # flight: not used (nothing pushes)


def _run_core(phase: float, advance: float = 0.0, dz: float = 0.0, height: Optional[float] = None,
              info: Optional[dict] = None, helpers: bool = True, dx: Optional[float] = None):
    c1 = math.cos(TAU * phase)  # +1 when the left foot touches down (left leg forward)
    over = math.cos(TAU * (phase - RUN_MID))
    bob = math.cos(2 * TAU * (phase - RUN_MID))
    yaw_p = -8.0 * c1
    R_pelvis = rig.euler(pitch=8.0, yaw=yaw_p, roll=4.0 * over)
    feet, ankles = {}, {}
    for side, s in rig.SIDES:
        psi = (phase + (0.0 if s > 0 else 0.5)) % 1.0
        f = run_foot_path(psi, s)
        origin = np.array([-s * RUN_NARROW, 0.0, advance + RUN_STRIDE * (RUN_MID - psi)])
        feet[s], ankles[s] = (psi, f, origin), rig.ANKLE[s] + origin + f["ankle"]
    sway = 0.0 if dx is None else dx
    if height is None:
        height = root_height(R_pelvis, (sway, advance + dz), ankles)
    root = np.array([sway, height, advance + dz])
    rots = {"pelvis": R_pelvis}
    chest_yaw = 9.0 * c1  # the shoulders turn against the hips
    rots["chest"] = rig.local_rot("chest", pitch=7.0 + 1.5 * bob, yaw=chest_yaw - yaw_p, roll=-2.5 * over)
    rots["neck"] = rig.local_rot("neck", pitch=-5.0 - 1.5 * bob, roll=-0.5 * over)
    rots["head"] = rig.local_rot("head", pitch=-7.0, yaw=-chest_yaw)
    to_world = _pelvis_world(R_pelvis, root)
    fwd = rig.euler(yaw=0.5 * yaw_p) @ np.array([0.0, 0.0, 1.0])
    for side, s in rig.SIDES:
        psi, f, origin = feet[s]
        W_thigh, W_shin, reach = leg_ik(to_world(rig.HIP[s]), ankles[s], fwd, s)
        pitch = f["pitch"]
        if f["contact"] is None:  # in the air the ankle keeps inside its range, eased (no stop at the limit)
            (lo, hi), _, _ = rig.limits("foot" + side)
            local = rig.joint_angles("foot" + side, W_shin.T @ rot_x(pitch))[0]
            pitch += _soft_clamp(local, lo + 2.0, hi - 2.0, 6.0) - local
        W_foot = rot_x(pitch)
        rots["thigh" + side] = R_pelvis.T @ W_thigh
        rots["shin" + side] = W_thigh.T @ W_shin
        rots["foot" + side] = W_shin.T @ W_foot
        rots["toe" + side] = rig.local_rot("toe" + side, pitch=f["toe"])
        if info is not None:
            info[side] = dict(psi=psi, contact=f["contact"], ankle=ankles[s], reach=reach, pitch=f["pitch"],
                              origin=origin)
    for side, s in rig.SIDES:  # arms pump against the legs, elbows near a right angle
        sw = c1 * s
        rots["clav" + side] = rig.local_rot("clav" + side, yaw=-s * 4.0 * sw)
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=-6.0 + 38.0 * sw, roll=s * 10.0)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-(86.0 - 16.0 * sw), yaw=s * 10.0)
        rots["hand" + side] = rig.local_rot("hand" + side, pitch=-10.0)
    if info is not None:
        info["_limits"] = (R_pelvis, (sway, advance + dz), ankles)
    if helpers:
        drive_helpers(rots, phase=phase, walk=1.0)
    return rots, root


def run_height_shape(phase) -> np.ndarray:
    """The pelvis's up-and-down per step, world units, 0 at touchdown: a dip while a foot is down, a free-fall
    parabola in flight (it leaves and lands at the speed gravity gives a flight of that length)."""
    tc, tf = RUN_STANCE * RUN_PERIOD, (0.5 - RUN_STANCE) * RUN_PERIOD
    g = RUN_BOUNCE * G_ACC  # the pelvis bounces less than the centre of mass: the legs swing up and down under it
    vy = g * tf / 2
    u = np.asarray(phase, np.float64) % 0.5 * RUN_PERIOD
    st = -(vy * tc / math.pi) * np.sin(math.pi * np.minimum(u, tc) / tc)
    fl = vy * (u - tc) - 0.5 * g * (u - tc) ** 2
    return np.where(u < tc, st, fl) / M_PER_UNIT


def _run_height(ph, lim):
    shape = run_height_shape(ph)
    base = float(np.min(lim - shape)) - 0.002 * H
    return fourier_fit(base + shape, _RUN_H_H)


def run_balance() -> dict:
    key = ("run", RUN_PERIOD, RUN_STRIDE, RUN_STANCE)
    if key not in _BALANCE_CACHE:
        _BALANCE_CACHE[key] = _balance_loop(_run_core, run_zmp_ref, RUN_STRIDE, RUN_PERIOD, _RUN_DZ_H, _RUN_H_H,
                                            height_fn=_run_height, reach=RUN_REACH, dx_h=_RUN_DX_H, rounds=12,
                                            relax=0.6)
    return _BALANCE_CACHE[key]


def run_gait_rots(skel: Skeleton, phase: float, advance: float = 0.0, info: Optional[dict] = None):
    """The run loop (3.75 m/s at RUN_PERIOD; ``advance = RUN_STRIDE * phase`` to travel, 0 = on the spot).
    Not the same as ``run_rots`` (a synthetic sprint for testing the costume, no foot planting)."""
    b = run_balance()
    return _run_core(phase, advance, fourier_eval(b["dz"], b["dz_h"], phase), fourier_eval(b["h"], b["h_h"], phase),
                     info, dx=fourier_eval(b["dx"], b["dx_h"], phase))


def run_gait_pose(skel: Skeleton, phase: float, advance: float = 0.0):
    rots, root = run_gait_rots(skel, phase, advance)
    return skel.world_mats(rots, root_offset=root), root


# ---------------------------------------------------------------- feet pinned to the floor; the guard idle
def leg_state(rots: Dict[str, np.ndarray], root) -> Dict[int, dict]:
    """Per leg of a pose: the ankle's world position, the foot's world rotation, the knee's bend direction
    and the leg's twist (what ``leg_ik`` alone would not reproduce), for ``pin_legs``."""
    skel = rig.SKELETON
    M = np.asarray(skel.world_mats(rots, root_offset=np.asarray(root, np.float64)), np.float64)
    out = {}
    for side, s in rig.SIDES:
        Mt, Ms, Mf = (M[skel.index[b + side]] for b in ("thigh", "shin", "foot"))
        hip, knee = Mt[:, :3] @ rig.HIP[s] + Mt[:, 3], Mt[:, :3] @ rig.KNEE[s] + Mt[:, 3]
        ankle = Mf[:, :3] @ rig.ANKLE[s] + Mf[:, 3]
        axis = (ankle - hip) / max(np.linalg.norm(ankle - hip), 1e-9)
        bend = knee - hip
        bend = bend - (bend @ axis) * axis  # the knee's offset across the hip-ankle line
        nb = np.linalg.norm(bend)
        bend = bend / nb if nb > 1e-6 else Mt[:, :3] @ np.array([0.0, 0.0, 1.0])  # a straight leg: the knee's front
        W_t, W_s, _ = leg_ik(hip, ankle, bend, s)
        out[s] = dict(ankle=ankle, W_foot=Mf[:, :3].copy(), bend=bend, twist=(W_t.T @ Mt[:, :3], W_s.T @ Ms[:, :3]))
    return out


def pin_legs(rots: Dict[str, np.ndarray], root, pins: Dict[int, dict]) -> Dict[str, np.ndarray]:
    """Re-aim thigh, shin and foot (in place) so each pinned ankle sits at ``pins[s]["ankle"]`` with the foot
    turned ``W_foot`` in the world, whatever the pelvis did - the leg keeps its twist and bend direction."""
    skel = rig.SKELETON
    M = np.asarray(skel.world_mats(rots, root_offset=np.asarray(root, np.float64)), np.float64)
    W_p = M[skel.index["pelvis"], :, :3]
    for side, s in rig.SIDES:
        if s not in pins:
            continue
        p = pins[s]
        Mt = M[skel.index["thigh" + side]]
        hip = Mt[:, :3] @ rig.HIP[s] + Mt[:, 3]
        W_t, W_s, _ = leg_ik(hip, p["ankle"], p["bend"], s)
        W_t, W_s = W_t @ p["twist"][0], W_s @ p["twist"][1]
        rots["thigh" + side] = W_p.T @ W_t
        rots["shin" + side] = W_t.T @ W_s
        rots["foot" + side] = W_s.T @ p["W_foot"]
    return rots


IDLE_BREATH = 1.2  # degrees the chest lifts with a breath
IDLE_SHRUG = 1.6  # degrees the shoulders rise with it
IDLE_BOB = 0.0030 * H  # the knees give this much, twice a loop
IDLE_SHIFT = 0.0030 * H  # weight shift from foot to foot, once a loop


def guard_idle_rots(base_rots: Dict[str, np.ndarray], base_root, phase: float, amount: float = 1.0):
    """A breathing guard loop around a held pose (``base_rots``, ``base_root``: e.g. the first frame of a
    boxing clip): one breath per loop (chest and shoulders rise), the knees give a little twice, the weight
    drifts from one foot to the other and back.  The feet stay exactly where the held pose has them
    (``pin_legs``); at phase 0 the pose IS the held pose, so the loop starts and ends on it."""
    b = math.sin(TAU * phase) * amount
    bob = (0.5 - 0.5 * math.cos(2 * TAU * phase)) * amount
    shift = math.sin(TAU * phase) * amount
    pins = leg_state(base_rots, base_root)
    rots = {k: np.asarray(v, np.float64).copy() for k, v in base_rots.items()}
    root = np.asarray(base_root, np.float64) + np.array([IDLE_SHIFT * shift, -IDLE_BOB * bob, 0.0])
    eye = np.eye(3)
    rots["pelvis"] = rig.euler(roll=-0.8 * shift) @ rots.get("pelvis", eye)
    rots["chest"] = rots.get("chest", eye) @ rig.euler(pitch=-IDLE_BREATH * b, roll=0.8 * shift)
    rots["neck"] = rots.get("neck", eye) @ rig.euler(pitch=0.5 * IDLE_BREATH * b)
    rots["head"] = rots.get("head", eye) @ rig.euler(pitch=0.5 * IDLE_BREATH * b)
    for side, s in rig.SIDES:
        rots["clav" + side] = rots.get("clav" + side, eye) @ rig.euler(roll=s * IDLE_SHRUG * b)
        rots["upperarm" + side] = rots.get("upperarm" + side, eye) @ rig.euler(roll=-s * 0.6 * IDLE_SHRUG * b)
    pin_legs(rots, root, pins)
    return rots, root


# ---------------------------------------------------------------- turntable demo
WAIST_TURN = 40.0  # degrees either way
NECK_TURN = 70.0
NECK_LEAD = 0.30  # the head runs this fraction of a cycle ahead of the waist


def turn_angles(phase: float) -> Tuple[float, float]:
    """(waist yaw, neck yaw) in degrees for the turntable demo."""
    return WAIST_TURN * math.sin(TAU * phase), NECK_TURN * math.sin(TAU * (phase + NECK_LEAD))


def turn_rots(skel: Skeleton, phase: float, bend: float = 0.0):
    """Standing on the spot, turning at the waist turntable (+-40 deg) and the neck turntable (+-70 deg),
    out of step with each other.  ``bend`` (degrees) adds a forward/back sway at the waist, to show
    the ball inside the turntable keeping the trunk closed."""
    rots, root = stand_rots()
    waist, neck = turn_angles(phase)
    breath = math.sin(2 * TAU * phase)
    rots["chest"] = rig.local_rot("chest", pitch=1.0 + 0.6 * breath + bend * math.sin(2 * TAU * phase + 0.6), yaw=waist)
    rots["head"] = rig.local_rot("head", yaw=neck)
    for side, s in rig.SIDES:  # the arms trail the shoulders a little
        lag = -0.12 * waist * s
        out = (waist / WAIST_TURN) ** 2  # 0 facing front, 1 at either end of the turn
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=2.0 + lag, roll=s * (10.0 + 1.6 * out))
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-(9.0 + 4.0 * out))
    d = 1e-3  # turning speeds (degrees per cycle) for the trailing cloth and plume
    w1, n1 = turn_angles(phase + d)
    w0, n0 = turn_angles(phase - d)
    drive_helpers(rots, phase=phase, walk=0.0, chest_spin=(w1 - w0) / (2 * d),
                  head_spin=(w1 - w0 + n1 - n0) / (2 * d))
    return rots, root


def turn_pose(skel: Skeleton, phase: float, bend: float = 0.0):
    rots, root = turn_rots(skel, phase, bend)
    return skel.world_mats(rots, root_offset=root), root


# ---------------------------------------------------------------- costume helper bones (stage 2)
def thigh_swing(R_thigh_local: np.ndarray, s: int) -> Tuple[float, float]:
    """(forward, outward) angle in degrees of a thigh relative to the pelvis."""
    d = R_thigh_local @ np.array([0.0, -1.0, 0.0])
    return math.degrees(math.atan2(d[2], -d[1])), math.degrees(math.atan2(s * d[0], -d[1]))


# The cloth is not simulated.  Every piece is rigid and is turned, each frame, by an angle worked out
# from the body: a gore of the skirt swings out just far enough to lie ON the legs under it, the cape
# hangs plumb but leans back as far as it must to pass behind hips, skirt and legs.
CLOTH_GAP = 0.0125 * H  # room kept between a limb and the middle of the cloth lying on it
CAPE_GAP = 0.024 * H  # ... and behind it, for the cape (which hangs in folds and curls round)
THIGH_R = (0.052, 0.035)  # radius of the thigh at the hip / at the knee (fractions of H)
SHIN_R = (0.034, 0.023)
FOOT_R = 0.021
GORE_SOFT = 1.5  # degrees: how softly a gore blends between the points that push it
GORE_MAX = 125.0  # a gore never swings further than this (a thigh raised past ~105 deg cannot be covered)
CAPE_SOFT = 1.0
FALL_RATE = {"gore": 200.0, "cape": 120.0}  # degrees per second lifted cloth drops back (with ``prev``)


def leg_points(rots: Dict[str, np.ndarray]) -> Tuple[np.ndarray, np.ndarray]:
    """A chain of balls along both legs, in the pelvis frame, for the pose ``rots``: (centres (N,3), radii (N,))."""
    eye = np.eye(3)
    pts, rad = [], []
    for side, s in rig.SIDES:
        Rt = rots.get("thigh" + side, eye)
        Rs = Rt @ rots.get("shin" + side, eye)
        Rf = Rs @ rots.get("foot" + side, eye)
        hip = rig.HIP[s]
        knee = hip + Rt @ (rig.KNEE[s] - hip)
        ankle = knee + Rs @ (rig.ANKLE[s] - rig.KNEE[s])
        for t in (0.30, 0.50, 0.70, 0.85, 1.0):
            pts.append(hip + t * (knee - hip))
            rad.append((THIGH_R[0] + t * (THIGH_R[1] - THIGH_R[0])) * H)
        for t in (0.25, 0.50, 0.75, 1.0):
            pts.append(knee + t * (ankle - knee))
            rad.append((SHIN_R[0] + t * (SHIN_R[1] - SHIN_R[0])) * H)
        heel = rig.HEEL[s] + np.array([0.0, FOOT_R * H, -0.02 * H])
        for p in (heel, 0.5 * (heel + rig.TOE[s]), rig.TOE[s], rig.TOE_TIP[s] + np.array([0.0, 0.0, 0.01 * H])):
            pts.append(ankle + Rf @ (p - rig.ANKLE[s]))
            rad.append(FOOT_R * H)
    return np.array(pts), np.array(rad)


# of the 13 balls per leg, the skirt only has to lie outside thigh, knee and the top of the calf: shin and
# foot are either far below the hem or - heel kicked up behind - OUTSIDE the skirt, where it need not go
_UNDER_SKIRT = np.array([i < 6 for i in range(13)] * 2)


def _gore_geometry(name: str):
    hinge, out, axis = rig.gore_frame(name)
    hem = rig.SKIRT[name][1] - hinge
    length = float(np.linalg.norm(hem))
    slope = math.degrees(math.atan2(hem @ out, -hem[1]))  # how far the hanging gore flares, degrees from plumb
    reach = float(np.hypot(hinge[0], hinge[2] - rig.SKIRT_ZC))  # hinge's distance from the skirt's axis
    return hinge, out, axis, np.cross(np.array([0.0, 1.0, 0.0]), out), length, slope, reach


GORE_GEOMETRY = {name: _gore_geometry(name) for name in rig.GORES}
_G = {k: np.array([GORE_GEOMETRY[n][i] for n in rig.GORES]) for i, k in
      enumerate(("hinge", "out", "axis", "tangent", "length", "slope", "reach"))}
_TAN_HALF = math.tan(math.radians(rig.GORE_HALF))


def _fade(x):
    """0 -> 1 as x goes 0 -> 1, smooth at both ends (arrays)."""
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def _soft_max_rows(v: np.ndarray, k: float) -> np.ndarray:
    top = v.max(1, keepdims=True)
    return (top + k * np.log(np.exp((v - top) / k).sum(1, keepdims=True)))[:, 0]


def gore_needs(points: np.ndarray, radii: np.ndarray) -> np.ndarray:
    """For each of the eight gores (in rig.GORES order): the degrees it has to swing out, from hanging,
    so that none of the balls cuts through it (negative = that much room to spare).

    A gore is a strip: only so long and so wide.  A ball beyond its end, or beside it, is faded out of
    the reckoning smoothly - a term that dropped out abruptly would make the cloth jerk."""
    rel = points[None, :, :] - _G["hinge"][:, None, :]  # (8, N, 3)
    rho = (rel * _G["out"][:, None, :]).sum(-1)
    lat = np.abs((rel * _G["tangent"][:, None, :]).sum(-1))
    drop = -rel[..., 1]
    dist = np.maximum(np.hypot(rho, drop), 1e-6)
    r = (radii + CLOTH_GAP)[None, :]
    t = (lat - (_G["reach"][:, None] + np.maximum(rho, 0.0)) * _TAN_HALF) / r - 0.5  # how far beside the gore, in radii
    r_eff = r * np.sqrt(1.0 - np.clip(t, 0.0, 0.5) ** 2)  # (kept generous: half a radius wider than the strip)
    angle = np.degrees(np.arctan2(rho, drop) + np.arcsin(np.minimum(r_eff / dist, 1.0))) - _G["slope"][:, None]
    angle -= 200.0 * _fade((t - 0.5) / 0.5)  # beside the gore
    angle -= 200.0 * _fade((dist - r - _G["length"][:, None]) / (0.06 * H))  # beyond its hem
    return _soft_max_rows(np.concatenate([angle, np.full((len(angle), 1), -90.0)], 1), GORE_SOFT)


def cape_need(root: np.ndarray, points: np.ndarray, radii: np.ndarray) -> float:
    """Degrees the cape has to lean back from plumb to pass behind the balls ``points`` (pelvis frame),
    hanging from ``root``.  Balls beside the cape, above its root or below its hem fade out smoothly."""
    drop = root[1] - points[:, 1]
    gap = np.where(radii > 0, CAPE_GAP, 0.0)
    angle = np.degrees(np.arctan2(root[2] - (points[:, 2] - radii - gap), np.maximum(drop, 1e-3)))
    r = np.maximum(radii, 0.01 * H)
    angle -= 200.0 * _fade((np.abs(points[:, 0]) - rig.CAPE_HALF_WIDTH) / r)  # beside it
    angle *= 1.0 - _fade((drop - CAPE_LENGTH - radii) / (0.12 * H))  # below its hem: eases in before it gets there
    angle -= 200.0 * _fade((0.08 * H - drop) / (0.04 * H))  # level with / above its root
    return float(_soft_max_rows(np.concatenate([angle, [-90.0]])[None, :], CAPE_SOFT)[0])


CAPE_LENGTH = float(rig.CAPE[0][1] - rig.CAPE[2][1])
_UP = np.array([0.0, 1.0, 0.0])
_BACK = [list(rig.GORES).index(n) for n in ("skirtBL", "skirtB", "skirtBR")]
_CLEAR = np.array(rig.CAPE_CLEAR)


def _behind_cape(legs, swing: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Everything the cape has to hang behind: fixed points on hips and skirt, the legs, and the hems of
    the back gores wherever they have swung to."""
    pts, rad = [_CLEAR, legs[0]], [np.zeros(len(_CLEAR)), legs[1]]
    for i in _BACK:
        ang = math.radians(_G["slope"][i] + swing[i])
        d = math.sin(ang) * _G["out"][i] - math.cos(ang) * _UP
        pts.append(_G["hinge"][i] + np.array([[0.35], [0.7], [1.0]]) * _G["length"][i] * d)
        rad.append(np.full(3, 0.010 * H))
    return np.concatenate(pts), np.concatenate(rad)


_REST_LEGS = leg_points({})
GORE_REST = np.maximum(gore_needs(_REST_LEGS[0][_UNDER_SKIRT], _REST_LEGS[1][_UNDER_SKIRT]), 0.0)  # per gore, >= 0
CAPE_REST = cape_need(rig.CAPE[0], *_behind_cape(_REST_LEGS, np.zeros(len(rig.GORES))))


def drive_helpers(rots: Dict[str, np.ndarray], phase: float = 0.0, walk: float = 0.0, chest_spin: float = 0.0,
                  head_spin: float = 0.0, prev: Optional[dict] = None, dt: float = 1.0 / 24.0) -> Dict[str, np.ndarray]:
    """Set the twelve costume bones from the pose ``rots`` (in place, returned): the skirt's gores are
    pushed out by the legs, the cape hangs plumb from the shoulders and leans back behind hips and legs,
    the plume nods.  Works for ANY pose - nothing here knows about walking.

    walk, phase   optional walking sway (0..1, and the walk phase it loops with); 0 = none
    *_spin        turning speed of chest / head in degrees per cycle (~ per second): cloth and plume trail
    prev, dt      optional inertia: pass the SAME dict every frame (start with {}) and the frame time in
                  seconds.  Lifted cloth then falls back at a limited speed instead of snapping down, and
                  the turning speeds are taken from the change since the last frame when not given.
                  Without it the result depends on the pose alone (loops stay loops)."""
    eye = np.eye(3)
    legs = leg_points(rots)
    R_chest = rots.get("chest", eye)
    cp, cy, cr = rig.joint_angles("chest", R_chest)
    head_yaw = cy + rig.joint_angles("head", rots.get("head", eye))[1]
    if prev is not None and "chest_yaw" in prev and dt > 0:
        if chest_spin == 0.0:
            chest_spin = (cy - prev["chest_yaw"]) / dt
        if head_spin == 0.0:
            head_spin = (head_yaw - prev["head_yaw"]) / dt
    # skirt: each gore swings outwards about its hinge on the belt line, by what the legs under it need
    flutter = walk * math.sin(2 * TAU * phase - 1.1)
    need = gore_needs(legs[0][_UNDER_SKIRT], legs[1][_UNDER_SKIRT]) - GORE_REST
    swing = np.zeros(len(rig.GORES))
    for i, (name, az) in enumerate(rig.GORES.items()):
        a = min(soft_pos(float(need[i]), 2.0), GORE_MAX)
        a += walk * (0.8 + 0.8 * flutter * math.cos(math.radians(az)))  # the hem stirs a little with each step
        if prev is not None and "gore" in prev:
            a = max(a, prev["gore"][i] - FALL_RATE["gore"] * dt)
        swing[i] = a
        rots[name] = rig.rot_axis(_G["axis"][i], a)
    # cape: undo the chest's bend and lean and half its turn (the hips hold the cloth back), then lean back
    # as far as hips, skirt and legs demand; streams back when walking, swings out against a turn
    root = rig.WAIST + R_chest @ (rig.CAPE[0] - rig.WAIST)  # where the cape hangs from, pelvis frame
    lean = soft_pos(cape_need(root, *_behind_cape(legs, swing)) - CAPE_REST, 2.0)
    if prev is not None and "lean" in prev:
        lean = max(lean, prev["lean"] - FALL_RATE["cape"] * dt)
    lag = -0.035 * chest_spin
    plumb = rig.rot_x(-cp) @ rig.rot_z(-cr) @ rig.rot_y(-0.50 * cy)
    rots["cape"] = plumb @ rig.euler(pitch=lean + walk * (6.0 + 3.0 * math.sin(2 * TAU * phase - 1.0)), yaw=0.5 * lag,
                                     roll=walk * 2.5 * math.sin(TAU * phase - 0.8) + 0.15 * lag)
    rots["capeTip"] = rig.euler(pitch=walk * (3.0 + 4.0 * math.sin(2 * TAU * phase - 1.9)),
                                yaw=0.5 * lag, roll=walk * 3.0 * math.sin(TAU * phase - 1.6) + 0.25 * lag)
    # plume: nods with every step, leans away from a head turn
    sway_p = max(min(-0.02 * head_spin, 25.0), -25.0)
    rots["plume"] = rig.euler(pitch=walk * (3.0 + 4.0 * math.sin(2 * TAU * phase - 0.6)), roll=0.5 * sway_p)
    rots["plumeTip"] = rig.euler(pitch=walk * (2.0 + 5.0 * math.sin(2 * TAU * phase - 1.5)), roll=sway_p)
    if prev is not None:
        prev.update(gore=swing, lean=lean, chest_yaw=cy, head_yaw=head_yaw)
    return rots


# ---------------------------------------------------------------- big movements (synthetic, for testing the costume)
# NOT motion capture and not ground-accurate (no foot planting): just the joint ranges of a sprint and
# of a tucked jump, to see what the skirt, cape and sleeves do when the legs really move.
def run_rots(skel: Skeleton, phase: float):
    """A sprint-like cycle: thighs from 80 deg forward to 20 deg back, knees up to ~125 deg, arms pumping."""
    rots = {"pelvis": rig.euler(pitch=9.0, yaw=-7.0 * math.cos(TAU * phase))}
    rots["chest"] = rig.local_rot("chest", pitch=8.0, yaw=16.0 * math.cos(TAU * phase))
    rots["head"] = rig.local_rot("head", pitch=-8.0, yaw=-9.0 * math.cos(TAU * phase))
    for side, s in rig.SIDES:
        psi = phase + (0.0 if s > 0 else 0.5)
        c = math.cos(TAU * psi)  # +1: this thigh is furthest forward
        recover = max(0.0, math.sin(TAU * (psi - 0.5)))  # the leg folding up as it swings forward
        rots["thigh" + side] = rig.local_rot("thigh" + side, pitch=-30.0 - 50.0 * c, roll=s * 3.0)
        rots["shin" + side] = rig.local_rot("shin" + side, pitch=18.0 + 105.0 * recover ** 1.2 + 30.0 * max(0.0, c) ** 2)
        rots["foot" + side] = rig.local_rot("foot" + side, pitch=10.0 + 25.0 * recover)
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=-5.0 + 50.0 * c, roll=s * 14.0)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-95.0 + 15.0 * c)
    bounce = 0.02 * H * math.cos(2 * TAU * phase)
    drive_helpers(rots)
    return rots, np.array([0.0, -0.03 * H + bounce, 0.0])


def run_pose(skel: Skeleton, phase: float):
    rots, root = run_rots(skel, phase)
    return skel.world_mats(rots, root_offset=root), root


JUMP_KEYS = (  # phase, thigh pitch, knee, thigh spread, shoulder pitch, elbow, trunk pitch, root height / H
    (0.00, 0.0, 0.0, 0.0, 2.0, -8.0, 0.0, 0.00),  # standing
    (0.22, -75.0, 110.0, 6.0, 45.0, -30.0, 22.0, -0.20),  # crouch, arms back
    (0.36, -5.0, 8.0, 2.0, -150.0, -15.0, 0.0, 0.10),  # take-off, arms thrown up
    (0.55, -100.0, 125.0, 12.0, -110.0, -60.0, 10.0, 0.42),  # tucked at the top
    (0.74, -30.0, 30.0, 4.0, -60.0, -40.0, 6.0, 0.12),  # reaching for the ground
    (0.86, -70.0, 100.0, 8.0, -20.0, -50.0, 18.0, -0.18),  # landing, deep
    (1.00, 0.0, 0.0, 0.0, 2.0, -8.0, 0.0, 0.00))


def jump_rots(skel: Skeleton, phase: float):
    """A standing tuck jump: crouch, spring, knees to the chest (thighs 100 deg), land, stand up."""
    phase = phase % 1.0
    k = max(i for i, key in enumerate(JUMP_KEYS[:-1]) if key[0] <= phase)
    a, b = JUMP_KEYS[k], JUMP_KEYS[k + 1]
    w = smoothstep((phase - a[0]) / (b[0] - a[0]))
    thigh, knee, spread, arm, elbow, trunk, height = (x + (y - x) * w for x, y in zip(a[1:], b[1:]))
    rots = {"pelvis": rig.euler(pitch=0.5 * trunk), "chest": rig.local_rot("chest", pitch=0.5 * trunk)}
    for side, s in rig.SIDES:
        rots["thigh" + side] = rig.local_rot("thigh" + side, pitch=thigh, roll=s * spread)
        rots["shin" + side] = rig.local_rot("shin" + side, pitch=knee)
        rots["foot" + side] = rig.local_rot("foot" + side, pitch=min(max(-0.2 * thigh - 10.0, -15.0), 40.0))
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=arm, roll=s * 12.0)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=elbow)
    drive_helpers(rots)
    return rots, np.array([0.0, height * H, 0.0])


def jump_pose(skel: Skeleton, phase: float):
    rots, root = jump_rots(skel, phase)
    return skel.world_mats(rots, root_offset=root), root


def big_poses() -> Dict[str, Dict[str, np.ndarray]]:
    """Single poses at the edge of what running and jumping ask of the costume (helper bones driven)."""
    L = rig.local_rot
    P = {
        "thigh_100": {"thighL": L("thighL", pitch=-100), "shinL": L("shinL", pitch=120)},
        "thigh_100_spread_30": {"thighL": L("thighL", pitch=-100, roll=30), "shinL": L("shinL", pitch=110),
                                "thighR": L("thighR", roll=-30)},
        "spread_30": {"thighL": L("thighL", roll=30), "thighR": L("thighR", roll=-30)},
        "stride": {"thighL": L("thighL", pitch=-85), "shinL": L("shinL", pitch=70),
                   "thighR": L("thighR", pitch=20), "shinR": L("shinR", pitch=125)},
        "tuck": {"thighL": L("thighL", pitch=-100, roll=12), "shinL": L("shinL", pitch=130),
                 "thighR": L("thighR", pitch=-100, roll=-12), "shinR": L("shinR", pitch=130)},
        "heel_to_seat": {"thighR": L("thighR", pitch=20), "shinR": L("shinR", pitch=140)},
    }
    for rots in P.values():
        drive_helpers(rots)
    return P


# ---------------------------------------------------------------- diagnostics
def foot_world(skel: Skeleton, mats: np.ndarray, s: int) -> Dict[str, np.ndarray]:
    """World positions of the foot's key points and its heading (degrees) under a pose."""
    side = "L" if s > 0 else "R"
    Mf, Mt = mats[skel.index["foot" + side]], mats[skel.index["toe" + side]]
    pt = lambda M, p: M[:, :3] @ np.asarray(p, float) + M[:, 3]  # noqa: E731
    fwd = Mf[:, :3] @ np.array([0.0, 0.0, 1.0])
    return dict(ankle=pt(Mf, rig.ANKLE[s]), heel=pt(Mf, rig.HEEL[s]), toe=pt(Mf, rig.TOE[s]),
                toe_tip=pt(Mt, rig.TOE_TIP[s]), heading=math.degrees(math.atan2(fwd[0], fwd[2])),
                toe_heading=math.degrees(math.atan2((Mt[:, :3] @ np.array([0.0, 0.0, 1.0]))[0],
                                                    (Mt[:, :3] @ np.array([0.0, 0.0, 1.0]))[2])))

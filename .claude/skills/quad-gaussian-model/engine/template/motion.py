"""Soldier motion: walk and run loops, guard idle, turntable demo, standing pose, and the drive of the costume
helper bones.

Every ``*_rots`` function returns ``(rots, root)``: a dict of local 3x3 rotations per bone (what
``Skeleton.world_mats`` takes) and the root offset.  ``*_pose`` returns ``(mats, root)`` like the Nike
example's ``walk_pose``, ready for ``pose_splats``.

Walk and run (``Gait``) - built to look like people and to keep the feet honest:
  * a planted foot is a fixed point in the WORLD (heel first, then the whole sole, then the ball) and its
    heading never changes - the pelvis may turn above it;
  * a swinging leg follows the normative (average human) hip / knee / ankle curves from its hip, bent in
    joint angles onto where its foot leaves the floor and where it lands;
  * the pelvis height is the one at which the leg that holds the body bends its knee as the normative curve
    says (a smooth curve under that), so the legs never run out of length; its forward and sideways travel
    keeps the whole body's ZMP on the planted foot (``_balance_loop``).
Pass ``advance = STRIDE * phase`` to really travel; ``advance = 0`` walks on the spot (treadmill).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import rig  # noqa: E402
from pixelsplat.skin import Skeleton, rot_x  # noqa: E402

TAU = 2 * math.pi
H = rig.H

# ---------------------------------------------------------------- units
G_ACC = 9.81
M_PER_UNIT = 1.75 / H  # metres per world unit (1.80 units = a 1.75 m man)

# ---------------------------------------------------------------- walk parameters
# Cadence and stride of a 1.75 m man walking at 1.4 m/s: about 112 steps a minute, a 1.49 m stride (normative
# walking data, e.g. Perry & Burnfield 2010: ~110-120 steps/min, stride ~0.8-0.85 x height at this speed).
WALK_PERIOD = 60 / 60  # seconds per cycle (two steps) - 60 frames at 60 fps
WALK_SPEED_MS = 1.4
STRIDE = WALK_SPEED_MS * WALK_PERIOD / M_PER_UNIT  # distance one foot travels per cycle (two steps), world units
STANCE = 0.62  # fraction of the cycle a foot is on the ground
SPEED = STRIDE  # world units per cycle (the name the Nike example uses)
HEEL_ROCK = 0.16  # part of the stance spent rolling from the heel onto the sole (foot flat at ~10 % of the cycle)
HEEL_OFF = 0.30 / STANCE  # part of the stance after which the heel lifts (at ~30 % of the cycle: terminal stance)
PITCH_STRIKE = -16.0  # foot pitch at heel strike (toes up), degrees
PITCH_OFF = 50.0  # foot pitch at toe-off (heel up; the toes stay flat on the floor, bent at the ball)
WALK_PUSH = 0.30  # from this leg phase on the heel rises as far as the knee curve needs (terminal stance, push-off)
HEEL_RISE = 2.0  # the heel's rise goes as u^HEEL_RISE over heel-off -> toe-off (slow, then fast)
ROOT_CAP = 0.012 * H  # (root_height, the old rule) the pelvis never rides higher than this far below standing
ROOT_SOFT = 0.004 * H  # how softly the pelvis height blends between "left leg limits" and "right leg limits"
ROOT_SWAY = 0.012 * H  # sideways shift towards the planted leg (the unbalanced rule)
WALK_UNDER = 0.42  # part of the stance at which the ankle passes under the body (it lands nearer than it leaves)
MID_STANCE = WALK_UNDER * STANCE  # phase at which the left foot is under the hip
MAX_REACH = 0.995  # (root_height) legs never straighten further than this fraction of their length


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
# over its planted leg (an inverted pendulum) - so the ground would have to pull (template/qc.py,
# README "걷기 균형").  The loops below therefore choose the pelvis's forward travel so that the WHOLE
# body's centre of mass moves the way gravity allows: its ground point "ZMP" (where the floor pushes)
# stays on the planted foot, rolling from heel to ball.  For a body of height y over the ground:
#     x'' = (y'' + g) / y * (x - p)            p = the ZMP, 0 factor in flight (ballistic)
# solved once per loop on a periodic grid (a linear system); the pelvis offset that puts the centre of
# mass on that path is found by a few fixed-point steps.  The masses are de Leva's (as in qc.py).
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


def zmp_follow_flight(p: np.ndarray, c: np.ndarray, dt: float, flight: np.ndarray, acc: np.ndarray) -> np.ndarray:
    """``zmp_follow`` (no travel) where, at the ``flight`` samples, nothing pushes: there the correction cancels the
    body's own horizontal acceleration ``acc`` instead (a body in the air keeps its speed)."""
    N = len(p)
    D2 = (np.roll(np.eye(N), 1, 1) + np.roll(np.eye(N), -1, 1) - 2 * np.eye(N)) / dt ** 2
    M = D2 - np.diag(np.where(flight, 0.0, c))
    rhs = np.where(flight, -np.asarray(acc), -np.asarray(c) * np.asarray(p))
    M[0] += 1e-9  # (a pure-flight-free system is regular; with flight rows the mean is fixed by the stance rows)
    return np.linalg.lstsq(M, rhs, rcond=None)[0]


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
                 period: float = 1.0, acc_min: Optional[float] = None, smooth: float = 2e-7) -> np.ndarray:
    """A smooth periodic curve (a Fourier series with these harmonics) that stays below ``limit`` (sampled at i / N;
    inf / nan = no limit at that sample) everywhere and keeps as close under it as its smoothness allows.  A
    pelvis that rides exactly on its leg-reach limit follows the limit's corners (where the limiting leg changes) -
    a kink the eye sees and the vertical acceleration shows; this one rounds them off from below.  ``acc_max``
    bounds the vertical acceleration (world units / s^2) both ways, or only upwards when ``acc_min`` (a negative
    number: how fast it may fall) is given too.  With no limit in a stretch (a run's flight) the curve is the
    arc that falls at ``acc_min`` (a ballistic one) between its ends.

    Solved as a small quadratic programme: squared gap under the limit + ``smooth`` x squared curvature (per
    cycle^2), under the linear bounds.  (The highest curve - maximum mean - is not unique: any shape with the same
    mean that fits is as good, and a solver then returns an arbitrary one; the walk's pelvis jumped between them.)"""
    from scipy.optimize import linprog, minimize

    N = len(limit)
    ph = np.arange(N) / N
    A = _fourier_basis(ph, harmonics)
    lim = np.asarray(limit, np.float64)
    ok = np.isfinite(lim)
    D = np.zeros_like(A)  # d2/dphase2
    for j, k in enumerate(harmonics):
        w = TAU * k
        D[:, 1 + 2 * j] = -w * w * np.cos(w * ph)
        D[:, 2 + 2 * j] = -w * w * np.sin(w * ph)
    A_ub, b_ub = [A[ok]], [lim[ok] - margin]
    if acc_max is not None:  # acc_min <= d2y/dt2 <= acc_max at every sample: linear in the coefficients
        Dt = D / period ** 2
        lo = -acc_max if acc_min is None else acc_min
        hi = np.full(N, float(acc_max))
        if acc_min is not None:  # in flight it cannot be pushed up at all: it falls at least at FLIGHT_FALL x acc_min
            hi[~ok] = FLIGHT_FALL * acc_min
        A_ub += [Dt, -Dt]
        b_ub += [hi, np.full(N, -lo)]
    G, g = np.concatenate(A_ub), np.concatenate(b_ub)
    # a feasible start: the highest curve (linear programme), then the quadratic one from there
    res = linprog(-A[ok].mean(0), A_ub=G, b_ub=g, bounds=[(None, None)] * A.shape[1], method="highs")
    if not res.success:
        raise RuntimeError(f"smooth_below: {res.message}")
    Aok, target = A[ok], lim[ok] - margin
    H = 2 * (Aok.T @ Aok + smooth * D.T @ D)
    f = -2 * Aok.T @ target
    if acc_min is not None and not ok.all():  # where nothing holds it up (flight) it falls: d2y/dt2 = acc_min
        Df = D[~ok] / period ** 2
        wf = 1e-4
        H += 2 * wf * Df.T @ Df
        f += -2 * wf * Df.T @ np.full(int((~ok).sum()), acc_min)

    def obj(c):
        return 0.5 * c @ H @ c + f @ c, H @ c + f

    q = minimize(obj, res.x, jac=True, method="SLSQP",
                 constraints=[dict(type="ineq", fun=lambda c: g - G @ c, jac=lambda c: -G)],
                 options=dict(maxiter=300, ftol=1e-14))
    x = q.x if q.success and np.all(G @ q.x <= g + 1e-7) else res.x
    return x


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


# ---------------------------------------------------------------- the gaits' legs: normative joint curves
# The walk and the run are built the same way.  A foot that is down is a fixed point in the WORLD (heel, then the
# whole sole, then the ball: its heading never changes - the pelvis may turn above it); the pelvis height is
# chosen so that the leg that holds the body bends its knee as people do (the normative knee curve below, never
# straighter); a swinging leg follows the normative hip and knee curves (forward kinematics from its hip) and its
# foot the normative ankle curve, bent onto the exact place and speed it leaves the floor at and lands on by a
# smooth correction (``_quintic``: position, speed and acceleration match at both ends).  The curves are
# APPROXIMATE means read off published gait data (README "걷기·달리기 QC"): walking ~1.4 m/s - Perry & Burnfield
# (2010), Winter (2009), Kadaba et al. (1990); running ~3.5-4 m/s - Novacheck (1998), Dugan & Bhat (2005).
# Key points: (percent of the leg's cycle, 0 = its foot touches down; degrees).  hip = thigh against the pelvis,
# flexion +; knee = flexion +; ankle = dorsiflexion (toes up) +.
WALK_NORM = dict(
    hip=((0, 30), (12, 26), (30, 10), (50, -8), (56, -10), (62, -2), (75, 22), (87, 33), (100, 30)),
    knee=((0, 4), (15, 18), (40, 5), (50, 8), (62, 40), (72, 62), (85, 38), (95, 6), (100, 4)),
    ankle=((0, 0), (8, -6), (30, 5), (48, 10), (55, 5), (63, -17), (72, -8), (85, 0), (100, 0)))
RUN_NORM = dict(
    hip=((0, 38), (15, 28), (36, -5), (42, -8), (55, 10), (70, 35), (82, 47), (92, 42), (100, 38)),
    knee=((0, 20), (13, 42), (36, 20), (45, 30), (65, 95), (80, 60), (92, 25), (100, 20)),
    ankle=((0, 3), (15, 20), (36, -15), (42, -20), (55, -5), (70, 8), (85, 8), (100, 3)))


class Curve:
    """A periodic curve through (percent, value) key points: a periodic cubic spline over phase [0, 1)."""

    def __init__(self, keys):
        from scipy.interpolate import CubicSpline

        self.keys = tuple(keys)
        self._cs = CubicSpline(np.array([k[0] for k in keys], float) / 100.0, np.array([k[1] for k in keys], float),
                               bc_type="periodic")

    def __call__(self, psi: float) -> float:
        return float(self._cs(psi % 1.0))


def _quintic(t: float, p0, v0, a0, p1, v1, a1):
    """The quintic through (p0, v0, a0) at t = 0 and (p1, v1, a1) at t = 1 (value, slope, curvature in t)."""
    t2, t3 = t * t, t * t * t
    t4, t5 = t3 * t, t3 * t2
    return (p0 * (1 - 10 * t3 + 15 * t4 - 6 * t5) + v0 * (t - 6 * t3 + 8 * t4 - 3 * t5)
            + a0 * 0.5 * (t2 - 3 * t3 + 3 * t4 - t5) + p1 * (10 * t3 - 15 * t4 + 6 * t5)
            + v1 * (-4 * t3 + 7 * t4 - 3 * t5) + a1 * 0.5 * (t3 - 2 * t4 + t5))


def _d012(f, x: float, e: float = 1e-3):
    """Value, first and second derivative of f at x (central differences; f may return arrays)."""
    a, b, c = f(x - e), f(x), f(x + e)
    return b, (c - a) / (2 * e), (c - 2 * b + a) / (e * e)


def _d012_side(f, x: float, side: int, e: float = 1e-3):
    """Value, first and second derivative of f at x from one side only (side -1: samples at x, x-e, x-2e; +1: x,
    x+e, x+2e) - for a function that is only valid (or only smooth) on that side."""
    a, b, c = f(x), f(x + side * e), f(x + 2 * side * e)
    return a, side * (-3 * a + 4 * b - c) / (2 * e), (a - 2 * b + c) / (e * e)


def knee_reach(knee_deg: float) -> float:
    """Hip-to-ankle distance as a fraction of the leg's length with the knee bent ``knee_deg``."""
    l1, l2 = rig.THIGH_LEN, rig.SHIN_LEN
    return math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * math.cos(math.radians(knee_deg))) / (l1 + l2)


def const_track(dx: float = 0.0, h: float = 0.0, dz: float = 0.0):
    return lambda q: (dx, h, dz)


def balance_track(b: dict):
    """phase -> (dx, height, dz) of the pelvis along a balanced loop (``_balance_loop``'s result)."""
    return lambda q: (fourier_eval(b["dx"], b["dx_h"], q), fourier_eval(b["h"], b["h_h"], q),
                      fourier_eval(b["dz"], b["dz_h"], q))


ANKLE_DORSI = 15.0  # a planted foot's ankle never bends further up than this (the rig allows 20)
ANKLE_PLANTAR = 40.0  # ... nor further down while it pushes off (normative toe-off: ~15-20)
PUSH_PITCH_MAX = 70.0  # a foot on its ball pitches no further
SWING_CLEAR = 0.012 * H  # extra ankle height in mid swing over the normative curves, so the toes clear the floor
TOE_BEND = 59.0  # the toes bend at most this far (the rig allows 60)
TO_ACC = 0.0  # ... and this fraction of its acceleration difference
LAND_DAMPING = 0.02  # (a nearly straight knee cannot be asked for much: the inverse is damped this much)
LAND_AT_REST = True  # a foot lands with no speed at all (False: it may still be coming down)
PITCH_CARRY = 200.0  # degrees per cycle: at most this much of the foot's turning speed at toe-off is carried into the swing
TO_CARRY = 1e9  # degrees per cycle: at most this much of a leg's speed difference at toe-off is carried into the swing
HIP_EXTENSION = 17.0  # a swinging thigh goes no further back than this behind the pelvis (the rig allows 20)


def _toe_flat(pitch: float) -> float:
    """Toe hinge of a foot pitched ``pitch`` on its ball: the toes flat on the floor, eased onto the hinge's limit
    (a foot pitched further - the last frame or two before it leaves - dips its toe tips a few mm)."""
    return -_soft_clamp(pitch, -1e9, TOE_BEND, 3.0)


class Gait:
    """One gait's feet and legs over a leg phase psi in [0, 1) (0 = touchdown), in the foot's PLANT frame: a
    world-fixed frame whose origin is where that foot's rest position stands while it is down (z forward).

    period, speed_ms   seconds per cycle (two steps) and metres per second -> ``stride`` (world units per cycle)
    stance             fraction of the cycle a foot is down
    strike             foot pitch at touchdown (degrees, toes up -); it rolls flat by ``rock`` x the stance
    heel_off           part of the stance after which the heel lifts; the foot pitches to ``pitch_off`` at toe-off
                       about the ball (pitch ~ u^3: the heel rises slowly, then fast - it leaves the floor moving)
    under              part of the stance at which the ankle is under the body's even glide
    narrow             feet this much nearer the midline than the hips (world units)
    tilt               the pelvis's forward tilt (degrees): thigh against the world = hip curve - tilt
    hold               leg phase up to which a planted leg holds the body up (its knee follows the knee curve)
    pelvis             phase -> pelvis rotation"""

    def __init__(self, name, period, speed_ms, stance, strike, rock, heel_off, pitch_off, under, narrow, tilt, norm,
                 hold, pelvis, toe_relax=0.5, blend=0.35, rise=3.0, push=1.0, pitch_blend=0.12, knee_min=0.0, push_knee=90.0):
        self.name, self.period, self.speed_ms, self.stance = name, period, speed_ms, stance
        self.stride = speed_ms * period / M_PER_UNIT
        self.strike, self.rock, self.heel_off, self.pitch_off = strike, rock, heel_off, pitch_off
        self.under, self.narrow, self.tilt, self.hold, self.pelvis = under, narrow, tilt, hold, pelvis
        self.toe_relax, self.blend, self.rise, self.push, self.pitch_blend = toe_relax, blend, rise, push, pitch_blend
        self.push_knee = push_knee  # (holding_limits) the knee bend a leg pushing off is held to at most
        self.knee_min = knee_min  # the leg that holds the body keeps at least this bend (a straight knee is IK's singular point)
        self.norm = norm
        self.hip, self.knee, self.ankle = Curve(norm["hip"]), Curve(norm["knee"]), Curve(norm["ankle"])

    def origin_z(self, psi: float) -> float:
        """z of the plant frame's origin relative to the body's even glide (unwrapped psi: a swing that started
        in this cycle is still measured from the plant it left)."""
        return self.stride * (self.under * self.stance - psi)

    def _design_pitch(self, psi: float) -> float:
        t = psi / self.stance
        if t < self.rock:
            return self.strike * (1 - smootherstep(t / self.rock))
        if t < self.heel_off:
            return 0.0
        u = (t - self.heel_off) / (1 - self.heel_off)
        return self.pitch_off * (smootherstep(u) if self.rise == 0 else u ** self.rise)

    def push_target(self, psi: float) -> float:
        """The knee bend a leg that pushes off is held to: the knee curve, no straighter than ``knee_min`` and (eased)
        no more bent than ``push_knee`` - the rest of its bend comes in the swing."""
        k = soft_max([self.knee(psi), self.knee_min], 1.0)
        return soft_min([k, self.push_knee], 2.0)

    def _push_pitch(self, s: int, psi: float, track) -> float:
        """The pitch about the ball that bends the knee as the knee curve says, for the hip where ``track`` has it."""
        A0, T0 = rig.ANKLE[s], rig.TOE[s]
        H = self.hip_plant(s, psi, track)
        d = knee_reach(self.push_target(psi)) * (rig.THIGH_LEN + rig.SHIN_LEN)

        def f(p):
            return float(np.linalg.norm(H - _about(T0, T0, p, A0))) - d

        lo, hi = 0.0, PUSH_PITCH_MAX
        if f(lo) <= 0.0:
            return lo
        if f(hi) >= 0.0:
            return hi
        from scipy.optimize import brentq

        return brentq(f, lo, hi, xtol=1e-9)

    def _pitch(self, s: int, psi: float, track) -> float:
        """Foot pitch while it is down (and its continuation past toe-off): the designed roll, and from ``push`` x
        the stance on, blended into the pitch at which the knee follows the knee curve (push-off: the heel rises
        as far as the knee bending says)."""
        p = self._design_pitch(psi)
        if track is None or psi < self.heel_off * self.stance:
            return p
        if psi > self.push * self.stance:
            w = smootherstep((psi / self.stance - self.push) / (1.0 - self.push))
            p += w * (self._push_pitch(s, psi, track) - p)
        # the ankle stays inside what it can do: dorsiflexion <= ANKLE_DORSI, plantarflexion <= ANKLE_PLANTAR (eased)
        pl = self.plantar(s, psi, p, track)
        w = smootherstep((psi / self.stance - self.heel_off) / 0.1)  # (eased in as the heel starts to lift)
        return p + w * (_soft_clamp(pl, -ANKLE_DORSI, ANKLE_PLANTAR, 4.0) - pl)

    def plantar(self, s: int, psi: float, p: float, track) -> float:
        """Plantarflexion (degrees, + = toes down against the shank) of a foot pitched ``p`` about its ball."""
        H = self.hip_plant(s, psi, track)
        A = _about(rig.TOE[s], rig.TOE[s], p, rig.ANKLE[s])
        a = self.leg_angles(np.array([A[1] - H[1], A[2] - H[2]]))
        return p + (a[0] - a[1])

    def _stance_ankle(self, s: int, psi: float, track) -> np.ndarray:
        """Absolute plant-frame ankle of a foot that is down (the toe formula carries on past toe-off)."""
        A0, T0, Hc = rig.ANKLE[s], rig.TOE[s], rig.HEEL[s]
        t, p = psi / self.stance, self._pitch(s, psi, track)
        if t < self.rock:
            return _about(Hc, Hc, p, A0)
        if t < self.heel_off:
            return A0.copy()
        return _about(T0, T0, p, A0)

    def hip_plant(self, s: int, psi: float, track) -> np.ndarray:
        q = psi - (0.0 if s > 0 else 0.5)  # the body's phase
        dx, h, dz = track(q)
        hip = self.pelvis(q) @ (rig.HIP[s] - rig.PELVIS) + rig.PELVIS + np.array([dx, h, dz])
        return hip - np.array([-s * self.narrow, 0.0, self.origin_z(psi)])

    def norm_angles(self, psi: float) -> np.ndarray:
        """[thigh against the world, knee] (degrees) on the normative curves."""
        return np.array([self.hip(psi) - self.tilt, self.knee(psi)])

    @staticmethod
    def leg_angles(rel) -> np.ndarray:
        """[thigh against the world, knee] (degrees) of a leg whose ankle is ``rel`` (y, z) from its hip."""
        l1, l2 = rig.THIGH_LEN, rig.SHIN_LEN
        d = min(math.hypot(rel[0], rel[1]), (l1 + l2) * 0.999999)
        phi = math.atan2(rel[1], -rel[0])  # the hip-ankle line, forward of straight down
        beta = math.acos(max(-1.0, min(1.0, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))))
        inner = math.acos(max(-1.0, min(1.0, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))))
        return np.degrees([phi + beta, math.pi - inner])

    @staticmethod
    def leg_point(ang) -> np.ndarray:
        """(y, z) of the ankle from the hip for [thigh, knee] angles (degrees)."""
        a, k = math.radians(ang[0]), math.radians(ang[1])
        l1, l2 = rig.THIGH_LEN, rig.SHIN_LEN
        return np.array([-l1 * math.cos(a) - l2 * math.cos(a - k), l1 * math.sin(a) + l2 * math.sin(a - k)])

    def strike_ankle(self, s: int) -> np.ndarray:
        A0, Hc = rig.ANKLE[s], rig.HEEL[s]
        return _about(Hc, Hc, self.strike, A0) + np.array([0.0, 0.0, self.stride])

    def _swing_ends(self, s: int, track):
        """What a swing has to join, in joint angles [thigh against the world, knee]: at toe-off the leg's own
        angles with their speed and acceleration (the foot rolling over its ball); at touchdown the angles that
        put the ankle on its next plant and the speeds that keep it AT REST there while the hip moves on (a
        damped inverse of the leg's Jacobian: a nearly straight knee cannot be asked for much)."""
        st = self.stance

        def rel(ankle, x):
            h = self.hip_plant(s, x, track)
            return self.leg_angles(np.array([ankle[1] - h[1], ankle[2] - h[2]]))

        a0 = _d012_side(lambda x: rel(self._stance_ankle(s, x, track), x), st, -1)  # (the stance side only)
        land = self.strike_ankle(s)
        a1 = rel(land, 1.0)
        _, hv, _ = _d012(lambda x: self.hip_plant(s, x, track)[1:], 1.0)
        e = 1e-3
        J = np.stack([(self.leg_point(a1 + e * np.eye(2)[k]) - self.leg_point(a1 - e * np.eye(2)[k])) / (2 * e)
                      for k in range(2)], 1)
        n1 = _d012(self.norm_angles, 1.0)
        # the smallest change of the normative joint speeds that stops the ankle's FORWARD travel; downwards it may
        # still be moving as it meets the floor (the foot is set down, it does not slide)
        if LAND_AT_REST:  # the ankle comes to rest: a damped inverse of the Jacobian (a straight knee gives little)
            lam = LAND_DAMPING * float(np.trace(J.T @ J))
            w1 = n1[1] + np.linalg.solve(J.T @ J + lam * np.eye(2), J.T @ (-hv - J @ n1[1]))
        else:
            Jz = J[1]
            w1 = n1[1] + Jz * (-hv[1] - Jz @ n1[1]) / float(Jz @ Jz)
        return a0, _d012(self.norm_angles, st), a1, w1, n1

    def swing_angles(self, s: int, psi: float, track, ends=None) -> np.ndarray:
        """[thigh, knee] of a swinging leg: the normative curves plus corrections in joint angles (so the leg never
        overreaches): the difference in angle at toe-off and at touchdown faded across the swing, and the
        difference in speed (and acceleration) faded out over the first / last ``self.blend`` of it.  The knee is
        kept a little bent."""
        st, D, W = self.stance, 1.0 - self.stance, self.blend
        a0, n0, a1, w1, n1 = self._swing_ends(s, track) if ends is None else ends
        t = (psi - st) / D
        ang = self.norm_angles(psi) + _quintic(t, 0.0, 0.0, 0.0, a1 - n1[0], 0.0, 0.0)
        if t < W:  # (a foot that leaves the floor jerks the leg's speeds: only so much of a difference is carried on)
            dv = np.clip(a0[1] - n0[1], -TO_CARRY, TO_CARRY)
            ang += _quintic(t / W, a0[0] - n0[0], dv * D * W, (a0[2] - n0[2]) * (D * W) ** 2 * TO_ACC, 0.0, 0.0, 0.0)
        if t > 1.0 - W:
            ang += _quintic((t - 1.0 + W) / W, 0.0, 0.0, 0.0, 0.0, (w1 - n1[1]) * D * W, 0.0)
        ang[1] = 0.5 + soft_pos(ang[1] - 0.5, 3.0)
        lo = min(-HIP_EXTENSION - self.tilt, a0[0][0] - 6.0)  # (never at toe-off itself: the leg leaves as it is)
        ang[0] = lo + soft_pos(ang[0] - lo, 4.0)
        return ang

    def foot(self, s: int, psi: float, track) -> Dict[str, object]:
        """Ankle (offset from the rest ankle, plant frame), foot pitch, toe-hinge angle (degrees, + = toes down)
        and which point is pinned to the floor: "heel", "sole", "toe" or None (swing)."""
        psi = psi % 1.0
        A0 = rig.ANKLE[s]
        st = self.stance
        if psi < st:
            t, p = psi / st, self._pitch(s, psi, track)
            contact = "heel" if t < self.rock else "sole" if t < self.heel_off else "toe"
            return dict(ankle=self._stance_ankle(s, psi, track) - A0, pitch=p, toe=_toe_flat(p) if contact == "toe" else 0.0,
                        contact=contact)
        D, W = 1.0 - st, self.blend
        t = (psi - st) / D
        ends = self._swing_ends(s, track)

        def base_pitch(x):  # the normative ankle angle under the leg's own shank
            ang = self.swing_angles(s, x, track, ends)
            return -(ang[0] - ang[1]) - self.ankle(x)

        ang = self.swing_angles(s, psi, track, ends)
        y, z = self.hip_plant(s, psi, track)[1:] + self.leg_point(ang)
        y += SWING_CLEAR * math.sin(math.pi * t ** 0.5) ** 2  # (the curves are a mean; this foot is a little bigger)
        # the foot's pitch joins the one it leaves the floor with (value, speed, acceleration) and lands with (value,
        # at rest)
        r0, q0 = _d012_side(lambda x: self._pitch(s, x, track), st, -1), _d012_side(base_pitch, st, 1)
        q1 = _d012_side(base_pitch, 1.0, -1)
        pitch = base_pitch(psi) + _quintic(t, r0[0] - q0[0], 0.0, 0.0, self.strike - q1[0], 0.0, 0.0)
        Wp = self.pitch_blend  # (shorter: a foot leaving the floor turns fast, and it should not carry that on)
        if t < Wp:
            pitch += _quintic(t / Wp, 0.0, float(np.clip(r0[1] - q0[1], -PITCH_CARRY, PITCH_CARRY)) * D * Wp, 0.0,
                              0.0, 0.0, 0.0)
        if t > 1.0 - W:
            pitch += _quintic((t - 1.0 + W) / W, 0.0, 0.0, 0.0, 0.0, -q1[1] * D * W, 0.0)
        # the toes straighten out from flat-on-the-floor (cubic: leaving at the speed the foot was turning)
        uu = t / self.toe_relax
        toe = 0.0
        if uu < 1.0:
            t0, t1 = _toe_flat(r0[0]), _toe_flat(r0[0] + 1e-3)
            rate = q0[1] + float(np.clip(r0[1] - q0[1], -PITCH_CARRY, PITCH_CARRY))  # (the swing's own start)
            m0 = (t1 - t0) / 1e-3 * rate * D * self.toe_relax
            toe = t0 * (2 * uu ** 3 - 3 * uu ** 2 + 1) + m0 * (uu ** 3 - 2 * uu ** 2 + uu)
        return dict(ankle=np.array([0.0, y - A0[1], z - A0[2]]), pitch=float(pitch), toe=toe, contact=None)

    def holding_limits(self, samples, free_reach: Optional[float] = None) -> np.ndarray:
        """Per sample (an ``info`` of the core): the highest pelvis offset at which the leg that holds the body
        (leg phase < ``hold``) bends its knee no less than the knee curve says with its foot as designed (the
        push-off pitch follows the hip; the hip must not follow it), and a leg that pushes off can still bend its
        knee as the curve says with its heel up as far as it goes.  ``free_reach``: any other planted leg reaches
        its ankle with this fraction of its length (None: no limit).  inf where no foot is down."""
        out = []
        for info in samples:
            Rp, rxz, ank = info["_limits"]
            best = math.inf
            for side, s in rig.SIDES:
                if info[side]["contact"] is None:
                    continue
                psi = info[side]["psi"]
                if psi > self.push * self.stance:
                    a = info[side]["origin"] + _about(rig.TOE[s], rig.TOE[s], PUSH_PITCH_MAX - 5.0, rig.ANKLE[s])
                    best = min(best, leg_limits(Rp, rxz, {s: a}, knee_reach(self.push_target(psi)))[s])
                if psi >= self.hold and free_reach is None:
                    continue
                r = knee_reach(soft_max([self.knee(psi), self.knee_min], 1.0)) if psi < self.hold else free_reach
                a = info[side]["origin"] + self._stance_ankle(s, psi, None)
                best = min(best, leg_limits(Rp, rxz, {s: a}, r)[s])
            out.append(best)
        return np.array(out)


def _place_feet(g: Gait, phase: float, advance: float, track):
    feet, ankles = {}, {}
    for side, s in rig.SIDES:
        psi = (phase + (0.0 if s > 0 else 0.5)) % 1.0
        f = g.foot(s, psi, track)
        origin = np.array([-s * g.narrow, 0.0, advance + g.origin_z(psi)])  # plant frame -> world
        feet[s], ankles[s] = (psi, f, origin), rig.ANKLE[s] + origin + f["ankle"]
    return feet, ankles


def _soft_clamp(x: float, lo: float, hi: float, eps: float) -> float:
    """x kept inside [lo, hi], bending smoothly onto the bound over the last ``eps`` (degrees)."""
    x = lo + soft_pos(x - lo, eps)
    return hi - soft_pos(hi - x, eps)


def _legs(rots, R_pelvis, root, feet, ankles, fwd, info):
    """Two-bone IK onto the ankles; feet turned by their world pitch (a swinging foot eased inside its range)."""
    to_world = _pelvis_world(R_pelvis, root)
    for side, s in rig.SIDES:
        psi, f, origin = feet[s]
        W_thigh, W_shin, reach = leg_ik(to_world(rig.HIP[s]), ankles[s], fwd, s)
        pitch = f["pitch"]
        if f["contact"] is None:  # in the air the ankle keeps inside its range, eased (no stop at the limit)
            (lo, hi), _, _ = rig.limits("foot" + side)
            local = rig.joint_angles("foot" + side, W_shin.T @ rot_x(pitch))[0]
            pitch += _soft_clamp(local, lo + 2.0, hi - 2.0, 6.0) - local
        W_foot = rot_x(pitch)  # pure pitch in the world: the foot's heading never changes
        rots["thigh" + side] = R_pelvis.T @ W_thigh
        rots["shin" + side] = W_thigh.T @ W_shin
        rots["foot" + side] = W_shin.T @ W_foot
        rots["toe" + side] = rig.local_rot("toe" + side, pitch=f["toe"])
        if info is not None:
            info[side] = dict(psi=psi, contact=f["contact"], ankle=ankles[s], reach=reach, pitch=f["pitch"],
                              origin=origin)


# ---------------------------------------------------------------- the walk
WALK_TILT = 2.0  # the pelvis's forward tilt while walking (degrees)


def _walk_pelvis(phase: float) -> np.ndarray:
    c1 = math.cos(TAU * phase)  # +1 when the left heel strikes (left leg forward)
    over = math.cos(TAU * (phase - MID_STANCE))  # +1 when the body is over the left foot
    return rig.euler(pitch=WALK_TILT, yaw=-5.0 * c1, roll=4.0 * over)  # the leading hip comes forward; the swing side drops


WALK = Gait("walk", WALK_PERIOD, WALK_SPEED_MS, STANCE, PITCH_STRIKE, HEEL_ROCK, HEEL_OFF, PITCH_OFF, WALK_UNDER, 0.0,
            WALK_TILT, WALK_NORM, hold=0.5, pelvis=_walk_pelvis, rise=HEEL_RISE,
            push=WALK_PUSH / STANCE, knee_min=10.0, push_knee=20.0)


def _walk_core(phase: float, advance: float = 0.0, dz: float = 0.0, height: Optional[float] = None,
               info: Optional[dict] = None, helpers: bool = True, dx: Optional[float] = None, track=None):
    """The walk pose with the pelvis ``dz`` ahead of its even glide, ``dx`` to the side (None = the old
    sway, ROOT_SWAY) and at ``height`` (None = the old rule: as high as both legs allow, ``root_height``).
    ``track`` (phase -> (dx, height, dz)) is where the pelvis is at the other phases: a swinging leg hangs from
    its hip.  ``walk_rots`` passes the balanced values."""
    c1 = math.cos(TAU * phase)  # +1 when the left heel strikes (left leg forward)
    over = math.cos(TAU * (phase - MID_STANCE))  # +1 when the body is over the left foot
    bob = math.cos(2 * TAU * (phase - MID_STANCE))  # +1 over either foot, -1 with both feet down
    yaw_p = -5.0 * c1
    R_pelvis = _walk_pelvis(phase)
    sway = ROOT_SWAY * over if dx is None else dx
    if track is None:
        track = const_track(sway, -0.02 * H if height is None else height, dz)
    feet, ankles = _place_feet(WALK, phase, advance, track)
    if height is None:
        height = root_height(R_pelvis, (sway, advance + dz), ankles)
    root = np.array([sway, height, advance + dz])
    rots = {"pelvis": R_pelvis}
    # trunk: counter-turn at the waist turntable, shoulders stay level, head keeps looking ahead
    chest_yaw = 3.0 * c1  # world heading of the chest
    rots["chest"] = rig.local_rot("chest", pitch=2.5 + 1.0 * bob, yaw=chest_yaw - yaw_p, roll=-2.4 * over)
    rots["neck"] = rig.local_rot("neck", pitch=-3.0 - 1.0 * bob, roll=-0.4 * over)
    rots["head"] = rig.local_rot("head", pitch=-1.5, yaw=-chest_yaw)
    fwd = rig.euler(yaw=0.5 * yaw_p) @ np.array([0.0, 0.0, 1.0])  # knees point between hips and feet
    _legs(rots, R_pelvis, root, feet, ankles, fwd, info)
    # arms swing against the legs (left arm back when the left leg is forward): shoulder ~18 deg back to ~12
    # forward, elbow ~17 -> 38 deg bent (more when the arm is in front)
    for side, s in rig.SIDES:
        sw = c1 * s
        rots["clav" + side] = rig.local_rot("clav" + side, yaw=-s * 2.0 * sw)
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=3.0 + 15.0 * sw, roll=s * 9.0)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-(27.5 - 10.5 * sw), yaw=s * 8.0)
        rots["hand" + side] = rig.local_rot("hand" + side, pitch=-6.0)
    if info is not None:
        info["_limits"] = (R_pelvis, (sway, advance + dz), ankles)
    if helpers:
        drive_helpers(rots, phase=phase, walk=1.0)
    return rots, root


# the walk's balanced pelvis track (see "balance of a gait" above)
_WALK_DZ_H = (2, 4, 6, 8)  # harmonics of the forward offset (it repeats every step: even only)
_WALK_DX_H = (1, 3, 5)  # ... of the sideways sway (it changes sides every step: odd only)
ZMP_INSET = 0.008 * H  # the floor pushes a little inside the ankle line (the arch side), world units
ZMP_SHIFT = 0.02  # ... and the whole track sits this far forward (world units): see README "걷기·달리기 QC"
ZMP_FROM, ZMP_TO, ZMP_EASE = 0.25, 1.3, 3.0  # the walk's ZMP rolls from this far from heel to ball (fractions) to this far (under the toes)
_WALK_H_H = (2, 4, 6, 8, 10, 12)  # ... and of the pelvis height
WALK_REACH = 0.999  # a planted leg that does not hold the body may straighten to this fraction of its length
WALK_PELVIS_ACC = 0.6 * G_ACC / M_PER_UNIT  # the pelvis never rises or sinks faster than this (world units / s^2)


def walk_zmp_ref(phase: float) -> np.ndarray:
    """Where the floor should push ([x, z], world units, advance = STRIDE * phase): on the planted foot,
    rolling from a quarter of the way from heel to ball, to the ball; in double support from the trailing
    ball to the leading foot."""
    d = STANCE - 0.5  # double support at the start of each half cycle
    S = WALK.stride

    def foot(origin, s, u):
        heel, ball = origin + rig.HEEL[s][2], origin + rig.TOE[s][2]
        return np.array([rig.ANKLE[s][0] - s * ZMP_INSET, heel + (ZMP_FROM + (ZMP_TO - ZMP_FROM) * (1 - (1 - u) ** ZMP_EASE)) * (ball - heel) + ZMP_SHIFT])

    ph = phase % 1.0
    cyc = S * math.floor(phase)
    zL = S * MID_STANCE + cyc
    if ph < d:  # right ball -> left foot
        return foot(S * (MID_STANCE - 0.5) + cyc, -1, 1.0) * (1 - ph / d) + foot(zL, 1, 0.0) * (ph / d)
    if ph < 0.5:
        return foot(zL, 1, (ph - d) / (0.5 - d))
    zR = S * (MID_STANCE + 0.5) + cyc
    if ph < 0.5 + d:
        u = (ph - 0.5) / d
        return foot(zL, 1, 1.0) * (1 - u) + foot(zR, -1, 0.0) * u
    return foot(zR, -1, (ph - 0.5 - d) / (0.5 - d))


def _balance_loop(core, zmp_ref, travel: float, period: float, dz_h, h_h, height_fn, h0: float, n: int = 120,
                  rounds: int = 6, dx_h=(1, 3, 5), relax: float = 1.0):
    """Shared by the walk and the run: the pelvis's forward offset (Fourier coefficients over the phase) that
    puts the centre of mass on the balanced path, its sideways sway likewise, and its height
    (``height_fn(phases, infos)`` -> coefficients).  Each round poses the loop on the previous round's track."""
    ph = np.arange(n) / n
    dt = period / n
    dz = np.zeros(n)
    dx = np.zeros(n)
    hgt = np.full(n, float(h0))
    out: dict = dict(dz_h=dz_h, h_h=h_h, dx_h=dx_h)
    track = const_track(0.0, float(h0), 0.0)
    for r in range(rounds):
        com = np.zeros((n, 3))
        seg = np.zeros((n, len(_COM[0]), 3))
        infos = []
        for i, f in enumerate(ph):
            info: dict = {}
            rots, root = core(f, travel * f, dz[i], hgt[i], info=info, helpers=False, dx=dx[i], track=track)
            mats = rig.SKELETON.world_mats(rots, root_offset=root)
            com[i] = com_of(mats)
            seg[i] = mass_points(mats)
            infos.append(info)
        y = (com[:, 1] - rig.GROUND) * M_PER_UNIT
        c = (periodic_d2(y, dt) + G_ACC) / y
        c = np.maximum(c, 0.0)
        flight = np.array([all(inf[sd]["contact"] is None for sd in ("L", "R")) for inf in infos])
        c[flight] = 0.0  # flight: nothing pushes
        p = np.array([zmp_ref(f) for f in ph])
        # the whole body moved by d(t) moves the ZMP by d - (y / (y'' + g)) d'': the correction that puts the
        # multi-body ZMP (swinging limbs included, not just the centre of mass) on the reference
        z0 = multibody_zmp(seg, dt, travel=travel)
        if flight.any():  # in the air the centre of mass keeps its speed: its own acceleration is taken out
            cz = (com - np.outer(travel * ph, [0.0, 0.0, 1.0])) * M_PER_UNIT
            err = zmp_follow_flight(p[:, 1] - z0[:, 1], c, dt, flight, periodic_d2(cz[:, 2], dt) / M_PER_UNIT)
            err_x = zmp_follow_flight(p[:, 0] - z0[:, 0], c, dt, flight, periodic_d2(cz[:, 0], dt) / M_PER_UNIT)
        else:
            err = zmp_follow(p[:, 1] - z0[:, 1], c, dt, 0.0)
            err_x = zmp_follow(p[:, 0] - z0[:, 0], c, dt, 0.0)
        if DEBUG_BALANCE:
            print("round", float(np.abs(err).max()), float(np.abs(err_x).max()), float(np.ptp(hgt)))
        out["dz"] = fourier_fit(dz + relax * err, dz_h)
        dz = _fourier_basis(ph, dz_h) @ out["dz"]
        out["dx"] = fourier_fit(dx + relax * err_x, dx_h)
        dx = _fourier_basis(ph, dx_h) @ out["dx"]
        # the height for the new forward / sideways offsets (a planted ankle does not depend on them)
        for i, inf in enumerate(infos):
            Rp, _, ank = inf["_limits"]
            inf["_limits"] = (Rp, (dx[i], travel * ph[i] + dz[i]), ank)
        h_new = height_fn(ph, infos)
        out["h"] = h_new if "h" not in out or r == rounds - 1 else 0.5 * (out["h"] + h_new)
        hgt = _fourier_basis(ph, h_h) @ out["h"]
        track = balance_track(out)
    out.update(period=period, travel=travel, n=n, com_err=float(max(np.abs(err).max(), np.abs(err_x).max())))
    return out


_BALANCE_CACHE: Dict[tuple, dict] = {}
DEBUG_BALANCE = False


def walk_balance(period: float = WALK_PERIOD) -> dict:
    """The walk's balanced pelvis track (computed once per period, a few seconds): its height is the highest smooth
    curve at which the leg that holds the body bends its knee as the knee curve says (never straighter)."""
    key = ("walk", round(float(period), 6), STRIDE, STANCE)
    if key not in _BALANCE_CACHE:
        def height(ph, infos):
            lim = WALK.holding_limits(infos, None)
            return smooth_below(lim, _WALK_H_H, 0.0005 * H, WALK_PELVIS_ACC, period)

        _BALANCE_CACHE[key] = _balance_loop(_walk_core, walk_zmp_ref, STRIDE, period, _WALK_DZ_H, _WALK_H_H, height,
                                            -0.02 * H, dx_h=_WALK_DX_H, rounds=10, relax=0.4)
    return _BALANCE_CACHE[key]


def walk_rots(skel: Skeleton, phase: float, advance: float = 0.0, info: Optional[dict] = None):
    """Local rotations + root offset for walk phase in [0,1).  ``info`` (optional dict) receives the
    world targets of both feet and the leg reach, for tests.  The pelvis follows ``walk_balance``: it
    slows while it rises over the planted leg and gains speed again as it falls onto the next one, and its
    height lets the holding knee bend as a person's does (README "걷기 균형", "걷기·달리기 QC")."""
    b = walk_balance()
    tr = balance_track(b)
    dx, h, dz = tr(phase)
    return _walk_core(phase, advance, dz, h, info, dx=dx, track=tr)


def walk_pose(skel: Skeleton, phase: float, advance: float = 0.0):
    """(B,3,4) rest->posed matrices + root offset, same call as the Nike example's walk_pose."""
    rots, root = walk_rots(skel, phase, advance)
    return skel.world_mats(rots, root_offset=root), root


# ---------------------------------------------------------------- run loop (a run with a flight phase)
# Built like the walk (``Gait``): a planted foot lands on the outer heel / midfoot, rolls flat and pushes off
# from the ball; the swinging leg follows the normative running curves; the pelvis height lets the stance knee
# bend as a runner's does (~20 deg at touchdown, ~42 at mid-stance) and in flight it is the highest arc that
# falls no faster than RUN_BOUNCE x gravity - a ballistic arc; forward / sideways travel balanced like the walk's.
RUN_PERIOD = 40 / 60  # seconds per cycle (two steps): 180 steps a minute
RUN_SPEED_MS = 3.75  # metres per second
RUN_STRIDE = RUN_SPEED_MS * RUN_PERIOD / M_PER_UNIT  # world units per cycle (2.5 m)
RUN_STANCE = 0.35  # fraction of the cycle a foot is down (0.233 s); each step has 0.15 x 0.667 s = 0.1 s of flight
RUN_UNDER = 0.42  # the ankle passes under the body's glide at this part of the stance (lands closer than it leaves)
RUN_MID = RUN_UNDER * RUN_STANCE
RUN_STRIKE = -10.0  # foot pitch at touchdown (degrees, toes up: lands on the outer heel / midfoot)
RUN_ROLL = 0.18  # part of the stance spent rolling flat
RUN_HEEL_OFF = 0.30  # part of the stance after which the heel lifts
RUN_PITCH_OFF = 60.0  # foot pitch at toe-off (as designed: from RUN_PUSH on the knee curve decides it)
RUN_PUSH = 0.6  # from this part of the stance on, the heel rises as far as the knee curve needs (push-off)
RUN_NARROW = 0.018 * H  # runners put their feet nearer the midline than walkers
RUN_TILT = 8.0  # the pelvis's forward tilt
FLIGHT_FALL = 0.7  # (smooth_below) in flight the pelvis falls at least this fraction of RUN_BOUNCE x g
RUN_BOUNCE = 0.9  # in flight the pelvis falls at most this fraction of g (the legs swing up and down under it)
RUN_PELVIS_UP = 2.5 * G_ACC / M_PER_UNIT  # ... and is pushed up at most this hard in stance (world units / s^2)
RUN_REACH = 0.999
_RUN_DZ_H = (2, 4, 6, 8)
_RUN_DX_H = (1, 3, 5)
_RUN_H_H = (2, 4, 6, 8, 10, 12)


def _run_pelvis(phase: float) -> np.ndarray:
    c1 = math.cos(TAU * phase)
    over = math.cos(TAU * (phase - RUN_MID))
    return rig.euler(pitch=RUN_TILT, yaw=-8.0 * c1, roll=4.0 * over)


RUN = Gait("run", RUN_PERIOD, RUN_SPEED_MS, RUN_STANCE, RUN_STRIKE, RUN_ROLL, RUN_HEEL_OFF, RUN_PITCH_OFF, RUN_UNDER,
           RUN_NARROW, RUN_TILT, RUN_NORM, hold=RUN_STANCE, pelvis=_run_pelvis, toe_relax=0.4,
           rise=2.0, push=RUN_PUSH)


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
                             heel + (0.35 + 0.85 * (1 - (1 - u / RUN_STANCE) ** 2)) * (ball - heel)])
    return np.array([0.0, RUN_STRIDE * phase])  # flight: not used (nothing pushes)


def _run_core(phase: float, advance: float = 0.0, dz: float = 0.0, height: Optional[float] = None,
              info: Optional[dict] = None, helpers: bool = True, dx: Optional[float] = None, track=None):
    c1 = math.cos(TAU * phase)  # +1 when the left foot touches down (left leg forward)
    over = math.cos(TAU * (phase - RUN_MID))
    bob = math.cos(2 * TAU * (phase - RUN_MID))
    yaw_p = -8.0 * c1
    R_pelvis = _run_pelvis(phase)
    sway = 0.0 if dx is None else dx
    if track is None:
        track = const_track(sway, -0.05 * H if height is None else height, dz)
    feet, ankles = _place_feet(RUN, phase, advance, track)
    if height is None:
        height = root_height(R_pelvis, (sway, advance + dz), ankles)
    root = np.array([sway, height, advance + dz])
    rots = {"pelvis": R_pelvis}
    chest_yaw = 9.0 * c1  # the shoulders turn against the hips
    rots["chest"] = rig.local_rot("chest", pitch=3.5 + 1.5 * bob, yaw=chest_yaw - yaw_p, roll=-2.5 * over)
    rots["neck"] = rig.local_rot("neck", pitch=-4.0 - 1.5 * bob, roll=-0.5 * over)
    rots["head"] = rig.local_rot("head", pitch=-4.0, yaw=-chest_yaw)
    fwd = rig.euler(yaw=0.5 * yaw_p) @ np.array([0.0, 0.0, 1.0])
    _legs(rots, R_pelvis, root, feet, ankles, fwd, info)
    for side, s in rig.SIDES:  # arms pump against the legs, driven back more than forward, elbows near a right angle
        sw = c1 * s
        rots["clav" + side] = rig.local_rot("clav" + side, yaw=-s * 4.0 * sw)
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=12.5 + 27.5 * sw, roll=s * 10.0)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-(85.0 - 12.0 * sw), yaw=s * 10.0)
        rots["hand" + side] = rig.local_rot("hand" + side, pitch=-10.0)
    if info is not None:
        info["_limits"] = (R_pelvis, (sway, advance + dz), ankles)
    if helpers:
        drive_helpers(rots, phase=phase, walk=1.0)
    return rots, root


def run_balance() -> dict:
    key = ("run", RUN_PERIOD, RUN_STRIDE, RUN_STANCE)
    if key not in _BALANCE_CACHE:
        def height(ph, infos):
            lim = RUN.holding_limits(infos, None)
            return smooth_below(lim, _RUN_H_H, 0.0005 * H, RUN_PELVIS_UP, RUN_PERIOD,
                                acc_min=-RUN_BOUNCE * G_ACC / M_PER_UNIT)

        _BALANCE_CACHE[key] = _balance_loop(_run_core, run_zmp_ref, RUN_STRIDE, RUN_PERIOD, _RUN_DZ_H, _RUN_H_H, height,
                                            -0.05 * H, dx_h=_RUN_DX_H, rounds=16, relax=0.25)
    return _BALANCE_CACHE[key]


def run_gait_rots(skel: Skeleton, phase: float, advance: float = 0.0, info: Optional[dict] = None):
    """The run loop (3.75 m/s at RUN_PERIOD; ``advance = RUN_STRIDE * phase`` to travel, 0 = on the spot).
    Not the same as ``run_rots`` (a synthetic sprint for testing the costume, no foot planting)."""
    b = run_balance()
    tr = balance_track(b)
    dx, h, dz = tr(phase)
    return _run_core(phase, advance, dz, h, info, dx=dx, track=tr)


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

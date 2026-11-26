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
HEEL_OFF = 0.52  # part of the stance after which the heel lifts
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


def soft_pos(x, eps=3.0):
    """Smooth max(x, 0): exactly 0 at x = 0, x - eps/2 for large x."""
    return 0.5 * (x + math.sqrt(x * x + eps * eps)) - 0.5 * eps


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
            pitch = PITCH_STRIKE * (1 - smoothstep(t / HEEL_ROCK))
            return dict(ankle=_about(Hc, Hc, pitch, A0) - A0, pitch=pitch, toe=0.0, contact="heel")
        if t < HEEL_OFF:
            return dict(ankle=np.zeros(3), pitch=0.0, toe=0.0, contact="sole")
        pitch = PITCH_OFF * smoothstep((t - HEEL_OFF) / (1 - HEEL_OFF))
        return dict(ankle=_about(T0, T0, pitch, A0) - A0, pitch=pitch, toe=-pitch, contact="toe")
    t = (psi - STANCE) / (1 - STANCE)
    start = _about(T0, T0, PITCH_OFF, A0) - A0  # where toe-off left the ankle
    end = _about(Hc, Hc, PITCH_STRIKE, A0) - A0 + np.array([0.0, 0.0, STRIDE])  # next heel strike, one stride on
    ankle = start + (end - start) * smoothstep(t)  # zero world speed at both ends
    ankle[1] += SWING_LIFT * math.sin(math.pi * t) ** 2
    pitch = PITCH_OFF + (PITCH_STRIKE - PITCH_OFF) * smoothstep((t - SWING_HOLD) / (1 - SWING_HOLD))
    toe = -PITCH_OFF * (1 - smoothstep(t / 0.45))  # toes straighten out early in the swing
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


def stand_rots(arm_out: float = 6.0, elbow: float = 8.0) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
    """Relaxed standing: arms hang a little away from the body, elbows slightly bent."""
    rots = {}
    for side, s in rig.SIDES:
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=2.0, roll=s * arm_out)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-elbow)
    return rots, np.zeros(3)


def walk_rots(skel: Skeleton, phase: float, advance: float = 0.0, info: Optional[dict] = None):
    """Local rotations + root offset for walk phase in [0,1).  ``info`` (optional dict) receives the
    world targets of both feet and the leg reach, for tests."""
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
    sway = ROOT_SWAY * over
    root = np.array([sway, root_height(R_pelvis, (sway, advance), ankles), advance])
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
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=-3.0 + 21.0 * sw, roll=s * 5.5)
        rots["forearm" + side] = rig.local_rot("forearm" + side, pitch=-(19.0 - 11.0 * sw), yaw=s * 8.0)
        rots["hand" + side] = rig.local_rot("hand" + side, pitch=-6.0)
    drive_helpers(rots, phase=phase, walk=1.0)
    return rots, root


def walk_pose(skel: Skeleton, phase: float, advance: float = 0.0):
    """(B,3,4) rest->posed matrices + root offset, same call as the Nike example's walk_pose."""
    rots, root = walk_rots(skel, phase, advance)
    return skel.world_mats(rots, root_offset=root), root


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
        rots["upperarm" + side] = rig.local_rot("upperarm" + side, pitch=2.0 + lag, roll=s * (7.0 + 1.6 * out))
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


def drive_helpers(rots: Dict[str, np.ndarray], phase: float = 0.0, walk: float = 0.0, chest_spin: float = 0.0,
                  head_spin: float = 0.0) -> Dict[str, np.ndarray]:
    """Set the helper bones from the pose (in place): skirt panels are pushed out by the thighs, the
    cape hangs back and trails, the plume nods.  Purely procedural, loops with ``phase``.

    ``walk`` 0..1 = how much walking sway to add; ``*_spin`` = turning speed in degrees per cycle."""
    eye = np.eye(3)
    fl, ol = thigh_swing(rots.get("thighL", eye), 1)
    fr, orr = thigh_swing(rots.get("thighR", eye), -1)
    flutter = walk * math.sin(2 * TAU * phase - 1.1)
    # skirt: a panel never passes through the thigh behind it; 0.85 = the cloth hangs a little off the leg
    front = fr + soft_pos(fl - fr, 6.0)  # smooth max: the thigh that is further forward ...
    back = -fl + soft_pos(fl - fr, 6.0)  # ... and the one that is further back
    rots["skirtF"] = rig.euler(pitch=-(0.85 * soft_pos(front) + 2.0 * walk + 1.5 * flutter))
    rots["skirtB"] = rig.euler(pitch=0.85 * soft_pos(back) + 2.0 * walk - 1.5 * flutter)
    rots["skirtL"] = rig.euler(pitch=-0.5 * fl, roll=0.9 * soft_pos(ol) + 1.5 * walk * math.sin(TAU * phase - 0.9))
    rots["skirtR"] = rig.euler(pitch=-0.5 * fr, roll=-0.9 * soft_pos(orr) + 1.5 * walk * math.sin(TAU * phase - 0.9))
    # cape: streams back when walking, swings out against a turn, the hem lags the top
    lag = -0.035 * chest_spin
    rots["cape"] = rig.euler(pitch=walk * (7.0 + 3.0 * math.sin(2 * TAU * phase - 1.0)),
                             yaw=0.5 * lag, roll=walk * 2.5 * math.sin(TAU * phase - 0.8) + 0.15 * lag)
    rots["capeTip"] = rig.euler(pitch=walk * (4.0 + 4.0 * math.sin(2 * TAU * phase - 1.9)),
                                yaw=0.5 * lag, roll=walk * 3.0 * math.sin(TAU * phase - 1.6) + 0.25 * lag)
    # plume: nods with every step, leans away from a head turn
    lean = -0.02 * head_spin
    rots["plume"] = rig.euler(pitch=walk * (3.0 + 4.0 * math.sin(2 * TAU * phase - 0.6)), roll=0.5 * lean)
    rots["plumeTip"] = rig.euler(pitch=walk * (2.0 + 5.0 * math.sin(2 * TAU * phase - 1.5)), roll=lean)
    return rots


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

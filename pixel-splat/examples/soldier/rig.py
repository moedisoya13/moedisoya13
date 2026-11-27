"""Soldier rig: real human proportions, joint positions, skeleton, rotation limits, helper bones.

Layer 1 of the soldier (see README.md): everything else - joint beads, turntables, the mannequin
surface, the motion, later the costume - hangs off the numbers in this file.

Coordinates as in the Nike example: y up, the figure faces +z, +x is HIS LEFT, ground at y = -1.
All sizes are fractions of the body height ``H`` (sole to top of the head), so changing ``H``
rescales the whole figure.

Proportions: Drillis & Contini (1966) segment ratios as tabulated by Winter, "Biomechanics and Motor
Control of Human Movement" - an average adult male, about 7.5 heads tall.

Rest pose: legs straight, feet forward, arms straight and spread ``A_POSE`` degrees away from the
body (an "A-pose": the hands clear the hips and sleeves clear the ribs).  Joint angles are still
counted from the anatomical position (arms hanging straight down), see ``local_rot``.
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pixelsplat.skin import Bone, Skeleton, rot_axis, rot_x, rot_y, rot_z  # noqa: E402,F401

H = 1.80  # body height in world units (a 1.75 m man -> 1 unit = 0.972 m)
GROUND = -1.0
A_POSE = 10.0  # degrees the rest-pose arms are spread away from the body
SIDES = (("L", 1), ("R", -1))


def V(*a):
    return np.array(a, np.float64)


def Y(ratio: float) -> float:
    """World height of a landmark given as a fraction of the body height above the sole."""
    return GROUND + ratio * H


# ---------------------------------------------------------------- proportions (fractions of H)
RATIO = dict(
    vertex=1.000, eye=0.936, chin=0.870, shoulder=0.818, shoulder_width=0.259, elbow=0.630, wrist=0.485,
    fingertip=0.377, hip=0.530, hip_width=0.191, knee=0.285, ankle=0.039, upper_arm=0.186, forearm=0.146,
    hand=0.108, thigh=0.245, shin=0.246, foot_length=0.152, foot_width=0.055)

# joint centres that the table does not give (fractions of H)
WAIST_H = 0.620  # narrowest part of the trunk, between the lowest rib and the hip bone
NECK_H = 0.832  # base of the neck (C7 / top of the breast bone)
HEAD_H = 0.885  # skull base (atlas): the head turns and nods here
HIP_X = 0.0511  # hip joint centre, sideways from the midline
SHOULDER_X = 0.1000  # shoulder joint centre, sideways from the midline
CLAV_X, CLAV_H, CLAV_Z = 0.0195, 0.800, 0.011  # inner end of the collar bone
HEEL_BACK = 0.276  # ankle sits this fraction of the foot length in front of the back of the heel
HEEL_ROUND = 0.145  # centre of the rounded heel, as a fraction of the foot length from the back of the heel
HEEL_PIVOT = 0.122  # the heel rolls about a ground point just behind that centre
TOE_JOINT = 0.705  # ball of the foot (toe hinge) as a fraction of the foot length from the heel
TOE_R = 0.0150  # radius of the toe hinge = its height above the ground
# The hand is a mitten: the palm (bone ``hand``), the four fingers as ONE block hinged on the knuckle line
# (``fingers``), and the thumb on a ball at its base (``thumb``).  Positions in the hand's own frame
# (``hand_axes``): (along the arm from the wrist, towards the palm side, forward = thumb side), fractions of H.
KNUCKLE = (0.0555, 0.0020, 0.0)  # middle of the knuckle line; the hinge axis runs through it, forward
KNUCKLE_HALF = 0.0135  # half length of the knuckle barrel along that axis
THUMB_BASE = (0.0180, 0.0030, 0.0180)
THUMB_TIP = (0.0580, 0.0095, 0.0365)

# ---------------------------------------------------------------- joint beads / sockets / turntables
# radius of the bead (sphere on the CHILD bone, centred on the joint) and of the socket (sphere of
# the PARENT bone around the same centre), fractions of H.  bead >= socket, so the parent's end cap
# always hides inside the bead; both solids contain the socket sphere in every pose -> no gap.
BEAD = dict(hip=0.0445, knee=0.0311, ankle=0.0222, toe=TOE_R, shoulder=0.0300, elbow=0.0233, wrist=0.0167,
            clavicle=0.0211, neck=0.0344, knuckle=0.0090, thumb=0.0088)
SOCKET = dict(hip=0.0390, knee=0.0278, ankle=0.0183, toe=TOE_R, shoulder=0.0261, elbow=0.0206, wrist=0.0144,
              clavicle=0.0211, neck=0.0306, knuckle=0.0080, thumb=0.0078)
# turntables: a disc on the PARENT bone whose axis is the yaw axis, plus a ball of radius ``ball``
# on the parent and a slightly smaller one (``inner``) on the child, both centred on the joint.
TURNTABLE = dict(
    waist=dict(radius=0.0644, half_height=0.0122, ball=0.0600, inner=0.0556),
    head=dict(radius=0.0356, half_height=0.0078, ball=0.0289, inner=0.0267))


def _arm_axis(s: int) -> np.ndarray:
    a = math.radians(A_POSE)
    return V(s * math.sin(a), -math.cos(a), 0.0)


def hand_axes(s: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Unit vectors of the resting hand: along the arm, towards the palm side (the body), forward (thumb side)."""
    a = _arm_axis(s)
    w = V(0.0, 0.0, 1.0)
    return a, s * np.cross(a, w), w


def hand_point(s: int, q) -> np.ndarray:
    """A point given in the hand's frame (along, palmwards, forward; fractions of H) -> rest-pose world."""
    a, n, w = hand_axes(s)
    return WRIST[s] + H * (q[0] * a + q[1] * n + q[2] * w)


WAIST = V(0.0, Y(WAIST_H), 0.0)
PELVIS = V(0.0, Y(RATIO["hip"]) + 0.02 * H, 0.0)  # root pivot, between and a little above the hip joints
NECK = V(0.0, Y(NECK_H), -0.007 * H)
HEAD = V(0.0, Y(HEAD_H), 0.0)
VERTEX = V(0.0, Y(RATIO["vertex"]), 0.0)
EYE = V(0.0, Y(RATIO["eye"]), 0.045 * H)
CHIN = V(0.0, Y(RATIO["chin"]), 0.039 * H)
HIP, KNEE, ANKLE, TOE, TOE_TIP, HEEL = {}, {}, {}, {}, {}, {}
CLAV, SHOULDER, ELBOW, WRIST, FINGERTIP, ARM_AXIS = {}, {}, {}, {}, {}, {}
KNUCKLES, THUMB, THUMB_END = {}, {}, {}  # knuckle hinge (its middle), thumb base, thumb tip
FOOT_LEN = RATIO["foot_length"] * H
FOOT_W = RATIO["foot_width"] * H
for _side, _s in SIDES:
    x = _s * HIP_X * H
    HIP[_s] = V(x, Y(RATIO["hip"]), 0.0)
    KNEE[_s] = V(x, Y(RATIO["knee"]), 0.0)
    ANKLE[_s] = V(x, Y(RATIO["ankle"]), 0.0)
    z_heel = -HEEL_BACK * FOOT_LEN
    TOE[_s] = V(x, GROUND + TOE_R * H, z_heel + TOE_JOINT * FOOT_LEN)  # toe hinge (ball of the foot)
    TOE_TIP[_s] = V(x, GROUND + 0.011 * H, z_heel + FOOT_LEN)
    HEEL[_s] = V(x, GROUND, z_heel + HEEL_PIVOT * FOOT_LEN)  # ground point the heel rolls about at heel strike
    ARM_AXIS[_s] = _arm_axis(_s)
    CLAV[_s] = V(_s * CLAV_X * H, Y(CLAV_H), CLAV_Z * H)
    SHOULDER[_s] = V(_s * SHOULDER_X * H, Y(RATIO["shoulder"]), 0.0)
    ELBOW[_s] = SHOULDER[_s] + RATIO["upper_arm"] * H * ARM_AXIS[_s]
    WRIST[_s] = ELBOW[_s] + RATIO["forearm"] * H * ARM_AXIS[_s]
    FINGERTIP[_s] = WRIST[_s] + RATIO["hand"] * H * ARM_AXIS[_s]
    KNUCKLES[_s], THUMB[_s], THUMB_END[_s] = hand_point(_s, KNUCKLE), hand_point(_s, THUMB_BASE), hand_point(_s, THUMB_TIP)
THIGH_LEN = float(np.linalg.norm(KNEE[1] - HIP[1]))
SHIN_LEN = float(np.linalg.norm(ANKLE[1] - KNEE[1]))

# ---------------------------------------------------------------- helper bones for the costume (stage 2)
# No surface is attached to these yet; motion.drive_helpers() already animates them.
BELT_H = 0.585  # the upper edge of the gores (just below the belt, inside the yoke)
HEM_H = 0.385  # hem of the tabard skirt: mid-thigh
# The skirt is an elliptical cone round the hips: half width (x) and half depth (z) at three heights.
SKIRT_H = (HEM_H, 0.500, 0.6055)  # hem, bottom of the yoke (the part fixed to the pelvis), top (under the belt)
SKIRT_A = (0.1278, 0.1167, 0.0744)  # half width at those heights (fractions of H)
SKIRT_B = (0.0900, 0.0783, 0.0644)  # half depth
SKIRT_ZC = -0.0028 * H  # its axis sits a little behind the body axis (buttocks)
# Below the yoke the skirt hangs in eight gores (strips), each hinged on the belt line and free to swing
# outwards only - like the pleats of a kilt.  name -> azimuth of its middle (deg from front towards his left)
GORES = {"skirtF": 0.0, "skirtFL": 45.0, "skirtL": 90.0, "skirtBL": 135.0, "skirtB": 180.0, "skirtBR": -135.0,
         "skirtR": -90.0, "skirtFR": -45.0}
GORE_HALF = 23.0  # half the angle one gore covers (they overlap their neighbours by half a degree)


def skirt_radii(y):
    """(half width, half depth) of the skirt cone at world height(s) y."""
    ys = [Y(h) for h in SKIRT_H]
    return np.interp(y, ys, np.array(SKIRT_A) * H), np.interp(y, ys, np.array(SKIRT_B) * H)


def _skirt_point(az_deg: float, h: float) -> np.ndarray:
    a, b = skirt_radii(Y(h))
    t = math.radians(az_deg)  # the direction (sin t, cos t) scaled onto the ellipse of that height
    k = 1.0 / math.hypot(math.sin(t) / a, math.cos(t) / b)
    return V(k * math.sin(t), Y(h), SKIRT_ZC + k * math.cos(t))


GORE_HINGE_H = SKIRT_H[2]  # the gores hinge right under the belt
SKIRT = {name: (_skirt_point(az, GORE_HINGE_H), _skirt_point(az, HEM_H)) for name, az in GORES.items()}  # hinge, hem


def gore_frame(name: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(hinge point, outward direction, hinge axis) of a gore, rest pose.  Turning the gore by +angle
    about the hinge axis swings its hem outwards."""
    hinge = SKIRT[name][0]
    t = math.radians(GORES[name])
    out = V(math.sin(t), 0.0, math.cos(t))
    return hinge, out, np.cross(out, V(0.0, 1.0, 0.0))


CAPE = (V(0.0, Y(0.800), -0.066 * H), V(0.0, Y(0.560), -0.099 * H), V(0.0, Y(0.330), -0.128 * H))  # root, hinge, hem
PLUME = (V(0.0, Y(0.985), -0.050 * H), V(0.0, Y(1.046), -0.080 * H), V(0.0, Y(1.090), -0.125 * H))  # root, mid, tip

# points on the back of the hips / skirt (in the pelvis frame) that the cape has to hang behind
CAPE_CLEAR = (V(0.0, Y(0.620), -0.081 * H), V(0.0, Y(0.555), -0.092 * H), V(0.0, Y(0.500), -0.097 * H),
              V(0.0, Y(0.400), -0.107 * H))
CAPE_HALF_WIDTH = 0.095 * H  # (the costume's cape is this wide at most; what is further out cannot touch it)

GEOMETRY_BONES: List[str] = []  # the body bones a motion defines; they carry mannequin surface (filled below)
HELPER_BONES: List[str] = []  # costume bones, driven from the body pose (motion.drive_helpers)
HAND_BONES: List[str] = []  # fingers + thumb of each hand: mannequin surface too, driven by one number (``grip``)


def make_skeleton() -> Skeleton:
    """36 bones, parents first.  The first 20 carry the mannequin and are what a motion defines; the next 12
    are costume helpers (8 skirt gores, cape, capeTip, plume, plumeTip) that only the outfit gives a surface;
    the last 4 are the mitten hands (fingersL, thumbL, fingersR, thumbR), part of the mannequin, set by
    ``grip_rots``.  New bones are appended, never inserted: the numbers of the older ones stay what they were,
    and a clip or model made before a bone existed simply leaves it at rest."""
    b = [Bone("pelvis", None, PELVIS, WAIST),
         Bone("chest", "pelvis", WAIST, NECK),  # joint = waist turntable
         Bone("neck", "chest", NECK, HEAD),
         Bone("head", "neck", HEAD, VERTEX)]  # joint = neck turntable
    for side, s in SIDES:
        b += [Bone("clav" + side, "chest", CLAV[s], SHOULDER[s]),
              Bone("upperarm" + side, "clav" + side, SHOULDER[s], ELBOW[s]),
              Bone("forearm" + side, "upperarm" + side, ELBOW[s], WRIST[s]),
              Bone("hand" + side, "forearm" + side, WRIST[s], FINGERTIP[s])]
    for side, s in SIDES:
        b += [Bone("thigh" + side, "pelvis", HIP[s], KNEE[s]),
              Bone("shin" + side, "thigh" + side, KNEE[s], ANKLE[s]),
              Bone("foot" + side, "shin" + side, ANKLE[s], TOE[s]),
              Bone("toe" + side, "foot" + side, TOE[s], TOE_TIP[s])]
    n_geo = len(b)
    for name, (head, tail) in SKIRT.items():
        b.append(Bone(name, "pelvis", head, tail))
    b += [Bone("cape", "chest", CAPE[0], CAPE[1]), Bone("capeTip", "cape", CAPE[1], CAPE[2]),
          Bone("plume", "head", PLUME[0], PLUME[1]), Bone("plumeTip", "plume", PLUME[1], PLUME[2])]
    n_helper = len(b)
    for side, s in SIDES:
        b += [Bone("fingers" + side, "hand" + side, KNUCKLES[s], FINGERTIP[s]),
              Bone("thumb" + side, "hand" + side, THUMB[s], THUMB_END[s])]
    bones = [Bone(x.name, x.parent, np.asarray(x.head, np.float32), np.asarray(x.tail, np.float32)) for x in b]
    GEOMETRY_BONES[:] = [x.name for x in bones[:n_geo]]
    HELPER_BONES[:] = [x.name for x in bones[n_geo:n_helper]]
    HAND_BONES[:] = [x.name for x in bones[n_helper:]]
    return Skeleton(bones)


SKELETON = make_skeleton()
PARENT: Dict[str, Optional[str]] = {b.name: b.parent for b in SKELETON.bones}


# ---------------------------------------------------------------- joints
@dataclass(frozen=True)
class Joint:
    """One articulation: ``bone`` turns about ``pos`` relative to ``parent``."""
    name: str
    bone: str
    parent: str
    pos: np.ndarray
    kind: str  # "bead" (ball on the child) | "hinge" (cylinder along x) | "turntable" (disc on the parent)
    bead: float  # radius of the visible ball / hinge barrel / turntable ball (world units)
    shared: float  # radius of the sphere around ``pos`` that BOTH bones contain (world units)
    owner: str  # the bone the bead / turntable is rigidly attached to


def _joints() -> List[Joint]:
    j = [Joint("waist", "chest", "pelvis", WAIST, "turntable", TURNTABLE["waist"]["ball"] * H,
               TURNTABLE["waist"]["inner"] * H, "pelvis"),
         Joint("neck", "neck", "chest", NECK, "bead", BEAD["neck"] * H, SOCKET["neck"] * H, "neck"),
         Joint("head", "head", "neck", HEAD, "turntable", TURNTABLE["head"]["ball"] * H,
               TURNTABLE["head"]["inner"] * H, "neck")]
    for side, s in SIDES:
        for nm, bone, par, pos, key in (
                ("clavicle", "clav", "chest", CLAV, "clavicle"), ("shoulder", "upperarm", "clav", SHOULDER, "shoulder"),
                ("elbow", "forearm", "upperarm", ELBOW, "elbow"), ("wrist", "hand", "forearm", WRIST, "wrist"),
                ("hip", "thigh", "pelvis", HIP, "hip"), ("knee", "shin", "thigh", KNEE, "knee"),
                ("ankle", "foot", "shin", ANKLE, "ankle"), ("toe", "toe", "foot", TOE, "toe"),
                ("knuckle", "fingers", "hand", KNUCKLES, "knuckle"), ("thumb", "thumb", "hand", THUMB, "thumb")):
            parent = par if par in ("chest", "pelvis") else par + side
            j.append(Joint(nm + side, bone + side, parent, pos[s], "hinge" if nm in ("toe", "knuckle") else "bead",
                           BEAD[key] * H, SOCKET[key] * H, bone + side))
    return j


JOINTS: List[Joint] = _joints()

# ---------------------------------------------------------------- rotation limits (degrees)
# Angles are counted from the anatomical position (standing, arms hanging straight down):
#   pitch = about +x : trunk/head bend forward (+);  a hanging limb swings BACK (+) / forward (-);
#                      foot and toes point down (+) / up (-)
#   yaw   = about +y : turn / twist towards his left (+)
#   roll  = about +z : trunk/head lean to his right (+); a left limb moves away from the body (+)
# Left side shown; the right side mirrors yaw and roll.  Local rotation = Ry(yaw) Rz(roll) Rx(pitch).
LIMITS: Dict[str, Tuple[Tuple[float, float], Tuple[float, float], Tuple[float, float]]] = {
    #            pitch (min, max)   yaw (min, max)   roll (min, max)
    "chest":    ((-10.0, 25.0),    (-40.0, 40.0),   (-12.0, 12.0)),   # waist turntable
    "neck":     ((-15.0, 20.0),    (0.0, 0.0),      (-10.0, 10.0)),   # neck base: nod and tilt only
    "head":     ((-20.0, 25.0),    (-70.0, 70.0),   (-10.0, 10.0)),   # neck turntable
    "clav":     ((0.0, 0.0),       (-15.0, 15.0),   (-5.0, 20.0)),    # shrug (+roll), reach forward/back (yaw)
    "upperarm": ((-170.0, 50.0),   (-70.0, 70.0),   (-20.0, 90.0)),   # shoulder
    "forearm":  ((-145.0, 0.0),    (-80.0, 80.0),   (0.0, 0.0)),      # elbow + forearm twist
    "hand":     ((-70.0, 70.0),    (-90.0, 90.0),   (-20.0, 30.0)),   # wrist; yaw = turning the forearm over (the ball takes it)
    "thigh":    ((-120.0, 20.0),   (-40.0, 40.0),   (-25.0, 45.0)),   # hip
    "shin":     ((0.0, 140.0),     (0.0, 0.0),      (0.0, 0.0)),      # knee
    "foot":     ((-20.0, 45.0),    (-10.0, 10.0),   (-15.0, 15.0)),   # ankle
    "toe":      ((-60.0, 10.0),    (0.0, 0.0),      (0.0, 0.0)),      # toe hinge
    # the mitten hand (angles in the hand's own frame, see ``_joint_frames``): pitch = curl towards the palm
    "fingers":  ((-10.0, 150.0),   (0.0, 0.0),      (0.0, 0.0)),      # knuckle hinge
    "thumb":    ((-10.0, 50.0),    (-50.0, 10.0),   (-10.0, 65.0)),   # ball at the thumb base
}


def side_of(bone: str) -> int:
    """+1 for a left bone, -1 for a right bone, 0 for the midline."""
    base = bone[:-1] if bone[-1] in "LR" and bone[:-1] in LIMITS else None
    if base is None:
        return 0
    return 1 if bone.endswith("L") else -1


LIMIT_OVERRIDE: Dict[str, Tuple] = {}  # tighter limits while an outfit is worn (set by body.wear)


def limits(bone: str):
    """((pitch_min, pitch_max), (yaw_min, yaw_max), (roll_min, roll_max)) for one bone, or None."""
    s = side_of(bone)
    key = bone[:-1] if s else bone
    if key not in LIMITS:
        return None
    p, y, r = LIMIT_OVERRIDE.get(key, LIMITS[key])
    if s < 0:
        y, r = (-y[1], -y[0]), (-r[1], -r[0])
    return p, y, r


def _frame(bone: Optional[str]) -> np.ndarray:
    """Rest orientation of a bone's anatomical frame: the arm chain is spread by A_POSE."""
    if bone is not None and bone[:-1] in ("upperarm", "forearm", "hand", "fingers", "thumb"):
        return rot_z((1 if bone.endswith("L") else -1) * A_POSE)
    return np.eye(3)


def _joint_frames(bone: str) -> Tuple[np.ndarray, np.ndarray]:
    """(A, B): the joint angles of a local rotation R are the Euler angles of A^T R B.

    Body joints are read in the anatomical frame of the parent (A) and of the bone itself (B).  The finger
    and thumb joints are read in the HAND's own frame instead, turned so that the knuckle line is the pitch
    axis: pitch = curling towards the palm (+), on both hands; yaw = twist about the hand's length; roll =
    swinging in the plane of the palm.  (Euler roll, the middle angle, only reaches +-90 degrees; a fist
    curls further than that, so the curl has to be the pitch.)"""
    if bone[:-1] in ("fingers", "thumb"):
        s = 1 if bone.endswith("L") else -1
        F = _frame(bone) @ rot_y(s * 90.0)
        return F, F
    return _frame(PARENT[bone]), _frame(bone)


def euler(pitch: float = 0.0, yaw: float = 0.0, roll: float = 0.0) -> np.ndarray:
    return rot_y(yaw) @ rot_z(roll) @ rot_x(pitch)


def euler_angles(R: np.ndarray) -> Tuple[float, float, float]:
    """Inverse of ``euler``: (pitch, yaw, roll) in degrees, roll within +-90."""
    roll = math.degrees(math.asin(float(np.clip(R[1, 0], -1, 1))))
    pitch = math.degrees(math.atan2(-R[1, 2], R[1, 1]))
    yaw = math.degrees(math.atan2(-R[2, 0], R[0, 0]))
    return pitch, yaw, roll


def local_rot(bone: str, pitch: float = 0.0, yaw: float = 0.0, roll: float = 0.0) -> np.ndarray:
    """Local rotation for ``Skeleton.world_mats`` from joint angles counted from the anatomical position."""
    A, B = _joint_frames(bone)
    return A @ euler(pitch, yaw, roll) @ B.T


def joint_angles(bone: str, R_local: np.ndarray) -> Tuple[float, float, float]:
    """(pitch, yaw, roll) of a local rotation, counted from the anatomical position."""
    A, B = _joint_frames(bone)
    return euler_angles(A.T @ np.asarray(R_local, float) @ B)


def rest_angles(bone: str) -> Tuple[float, float, float]:
    """Joint angles of the rest pose (non-zero only for the spread arms)."""
    return joint_angles(bone, np.eye(3))


def _wrap_into(angle: float, lo: float, hi: float) -> float:
    """The representative of an angle (mod 360) that lies in / nearest to [lo, hi]."""
    mid = 0.5 * (lo + hi)
    return angle - 360.0 * round((angle - mid) / 360.0)


def _geodesic(A: np.ndarray, B: np.ndarray) -> float:
    """Angle in degrees of the rotation that takes A to B."""
    c = (np.trace(A.T @ B) - 1.0) / 2.0
    if c > 0.999999:  # acos loses precision near 0: use the chord instead
        return math.degrees(float(np.linalg.norm(A - B)) / math.sqrt(2.0))
    return math.degrees(math.acos(max(c, -1.0)))


def _nearest_in_box(J: np.ndarray, lim) -> Tuple[Tuple[float, float, float], float]:
    """Angles (pitch, yaw, roll) inside the limit box whose rotation is nearest to J, and how far it is
    (degrees).  Exact - also at the gimbal lock roll = +-90, where pitch and yaw are not unique."""
    lo = np.array([l[0] for l in lim], float)
    hi = np.array([l[1] for l in lim], float)
    p, y, r = euler_angles(J)
    if abs(r) < 89.0:  # away from the lock the reading is unique: inside the box means inside the limits
        x = np.array([_wrap_into(a, l, h) for a, l, h in zip((p, y, r), lo, hi)])
        if np.all(x >= lo) and np.all(x <= hi):
            return (float(x[0]), float(x[1]), float(x[2])), 0.0
    seeds = [(p, y, r), (p + 180.0, y + 180.0, 180.0 - r)]  # the two Euler branches of the same rotation
    if abs(r) > 60.0:  # near the lock only pitch + yaw (roll = +90) or yaw - pitch (roll = -90) is defined
        sgn = 1.0 if r > 0 else -1.0
        total = math.degrees(math.atan2(J[0, 2], J[2, 2]))  # = yaw + sgn * pitch at the lock
        for pp in (lo[0], hi[0], 0.5 * (lo[0] + hi[0]), float(np.clip(_wrap_into(p, lo[0], hi[0]), lo[0], hi[0]))):
            seeds.append((pp, total - sgn * pp, r))
        for yy in (lo[1], hi[1], 0.5 * (lo[1] + hi[1])):
            seeds.append((sgn * (total - yy), yy, r))
    best, best_err = None, 1e9
    for seed in seeds:
        x = np.array([np.clip(_wrap_into(a, l, h), l, h) for a, l, h in zip(seed, lo, hi)])
        err = _geodesic(euler(*x), J)
        for _ in range(12):  # projected Gauss-Newton on || R(x) - J ||, damped
            if err < 1e-9:
                break
            R0 = euler(*x)
            D = np.stack([(euler(*(x + e)) - R0).ravel() / 1e-4 for e in np.eye(3) * 1e-4], 1)  # per degree
            g = D.T @ (J - R0).ravel()
            step = np.linalg.solve(D.T @ D + 1e-9 * np.eye(3), g)
            moved = False
            for scale in (1.0, 0.5, 0.25, 0.1):
                x1 = np.clip(x + scale * step, lo, hi)
                e1 = _geodesic(euler(*x1), J)
                if e1 < err - 1e-12:
                    x, err, moved = x1, e1, True
                    break
            if not moved:
                break
        if err < best_err:
            best, best_err = tuple(float(v) for v in x), err
    return best, best_err


def clamp_rot(bone: str, R_local: np.ndarray):
    """The rotation within the limits of ``bone`` that is nearest to ``R_local``.

    Returns (R_local_clamped, (pitch, yaw, roll) of it, excess) where ``excess`` = how many degrees the
    input lay outside the limits (0 = it was inside).  Bones without limits are returned unchanged.
    Use this rather than comparing ``joint_angles`` with the limits: Euler angles are not unique at
    roll = +-90 (arm raised straight out sideways), and this picks the reading that is allowed."""
    lim = limits(bone)
    if lim is None:
        return np.asarray(R_local, float), None, 0.0
    A, B = _joint_frames(bone)
    J = A.T @ np.asarray(R_local, float) @ B
    angles, excess = _nearest_in_box(J, lim)
    if excess < 1e-7:
        return np.asarray(R_local, float), angles, 0.0
    return local_rot(bone, *angles), angles, excess


def clamp_pose(rots: Dict[str, np.ndarray]) -> Tuple[Dict[str, np.ndarray], Dict[str, float]]:
    """Every joint of a pose brought inside its limits (see ``clamp_rot``).  Returns the clamped pose (a
    new dict; bones without limits and the root are passed through) and {bone: excess in degrees} of the
    joints that had to be moved."""
    out, moved = {}, {}
    for bone, R in rots.items():
        out[bone], _, excess = clamp_rot(bone, R)
        if excess > 0:
            moved[bone] = excess
    return out, moved


def check_limits(rots: Dict[str, np.ndarray], tol: float = 0.05) -> List[Tuple[str, str, float, float, float]]:
    """Joints outside their limits: [(bone, axis, angle, min, max), ...]; empty = all fine.

    A joint is outside when NO pitch / yaw / roll within its limits gives its rotation to within ``tol``
    degrees.  The entry names the axis that is furthest out in the nearest allowed reading."""
    bad = []
    for bone, R in rots.items():
        lim = limits(bone)
        if lim is None:
            continue
        A, B = _joint_frames(bone)
        J = A.T @ np.asarray(R, float) @ B
        nearest, excess = _nearest_in_box(J, lim)
        if excess <= tol:
            continue
        # describe it: the Euler reading of the rotation that continues from the nearest allowed angles
        ang = euler_angles(J)
        alt = (ang[0] + 180.0, ang[1] + 180.0, 180.0 - ang[2])
        pick = min((ang, alt), key=lambda a: sum(abs(_wrap_into(v, n, n) - n) for v, n in zip(a, nearest)))
        out = [max(l - _wrap_into(v, l, h), _wrap_into(v, l, h) - h, 0.0) for v, (l, h) in zip(pick, lim)]
        k = int(np.argmax(out)) if max(out) > 0 else 0
        bad.append((bone, ("pitch", "yaw", "roll")[k], float(_wrap_into(pick[k], *lim[k])), lim[k][0], lim[k][1]))
    return bad


def anatomical_rots() -> Dict[str, np.ndarray]:
    """Standing to attention: the pose the proportion table is measured in (arms straight down)."""
    return {"upperarm" + side: local_rot("upperarm" + side) for side, _ in SIDES}


# ---------------------------------------------------------------- grip: one number per hand
FIST_CURL = 148.0  # degrees the finger block is curled at grip 1 (it has 34 degrees of curl built in: 182 at the tips)
THUMB_FIST = (36.0, -38.0, 57.0)  # (pitch, yaw, roll) of the left thumb at grip 1: laid across the curled fingers
GRIP_OPEN, GRIP_FIST = 0.0, 1.0


def grip_rots(side: str, grip: float) -> Dict[str, np.ndarray]:
    """{fingers, thumb of that hand: local rotation} for a grip between 0 (the open, relaxed mitten = the
    rest pose) and 1 (a fist: the finger block curled into the palm, the thumb laid across it)."""
    g = float(min(max(grip, 0.0), 1.0))
    if g == 0.0:  # exactly the rest pose, as a clip without finger bones has it
        return {"fingers" + side: np.eye(3), "thumb" + side: np.eye(3)}
    s = 1 if side == "L" else -1
    p, y, r = THUMB_FIST
    return {"fingers" + side: local_rot("fingers" + side, pitch=g * FIST_CURL),
            "thumb" + side: local_rot("thumb" + side, pitch=g * p, yaw=s * g * y, roll=s * g * r)}


def set_grip(rots: Dict[str, np.ndarray], left: float = 0.0, right: float = 0.0) -> Dict[str, np.ndarray]:
    """Write both hands' grip into a pose (in place; also returned)."""
    rots.update(grip_rots("L", left))
    rots.update(grip_rots("R", right))
    return rots


def grip_of(rots: Dict[str, np.ndarray], side: str) -> float:
    """The grip a pose holds in one hand (read from the finger block; 0 for a pose without finger bones)."""
    R = rots.get("fingers" + side)
    g = 0.0 if R is None else float(joint_angles("fingers" + side, R)[0]) / FIST_CURL
    return 0.0 if abs(g) < 1e-12 else g


def limit_poses(n_random: int = 48, seed: int = 0, corners: bool = True) -> List[Dict[str, np.ndarray]]:
    """Poses that sweep the rotation limits: rest, every joint at each end of each axis, the corners
    of every multi-axis joint, and ``n_random`` whole-body poses drawn uniformly inside the limits.
    (The hands' fingers and thumbs come after the body bones and draw from a generator of their own, so
    the body's part of every pose is what it was before the hands had joints.)"""
    rng = np.random.default_rng(seed)
    rng_hand = np.random.default_rng([seed, 1])
    bones = [b for b in GEOMETRY_BONES + HAND_BONES if limits(b) is not None]
    poses: List[Dict[str, np.ndarray]] = [{}, anatomical_rots()]
    for b in bones:
        lim = limits(b)
        free = [i for i in range(3) if lim[i][0] != lim[i][1]]
        base = list(rest_angles(b))
        for i in free:
            for v in lim[i]:
                a = list(base)
                a[i] = v
                poses.append({b: local_rot(b, *a)})
        if corners and len(free) > 1:
            for code in range(2 ** len(free)):
                a = [0.0, 0.0, 0.0]
                for k, i in enumerate(free):
                    a[i] = lim[i][(code >> k) & 1]
                poses.append({b: local_rot(b, *a)})
    for b in HAND_BONES[::2]:  # each hand as a fist, and half closed
        poses += [grip_rots(b[-1], 1.0), grip_rots(b[-1], 0.5)]
    for _ in range(n_random):
        poses.append({b: local_rot(b, *[(rng_hand if b in HAND_BONES else rng).uniform(lo, hi) for lo, hi in limits(b)])
                      for b in bones})
    return poses


def measure_joints() -> Dict[str, float]:
    """Proportions that follow from the joint positions alone (fractions of H).  The surface-dependent
    ones (widths, vertex, chin, fingertip, foot) are measured on the mesh by soldier.py."""
    h = lambda p: (p[1] - GROUND) / H  # noqa: E731
    d = lambda a, b: float(np.linalg.norm(a - b)) / H  # noqa: E731
    return dict(shoulder=h(SHOULDER[1]), hip=h(HIP[1]), knee=h(KNEE[1]), ankle=h(ANKLE[1]),
                upper_arm=d(SHOULDER[1], ELBOW[1]), forearm=d(ELBOW[1], WRIST[1]), hand=d(WRIST[1], FINGERTIP[1]),
                thigh=d(HIP[1], KNEE[1]), shin=d(KNEE[1], ANKLE[1]),
                # arms hanging straight down (anatomical position)
                elbow=h(SHOULDER[1]) - d(SHOULDER[1], ELBOW[1]),
                wrist=h(SHOULDER[1]) - d(SHOULDER[1], WRIST[1]),
                fingertip=h(SHOULDER[1]) - d(SHOULDER[1], FINGERTIP[1]))

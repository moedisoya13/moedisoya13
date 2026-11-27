"""Motion quality checks that look at the motion as a body would: balance, jerk, punch sequencing.

The other checks (``rig.check_limits``, ``import_pose.mesh_checks`` / ``step_report``, ``retarget.foot_slip`` /
``compare``, ``soldier.loop_report``) ask whether joints stay inside their limits, surfaces stay apart, feet stay
put and the clip follows its source.  These three ask whether the motion is one a person could make:

  balance     is the centre of mass over the part of the floor the feet hold up, frame by frame?
              static  = the centre of mass straight down, against the support polygon (``support``)
              dynamic = the EXTRAPOLATED centre of mass XCoM = CoM + v / w0, w0 = sqrt(g / l) (Hof et al. 2005):
                        where the body would come to rest over if it stopped pushing.  Walking and punching
                        leave the static CoM outside the feet during single support all the time; the XCoM
                        tells a body that is about to step from one that is falling.  Frames with no foot on
                        the ground (flight) are skipped.
  jerk        how abruptly the motion changes (third derivative of position, of the joint angles too), and
              WHERE it pops: one frame that leaves the smooth path of its neighbours.
  sequence    does each punch pass speed from the middle of the body outwards - pelvis turn, chest turn,
              shoulder, elbow, wrist peaking in that order (the proximal-to-distal "kinetic chain")?

All three run on any skeleton through one adapter (``Body``): the soldier rig (a ``Clip``), the catalogue's
own skeleton (an ``import_pose.Source``), or anything else that gives per-frame rest->posed transforms of its
bones.  Running them on a source AND on its import tells what the import added and what was already there.

Units: metres, seconds, degrees, ground at y = 0, y up, the body faces +z, +x is his left (the rig's axes).

CLI
    python examples/soldier/qc.py check out/onetwo3/5m/clip.npz --source onetwo/1-2@5m.json -o out/qc/onetwo_5m
    python examples/soldier/qc.py check out/mocap/demo_run/clip.npz --source out/mocap/demo_run/truth.npz -o out/qc/run
    python examples/soldier/qc.py walk -o out/qc/walk
Writes report.json, summary_ko.txt and PNG plots into the folder (``--no-plots`` skips them).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
from scipy.signal import savgol_filter
from scipy.spatial.transform import Rotation

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))
import retarget as rt  # noqa: E402
import rig  # noqa: E402
from clip import Clip  # noqa: E402

VERSION = "qc-1"
G = 9.81  # m / s^2
SIDES = ("L", "R")

# ---------------------------------------------------------------- constants (every one is in the report)
# Segment masses and centres of mass: de Leva (1996), "Adjustments to Zatsiorsky-Seluyanov's segment inertia
# parameters", J. Biomech. 29(9):1223-1230, table 4, MALES.  (mass fraction of the body, centre of mass as a
# fraction of the segment's length from its FIRST end point).  Chosen over the Winter/Dempster table that
# ``retarget.center_of_mass`` uses because (a) de Leva's end points are joint centres, which is what both
# skeletons here have; (b) the Dempster data are 8 elderly cadavers, de Leva adjusts Zatsiorsky's gamma-scan
# data of 100 living young men; (c) it splits the trunk in three along its length, so a trunk that bends at
# a waist joint carries its mass where it is.  The values are quoted from the table as known to the author of
# this file; ``com_model_gap`` in the report gives the CoM difference to the Winter model (an upper bound on
# what the choice of table does to the balance numbers).
DE_LEVA = {  # segment: (mass fraction, CoM from the first end point, first end point -> second end point)
    "head": (0.0694, 0.5002, "vertex -> C7 (head and neck together)"),
    "trunk_upper": (0.1596, 0.5066, "suprasternale -> xiphoid"),
    "trunk_mid": (0.1633, 0.4502, "xiphoid -> navel"),
    "trunk_low": (0.1117, 0.6115, "navel -> mid hip joints"),
    "upperarm": (0.0271, 0.5772, "shoulder -> elbow joint centre"),
    "forearm": (0.0162, 0.4574, "elbow -> wrist joint centre"),
    "hand": (0.0061, 0.3624, "wrist joint centre -> tip of the middle finger"),
    "thigh": (0.1416, 0.4095, "hip -> knee joint centre"),
    "shank": (0.0433, 0.4459, "knee -> ankle"),
    "foot": (0.0137, 0.4415, "heel -> tip of the longest toe"),
}
# de Leva's lengths of the three trunk parts (mm, males): they place navel and xiphoid on the line from the
# mid hip joints to the top of the breast bone.  Stature of his males: 1741 mm.
TRUNK_MM = dict(low=145.7, mid=215.5, upper=170.7)
# body proportions where a skeleton does not have the point (the catalogue skeleton has no head top, hand
# tip, heel or toe tip): fractions of the stature, the rig's own (Drillis & Contini via Winter, ``rig.RATIO``)
HIP_H, HAND_LEN, FOOT_LEN, FOOT_W = rig.RATIO["hip"], rig.RATIO["hand"], rig.RATIO["foot_length"], rig.RATIO["foot_width"]
# the sole: where the foot can carry weight, in the foot's rest frame (fractions of the foot length from the
# back of the heel / of the foot width either side of the foot's axis).  Heel: the ground point the rounded heel
# rolls about (``rig.HEEL_PIVOT``), +-0.25 of the width (a heel is about 6 of the 10 cm the ball is wide);
# ball: under the toe hinge, +-0.40 of the width (``import_pose._sole_points``); toe tip: on the axis.
SOLE_HEEL_W, SOLE_BALL_W = 0.25, 0.40
# a sole point bears weight while it is this close to the ground and moves slower than this (3-D speed).
# 1.5 cm: animation leaves a planted foot a little above the floor (the boxing catalogue's front foot hovers
# 5-13 mm on frames it is meant to stand on).  1 m/s: a foot SLIDING on the floor still carries weight (the
# boxers' push step slides the lead foot at 0.4-0.7 m/s); a swinging foot is faster than this wherever it is
# that low.  Contact points higher than HOVER are counted in the report (the foot carries weight there but
# does not visibly touch the floor).
CONTACT_H, CONTACT_V, HOVER = 0.015, 1.0, 0.005
# balance: a frame is "out" when the point is more than this outside the support polygon (the sole model above
# is good to about 1-2 cm, so less is not a finding)
BALANCE_TOL = 0.02
# an XCoM excursion that ends WITHOUT a new foot coming down cannot be explained by stepping; a body can still
# win back a little by swinging its trunk and arms (angular momentum), not more than a few cm: deeper than
# this and recovered without a step = the motion is not driven by gravity there
RECOVER_TOL = 0.03
STEP_WINDOW = 2  # frames: a support change this near the end of an excursion counts as the step that ended it
# zero-moment point (the centre of pressure the motion NEEDS, from the segments' accelerations: Vukobratovic):
# outside the support polygon by more than this, the feet cannot produce the motion - something would have to
# pull on the ground or push the body.  3 cm: the sole model (1-2 cm) plus the segments' own rotational inertia,
# which this point-mass sum leaves out.  Near a 'block' event the fist meets the opponent's guard: a real
# external force, so ZMP frames there are reported apart.
ZMP_TOL = 0.03

# smoothing for velocity / acceleration / jerk: Savitzky-Golay (least-squares polynomial on a sliding window,
# zero phase).  Order 3: a cubic is reproduced EXACTLY, jerk included, so the filter cannot invent jerk on a
# smooth path; it only removes what changes faster than the window.  Window 7 frames at 60 fps (0.117 s, cut-off
# reported as ``sg_cutoff_hz``); at other rates the same time span (odd, at least 5 frames).
SG_SECONDS, SG_ORDER = 7.0 / 60.0, 3
# a jerk spike: a frame that leaves the smooth (cubic) path of its neighbours.  Score = distance between the
# frame and the window-7 cubic fit through it (mm / degrees); flagged above median + K * 1.4826 * MAD of the
# clip's own scores for that channel (K = 6, as ``retarget.despike``), and never below the floors (less than
# 1 mm / 0.5 degree off the smooth path is not visible on the soldier).
SPIKE_K, SPIKE_FLOOR_MM, SPIKE_FLOOR_DEG = 6.0, 1.0, 0.5
BURST_GAP = 2  # frames: flagged frames of one channel this close together are one spike (a burst)
SAME_SPIKE = 0.5  # a spike of the import is "already in the source" when the source scores at least this share of it there
# punches: the punch is the wrist's outward stroke, from where its speed rises above ONSET of its peak (looking
# back at most ONSET_MAX) to the peak.  The segments' peaks are looked for from LEAD before that onset (the trunk
# may start turning before the hand moves) to AFTER past the wrist's peak.  A peak found ON the window's end is
# still rising there: it peaks at least that late (a reversal is then still caught, with its lag a lower bound).
PUNCH_ONSET, PUNCH_ONSET_MAX, PUNCH_LEAD, PUNCH_AFTER = 0.15, 0.40, 0.15, 0.10
# the stroke whose normalized jerk is reported: from the frame before the onset to the first frame after the
# peak where the speed is back below PUNCH_ONSET of it (so it starts and ends nearly at rest, as the jerk
# measure assumes).  At 60 fps the smoothing lowers the jerk of short strokes a lot (a perfect minimum-jerk
# stroke, 18.97 in theory, measures 7.4 over 0.1 s, 14.1 over 0.25 s, 16.5 over 0.5 s): compare punches with
# punches over the same frames (source against import), never with the theory.
PUNCH_SEARCH = (-0.05, 0.25)  # seconds around the press event in which the wrist's speed peak is looked for
#                               (no later than that punch's 'block' event - the fist arrives; with no such event, only
#                               on frames where the arm is extending)
# a segment below these peak speeds is "not taking part" (left out of the order): degrees/s, m/s
PARTICIPATE = dict(pelvis=30.0, chest=30.0, shoulder=60.0, elbow=90.0, wrist=1.0)
ORDER_TOL_FRAMES = 1.0  # two peaks less than one frame apart are simultaneous at this frame rate
LAG_MAX = 0.20  # s: neighbours in the chain that peak further apart than this are not one movement
# punch detection when a clip has no events: the wrist, relative to the pelvis, faster than this, with the arm
# at least this extended within 0.1 s, peaks at least SEP apart
DETECT_SPEED, DETECT_REACH, DETECT_SEP = 2.0, 0.85, 0.25
# ... moving mostly forward (this share of its speed along the pelvis' facing, against the pelvis), and alone:
# the other wrist slower than DETECT_ALONE of it then (both arms swinging together is a jump or a run, not a punch)
DETECT_FORWARD, DETECT_ALONE = 0.6, 0.6
CHAIN = ("pelvis", "chest", "shoulder", "elbow", "wrist")
JERK_POINTS = ("pelvis", "head", "wristL", "wristR", "ankleL", "ankleR")
JERK_BONES = ("pelvis", "chest", "head") + tuple(b + s for s in SIDES for b in
                                                  ("upperarm", "forearm", "hand", "thigh", "shin", "foot"))
PARENT = {"chest": "pelvis", "head": "chest", "upperarm": "chest", "forearm": "upperarm", "hand": "forearm",
          "thigh": "pelvis", "shin": "thigh", "foot": "shin"}


def constants() -> dict:
    keys = ["DE_LEVA", "TRUNK_MM", "SOLE_HEEL_W", "SOLE_BALL_W", "CONTACT_H", "CONTACT_V", "HOVER", "BALANCE_TOL", "RECOVER_TOL",
            "STEP_WINDOW", "ZMP_TOL", "BURST_GAP", "SG_SECONDS", "SG_ORDER", "SPIKE_K", "SPIKE_FLOOR_MM", "SPIKE_FLOOR_DEG", "SAME_SPIKE",
            "PUNCH_ONSET", "PUNCH_ONSET_MAX", "PUNCH_LEAD", "PUNCH_AFTER", "PUNCH_SEARCH", "PARTICIPATE", "ORDER_TOL_FRAMES", "LAG_MAX",
            "DETECT_SPEED", "DETECT_REACH", "DETECT_SEP", "DETECT_FORWARD", "DETECT_ALONE"]
    g = globals()
    return {k: g[k] for k in keys}


# ---------------------------------------------------------------- the body, on any skeleton
@dataclass
class Body:
    """Where the checks' points sit on one skeleton, in its REST pose and native units, each carried by a bone.

    ``points``  landmark -> (bone, rest point): pelvis (mid hip joints), head (its centre of mass), shoulder /
                elbow / wrist / hip / knee / ankle + side
    ``com``     [(bone, rest point, mass fraction)] - de Leva's segments
    ``sole``    per side [(bone, rest point)]: heel inside / outside, ball inside / outside, toe tip
    ``bones``   our bone name -> the skeleton's bone (rotations for jerk and the punch chain)
    ``to_m``    native units -> metres; ``ground`` native height of the floor"""
    points: Dict[str, Tuple[str, np.ndarray]]
    com: List[Tuple[str, np.ndarray, float]]
    sole: Dict[str, List[Tuple[str, np.ndarray]]]
    bones: Dict[str, str]
    to_m: float
    ground: float
    stature: float  # native units


def make_body(j: Dict[str, np.ndarray], bone: Dict[str, str], spine: Sequence[Tuple[str, float]], stature: float,
              ground: float, to_m: float, vertex: np.ndarray, fingertip: Dict[str, np.ndarray],
              heel_back_z: Dict[str, float], toe_tip_z: Dict[str, float]) -> Body:
    """Builds the body from rest joint centres ``j`` (hip / knee / ankle / ball / shoulder / elbow / wrist + side,
    ``neck`` = base of the neck, top of the breast bone) and the bones carrying them (``bone``: pelvis, head and
    upperarm / forearm / hand / thigh / shin / foot / toe + side).  ``spine``: (bone, rest height of its lower
    joint) from the pelvis up; a trunk point rides on the highest of them that starts below it."""
    def spine_bone(y: float) -> str:
        b = spine[0][0]
        for name, y0 in spine:
            if y >= y0:
                b = name
        return b

    mid_hip = 0.5 * (j["hipL"] + j["hipR"])
    top = j["neck"]
    tot = TRUNK_MM["low"] + TRUNK_MM["mid"] + TRUNK_MM["upper"]
    navel = mid_hip + (top - mid_hip) * TRUNK_MM["low"] / tot
    xiphoid = mid_hip + (top - mid_hip) * (TRUNK_MM["low"] + TRUNK_MM["mid"]) / tot
    along = lambda a, b, f: a + f * (b - a)  # noqa: E731
    com: List[Tuple[str, np.ndarray, float]] = []
    m, f, _ = DE_LEVA["head"]
    head_com = along(vertex, top, f)
    com.append((bone["head"], head_com, m))
    for seg, a, b in (("trunk_upper", top, xiphoid), ("trunk_mid", xiphoid, navel), ("trunk_low", navel, mid_hip)):
        m, f, _ = DE_LEVA[seg]
        p = along(a, b, f)
        com.append((spine_bone(float(p[1])), p, m))
    sole: Dict[str, List[Tuple[str, np.ndarray]]] = {}
    for s in SIDES:
        for seg, b0, a, b in (("upperarm", "upperarm", "shoulder", "elbow"), ("forearm", "forearm", "elbow", "wrist"),
                              ("thigh", "thigh", "hip", "knee"), ("shank", "shin", "knee", "ankle")):
            m, f, _ = DE_LEVA[seg]
            com.append((bone[b0 + s], along(j[a + s], j[b + s], f), m))
        m, f, _ = DE_LEVA["hand"]
        com.append((bone["hand" + s], along(j["wrist" + s], fingertip[s], f), m))
        m, f, _ = DE_LEVA["foot"]
        ank = j["ankle" + s]
        L = FOOT_LEN * stature
        z = heel_back_z[s] + f * (toe_tip_z[s] - heel_back_z[s])
        com.append((bone["foot" + s], np.array([ank[0], ground + 0.5 * (ank[1] - ground), z]), m))
        W = FOOT_W * stature
        x0, zb = ank[0], j["ball" + s][2]
        zh = heel_back_z[s] + rig.HEEL_PIVOT * L
        sole[s] = [(bone["foot" + s], np.array([x0 + SOLE_HEEL_W * W, ground, zh])),
                   (bone["foot" + s], np.array([x0 - SOLE_HEEL_W * W, ground, zh])),
                   (bone["toe" + s], np.array([x0 + SOLE_BALL_W * W, ground, zb])),
                   (bone["toe" + s], np.array([x0 - SOLE_BALL_W * W, ground, zb])),
                   (bone["toe" + s], np.array([x0, ground, toe_tip_z[s]]))]
    total = sum(c[2] for c in com)
    assert abs(total - 1.0) < 1e-3, total
    points = {"pelvis": (bone["pelvis"], mid_hip), "head": (bone["head"], head_com)}
    for s in SIDES:
        for name, b0 in (("shoulder", "upperarm"), ("elbow", "forearm"), ("wrist", "hand"), ("hip", "thigh"),
                         ("knee", "shin"), ("ankle", "foot")):
            points[name + s] = (bone[b0 + s], j[name + s])
    ours = {b: bone[b] for b in JERK_BONES}
    return Body(points, com, sole, ours, to_m, ground, stature)


def rig_body() -> Body:
    """The soldier's rig (``rig.py``): native units, ground at ``rig.GROUND``, 1 unit = 1.75 / H m."""
    j = {"neck": rig.NECK}
    bone = {"pelvis": "pelvis", "head": "head"}
    fingertip, heel_back, toe_tip = {}, {}, {}
    for side, s in rig.SIDES:
        j.update({"hip" + side: rig.HIP[s], "knee" + side: rig.KNEE[s], "ankle" + side: rig.ANKLE[s],
                  "ball" + side: rig.TOE[s], "shoulder" + side: rig.SHOULDER[s], "elbow" + side: rig.ELBOW[s],
                  "wrist" + side: rig.WRIST[s]})
        for b in ("upperarm", "forearm", "hand", "thigh", "shin", "foot", "toe"):
            bone[b + side] = b + side
        fingertip[side] = rig.FINGERTIP[s]
        heel_back[side] = -rig.HEEL_BACK * rig.FOOT_LEN
        toe_tip[side] = float(rig.TOE_TIP[s][2])
    for b in JERK_BONES:
        bone.setdefault(b, b)
    spine = [("pelvis", -math.inf), ("chest", float(rig.WAIST[1]))]
    return make_body(j, bone, spine, rig.H, rig.GROUND, 1.0 / rt.UNITS_PER_M, rig.VERTEX, fingertip, heel_back, toe_tip)


def source_body(src) -> Body:
    """The catalogue's own skeleton (an ``import_pose.Source``), mapped through ``import_pose.SOMA``.  Its stature
    is taken from the hip joints' height (``rig.RATIO['hip']``); the head top, the hand's tip, heel and toe tip it
    does not have are put where the rig's proportions put them."""
    import import_pose as ip
    table = ip.expand_map(ip.SOMA)
    tp = src.tpose
    jn = lambda b: table[b][0]  # noqa: E731
    j = {"neck": tp[jn("neck")]}
    bone = {"pelvis": jn("pelvis"), "head": jn("head"), "chest": jn("chest")}
    hip_y = float(np.mean([tp[jn("thigh" + s)][1] for s in SIDES]))
    H = hip_y / HIP_H
    fingertip, heel_back, toe_tip = {}, {}, {}
    for s in SIDES:
        j.update({"hip" + s: tp[jn("thigh" + s)], "knee" + s: tp[jn("shin" + s)], "ankle" + s: tp[jn("foot" + s)],
                  "ball" + s: tp[jn("toe" + s)], "shoulder" + s: tp[jn("upperarm" + s)], "elbow" + s: tp[jn("forearm" + s)],
                  "wrist" + s: tp[jn("hand" + s)]})
        for b in ("upperarm", "forearm", "hand", "thigh", "shin", "foot", "toe"):
            bone[b + s] = jn(b + s)
        fdir = rt.unit(j["wrist" + s] - j["elbow" + s])
        fingertip[s] = j["wrist" + s] + HAND_LEN * H * fdir
        L = FOOT_LEN * H
        # as on the rig: the ankle sits HEEL_BACK of the foot length in front of the back of the heel
        heel_back[s] = float(j["ankle" + s][2] - rig.HEEL_BACK * L)
        toe_tip[s] = heel_back[s] + L
    # the spine chain from the hips up to the joint the neck hangs from
    chain = [jn("chest")]
    while src.parent.get(chain[-1]) is not None:
        chain.append(src.parent[chain[-1]])
    chain = chain[::-1]
    spine = [(chain[0], -math.inf)] + [(n, float(tp[n][1])) for n in chain[1:]]
    head = tp[jn("head")]
    vertex = np.array([head[0], H, head[2]])
    for b in JERK_BONES:
        bone.setdefault(b, jn(b))
    return make_body(j, bone, spine, H, 0.0, 1.0, vertex, fingertip, heel_back, toe_tip)


# ---------------------------------------------------------------- a motion, as the checks see it
@dataclass
class Motion:
    """Per frame, in metres: landmark positions, segment centres of mass, sole points, and world rotations."""
    name: str
    fps: float
    pts: Dict[str, np.ndarray]  # (T, 3)
    seg: np.ndarray  # (T, S, 3)
    mass: np.ndarray  # (S,)
    sole: np.ndarray  # (T, 2, P, 3)
    W: Dict[str, np.ndarray]  # our bone -> (T, 3, 3) world rotation (rest -> posed)
    com_height_rest: float  # m
    events: List[dict] = field(default_factory=list)
    contact_field: Optional[np.ndarray] = None  # (T, 2) the clip's own contact track, if it has one
    flight_field: Optional[np.ndarray] = None
    meta: dict = field(default_factory=dict)

    def __len__(self):
        return len(self.seg)

    @property
    def com(self) -> np.ndarray:
        return np.einsum("s,tsk->tk", self.mass, self.seg)


def motion_from_transforms(name: str, fps: float, body: Body, xf: Callable[[int], Dict[str, Tuple[np.ndarray, np.ndarray]]],
                           T: int, **kw) -> Motion:
    """``xf(t)`` -> {bone: (A, b)} with posed = A @ rest + b (native units)."""
    def place(X, bone, p):
        A, b = X[bone]
        return A @ p + b

    to_m = lambda p: (p - np.array([0.0, body.ground, 0.0])) * body.to_m  # noqa: E731
    pts = {k: np.zeros((T, 3)) for k in body.points}
    seg = np.zeros((T, len(body.com), 3))
    sole = np.zeros((T, 2, len(body.sole["L"]), 3))
    W = {k: np.zeros((T, 3, 3)) for k in body.bones}
    for t in range(T):
        X = xf(t)
        for k, (b, p) in body.points.items():
            pts[k][t] = to_m(place(X, b, p))
        for i, (b, p, _) in enumerate(body.com):
            seg[t, i] = to_m(place(X, b, p))
        for k, s in enumerate(SIDES):
            for i, (b, p) in enumerate(body.sole[s]):
                sole[t, k, i] = to_m(place(X, b, p))
        for k, b in body.bones.items():
            W[k][t] = X[b][0]
    mass = np.array([c[2] for c in body.com])
    mass = mass / mass.sum()
    rest = sum(m * to_m(p) for (_, p, _), m in zip(body.com, mass))
    return Motion(name, fps, pts, seg, mass, sole, W, float(rest[1]), **kw)


def from_clip(c: Clip, name: str = "clip", events: Optional[List[dict]] = None) -> Motion:
    """A clip on the soldier's rig."""
    body = rig_body()
    idx = rig.SKELETON.index

    def xf(t):
        M = rt.fk(c.body_rots(t), c.root[t])
        return {b: (M[i][:, :3], M[i][:, 3]) for b, i in idx.items()}

    return motion_from_transforms(name, c.fps, body, xf, len(c), events=list(events or []),
                                  contact_field=np.asarray(c.contact, float), flight_field=np.asarray(c.flight, bool),
                                  meta=dict(kind="rig clip", clip_meta_name=c.meta.get("name")))


def from_source(src, name: str = "source") -> Motion:
    """A catalogue source on its own skeleton (``Source.stage``: the room as he stood in it on frame 0, his own
    metres, without the squash-and-stretch - the import adds that as a pelvis rise, see the report)."""
    body = source_body(src)

    def xf(t):
        R, P = src.stage(t)
        return {n: (R[i], P[i] - R[i] @ src.tpose[n]) for i, n in enumerate(src.names)}

    return motion_from_transforms(name, src.fps, body, xf, len(src), events=list(src.events),
                                  meta=dict(kind="source skeleton", stature_m=round(body.stature, 4),
                                            stretch=[float(src.stretch.min()), float(src.stretch.max())]))


def walk_clip(fps: float = 60.0, period: float = 1.1, cycles: float = 2.0) -> Clip:
    """The rig's own walk loop (``motion.walk_rots``) travelling forward, as ``synth.walk`` makes it."""
    import motion
    frames, roots, contact = [], [], []
    for i in range(int(round(cycles * period * fps))):
        ph = i / fps / period
        info: dict = {}
        rots, root = motion.walk_rots(rig.SKELETON, ph % 1.0, motion.STRIDE * ph, info=info)
        frames.append(rots)
        roots.append(root)
        contact.append([info["L"]["contact"] is not None, info["R"]["contact"] is not None])
    return Clip.from_rots(fps, frames, np.array(roots), contact=np.array(contact, np.float32),
                          meta=dict(name="walk_loop", period=period))


# ---------------------------------------------------------------- signal tools
def sg_window(fps: float) -> int:
    w = int(round(SG_SECONDS * fps))
    w = w + 1 if w % 2 == 0 else w
    return max(w, 5)


def sg(x: np.ndarray, fps: float, deriv: int = 0) -> np.ndarray:
    """Savitzky-Golay along axis 0 (``SG_SECONDS``, ``SG_ORDER``); the derivative in units per second^deriv."""
    x = np.asarray(x, float)
    w = sg_window(fps)
    if len(x) < w:
        raise ValueError(f"{len(x)} frames: too short for a {w}-frame window")
    return savgol_filter(x, w, SG_ORDER, deriv=deriv, delta=1.0 / fps, axis=0, mode="interp")


def edge(fps: float) -> int:
    """Frames at each end of a clip where the smoothing window sticks out: derivatives there come from a polynomial
    extrapolated past the clip, so XCoM, ZMP and spikes are not judged on them."""
    return sg_window(fps) // 2


def sg_cutoff_hz(fps: float) -> float:
    """-3 dB frequency of the smoothing (numerically, from the filter's own response)."""
    w = sg_window(fps)
    n = 4096
    imp = np.zeros(n)
    imp[n // 2] = 1.0
    h = savgol_filter(imp, w, SG_ORDER, mode="interp")
    H = np.abs(np.fft.rfft(h))
    f = np.fft.rfftfreq(n, 1.0 / fps)
    below = np.nonzero(H < 1 / math.sqrt(2))[0]
    return float(f[below[0]]) if len(below) else float(f[-1])


def rotvec_path(W: np.ndarray, world: bool = False) -> np.ndarray:
    """(T, 3, 3) rotations -> (T, 3) radians: the frame-to-frame relative rotations as rotation vectors, summed
    (``world``: increments in the world frame, W[t+1] W[t]^T; else in the bone's own frame, W[t]^T W[t+1]).
    Its derivative is the angular velocity; for spike and jerk it plays the role a position plays for a point."""
    W = np.asarray(W, float)
    if world:
        D = W[1:] @ np.swapaxes(W[:-1], -1, -2)
    else:
        D = np.swapaxes(W[:-1], -1, -2) @ W[1:]
    d = Rotation.from_matrix(D).as_rotvec()
    return np.concatenate([np.zeros((1, 3)), np.cumsum(d, 0)])


def robust_threshold(score: np.ndarray, floor: float) -> float:
    med = float(np.median(score))
    mad = float(np.median(np.abs(score - med)))
    return max(med + SPIKE_K * 1.4826 * mad, floor)


def runs(mask: np.ndarray) -> List[Tuple[int, int]]:
    """[(first, last)] of the True runs."""
    return rt.intervals(np.asarray(mask, bool))


def peak_time(y: np.ndarray, a: int, b: int) -> Tuple[float, float, bool]:
    """(sub-frame index of the largest value in y[a:b+1] (parabola through it and its neighbours), the value,
    whether it sits on the window's edge - the true peak may be outside)."""
    a, b = max(a, 0), min(b, len(y) - 1)
    k = a + int(np.argmax(y[a:b + 1]))
    edge = k in (a, b)
    t = float(k)
    if 0 < k < len(y) - 1:
        y0, y1, y2 = y[k - 1], y[k], y[k + 1]
        den = y0 - 2 * y1 + y2
        if den < 0:
            t = k + 0.5 * (y0 - y2) / den
    return t, float(y[k]), edge


# ---------------------------------------------------------------- 1. balance
def hull(p: np.ndarray) -> np.ndarray:
    """Convex hull (counter-clockwise) of (N, 2) points; fewer than 3 distinct points come back as they are."""
    pts = sorted(set(map(tuple, np.round(np.asarray(p, float), 9))))
    if len(pts) < 3:
        return np.array(pts, float).reshape(-1, 2)
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])  # noqa: E731
    lower, upper = [], []
    for q in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], q) <= 0:
            lower.pop()
        lower.append(q)
    for q in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], q) <= 0:
            upper.pop()
        upper.append(q)
    return np.array(lower[:-1] + upper[:-1], float)


def _seg_dist(q, a, b) -> float:
    ab = b - a
    u = float(np.clip((q - a) @ ab / max(ab @ ab, 1e-18), 0.0, 1.0))
    return float(np.linalg.norm(q - (a + u * ab)))


def signed_distance(q: np.ndarray, poly: np.ndarray) -> float:
    """Distance from 2-D point ``q`` to the edge of convex polygon ``poly`` (counter-clockwise): + inside, - outside.
    A polygon of 1 or 2 points has no inside: minus the distance to it."""
    q = np.asarray(q, float)
    n = len(poly)
    if n == 0:
        return -math.inf
    if n == 1:
        return -float(np.linalg.norm(q - poly[0]))
    edges = [(poly[i], poly[(i + 1) % n]) for i in range(n if n > 2 else 1)]
    d = min(_seg_dist(q, a, b) for a, b in edges)
    if n < 3:
        return -d
    inside = all((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0 for a, b in edges)
    return d if inside else -d


def contacts(m: Motion) -> np.ndarray:
    """(T, 2, P) True where a sole point bears weight: within ``CONTACT_H`` of the ground and moving slower
    than ``CONTACT_V`` (3-D speed, central difference)."""
    p = m.sole
    v = np.zeros(p.shape[:-1])
    if len(p) > 1:
        d = np.linalg.norm(np.diff(p, axis=0), axis=-1) * m.fps
        v[1:] = d
        v[0] = d[0]
        v[1:-1] = 0.5 * (d[1:] + d[:-1])
    return (p[..., 1] <= CONTACT_H) & (v <= CONTACT_V)


def xcom(m: Motion) -> Tuple[np.ndarray, np.ndarray, float]:
    """(CoM (T, 3), XCoM (T, 2) on the ground [x, z], w0): XCoM = CoM + v / w0, w0 = sqrt(g / l), l = the rest
    pose's CoM height (the inverted pendulum's length, Hof et al. 2005)."""
    c = m.com
    v = sg(c, m.fps, 1)
    w0 = math.sqrt(G / m.com_height_rest)
    return c, c[:, [0, 2]] + v[:, [0, 2]] / w0, w0


def zmp(m: Motion) -> Tuple[np.ndarray, np.ndarray]:
    """(ZMP (T, 2) on the ground [x, z], vertical ground force / body weight (T,)): the point the ground must push
    through for the segments to accelerate as they do (point masses, ground y = 0):
        x_zmp = sum m_i ((a_iy + g) x_i - a_ix y_i) / sum m_i (a_iy + g)."""
    a = sg(m.seg, m.fps, 2)  # (T, S, 3)
    fy = np.einsum("s,ts->t", m.mass, a[..., 1] + G)
    num = np.stack([np.einsum("s,ts->t", m.mass, (a[..., 1] + G) * m.seg[..., k] - a[..., k] * m.seg[..., 1]) for k in (0, 2)], 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        z = num / fy[:, None]
    return z, fy / G


def balance(m: Motion) -> dict:
    """Static and dynamic balance, frame by frame (see the module text).  Margins in metres, + = inside."""
    T = len(m)
    on = contacts(m)
    c, xc, w0 = xcom(m)
    zp, load = zmp(m)
    h = edge(m.fps)
    stat = np.full(T, np.nan)
    dyn = np.full(T, np.nan)
    zm = np.full(T, np.nan)
    polys: List[np.ndarray] = []
    n_feet = on.any(2).sum(1)
    for t in range(T):
        q = m.sole[t][on[t]][:, [0, 2]]
        P = hull(q) if len(q) else np.zeros((0, 2))
        polys.append(P)
        if len(P):
            stat[t] = signed_distance(c[t, [0, 2]], P)
            if h <= t < T - h:
                dyn[t] = signed_distance(xc[t], P)
                zm[t] = signed_distance(zp[t], P) if load[t] > 0.05 else -math.inf  # feet down, nothing to push on
    flight = n_feet == 0
    # support grows (a foot comes down / a heel or toe lands) on these frames
    grew = np.zeros(T, bool)
    grew[1:] = (on[1:] & ~on[:-1]).any((1, 2))
    excursions = []
    for a, b in runs(np.nan_to_num(dyn, nan=0.0) < -BALANCE_TOL):
        depth = float(-np.nanmin(dyn[a:b + 1]))
        worst = a + int(np.nanargmin(dyn[a:b + 1]))
        end = b + 1  # first frame back inside (or past the end)
        lo, hi = max(end - STEP_WINDOW, 0), min(end + STEP_WINDOW, T - 1)
        by_step = bool(grew[lo:hi + 1].any()) if end < T - h else False
        nxt = end if end < T else None
        to_flight = bool(nxt is not None and flight[nxt])
        if end >= T - h:
            verdict = "open at the end of the clip"
        elif by_step:
            verdict = "ended by a step"
        elif to_flight:
            verdict = "ended by leaving the ground"
        elif depth <= RECOVER_TOL:
            verdict = "shallow, won back without a step"
        else:
            verdict = "won back WITHOUT a step (not physical)"
        excursions.append(dict(frames=[a, b], seconds=[round(a / m.fps, 3), round(b / m.fps, 3)],
                               depth_m=round(depth, 4), worst_frame=worst, verdict=verdict,
                               feet_down=int(n_feet[worst])))
    ok = ~flight

    def summary(margin, mask_extra=None):
        mk = ok & np.isfinite(margin) if mask_extra is None else ok & np.isfinite(margin) & mask_extra
        return _summary(margin, mk)

    def _summary(margin, mk):
        if not mk.any():
            return dict(frames=0)
        mm = margin[mk]
        idx = np.nonzero(mk)[0]
        w = int(idx[int(np.argmin(mm))])
        return dict(frames=int(mk.sum()), out=int((mm < -BALANCE_TOL).sum()), share_out=round(float((mm < -BALANCE_TOL).mean()), 4),
                    worst_m=round(float(mm.min()), 4), worst_frame=w, median_m=round(float(np.median(mm)), 4))

    single = n_feet == 1
    double = n_feet == 2
    field_agree = None
    if m.contact_field is not None:
        field_agree = [round(float(np.mean(on.any(2)[:, k] == (m.contact_field[:, k] >= 0.5))), 4) for k in range(2)]
    bad = [e for e in excursions if e["verdict"].startswith("won back WITHOUT")]
    hit = np.zeros(T, bool)
    for e in m.events:
        if e.get("type") == "block":
            i = int(e["i"])
            hit[max(i - 2, 0):i + 3] = True
    judged = (~flight) & ~np.isnan(zm)
    zout = judged & (np.nan_to_num(zm, nan=0.0, neginf=-9.0) < -ZMP_TOL)
    zruns = []
    for a, b in runs(zout):
        k = a + int(np.nanargmin(np.where(np.isfinite(zm[a:b + 1]), zm[a:b + 1], -9.0)))
        zruns.append(dict(frames=[a, b], worst_frame=k, depth_m=round(float(-zm[k]), 4) if np.isfinite(zm[k]) else None,
                          at_hit=bool(hit[a:b + 1].any()), near=near_event(m, a, b)))
    lowest = np.where(on, m.sole[..., 1], np.inf).min(2)  # (T, 2) lowest weight-bearing point of each foot
    hover = [int(((lowest[:, k] > HOVER) & np.isfinite(lowest[:, k])).sum()) for k in range(2)]
    zsum = dict(frames=int(judged.sum()), out=int(zout.sum()), out_not_at_hit=int((zout & ~hit).sum()), runs=zruns,
                median_m=round(float(np.nanmedian(np.where(np.isfinite(zm), zm, np.nan)[judged])), 4) if judged.any() else None)
    return dict(w0=round(w0, 4), edge_frames=h, hover_frames=hover, zmp=zsum, _zmp=zm, _zmp_xz=zp, _load=load, pendulum_m=round(m.com_height_rest, 4), flight_frames=int(flight.sum()),
                single_support_frames=int(single.sum()), double_support_frames=int(double.sum()),
                static=dict(all=summary(stat), single=summary(stat, single), double=summary(stat, double)),
                dynamic=dict(all=summary(dyn), single=summary(dyn, single), double=summary(dyn, double)),
                excursions=excursions, not_physical=len(bad), contact_agreement_with_clip=field_agree,
                _static=stat, _dynamic=dyn, _com=c, _xcom=xc, _polys=polys, _on=on)


# ---------------------------------------------------------------- 2. jerk
def channels(m: Motion) -> Dict[str, Tuple[np.ndarray, str]]:
    """name -> ((T, 3) path, unit): landmark positions in mm (``JERK_POINTS``), joint rotation paths in degrees
    (``rot_`` + bone: the bone against its parent; the pelvis against the world)."""
    out = {}
    for k in JERK_POINTS:
        out[k] = (m.pts[k] * 1000.0, "mm")
    for b in JERK_BONES:
        base = b[:-1] if b[-1] in "LR" and b[:-1] in PARENT else b
        side = b[-1] if base != b else ""
        Wb = m.W[b]
        if base == "pelvis":
            R = Wb
        else:
            par = PARENT[base]
            Wp = m.W[par + side] if par not in ("pelvis", "chest") else m.W[par]
            R = np.swapaxes(Wp, -1, -2) @ Wb
        out["rot_" + b] = (np.degrees(rotvec_path(R)), "deg")
    return out


def normalized_jerk(x: np.ndarray, fps: float, a: int, b: int, j: Optional[np.ndarray] = None) -> float:
    """Dimensionless jerk of the path x[a..b] (Hogan & Sternad 2009):  NJ = sqrt(1/2 * integral |jerk|^2 dt *
    D^5 / A^2), D = duration, A = path length.  A minimum-jerk stroke scores sqrt(360) = 18.97, a half-cosine
    stroke pi^3 / 4 = 7.75; more = more jerk for the same distance and time.  Jerk from ``sg`` over the WHOLE
    signal (no edge effects at a and b)."""
    x = np.asarray(x, float)
    if j is None:
        j = sg(x, fps, 3)
    D = (b - a) / fps
    A = float(np.linalg.norm(np.diff(x[a:b + 1], axis=0), axis=1).sum())
    if D <= 0 or A <= 1e-12:
        return float("nan")
    jj = np.sum(j[a:b + 1] ** 2, axis=1)
    integral = float(np.trapezoid(jj, dx=1.0 / fps)) if hasattr(np, "trapezoid") else float(np.trapz(jj, dx=1.0 / fps))
    return math.sqrt(0.5 * integral * D ** 5 / A ** 2)


def spikes(x: np.ndarray, fps: float, floor: float) -> Tuple[np.ndarray, float, List[dict]]:
    """(score per frame, threshold, [spike]) of one path (T, d): score = |x - cubic fit through the window| (0 on
    the ``edge`` frames, which are not judged)."""
    r = np.linalg.norm(np.asarray(x, float) - sg(x, fps, 0), axis=1)
    h = edge(fps)
    r[:h] = 0.0  # (a cubic fitted to the first / last window passes close to its end frames by construction)
    r[len(r) - h:] = 0.0
    thr = robust_threshold(r[h:len(r) - h] if len(r) > 2 * h else r, floor)
    out = []
    for a, b in merge_runs(runs(r > thr), BURST_GAP):
        k = a + int(np.argmax(r[a:b + 1]))
        out.append(dict(frame=k, frames=[a, b], score=round(float(r[k]), 3)))
    return r, thr, out


def merge_runs(rr: List[Tuple[int, int]], gap: int) -> List[Tuple[int, int]]:
    """Runs (sorted by start) with at most ``gap`` frames between them joined into one."""
    out: List[List[int]] = []
    for a, b in sorted(rr):
        if out and a - out[-1][1] - 1 <= gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [(a, b) for a, b in out]


def near_event(m: "Motion", a: int, b: int, reach: int = 5) -> Optional[str]:
    best = None
    for e in m.events:
        if e.get("type") in ("punch", "block"):
            i = int(e["i"])
            d = 0 if a <= i <= b else min(abs(i - a), abs(i - b))
            if d <= reach and (best is None or d < best[0]):
                best = (d, f"{e.get('name', '')} {e['type']} f{i}".strip())
    return best[1] if best else None


def jerk(m: Motion, step_windows: Optional[List[dict]] = None) -> dict:
    """Spikes and smoothed jerk per channel, jerky moments, and the normalized jerk of every step (an ankle's swing,
    from the frame before it leaves the ground to the frame it is back; ``step_windows``: use these instead -
    the source's, to measure an import over the same frames)."""
    T = len(m)
    res: dict = dict(window=sg_window(m.fps), order=SG_ORDER, cutoff_hz=round(sg_cutoff_hz(m.fps), 2), channels={})
    for name, (x, unit) in channels(m).items():
        floor = SPIKE_FLOOR_MM if unit == "mm" else SPIKE_FLOOR_DEG
        score, thr, sp = spikes(x, m.fps, floor)
        j = np.linalg.norm(sg(x, m.fps, 3), axis=1)  # mm/s^3 or deg/s^3
        res["channels"][name] = dict(unit=unit, threshold=round(thr, 3), spikes=sp,
                                     jerk_peak=round(float(j.max()) / (1000.0 if unit == "mm" else 1.0), 1),
                                     jerk_peak_unit="m/s^3" if unit == "mm" else "deg/s^3",
                                     jerk_peak_frame=int(j.argmax()), jerk_median=round(float(np.median(j)) /
                                                                                        (1000.0 if unit == "mm" else 1.0), 1),
                                     _score=score, _jerk=j)
    # per step (an ankle's swing: from leaving the ground to coming back down)
    on = contacts(m).any(2)
    steps = []
    if step_windows is not None:
        for v in step_windows:
            x = m.pts["ankle" + v["foot"]]
            a, b = v["frames"]
            steps.append(dict(foot=v["foot"], frames=[a, b], nj=round(normalized_jerk(x, m.fps, a, b), 2), window="source"))
    else:
        for k, s in enumerate(SIDES):
            x = m.pts["ankle" + s]
            jx = sg(x, m.fps, 3)
            for a, b in runs(~on[:, k]):
                if a == 0 or b == T - 1 or b - a < 4:
                    continue  # a swing cut by the clip's ends, or too short to measure
                steps.append(dict(foot=s, frames=[a - 1, b + 1], nj=round(normalized_jerk(x, m.fps, a - 1, b + 1, jx), 2)))
    res["steps"] = sorted(steps, key=lambda v: v["frames"][0])
    res["n_spikes"] = sum(len(c["spikes"]) for c in res["channels"].values())
    # jerky moments: the spikes of all channels, overlapping in time, joined
    allr = [(sp["frames"][0], sp["frames"][1]) for c in res["channels"].values() for sp in c["spikes"]]
    moments = []
    for a, b in merge_runs(allr, BURST_GAP):
        inv = sorted([(n, sp["score"], c["unit"], sp["frame"]) for n, c in res["channels"].items() for sp in c["spikes"]
                      if a <= sp["frame"] <= b], key=lambda v: -v[1] / (1.0 if v[2] == "mm" else 0.5))
        moments.append(dict(frames=[a, b], channels=len(inv), top=[dict(channel=n, score=sc, unit=u, frame=f) for n, sc, u, f in inv[:4]],
                            near=near_event(m, a, b)))
    res["moments"] = moments
    return res


# ---------------------------------------------------------------- 3. punch sequencing
def chain_signals(m: Motion, side: str) -> Dict[str, np.ndarray]:
    """Per frame, for a punch thrown with ``side``'s hand: pelvis and chest turn rates (deg/s, world, + = turning
    the way that punch turns the body: to his left for a right hand), shoulder angular speed (upper arm against
    the chest, deg/s; also split into its twist about the upper arm and swing of it), elbow extension rate (deg/s,
    + = opening), wrist speed (m/s, world)."""
    sgn = 1.0 if side == "R" else -1.0
    pel = sg(np.degrees(rotvec_path(m.W["pelvis"], world=True)), m.fps, 1)[:, 1] * sgn
    che = sg(np.degrees(rotvec_path(m.W["chest"], world=True)), m.fps, 1)[:, 1] * sgn
    rel = np.swapaxes(m.W["chest"], -1, -2) @ m.W["upperarm" + side]
    om = sg(np.degrees(rotvec_path(rel)), m.fps, 1)  # in the upper arm's own frame
    sho = np.linalg.norm(om, axis=1)
    # split into twist about the bone and swing of the bone (reported, not part of the chain)
    ax = np.einsum("tji,tj->ti", m.W["upperarm" + side], m.pts["elbow" + side] - m.pts["shoulder" + side])
    ax /= np.maximum(np.linalg.norm(ax, axis=1, keepdims=True), 1e-12)
    twist = np.sum(om * ax, 1)
    u = m.pts["shoulder" + side] - m.pts["elbow" + side]
    f = m.pts["wrist" + side] - m.pts["elbow" + side]
    ang = np.degrees(np.arccos(np.clip(np.sum(u * f, 1) / (np.linalg.norm(u, axis=1) * np.linalg.norm(f, axis=1)), -1, 1)))
    elb = sg(ang, m.fps, 1)
    wri = np.linalg.norm(sg(m.pts["wrist" + side], m.fps, 1), axis=1)
    return dict(pelvis=pel, chest=che, shoulder=sho, elbow=elb, wrist=wri, shoulder_twist=np.abs(twist),
                shoulder_swing=np.linalg.norm(om - twist[:, None] * ax, axis=1))


def sequence(sig: Dict[str, np.ndarray], fps: float, wrist_peak: int, onset: Optional[int] = None) -> dict:
    """Order of the speed peaks along ``CHAIN`` in [onset - PUNCH_LEAD, wrist peak + PUNCH_AFTER] (frames; the
    wrist's onset found from its speed when not given; never more than PUNCH_ONSET_MAX before the peak).  ``order_ok``: no taking-part segment peaks more than one frame
    before the segment inside it; ``lags``: seconds from each taking-part segment to the next one out;
    ``breaks``: [{kind 'reversed' | 'loose' (more than LAG_MAX apart), outer, inner, ms}]."""
    w = sig["wrist"]
    if onset is None:
        onset = wrist_peak
        lim = max(int(wrist_peak - PUNCH_ONSET_MAX * fps), 0)
        while onset > lim and w[onset - 1] > PUNCH_ONSET * w[wrist_peak]:
            onset -= 1
    a = max(int(onset - round(PUNCH_LEAD * fps)), int(wrist_peak - round(PUNCH_ONSET_MAX * fps)), 0)
    b = min(int(wrist_peak + round(PUNCH_AFTER * fps)), len(w) - 1)
    peaks = {}
    for name in CHAIN:
        t, v, edge = peak_time(sig[name], a, b)
        peaks[name] = dict(frame=round(t, 2), value=round(v, 2), edge=edge, takes_part=bool(v >= PARTICIPATE[name]))
    part = [n for n in CHAIN if peaks[n]["takes_part"]]
    breaks, lags = [], {}
    for p, q in zip(part[:-1], part[1:]):
        lag = (peaks[q]["frame"] - peaks[p]["frame"]) / fps
        lags[f"{p}->{q}"] = round(lag, 4)
        if lag < -ORDER_TOL_FRAMES / fps:
            breaks.append(dict(kind="reversed", outer=q, inner=p, ms=round(-lag * 1000, 1)))
        elif lag > LAG_MAX:
            breaks.append(dict(kind="loose", outer=q, inner=p, ms=round(lag * 1000, 1)))
    order = sorted(part, key=lambda n: peaks[n]["frame"])
    return dict(onset=int(onset), window=[a, b], peaks=peaks, taking_part=part, order=order, lags=lags, breaks=breaks,
                order_ok=not any(x["kind"] == "reversed" for x in breaks), lags_ok=not any(x["kind"] == "loose" for x in breaks))


def lead_side(m: Motion) -> str:
    """The foot ahead along the pelvis' facing on frame 0 (an orthodox stance leads with the left)."""
    fwd = m.W["pelvis"][0] @ np.array([0.0, 0.0, 1.0])
    d = (m.pts["ankleL"][0] - m.pts["ankleR"][0]) @ fwd
    return "L" if d >= 0 else "R"


def find_punches(m: Motion) -> List[dict]:
    """[{side, press (frame or None), name, wrist_peak}]: from the events ('punch'; a jab or hook is thrown with
    the lead hand, anything else named with the rear hand) or, without events, from the wrist's speed."""
    T = len(m)
    lead = lead_side(m)
    rear = "R" if lead == "L" else "L"
    vrel = {s: sg(m.pts["wrist" + s] - m.pts["pelvis"], m.fps, 1) for s in SIDES}
    speed = {s: np.linalg.norm(vrel[s], axis=1) for s in SIDES}
    facing = m.W["pelvis"] @ np.array([0.0, 0.0, 1.0])
    facing[:, 1] = 0.0
    facing /= np.maximum(np.linalg.norm(facing, axis=1, keepdims=True), 1e-9)
    world = {s: np.linalg.norm(sg(m.pts["wrist" + s], m.fps, 1), axis=1) for s in SIDES}
    reach, reach_rate = {}, {}
    for s in SIDES:
        arm = (np.linalg.norm(m.pts["elbow" + s][0] - m.pts["shoulder" + s][0])
               + np.linalg.norm(m.pts["wrist" + s][0] - m.pts["elbow" + s][0]))
        reach[s] = np.linalg.norm(m.pts["wrist" + s] - m.pts["shoulder" + s], axis=1) / arm
        reach_rate[s] = sg(reach[s], m.fps, 1)
    ev = [e for e in m.events if e.get("type") == "punch"]
    out = []
    if ev:
        for e in ev:
            name = str(e.get("name", ""))
            side = lead if name in ("jab", "hook", "lead") else rear
            i = int(e["i"])
            nxt = [int(x["i"]) for x in ev if int(x["i"]) > i and
                   (lead if str(x.get("name", "")) in ("jab", "hook", "lead") else rear) == side]
            hit = [int(x["i"]) for x in m.events if x.get("type") == "block" and x.get("name") == name and int(x["i"]) >= i]
            a = max(int(round(i + PUNCH_SEARCH[0] * m.fps)), 0)
            b = min(int(round(i + PUNCH_SEARCH[1] * m.fps)), T - 1, (nxt[0] - 1) if nxt else T - 1,
                    hit[0] if hit else T - 1)
            # bounded by the fist's arrival the stroke is the fastest the wrist goes; without that event, only while
            # the arm is extending (so the hand coming back from an earlier punch is not taken for this one)
            w = world[side][a:b + 1] * (1.0 if hit else (reach_rate[side][a:b + 1] > 0))
            k = a + int(np.argmax(w))
            out.append(dict(side=side, press=i, name=name, wrist_peak=k, found="event"))
        return out
    near = int(round(0.1 * m.fps))
    sep = int(round(DETECT_SEP * m.fps))
    for s in SIDES:
        v = speed[s]
        o = "R" if s == "L" else "L"
        fwd = np.sum(vrel[s] * facing, 1)
        cand = [k for k in range(1, T - 1) if v[k] >= DETECT_SPEED and v[k] >= v[k - 1] and v[k] > v[k + 1]
                and reach[s][max(k - near, 0):k + near + 1].max() >= DETECT_REACH
                and fwd[k] >= DETECT_FORWARD * v[k] and speed[o][k] < DETECT_ALONE * v[k]]
        kept: List[int] = []
        for k in sorted(cand, key=lambda k: -v[k]):
            if all(abs(k - q) >= sep for q in kept):
                kept.append(k)
        for k in sorted(kept):
            out.append(dict(side=s, press=None, name="", wrist_peak=int(k), found="wrist speed"))
    return sorted(out, key=lambda p: p["wrist_peak"])


def punches(m: Motion, given: Optional[List[dict]] = None) -> List[dict]:
    """Sequencing (``sequence``) and the normalized jerk of the wrist's outward stroke for every punch.  ``given``:
    the source's punches - the import is then measured over the SAME frames (the source's onset and stroke; its
    own wrist peak looked for within 3 frames of the source's), so the numbers compare like for like."""
    found = given if given is not None else find_punches(m)
    out = []
    for p in found:
        sig = chain_signals(m, p["side"])
        k = int(p["wrist_peak"])
        if given is not None:  # the import's own wrist peak near the source's (the same punch, a frame or two off)
            lo, hi = max(k - 3, 0), min(k + 3, len(m) - 1)
            k = lo + int(np.argmax(sig["wrist"][lo:hi + 1]))
        seq = sequence(sig, m.fps, k, onset=p.get("onset") if given is not None else None)
        if given is not None and p.get("stroke"):
            a, b = p["stroke"]
        else:
            a, b = seq["onset"], k
            w = sig["wrist"]
            lim = min(int(k + PUNCH_ONSET_MAX * m.fps), len(w) - 1)
            while b < lim and w[b + 1] > PUNCH_ONSET * w[k]:
                b += 1
            b = min(b + 1, len(w) - 1)  # (the first frame below: the stroke goes from rest-ish to rest-ish)
            a = max(a - 1, 0)
        nj = normalized_jerk(m.pts["wrist" + p["side"]], m.fps, a, b) if b - a >= 3 else float("nan")
        wa, wb = seq["window"]
        split = {n: round(float(sig[n][wa:wb + 1].max()), 1) for n in ("shoulder_twist", "shoulder_swing")}
        out.append(dict(p, wrist_peak=k, onset=seq["onset"], sequence=seq, stroke=[a, b], stroke_s=round((b - a) / m.fps, 4),
                        shoulder_split=split,
                        wrist_speed=round(float(sig["wrist"][k]), 2), nj=round(nj, 2), _sig=sig))
    return out


# ---------------------------------------------------------------- one clip (and its source)
def evaluate(m: Motion, like: Optional[dict] = None) -> dict:
    """All three checks.  ``like``: the source's report - punches and steps are then measured over its frames."""
    return dict(name=m.name, frames=len(m), fps=m.fps, meta=m.meta, balance=balance(m),
                jerk=jerk(m, like["jerk"]["steps"] if like else None), punches=punches(m, like["punches"] if like else None))


def attribute(src: dict, imp: dict) -> dict:
    """What the import added to its source, frame for frame (the two have the same frames)."""
    out: dict = {}
    # balance: frames where the import is out and the source is not
    for kind in ("_static", "_dynamic", "_zmp"):
        tol = ZMP_TOL if kind == "_zmp" else BALANCE_TOL
        a, b = src["balance"][kind], imp["balance"][kind]
        n = min(len(a), len(b))
        a, b = a[:n], b[:n]
        both = ~np.isnan(a) & ~np.isnan(b)  # judged in both (neither in flight there)
        imp_out = both & (np.nan_to_num(b, nan=0.0) < -tol)
        src_out = both & (np.nan_to_num(a, nan=0.0) < -tol)
        diff = np.where(both, np.nan_to_num(np.clip(b, -9, 9) - np.clip(a, -9, 9), nan=0.0), 0.0)
        w = int(np.argmin(diff))
        out[kind[1:]] = dict(judged_in_both=int(both.sum()), both_out=int((imp_out & src_out).sum()),
                             import_only=int((imp_out & ~src_out).sum()), source_only=int((src_out & ~imp_out).sum()),
                             most_worse_m=round(float(diff[w]), 4), most_worse_frame=w)
    # frames where the two do not agree which sole points carry weight (a foot down in one, up in the other)
    ci, cs = imp["balance"]["_on"].any(2), src["balance"]["_on"].any(2)
    n = min(len(ci), len(cs))
    out["feet_down_differ"] = dict(frames=int((ci[:n] != cs[:n]).any(1).sum()),
                                   first=[int(x) for x in np.nonzero((ci[:n] != cs[:n]).any(1))[0][:12]])
    # jerk spikes: in the source already (it scores at least SAME_SPIKE of the import there, a frame either way)?
    sp = []
    for name, ci in imp["jerk"]["channels"].items():
        cs = src["jerk"]["channels"][name]
        for s in ci["spikes"]:
            f = s["frame"]
            there = float(cs["_score"][max(s["frames"][0] - 1, 0):s["frames"][1] + 2].max())
            sp.append(dict(channel=name, frame=f, score=s["score"], source_score=round(there, 3),
                           unit=ci["unit"], origin="source" if there >= SAME_SPIKE * s["score"] else "import"))
    out["spikes"] = sorted(sp, key=lambda v: (v["frame"], v["channel"]))
    out["spikes_from_import"] = sum(1 for s in sp if s["origin"] == "import")
    out["spikes_from_source"] = sum(1 for s in sp if s["origin"] == "source")
    smoothed = []
    for name, cs in src["jerk"]["channels"].items():
        ci = imp["jerk"]["channels"][name]
        for s in cs["spikes"]:
            f = s["frame"]
            if float(ci["_score"][max(s["frames"][0] - 1, 0):s["frames"][1] + 2].max()) < SAME_SPIKE * s["score"]:
                smoothed.append(dict(channel=name, frame=f, score=s["score"]))
    out["source_spikes_gone"] = smoothed
    # punches
    pp = []
    for ps, pi in zip(src["punches"], imp["punches"]):
        ls, li = ps["sequence"]["lags"], pi["sequence"]["lags"]
        moved = {k: round((li[k] - ls[k]) * 1000, 1) for k in ls if k in li and abs(li[k] - ls[k]) > ORDER_TOL_FRAMES / imp["fps"]}
        pp.append(dict(name=ps.get("name"), side=ps["side"], source_order=ps["sequence"]["order"],
                       import_order=pi["sequence"]["order"], source_ok=ps["sequence"]["order_ok"],
                       import_ok=pi["sequence"]["order_ok"], lag_changed_ms=moved, nj_source=ps["nj"], nj_import=pi["nj"],
                       wrist_speed=[ps["wrist_speed"], pi["wrist_speed"]],
                       peak_speeds={n: [ps["sequence"]["peaks"][n]["value"], pi["sequence"]["peaks"][n]["value"]] for n in CHAIN},
                       shoulder_split=dict(source=ps["shoulder_split"], clip=pi["shoulder_split"])))
    out["punches"] = pp
    return out


def strip(o):
    """The report without the per-frame arrays (keys starting with '_')."""
    if isinstance(o, dict):
        return {k: strip(v) for k, v in o.items() if not str(k).startswith("_")}
    if isinstance(o, list):
        return [strip(v) for v in o]
    if isinstance(o, tuple):
        return [strip(v) for v in o]
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, float) and not math.isfinite(o):
        return None
    return o


def com_model_gap(m: Motion, c: Optional[Clip] = None) -> Optional[dict]:
    """For a rig clip: how far this file's CoM (de Leva) is from ``retarget.center_of_mass`` (Winter), in metres."""
    if c is None:
        return None
    d = np.zeros(len(c))
    com = m.com
    for t in range(len(c)):
        w = rt.center_of_mass(rt.fk(c.body_rots(t), c.root[t]))
        w = (w - np.array([0.0, rig.GROUND, 0.0])) / rt.UNITS_PER_M
        d[t] = float(np.linalg.norm((com[t] - w)[[0, 2]]))
    rest_d = (rig_rest_com() - (rt.center_of_mass(rt.fk({})) - np.array([0.0, rig.GROUND, 0.0])) / rt.UNITS_PER_M)
    return dict(ground_plane_max_m=round(float(d.max()), 4), ground_plane_mean_m=round(float(d.mean()), 4),
                rest_m=[round(float(v), 4) for v in rest_d])


def rig_rest_com() -> np.ndarray:
    b = rig_body()
    to_m = lambda p: (p - np.array([0.0, b.ground, 0.0])) * b.to_m  # noqa: E731
    return sum(mm * to_m(p) for _, p, mm in b.com) / sum(mm for _, _, mm in b.com)


# ---------------------------------------------------------------- Korean summary
_KO = {"pelvis": "골반", "chest": "가슴", "head": "머리", "shoulder": "어깨", "elbow": "팔꿈치", "wrist": "손목",
       "upperarm": "위팔", "forearm": "아래팔", "hand": "손", "thigh": "허벅지", "shin": "정강이", "foot": "발", "ankle": "발목"}
_KO_EVENT = {"jab": "잽", "cross": "스트레이트", "punch": "펀치", "block": "가드에 맞음"}


def ko_part(name: str) -> str:
    """'wristL' -> '왼쪽 손목', 'rot_forearmR' -> '오른쪽 아래팔 회전'."""
    rot = name.startswith("rot_")
    base = name[4:] if rot else name
    side = ""
    if base[-1:] in ("L", "R") and base[:-1] in _KO:
        base, side = base[:-1], ("왼쪽 " if base[-1] == "L" else "오른쪽 ")
    return side + _KO.get(base, base) + (" 회전" if rot else "")


def josa(word: str, pair: str) -> str:
    """word + the right particle of ``pair`` ('이가', '은는', '을를', '과와') by the last syllable's final consonant."""
    ch = word.strip()[-1:]
    has = bool(ch) and "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 != 0
    return word + (pair[0] if has else pair[1])


def ko_event(near: Optional[str]) -> str:
    if not near:
        return ""
    w = near.split()
    name = _KO_EVENT.get(w[0], w[0]) if len(w) == 3 else ""
    kind = _KO_EVENT.get(w[-2], w[-2])
    return f" ({name + ' ' if name else ''}{kind} {w[-1][1:]}프레임 근처)"


def ko_break(b: dict) -> str:
    if b["kind"] == "reversed":
        return f"{josa(ko_part(b['outer']), '이가')} {ko_part(b['inner'])}보다 {b['ms']:.0f}ms 먼저 정점(순서 뒤집힘)"
    return f"{josa(ko_part(b['outer']), '이가')} {ko_part(b['inner'])}보다 {b['ms']:.0f}ms 늦게 정점(따로 노는 동작)"


def summary_ko(name: str, rep: dict, src: Optional[dict] = None, att: Optional[dict] = None) -> str:
    """A short plain-words summary for the person planning the game (the words are explained in QC.md)."""
    L = [f"[{name}]"]
    bal = rep["balance"]
    st, dy = bal["static"]["all"], bal["dynamic"]["all"]
    if not st.get("frames"):
        L.append("- 균형: 발이 땅에 닿은 프레임이 없어 판단할 수 없음.")
    else:
        L.append(f"- 균형: 발이 닿은 {st['frames']}프레임 중 한 발로 선 프레임 {bal['single_support_frames']}, 두 발 {bal['double_support_frames']}. "
                 f"무게중심이 발 영역 밖({BALANCE_TOL * 100:.0f}cm 넘게): 멈춰 선 기준 {st['out']}프레임, 움직임까지 본 기준(XCoM) {dy['out']}프레임.")
        bad = [e for e in bal["excursions"] if e["verdict"].startswith("won back WITHOUT")]
        stepped = [e for e in bal["excursions"] if e["verdict"] in ("ended by a step", "ended by leaving the ground")]
        if bad:
            e = max(bad, key=lambda v: v["depth_m"])
            L.append(f"  ! 의심: 발을 새로 딛지 않았는데 쏠리던 몸이 되돌아온 구간 {len(bad)}곳 "
                     f"(가장 깊은 곳 {e['worst_frame']}프레임, {e['depth_m'] * 100:.0f}cm 밖).")
        if stepped:
            L.append(f"  쏠림 {len(stepped)}곳은 다음 발을 딛거나 뛰어오르며 끝남 - 스텝·걷기에서는 정상인 모양.")
        z = bal["zmp"]
        if z["out"]:
            w = max(z["runs"], key=lambda r: r["depth_m"] if r["depth_m"] is not None else 9.0)
            extra = f", 그중 {z['out'] - z['out_not_at_hit']}프레임은 주먹이 상대 가드에 닿는 순간" if z["out"] != z["out_not_at_hit"] else ""
            depth = ("발이 땅을 당겨야 함" if w["depth_m"] is None else "1m 넘게 밖" if w["depth_m"] > 1.0
                     else f"{w['depth_m'] * 100:.0f}cm 밖")
            L.append(f"  ! 발로는 만들 수 없는 가속(ZMP가 발 영역 밖): {z['out']}프레임{extra}. 가장 심한 곳 {w['worst_frame']}프레임({depth}){ko_event(w['near'])}.")
        else:
            L.append("  발로 밀어서 만들 수 있는 움직임(ZMP가 늘 발 영역 안).")
        if bal["flight_frames"]:
            L.append(f"  (두 발이 모두 뜬 {bal['flight_frames']}프레임은 판단에서 뺌)")
        if sum(bal["hover_frames"]):
            L.append(f"  (디딘 발이 바닥에서 {HOVER * 1000:.0f}mm 넘게 떠 있는 프레임: 왼발 {bal['hover_frames'][0]}, 오른발 {bal['hover_frames'][1]})")
    if att:
        d, zz = att["dynamic"], att["zmp"]
        if d["import_only"] or zz["import_only"]:
            L.append(f"  원본과 같은 프레임끼리 비교: 옮기면서 새로 발 영역을 벗어난 프레임 XCoM {d['import_only']}, ZMP {zz['import_only']} "
                     f"(원본보다 가장 나빠진 곳 {d['most_worse_frame']}프레임, {-d['most_worse_m'] * 100:.1f}cm). 나머지는 원본에도 그대로 있음.")
        else:
            L.append("  원본과 같은 프레임끼리 비교: 옮기면서 새로 생긴 균형 문제 없음 (위 내용은 원본에도 그대로 있음).")
        fd = att["feet_down_differ"]
        if fd["frames"]:
            L.append(f"  디딘 발의 판정이 원본과 다른 프레임 {fd['frames']}개 (한쪽은 발이 닿았고 다른 쪽은 1.5cm 넘게 떠 있음; 예: {', '.join(map(str, fd['first'][:6]))}).")
    jr = rep["jerk"]
    mom = jr["moments"]
    if mom:
        big = sorted(mom, key=lambda v: -v["channels"])[:3]
        L.append(f"- 덜컥거림(앞뒤 프레임의 매끄러운 흐름에서 튀어나온 곳): {len(mom)}군데 (부위별로 세면 {jr['n_spikes']}곳). 큰 곳: " + "; ".join(
            f"{v['frames'][0]}-{v['frames'][1]}프레임{ko_event(v['near'])} {v['channels']}개 부위, 가장 큰 것 {ko_part(v['top'][0]['channel'])} "
            f"{v['top'][0]['score']:.1f}{'mm' if v['top'][0]['unit'] == 'mm' else '도'}" for v in big))
    else:
        L.append("- 덜컥거림: 없음.")
    if att:
        fi, fs = att["spikes_from_import"], att["spikes_from_source"]
        L.append(f"  원본에 이미 있던 것 {fs}곳, 옮겨 오면서 생긴 것 {fi}곳.")
        imp_sp = [s for s in att["spikes"] if s["origin"] == "import"]
        if imp_sp:
            top = sorted(imp_sp, key=lambda s: -s["score"] / (1.0 if s["unit"] == "mm" else 0.5))[:3]
            L.append("  옮겨 오면서 생긴 것 중 큰 것: " + ", ".join(
                f"{s['frame']}프레임 {ko_part(s['channel'])} {s['score']:.1f}{'mm' if s['unit'] == 'mm' else '도'}"
                f"(원본 {s['source_score']:.1f})" for s in top))
        if att["source_spikes_gone"]:
            L.append(f"  원본에 있던 튐 중 {len(att['source_spikes_gone'])}곳은 옮겨 오면서 줄어듦.")
    steps = jr["steps"]
    if steps:
        sst = src["jerk"]["steps"] if src else []
        L.append(f"- 발 내딛기 {len(steps)}번의 매끄러움 지수(낮을수록 매끄러움){' - 괄호 안은 같은 프레임의 원본' if src else ''}: " + ", ".join(
            f"{'왼' if v['foot'] == 'L' else '오른'}발 {v['frames'][0]}-{v['frames'][1]} {v['nj']:.0f}"
            + (f"({sst[i]['nj']:.0f})" if i < len(sst) else "") for i, v in enumerate(steps[:9])))
    for k, p in enumerate(rep["punches"]):
        q = p["sequence"]
        nm = _KO_EVENT.get(p.get("name") or "", "펀치")
        hand = "왼손" if p["side"] == "L" else "오른손"
        order = " → ".join(ko_part(n) for n in q["order"])
        lags = ", ".join(f"{ko_part(x.split('->')[0])}→{ko_part(x.split('->')[1])} {v * 1000:+.0f}ms" for x, v in q["lags"].items())
        msg = f"- {nm}({hand}, 손목 최고속 {p['wrist_peak']}프레임 {p['wrist_speed']:.1f}m/s): 속도 정점 순서 {order} [{lags}]"
        if q["order_ok"] and q["lags_ok"]:
            msg += " - 몸 가운데에서 손끝 쪽으로 차례대로 전달됨."
        else:
            msg += " - ! " + "; ".join(ko_break(b) for b in q["breaks"])
        left_out = [ko_part(n) for n in CHAIN if n not in q["taking_part"]]
        if left_out:
            msg += f" (거의 안 움직인 부위: {', '.join(left_out)})"
        L.append(msg)
        if src is not None and k < len(src["punches"]):
            s = src["punches"][k]
            so = s["sequence"]
            moved = att["punches"][k]["lag_changed_ms"] if att else {}
            same = "순서·간격 같음" if not moved else "간격이 바뀜: " + ", ".join(
                f"{ko_part(x.split('->')[0])}→{ko_part(x.split('->')[1])} {v:+.0f}ms" for x, v in moved.items())
            ap = att["punches"][k] if att else None
            if ap:
                big = [(n, a_, b_) for n, (a_, b_) in ap["peak_speeds"].items() if a_ > 0 and abs(b_ / a_ - 1) > 0.2]
                if big:
                    same += "; 최고 속도가 20% 넘게 달라진 부위: " + ", ".join(f"{ko_part(n)} {a_:.0f}→{b_:.0f}" for n, a_, b_ in big)
                    if any(n == "shoulder" for n, _, _ in big):
                        sp_ = ap["shoulder_split"]
                        same += (f" (어깨 중 팔 비틀기 {sp_['source']['shoulder_twist']:.0f}→{sp_['clip']['shoulder_twist']:.0f}, "
                                 f"팔 휘두르기 {sp_['source']['shoulder_swing']:.0f}→{sp_['clip']['shoulder_swing']:.0f} 도/초)")
            L.append(f"    원본: {' → '.join(ko_part(n) for n in so['order'])} ({same})"
                     f"{' - 원본도 ' + '; '.join(ko_break(b) for b in so['breaks']) if so['breaks'] else ''}"
                     f"; 주먹 뻗기 매끄러움 지수(같은 프레임) 원본 {s['nj']:.0f} / 옮긴 것 {p['nj']:.0f}")
    if not rep["punches"] and any(e.get("type") == "punch" for e in rep.get("_events", [])):
        L.append("- 펀치를 찾지 못함.")
    return "\n".join(L)


# ---------------------------------------------------------------- plots
def plots(out: str, name: str, m: Motion, rep: dict, ms: Optional[Motion] = None, srep: Optional[dict] = None):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    os.makedirs(out, exist_ok=True)
    files = []
    # 1) balance from above: a few frames
    bal = rep["balance"]
    T = len(m)
    picks = []
    st, dy = bal["static"]["all"], bal["dynamic"]["all"]
    if st.get("frames"):
        picks += [("worst static", st["worst_frame"]), ("worst dynamic", dy["worst_frame"])]
    for e in m.events[:4]:
        if e.get("type") == "punch" and 0 <= int(e["i"]) < T:
            picks.append((f"{e.get('name', 'punch')} press", int(e["i"])))
    if len(picks) < 4:
        picks += [("frame", int(f)) for f in np.linspace(0, T - 1, 4 - len(picks) + 2)[1:-1]]
    picks = picks[:6]
    rows = [("import" if ms is not None else name, m, bal)] + ([("source", ms, srep["balance"])] if ms is not None else [])
    fig, axs = plt.subplots(len(rows), len(picks), figsize=(3.0 * len(picks), 3.2 * len(rows)), squeeze=False)
    for r, (label, mm, bb) in enumerate(rows):
        for cidx, (what, f) in enumerate(picks):
            ax = axs[r, cidx]
            for k in range(2):
                ft = hull(mm.sole[f, k][:, [0, 2]])
                ax.fill(ft[:, 0], ft[:, 1], color="0.88", ec="0.6", lw=0.8)
            P = bb["_polys"][f]
            if len(P) >= 3:
                ax.fill(P[:, 0], P[:, 1], color="#cfe3f5", ec="#2b6cb0", lw=1.2, alpha=0.8)
            elif len(P):
                ax.plot(P[:, 0], P[:, 1], "o-", color="#2b6cb0")
            on = bb["_on"][f]
            ax.plot(mm.sole[f][on][:, 0], mm.sole[f][on][:, 2], ".", color="#2b6cb0", ms=4)
            c, x = bb["_com"][f], bb["_xcom"][f]
            ax.annotate("", xy=(x[0], x[1]), xytext=(c[0], c[2]), arrowprops=dict(arrowstyle="->", color="#c53030", lw=1.2))
            ax.plot(c[0], c[2], "o", color="#1a202c", ms=6, label="CoM")
            ax.plot(x[0], x[1], "x", color="#c53030", ms=8, mew=2, label="XCoM")
            sm, dm = bb["_static"][f], bb["_dynamic"][f]
            ax.set_title(f"{label} f{f} ({what})\nstatic {sm * 100:+.1f} / XCoM {dm * 100:+.1f} cm"
                         if np.isfinite(sm) else f"{label} f{f} ({what})\nno contact", fontsize=8)
            ax.set_aspect("equal")
            allp = np.concatenate([mm.sole[f].reshape(-1, 3)[:, [0, 2]], [c[[0, 2]]], [x]])
            lo, hi = allp.min(0) - 0.08, allp.max(0) + 0.08
            ax.set_xlim(lo[0], hi[0])
            ax.set_ylim(lo[1], hi[1])
            ax.tick_params(labelsize=6)
            if r == 0 and cidx == 0:
                ax.legend(fontsize=6, loc="best")
    fig.suptitle(f"{name}: centre of mass (o) and extrapolated CoM (x) over the support polygon (blue), from above; x = his left, up = forward",
                 fontsize=9)
    fig.tight_layout()
    p = os.path.join(out, "balance_above.png")
    fig.savefig(p, dpi=110)
    plt.close(fig)
    files.append(p)
    # 1b) margins over time
    fig, ax = plt.subplots(figsize=(10, 3.2))
    t = np.arange(T)
    ax.plot(t, bal["_static"] * 100, color="0.5", lw=1, label=("import " if ms is not None else "") + "static CoM")
    ax.plot(t, bal["_dynamic"] * 100, color="#c53030", lw=1.4, label=("import " if ms is not None else "") + "XCoM")
    ax.plot(t, np.clip(bal["_zmp"], -1.0, None) * 100, color="#d69e2e", lw=1.0, label=("import " if ms is not None else "") + "ZMP")
    if ms is not None:
        ax.plot(np.arange(len(ms)), srep["balance"]["_dynamic"] * 100, color="#2b6cb0", lw=1, ls="--", label="source XCoM")
    ax.axhline(-BALANCE_TOL * 100, color="k", lw=0.6, ls=":")
    ax.axhline(0, color="k", lw=0.6)
    for e in bal["excursions"]:
        if e["verdict"].startswith("won back WITHOUT"):
            ax.axvspan(e["frames"][0], e["frames"][1], color="#fbd38d", alpha=0.6)
    for e in m.events:
        if e.get("type") in ("punch", "block"):
            ax.axvline(int(e["i"]), color="#805ad5", lw=0.6, ls="--")
    ax.set_xlabel("frame")
    ax.set_ylabel("margin to support edge, cm (+ inside)")
    lo = np.nanmin(np.concatenate([bal["_static"], bal["_dynamic"]])) * 100 if np.isfinite(bal["_static"]).any() else -50
    ax.set_ylim(max(lo - 5, -100), 30)
    ax.legend(fontsize=7, ncol=4)
    ax.set_title(f"{name}: balance margin (orange = out and won back without a step; purple = punch / block events)", fontsize=9)
    fig.tight_layout()
    p = os.path.join(out, "balance_margin.png")
    fig.savefig(p, dpi=110)
    plt.close(fig)
    files.append(p)
    # 2) punch speed curves
    colors = dict(pelvis="#2f855a", chest="#3182ce", shoulder="#805ad5", elbow="#dd6b20", wrist="#c53030")
    for k, pch in enumerate(rep["punches"]):
        rowsp = [("import" if ms is not None else name, pch, m.fps)]
        if ms is not None and k < len(srep["punches"]):
            rowsp.append(("source", srep["punches"][k], ms.fps))
        fig, axs = plt.subplots(1, len(rowsp), figsize=(6 * len(rowsp), 3.4), squeeze=False)
        for c_, (label, pp, fps) in enumerate(rowsp):
            ax = axs[0, c_]
            sig = pp["_sig"]
            a, b = pp["sequence"]["window"]
            lo, hi = max(a - 12, 0), min(b + 12, len(sig["wrist"]) - 1)
            tt = np.arange(lo, hi + 1)
            for nme in CHAIN:
                y = sig[nme][lo:hi + 1]
                pk = pp["sequence"]["peaks"][nme]
                scale = max(abs(pk["value"]), 1e-9)
                ls = "-" if pk["takes_part"] else ":"
                ax.plot(tt, y / scale, ls, color=colors[nme], lw=1.3, label=f"{nme} ({pk['value']:.0f}{'m/s' if nme == 'wrist' else ' deg/s'})"
                        if nme != "wrist" else f"wrist ({pk['value']:.1f} m/s)")
                ax.plot(pk["frame"], 1.0, "v", color=colors[nme], ms=7)
            ax.axvspan(a, b, color="0.93")
            if pp.get("press") is not None:
                ax.axvline(pp["press"], color="k", lw=0.6, ls="--")
            ok = pp["sequence"]["order_ok"] and pp["sequence"]["lags_ok"]
            ax.set_title(f"{label}: {pp.get('name') or 'punch'} ({pp['side']}) order {' > '.join(pp['sequence']['order'])}"
                         f" {'OK' if ok else 'BROKEN'}", fontsize=8)
            ax.set_xlabel("frame")
            ax.set_ylabel("speed / its peak in the window")
            ax.set_ylim(-0.6, 1.25)
            ax.legend(fontsize=6, loc="lower left")
        fig.tight_layout()
        p = os.path.join(out, f"punch_{k + 1}_{pch.get('name') or pch['side']}.png")
        fig.savefig(p, dpi=110)
        plt.close(fig)
        files.append(p)
    # 3) jerk curves with spikes (end effectors + the joints with spikes)
    ch = rep["jerk"]["channels"]
    rot = sorted([n for n in ch if n.startswith("rot_") and ch[n]["spikes"]], key=lambda n: -max(x["score"] for x in ch[n]["spikes"]))
    names = list(JERK_POINTS) + rot[:6]
    fig, axs = plt.subplots(len(names), 1, figsize=(10, 1.25 * len(names) + 0.6), sharex=True, squeeze=False)
    for r, n in enumerate(names):
        ax = axs[r, 0]
        c = ch[n]
        ax.plot(c["_score"], color="#c53030", lw=1, label="import" if ms is not None else name)
        if ms is not None:
            ax.plot(srep["jerk"]["channels"][n]["_score"], color="#2b6cb0", lw=0.8, ls="--", label="source")
        ax.axhline(c["threshold"], color="k", lw=0.6, ls=":")
        for s in c["spikes"]:
            ax.plot(s["frame"], s["score"], "o", color="#c53030", ms=5, mfc="none")
        ax2 = ax.twinx()
        ax2.plot(c["_jerk"] / (1000.0 if c["unit"] == "mm" else 1.0), color="0.7", lw=0.7)
        ax2.tick_params(labelsize=6)
        ax2.set_ylabel("jerk" + (" m/s3" if c["unit"] == "mm" else " deg/s3"), fontsize=6)
        ax.set_ylabel(f"{n}\noff path {c['unit']}", fontsize=7)
        ax.tick_params(labelsize=6)
        if r == 0:
            ax.legend(fontsize=6, loc="upper right")
    axs[-1, 0].set_xlabel("frame")
    fig.suptitle(f"{name}: how far each frame is off the smooth path (red/blue, dotted = spike threshold, o = spike); grey = smoothed jerk",
                 fontsize=9)
    fig.tight_layout()
    p = os.path.join(out, "jerk.png")
    fig.savefig(p, dpi=100)
    plt.close(fig)
    files.append(p)
    return files


# ---------------------------------------------------------------- running it
def load_motion(path: str, name: str) -> Tuple[Motion, Optional[Clip], Optional[object]]:
    if path.endswith(".json"):
        import import_pose as ip
        src = ip.load_source(path)
        return from_source(src, name), None, src
    c = Clip.load(path)
    return from_clip(c, name), c, None


def check(clip_path: Optional[str], source: Optional[str], out: Optional[str], name: str, do_plots: bool = True,
          clip_obj: Optional[Clip] = None, log=print) -> dict:
    c = clip_obj if clip_obj is not None else Clip.load(clip_path)
    ms = srep = att = None
    events: List[dict] = []
    if source:
        ms, _, src = load_motion(source, "source")
        events = list(ms.events)
        srep = evaluate(ms)
    m = from_clip(c, name, events)
    rep = evaluate(m, srep)
    if srep:
        att = attribute(srep, rep)
    gap = com_model_gap(m, c)
    full = dict(version=VERSION, name=name, clip=clip_path, source=source, constants=constants(), sg_window=sg_window(m.fps),
                sg_cutoff_hz=round(sg_cutoff_hz(m.fps), 2), com_model_gap_vs_winter=gap, clip_report=rep,
                source_report=srep, import_vs_source=att)
    text = summary_ko(name, rep, srep, att)
    if source and srep:
        text += "\n\n" + summary_ko(name + " - 원본(catalogue) 자체", srep)
    full["summary_ko"] = text
    if out:
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, "report.json"), "w") as f:
            json.dump(strip(full), f, ensure_ascii=False, indent=1)
        with open(os.path.join(out, "summary_ko.txt"), "w") as f:
            f.write(text + "\n")
        if do_plots:
            full["plots"] = plots(out, name, m, rep, ms, srep)
    log(text)
    return full


ALL = [  # (name, clip under out/, source: catalogue file name or a truth clip under out/)
    ("onetwo_5m", "onetwo3/5m/clip.npz", "1-2@5m.json"), ("onetwo_5a", "onetwo3/5a/clip.npz", "1-2@5a.json"),
    ("inout_1", "inout3/1/clip.npz", "inout@1.json"), ("inout_3", "inout3/3/clip.npz", "inout@3.json"),
    ("inout_5m", "inout3/5m/clip.npz", "inout@5m.json"),
    ("mocap_run", "mocap/demo_run/clip.npz", "@mocap/demo_run/truth.npz"),
    ("mocap_jump", "mocap/demo_jump/clip.npz", "@mocap/demo_jump/truth.npz")]


def run_all(sources: str, project_out: str, out: str, do_plots: bool = True) -> List[dict]:
    res = []
    for name, cp, sp in ALL:
        clip_path = os.path.join(project_out, cp)
        src = os.path.join(project_out, sp[1:]) if sp.startswith("@") else os.path.join(sources, sp)
        if not (os.path.exists(clip_path) and os.path.exists(src)):
            print(f"[qc] {name}: missing {clip_path if not os.path.exists(clip_path) else src}, skipped")
            continue
        res.append(check(clip_path, src, os.path.join(out, name), name, do_plots, log=lambda *x: None))
    res.append(check(None, None, os.path.join(out, "walk_loop"), "walk_loop", do_plots, clip_obj=walk_clip(), log=lambda *x: None))
    with open(os.path.join(out, "summary_ko.txt"), "w") as f:
        f.write("\n\n".join(r["summary_ko"] for r in res) + "\n")
    rows = [table_row(r) for r in res]
    with open(os.path.join(out, "table.json"), "w") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    return res


def table_row(r: dict) -> dict:
    """One line per clip (and its source) for the overview."""
    def part(rep):
        if rep is None:
            return None
        b = rep["balance"]
        return dict(frames_judged=b["static"]["all"].get("frames", 0), single=b["single_support_frames"],
                    static_out=b["static"]["all"].get("out"), xcom_out=b["dynamic"]["all"].get("out"),
                    xcom_worst_m=b["dynamic"]["all"].get("worst_m"),
                    excursions={v: sum(1 for e in b["excursions"] if e["verdict"] == v) for v in sorted({e["verdict"] for e in b["excursions"]})},
                    zmp_out=b["zmp"]["out"], zmp_out_not_at_hit=b["zmp"]["out_not_at_hit"],
                    spikes=rep["jerk"]["n_spikes"], moments=len(rep["jerk"]["moments"]),
                    punches=[dict(name=p.get("name"), side=p["side"], order=p["sequence"]["order"],
                                  lags_ms={k: round(v * 1000) for k, v in p["sequence"]["lags"].items()},
                                  ok=p["sequence"]["order_ok"] and p["sequence"]["lags_ok"], nj=p["nj"]) for p in rep["punches"]])
    att = r.get("import_vs_source")
    return dict(name=r["name"], clip=part(r["clip_report"]), source=part(r.get("source_report")),
                import_added=None if not att else dict(xcom_frames=att["dynamic"]["import_only"], zmp_frames=att["zmp"]["import_only"],
                                                       spikes=att["spikes_from_import"], spikes_in_source=att["spikes_from_source"]))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("check", help="balance, jerk and punch sequencing of a clip (and of its source)")
    p.add_argument("clip", help="clip.npz on the soldier's rig")
    p.add_argument("--source", help="the source it was made from: catalogue .json or a truth clip .npz")
    p.add_argument("-o", "--out", help="folder for report.json, summary_ko.txt and the plots")
    p.add_argument("--name", help="name in the report (default: the clip's folder)")
    p.add_argument("--no-plots", action="store_true")
    w = sub.add_parser("walk", help="the rig's own walk loop (motion.walk_rots)")
    w.add_argument("-o", "--out")
    w.add_argument("--fps", type=float, default=60.0)
    w.add_argument("--period", type=float, default=1.1, help="seconds per cycle (synth.walk's default)")
    w.add_argument("--no-plots", action="store_true")
    al = sub.add_parser("all", help="the boxing imports, the walk loop and the mocap demos, into one folder")
    al.add_argument("--sources", required=True, help="folder with the catalogue's 1-2@5m.json, inout@1.json, ...")
    al.add_argument("--project-out", default=str(HERE.parents[1] / "out"), help="the project's out/ (clips are read from it)")
    al.add_argument("-o", "--out", default=str(HERE.parents[1] / "out" / "qc"))
    al.add_argument("--no-plots", action="store_true")
    a = ap.parse_args(argv)
    if a.cmd == "all":
        run_all(a.sources, a.project_out, a.out, not a.no_plots)
    elif a.cmd == "check":
        check(a.clip, a.source, a.out, a.name or os.path.basename(os.path.dirname(os.path.abspath(a.clip))), not a.no_plots)
    else:
        check(None, None, a.out, "walk_loop", not a.no_plots, clip_obj=walk_clip(a.fps, a.period))


if __name__ == "__main__":
    main()

"""Motion authored on another skeleton -> a clip on the soldier's rig (per-joint rotations, not landmarks).

``mocap.py`` reads a video; this reads motion that already IS joint rotations - a pose stream dumped
from someone else's rig - and plays it on the soldier (or on his bare mannequin, ``--outfit none``).

    source.json ──retarget──▶ clip.npz + import.json ──render──▶ <view>.gif/.mp4, compare.mp4, strip.png
                              (report: errors, timing,            (stick figure of the source next to the
                               feet, joint-limit clamps)           baked model, through the same camera)

The source file (JSON):
    names    joint names, parents first            parent   {joint: parent or null}
    tpose    {joint: [x, y, z]} world position in the pose every joint's rotation is the identity in
             (metres, y up, facing +z, his left = +x, ground at y = 0)
    dt       seconds per frame                     events   optional [{t, type, name, who, ...}]
    frames   [{"f": [fighter, ...]}] or [fighter]; a fighter is
             rot {joint: 9 numbers, a LOCAL 3x3 by rows; missing = identity}, root [x, y, z] added to
             the root joint, stretch (squash-and-stretch about the ground, default 1), place {R, p}
             (where he stands in the room, default none)
    forward kinematics: R_world = R_parent_world · local;  p = p_parent + R_parent_world · (tpose - tpose_parent)

How a pose is carried over (``retarget``):
  * orientation, bone by bone.  Each of our bones takes the WORLD orientation of the source joint it is
    mapped to (``SOMA``; the three spine joints end up composed in the chest's world rotation), times a
    fixed correction for the two rest poses: the source rests in a T-pose, we rest with the arms hanging
    (A-pose), so the arm chain is first turned up to the T-pose (``corrections``).  Everything else rests
    alike (upright, legs straight, soles flat) and needs none.  Local = parent_world^T · world, taken from
    the parent as it really ended up, so a joint that had to be clamped is made up for further down.
  * the pelvis follows the source's hips, scaled by the ratio of the hip heights.
  * the legs are NOT copied: each foot is put where the source has it - the ball of the foot on the scaled
    spot, the sole turned as the source's - and the leg is solved onto it (two-bone IK, the knee bending
    the way the source's thigh faces).  Legs of other proportions then neither slide nor sink.
  * joint limits (``rig.clamp_rot``): every clamp is written down per joint and frame - nothing is hidden.
    One joint is treated more kindly than "nearest allowed rotation": an upper arm that would be clamped
    keeps its DIRECTION and is only turned about itself, and the forearm takes that twist up (``keep_axis``),
    so elbow, wrist and hand stay where the source has them.  That too is counted and reported.
  * elbows out of the trunk (``arms.clear_elbows``, on by default, ``--no-clear-elbows`` turns it off): a
    source with a trunk that is a line can tuck an elbow where the mannequin has ribs.  That arm's elbow is
    swung about its shoulder-wrist line by the smallest angle that takes it clear; the wrist stays where it
    is and the hand keeps its orientation in the world as far as the wrist's limits allow.  The glove may
    turn by at most ``--hand-turn-max`` degrees (10): where clearing the elbow would turn it further, the
    elbow is swung only that far and stays partly inside on those frames.  The report says on how many
    frames, by how much, how deep the arm was and is (to the wrist), how far wrist and hand moved, and on
    which frames the cap held the elbow inside.  What stops the wrist there is its extension (30 degrees back in
    the default limits); ``--wrist-range human`` (``rig.LIMIT_SETS``: flexion and extension 70 each way) is the
    opt-in that lets it bend further - for every clamp of the import and for the clearance alike.
    (``--clear-trunk`` is the older way - the whole arm turned rigidly, hand included - kept for comparison.)
  * grip (``arms.grip_track``, on by default, ``--no-grip``): the mitten hands close into a fist as a punch
    is launched and open as the hand comes back, from the arm's own reach and the source's punch events.

``measure`` holds the clip against the source (orientation and bone-axis errors, punch timing, hit-stops,
planted feet, ``step_report``: landings and lift-offs, how far a planted foot moves, whether the feet pass
each other, how far he travels and whether the motion closes as a loop); ``mesh_checks`` adds what only
the sculpted surface can say (the sole against the ground, arms inside the body).  Nothing here loops a
motion: a source that ends a little off where it began gives a clip that does too.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(HERE))

import arms  # noqa: E402
import clip as clip_mod  # noqa: E402
import motion  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402
from clip import Clip  # noqa: E402

VERSION = "import-2"
GROUND = rig.GROUND
SKEL = rig.SKELETON
EZ = np.array([0.0, 0.0, 1.0])
SIDES = (("L", 1, "Left"), ("R", -1, "Right"))

# ---------------------------------------------------------------- the one mapping table
# our bone -> (source joint, how the two rest poses relate)
#   "same"    both skeletons rest alike here (upright trunk, straight legs, flat soles): orientation is copied
#   "axis"    the bones rest in different directions (their T-pose arm, our hanging arm): copy the orientation
#             after turning our bone the short way onto theirs
#   "parent"  as its parent bone (a hand has no child joint in the source to take a direction from)
# "{S}" / "{Side}" are expanded to L / Left and R / Right.
SOMA = {
    "pelvis": ("Hips", "same"), "chest": ("Chest", "same"), "neck": ("Neck1", "same"), "head": ("Head", "same"),
    "clav{S}": ("{Side}Shoulder", "same"), "upperarm{S}": ("{Side}Arm", "axis"),
    "forearm{S}": ("{Side}ForeArm", "axis"), "hand{S}": ("{Side}Hand", "parent"),
    "thigh{S}": ("{Side}Leg", "same"), "shin{S}": ("{Side}Shin", "same"), "foot{S}": ("{Side}Foot", "same"),
    "toe{S}": ("{Side}ToeBase", "same"),
}


def expand_map(table: Dict[str, Tuple[str, str]]) -> Dict[str, Tuple[str, str]]:
    out = {}
    for bone, (joint, how) in table.items():
        if "{S}" in bone:
            for side, _, word in SIDES:
                out[bone.replace("{S}", side)] = (joint.replace("{Side}", word), how)
        else:
            out[bone] = (joint, how)
    return out


# ---------------------------------------------------------------- the source
def _mat(v) -> np.ndarray:
    return np.eye(3) if v is None else np.asarray(v, np.float64).reshape(3, 3)


@dataclass
class Source:
    """A pose stream on a foreign skeleton (see the module text for the file it is read from)."""
    names: List[str]
    parent: Dict[str, Optional[str]]
    tpose: Dict[str, np.ndarray]
    fps: float
    rot: np.ndarray  # (T, J, 3, 3) local rotations
    root: np.ndarray  # (T, 3) added to the root joint
    stretch: np.ndarray  # (T,)
    place_R: np.ndarray  # (T, 3, 3)
    place_p: np.ndarray  # (T, 3)
    events: List[dict] = field(default_factory=list)
    meta: dict = field(default_factory=dict)

    def __len__(self):
        return len(self.rot)

    def __post_init__(self):
        self.index = {n: i for i, n in enumerate(self.names)}
        self.children = {n: [c for c in self.names if self.parent.get(c) == n] for n in self.names}
        for n in self.names:  # parents first, or the forward kinematics below reads a parent before it is set
            p = self.parent.get(n)
            assert p is None or self.index[p] < self.index[n], f"joint {n} is listed before its parent {p}"

    def fk(self, t: int) -> Tuple[np.ndarray, np.ndarray]:
        """(world rotations (J, 3, 3), joint positions (J, 3)) of frame t in his own space: metres, ground
        y = 0, before ``stretch`` and ``place``."""
        J = len(self.names)
        R, P = np.zeros((J, 3, 3)), np.zeros((J, 3))
        for i, n in enumerate(self.names):
            p = self.parent.get(n)
            if p is None:
                R[i] = self.rot[t, i]
                P[i] = self.tpose[n] + self.root[t]
            else:
                k = self.index[p]
                R[i] = R[k] @ self.rot[t, i]
                P[i] = P[k] + R[k] @ (self.tpose[n] - self.tpose[p])
        return R, P

    def stage(self, t: int, stretched: bool = False) -> Tuple[np.ndarray, np.ndarray]:
        """The same in the STAGE frame: the room as he stood in it on frame 0 (so on frame 0 he faces +z from
        the origin, and what ``place`` does afterwards - steps, turns - is kept).  ``stretched``: with the
        squash-and-stretch applied to the positions, as the source draws him."""
        R, P = self.fk(t)
        if stretched:
            s = float(self.stretch[t])
            P = P * np.array([1.0 / math.sqrt(s), s, 1.0 / math.sqrt(s)])
        F = self.place_R[0].T @ self.place_R[t]
        shift = self.place_R[0].T @ (self.place_p[t] - self.place_p[0])
        return np.einsum("ij,njk->nik", F, R), P @ F.T + shift

    def rest_dir(self, joint: str) -> Optional[np.ndarray]:
        """Direction of the bone that starts at ``joint`` in the rest pose (to its only child), or None."""
        kids = self.children[joint]
        if len(kids) != 1:
            return None
        return rt.unit(self.tpose[kids[0]] - self.tpose[joint])


def load_source(path: str, who: int = 0) -> Source:
    with open(path) as f:
        d = json.load(f)
    names = list(d["names"])
    frames = [fr["f"][who] if isinstance(fr, dict) and "f" in fr else fr for fr in d["frames"]]
    T = len(frames)
    rot = np.tile(np.eye(3), (T, len(names), 1, 1))
    root, stretch = np.zeros((T, 3)), np.ones(T)
    place_R, place_p = np.tile(np.eye(3), (T, 1, 1)), np.zeros((T, 3))
    for t, fr in enumerate(frames):
        given = fr.get("rot") or {}
        for i, n in enumerate(names):
            rot[t, i] = _mat(given.get(n))
        if fr.get("root") is not None:
            root[t] = fr["root"]
        stretch[t] = fr.get("stretch") or 1.0
        if fr.get("place"):
            place_R[t] = _mat(fr["place"].get("R"))
            place_p[t] = fr["place"].get("p", (0.0, 0.0, 0.0))
    events = [e for e in d.get("events", []) if e.get("who", who) == who]
    meta = {k: d[k] for k in ("id", "name", "en", "loop") if k in d}
    meta.update(file=os.path.basename(path), who=who)
    return Source(names, dict(d["parent"]), {k: np.asarray(v, np.float64) for k, v in d["tpose"].items()},
                  1.0 / float(d.get("dt", 1.0 / 60.0)), rot, root, stretch, place_R, place_p, events, meta)


# ---------------------------------------------------------------- rest-pose corrections, scale
def our_rest_dir(bone: str) -> np.ndarray:
    b = SKEL.bones[SKEL.index[bone]]
    return rt.unit(np.asarray(b.tail, np.float64) - np.asarray(b.head, np.float64))


def corrections(src: Source, table: Dict[str, Tuple[str, str]]) -> Dict[str, np.ndarray]:
    """{our bone: C}: our bone's world rotation (from OUR rest pose) = the source joint's world rotation
    (from ITS rest pose) · C.  C turns our resting bone onto the source's resting bone the short way; for
    the arms that is a turn about z (hanging arm -> T-pose arm), which also carries our elbow's hinge axis
    onto the axis the source bends its elbow about (its local y), so an elbow bend stays an elbow bend."""
    C: Dict[str, np.ndarray] = {}
    for bone, (joint, how) in table.items():
        if how == "same":
            C[bone] = np.eye(3)
        elif how == "axis":
            d = src.rest_dir(joint)
            if d is None:
                raise ValueError(f"{joint} has no single child joint to take its rest direction from")
            C[bone] = rt.shortest_arc(our_rest_dir(bone), d)
    for bone, (joint, how) in table.items():
        if how == "parent":
            C[bone] = C[rig.PARENT[bone]]
    return C


def hip_scale(src: Source, table: Dict[str, Tuple[str, str]]) -> float:
    """Our units per source metre: the ratio of the hip joints' heights above the ground."""
    theirs = float(np.mean([src.tpose[table["thigh" + side][0]][1] for side, _, _ in SIDES]))
    return float(rig.HIP[1][1] - GROUND) / theirs


# ---------------------------------------------------------------- retarget
@dataclass
class Params:
    limits: str = "clamp"  # "clamp" = bring every joint inside the rig's limits; "report" = only measure
    keep_axis: bool = True  # a clamped upper arm keeps its direction; the forearm takes the twist (``keep_axis``)
    clear_elbows: bool = True  # swing an elbow that is inside the trunk out of it, hand kept (``arms.clear_elbows``)
    wrist_give: float = 0.0  # degrees the wrist may go past its limits there, to keep the hand exactly as it was
    hand_turn_max: float = arms.HAND_TURN_MOST  # degrees the glove may turn there (the elbow then stays partly in)
    # the joint limits every step keeps to: a ``rig.LIMIT_SETS`` name.  "default" = the rig's table; "human" = the
    # wrist bends 70 degrees each way (flexion / extension), so the elbow clears with the glove turning less
    wrist_range: str = "default"
    grip: bool = True  # the hands close into fists with the punches (``arms.grip_track``)
    clear_trunk: bool = False  # the older way: turn the WHOLE arm, hand too, out of the trunk (``swivel_clear``)
    stretch: str = "root"  # "root" = the squash-and-stretch raises / lowers the pelvis; "none" = ignored
    foot_ik: bool = True  # False = copy the leg orientations too (feet then slide and sink: for comparison)
    scale: Optional[float] = None  # our units per source metre (None = ratio of the hip heights)
    # legs never straighten further than this share of their length (the pelvis comes down instead).  The walk
    # keeps 0.995 (knees 11 degrees soft); a pose that is given keeps its straight legs straight: 0.999 = 5 degrees
    max_reach: float = 0.999
    contact_height: float = 0.005  # m: a foot is planted while its ball is no higher than this above its rest height
    contact_speed: float = 0.10  # m/s: ... and moves no faster than this along the ground
    passes: int = 4  # times a leg is solved again after its ankle had to be clamped


def _sole_points(s: int) -> List[np.ndarray]:
    """Rest positions of the points of the FOOT bone's sole that must not go under the ground: the heel and
    both sides of the ball.  (The toes are a hinge of their own: ``_toes_down``.)"""
    ball, side = rt._ball_ground(s), np.array([0.40 * rig.FOOT_W, 0.0, 0.0])
    return [rig.HEEL[s], ball - side, ball + side]


def _toes_down(side: str, s: int, W_foot: np.ndarray, local: np.ndarray, hinge_y: float) -> np.ndarray:
    """The toe bone's local rotation, bent up as far as it takes for the tip of the toes to be on top of the
    ground (the hinge is ``hinge_y`` high).  A foot on its ball with the heel up keeps its toes flat."""
    tip = np.array([rig.TOE_TIP[s][0], GROUND, rig.TOE_TIP[s][2]]) - rig.TOE[s]
    low = lambda L: hinge_y + float((W_foot @ L @ tip)[1])  # noqa: E731
    if low(local) >= GROUND - 1e-6:
        return local
    lo_lim = rig.limits("toe" + side)[0][0]
    a, b = 0.0, lo_lim - rig.joint_angles("toe" + side, local)[0]  # extra pitch: none .. up to the hinge's limit
    bent = lambda x: local @ rig.rot_x(x)  # noqa: E731
    if low(bent(b)) < GROUND:
        return bent(b)
    for _ in range(20):
        m = 0.5 * (a + b)
        if low(bent(m)) < GROUND:
            a = m
        else:
            b = m
    return bent(b)


INSIDE = 1e-3  # degrees: a joint this near its limits is inside them (a T-pose arm sits exactly ON "roll 90")


def _clamper(mode: str, log: Dict[str, float], asked: Optional[Dict[str, np.ndarray]] = None
             ) -> Callable[[str, np.ndarray], np.ndarray]:
    """``fn(bone, R_local)``: R brought inside the bone's limits (mode "clamp") or left as it is ("report").
    How far it was outside goes to ``log`` and the rotation asked for to ``asked`` (so the report can name
    the axis); a bone placed again on the same frame keeps only its last entry."""
    def fn(bone: str, R: np.ndarray) -> np.ndarray:
        if rig.limits(bone) is None:
            return R
        Rc, _, excess = rig.clamp_rot(bone, R)
        if excess < INSIDE:
            log.pop(bone, None)
            if asked is not None:
                asked.pop(bone, None)
            return R
        log[bone] = float(excess)
        if asked is not None:
            asked[bone] = np.array(R, np.float64)
        return np.asarray(Rc, np.float64) if mode == "clamp" else R
    return fn


# Bones whose DIRECTION is kept when their joint cannot take the rotation asked of it: they are turned about
# their own axis, as little as it takes, until the joint is inside its limits, and the child bone takes up that
# turn.  Our elbow can: the forearm's "yaw" turns it round the upper arm.  So a shoulder that cannot twist as far
# as the source's still puts the elbow, the wrist and the fist where the source has them.
KEEP_AXIS = ("upperarm",)


keep_axis = arms.keep_axis  # (lives with the other arm steps; this name is kept for whoever imported it from here)


# ---- an elbow inside the trunk, the older way (``--clear-trunk``; superseded by ``arms.clear_elbows``)
# A source whose trunk is a thin line can tuck an elbow where our mannequin has ribs.  ``clear_trunk`` turns the
# whole arm about the line from shoulder to wrist (the wrist stays where it is, the elbow swings out) by the
# smallest angle that brings upper arm, elbow and forearm out of the trunk's solids.  The hand is turned along
# with the arm - by 50 degrees on average on the one-two it was written for - which is why it is not the default.
TRUNK = ("chest", "pelvis")
ARM_SAMPLES = (("upperarm", (0.45, 0.6, 0.75, 0.9, 1.0), 0.040), ("forearm", (0.15, 0.3, 0.45, 0.6), 0.032))  # bone, along it, its radius


def _arm_points(M: np.ndarray, side: str) -> Tuple[np.ndarray, np.ndarray]:
    """(world points along the arm of pose M, the clearance each needs)."""
    pts, rad = [], []
    for bone, along, r in ARM_SAMPLES:
        b = SKEL.bones[SKEL.index[bone + side]]
        head, tail = np.asarray(b.head, np.float64), np.asarray(b.tail, np.float64)
        for u in along:
            pts.append(rt.at(M, bone + side, head + u * (tail - head)))
            rad.append(r)
    return np.array(pts), np.array(rad)


def trunk_depth(M: np.ndarray, pts: np.ndarray, rad: np.ndarray) -> float:
    """How far the deepest of the points (each a ball of its radius) is inside the trunk; <= 0 = clear."""
    import body
    inv = body.invert(np.asarray(M, np.float64))
    deep = -np.inf
    for b in TRUNK:
        q = body.apply(inv[SKEL.index[b]], pts).astype(np.float32)
        deep = max(deep, float((rad - body.bone_sdf(b, q)).max()))
    return deep


def swivel_clear(M: np.ndarray, side: str, s: int, prefer: float = 0.0, coarse: float = 4.0, most: float = 150.0) -> float:
    """Degrees to turn the arm about the shoulder-wrist line so that it is out of the trunk (0 = it is)."""
    pts, rad = _arm_points(M, side)
    if trunk_depth(M, pts, rad) <= 0.0:
        return 0.0
    sh, wr = rt.at(M, "upperarm" + side, rig.SHOULDER[s]), rt.at(M, "hand" + side, rig.WRIST[s])
    if np.linalg.norm(wr - sh) < 1e-6:
        return 0.0
    axis = rt.unit(wr - sh)
    depth = lambda psi: trunk_depth(M, (pts - sh) @ rig.rot_axis(axis, psi).T + sh, rad)  # noqa: E731
    first = 1.0 if prefer >= 0 else -1.0
    best, best_depth = 0.0, depth(0.0)
    for n in range(1, int(most / coarse) + 1):
        for sign in (first, -first):
            psi = sign * n * coarse
            d = depth(psi)
            if d <= 0.0:
                lo, hi = psi - sign * coarse, psi
                for _ in range(6):
                    mid = 0.5 * (lo + hi)
                    if depth(mid) <= 0.0:
                        hi = mid
                    else:
                        lo = mid
                return float(hi)
            if d < best_depth:
                best, best_depth = psi, d
    return float(best)


def detect_contact(toe: np.ndarray, rest_height: float, fps: float, par: Params) -> np.ndarray:
    """(T,) True while a foot's ball joint (source metres, stage frame) is down and still."""
    v = np.zeros(len(toe))
    if len(toe) > 1:
        d = np.linalg.norm(np.diff(toe[:, [0, 2]], axis=0), axis=1) * fps
        v[1:], v[0] = d, d[0]
        v[:-1] = np.maximum(v[:-1], d)  # still on both sides of the frame
    return (toe[:, 1] <= rest_height + par.contact_height) & (v <= par.contact_speed)


def retarget(src: Source, par: Optional[Params] = None, table: Optional[Dict[str, Tuple[str, str]]] = None,
             log=print) -> Tuple[Clip, dict]:
    """The source's motion as a clip on the soldier's rig, and a report.  The rig's limits are those of
    whatever outfit is worn when this is called (``body.wearing``), in the set ``par.wrist_range``."""
    par = par or Params()
    with rig.limit_set(par.wrist_range):
        return _retarget(src, par, table, log)


def _retarget(src: Source, par: Params, table: Optional[Dict[str, Tuple[str, str]]], log) -> Tuple[Clip, dict]:
    table = expand_map(table or SOMA)
    missing = [b for b in clip_mod.body_bones() if b not in table]
    if missing:
        raise ValueError(f"the mapping table has no source joint for {missing}")
    C = corrections(src, table)
    k = par.scale or hip_scale(src, table)
    J = {b: src.index[j] for b, (j, _) in table.items()}
    T = len(src)
    hips_rest = src.tpose[table["pelvis"][0]]
    toe_rest = {s: float(src.tpose[table["toe" + side][0]][1]) for side, s, _ in SIDES}
    upper = [b for b in clip_mod.body_bones() if b != "pelvis" and b[:-1] not in ("thigh", "shin", "foot", "toe")]
    leg_len = rig.THIGH_LEN + rig.SHIN_LEN
    ph = rig.PELVIS

    frames: List[Dict[str, np.ndarray]] = []
    roots = np.zeros((T, 3))
    excess: List[Dict[str, float]] = [dict() for _ in range(T)]
    asked: List[Dict[str, np.ndarray]] = [dict() for _ in range(T)]  # the local rotations that were outside
    lowered = np.zeros(T)  # how far the pelvis had to come down for the legs to reach
    lifted = np.zeros((T, 2))  # how far a foot was raised to keep its sole on top of the ground
    anchor_miss = np.zeros((T, 2))  # how far the ball of the foot ended up from where it was sent
    reach = np.zeros((T, 2))
    toe_src = np.zeros((T, 2, 3))
    helper_state: dict = {}
    twist = {b: np.zeros(T) for b in upper if b[:-1] in KEEP_AXIS}  # degrees a bone was turned about itself
    swivel = np.zeros((T, 2))  # degrees an arm was turned about its shoulder-wrist line, out of the trunk
    for t in range(T):
        W, P = src.stage(t)
        Wt = {b: W[J[b]] @ C[b] for b in table}
        clamp = _clamper(par.limits, excess[t], asked[t])
        rots: Dict[str, np.ndarray] = {"pelvis": Wt["pelvis"]}
        world = {"pelvis": Wt["pelvis"]}

        def place(b: str, W_target: np.ndarray):
            local = world[rig.PARENT[b]].T @ W_target
            if b in twist and par.keep_axis and par.limits == "clamp":
                local, twist[b][t] = keep_axis(b, local, twist[b][t - 1] if t else 0.0)
            rots[b] = clamp(b, local)
            world[b] = world[rig.PARENT[b]] @ rots[b]

        for b in upper:  # parents first (the skeleton's own order)
            place(b, Wt[b])

        # pelvis: the source's hips, scaled; the squash-and-stretch can only be a rigid rise / dip here
        hips = P[J["pelvis"]].copy()
        if par.stretch == "root":
            hips[1] *= float(src.stretch[t])
        root = k * (hips - hips_rest)
        Wp = world["pelvis"]

        if par.clear_trunk:
            M = rt.fk(rots, root)
            for i, (side, s, _) in enumerate(SIDES):
                psi = swivel_clear(M, side, s, swivel[t - 1, i] if t else 0.0)
                if psi:
                    swivel[t, i] = psi
                    axis = rt.unit(rt.at(M, "hand" + side, rig.WRIST[s]) - rt.at(M, "upperarm" + side, rig.SHOULDER[s]))
                    Q = rig.rot_axis(axis, psi)
                    for b in ("upperarm", "forearm", "hand"):
                        place(b + side, Q @ Wt[b + side])

        # feet: the ball of each foot on the source's (scaled) spot, the sole turned as the source's
        targets = {}
        for i, (side, s, _) in enumerate(SIDES):
            p = P[J["toe" + side]]
            toe_src[t, i] = p
            targets[s] = np.array([k * p[0], rig.TOE[s][1] + k * (p[1] - toe_rest[s]), k * p[2]])

        def ankle_for(s: int, W_foot: np.ndarray) -> Tuple[np.ndarray, float]:
            ankle = targets[s] + W_foot @ (rig.ANKLE[s] - rig.TOE[s])
            low = min([GROUND] + [float((targets[s] + W_foot @ (q - rig.TOE[s]))[1]) for q in _sole_points(s)])
            return ankle + np.array([0.0, GROUND - low, 0.0]), GROUND - low

        if par.foot_ik:
            # the pelvis no higher than both legs can reach from (they keep a little bend, as in motion.root_height)
            top = math.inf
            for side, s, _ in SIDES:
                ankle, _ = ankle_for(s, Wt["foot" + side])
                hip0 = Wp @ (rig.HIP[s] - ph) + ph + np.array([root[0], 0.0, root[2]])
                flat2 = (ankle[0] - hip0[0]) ** 2 + (ankle[2] - hip0[2]) ** 2
                top = min(top, ankle[1] - hip0[1] + math.sqrt(max((par.max_reach * leg_len) ** 2 - flat2, 0.0)))
            if root[1] > top:
                lowered[t] = root[1] - top
                root[1] = top
            for i, (side, s, _) in enumerate(SIDES):
                hip = Wp @ (rig.HIP[s] - ph) + ph + root
                W_foot = Wt["foot" + side]
                for _ in range(max(par.passes, 1)):
                    ankle, lifted[t, i] = ankle_for(s, W_foot)
                    D = rt.unit(ankle - hip)
                    fwd = Wt["thigh" + side] @ EZ  # the knee bends the way the source's thigh faces
                    if np.linalg.norm(rt.perp(fwd, D)) < 1e-3:
                        fwd = Wp @ EZ + 0.1 * (Wp @ np.array([0.0, 1.0, 0.0]))
                    W_thigh, W_shin, reach[t, i] = motion.leg_ik(hip, ankle, fwd, s)
                    rots["thigh" + side] = clamp("thigh" + side, Wp.T @ W_thigh)
                    world["thigh" + side] = Wp @ rots["thigh" + side]
                    rots["shin" + side] = clamp("shin" + side, world["thigh" + side].T @ W_shin)
                    world["shin" + side] = world["thigh" + side] @ rots["shin" + side]
                    rots["foot" + side] = clamp("foot" + side, world["shin" + side].T @ Wt["foot" + side])
                    world["foot" + side] = world["shin" + side] @ rots["foot" + side]
                    turned = float(clip_mod.geodesic_deg(world["foot" + side], W_foot))
                    W_foot = world["foot" + side]
                    if turned < 0.01:  # the ankle was put where this foot needs it
                        break
                # the toes bend on their foot as the source's do on theirs, and no further down than the ground
                toe = clamp("toe" + side, Wt["foot" + side].T @ Wt["toe" + side])
                rots["toe" + side] = _toes_down(side, s, world["foot" + side], toe, targets[s][1] + lifted[t, i])
        else:
            for side, s, _ in SIDES:
                for b in ("thigh", "shin", "foot", "toe"):
                    rots[b + side] = clamp(b + side, world[rig.PARENT[b + side]].T @ Wt[b + side])
                    world[b + side] = world[rig.PARENT[b + side]] @ rots[b + side]
        M = rt.fk(rots, root)
        for i, (side, s, _) in enumerate(SIDES):
            anchor_miss[t, i] = float(np.linalg.norm(rt.at(M, "foot" + side, rig.TOE[s]) - targets[s]
                                                     - np.array([0.0, lifted[t, i], 0.0])))
        clip_mod.drive(rots, state=helper_state, dt=1.0 / src.fps)  # skirt, cape, plume from the body pose
        frames.append(rots)
        roots[t] = root

    # the arms, once the whole motion is known (both look along the time axis; neither touches trunk or legs)
    elbows = grip = None
    if par.clear_elbows and par.limits == "clamp":  # (it keeps the joints inside their limits: not for "report")
        elbows = arms.clear_elbows(frames, roots, src.fps, loop=bool(src.meta.get("loop")), wrist_give=par.wrist_give,
                                   hand_turn_most=par.hand_turn_max)
    if par.grip:
        g, grip = arms.grip_track(frames, roots, src.fps, src.events)
        arms.apply_grip(frames, g)

    contact = np.stack([detect_contact(toe_src[:, i], toe_rest[s], src.fps, par)
                        for i, (_, s, _) in enumerate(SIDES)], 1).astype(np.float32)
    report = dict(version=VERSION, source=src.meta, frames=T, fps=src.fps, scale=k, params=asdict(par),
                  outfit_limits=sorted(rig.LIMIT_OVERRIDE) or "bare body", limit_set=rig.current_limit_set(),
                  wrist_limits={side: [list(a) for a in rig.limits("hand" + side)] for side, _, _ in SIDES},
                  rest_gap=rest_gaps(src, table, C), clamps=clamp_table(excess, frames, par.limits, asked),
                  twist_passed_on={b: dict(frames=int((np.abs(v) > 0.05).sum()), share=round(float((np.abs(v) > 0.05).mean()), 4),
                                           max=round(float(np.abs(v).max()), 3), worst_frame=int(np.abs(v).argmax()))
                                   for b, v in twist.items() if (np.abs(v) > 0.05).any()},
                  arms_swung_out={side: dict(frames=int((np.abs(swivel[:, i]) > 0.05).sum()),
                                             share=round(float((np.abs(swivel[:, i]) > 0.05).mean()), 4),
                                             max=round(float(np.abs(swivel[:, i]).max()), 2),
                                             mean=round(float(np.abs(swivel[:, i])[np.abs(swivel[:, i]) > 0.05].mean()), 2),
                                             worst_frame=int(np.abs(swivel[:, i]).argmax()))
                                  for i, (side, _, _) in enumerate(SIDES) if (np.abs(swivel[:, i]) > 0.05).any()},
                  root=dict(lowered_max=float(lowered.max()), lowered_frames=int((lowered > 1e-6).sum()),
                            reach_max=float(reach.max()), stretch=[float(src.stretch.min()), float(src.stretch.max())]),
                  feet=dict(lift_max=float(lifted.max()), lift_frames=int((lifted > 1e-6).any(1).sum()),
                            anchor_miss_max=float(anchor_miss.max()),
                            planted_frames=[int(contact[:, 0].sum()), int(contact[:, 1].sum())]),
                  elbows=elbows, grip=grip, events=src.events)
    meta = dict(name=src.meta.get("id", src.meta.get("file", "import")), kind="import", code_version=VERSION,
                source=src.meta, scale=k, params=asdict(par), limits=dict(report["clamps"]))
    c = Clip.from_rots(src.fps, frames, roots, contact=contact, meta=meta)
    log(f"[import] {src.meta.get('file', '?')}: {T} frames at {src.fps:g} fps, {k:.4f} units per source metre")
    return c, report


def rest_gaps(src: Source, table, C) -> Dict[str, float]:
    """Degrees between our bone's axis and the source bone's axis when both hold the same pose (after the
    correction): what the axis of a bone is off by even when its orientation is copied exactly."""
    out = {}
    for bone, (joint, _) in table.items():
        d = src.rest_dir(joint)
        if d is not None:
            out[bone] = round(float(np.degrees(np.arccos(np.clip(d @ (C[bone] @ our_rest_dir(bone)), -1, 1)))), 3)
    return out


def clamp_table(excess: List[Dict[str, float]], frames: Sequence[Dict[str, np.ndarray]], mode: str,
                asked: Optional[List[Dict[str, np.ndarray]]] = None) -> Dict[str, dict]:
    """Per joint that left its limits (every frame it was moved on, however little: ``INSIDE``): on what
    share of the frames, by how many degrees (mean over those frames, worst), the worst frame, and - given
    the rotations that were asked for - which angle was out (as ``rig.check_limits`` names it):
    ``worst_axis`` = (axis, its value before the clamp, allowed min, max) on the worst frame, ``axes`` =
    {axis: degrees past its range at most} over all those frames."""
    out: Dict[str, dict] = {}
    for bone in sorted({b for e in excess for b in e}):
        v = np.array([e.get(bone, 0.0) for e in excess])
        hit = v >= INSIDE
        if not hit.any():
            continue
        worst = int(v.argmax())
        row = dict(frames=int(hit.sum()), share=round(float(hit.mean()), 4), mean=round(float(v[hit].mean()), 3),
                   max=round(float(v.max()), 3), worst_frame=worst, clamped=mode == "clamp")
        if asked is not None:
            axes: Dict[str, float] = {}
            for t in np.flatnonzero(hit):
                for _, axis, angle, lo, hi in rig.check_limits({bone: asked[t][bone]}, tol=0.0):
                    axes[axis] = max(axes.get(axis, 0.0), lo - angle, angle - hi, 0.0)
                    if t == worst:
                        row["worst_axis"] = [axis, round(angle, 2), lo, hi]
            row["axes"] = {a: round(d, 2) for a, d in sorted(axes.items())}
        out[bone] = row
    return out


# ---------------------------------------------------------------- measuring the result against the source
def to_rig(p: np.ndarray, k: float) -> np.ndarray:
    """Source stage positions (metres, ground 0) -> rig world (ground -1)."""
    q = np.asarray(p, np.float64) * k
    q[..., 1] += GROUND
    return q


def _angle(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.degrees(np.arccos(np.clip(rt.unit(a) @ rt.unit(b), -1.0, 1.0))))


def _stats(v) -> Dict[str, float]:
    v = np.asarray(v, np.float64)
    return dict(mean=round(float(v.mean()), 3), max=round(float(v.max()), 3), worst_frame=int(v.argmax()))


def measure(src: Source, c: Clip, table: Optional[Dict[str, Tuple[str, str]]] = None) -> dict:
    """The clip against the source it was made from.

    orientation   per bone: degrees between the world orientation the source asks for (after the rest-pose
                  correction) and the one the clip has
    axis          per bone with a child joint in the source: degrees between the source bone's direction
                  (joint -> child joint, from the source's joint POSITIONS) and our bone's (head -> tail)
    wrist         how far our wrists are from the source's (scaled), seen from the pelvis: what the different
                  arm proportions do to where the hands are
    punches       when each arm is at its longest and furthest forward, source and clip, against the events
    feet          ``retarget.foot_slip`` on the frames the source has the foot planted"""
    table = expand_map(table or SOMA)
    C = corrections(src, table)
    k = float(c.meta.get("scale") or hip_scale(src, table))
    T = len(c)
    bones = clip_mod.body_bones()
    orient = {b: np.zeros(T) for b in bones}
    axis = {b: np.zeros(T) for b in bones if src.rest_dir(table[b][0]) is not None}
    wrist = np.zeros((T, 2))
    ext = np.zeros((T, 2, 2))  # (frame, side, source | clip): shoulder-to-wrist distance / arm length
    fwd = np.zeros((T, 2, 2))  # ... how far the wrist is ahead of the pelvis, along frame 0's facing (rig units)
    jt = lambda b: src.index[table[b][0]]  # noqa: E731
    for t in range(T):
        W, P = src.stage(t)
        M = rt.fk(c.body_rots(t), c.root[t])
        for b in bones:
            mine = M[SKEL.index[b]][:, :3]
            orient[b][t] = float(clip_mod.geodesic_deg(W[jt(b)] @ C[b], mine))
            if b in axis:
                kid = src.index[src.children[table[b][0]][0]]
                axis[b][t] = _angle(P[kid] - P[jt(b)], mine @ our_rest_dir(b))
        pelvis = rt.at(M, "pelvis", rig.PELVIS)
        for i, (side, s, _) in enumerate(SIDES):
            sh_s, wr_s = P[jt("upperarm" + side)], P[jt("hand" + side)]
            sh_o, wr_o = rt.at(M, "upperarm" + side, rig.SHOULDER[s]), rt.at(M, "hand" + side, rig.WRIST[s])
            arm_s = (np.linalg.norm(src.tpose[table["forearm" + side][0]] - src.tpose[table["upperarm" + side][0]])
                     + np.linalg.norm(src.tpose[table["hand" + side][0]] - src.tpose[table["forearm" + side][0]]))
            arm_o = (rig.RATIO["upper_arm"] + rig.RATIO["forearm"]) * rig.H
            ext[t, i] = np.linalg.norm(wr_s - sh_s) / arm_s, np.linalg.norm(wr_o - sh_o) / arm_o
            fwd[t, i] = k * (wr_s - P[jt("pelvis")])[2], (wr_o - pelvis)[2]
            wrist[t, i] = float(np.linalg.norm((wr_o - pelvis) - k * (wr_s - P[jt("pelvis")])))
    res = dict(orientation={b: _stats(v) for b, v in orient.items()}, axis={b: _stats(v) for b, v in axis.items()},
               wrist_offset={side: _stats(wrist[:, i]) for i, (side, _, _) in enumerate(SIDES)})
    # how near the SOURCE's own elbows come to the line of its spine (metres): a rig with a trunk of real
    # thickness has the elbow inside it wherever this is less than the trunk's half depth
    chain = [table["neck"][0]]
    while chain[-1] != table["pelvis"][0] and src.parent.get(chain[-1]) is not None:
        chain.append(src.parent[chain[-1]])
    near = np.full((T, 2), np.inf)
    for t in range(T):
        _, P = src.fk(t)
        for i, (side, _, _) in enumerate(SIDES):
            e = P[jt("forearm" + side)]
            for a, b in zip(chain[1:], chain[:-1]):
                A, B = P[src.index[a]], P[src.index[b]]
                u = float(np.clip((e - A) @ (B - A) / max((B - A) @ (B - A), 1e-12), 0.0, 1.0))
                near[t, i] = min(near[t, i], float(np.linalg.norm(e - (A + u * (B - A)))))
    res["source_elbow_to_spine"] = {side: dict(min=round(float(near[:, i].min()), 4), frame=int(near[:, i].argmin()),
                                               mean=round(float(near[:, i].mean()), 4))
                                    for i, (side, _, _) in enumerate(SIDES)}
    punches = {}
    for i, (side, _, _) in enumerate(SIDES):
        row = {}
        for j, who in enumerate(("source", "clip")):
            a, f = int(ext[:, i, j].argmax()), int(fwd[:, i, j].argmax())
            jump = int(np.diff(ext[:, i, j]).argmax()) + 1 if T > 1 else 0  # the frame the arm shoots out on
            row[who] = dict(longest_frame=a, longest_s=round((a + 1) / c.fps, 4), longest=round(float(ext[a, i, j]), 4),
                            furthest_frame=f, furthest_s=round((f + 1) / c.fps, 4), furthest=round(float(fwd[f, i, j]), 4),
                            strike_frame=jump, strike_s=round((jump + 1) / c.fps, 4),
                            strike=[round(float(ext[jump - 1, i, j]), 4), round(float(ext[jump, i, j]), 4)])
        punches[side] = row
    res["punches"] = punches
    # frames on which nothing moves (a hit-stop): the source's, and the clip's
    same_src = [bool(np.abs(src.rot[t] - src.rot[t - 1]).max() < 1e-9 and np.abs(src.root[t] - src.root[t - 1]).max() < 1e-9
                     and np.abs(src.place_p[t] - src.place_p[t - 1]).max() < 1e-9) for t in range(1, T)]
    mine = [c.bones.index(b) for b in bones]  # (the body: cloth helpers go on swinging through a hit-stop)
    same_clip = [bool(np.abs(c.quat[t, mine] - c.quat[t - 1, mine]).max() < 1e-6
                      and np.abs(c.root[t] - c.root[t - 1]).max() < 1e-6) for t in range(1, T)]
    runs = lambda same: [[a, b + 1] for a, b in rt.intervals(np.array(same, bool))] if len(same) else []  # noqa: E731
    res["holds"] = dict(source=runs(same_src), clip=runs(same_clip))
    res["extension"] = ext.round(4).tolist()
    res["feet"] = rt.foot_slip(c)
    # the same of the SOURCE's own ball-of-the-foot joints on those frames (scaled to rig units): what part of
    # the slide and of the float is the source's
    own = dict(slide_step_max=0.0, slide_contact_max=0.0, float_max=0.0)
    for i, (side, s, _) in enumerate(SIDES):
        toe = np.array([src.stage(t)[1][jt("toe" + side)] for t in range(T)]) * k
        rest = k * float(src.tpose[table["toe" + side][0]][1])
        for a, b in rt.intervals(c.contact[:, i] >= 0.999):
            steps = np.linalg.norm(np.diff(toe[a:b + 1, [0, 2]], axis=0), axis=1)
            own["float_max"] = max(own["float_max"], float(np.abs(toe[a:b + 1, 1] - rest).max()))
            if len(steps):
                own["slide_step_max"] = max(own["slide_step_max"], float(steps.max()))
                own["slide_contact_max"] = max(own["slide_contact_max"], float(steps.sum()))
    res["feet_source"] = {key: round(v, 6) for key, v in own.items()}
    res["steps"] = step_report(src, c, table, k)
    return res


def _events(planted: np.ndarray) -> Tuple[List[int], List[int]]:
    """(frames a foot lands on, frames it leaves the ground on) of a planted / not planted track."""
    runs = rt.intervals(np.asarray(planted, bool))
    T = len(planted)
    return [a for a, _ in runs if a > 0], [b + 1 for _, b in runs if b + 1 < T]


def step_report(src: Source, c: Clip, table: Dict[str, Tuple[str, str]], k: float, par: Optional[Params] = None) -> dict:
    """Footwork, the source's and the clip's, each read from its OWN ball-of-the-foot points with the same rule
    (``detect_contact``: down and still):
      land / lift   frames each foot comes down on / leaves the ground on
      order         every landing and lift-off in the order they happen ("L lift", "L land", ...)
      steps         per stay on the ground of the SOURCE's foot: its frames, how far the ball of the foot moves
                    along the ground during it (path length and net), in the source (scaled) and in the clip
      apart         the lead foot's (the one in front on frame 0) distance ahead of the other along frame 0's
                    facing: least and most over the clip.  Least > 0 = the feet never pass each other
      travel        the pelvis along frame 0's facing: furthest ahead and when, and where the last frame leaves
                    it (not 0 = the motion is not a closed loop: it jumps by that much when repeated)
      wrap          that jump itself, last frame -> first: pelvis, each foot's ball (and whether it is planted on
                    both frames), the joint that turns most"""
    par = par or Params()
    T = len(c)
    jt = lambda b: src.index[table[b][0]]  # noqa: E731
    ball = np.zeros((2, T, 2, 3))  # (source | clip, frame, side): rig units above the ground
    hips = np.zeros((2, T, 3))
    for t in range(T):
        _, P = src.stage(t)
        M = rt.fk(c.body_rots(t), c.root[t])
        hips[0, t], hips[1, t] = k * P[jt("pelvis")], rt.at(M, "pelvis", rig.PELVIS)
        for i, (side, s, _) in enumerate(SIDES):
            ball[0, t, i] = k * P[jt("toe" + side)]
            ball[1, t, i] = rt.at(M, "foot" + side, rig.TOE[s]) - np.array([0.0, GROUND, 0.0])
    rest = np.array([[k * float(src.tpose[table["toe" + side][0]][1]) for side, _, _ in SIDES],
                     [float(rig.TOE[s][1] - GROUND) for _, s, _ in SIDES]])
    planted = np.zeros((2, T, 2), bool)
    out: dict = {}
    for j, who in enumerate(("source", "clip")):
        row, order = {}, []
        for i, (side, _, _) in enumerate(SIDES):
            planted[j, :, i] = detect_contact(ball[j, :, i] / k, rest[j, i] / k, c.fps, par)  # (thresholds are in metres)
            land, lift = _events(planted[j, :, i])
            row[side] = dict(land=land, lift=lift, planted_frames=int(planted[j, :, i].sum()))
            order += [(f, f"{side} land") for f in land] + [(f, f"{side} lift") for f in lift]
        row["order"] = [f"{name} {f}" for f, name in sorted(order)]
        out[who] = row
    steps = []
    for i, (side, _, _) in enumerate(SIDES):
        for a, b in rt.intervals(planted[0, :, i]):
            one = dict(foot=side, frames=[a, b], seconds=[round((a + 1) / c.fps, 3), round((b + 1) / c.fps, 3)])
            for j, who in enumerate(("source", "clip")):
                xz = ball[j, a:b + 1, i][:, [0, 2]]
                one[who] = dict(path=round(float(np.linalg.norm(np.diff(xz, axis=0), axis=1).sum()), 5),
                                net=round(float(np.linalg.norm(xz[-1] - xz[0])), 5),
                                ahead=round(float(xz[0, 1]), 4))  # where it stands, along frame 0's facing
            steps.append(one)
    out["steps"] = sorted(steps, key=lambda v: v["frames"][0])
    lead = int(np.argmax(ball[0, 0, :, 2]))
    gap = ball[:, :, lead, 2] - ball[:, :, 1 - lead, 2]
    out["apart"] = dict(lead=SIDES[lead][0], source=[round(float(gap[0].min()), 4), round(float(gap[0].max()), 4)],
                        clip=[round(float(gap[1].min()), 4), round(float(gap[1].max()), 4)])
    fwd = hips[:, :, 2] - hips[:, :1, 2]
    out["travel"] = {who: dict(furthest=round(float(fwd[j].max()), 4), furthest_s=round((int(fwd[j].argmax()) + 1) / c.fps, 3),
                               back_most=round(float(fwd[j].min()), 4), end=round(float(fwd[j, -1]), 4),
                               end_sideways=round(float(hips[j, -1, 0] - hips[j, 0, 0]), 4),
                               end_height=round(float(hips[j, -1, 1] - hips[j, 0, 1]), 4))
                     for j, who in enumerate(("source", "clip"))}
    # where the source's ``place`` alone puts him (metres, along frame 0's facing): its own account of the travel
    spot = (src.place_p - src.place_p[0]) @ src.place_R[0]
    out["travel"]["source_place_m"] = dict(furthest=round(float(spot[:, 2].max()), 4),
                                           furthest_s=round((int(spot[:, 2].argmax()) + 1) / c.fps, 3),
                                           end=round(float(spot[-1, 2]), 4), end_sideways=round(float(spot[-1, 0]), 4))
    # the wrap: what jumps from the last frame to the first when the clip is played again (rig units; nothing
    # here closes a loop).  Per foot: [along the ground, up], and whether it is planted on both of those frames
    # (a planted foot that moves there is seen to slide or pop); the pelvis against its median move per frame.
    first, last = c.body_rots(0), c.body_rots(T - 1)
    turn = {b: float(clip_mod.geodesic_deg(first[b], last[b])) for b in clip_mod.body_bones()}
    worst = max(turn, key=turn.get)
    out["wrap"] = {who: dict(pelvis=round(float(np.linalg.norm(hips[j, 0] - hips[j, -1])), 4),
                             pelvis_per_frame_median=round(float(np.median(np.linalg.norm(np.diff(hips[j], axis=0), axis=1)))
                                                           if T > 1 else 0.0, 5),
                             feet={side: dict(along=round(float(np.linalg.norm((ball[j, 0, i] - ball[j, -1, i])[[0, 2]])), 4),
                                              up=round(float(ball[j, 0, i, 1] - ball[j, -1, i, 1]), 4),
                                              planted_both=bool(planted[j, 0, i] and planted[j, -1, i]))
                                   for i, (side, _, _) in enumerate(SIDES)})
                   for j, who in enumerate(("source", "clip"))}
    out["wrap"]["clip"]["joint_turn_max"] = [worst, round(turn[worst], 2)]
    return out


MESH_TOL = 0.001  # world units (about 1 mm): a pair counts as "in" on a frame when it is this much deeper than at rest


def mesh_checks(sc, c: Clip, step: int = 1) -> dict:
    """What only the sculpted surface can say (``sc`` = the baked model's ``Sculpt``): how far the lowest
    point of each foot's surface is under / over the ground, and how deep the surface of forearm and hand
    runs into the head, the trunk and the other arm (world units; the rest pose is given for comparison,
    since the mannequin's upper arm already lies a little in its ribs there).  Per pair: the deepest frame
    (and which side's limb it is), the mean over the frames measured, and the frames that are deeper than
    at rest by more than MESH_TOL (``frames``; ``frame_list`` names them), and the depth on every frame
    measured (``track``)."""
    import body
    names = list(sc.names)
    # the surface some pose can show (the faces sculpting kept), every other vertex of it
    verts = {n: np.asarray(v, np.float64)[np.unique(np.asarray(f)[np.asarray(keep, bool)])][::2]
             for n, v, f, keep in zip(sc.names, sc.verts, sc.faces, sc.keep)}
    hand = ("hand{S}", "forearm{S}", "fingers{S}", "thumb{S}")  # (a model sculpted before the mitten has no fingers)
    pairs = {"hand+forearm / head+neck": (hand, ("head", "neck")),
             "hand+forearm / chest+pelvis": (hand, ("chest", "pelvis")),
             "forearm / chest+pelvis": (("forearm{S}",), ("chest", "pelvis")),
             "upper arm / chest": (("upperarm{S}",), ("chest",)),
             "hand+forearm / other arm": (hand, ("upperarm{O}", "forearm{O}", "hand{O}")),
             "thigh+shin / other leg": (("thigh{S}", "shin{S}", "foot{S}"), ("thigh{O}", "shin{O}", "foot{O}"))}

    def depths(mats) -> Dict[str, Tuple[float, str]]:
        mats = np.asarray(mats, np.float64)
        inv = body.invert(mats)
        out = {}
        for label, (A, B) in pairs.items():
            d, worst = 0.0, ""
            for side, other in (("L", "R"), ("R", "L")):
                for a in A:
                    a = a.replace("{S}", side)
                    if a not in verts:
                        continue
                    world = body.apply(mats[SKEL.index[a]], verts[a])
                    for b in B:
                        b = b.replace("{O}", other)
                        q = body.apply(inv[SKEL.index[b]], world).astype(np.float32)
                        e = float(-body.body_sdf(b, q).min())
                        if e > d:
                            d, worst = e, f"{a} in {b}"
            out[label] = (d, worst)
        return out

    assert all(n in names for n in ("footL", "toeL", "footR", "toeR"))
    rest = {label: d for label, (d, _) in depths(rt.fk({})).items()}
    track = {label: {} for label in pairs}
    low = np.zeros((len(c), 2))
    for t in range(0, len(c), step):
        M = rt.fk(c.body_rots(t), c.root[t])
        for label, dw in depths(M).items():
            track[label][t] = dw
        for i, (side, _, _) in enumerate(SIDES):
            low[t, i] = min(float(body.apply(M[SKEL.index[b + side]], verts[b + side])[:, 1].min()) for b in ("foot", "toe"))
    used = low[::step] - GROUND
    planted = c.contact[::step] >= 0.999
    clash = {}
    for label, tr in track.items():
        ts = sorted(tr)
        d = np.array([tr[t][0] for t in ts])
        k = int(d.argmax())
        over = [t for t in ts if tr[t][0] > rest[label] + MESH_TOL]
        clash[label] = dict(rest=round(rest[label], 4), max=round(float(d[k]), 4), worst_frame=ts[k],
                            worst=tr[ts[k]][1], mean=round(float(d.mean()), 4), frames=len(over), frame_list=over,
                            track=[round(float(x), 4) for x in d])
    return dict(clash=clash,
                sole=dict(lowest=round(float(used.min()), 5), lowest_frame=int(np.unravel_index(used.argmin(), used.shape)[0]) * step,
                          planted_lowest=round(float(used[planted].min()), 5) if planted.any() else None,
                          planted_highest=round(float(used[planted].max()), 5) if planted.any() else None))


# ---------------------------------------------------------------- text report
def print_report(report: dict, res: Optional[dict] = None, log=print):
    wl = report.get("wrist_limits", {}).get("L")
    log(f"  joint limits ({report['outfit_limits']}; mode {report['params']['limits']}; set {report.get('limit_set', 'default')}"
        + (f": left wrist roll {wl[2][0]:g}..{wl[2][1]:g} (- = flexion, + = extension)" if wl else "")
        + f"), {report['frames']} frames:")
    if not report["clamps"]:
        log("    no joint left its limits")
    for b, v in report["clamps"].items():
        axes = ", ".join(f"{a} {d:.1f}" for a, d in v.get("axes", {}).items())
        log(f"    {b:10s} outside on {v['frames']:3d} frames ({100 * v['share']:5.1f} %), by {v['mean']:5.2f} deg on "
            f"average, {v['max']:5.2f} at most (frame {v['worst_frame']})" + (f"; past its range: {axes} deg" if axes else ""))
    for b, v in report.get("twist_passed_on", {}).items():
        log(f"    {b:10s} turned about itself to stay inside (its child takes the twist) on {v['frames']:3d} frames "
            f"({100 * v['share']:5.1f} %), by {v['max']:5.2f} deg at most (frame {v['worst_frame']})")
    for side, v in report.get("arms_swung_out", {}).items():
        log(f"    arm {side}     (--clear-trunk) turned whole about its shoulder-wrist line, out of the trunk, on {v['frames']:3d} "
            f"frames ({100 * v['share']:5.1f} %), by {v['mean']:5.1f} deg on average, {v['max']:5.1f} at most (frame {v['worst_frame']})")
    el = report.get("elbows")
    if el:
        log(f"  elbows out of the trunk (clear by {el['margin']:.4f}, spread over {el['smooth_s']:.2f} s, wrist give {el['wrist_give']:g} deg, "
            f"hand turns {el['hand_turn_most']:g} deg at most, wrist range {el.get('wrist_range', 'default')}):")
        for side in ("L", "R"):
            v = el[side]
            log(f"    elbow {side}: swung on {v['frames']:3d} frames ({v['needed_frames']} needed it), by {v['swivel_mean']:5.1f} deg on "
                f"average, {v['swivel_max']:5.1f} at most (frame {v['swivel_worst_frame']}; {v['swivel_step_max']:.1f} a frame at most); "
                f"deepest in the trunk {v['depth_before']:+.4f} -> {v['depth_after']:+.4f}, frames inside {v['inside_before']} -> "
                f"{v['inside_after']}; wrist moved {v['wrist_moved_max']:.5f} at most; hand turned {v['hand_turned_mean']:.2f} deg on "
                f"average, {v['hand_turned_max']:.2f} at most ({v['hand_turned_frames']} frames; wrist past its limits by "
                f"{v['wrist_past_limits_max']:.1f} at most)"
                + (f"; held inside by the hand-turn cap on {len(v['hand_cap_limited'])} frames {v['hand_cap_limited']}"
                   if v["hand_cap_limited"] else "")
                + (f"; NOT cleared on frames {v['not_cleared']}" if v["not_cleared"] else "")
                + (f"; the wrist came in outside its limits on {v['wrist_in_past_frames']} frames ({v['wrist_in_past_max']:.1f} deg "
                   f"at most) and was left no further out" if v.get("wrist_in_past_frames") else "")
                + (f"; the wrist end of the forearm (which no swivel moves) inside on {v['wrist_end_inside_frames']} frames, "
                   f"{v['wrist_end_depth_after']:+.4f} at most" if v["wrist_end_inside_frames"] else ""))
    gr = report.get("grip")
    if gr:
        for side in ("L", "R"):
            v = gr[side]
            if not v["punches"]:
                log(f"    hand {side}: no punch - open on all {v['open_frames']} frames (guard reach {v['guard_reach']:.3f} of the arm)")
            for q in v["punches"]:
                when = lambda f: "-" if f is None else f"{(f + 1) / report['fps']:.3f} s"  # noqa: E731
                log(f"    hand {side}: {q['name'] or 'punch'} ({q['by']}): closing from {q['start_s']:.3f} s, fist complete at "
                    f"{q['full_s']:.3f} s (contact event {when(q['contact_frame'])}, pressed {when(q['press_frame'])}), reach "
                    f"peaks at {q['peak_s']:.3f} s ({q['reach_guard']:.3f} -> {q['reach_peak']:.3f} of the arm), opening from "
                    f"{when(q['release_frame'])}, open at {when(q['open_frame'])}; grip at contact/complete {q['grip_at_full']:.2f}, "
                    f"at the peak {q['grip_at_peak']:.2f}")
    r, f = report["root"], report["feet"]
    log(f"  pelvis lowered so the legs reach: {r['lowered_frames']} frames, at most {r['lowered_max']:.4f}; "
        f"longest leg {r['reach_max']:.4f} of its length; source stretch {r['stretch'][0]:.3f}..{r['stretch'][1]:.3f}")
    log(f"  feet: lifted to stay on the ground on {f['lift_frames']} frames (at most {f['lift_max']:.4f}); "
        f"ball of the foot off its spot by at most {f['anchor_miss_max']:.5f}; planted frames L/R {f['planted_frames']}")
    if res is None:
        return
    log(f"  {'bone':10s} {'orientation mean':>16s} {'max':>7s} {'axis mean':>10s} {'max':>7s} {'rest gap':>9s}")
    for b, v in res["orientation"].items():
        a = res["axis"].get(b)
        log(f"  {b:10s} {v['mean']:16.2f} {v['max']:7.2f} " + (f"{a['mean']:10.2f} {a['max']:7.2f} {report['rest_gap'].get(b, 0):9.2f}"
                                                                if a else f"{'-':>10s} {'-':>7s} {'-':>9s}"))
    for side, v in res["wrist_offset"].items():
        log(f"  wrist {side} against the source's (seen from the pelvis, scaled): mean {v['mean']:.4f}, max {v['max']:.4f}")
    for side, v in res["source_elbow_to_spine"].items():
        log(f"  the source's own elbow {side} comes within {v['min']:.3f} m of the line of its spine (frame {v['frame']}; "
            f"{v['mean']:.3f} m on average)")
    for side, row in res["punches"].items():
        for who, v in row.items():
            log(f"  arm {side} {who:6s}: shoots out at {v['strike_s']:.3f} s (frame {v['strike_frame']}: {v['strike'][0]:.3f} -> "
                f"{v['strike'][1]:.3f} of its length); longest {v['longest']:.3f} at {v['longest_s']:.3f} s (frame "
                f"{v['longest_frame']}); furthest ahead of the pelvis {v['furthest']:.3f} at {v['furthest_s']:.3f} s")
    fps = report["fps"]
    for who, runs in res["holds"].items():
        log(f"  {who:6s} stands still on frames " + (", ".join(f"{a}..{b} ({(a + 1) / fps:.3f}..{(b + 1) / fps:.3f} s)"
                                                               for a, b in runs) or "none"))
    for e in report["events"]:
        if e.get("type") in ("punch", "block", "hit"):
            log(f"  event {e['t']:.4f} s  {e['type']:6s} {e.get('name', '')}")
    log(f"  feet (retarget.foot_slip): {res['feet']}")
    log(f"  the source's own feet on those frames, scaled: {res['feet_source']}")
    st = res["steps"]
    for who in ("source", "clip"):
        log(f"  footwork {who:6s}: " + "; ".join(f"{side} lands {st[who][side]['land']} lifts {st[who][side]['lift']}"
                                                  for side, _, _ in SIDES))
    log(f"  order of landings and lift-offs the same in source and clip: {st['source']['order'] == st['clip']['order']}"
        f"  ({', '.join(st['source']['order']) or 'none'})")
    for v in st["steps"]:
        log(f"    {v['foot']} down on frames {v['frames'][0]:3d}..{v['frames'][1]:3d}: the ball of the foot moves "
            f"{v['clip']['path']:.4f} along the ground (net {v['clip']['net']:.4f}); the source's own, scaled, "
            f"{v['source']['path']:.4f} (net {v['source']['net']:.4f}); it stands {v['clip']['ahead']:+.3f} ahead "
            f"(source {v['source']['ahead']:+.3f})")
    log(f"  lead foot {st['apart']['lead']} ahead of the other by {st['apart']['clip'][0]:.3f}..{st['apart']['clip'][1]:.3f} "
        f"(source, scaled: {st['apart']['source'][0]:.3f}..{st['apart']['source'][1]:.3f})")
    v = st["travel"]["source_place_m"]
    log(f"  the source's own placing of him, metres: furthest forward {v['furthest']:.3f} at {v['furthest_s']:.3f} s; "
        f"the last frame leaves him {v['end']:+.4f} ahead, {v['end_sideways']:+.4f} to his left")
    for who in ("source", "clip"):
        v = st["travel"][who]
        log(f"  pelvis {who:6s}: furthest forward {v['furthest']:.3f} at {v['furthest_s']:.3f} s, furthest back "
            f"{v['back_most']:.3f}; the last frame leaves it {v['end']:+.4f} ahead, {v['end_sideways']:+.4f} to his left, "
            f"{v['end_height']:+.4f} up")
    w = st["wrap"]["clip"]
    log(f"  played again (last frame -> first): pelvis jumps {w['pelvis']:.4f} (it moves {w['pelvis_per_frame_median']:.4f} "
        f"a frame, median); " + "; ".join(f"ball of {side} foot {v['along']:.4f} along the ground, {v['up']:+.4f} up"
                                          f"{' (planted on both frames)' if v['planted_both'] else ''}"
                                          for side, v in w["feet"].items())
        + f"; most turned joint {w['joint_turn_max'][0]} {w['joint_turn_max'][1]:.1f} deg")
    if "mesh" in res:
        log(f"  surface: sole {res['mesh']['sole']}")
        for label, v in res["mesh"]["clash"].items():
            log(f"    {label:30s} rest {v['rest']:.4f}  worst {v['max']:.4f} (frame {v['worst_frame']}: {v['worst'] or '-'}), "
                f"mean {v['mean']:.4f}, deeper than at rest on {v['frames']} frames")


def _json(path: str, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False, default=clip_mod._jsonable)


# ---------------------------------------------------------------- commands
def _wearing(outfit: str):
    import body
    import costume
    return body.wearing(costume if outfit == "soldier" else None)


def cmd_retarget(a):
    src = load_source(a.source, a.who)
    par = Params(limits=a.limits, stretch=a.stretch, foot_ik=a.foot_ik, keep_axis=a.keep_axis, clear_trunk=a.clear_trunk,
                 clear_elbows=a.clear_elbows, wrist_give=a.wrist_give, hand_turn_max=a.hand_turn_max, grip=a.grip,
                 wrist_range=a.wrist_range)
    os.makedirs(a.out, exist_ok=True)
    with _wearing(a.outfit):  # the limits are those of the outfit that will be worn
        c, report = retarget(src, par)
    c.meta["outfit"] = a.outfit
    c.meta["source_path"] = os.path.abspath(a.source)
    c.save(os.path.join(a.out, a.clip))
    res = measure(src, c)
    if a.model:
        import soldier
        sc = soldier.Sculpt.load(os.path.join(a.model, soldier.MESH_FILE))
        with sc.worn():
            res["mesh"] = mesh_checks(sc, c)
    report["measured"] = {k_: v for k_, v in res.items() if k_ != "extension"}
    report["extension"] = res["extension"]
    _json(os.path.join(a.out, os.path.splitext(a.clip)[0].replace("clip", "import") + ".json"), report)
    print_report(report, res)
    print(f"[import] -> {a.out}/{a.clip}")


VIEWS = {  # name: (azimuth, elevation) in degrees; azimuth 0 = from straight ahead of him, + = towards his left
    # the catalogue's card: its camera yaw 0.25 rad and pitch 0.25 rad round a man who faces along the room's +x,
    # which from HIS frame is from his right, 14.3 degrees round towards his front and 14.3 degrees up
    "catalog": (-(90.0 - math.degrees(0.25)), math.degrees(0.25)),
    "side": (90.0, 8.0),  # from his left: the lead hand of an orthodox stance is the near one
    "right": (-90.0, 8.0), "front": (0.0, 8.0), "three": (-35.0, 10.0), "back": (180.0, 8.0),
}
STICK_BONES_COLOR = {"L": (255, 150, 40), "R": (70, 170, 255), "": (235, 235, 235)}


def _project(cam, p: np.ndarray, scale: int) -> Optional[Tuple[float, float]]:
    q = cam.A @ (cam.viewmat @ np.append(p, 1.0))
    if q[2] <= 1e-6:
        return None
    return float(q[0] / q[2]) * scale, float(q[1] / q[2]) * scale


def stick_frame(src: Source, t: int, cam, k: float, size: Tuple[int, int], scale: int, other: Optional[Source] = None,
                root=None, az: float = 0.0):
    """The source's skeleton (as it draws him: stretched) through a rig camera.  His left orange, his right blue."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (size[0] * scale, size[1] * scale), (24, 26, 34))
    d = ImageDraw.Draw(img)
    if root is not None:  # the same ground dots as the render beside it
        import mocap
        marks = mocap.ground_marks(np.zeros((size[1], size[0], 3), np.float32), cam, root, az)
        ys, xs = np.nonzero(marks[..., 0] > 0)
    figures = [(src, 1.0)] + ([(other, 0.35)] if other is not None else [])
    for who, gain in reversed(figures):
        if who is src:
            _, P = who.stage(t, stretched=True)
        else:  # another figure of the same file: placed in the room of OUR man's frame 0
            _, P = who.fk(t)
            s = float(who.stretch[t])
            P = P * np.array([1.0 / math.sqrt(s), s, 1.0 / math.sqrt(s)])
            P = (P @ who.place_R[t].T + who.place_p[t] - src.place_p[0]) @ src.place_R[0]
        pts = [_project(cam, to_rig(p, k), scale) for p in P]
        for i, n in enumerate(who.names):
            par = who.parent.get(n)
            if par is None or pts[i] is None or pts[who.index[par]] is None:
                continue
            key = "L" if n.startswith("Left") else "R" if n.startswith("Right") else ""
            col = tuple(int(gain * v) for v in STICK_BONES_COLOR[key])
            d.line([pts[who.index[par]], pts[i]], fill=col, width=max(scale - 1, 1))
        if who is src:
            for i, n in enumerate(who.names):
                if pts[i] is not None and not who.children[n]:
                    r = scale
                    d.ellipse([pts[i][0] - r, pts[i][1] - r, pts[i][0] + r, pts[i][1] + r], fill=(250, 250, 250))
    out = np.asarray(img).copy()
    if root is not None:
        for y, x in zip(ys, xs):
            v = int(255 * marks[y, x, 0])
            out[y * scale:(y + 1) * scale, x * scale:(x + 1) * scale] = np.maximum(
                out[y * scale:(y + 1) * scale, x * scale:(x + 1) * scale], v)
    return out


def _label(img: np.ndarray, text: str) -> np.ndarray:
    from PIL import Image, ImageDraw
    im = Image.fromarray(img)
    ImageDraw.Draw(im).text((6, 4), text, fill=(235, 235, 235))
    return np.asarray(im)


def cmd_render(a):
    """Frames of the clip on the baked model from named views; with --compare also the source's stick figure
    through the same camera beside each frame, and a strip of chosen frames."""
    import mocap
    import soldier
    from PIL import Image
    from pixelsplat.shade import upscale
    c = Clip.load(os.path.join(a.out, a.clip))
    src = load_source(a.source or c.meta["source_path"], int(c.meta.get("source", {}).get("who", 0)))
    other = None
    if a.opponent is not None:
        other = load_source(a.source or c.meta["source_path"], a.opponent)
    k = float(c.meta["scale"])
    frames_i = list(range(a.first, len(c) if a.last is None else min(a.last, len(c)), a.step))
    sc, model, bones = soldier.load_model(a.model)
    t0 = time.time()
    done = True
    tgt = mocap.camera_path(c)
    if a.camera == "fixed":  # over the middle of the ground he covers: travel and planted feet are seen as they are
        root = c.root.astype(np.float64)
        tgt = np.tile(0.5 * (root.min(0) + root.max(0)) * np.array([1.0, 0.0, 1.0]) + np.array([0.0, tgt[:, 1].mean(), 0.0]),
                      (len(c), 1))
    extent = a.extent * rig.H if a.extent else soldier.EXTENT
    wid = int(round(a.px * a.aspect))
    with sc.worn():
        R = soldier.Renderer(model, bones, app=True, look_name=a.look)
        for view in a.views.split(","):
            az, el = VIEWS[view] if view in VIEWS else (float(view), a.elevation)
            fdir, sdir = os.path.join(a.out, f"frames_{view}"), os.path.join(a.out, f"stick_{view}")
            os.makedirs(fdir, exist_ok=True)
            os.makedirs(sdir, exist_ok=True)
            player = clip_mod.Player(c)
            new = 0
            for i in range(len(c)):
                mats, root = player.pose(i)  # (every frame: the cloth state has to pass through all of them)
                if i not in frames_i:
                    continue
                cam = soldier.camera(az, el, a.px, a.aspect, target=tuple(np.array(soldier.CENTER) + tgt[i]), extent=extent)
                spath = os.path.join(sdir, f"{i:05d}.png")
                if a.compare:  # (cheap: drawn afresh every run)
                    Image.fromarray(stick_frame(src, i, cam, k, (wid, a.px), a.scale, other, root if a.marks else None,
                                                az)).save(spath)
                path = os.path.join(fdir, f"{i:05d}.png")
                if os.path.exists(path) and not a.force:
                    continue
                if time.time() - t0 > a.budget:
                    done = False
                    break
                img = R.frame(cam, mats, root, az=az)
                if a.marks:
                    img = mocap.ground_marks(img, cam, root, az)
                Image.fromarray((np.clip(upscale(img, a.scale), 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)
                new += 1
            have = [os.path.join(fdir, f"{i:05d}.png") for i in frames_i]
            missing = sum(not os.path.exists(p) for p in have)
            print(f"[render] {view} (azimuth {az:.1f}, elevation {el:.1f}): {new} new frames, {missing} to go "
                  f"({time.time() - t0:.0f}s)", flush=True)
            if missing:
                continue
            fps = c.fps / a.step
            shots = [np.asarray(Image.open(p).convert("RGB")) for p in have]
            mocap.save_anim(shots, os.path.join(a.out, view), fps, a.loops)
            print(f"[render] -> {a.out}/{view}.gif / .mp4 ({len(shots)} frames at {fps:g} fps)")
            if a.compare:
                sticks = [np.asarray(Image.open(os.path.join(sdir, f"{i:05d}.png")).convert("RGB")) for i in frames_i]
                both = [np.concatenate([_label(s, f"source  {(i + 1) / c.fps:.3f} s"), _label(b, "base body")], 1)
                        for i, s, b in zip(frames_i, sticks, shots)]
                mocap.save_anim(both, os.path.join(a.out, f"compare_{view}"), fps, a.loops)
                print(f"[render] -> {a.out}/compare_{view}.gif / .mp4")
                if a.strip:
                    picks = [min(frames_i, key=lambda f: abs(f - int(x))) for x in a.strip.split(",")]
                    top = [_label(sticks[frames_i.index(f)], f"source  frame {f}  {(f + 1) / c.fps:.3f} s") for f in picks]
                    bottom = [_label(shots[frames_i.index(f)], "base body") for f in picks]
                    Image.fromarray(np.concatenate([np.concatenate(top, 1), np.concatenate(bottom, 1)], 0)).save(
                        os.path.join(a.out, f"strip_{view}.png"))
                    print(f"[render] -> {a.out}/strip_{view}.png (frames {picks})")
    if not done:
        print(f"[render] stopped after the time budget ({a.budget:.0f} s): run the same command again to continue")
    return done


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("retarget", help="pose stream (JSON) -> clip on the soldier's rig + report")
    p.add_argument("source")
    p.add_argument("-o", "--out", required=True)
    p.add_argument("--clip", default="clip.npz")
    p.add_argument("--who", type=int, default=0, help="which figure of a frame's list")
    p.add_argument("--outfit", default="none", choices=["soldier", "none"], help="whose joint limits apply")
    p.add_argument("--limits", default="clamp", choices=["clamp", "report"],
                   help="clamp = bring joints inside the limits; report = leave them, only write down how far out")
    p.add_argument("--stretch", default="root", choices=["root", "none"])
    p.add_argument("--no-foot-ik", dest="foot_ik", action="store_false", help="copy the leg orientations too")
    p.add_argument("--no-keep-axis", dest="keep_axis", action="store_false",
                   help="clamp an upper arm to the nearest allowed rotation instead of keeping its direction")
    p.add_argument("--no-clear-elbows", dest="clear_elbows", action="store_false",
                   help="leave an elbow that ends up inside the trunk where the source has it (default: swing it out about "
                        "the shoulder-wrist line; the wrist stays, the hand keeps its orientation)")
    p.add_argument("--wrist-give", type=float, default=0.0,
                   help="degrees the wrist may go past its limits while an elbow is swung out, so the hand turns less (or not at all)")
    p.add_argument("--hand-turn-max", type=float, default=arms.HAND_TURN_MOST,
                   help=f"degrees the glove may turn while an elbow is swung out (default {arms.HAND_TURN_MOST:g}); an elbow that "
                        "would need more is swung only that far and stays partly inside the trunk on those frames (reported)")
    p.add_argument("--wrist-range", default="default", choices=sorted(rig.LIMIT_SETS),
                   help="the wrist's limits: default (flexion 20, extension 30 degrees) or human (70 each way; "
                        "rig.LIMIT_SETS) - every clamp and the elbow clearance keep to them")
    p.add_argument("--no-grip", dest="grip", action="store_false",
                   help="leave the hands open (default: they close into fists as punches are launched)")
    p.add_argument("--clear-trunk", dest="clear_trunk", action="store_true",
                   help="deprecated, kept as it was: turn the WHOLE arm out of the trunk, hand included (the glove turns "
                        "with it); the default elbow clearance replaces it")
    p.add_argument("--model", default=None, help="baked model folder: also measure sole and self-contact on its surface")
    p.set_defaults(fn=cmd_retarget)

    p = sub.add_parser("render", help="clip -> frames -> GIF / MP4 on a baked model")
    p.add_argument("-o", "--out", required=True)
    p.add_argument("--clip", default="clip.npz")
    p.add_argument("--model", default=str(PROJECT / "out" / "bb"))
    p.add_argument("--source", default=None, help="the pose stream (default: the one the clip was made from)")
    p.add_argument("--views", default="catalog,side", help=f"comma list of {', '.join(VIEWS)} or degrees of azimuth")
    p.add_argument("--elevation", type=float, default=8.0, help="for views given in degrees")
    p.add_argument("--compare", action="store_true", help="also the source's stick figure beside every frame")
    p.add_argument("--opponent", type=int, default=None, help="draw this other figure of the file dimly in the source panel")
    p.add_argument("--strip", default=None, help="comma list of frames for a still strip (with --compare)")
    p.add_argument("--camera", default="follow", choices=["follow", "fixed"],
                   help="follow = the camera goes with him (as mocap.py render); fixed = it stays over the middle of his path")
    p.add_argument("--px", type=int, default=192)
    p.add_argument("--aspect", type=float, default=0.75)
    p.add_argument("--scale", type=int, default=4)
    p.add_argument("--extent", type=float, default=None, help="half height of the view, as a fraction of body height")
    p.add_argument("--look", default="stylized")
    p.add_argument("--step", type=int, default=1)
    p.add_argument("--first", type=int, default=0)
    p.add_argument("--last", type=int, default=None)
    p.add_argument("--budget", type=float, default=1500.0, help="stop after this many seconds; run again to continue")
    p.add_argument("--loops", type=int, default=2)
    p.add_argument("--force", action="store_true")
    p.add_argument("--no-marks", dest="marks", action="store_false")
    p.set_defaults(fn=cmd_render)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()

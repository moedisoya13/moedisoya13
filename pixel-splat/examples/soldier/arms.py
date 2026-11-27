"""Arms: two finishing steps for a motion that is already on the rig, whatever it came from.

    clear_elbows   an elbow (or forearm) that the motion puts INSIDE the trunk is swung out of it: the arm
                   turns about the line from shoulder to wrist - its swivel, or "pole", angle - by the smallest
                   angle that takes it clear of the surface, while the wrist stays where it is and the hand keeps
                   its orientation in the world as far as the wrist's limits allow (the wrist's ball takes the
                   twist); the glove may turn by at most ``HAND_TURN_MOST`` (10 degrees) - an elbow that would
                   need more is swung only that far and stays partly inside on those frames, which are reported
    grip_track     the mitten hands (``rig.grip_rots``) close into a fist as a punch is launched and open
                   again as the hand comes back to its guard - read from the arm's own motion, plus the
                   source's punch / hit events when it has them

Both take the list of per-frame poses ({bone: local rotation}) and root offsets that a retarget produces
and change the poses in place; ``fix_clip`` does the same to a saved clip:

    python examples/soldier/arms.py fix out/mocap/run/clip.npz -o out/mocap/run/clip_arms.npz

Why an elbow ends up inside the trunk: a skeleton that is only lines has no ribs.  A motion authored on one
(or estimated from a video) can tuck an elbow a few centimetres in front of the spine; on a body with a
chest of real depth that is inside the chest, and the forearm then comes out of the breast bone.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))

import body  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402

H = rig.H
SKEL = rig.SKELETON
SIDES = (("L", 1), ("R", -1))
ARM_LEN = (rig.RATIO["upper_arm"] + rig.RATIO["forearm"]) * H
INSIDE = 1e-3  # degrees: a joint this near its limits is inside them


def _rest_dir(bone: str) -> np.ndarray:
    b = SKEL.bones[SKEL.index[bone]]
    return rt.unit(np.asarray(b.tail, np.float64) - np.asarray(b.head, np.float64))


def keep_axis(bone: str, R: np.ndarray, prefer: float = 0.0, coarse: float = 5.0) -> Tuple[np.ndarray, float]:
    """(R · turn about the bone's own axis by phi, phi in degrees): the smallest |phi| that brings the joint
    inside its limits (0 if it is inside already).  Where no turn does, the one that leaves it least outside.
    ``prefer``: last frame's phi - of two equally small turns the one on that side is taken."""
    over = lambda Q: rig.clamp_rot(bone, Q)[2]  # noqa: E731
    if rig.limits(bone) is None or over(R) < INSIDE:
        return R, 0.0
    d = _rest_dir(bone)
    turn = lambda phi: R @ rig.rot_axis(d, phi)  # noqa: E731
    first = 1.0 if prefer >= 0 else -1.0
    best, best_over = 0.0, over(R)
    for n in range(1, int(180.0 / coarse) + 1):
        for sign in (first, -first):
            phi = sign * n * coarse
            e = over(turn(phi))
            if e < INSIDE:
                lo, hi = phi - sign * coarse, phi  # outside .. inside: find the edge
                for _ in range(8):
                    mid = 0.5 * (lo + hi)
                    if over(turn(mid)) < INSIDE:
                        hi = mid
                    else:
                        lo = mid
                return turn(hi), float(hi)
            if e < best_over:
                best, best_over = phi, e
    return turn(best), float(best)


# ================================================================ elbows out of the trunk
# The arm as a row of balls: (bone, how far along it, radius as a fraction of H).  Elbow and forearm have the
# mannequin's own thickness, the forearm all the way to the wrist (0.0144 there = the wrist's socket).  The upper
# arm is thinner here than it is, and its top is left out: a hanging arm lies against the flank (at the armpit it
# is IN it, by construction), and that must not count as "inside" - with these radii the rest pose is 0.019
# clear, the walk 0.011, a relaxed stand 0.018.
ARM_BALLS = (
    ("upperarm", 0.50, 0.0170), ("upperarm", 0.62, 0.0190), ("upperarm", 0.75, 0.0210), ("upperarm", 0.88, 0.0225),
    ("upperarm", 1.00, 0.0233),  # the elbow bead
    ("forearm", 0.15, 0.0232), ("forearm", 0.30, 0.0235), ("forearm", 0.45, 0.0215), ("forearm", 0.60, 0.0190),
    ("forearm", 0.78, 0.0165), ("forearm", 0.90, 0.0151), ("forearm", 1.00, 0.0144),  # (1.00 = the wrist itself)
)
# The forearm balls further along than this are measured and reported (``wrist_end_*``) but do not steer the
# swivel: they lie on or next to the shoulder-wrist line it turns about, so no swivel moves them (the one at the
# wrist not at all).  Where the source puts the wrist itself in the chest, that stays in - and is listed.
STEER_UP_TO = 0.80
# what each part of the arm must stay out of (the bare mannequin's solids, whatever is worn)
OBSTACLES = {"upperarm": ("chest", "pelvis"), "forearm": ("chest", "pelvis", "head", "neck")}
CLEAR_MARGIN = 0.004 * H  # the arm's surface ends up at least this far outside the trunk's (7 mm)
SWIVEL_STEP = 3.0  # degrees between the angles that are tried
SWIVEL_MOST = 150.0  # an elbow is never swung further than this
# seconds the swivel is spread over, before and after it is needed.  Short on purpose: what a frame needs is
# already continuous in time when the motion is (it grows from 0 as the arm goes in), so this only takes the
# edge off - a long spread would keep the elbow flared through a punch that needs no swivel at all
SMOOTH_S = 0.05
WRIST_TOL = 5e-4  # world units the wrist may be off after a swivel for it to count as "kept" (0.5 mm)
# The hand keeps its orientation in the world by bending at the wrist against the forearm's swing.  Where the
# wrist reaches its limits first (its side bend is 30 degrees; an elbow swung 45 asks for about 40), the glove
# turns by what is missing.  It may turn by at most this many degrees - the angle between its world orientation
# before and after (geodesic, not per Euler axis).  An elbow that would need more to come clear is swung only as
# far as this allows and stays partly inside the trunk on those frames (``hand_cap_limited``).  (--hand-turn-max)
HAND_TURN_MOST = 10.0
WRIST_GIVE = 0.0  # degrees the wrist may go PAST its limits to keep the hand as it was (0 = the limits hold)


class _Arm:
    """One arm of one pose: where it is, what it has to stay out of, and the pose with the elbow swung."""

    def __init__(self, rots: Dict[str, np.ndarray], root, side: str, give: float = 0.0,
                 turn_most: float = HAND_TURN_MOST):
        self.side, self.s, self.give, self.turn_most = side, (1 if side == "L" else -1), float(give), float(turn_most)
        s = self.s
        self.rots = rots
        M = rt.fk(rots, root)
        self.M = M
        W = lambda b: M[SKEL.index[b]][:, :3]  # noqa: E731
        self.W_clav, self.W_up, self.W_fore, self.W_hand = (W(b + side) for b in ("clav", "upperarm", "forearm", "hand"))
        self.shoulder = rt.at(M, "upperarm" + side, rig.SHOULDER[s])
        self.elbow = rt.at(M, "forearm" + side, rig.ELBOW[s])
        self.wrist = rt.at(M, "hand" + side, rig.WRIST[s])
        span = self.wrist - self.shoulder
        self.straight = float(np.linalg.norm(span)) / ARM_LEN
        self.axis = rt.unit(span) if np.linalg.norm(span) > 1e-6 else None
        pts, rad, part, steer = [], [], [], []
        for bone, along, r in ARM_BALLS:
            b = SKEL.bones[SKEL.index[bone + side]]
            head, tail = np.asarray(b.head, np.float64), np.asarray(b.tail, np.float64)
            pts.append(rt.at(M, bone + side, head + along * (tail - head)))
            rad.append(r * H)
            part.append(bone)
            steer.append(not (bone == "forearm" and along > STEER_UP_TO))
        self.pts, self.rad, self.part, self.steer = np.array(pts), np.array(rad), np.array(part), np.array(steer)
        inv = body.invert(np.asarray(M, np.float64))
        self._inv = {b: inv[SKEL.index[b]] for bs in OBSTACLES.values() for b in bs}
        self._excess0 = max(rig.clamp_rot(b + side, rots.get(b + side, np.eye(3)))[2] for b in ("upperarm", "forearm", "hand"))
        self._posed: Dict[float, tuple] = {}
        self._turn0: Optional[float] = None

    def swung(self, psi: float) -> np.ndarray:
        """The arm's balls with the elbow swung by psi."""
        if not psi or self.axis is None:
            return self.pts
        return (self.pts - self.shoulder) @ rig.rot_axis(self.axis, psi).T + self.shoulder

    def depth(self, psi: float = 0.0, which: str = "steer") -> float:
        """How far the arm's surface is inside what it must stay out of (world units; < 0 = that far clear).
        ``which``: "steer" = the balls the swivel is chosen by (all but the wrist end, ``STEER_UP_TO``),
        "end" = only the wrist end of the forearm, "all" = every ball, to the wrist."""
        pts = self.swung(psi)
        use = {"steer": self.steer, "end": ~self.steer, "all": np.ones_like(self.steer)}[which]
        deep = -np.inf
        for bone, obstacles in OBSTACLES.items():
            m = (self.part == bone) & use
            if not m.any():
                continue
            for o in obstacles:
                q = body.apply(self._inv[o], pts[m]).astype(np.float32)
                deep = max(deep, float((self.rad[m] - body.body_sdf(o, q)).max()))
        return deep

    def pose(self, psi: float) -> Tuple[Dict[str, np.ndarray], float, float, Dict[str, float]]:
        """({upperarm, forearm, hand: local rotation} with the elbow swung by psi, how far the wrist is then
        off (world units), how far the hand has turned (degrees: the angle between its world orientation
        before and after), {bone: degrees past its limits before the clamp; "hand_past": degrees the wrist
        is left past its limits (``give``)}).  Upper arm and forearm turn together about the shoulder-wrist
        line, so the elbow's own bend does not change; the hand is given the world orientation it had.  The
        joints stay inside their limits: an upper arm that would leave them is turned about itself and the
        forearm takes that twist up (``keep_axis``); what is still outside is clamped - and then shows up as a
        wrist that moved (upper arm, forearm) or a hand that turned (the wrist's own limits, less ``give``).
        Every angle here is a geodesic one (``rig.clamp_rot`` measures how far outside its limits a joint is as
        the angle to the nearest allowed rotation), so "past its limits" and "turned" are in the same degrees."""
        side, s = self.side, self.s
        Q = rig.rot_axis(self.axis, psi) if (psi and self.axis is not None) else np.eye(3)
        over: Dict[str, float] = {}
        up, twist = keep_axis("upperarm" + side, self.W_clav.T @ Q @ self.W_up)
        up, _, over["upperarm"] = rig.clamp_rot("upperarm" + side, up)
        W_up = self.W_clav @ up
        fore, _, over["forearm"] = rig.clamp_rot("forearm" + side, W_up.T @ Q @ self.W_fore)
        W_fore = W_up @ fore
        asked = W_fore.T @ self.W_hand
        hand, _, over["hand"] = rig.clamp_rot("hand" + side, asked)
        over["hand_past"] = 0.0
        if over["hand"] > INSIDE and self.give > 0.0:  # the wrist may go this far past its limits for the hand's sake
            hand, over["hand_past"] = _give(side, hand, asked, over["hand"], self.give)
        wrist = self.shoulder + W_up @ (rig.ELBOW[s] - rig.SHOULDER[s]) + W_fore @ (rig.WRIST[s] - rig.ELBOW[s])
        turned = float(rt_geodesic(W_fore @ hand, self.W_hand))
        out = {"upperarm" + side: np.asarray(up, np.float64), "forearm" + side: np.asarray(fore, np.float64),
               "hand" + side: np.asarray(hand, np.float64)}
        over["twist"] = float(twist)
        return out, float(np.linalg.norm(wrist - self.wrist)), turned, over

    def cost(self, psi: float) -> Tuple[float, float]:
        """(how far the wrist would be off, how far the hand would turn) for a swivel of psi (remembered)."""
        key = round(float(psi), 9)
        if key not in self._posed:
            _, miss, turned, _ = self.pose(psi)
            self._posed[key] = (miss, turned)
        return self._posed[key]

    def kept(self, psi: float) -> bool:
        """Can the elbow be swung by psi with the wrist left where it is (within WRIST_TOL) and the hand
        turned by no more than ``turn_most`` (HAND_TURN_MOST; plus what bringing a pose that comes in outside
        the joint limits inside them turns it by without any swivel - 0 for a pose that is inside)?"""
        if not psi:
            return True
        if self._turn0 is None:  # a pose that comes in outside the limits: what bringing it inside turns the hand by
            self._turn0 = self.pose(0.0)[2] if self._excess0 > INSIDE else 0.0
        miss, turned = self.cost(psi)
        return miss <= WRIST_TOL and turned <= self.turn_most + self._turn0

    def need(self, sign: float, margin: float = CLEAR_MARGIN, step: float = SWIVEL_STEP, most: float = SWIVEL_MOST
             ) -> Tuple[Optional[float], float, float, Optional[str]]:
        """(the smallest swivel on that side that takes the arm ``margin`` clear and can be made (``kept``) -
        None if none does -, the swivel to use: that one, or else of those that can be made the one that
        leaves the arm least deep, the depth then, why it is not clear: None (it is), "hand" (a swivel further
        round would clear it with the wrist kept, but would turn the hand by more than ``turn_most``),
        "joints" (the wrist would move: the arm's joint limits), "none" (no swivel on that side clears it))."""
        d0 = self.depth(0.0)
        if d0 <= -margin:
            return 0.0, 0.0, d0, None
        if self.axis is None:
            return None, 0.0, d0, "none"
        clear = lambda psi: self.depth(psi) <= -margin and self.kept(psi)  # noqa: E731
        tried, refused, why = [], 0, set()
        prev = 0.0
        for n in range(1, int(most / step) + 1):
            psi = sign * n * step
            d = self.depth(psi)
            tried.append((d, abs(psi), psi))
            if d > -margin:
                prev = psi
                continue
            if self.kept(psi):
                lo, hi = prev, psi  # not clear .. clear: the edge
                for _ in range(6):
                    mid = 0.5 * (lo + hi)
                    lo, hi = (lo, mid) if clear(mid) else (mid, hi)
                return float(hi), float(hi), float(self.depth(hi)), None
            miss, _ = self.cost(psi)  # clear of the trunk, but it cannot be made: why not
            why.add("joints" if miss > WRIST_TOL else "hand")
            refused += 1  # (further round neither the joints nor the hand cap will allow it either)
            if refused >= 3:
                break
            prev = psi
        why = "hand" if "hand" in why else "joints" if why else "none"
        # nothing that can be made clears: the least deep swivel that can - and then as far towards the next
        # one round (less deep, but not possible) as can be made, so a hand-turn cap is used up to its edge
        by_psi = {round(p, 6): d for d, _, p in tried}
        for d, _, psi in sorted(tried):
            if d >= d0 - 1e-4:
                break
            if not self.kept(psi):
                continue
            nxt = psi + sign * step
            if by_psi.get(round(nxt, 6), np.inf) < d and not self.kept(nxt):
                lo, hi = psi, nxt  # can .. cannot: the edge
                for _ in range(8):
                    mid = 0.5 * (lo + hi)
                    lo, hi = (mid, hi) if self.kept(mid) else (lo, mid)
                d_lo = self.depth(lo)
                if d_lo < d:
                    psi, d = lo, d_lo
            return None, float(psi), float(d), why
        return None, 0.0, d0, why


def _fraction(R: np.ndarray, f: float) -> np.ndarray:
    """The rotation that is the share f of R (same axis, f times the angle)."""
    ang = rt_geodesic(np.eye(3), R)
    if ang < 1e-9 or f <= 0.0:
        return np.eye(3)
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return rig.rot_axis(ax, f * ang) if np.linalg.norm(ax) > 1e-12 else np.eye(3)


def _give(side: str, hand: np.ndarray, asked: np.ndarray, over: float, give: float) -> Tuple[np.ndarray, float]:
    """(the wrist turned from ``hand`` - its nearest allowed rotation - towards ``asked``, until it is ``give``
    degrees outside its limits or has reached ``asked``; how far outside it then is).  "Outside by" is what
    ``rig.clamp_rot`` measures (the angle to the nearest allowed rotation), the degrees the hand's turn is in."""
    past = lambda Q: rig.clamp_rot("hand" + side, Q)[2]  # noqa: E731
    if over <= give:
        return asked, past(asked)
    step = hand.T @ asked
    at = lambda f: hand @ _fraction(step, f)  # noqa: E731
    f = give / over
    e = past(at(f))
    if abs(e - give) > 0.01:  # the nearest allowed rotation moved on the way: find the share that is give out
        lo, hi = (0.0, f) if e > give else (f, 1.0)
        for _ in range(20):
            f = 0.5 * (lo + hi)
            e = past(at(f))
            lo, hi = (f, hi) if e <= give else (lo, f)
        f = lo
        e = past(at(f))
    return at(f), e


def rt_geodesic(Ra: np.ndarray, Rb: np.ndarray) -> float:
    """Degrees between two rotations."""
    c = (np.trace(np.asarray(Ra).T @ np.asarray(Rb)) - 1.0) / 2.0
    s = np.linalg.norm(np.asarray(Ra) - np.asarray(Rb)) / math.sqrt(8.0)  # = sin(angle / 2): precise near 0
    return math.degrees(2.0 * math.asin(min(max(s, 0.0), 1.0)) if c > 0.9 else math.acos(min(max(c, -1.0), 1.0)))


def swivel_arm(rots: Dict[str, np.ndarray], side: str, psi: float, root=(0.0, 0.0, 0.0), wrist_give: float = WRIST_GIVE
               ) -> Dict[str, float]:
    """Swing one elbow of a pose by ``psi`` degrees about its shoulder-wrist line, in place: the wrist stays,
    the hand keeps its world orientation.  Returns what it cost: wrist_miss (world units), hand_turn (degrees),
    elbow_moved (world units), and how far each joint would have been outside its limits."""
    arm = _Arm(rots, root, side, wrist_give)
    new, miss, turned, over = arm.pose(psi)
    rots.update(new)
    after = _Arm(rots, root, side)
    return dict(wrist_miss=miss, hand_turn=turned, elbow_moved=float(np.linalg.norm(after.elbow - arm.elbow)), over=over)


def arm_depth(rots: Dict[str, np.ndarray], side: str, root=(0.0, 0.0, 0.0), which: str = "all") -> float:
    """How far one arm of a pose is inside the trunk / the forearm inside the head (world units; < 0 = clear).
    ``which``: "all" = the whole arm to the wrist, "steer" = without the wrist end of the forearm (what the
    swivel can move), "end" = the wrist end only."""
    return _Arm(rots, root, side).depth(0.0, which)


def _spread(v: np.ndarray, r: int, loop: bool) -> np.ndarray:
    """A signed track that is 0 where nothing is needed, made smooth without ever dropping below what is needed.

    Each sign on its own: the largest value within r frames, then the mean over the same window (every value
    in that window is at least the one in its middle, so the mean is too).  Outside the track nothing is
    needed (zeros; ``loop``: the track wraps round).  A frame that needs a swivel gets its own side's value -
    never one with the other side subtracted.  A frame between two runs that swing to OPPOSITE sides goes
    through 0 at the middle of the gap: each side's value fades out linearly towards it.  (Where the gap is
    short that is a fast change; ``swivel_step_max`` in the report shows it.)"""
    v = np.asarray(v, np.float64)
    T = len(v)
    if r <= 0 or not np.any(v):
        return v.copy()
    k = np.arange(-2 * r, T + 2 * r)

    def one(m):  # m >= 0
        a = np.take(m, k, mode="wrap") if loop else np.concatenate([np.zeros(2 * r), m, np.zeros(2 * r)])
        grown = np.array([a[i:i + 2 * r + 1].max() for i in range(T + 2 * r)])  # frames -r .. T - 1 + r
        return np.array([grown[t:t + 2 * r + 1].mean() for t in range(T)])

    up, down = one(np.maximum(v, 0.0)), one(np.maximum(-v, 0.0))
    side = {1.0: up, -1.0: down}
    out = np.zeros(T)
    needed = np.flatnonzero(v != 0.0)
    for t in range(T):
        if v[t] != 0.0:
            out[t] = np.sign(v[t]) * side[np.sign(v[t])][t]
            continue
        near = []  # the nearest frame that needs a swivel before / after this one: (frames away, sign)
        for direction in (-1, 1):
            d = direction * (needed - t)
            if loop:
                d = d % T
            ok = np.flatnonzero(d > 0)
            if len(ok):
                i = ok[np.argmin(d[ok])]
                near.append((int(d[i]), float(np.sign(v[needed[i]]))))
        signs = {s for _, s in near}
        if len(signs) == 1:
            s = signs.pop()
            out[t] = s * side[s][t]
        elif len(signs) == 2:  # between opposite runs: through 0 half way
            total = near[0][0] + near[1][0]
            out[t] = sum(s * side[s][t] * max(1.0 - 2.0 * d / total, 0.0) for d, s in near)
    return out


def clear_elbows(frames: Sequence[Dict[str, np.ndarray]], roots, fps: float, margin: float = CLEAR_MARGIN,
                 smooth_s: float = SMOOTH_S, loop: bool = False, wrist_give: float = WRIST_GIVE,
                 hand_turn_most: float = HAND_TURN_MOST, log=None) -> dict:
    """Swing every elbow that is inside the trunk out of it, over a whole motion, in place.

    Per arm: (1) frame by frame, the smallest swivel either way that takes the arm ``margin`` clear and can be
    made with the wrist kept (joint limits) and the hand turned by no more than ``hand_turn_most`` (the wrist's
    limits leave the rest to the hand; ``wrist_give`` lets it go past them) - where none can, the swivel that
    can be made that leaves the arm least deep, up to that cap; (2) each run of frames that needs one gets ONE
    side - the one that leaves the fewest frames inside, then the least deep, then the smaller swing - so the
    elbow cannot flip from one side to the other between frames; (3) the angle is spread over ``smooth_s``
    seconds before and after (``_spread``: never less than what a frame needs; runs to opposite sides pass
    through 0 between them); (4) a spread angle that cannot be made is cut back to the largest that can; (5) it
    is applied, and measured again - the whole arm, to the wrist.  Returns the report (per arm: frames swung,
    mean / largest swivel, depth before and after, how far wrist and hand moved, the frames the hand-turn cap
    held the elbow inside, the frames that are not clear)."""
    T = len(frames)
    roots = np.asarray(roots, np.float64).reshape(T, 3)
    r = int(round(smooth_s * fps))
    report: dict = dict(margin=float(margin), smooth_s=float(smooth_s), smooth_frames=r, loop=bool(loop),
                        wrist_give=float(wrist_give), hand_turn_most=float(hand_turn_most))
    for side, _ in SIDES:
        arms = [_Arm(frames[t], roots[t], side, wrist_give, hand_turn_most) for t in range(T)]
        before = np.array([a.depth() for a in arms])
        end_before = np.array([a.depth(0.0, "end") for a in arms])
        want = np.zeros(T)  # signed swivel each frame needs
        stuck: List[int] = []
        capped: List[int] = []
        hit = before > -margin
        for a_, b_ in rt.intervals(hit):
            run = list(range(a_, b_ + 1))
            probe = sorted({run[int(k)] for k in np.linspace(0, len(run) - 1, min(len(run), 7))})
            score = {}
            for sign in (1.0, -1.0):  # which way out: tried on a few frames of the run, then one side for all of it
                got = [arms[t].need(sign, margin) for t in probe]
                score[sign] = (sum(g[0] is None for g in got), round(max(g[2] for g in got if g[0] is None), 3)
                               if any(g[0] is None for g in got) else 0.0, max(abs(g[1]) for g in got))
            sign = min(score, key=score.get)  # fewest frames left inside, then the least deep, then the smaller swing
            for t in run:
                g = arms[t].need(sign, margin)
                want[t] = g[1]
                if g[0] is None:
                    stuck.append(t)
                    if g[3] == "hand":
                        capped.append(t)
        psi = _spread(want, r, loop)  # never below what is needed, one sign per run
        after, end_after = before.copy(), end_before.copy()
        miss, turned, moved, past = np.zeros(T), np.zeros(T), np.zeros(T), np.zeros(T)
        cut: List[int] = []
        for t in range(T):
            if abs(psi[t]) < 1e-3:
                psi[t] = 0.0
                continue
            arm = arms[t]
            if not arm.kept(psi[t]):  # the spread angle cannot be made here: as much of it as can
                lo, hi = (want[t] if arm.kept(want[t]) else 0.0), psi[t]
                for _ in range(8):
                    mid = 0.5 * (lo + hi)
                    lo, hi = (mid, hi) if arm.kept(mid) else (lo, mid)
                psi[t] = lo
                cut.append(t)
            new, miss[t], turned[t], over = arm.pose(psi[t])
            past[t] = over["hand_past"]
            frames[t].update(new)
            done = _Arm(frames[t], roots[t], side)
            after[t], end_after[t] = done.depth(), done.depth(0.0, "end")
            moved[t] = float(np.linalg.norm(done.elbow - arm.elbow))
        swung = np.abs(psi) > 0.05
        left_in = after > -margin + 1e-6
        report[side] = dict(
            frames=int(swung.sum()), share=round(float(swung.mean()), 4),
            needed_frames=int(hit.sum()),
            swivel_mean=round(float(np.abs(psi[swung]).mean()), 2) if swung.any() else 0.0,
            swivel_max=round(float(np.abs(psi).max()), 2), swivel_worst_frame=int(np.abs(psi).argmax()),
            swivel_step_max=round(float(np.abs(np.diff(psi)).max()), 2) if T > 1 else 0.0,
            depth_before=round(float(before.max()), 4), depth_before_frame=int(before.argmax()),
            depth_after=round(float(after.max()), 4), depth_after_frame=int(after.argmax()),
            depth_after_mean_inside=round(float(after[after > 0].mean()), 4) if (after > 0).any() else 0.0,
            inside_before=int((before > 0).sum()), inside_after=int((after > 0).sum()),
            under_margin_after=int(left_in.sum()),
            wrist_end_depth_before=round(float(end_before.max()), 4), wrist_end_depth_after=round(float(end_after.max()), 4),
            wrist_end_inside_frames=int((end_after > 0).sum()),
            wrist_end_inside=[int(t) for t in np.flatnonzero(end_after > 0)],
            wrist_moved_max=round(float(miss.max()), 6), hand_turned_max=round(float(turned.max()), 3),
            hand_turned_mean=round(float(turned[swung].mean()), 3) if swung.any() else 0.0,
            hand_turned_frames=int((turned > 0.05).sum()), wrist_past_limits_max=round(float(past.max()), 3),
            elbow_moved_max=round(float(moved.max()), 4),
            hand_cap_limited=[int(t) for t in sorted(set(capped)) if left_in[t]],
            not_cleared=[int(t) for t in sorted(set(stuck) | {int(t) for t in np.flatnonzero(left_in)})],
            spread_cut=[int(t) for t in cut], swivel=[round(float(v), 2) for v in psi])
        if log:
            v = report[side]
            log(f"[arms] elbow {side}: swung on {v['frames']} of {T} frames ({v['needed_frames']} needed it), by "
                f"{v['swivel_mean']:.1f} deg on average, {v['swivel_max']:.1f} at most (frame {v['swivel_worst_frame']}); "
                f"deepest in the trunk {v['depth_before']:+.4f} -> {v['depth_after']:+.4f}; frames inside "
                f"{v['inside_before']} -> {v['inside_after']}; wrist moved {v['wrist_moved_max']:.6f} at most, "
                f"hand turned {v['hand_turned_mean']:.2f} deg on average, {v['hand_turned_max']:.2f} at most (cap {hand_turn_most:g})"
                + (f"; held inside by the hand-turn cap on {len(v['hand_cap_limited'])} frames" if v["hand_cap_limited"] else "")
                + (f"; NOT cleared on frames {v['not_cleared']}" if v["not_cleared"] else "")
                + (f"; wrist end of the forearm inside on {v['wrist_end_inside_frames']} frames (by {v['wrist_end_depth_after']:+.4f}"
                   f" at most: the wrist does not move)" if v["wrist_end_inside_frames"] else ""))
    return report


# ================================================================ grip: the fist follows the punch
GUARD_PERCENTILE = 20.0  # the hand's home: this percentile of its reach over the motion
LAUNCH_SPEED = 2.0  # arm lengths per second the reach must grow by for the hand to count as launched
OUT_SPEED = 0.3  # ... and it is still on its way out while the reach grows faster than this
PAUSE_S = 0.10  # ... a stand-still of up to this long on the way out (a hit-stop) is part of the same punch
# arm lengths a hand has to go out beyond its guard (or its start, if further out) to count as a punch.  (At 0.10
# the guard hand of a one-two, which rides out 0.10-0.15 with the turning shoulders, was taken for a punch.)
PUNCH_MIN = 0.15
FULL_AT = 0.5  # the fist is complete when the hand is this share of the way out (or at contact, if that is known)
CLOSE_S = 5.0 / 60.0  # seconds the fist takes to close (it starts that long before it is complete)
HOLD = 0.75  # on the way back the fist stays closed until the hand is back to this share of its extension
OPEN = 0.25  # ... and is fully open again at this share
OPEN_MIN_S = 0.10  # ... but takes at least this long to open, however fast the hand snaps back
EVENT_HOLD_S, EVENT_OPEN_S = 0.10, 0.20  # a punch known only from an event: closed this long after contact, then opening


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def reach(frames: Sequence[Dict[str, np.ndarray]], roots=None) -> np.ndarray:
    """(T, 2): distance from shoulder to wrist of the left / right arm, in arm lengths (1 = straight)."""
    T = len(frames)
    roots = np.zeros((T, 3)) if roots is None else np.asarray(roots, np.float64).reshape(T, 3)
    out = np.zeros((T, 2))
    for t in range(T):
        M = rt.fk(frames[t], roots[t])
        for i, (side, s) in enumerate(SIDES):
            out[t, i] = np.linalg.norm(rt.at(M, "hand" + side, rig.WRIST[s]) - rt.at(M, "upperarm" + side, rig.SHOULDER[s])) / ARM_LEN
    return out


def _punches_from_motion(e: np.ndarray, fps: float, guard: float = 0.0) -> List[dict]:
    """Punches of one hand read from its reach ``e`` (T,): [{start, full, peak, ...}].  ``base`` = where the hand
    set off from, or its guard if that is further out: a hand that was drawn back and comes home to its guard
    has not punched, and a punch thrown from a drawn-back hand is measured (and later opens) from the guard."""
    T = len(e)
    v = np.zeros(T)
    if T > 1:
        v[1:] = np.diff(e) * fps  # speed over the frame that ENDS here
    pause = int(round(PAUSE_S * fps)) + 1
    out, t = [], 0
    while t < T:
        if v[t] < LAUNCH_SPEED:
            t += 1
            continue
        a = t
        while a - 1 >= 0 and v[a - 1] > OUT_SPEED:  # back to where it began to go out
            a -= 1
        a = max(a - 1, 0)  # the last frame before it moved
        b = t
        while True:  # on while it keeps going out; a pause (a hit-stop) of up to PAUSE_S on the way does not end it
            nxt = next((k for k in range(b + 1, min(b + 1 + pause, T)) if v[k] > OUT_SPEED), None)
            if nxt is None or v[b + 1:nxt].min(initial=0.0) < -OUT_SPEED:
                break
            b = nxt
        peak = a + int(np.argmax(e[a:b + 1]))
        base = float(max(e[a], guard))  # what it has to get beyond, and comes back to
        gain = float(e[peak] - base)
        if gain >= PUNCH_MIN:
            half = base + FULL_AT * gain
            full = next(k for k in range(a, peak + 1) if e[k] >= half - 1e-12)
            out.append(dict(start=a, full=full, peak=peak, base=base, gain=gain, by="motion"))
        t = b + 1
    return out


def grip_track(frames: Sequence[Dict[str, np.ndarray]], roots, fps: float, events: Optional[Sequence[dict]] = None
               ) -> Tuple[np.ndarray, dict]:
    """(T, 2) grip of the left / right hand (0 open .. 1 fist) for a motion, and a report.

    The rule, per hand (constants above):
      reach      distance shoulder -> wrist in arm lengths; guard = its GUARD_PERCENTILE over the motion
      launch     the reach grows faster than LAUNCH_SPEED; the punch lasts while it grows faster than OUT_SPEED
                 (a stand-still of up to PAUSE_S on the way is part of it) and counts if the hand ends up
                 PUNCH_MIN beyond where it set off - or beyond its guard, if it set off from further back
      closing    the fist is complete on the frame the hand is FULL_AT of the way out - or on the frame of the
                 source's contact event (block / hit), whichever is first - and starts closing CLOSE_S before
                 that, or at the source's punch event if that is earlier (smoothstep)
      closed     through the peak and back until the hand has returned to HOLD of its extension (measured from
                 where it set off, or from its guard if that is further out)
      opening    with the hand's own return: open again at OPEN of the extension, taking at least OPEN_MIN_S
                 over it; it never re-closes on the way back
    Events ({t seconds, type "punch" | "block" | "hit", name}): a punch event and the contact event of the
    same name belong together; the arm they mean is the one whose reach grows more between the two.  A punch
    that only the events know (a hook keeps its elbow bent: the reach hardly changes) closes by its contact,
    stays closed EVENT_HOLD_S and opens over EVENT_OPEN_S."""
    T = len(frames)
    r = reach(frames, roots)
    g = np.zeros((T, 2))
    report: dict = dict(rule=dict(guard_percentile=GUARD_PERCENTILE, launch_speed=LAUNCH_SPEED, out_speed=OUT_SPEED,
                                  pause_s=PAUSE_S, punch_min=PUNCH_MIN, full_at=FULL_AT, close_s=CLOSE_S, hold=HOLD, open=OPEN, open_min_s=OPEN_MIN_S,
                                  event_hold_s=EVENT_HOLD_S, event_open_s=EVENT_OPEN_S))
    frame_of = lambda t: int(min(max(round(float(t) * fps) - 1, 0), T - 1))  # noqa: E731  (frame i is shown at (i + 1) / fps)
    guard = np.percentile(r, GUARD_PERCENTILE, axis=0) if T else np.zeros(2)
    e = r  # (the reach itself; what a punch is measured from: see ``_punches_from_motion``)
    punches = [_punches_from_motion(e[:, i], fps, float(guard[i])) for i in range(2)]
    # the source's own account: punch (pressed) + block / hit (contact), paired by name and order
    pairs = []
    presses = [ev for ev in (events or []) if ev.get("type") == "punch"]
    contacts = [ev for ev in (events or []) if ev.get("type") in ("block", "hit")]
    for ev in presses:
        hit = next((c for c in contacts if c.get("name") == ev.get("name") and c["t"] >= ev["t"]), None)
        if hit is not None:
            contacts.remove(hit)
        pairs.append((ev, hit))
    for ev, hit in pairs:
        a = frame_of(ev["t"])
        c = frame_of(hit["t"]) if hit is not None else min(a + int(round(CLOSE_S * fps)), T - 1)
        i = int(np.argmax(r[c] - r[a]))  # the arm that goes out between the press and the contact
        apart = lambda p: max(p["start"] - c, c - p["peak"], 0)  # noqa: E731  (frames from the contact to that punch)
        near = sorted((p for p in punches[i] if apart(p) <= int(0.15 * fps) and "press" not in p), key=apart)
        if near:
            p = near[0]
            p.update(by="motion+event", press=a, name=ev.get("name"))
            if hit is not None:
                p["contact"] = c
        else:
            punches[i].append(dict(start=a, full=c, peak=c, base=float(e[a, i]), gain=float(max(e[c, i] - e[a, i], 0.0)),
                                   by="event", press=a, name=ev.get("name"), **({"contact": c} if hit is not None else {})))
    n_close = max(int(round(CLOSE_S * fps)), 1)
    slow = 1.0 / max(OPEN_MIN_S * fps, 1.0)  # the most the grip may drop in one frame
    for i, (side, _) in enumerate(SIDES):
        rows = []
        for p in sorted(punches[i], key=lambda q: q["start"]):
            full = min(p["full"], p.get("contact", p["full"]))
            start = min(full - n_close, p.get("press", full))
            one = np.zeros(T)
            for t in range(max(start, 0), full):
                one[t] = float(smoothstep((t - start) / max(full - start, 1)))
            if p["by"] == "event":  # nothing to read the return from: by the clock
                hold = full + int(round(EVENT_HOLD_S * fps))
                n_open = max(int(round(EVENT_OPEN_S * fps)), 1)
                one[full:min(hold + 1, T)] = 1.0
                for t in range(hold + 1, min(hold + n_open + 1, T)):
                    one[t] = float(1.0 - smoothstep((t - hold) / n_open))
                release, opened = hold, min(hold + n_open, T - 1)
            else:
                peak, top = p["peak"], max(p["gain"], 1e-9)
                one[full:peak + 1] = 1.0
                level, release, opened = 1.0, None, None
                for t in range(peak + 1, T):
                    back = (e[t, i] - p["base"]) / top  # 1 at the peak .. 0 back where it set off
                    level = max(min(level, float(smoothstep((back - OPEN) / (HOLD - OPEN)))), level - slow)
                    one[t] = level
                    if release is None and level < 1.0:
                        release = t - 1
                    if level <= 0.0:
                        opened = t
                        break
                release = T - 1 if release is None else release
            g[:, i] = np.maximum(g[:, i], one)
            rows.append(dict(by=p["by"], name=p.get("name"), start_frame=int(max(start, 0)), full_frame=int(full),
                             peak_frame=int(p["peak"]), contact_frame=p.get("contact"), press_frame=p.get("press"),
                             release_frame=int(release), open_frame=None if opened is None else int(opened),
                             start_s=round((max(start, 0) + 1) / fps, 4), full_s=round((full + 1) / fps, 4),
                             peak_s=round((p["peak"] + 1) / fps, 4),
                             open_s=None if opened is None else round((opened + 1) / fps, 4),
                             reach_guard=round(float(guard[i]), 4), reach_peak=round(float(r[p["peak"], i]), 4),
                             grip_at_full=round(float(max(g[full, i], one[full])), 4),
                             grip_at_peak=round(float(max(g[p["peak"], i], one[p["peak"]])), 4)))
        closed = g[:, i] >= 0.999
        report[side] = dict(punches=rows, guard_reach=round(float(guard[i]), 4), closed_frames=int(closed.sum()),
                            open_frames=int((g[:, i] <= 0.001).sum()),
                            grip_step_max=round(float(np.abs(np.diff(g[:, i])).max()), 4) if T > 1 else 0.0,
                            grip_first=round(float(g[0, i]), 4) if T else 0.0, grip_last=round(float(g[-1, i]), 4) if T else 0.0,
                            track=[round(float(v), 3) for v in g[:, i]])
    return g, report


def apply_grip(frames: Sequence[Dict[str, np.ndarray]], grip: np.ndarray) -> None:
    """Write a grip track (T, 2) into the poses' finger and thumb bones, in place."""
    for t, rots in enumerate(frames):
        rig.set_grip(rots, float(grip[t, 0]), float(grip[t, 1]))


# ================================================================ a saved clip
def fix_clip(c, clear: bool = True, grip: bool = True, events: Optional[Sequence[dict]] = None, loop: bool = False,
             log=None, hand_turn_most: float = HAND_TURN_MOST, wrist_give: float = WRIST_GIVE):
    """A clip with its elbows cleared and its hands gripping (see the module text): (new clip, report)."""
    import clip as clip_mod
    frames = [c.rots(t) for t in range(len(c))]
    roots = c.root.astype(np.float64)
    report: dict = {}
    if clear:
        report["elbows"] = clear_elbows(frames, roots, c.fps, loop=loop, wrist_give=wrist_give, hand_turn_most=hand_turn_most,
                                        log=log)
    if grip:
        g, report["grip"] = grip_track(frames, roots, c.fps, events)
        apply_grip(frames, g)
    bones = list(c.bones) + [b for b in rig.HAND_BONES if b not in c.bones and grip]
    out = clip_mod.Clip.from_rots(c.fps, frames, c.root, bones=bones, contact=c.contact, flight=c.flight, drive=c.drive,
                                  meta=dict(c.meta, arms=dict(clear=clear, grip=grip)))
    return out, report


def main():
    import clip as clip_mod
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("fix", help="clip -> clip with the elbows out of the trunk and the hands gripping")
    p.add_argument("clip")
    p.add_argument("-o", "--out", required=True, help="the clip to write (a new file)")
    p.add_argument("--outfit", default="none", choices=["soldier", "none"], help="whose joint limits apply")
    p.add_argument("--no-clear", dest="clear", action="store_false", help="leave the elbows where they are")
    p.add_argument("--no-grip", dest="grip", action="store_false", help="leave the hands as they are")
    p.add_argument("--loop", action="store_true", help="the clip repeats: smooth across its seam")
    p.add_argument("--hand-turn-max", type=float, default=HAND_TURN_MOST,
                   help=f"degrees the glove may turn while an elbow is swung out (default {HAND_TURN_MOST:g}); an elbow that "
                        "would need more is swung only that far and stays partly inside on those frames (reported)")
    p.add_argument("--wrist-give", type=float, default=WRIST_GIVE,
                   help="degrees the wrist may go past its limits there, so the glove turns less (default 0)")
    p.add_argument("--events", default=None, help="JSON file with [{t, type, name}] punch / block / hit events")
    a = ap.parse_args()
    if os.path.abspath(a.out) == os.path.abspath(a.clip):
        raise SystemExit("write to a new file: the clip that was read is kept")
    import costume
    events = json.load(open(a.events)) if a.events else None
    c = clip_mod.Clip.load(a.clip)
    with body.wearing(costume if a.outfit == "soldier" else None):
        out, report = fix_clip(c, a.clear, a.grip, events, a.loop, log=print, hand_turn_most=a.hand_turn_max,
                               wrist_give=a.wrist_give)
    out.save(a.out)
    with open(os.path.splitext(a.out)[0] + "_arms.json", "w") as f:
        json.dump(report, f, indent=1)
    for side, _ in SIDES:
        for row in report.get("grip", {}).get(side, {}).get("punches", []):
            print(f"[arms] grip {side}: fist from {row['start_s']:.3f} s, complete at {row['full_s']:.3f} s, peak "
                  f"{row['peak_s']:.3f} s, open again at {row['open_s']} s ({row['by']})")
    print(f"[arms] -> {a.out}")


if __name__ == "__main__":
    main()

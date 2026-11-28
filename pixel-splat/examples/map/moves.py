"""The BB's moves for the play page: loops, the one-two, and short transition clips between them, all at 60 fps.

Sprites cannot be blended at run time, so every change of move the page can make is either a cut between
two frames that are (nearly) the same pose, or a rendered transition clip:

    idle    a breathing guard loop (``motion.guard_idle_rots``) around the first pose of the one-two
    walk    ``motion.walk_rots`` on the spot, one cycle = 60 frames = 1.0 s = 1.4 m at 1.4 m/s (120 steps a minute)
    run     ``motion.run_gait_rots`` on the spot, one cycle = 40 frames = 0.667 s = 2.5 m at 3.75 m/s
    onetwo  the imported clip (wrist range "human"), 144 frames; it starts on the idle's pose and its last
            0.5 s ease back onto it, so it begins and ends where the idle is
    start   idle -> walk: the hips first slide over the front (left) foot while the walk waits at its phase 0, then
            the rear (right) foot steps off - it carries no weight from then on (0.6 s, ends at walk phase 0.4)
    stopA / stopB   walk -> idle, entered at walk phase 0 (left foot just down in front: the guard's own
            foot order) or 0.5 (right foot in front: the walk carries on one step so the left foot comes
            through and lands in front).  The rear foot, about to push off, is not pinned (the front one carries the body);
            elbows fold first and the shoulders follow (``ARM_TIMING``), so the arms bend into the guard, not reach out
    w2r_0 / w2r_5, r2w_0 / r2w_5   walk <-> run at phase 0 / 0.5 (the two loops share their phase: 0 = left
            foot down)
    qw0..qw3 / qr0..qr7   quick stop into the one-two (J while walking / running), entered at walk phase j/4 /
            run phase j/8.  The one-two plays in time from its frame QUICK_INTO - QUICK_ARMS (skipping its guard
            bounce); the upper body cross-fades into it over QUICK_ARMS frames (the jab starts reaching out the
            frame after), the legs over QUICK_LEGS frames from the first phase where the foot that is down can
            become the guard's (quick_leg_start; until then the legs walk / run on).  The page then plays the
            one-two on from the clip's last frame.  Root motion: from the planted feet; what no foot holds slows
            from the gait's speed to 0 with the legs' weight (a run's flight does not carry full speed into the punch)

A transition cross-fades the two moves (each keeps playing in time; local joint rotations slerped, the
pelvis lerped, weight = smootherstep), then (1) moves the body over the ground by what the planted feet
say (root motion taken from the feet that are down, so they do not skate) and (2) pins every foot that is
down to the floor (``motion.pin_legs``).  Its frames are on the spot like the loops' (the page moves the
figure by the per-frame ``advance`` instead).

``report()`` measures what the page will show: the largest joint jump between two displayed frames at every
cut and inside every clip, and how far planted feet slide.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "examples" / "soldier"))
import motion  # noqa: E402
import rig  # noqa: E402
from clip import Clip, geodesic_deg, mat_to_quat, quat_to_mat, slerp  # noqa: E402

FPS = 60.0
M = motion.M_PER_UNIT  # metres per world unit
WALK_FRAMES = int(round(motion.WALK_PERIOD * FPS))  # 60
RUN_FRAMES = int(round(motion.RUN_PERIOD * FPS))  # 40
IDLE_FRAMES = 120  # 2 s, one breath
QUICK_PHASES = dict(walk=4, run=8)  # quick stops at phase j / this: at most 12 (walk) / 5 (run) frames to wait
QUICK_ARMS = 14  # frames: the upper body's cross-fade into the one-two
QUICK_LEGS = 16  # frames: the legs' (and the root's)
QUICK_INTO = 40  # the one-two frame the upper body reaches (its jab starts reaching out at frame 41)
LEGS = ("pelvis", "thighL", "shinL", "footL", "toeL", "thighR", "shinR", "footR", "toeR")
# gait phases (sixteenths) where the legs may start settling into the guard: the foot that is down is (or is about to
# be) the front one; from the others the planted foot would have to end up in front, and the body would go BACK
# (moves.py quick-scan measures every sixteenth: travel, slowest frame, foot slide)
QUICK_LEG_START = dict(walk=(0, 9, 10, 11, 12, 15), run=tuple(range(3, 14)))
ONETWO_EASE = 30  # last frames of the one-two eased back onto the idle pose
WALK_SPEED = motion.STRIDE * M / motion.WALK_PERIOD  # 1.4 m/s
RUN_SPEED = motion.RUN_STRIDE * M / motion.RUN_PERIOD  # 3.75 m/s
BODY = [b for b in rig.GEOMETRY_BONES if b in rig.SKELETON.index]
START_FRAMES = 36  # idle -> walk, in all (0.6 s)
START_SHIFT = 12  # ... of which the weight shift onto the front foot before the walk's clock starts (0.2 s)
START_SWAY = 0.035  # world units the hips move towards the front (left) foot for it
START_DIP = 0.006  # ... and down (the knees give a little as the weight comes onto one leg)
CONTACT_ON = 0.5  # a foot whose contact weight is above this is pinned
PIN_FOLLOW = 0.3  # fraction of a pinned foot's offset from its pose the root takes up each frame
RELEASE_FRAMES = 0  # a foot that lifts off eases out of its pin over this many frames


class Frame:
    """One pose: local rotations of the body bones, root offset (on the spot), feet down (L, R)."""
    __slots__ = ("rots", "root", "contact")

    def __init__(self, rots: Dict[str, np.ndarray], root, contact):
        self.rots = {b: np.asarray(rots.get(b, np.eye(3)), np.float64) for b in BODY}
        self.root = np.asarray(root, np.float64)
        self.contact = np.asarray(contact, np.float64)

    def mats(self) -> np.ndarray:
        return rig.SKELETON.world_mats(self.rots, root_offset=self.root)


# ---------------------------------------------------------------- the moves themselves
def _contact(info) -> List[float]:
    return [1.0 if info["L"]["contact"] is not None else 0.0, 1.0 if info["R"]["contact"] is not None else 0.0]


def walk_frame(phase: float) -> Frame:
    info: dict = {}
    rots, root = motion.walk_rots(rig.SKELETON, phase % 1.0, 0.0, info)
    return Frame(rots, root, _contact(info))


def run_frame(phase: float) -> Frame:
    info: dict = {}
    rots, root = motion.run_gait_rots(rig.SKELETON, phase % 1.0, 0.0, info)
    return Frame(rots, root, _contact(info))


class Moves:
    """Every pose sequence of the page, built from the one-two clip (its first frame is the guard)."""

    def __init__(self, onetwo: str):
        self.clip = Clip.load(onetwo)
        if abs(self.clip.fps - FPS) > 1e-6:
            self.clip = self.clip.resample(FPS)
        c = self.clip
        self.root0 = c.root[0].astype(np.float64) * np.array([1.0, 0.0, 1.0])  # the guard stands over the anchor
        self.guard = Frame(c.rots(0, helpers=False), c.root[0] - self.root0, c.contact[0] > 0.5)

    # -- loops and the one-two
    def idle_frame(self, i: int) -> Frame:
        rots, root = motion.guard_idle_rots(self.guard.rots, self.guard.root, (i % IDLE_FRAMES) / IDLE_FRAMES)
        return Frame(rots, root, [1.0, 1.0])

    def shifted_idle(self, i: int, u: float) -> Frame:
        """Idle frame i with the hips moved ``u`` (0..1, eased) of the way over the front (left) foot, feet kept."""
        f = self.idle_frame(i)
        s = motion.smootherstep(u)
        if s <= 0:
            return f
        st = motion.leg_state(f.rots, f.root)
        rots = {b: r.copy() for b, r in f.rots.items()}
        root = f.root + np.array([START_SWAY * s, -START_DIP * s, 0.0])
        motion.pin_legs(rots, root, st)
        return Frame(rots, root, f.contact)

    def onetwo(self) -> List[Frame]:
        c, n = self.clip, len(self.clip)
        out = []
        for i in range(n):
            f = Frame(c.rots(i, helpers=False), c.root[i] - self.root0, c.contact[i] > 0.5)
            w = motion.smootherstep((i - (n - 1 - ONETWO_EASE)) / ONETWO_EASE)
            out.append(blend(f, self.guard, w) if w > 0 else f)
        return out

    def loops(self) -> Dict[str, List[Frame]]:
        return dict(idle=[self.idle_frame(i) for i in range(IDLE_FRAMES)],
                    walk=[walk_frame(i / WALK_FRAMES) for i in range(WALK_FRAMES)],
                    run=[run_frame(i / RUN_FRAMES) for i in range(RUN_FRAMES)])

    # -- transitions: (frames, advance [fwd, side] m per frame, entry / exit phase)
    def chain_from(self) -> int:
        """The first one-two frame after its cross (the rear, right hand) is furthest forward: a J from here on is
        kept and plays the next one-two when this one ends (earlier presses are dropped)."""
        reach = [float(f.mats()[rig.SKELETON.index["handR"], 2, 3]) for f in self.onetwo()]
        return int(np.argmax(reach)) + 1

    def transitions(self) -> Dict[str, dict]:
        T = {}
        ot = self.onetwo()
        # idle -> walk: the guard first shifts its weight onto the front (left) foot - the hips slide over it while
        # the walk waits at its phase 0 (both feet down) - then breaks into a walk whose first step is the rear
        # (right) foot's
        n, k = START_FRAMES, START_SHIFT
        T["start"] = transition(lambda t: self.shifted_idle(int(round(t * FPS)), min(1.0, t * FPS / k)),
                                lambda t: walk_frame(max(0.0, t * FPS - k) / WALK_FRAMES), n, timing=ARM_TIMING_START,
                                start=k // 2, lift={1: k})
        T["start"].update(source="idle", target="walk", enter=0, exit=(n - k) / WALK_FRAMES)
        for name, ph, n, rear in (("stopA", 0.0, 24, 1), ("stopB", 0.5, 30, 0)):
            # (the rear foot is about to push off: it is not held to the floor, the front one carries the body)
            T[name] = transition(lambda t, ph=ph: walk_frame(ph + t * FPS / WALK_FRAMES),
                                 lambda t: self.idle_frame(int(round(t * FPS))), n, timing=ARM_TIMING, lift={rear: 0})
            T[name].update(source="walk", target="idle", enter=ph, exit=n % IDLE_FRAMES)  # exit: idle frame shown last
        for ph in (0.0, 0.5):
            n = 22  # (frames: the clip ends at the target loop's speed)
            k = "0" if ph == 0 else "5"
            T["w2r_" + k] = gait_transition(ph, n, to_run=True)
            T["r2w_" + k] = gait_transition(ph, n, to_run=False)
        for gait in ("walk", "run"):
            for j in range(QUICK_PHASES[gait]):
                ph = j / QUICK_PHASES[gait]
                for late in range(4):  # (the legs one frame later, if their feet would slide)
                    t = quick_stop(gait, ph, ot, quick_leg_start(gait, ph) + late)
                    if foot_slide(t["frames"], t["advance"]) <= 2.0:
                        break
                T[f"q{gait[0]}{j}"] = t
        return T


def blend(a: Frame, b: Frame, w: float) -> Frame:
    """Local rotations slerped, root lerped, contact weights lerped."""
    if w <= 0:
        return a
    if w >= 1:
        return b
    qa = mat_to_quat(np.stack([a.rots[k] for k in BODY]))
    qb = mat_to_quat(np.stack([b.rots[k] for k in BODY]))
    R = quat_to_mat(slerp(qa, qb, w))
    return Frame({k: R[i] for i, k in enumerate(BODY)}, a.root + (b.root - a.root) * w,
                 a.contact + (b.contact - a.contact) * w)


def feet_xz(f: Frame) -> np.ndarray:
    """(2, 3) world ankle positions (L, R) of a frame on the spot."""
    st = motion.leg_state(f.rots, f.root)
    return np.stack([st[1]["ankle"], st[-1]["ankle"]])


def foot_pivots(f: Frame):
    """Per foot (L, R): the point a planted foot turns about - the ball when its heel is up, the heel when its toes
    are up, else the ankle - as (world position on the spot, that point on the rest foot, the foot's world rotation)."""
    st = motion.leg_state(f.rots, f.root)
    out = []
    for s in (1, -1):
        W, a = st[s]["W_foot"], st[s]["ankle"]
        v = W @ (rig.TOE[s] - rig.HEEL[s])
        down = math.degrees(math.atan2(-v[1], math.hypot(v[0], v[2]))) - math.degrees(
            math.atan2(-(rig.TOE[s] - rig.HEEL[s])[1], (rig.TOE[s] - rig.HEEL[s])[2]))  # pitch, toes down +
        rest = rig.TOE[s] if down > 0.5 else rig.HEEL[s] if down < -0.5 else rig.ANKLE[s]
        out.append((a + W @ (rest - rig.ANKLE[s]), rest, W))
    return out


def foot_points(f: Frame):
    """(pivots as ``foot_pivots``, [per foot {rest point: world position} of its heel, ankle and ball])."""
    piv = foot_pivots(f)
    pts = []
    for k, s in ((0, 1), (1, -1)):
        p0, rest, W = piv[k]
        a0 = p0 - W @ (rest - rig.ANKLE[s])
        pts.append({tuple(np.round(q, 6)): a0 + W @ (q - rig.ANKLE[s]) for q in (rig.HEEL[s], rig.ANKLE[s], rig.TOE[s])})
    return piv, pts


def _settle(frames: List[Frame], prev: Frame, speed0: float = 0.0, free: Optional[Sequence[float]] = None,
            speed: Optional[Sequence[float]] = None) -> Tuple[List[Frame], np.ndarray]:
    """Root motion from the planted feet, then pin them (``speed0``: m/s before the first frame).  Returns the frames and the per-frame advance of the
    anchor over the ground, [forward, side] in metres (side = the figure's left).  ``speed`` (m/s per frame): the forward
    travel is this instead of what the feet say - the pins then keep the planted feet where they are (as far as the
    legs reach).  A planted foot is held at the point it turns about (``foot_pivots``), and the root follows a pin
    that is off its pose a little each frame (PIN_FOLLOW), so the pin need not drag the foot later."""
    out, adv = [], []
    anchor = np.zeros(3)  # in rig units (x = left, z = forward), y unused
    last = foot_points(prev)[1]
    pinned: Dict[int, dict] = {}  # foot -> {rest point: world position} of its heel, ankle and ball as placed
    last_key: Dict[int, tuple] = {}  # foot -> the rest point it turned about last
    release: Dict[int, list] = {}  # foot -> [world ankle position it was let go at, frames since]
    d_last = np.array([0.0, 0.0, speed0 / FPS / M])
    for i, f in enumerate(frames):
        piv, pts = foot_points(f)
        cur = np.stack([p for p, _, _ in piv])  # (a foot rolling over its heel or ball holds that point, not its ankle)
        moved = np.stack([pts[k][tuple(np.round(piv[k][1], 6))] - last[k][tuple(np.round(piv[k][1], 6))] for k in range(2)])
        ank = feet_xz(f)
        c = np.clip(f.contact, 0.0, 1.0)
        ch = c
        # the planted feet stay put; what is not held by a foot (flight, a foot only half down) keeps its speed
        held = -(moved * ch[:, None]).sum(0)
        # where a pinned foot is not where the pose (and the root motion so far) puts it - two planted feet that the
        # blend pulls apart - the root follows the pin a little each frame, so the pin need not drag the foot later
        for k in range(2):
            if ch[k] > CONTACT_ON and k in pinned:
                key = tuple(np.round(piv[k][1], 6))
                if key in pinned[k]:
                    off = pinned[k][key] - (cur[k] + anchor - moved[k])
                    held = held + PIN_FOLLOW * np.array([off[0], 0.0, off[2]]) * ch[k]
        if free is not None:  # what no foot holds moves at this speed (m/s, straight ahead) instead of keeping its own
            d_last = np.array([0.0, 0.0, free[i] / FPS / M])
        d = (held + max(0.0, 1.0 - ch.sum()) * d_last) / max(ch.sum(), 1.0)
        if speed is not None:
            d[2] = speed[i] / FPS / M
        d_last = d
        d[1] = 0.0
        anchor = anchor + d
        last = pts
        adv.append([d[2] * M, d[0] * M])
        pins = {}
        st = motion.leg_state(f.rots, f.root)
        ease = ((i + 1) / len(frames)) ** 3  # a pin gives way to the pose, slowly, so the clip ends ON its target
        for k, s in ((0, 1), (1, -1)):
            if c[k] > CONTACT_ON:
                _, rest, W = piv[k]
                key = tuple(np.round(rest, 6))
                if k not in pinned:  # world positions of the foot's heel, ankle and ball as placed
                    pinned[k] = {}
                if key not in pinned[k]:  # (first frame down: where the pose has it)
                    pinned[k][key] = cur[k] + anchor
                target = pinned[k][key] + ease * (cur[k] + anchor - pinned[k][key])
                p = dict(st[s])
                local = target - anchor
                # the pivot where it was pinned (at the pose's own height), the foot turned as the pose has it
                p["ankle"] = np.array([local[0], cur[k][1], local[2]]) + W @ (rig.ANKLE[s] - rest)
                pins[s] = p
                last_key[k] = key
                placed = p["ankle"] + anchor  # the next frame may turn about another point of this foot
                pinned[k] = {tuple(np.round(q, 6)): placed + W @ (q - rig.ANKLE[s]) for q in (rig.HEEL[s], rig.ANKLE[s], rig.TOE[s])}
            else:
                if k in pinned:  # (let go about the point it last turned about)
                    pos = pinned.pop(k)[last_key[k]]
                    if RELEASE_FRAMES > 0:
                        release[k] = [pos, 0, last_key[k]]
                if k in release:  # a foot that lifts off leaves its pin over a few frames, not at once
                    pos, age, key = release[k]
                    age += 1
                    alpha = 1.0 - motion.smootherstep(age / RELEASE_FRAMES)
                    if alpha <= 0:
                        release.pop(k)
                    else:
                        release[k][1] = age
                        p = dict(st[s])
                        local, here = pos - anchor, pts[k][key]
                        W = piv[k][2]
                        target = here + alpha * (np.array([local[0], here[1], local[2]]) - here)
                        p["ankle"] = target + W @ (rig.ANKLE[s] - np.array(key))
                        pins[s] = p
        rots = {k: v.copy() for k, v in f.rots.items()}
        if pins:
            motion.pin_legs(rots, f.root, pins)
        out.append(Frame(rots, f.root, f.contact))
    return out, np.array(adv)


# per bone, the stretch of a transition (fractions of it) over which it turns to the target: the elbows fold
# first and the shoulders follow, so an arm that swings into the guard (or out of it) bends on the way instead
# of reaching out straight in front
ARM_TIMING = {"forearm": (0.0, 0.7), "hand": (0.0, 0.7), "upperarm": (0.25, 1.0), "clav": (0.15, 1.0)}
# ... and out of the guard into a walk the other way round: the shoulders drop the fists first, the elbows open after
ARM_TIMING_START = {"upperarm": (0.0, 0.7), "clav": (0.0, 0.85), "forearm": (0.3, 1.0), "hand": (0.3, 1.0)}


def blend_timed(a: Frame, b: Frame, u: float, timing: Dict[str, Tuple[float, float]]) -> Frame:
    """``blend`` with each bone's weight smootherstep over its own stretch of the transition (u = 0..1 of it)."""
    w = []
    for k in BODY:
        lo, hi = next((v for p, v in timing.items() if k.startswith(p)), (0.0, 1.0))
        w.append(motion.smootherstep((u - lo) / (hi - lo)))
    qa = mat_to_quat(np.stack([a.rots[k] for k in BODY]))
    qb = mat_to_quat(np.stack([b.rots[k] for k in BODY]))
    R = [quat_to_mat(slerp(qa[i], qb[i], w[i])) for i in range(len(BODY))]
    wr = motion.smootherstep(u)
    return Frame({k: R[i] for i, k in enumerate(BODY)}, a.root + (b.root - a.root) * wr, a.contact + (b.contact - a.contact) * wr)


def transition(src: Callable[[float], Frame], tgt: Callable[[float], Frame], n: int, speed0: float = 0.0,
               timing: Optional[Dict[str, Tuple[float, float]]] = None, start: int = 0,
               lift: Optional[Dict[int, int]] = None) -> dict:
    """``src`` / ``tgt``: time (s) -> Frame, time 0 = the source frame the page showed last.  Frame i is at time
    (i + 1) / FPS with weight smootherstep((i + 1 - start) / (n - start)) of the target: the last frame IS the target
    then.  ``timing``: per-bone stretches (``ARM_TIMING``); ``start``: frames before the blend begins; ``lift``: {foot
    (0 = L, 1 = R): frame from which it is off the floor}."""
    raw = []
    for i in range(n):
        a, b = src((i + 1) / FPS), tgt((i + 1) / FPS)
        u = max(0.0, (i + 1 - start) / (n - start))
        f = blend_timed(a, b, u, timing) if timing else blend(a, b, motion.smootherstep(u))
        f.contact = np.minimum(a.contact, b.contact)  # down only where both moves have the foot down
        for k, at in (lift or {}).items():  # a foot that steps off at frame ``at`` (it carries no weight from there)
            if i >= at:
                f.contact[k] = 0.0
        raw.append(f)
    frames, adv = _settle(raw, src(0.0), speed0)
    return dict(frames=frames, advance=adv)


def quick_leg_start(gait: str, phase: float) -> int:
    """Frames from phase to the first phase at or after it where the legs may start settling (QUICK_LEG_START)."""
    n = WALK_FRAMES if gait == "walk" else RUN_FRAMES
    best = min(((s / 16 - phase) % 1.0) for s in QUICK_LEG_START[gait])
    return int(math.ceil(best * n - 1e-9))


def quick_stop(gait: str, phase: float, ot: List[Frame], leg_start: Optional[int] = None) -> dict:
    """J while walking / running: the gait at phase -> the one-two (see the module notes)."""
    loop, nl, v = (walk_frame, WALK_FRAMES, WALK_SPEED) if gait == "walk" else (run_frame, RUN_FRAMES, RUN_SPEED)
    l0 = quick_leg_start(gait, phase) if leg_start is None else leg_start
    n, s0 = max(QUICK_ARMS, l0 + QUICK_LEGS), QUICK_INTO - QUICK_ARMS
    legs = [b in LEGS for b in BODY]
    raw, free = [], []
    for i in range(n):
        a, b = loop(phase + (i + 1) / nl), ot[s0 + i + 1]
        wu, wl = motion.smootherstep((i + 1) / QUICK_ARMS), motion.smootherstep((i + 1 - l0) / QUICK_LEGS)
        qa = mat_to_quat(np.stack([a.rots[k] for k in BODY]))
        qb = mat_to_quat(np.stack([b.rots[k] for k in BODY]))
        R = [quat_to_mat(slerp(qa[k], qb[k], wl if legs[k] else wu)) for k in range(len(BODY))]
        f = Frame({k: R[i_] for i_, k in enumerate(BODY)}, a.root + (b.root - a.root) * wl,
                  a.contact if wl <= 0 else np.minimum(a.contact, b.contact))
        raw.append(f)
        free.append(v * (1.0 - wl))
    frames, adv = _settle(raw, loop(phase), v, free)
    return dict(frames=frames, advance=adv, source=gait, target="onetwo", enter=phase, exit=s0 + n)


def gait_transition(phase: float, n: int, to_run: bool) -> dict:
    """walk <-> run sharing one phase, which advances at the blended cadence; the root motion is the planted feet's,
    and with no foot down it is the blended stride's speed, not the last one kept (so the clip ends at the target
    loop's speed: no step)."""
    raw, ph, speed, held = [], phase, [], []
    for i in range(n):
        w = motion.smootherstep((i + 1) / n)
        wr = w if to_run else 1 - w  # weight of the run
        ph += ((1 - wr) / WALK_FRAMES + wr / RUN_FRAMES)
        a, b = walk_frame(ph), run_frame(ph)
        f = blend(a, b, wr)
        f.contact = np.minimum(a.contact, b.contact)  # down where both gaits have the foot down
        raw.append(f)
        speed.append((1 - wr) * WALK_SPEED + wr * RUN_SPEED)
    prev = walk_frame(phase) if to_run else run_frame(phase)
    frames, adv = _settle(raw, prev, WALK_SPEED if to_run else RUN_SPEED, free=speed)
    return dict(frames=frames, advance=adv, source="walk" if to_run else "run", target="run" if to_run else "walk",
                enter=phase, exit=ph % 1.0)


# ---------------------------------------------------------------- what the page shows: jumps and slides
def jump_deg(a: Frame, b: Frame) -> Tuple[float, str]:
    """Largest change of a body joint's local rotation between two frames (degrees) and which joint."""
    d = {k: float(geodesic_deg(a.rots[k], b.rots[k])) for k in BODY}
    k = max(d, key=d.get)
    return d[k], k


def seq_max_jump(frames: Sequence[Frame], loop: bool = False) -> Tuple[float, str, int]:
    best = (0.0, "", -1)
    pairs = list(zip(frames[:-1], frames[1:])) + ([(frames[-1], frames[0])] if loop else [])
    for i, (a, b) in enumerate(pairs):
        j, k = jump_deg(a, b)
        if j > best[0]:
            best = (j, k, i)
    return best


def foot_slide(frames: Sequence[Frame], adv: np.ndarray) -> float:
    """Largest per-frame world movement (mm) of a planted foot that is down in both frames - of the point it turns
    about (heel, ankle or ball: a foot rolling over its ball moves its ankle, not its ball) - the anchor moves by adv."""
    worst, anchor = 0.0, np.zeros(3)
    prev = None
    for f, a in zip(frames, adv):
        anchor = anchor + np.array([a[1], 0.0, a[0]]) / M
        piv, pts = foot_points(f)
        pts = [{q: v + anchor for q, v in d.items()} for d in pts]
        if prev is not None:
            for k in range(2):
                if f.contact[k] > CONTACT_ON and prev[1][k] > CONTACT_ON:
                    key = tuple(np.round(piv[k][1], 6))
                    worst = max(worst, float(np.linalg.norm((pts[k][key] - prev[0][k][key])[[0, 2]])) * M * 1000)
        prev = (pts, f.contact)
    return worst


def report(onetwo: str) -> Dict[str, dict]:
    """Every cut the page can make and every clip it plays: the largest joint jump between two displayed frames
    (degrees, and which joint) and, for transitions, how far a planted foot slides (mm per frame)."""
    m = Moves(onetwo)
    loops, ot, T = m.loops(), m.onetwo(), m.transitions()
    out: Dict[str, dict] = {}

    def put(name, j, **kw):
        out[name] = dict(deg=round(j[0], 2), joint=j[1], **kw)

    for k in ("idle", "walk", "run"):
        put(f"inside {k} loop", seq_max_jump(loops[k], loop=True)[:2])
    put("inside onetwo", seq_max_jump(ot)[:2])
    put("idle (any frame) -> onetwo", max(jump_deg(f, ot[0]) for f in loops["idle"]))
    put("onetwo end -> idle", jump_deg(ot[-1], loops["idle"][1 % IDLE_FRAMES]))
    for name, t in T.items():
        fr, src, tgt = t["frames"], t["source"], t["target"]
        if src == "idle":
            enter = max(jump_deg(f, fr[0]) for f in loops["idle"])  # the start may begin from any idle frame
        else:
            enter = jump_deg(loops[src][int(round(t["enter"] * len(loops[src]))) % len(loops[src])], fr[0])
        if tgt == "idle":
            leave = jump_deg(fr[-1], loops["idle"][(t["exit"] + 1) % IDLE_FRAMES])
        elif tgt == "onetwo":
            leave = jump_deg(fr[-1], ot[t["exit"] + 1])
        else:
            n = len(loops[tgt])
            leave = jump_deg(fr[-1], loops[tgt][int(math.floor(t["exit"] * n + 1)) % n])
        put(f"{src} -> {name}", enter)
        put(f"inside {name}", seq_max_jump(fr)[:2], slide_mm=round(foot_slide(fr, t["advance"]), 2),
            frames=len(fr), travel_m=[round(float(v), 3) for v in np.asarray(t["advance"]).sum(0)])
        put(f"{name} -> {tgt}", leave)
    return out


if __name__ == "__main__":
    import argparse
    import json

    ap = argparse.ArgumentParser(description="pose jumps at the play page's cuts and inside its clips")
    ap.add_argument("cmd", choices=["report", "quick-scan"])
    ap.add_argument("--onetwo", default=str(HERE.parents[1] / "out" / "onetwo4" / "5m" / "clip.npz"))
    ap.add_argument("-o", "--out", default=None, help="write the table as JSON here")
    a = ap.parse_args()
    if a.cmd == "quick-scan":  # quick stops with the legs settling at once, from every sixteenth of each gait
        ot_ = Moves(a.onetwo).onetwo()
        for g in ("walk", "run"):
            for s in range(16):
                t = quick_stop(g, s / 16, ot_, leg_start=0)
                adv = np.asarray(t["advance"])
                print(f"{g} {s:2d}/16 travel {adv[:, 0].sum():6.3f} m ahead {adv[:, 1].sum():6.3f} m left, slowest frame "
                      f"{adv[:, 0].min() * 100:5.1f} cm, foot slide {foot_slide(t['frames'], adv):4.1f} mm/frame"
                      + ("   <- leg start" if s in QUICK_LEG_START[g] else ""))
        raise SystemExit(0)
    rep = report(a.onetwo)
    for k, v in rep.items():
        print(f"{k:28s} {v['deg']:6.2f} deg  {v['joint']:10s} " + " ".join(f"{x}={y}" for x, y in v.items() if x not in ("deg", "joint")))
    if a.out:
        Path(a.out).write_text(json.dumps(rep, indent=1))

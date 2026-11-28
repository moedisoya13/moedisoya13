"""The BB's moves for the play page: loops, the one-two, and short transition clips between them, all at 60 fps.

Sprites cannot be blended at run time, so every change of move the page can make is either a cut between
two frames that are (nearly) the same pose, or a rendered transition clip:

    idle    a breathing guard loop (``motion.guard_idle_rots``) around the first pose of the one-two
    walk    ``motion.walk_rots`` on the spot, one cycle = 48 frames = 0.8 s = 1.12 m at 1.4 m/s
    run     ``motion.run_gait_rots`` on the spot, one cycle = 40 frames = 0.667 s = 2.5 m at 3.75 m/s
    onetwo  the imported clip (wrist range "human"), 144 frames; it starts on the idle's pose and its last
            0.5 s ease back onto it, so it begins and ends where the idle is
    start   idle -> walk (from idle frame 0, ends at walk phase 0.5)
    stopA / stopB   walk -> idle, entered at walk phase 0 (left foot just down in front: the guard's own
            foot order) or 0.5 (right foot in front: the walk carries on one step so the left foot comes
            through and lands in front)
    w2r_0 / w2r_5, r2w_0 / r2w_5   walk <-> run at phase 0 / 0.5 (the two loops share their phase: 0 = left
            foot down)

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
WALK_FRAMES = int(round(motion.WALK_PERIOD * FPS))  # 48
RUN_FRAMES = int(round(motion.RUN_PERIOD * FPS))  # 40
IDLE_FRAMES = 120  # 2 s, one breath
ONETWO_EASE = 30  # last frames of the one-two eased back onto the idle pose
WALK_SPEED = motion.STRIDE * M / motion.WALK_PERIOD  # 1.4 m/s
RUN_SPEED = motion.RUN_STRIDE * M / motion.RUN_PERIOD  # 3.75 m/s
BODY = [b for b in rig.GEOMETRY_BONES if b in rig.SKELETON.index]
CONTACT_ON = 0.5  # a foot whose contact weight is above this is pinned
RELEASE_FRAMES = 6  # a foot that lifts off eases out of its pin over this many frames


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
    def transitions(self) -> Dict[str, dict]:
        T = {}
        n = 24  # idle -> walk: the guard breaks into a walk that starts with the rear (right) foot
        T["start"] = transition(lambda t: self.idle_frame(int(round(t * FPS))), lambda t: walk_frame(t * FPS / WALK_FRAMES), n)
        T["start"].update(source="idle", target="walk", enter=0, exit=n / WALK_FRAMES)
        for name, ph, n in (("stopA", 0.0, 24), ("stopB", 0.5, 30)):
            T[name] = transition(lambda t, ph=ph: walk_frame(ph + t * FPS / WALK_FRAMES),
                                 lambda t: self.idle_frame(int(round(t * FPS))), n)
            T[name].update(source="walk", target="idle", enter=ph, exit=n % IDLE_FRAMES)  # exit: idle frame shown last
        for ph in (0.0, 0.5):
            n = 20
            k = "0" if ph == 0 else "5"
            T["w2r_" + k] = gait_transition(ph, n, to_run=True)
            T["r2w_" + k] = gait_transition(ph, n, to_run=False)
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


def _settle(frames: List[Frame], prev: Frame, speed0: float = 0.0) -> Tuple[List[Frame], np.ndarray]:
    """Root motion from the planted feet, then pin them (``speed0``: m/s before the first frame).  Returns the frames and the per-frame advance of the
    anchor over the ground, [forward, side] in metres (side = the figure's left)."""
    out, adv = [], []
    anchor = np.zeros(3)  # in rig units (x = left, z = forward), y unused
    last = feet_xz(prev)
    pinned: Dict[int, np.ndarray] = {}  # foot -> world position
    release: Dict[int, list] = {}  # foot -> [world position it was let go at, frames since]
    d_last = np.array([0.0, 0.0, speed0 / FPS / M])
    for i, f in enumerate(frames):
        cur = feet_xz(f)
        c = np.clip(f.contact, 0.0, 1.0)
        # the planted feet stay put; what is not held by a foot (flight, a foot only half down) keeps its speed
        held = -((cur - last) * c[:, None]).sum(0)
        d = (held + max(0.0, 1.0 - c.sum()) * d_last) / max(c.sum(), 1.0)
        d_last = d
        d[1] = 0.0
        anchor = anchor + d
        last = cur
        adv.append([d[2] * M, d[0] * M])
        pins = {}
        st = motion.leg_state(f.rots, f.root)
        ease = ((i + 1) / len(frames)) ** 3  # a pin gives way to the pose, slowly, so the clip ends ON its target
        for k, s in ((0, 1), (1, -1)):
            if c[k] > CONTACT_ON:
                if k not in pinned:
                    pinned[k] = cur[k] + anchor
                pinned[k] = pinned[k] + ease * (cur[k] + anchor - pinned[k])
                p = dict(st[s])
                local = pinned[k] - anchor
                p["ankle"] = np.array([local[0], cur[k][1], local[2]])  # keep the pose's own heel/toe height
                pins[s] = p
            else:
                if k in pinned:
                    release[k] = [pinned.pop(k), 0]
                if k in release:  # a foot that lifts off leaves its pin over a few frames, not at once
                    pos, age = release[k]
                    age += 1
                    alpha = 1.0 - motion.smootherstep(age / RELEASE_FRAMES)
                    if alpha <= 0:
                        release.pop(k)
                    else:
                        release[k][1] = age
                        p = dict(st[s])
                        local = pos - anchor
                        p["ankle"] = cur[k] + alpha * (np.array([local[0], cur[k][1], local[2]]) - cur[k])
                        pins[s] = p
        rots = {k: v.copy() for k, v in f.rots.items()}
        if pins:
            motion.pin_legs(rots, f.root, pins)
        out.append(Frame(rots, f.root, f.contact))
    return out, np.array(adv)


def transition(src: Callable[[float], Frame], tgt: Callable[[float], Frame], n: int) -> dict:
    """``src`` / ``tgt``: time (s) -> Frame, time 0 = the source frame the page showed last.  Frame i is at time
    (i + 1) / FPS with weight smootherstep((i + 1) / n) of the target: the last frame IS the target then."""
    raw = []
    for i in range(n):
        a, b = src((i + 1) / FPS), tgt((i + 1) / FPS)
        f = blend(a, b, motion.smootherstep((i + 1) / n))
        f.contact = np.minimum(a.contact, b.contact)  # down only where both moves have the foot down
        raw.append(f)
    frames, adv = _settle(raw, src(0.0))
    return dict(frames=frames, advance=adv)


def gait_transition(phase: float, n: int, to_run: bool) -> dict:
    """walk <-> run sharing one phase, which advances at the blended cadence."""
    raw, ph = [], phase
    for i in range(n):
        w = motion.smootherstep((i + 1) / n)
        wr = w if to_run else 1 - w  # weight of the run
        ph += ((1 - wr) / WALK_FRAMES + wr / RUN_FRAMES)
        a, b = walk_frame(ph), run_frame(ph)
        f = blend(a, b, wr)
        f.contact = np.minimum(a.contact, b.contact)
        raw.append(f)
    prev = walk_frame(phase) if to_run else run_frame(phase)
    frames, adv = _settle(raw, prev, WALK_SPEED if to_run else RUN_SPEED)
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
    """Largest per-frame world movement (mm) of a foot that is down in both frames (the anchor moves by adv)."""
    worst, anchor = 0.0, np.zeros(3)
    prev = None
    for f, a in zip(frames, adv):
        anchor = anchor + np.array([a[1], 0.0, a[0]]) / M
        w = feet_xz(f) + anchor
        if prev is not None:
            for k in range(2):
                if f.contact[k] > CONTACT_ON and prev[1][k] > CONTACT_ON:
                    worst = max(worst, float(np.linalg.norm((w[k] - prev[0][k])[[0, 2]])) * M * 1000)
        prev = (w, f.contact)
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
    ap.add_argument("cmd", choices=["report"])
    ap.add_argument("--onetwo", default=str(HERE.parents[1] / "out" / "onetwo4" / "5m" / "clip.npz"))
    ap.add_argument("-o", "--out", default=None, help="write the table as JSON here")
    a = ap.parse_args()
    rep = report(a.onetwo)
    for k, v in rep.items():
        print(f"{k:28s} {v['deg']:6.2f} deg  {v['joint']:10s} " + " ".join(f"{x}={y}" for x, y in v.items() if x not in ("deg", "joint")))
    if a.out:
        Path(a.out).write_text(json.dumps(rep, indent=1))

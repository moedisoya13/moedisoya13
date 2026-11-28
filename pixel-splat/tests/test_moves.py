"""The loops and transitions of the play page (examples/soldier/motion.py walk / run / guard idle, examples/map/moves.py):
feet planted, loops closed, joints inside their limits, the walk's and run's balance (qc.py), and no pose pops at
the page's cuts.  CPU, under a minute (the moves.py part needs out/onetwo4/5m/clip.npz)."""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "examples" / "soldier"))
sys.path.insert(0, str(ROOT / "examples" / "map"))
import motion  # noqa: E402
import qc  # noqa: E402
import rig  # noqa: E402

SKEL = rig.SKELETON
M = motion.M_PER_UNIT


def _planted_drift(fn, travel, n=120):
    """Largest world movement (mm) of a planted foot's pinned point between two frames, over two cycles."""
    worst, prev = 0.0, {}
    for i in range(2 * n):
        ph = i / n
        info = {}
        rots, root = fn(SKEL, ph % 1.0, travel * ph, info)
        mats = SKEL.world_mats(rots, root_offset=root)
        for side, s in rig.SIDES:
            c = info[side]["contact"]
            if c is None:
                prev.pop(side, None)
                continue
            fw = motion.foot_world(SKEL, mats, s)
            p = {"heel": fw["heel"], "sole": fw["ankle"], "toe": fw["toe"]}[c]
            if side in prev and prev[side][0] == c:
                worst = max(worst, float(np.linalg.norm(p - prev[side][1])) * M * 1000)
            prev[side] = (c, p)
    return worst


def test_walk_keeps_its_guarantees_and_is_balanced():
    assert _planted_drift(motion.walk_rots, motion.STRIDE) < 0.5
    a, ra = motion.walk_rots(SKEL, 0.0)
    b, rb = motion.walk_rots(SKEL, 1.0 - 1e-9)
    assert np.abs(ra - rb).max() < 1e-6 and max(np.abs(a[k] - b[k]).max() for k in a) < 1e-5  # the loop closes
    for k in range(48):
        assert not rig.check_limits(motion.walk_rots(SKEL, k / 48)[0])
    # the pelvis: a smooth curve (no half-step kink), within the vertical acceleration it was given
    b = motion.walk_balance()
    acc = [abs(motion.fourier_eval(b["h"], b["h_h"], f, 2)) / motion.WALK_PERIOD ** 2 * M for f in np.arange(0, 1, 0.005)]
    assert max(acc) <= 0.45 * 9.81 * 1.01  # (the bound holds at the 120 samples it was solved on)
    # qc at the page's speed: the floor can push every frame (ZMP on the feet), no jerk spikes worth a degree and a half
    rep = qc.evaluate(qc.from_clip(qc.walk_clip(60, motion.WALK_PERIOD), "walk"))
    z = rep["balance"]["_zmp"]
    assert rep["balance"]["zmp"]["out"] <= 10 and np.nanmin(z) > -0.06 and rep["jerk"]["n_spikes"] <= 12
    # and at synth.walk's slower 1.1 s: much better than before the fix (58 frames out, worst far outside)
    rep = qc.evaluate(qc.from_clip(qc.walk_clip(60, 1.1), "walk"))
    assert rep["balance"]["zmp"]["out"] <= 12


def test_run_loop_plants_its_feet_flies_and_stays_in_range():
    assert _planted_drift(motion.run_gait_rots, motion.RUN_STRIDE) < 0.5
    a, ra = motion.run_gait_rots(SKEL, 0.0)
    b, rb = motion.run_gait_rots(SKEL, 1.0 - 1e-9)
    assert np.abs(ra - rb).max() < 1e-6
    flight = 0
    for k in range(80):
        info = {}
        rots, _ = motion.run_gait_rots(SKEL, k / 80, 0.0, info)
        assert not rig.check_limits(rots), k
        flight += info["L"]["contact"] is None and info["R"]["contact"] is None
    assert 0.3 < flight / 80 < 0.55  # two flights a cycle
    assert motion.RUN_STRIDE * M / motion.RUN_PERIOD == pytest.approx(3.75)
    rep = qc.evaluate(qc.from_clip(qc.run_clip(60), "run"))
    assert rep["balance"]["zmp"]["out"] <= 12


def test_guard_idle_breathes_on_the_spot():
    rots, root = motion.stand_rots()
    rots = dict(rots, thighL=rig.local_rot("thighL", pitch=-14.0), shinL=rig.local_rot("shinL", pitch=18.0),
                thighR=rig.local_rot("thighR", pitch=-4.0), shinR=rig.local_rot("shinR", pitch=12.0))
    root = np.array([0.0, -0.02, 0.0])
    st0 = motion.leg_state(rots, root)
    r0, q0 = motion.guard_idle_rots(rots, root, 0.0)
    assert max(np.abs(r0[k] - rots.get(k, np.eye(3))).max() for k in rots) < 1e-6  # phase 0 is the held pose
    for ph in np.arange(0, 1, 0.05):
        r, q = motion.guard_idle_rots(rots, root, ph)
        st = motion.leg_state(r, q)
        for s in (1, -1):
            assert np.linalg.norm(st[s]["ankle"] - st0[s]["ankle"]) < 1e-6
            assert np.abs(st[s]["W_foot"] - st0[s]["W_foot"]).max() < 1e-6


ONETWO = ROOT / "out" / "onetwo4" / "5m" / "clip.npz"


@pytest.fixture(scope="module")
def mv():
    if not ONETWO.exists():
        pytest.skip("needs out/onetwo4/5m/clip.npz")
    import moves

    m = moves.Moves(str(ONETWO))
    return moves, m, m.loops(), m.onetwo(), m.transitions()


def test_transitions_have_no_pops_and_planted_feet_do_not_slide(mv):
    moves, m, loops, ot, T = mv
    own = max(moves.seq_max_jump(loops[k], loop=True)[0] for k in ("walk", "run"))
    for name, t in T.items():
        fr = t["frames"]
        assert moves.seq_max_jump(fr)[0] <= own + 0.5, name  # no faster than the loops themselves
        assert moves.foot_slide(fr, t["advance"]) < 2.0, name  # mm per frame (an art pixel is 29 mm)
        src, tgt = t["source"], t["target"]
        # the cut into the clip and out of it
        first = loops[src][int(round(t["enter"] * len(loops[src])))] if src != "idle" else loops["idle"][0]
        assert moves.jump_deg(first, fr[0])[0] <= own + 0.5, name
        if tgt == "idle":
            nxt = loops["idle"][(t["exit"] + 1) % len(loops["idle"])]
        else:
            n = len(loops[tgt])
            nxt = loops[tgt][int(math.floor((t["exit"] * n + 1e-6))) % n]
        assert moves.jump_deg(fr[-1], nxt)[0] <= own + 0.5, name
    # the one-two starts on the guard the idle breathes around and ends on it
    assert moves.jump_deg(ot[-1], loops["idle"][0])[0] < 1e-3
    assert max(moves.jump_deg(f, ot[0])[0] for f in loops["idle"]) < 2.5
    # its feet: down at the start and the end, root back where it began
    assert np.abs(ot[-1].root - ot[0].root).max() < 1e-9

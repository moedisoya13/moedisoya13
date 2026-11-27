"""Fast checks for the arm steps any motion can be given once it is on the rig (template/arms.py):
an elbow inside the trunk is swung out about the shoulder-wrist line with the wrist and the hand kept, the
swing is smooth in time and reported, and the mitten hands close into fists with the punches.
Poses are built from the rig's own joint angles: no source data, no baked model.  CPU, a few seconds."""
import sys
import types
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "template"))
import arms  # noqa: E402
import body  # noqa: E402
import clip as clip_mod  # noqa: E402
import motion  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402

SKEL = rig.SKELETON
L = rig.local_rot
FPS = 60.0


@pytest.fixture(autouse=True)
def bare_by_default():
    body.wear(None)
    yield
    body.wear(None)


def guard(side="R", tuck=0.0, elbow=-110.0):
    """A boxing guard for one arm: the elbow down and a little forward, the forearm folded up.  ``tuck`` (0..1)
    slides the elbow across in front of the chest - where a stick figure's elbow can go and a mannequin's cannot."""
    s = 1 if side == "L" else -1
    d = rt.unit((1.0 - tuck) * np.array([s * 0.10, -0.90, 0.40]) + tuck * np.array([-s * 0.50, -0.78, 0.36]))
    up = rt.shortest_arc(rig.ARM_AXIS[s], d) @ rig.rot_axis(rig.ARM_AXIS[s], -s * 30.0)
    return {"upperarm" + side: up, "forearm" + side: L("forearm" + side, pitch=elbow)}


def world(rots, bone, p=None, root=(0, 0, 0)):
    M = rt.fk(rots, root)
    return M[SKEL.index[bone]][:, :3] if p is None else rt.at(M, bone, p)


# ---------------------------------------------------------------- the swivel
def test_swivel_keeps_the_wrist_and_the_hands_world_orientation():
    """The elbow goes round the shoulder-wrist line; shoulder and wrist stay where they are, the elbow's own
    bend is what it was, and the hand keeps facing the way it faced - the wrist bends to make up for it."""
    for side, s in rig.SIDES:
        for psi in (-12.0, -6.0, 6.0, 12.0):
            before = guard(side)
            before["hand" + side] = L("hand" + side, pitch=10.0)
            after = dict(before)
            cost = arms.swivel_arm(after, side, s * psi)
            assert cost["wrist_miss"] < 1e-7 and cost["hand_turn"] < 1e-5, (side, psi, cost)
            assert np.linalg.norm(world(after, "hand" + side, rig.WRIST[s]) - world(before, "hand" + side, rig.WRIST[s])) < 1e-7
            assert clip_mod.geodesic_deg(world(after, "hand" + side), world(before, "hand" + side)) < 1e-5
            assert np.linalg.norm(world(after, "fingers" + side, rig.FINGERTIP[s]) - world(before, "fingers" + side, rig.FINGERTIP[s])) < 1e-6
            moved = np.linalg.norm(world(after, "forearm" + side, rig.ELBOW[s]) - world(before, "forearm" + side, rig.ELBOW[s]))
            assert moved > 0.015 and abs(moved - cost["elbow_moved"]) < 1e-9  # the elbow is what moved ...
            assert clip_mod.geodesic_deg(after["forearm" + side], before["forearm" + side]) < 1e-6  # ... not its bend
            assert clip_mod.geodesic_deg(after["hand" + side], before["hand" + side]) > 1.0  # the wrist took it up
            assert not rig.check_limits(after)
    # the swing is about the shoulder-wrist line: the elbow stays as far from it, and from both ends, as it was
    before, after = guard("L"), guard("L")
    arms.swivel_arm(after, "L", 12.0)
    sh, wr = rig.SHOULDER[1], world(before, "handL", rig.WRIST[1])
    for pose in (before, after):
        e = world(pose, "forearmL", rig.ELBOW[1])
        assert abs(np.linalg.norm(e - sh) - rig.RATIO["upper_arm"] * rig.H) < 1e-6
        assert abs(np.linalg.norm(e - wr) - rig.RATIO["forearm"] * rig.H) < 1e-6


def test_a_swivel_that_takes_the_upper_arm_past_its_limits_is_made_by_turning_it_about_itself():
    """A guard swung 25 degrees outwards: the upper arm would leave its limits.  It is turned about its own
    length instead (``keep_axis``) and the forearm takes the twist - the wrist and the hand stay exactly."""
    pose = guard("R", elbow=-90.0)
    assert not rig.check_limits(pose)
    after = dict(pose)
    cost = arms.swivel_arm(after, "R", 25.0)
    assert abs(cost["over"]["twist"] - (-18.36)) < 0.3  # (measured: -18.36 degrees about the upper arm)
    assert cost["wrist_miss"] < 1e-7 and cost["hand_turn"] < 1e-5 and cost["over"]["upperarm"] == 0.0
    assert cost["elbow_moved"] > 0.02 and not rig.check_limits(after)


def test_a_swivel_the_wrist_cannot_follow_turns_the_hand_only_by_what_is_missing():
    """Past its limits the wrist stops (the side bend is 30 degrees): the wrist's POSITION is still kept, the
    hand turns by the rest, and ``wrist_give`` lets the ball go further for a hand that must not turn."""
    before = guard("R")
    after = dict(before)
    cost = arms.swivel_arm(after, "R", -75.0)
    assert cost["wrist_miss"] < 1e-7 and 5.0 < cost["hand_turn"] < 60.0 and not rig.check_limits(after)
    assert abs(cost["over"]["hand"] - cost["hand_turn"]) < 1e-6  # exactly what the limits took away
    free = dict(before)
    cost2 = arms.swivel_arm(free, "R", -75.0, wrist_give=90.0)
    assert cost2["hand_turn"] < 1e-5 and rig.check_limits(free)[0][0] == "handR"
    part = dict(before)
    cost3 = arms.swivel_arm(part, "R", -75.0, wrist_give=5.0)
    assert abs(cost3["hand_turn"] - (cost["hand_turn"] - 5.0)) < 0.05
    # "past its limits" is the angle to the nearest allowed rotation - the same (geodesic) degrees as the turn
    assert abs(cost3["over"]["hand_past"] - 5.0) < 0.02 and abs(rig.clamp_rot("handR", part["handR"])[2] - 5.0) < 0.02
    assert cost["over"]["hand_past"] == 0.0 and abs(cost2["over"]["hand_past"] - cost["hand_turn"]) < 0.02


# ---------------------------------------------------------------- elbows out of the trunk
def test_resting_standing_and_walking_arms_are_left_alone():
    """A hanging arm lies against the flank: that is not "inside the trunk"."""
    assert arms.arm_depth({}, "L") < -arms.CLEAR_MARGIN and arms.arm_depth(motion.stand_rots()[0], "R") < -arms.CLEAR_MARGIN
    frames = [motion.walk_rots(SKEL, k / 24)[0] for k in range(24)]
    keep = [{b: R.copy() for b, R in f.items()} for f in frames]
    rep = arms.clear_elbows(frames, np.zeros((24, 3)), 24.0, loop=True)
    for side in "LR":
        assert rep[side]["frames"] == 0 and rep[side]["needed_frames"] == 0 and rep[side]["depth_before"] < -arms.CLEAR_MARGIN
    assert all(np.array_equal(f[b], k[b]) for f, k in zip(frames, keep) for b in k)


MARGIN = 0.0072  # arms.CLEAR_MARGIN = 0.004 H, H = 1.8 (written out: the tests must not follow a changed constant)


def tucked(T=48):
    """A guard that slides its elbow in front of the chest and back out (frames, a copy of them)."""
    tuck = np.sin(np.linspace(0, np.pi, T)) ** 2  # out - in - out
    frames = [dict(guard("R", t), **guard("L")) for t in tuck]
    return frames, [{b: R.copy() for b, R in f.items()} for f in frames]


def test_an_elbow_tucked_into_the_chest_is_swung_out_of_it():
    """A guard that slides its elbow in front of the chest and back out: while it is in, the elbow is swung
    out by the smallest angle that clears; the wrist does not move; the swing grows and shrinks smoothly.
    (With the hand allowed to turn 30 degrees: this tuck needs 10.8 at most, so nothing caps it.)"""
    T = 48
    frames, before = tucked(T)
    roots = np.zeros((T, 3))
    deep = np.array([arms.arm_depth(f, "R") for f in before])
    assert deep[0] < -MARGIN and deep.max() > 0.03  # (the pose as given: clear, then well inside)
    assert arms.CLEAR_MARGIN == pytest.approx(MARGIN)
    rep = arms.clear_elbows(frames, roots, FPS, hand_turn_most=30.0)
    v = rep["R"]
    assert rep["margin"] == pytest.approx(MARGIN) and rep["hand_turn_most"] == 30.0
    assert v["needed_frames"] == int((deep > -MARGIN).sum()) == 32 and v["inside_before"] == int((deep > 0).sum())
    assert abs(v["depth_before"] - deep.max()) < 1e-4
    after = np.array([arms.arm_depth(f, "R") for f in frames])
    assert after.max() <= -MARGIN + 1e-6 and v["inside_after"] == 0 and v["not_cleared"] == [] and v["hand_cap_limited"] == []
    assert abs(v["depth_after"] - after.max()) < 1e-4
    # the wrist end of the forearm, measured again after the swing (-0.169 before, -0.1728 after)
    end = np.array([arms.arm_depth(f, "R", which="end") for f in frames])
    assert abs(v["wrist_end_depth_after"] - end.max()) < 1e-4 and abs(v["wrist_end_depth_after"] - (-0.1728)) < 1e-4
    assert v["wrist_end_depth_before"] == -0.169 and v["wrist_end_inside_frames"] == 0
    psi = np.array(v["swivel"])
    assert 10.0 < v["swivel_max"] < 120.0 and psi[0] == 0.0 and psi[-1] == 0.0
    assert (np.sign(psi[psi != 0]) == np.sign(psi[np.abs(psi).argmax()])).all()  # one side for the whole run
    assert np.abs(np.diff(psi)).max() < 0.35 * v["swivel_max"]  # no pop: it builds up over many frames
    for t in range(T):
        assert np.linalg.norm(world(frames[t], "handR", rig.WRIST[-1]) - world(before[t], "handR", rig.WRIST[-1])) < 1e-3
        turned = clip_mod.geodesic_deg(world(frames[t], "handR"), world(before[t], "handR"))
        assert turned <= v["hand_turned_max"] + 1e-3 <= 30.0 + 1e-3
        assert not rig.check_limits(frames[t])
        for b in ("upperarmL", "forearmL", "chest", "pelvis"):  # nothing else is touched
            assert np.array_equal(frames[t].get(b, np.eye(3)), before[t].get(b, np.eye(3)))
    assert v["wrist_moved_max"] < 1e-3 and rep["L"]["frames"] == 0
    # the smallest angle: half of it is not enough on the deepest frame
    k = int(deep.argmax())
    half = dict(before[k])
    arms.swivel_arm(half, "R", 0.5 * psi[k])
    assert arms.arm_depth(half, "R") > -arms.CLEAR_MARGIN
    assert abs(v["hand_turned_max"] - 10.81) < 0.05  # (what clearing this tuck turns the glove by)
    # with the wrist's ball allowed past its limits the hand does not turn at all (and the default cap does not bite)
    again = [{b: R.copy() for b, R in f.items()} for f in before]
    rep2 = arms.clear_elbows(again, roots, FPS, wrist_give=90.0)
    assert rep2["R"]["hand_turned_max"] < 1e-3 and rep2["R"]["inside_after"] == 0 and rep2["R"]["not_cleared"] == []
    assert 10.0 < rep2["R"]["wrist_past_limits_max"] < 11.5


def test_the_glove_turns_ten_degrees_at_most_and_the_elbow_stays_in_where_that_is_not_enough():
    """The default: the hand may turn by 10 degrees (the angle between its world orientations).  On the four
    deepest frames of the tuck that is not enough to take the elbow the full margin clear: there it is swung
    only as far as the cap allows, and those frames are listed - not hidden, not pushed past the cap."""
    T = 48
    frames, before = tucked(T)
    assert arms.HAND_TURN_MOST == 10.0
    rep = arms.clear_elbows(frames, np.zeros((T, 3)), FPS)
    v = rep["R"]
    assert rep["hand_turn_most"] == 10.0
    turned = np.array([clip_mod.geodesic_deg(world(frames[t], "handR"), world(before[t], "handR")) for t in range(T)])
    assert turned.max() <= 10.0 + 1e-3 and abs(v["hand_turned_max"] - turned.max()) < 1e-3 and turned.max() > 9.9
    assert v["hand_cap_limited"] == [22, 23, 24, 25] and v["not_cleared"] == [22, 23, 24, 25] and v["under_margin_after"] == 4
    after = np.array([arms.arm_depth(f, "R") for f in frames])
    deep = np.array([arms.arm_depth(f, "R") for f in before])
    held = [22, 23, 24, 25]
    assert (after[held] > -MARGIN).all() and (after[held] < 0.0).all() and v["inside_after"] == 0  # in the margin, out of the chest
    assert (after[held] < deep[held] - 0.05).all()  # (swung as far as the cap allows: most of the way out)
    rest = [t for t in range(T) if t not in held]
    assert after[rest].max() <= -MARGIN + 1e-6
    for t in range(T):
        assert np.linalg.norm(world(frames[t], "handR", rig.WRIST[-1]) - world(before[t], "handR", rig.WRIST[-1])) < 1e-3
        assert not rig.check_limits(frames[t])
    # the cap is a parameter: 30 lets the same tuck come fully clear (see the test above), 0 swings nothing
    none = [{b: R.copy() for b, R in f.items()} for f in before]
    rep0 = arms.clear_elbows(none, np.zeros((T, 3)), FPS, hand_turn_most=0.0)
    assert rep0["R"]["hand_turned_max"] < 1e-3 and rep0["R"]["inside_after"] > 0


def test_the_forearm_is_measured_to_the_wrist():
    """The whole forearm is checked, to the wrist.  A pose with only the wrist end against the chest: that
    is reported (``wrist_end_*``), and since no swivel moves the wrist, it is not swung for."""
    assert [(b, a, r) for b, a, r in arms.ARM_BALLS if b == "forearm"][-3:] == [
        ("forearm", 0.78, 0.0165), ("forearm", 0.90, 0.0151), ("forearm", 1.00, 0.0144)]
    pose = {"upperarmR": L("upperarmR", pitch=-90.0, yaw=30.0, roll=-20.0), "forearmR": L("forearmR", pitch=-130.0)}
    assert not rig.check_limits(pose)
    assert abs(arms.arm_depth(pose, "R") - 0.0144) < 0.001 and abs(arms.arm_depth(pose, "R", which="end") - 0.0144) < 0.001
    assert abs(arms.arm_depth(pose, "R", which="steer") - (-0.0158)) < 0.001
    frames = [dict(pose) for _ in range(3)]
    rep = arms.clear_elbows(frames, np.zeros((3, 3)), FPS)["R"]
    assert rep["needed_frames"] == 0 and rep["frames"] == 0 and rep["wrist_end_inside_frames"] == 3
    assert rep["wrist_end_inside"] == [0, 1, 2] and abs(rep["wrist_end_depth_after"] - 0.0144) < 0.001


def test_the_forearm_must_stay_out_of_the_pelvis_and_the_head_too():
    """Not only the chest: a forearm folded down across the belly is in the pelvis, one folded over the
    head is in the head - with the chest well clear in both."""
    belly = {"upperarmR": L("upperarmR", pitch=10.0, yaw=60.0), "forearmR": L("forearmR", pitch=-50.0)}
    over = {"upperarmR": L("upperarmR", pitch=-150.0, yaw=30.0, roll=-30.0), "forearmR": L("forearmR", pitch=-125.0)}
    for pose, deep in ((belly, 0.0494), (over, 0.1074)):
        assert not rig.check_limits(pose)
        assert abs(arms.arm_depth(pose, "R") - deep) < 0.002


def test_an_arm_no_swivel_can_clear_is_reported_and_not_made_worse():
    """A straight arm laid across the chest: turning it about its own length changes nothing.  It is left as
    it is and its frames are listed."""
    pose = {"upperarmR": L("upperarmR", pitch=-60.0, yaw=60.0, roll=20.0), "clavR": L("clavR", yaw=15.0)}
    assert arms.arm_depth(pose, "R") > 0.0
    frames = [dict(pose) for _ in range(5)]
    rep = arms.clear_elbows(frames, np.zeros((5, 3)), FPS)
    v = rep["R"]
    assert v["not_cleared"] == [0, 1, 2, 3, 4] and v["inside_after"] == 5 and v["depth_after"] <= v["depth_before"] + 1e-9
    assert v["wrist_moved_max"] < 1e-3 and not any(rig.check_limits(f) for f in frames)


def test_spread_never_drops_below_what_a_frame_needs():
    need = np.array([0, 0, 0, 5, 20, 40, 38, 0, 0, 0, 12, 0, 0, 0, 0, 0], float)
    for loop in (False, True):
        out = arms._spread(need, 2, loop)
        assert (out >= need - 1e-9).all() and out.max() <= need.max() + 1e-9
        assert np.abs(np.diff(out)).max() < np.abs(np.diff(need)).max()
    assert np.array_equal(arms._spread(np.zeros(6), 3, False), np.zeros(6))
    assert arms._spread(need, 2, False)[-1] == 0.0 and arms._spread(need, 0, False).tolist() == need.tolist()


def test_spread_of_runs_that_swing_to_opposite_sides():
    """Two runs close together that swing the elbow opposite ways: neither is cut by the other (each keeps at
    least its need), the gap between them goes through 0, and outside the clip nothing is needed (no value
    is carried in from beyond the first / last frame).  (The old spread subtracted the two sides: frames
    2..5 got 40 down to 17, frame 0 got 40.)"""
    want = np.array([0, 0, 40, 40, 40, 40, 0, -40, -40, -40, -40, 0, 0], float)
    out = arms._spread(want, 3, False)
    assert np.allclose(out, [28.571, 34.286, 40, 40, 40, 40, 0, -40, -40, -40, -40, -34.286, -28.571], atol=1e-3)
    assert np.allclose(arms._spread(want, 3, True), [5.714, 20.571, 40, 40, 40, 40, 0, -40, -40, -40, -40, -20.571, -5.714], atol=1e-3)
    # one side only: rises into the run and falls out of it, 0 again 2 r frames away
    one = arms._spread(np.array([0, 0, 0, 0, 0, 0, 0, 30, 30, 0, 0, 0, 0, 0, 0, 0], float), 2, False)
    assert np.allclose(one, [0, 0, 0, 6, 12, 18, 24, 30, 30, 24, 18, 12, 6, 0, 0, 0], atol=1e-9)


def test_clear_elbows_spreads_the_signed_swivel(monkeypatch):
    """``clear_elbows`` itself, with the per-frame need given (the arm's geometry stubbed out; the frame is
    told by its root): the swivel it applies is the signed spread above - not one side minus the other."""
    want = [0, 0, 40, 40, 40, 40, 0, -40, -40, -40, -40, 0, 0]
    T = len(want)
    x0 = {side: float(arms._Arm({}, (0.0, 0.0, 0.0), side).shoulder[0]) for side in "LR"}

    class Stub(arms._Arm):
        def frame(self):
            return int(round((self.shoulder[0] - x0[self.side]) / 1e-3))

        def depth(self, psi=0.0, which="steer"):
            return 0.02 if (want[self.frame()] and not psi) else -0.02

        def need(self, sign, margin=arms.CLEAR_MARGIN, step=arms.SWIVEL_STEP, most=arms.SWIVEL_MOST):
            w = float(want[self.frame()])
            return (w, w, -0.02, None) if np.sign(w) == sign else (None, 0.0, 0.02, "none")

        def kept(self, psi):
            return True

        def pose(self, psi):
            return {}, 0.0, 0.0, {"hand_past": 0.0}

    monkeypatch.setattr(arms, "_Arm", Stub)
    frames = [{} for _ in range(T)]
    roots = np.array([[1e-3 * t, 0.0, 0.0] for t in range(T)])
    rep = arms.clear_elbows(frames, roots, 60.0, smooth_s=0.05)
    assert rep["smooth_frames"] == 3
    for side in "LR":
        assert np.allclose(rep[side]["swivel"], [28.57, 34.29, 40, 40, 40, 40, 0, -40, -40, -40, -40, -34.29, -28.57], atol=0.01)


def test_the_lists_name_the_frames_that_are_not_clear_and_why(monkeypatch):
    """``not_cleared`` = the frames that are, as measured after the swing, less than the margin clear - whatever
    ``need`` guessed before the swing; ``hand_cap_limited`` = those of them that the HAND-TURN CAP held in (not
    the joints).  Stubbed arm, no spread: frame 1 the cap holds but the swing clears anyway, frame 2 the cap
    holds and it stays in, frame 3 the joints hold and it stays in, frame 4 clears as planned."""
    plan = {1: ("hand", True), 2: ("hand", False), 3: ("joints", False), 4: (None, True)}  # frame: (why, clear after)
    x0 = {side: float(arms._Arm({}, (0.0, 0.0, 0.0), side).shoulder[0]) for side in "LR"}

    class Stub(arms._Arm):
        def frame(self):
            return int(round((self.shoulder[0] - x0[self.side]) / 1e-3))

        def depth(self, psi=0.0, which="steer"):
            f = self.frame()
            if f not in plan or self.side == "L":
                return -0.02
            if self.rots.get("swung" + self.side):  # (after the swing)
                return -0.02 if plan[f][1] else -0.001
            return -0.02 if psi else 0.01

        def need(self, sign, margin=arms.CLEAR_MARGIN, step=arms.SWIVEL_STEP, most=arms.SWIVEL_MOST):
            why = plan[self.frame()][0]
            return (20.0, 20.0, -0.02, None) if why is None else (None, 20.0, -0.001, why)

        def kept(self, psi):
            return True

        def pose(self, psi):
            return {"swung" + self.side: psi}, 0.0, 0.0, {"hand_past": 0.0}

    monkeypatch.setattr(arms, "_Arm", Stub)
    T = 6
    rep = arms.clear_elbows([{} for _ in range(T)], np.array([[1e-3 * t, 0.0, 0.0] for t in range(T)]), 60.0, smooth_s=0.0)
    v = rep["R"]
    assert v["swivel"] == [0.0, 20.0, 20.0, 20.0, 20.0, 0.0] and v["swivel_needed"] == [0.0, 20.0, 20.0, 20.0, 20.0, 0.0]
    assert v["not_cleared"] == [2, 3] and v["under_margin_after"] == 2 and v["hand_cap_limited"] == [2]
    assert rep["L"]["not_cleared"] == [] and rep["L"]["frames"] == 0


# ---------------------------------------------------------------- grip: the fist follows the punch
def punch_frames(side="L", out=6, hold=4, back=10, lead=20, tail=24, pause=0):
    """Guard - punch - guard for one arm, the other in guard all the time.  Returns (frames, launch, peak):
    ``launch`` = the last guard frame, ``peak`` = the first frame at full extension."""
    other = "R" if side == "L" else "L"
    bend = [-115.0] * lead
    ramp = [-115.0 + 100.0 * (k + 1) / out for k in range(out)]
    if pause:  # a hit-stop half way out
        ramp = ramp[:out // 2] + [ramp[out // 2 - 1]] * pause + ramp[out // 2:]
    bend += ramp + [-15.0] * hold + [-15.0 - 100.0 * (k + 1) / back for k in range(back)] + [-115.0] * tail
    frames = [dict(guard(side, elbow=b), **guard(other)) for b in bend]
    return frames, lead - 1, lead + len(ramp) - 1


def test_the_fist_closes_as_the_punch_goes_out_and_opens_as_the_hand_comes_back():
    frames, launch, peak = punch_frames("L")
    T = len(frames)
    g, rep = arms.grip_track(frames, np.zeros((T, 3)), FPS)
    left, right = g[:, 0], g[:, 1]
    assert right.max() == 0.0 and rep["R"]["punches"] == []  # the hand that stays in guard stays open
    assert left[:launch - 6].max() == 0.0 and left[-12:].max() == 0.0  # open in guard, before and after
    assert left[peak] == 1.0 and left[peak:peak + 4].min() == 1.0  # a fist at full extension, and while it is held
    row = rep["L"]["punches"][0]
    reach = arms.reach(frames)[:, 0]
    half = reach[launch] + arms.FULL_AT * (reach[peak] - reach[launch])
    assert row["by"] == "motion" and row["peak_frame"] == peak and reach[row["full_frame"]] >= half > reach[row["full_frame"] - 1]
    assert row["full_frame"] < peak and left[row["full_frame"]] == 1.0  # complete before the arm is straight
    assert row["full_frame"] - row["start_frame"] == round(arms.CLOSE_S * FPS)  # ... having closed over CLOSE_S
    rise, fall = left[:peak + 1], left[peak:]
    assert (np.diff(rise) >= -1e-12).all() and (np.diff(fall) <= 1e-12).all()  # closes once, opens once
    assert np.abs(np.diff(left)).max() <= 0.5  # no snap: never more than half the way in one frame
    opened = row["open_frame"]
    back = (reach[opened] - reach[launch]) / (reach[peak] - reach[launch])
    assert opened is not None and back <= arms.OPEN + 1e-9 and left[opened] == 0.0 and left[opened - 1] > 0.0
    assert rep["L"]["grip_first"] == 0.0 and rep["L"]["grip_last"] == 0.0
    # written into the pose: the finger block curls, the thumb comes across; the body is not touched
    keep = [{b: R.copy() for b, R in f.items()} for f in frames]
    arms.apply_grip(frames, g)
    assert abs(rig.grip_of(frames[peak], "L") - 1.0) < 1e-9 and rig.grip_of(frames[peak], "R") == 0.0  # noqa
    assert rig.grip_of(frames[0], "L") == 0.0 and not rig.check_limits(frames[peak])
    assert all(np.array_equal(f[b], k[b]) for f, k in zip(frames, keep) for b in k)
    # the right hand does the same, mirrored
    frames_r, _, peak_r = punch_frames("R")
    g_r, _ = arms.grip_track(frames_r, np.zeros((T, 3)), FPS)
    assert np.allclose(g_r[:, 1], left) and g_r[:, 0].max() == 0.0 and peak_r == peak


def test_a_fist_opens_over_a_tenth_of_a_second_however_fast_the_hand_comes_back():
    """The hand snaps back to its guard in two frames: the fist still takes 0.10 s (6 frames at 60 fps) to
    open - never more than a sixth of the way in one frame."""
    frames, launch, peak = punch_frames("L", back=2)
    g, rep = arms.grip_track(frames, np.zeros((len(frames), 3)), FPS)
    row = rep["L"]["punches"][0]
    assert (row["peak_frame"], row["release_frame"], row["open_frame"]) == (25, 29, 36)
    assert np.allclose(g[30:37, 0], [0.9352, 0.7686, 0.6019, 0.4352, 0.2686, 0.1019, 0.0], atol=1e-4)
    assert -np.diff(g[:, 0]).max() <= 1.0 / 6.0 + 1e-9


def test_the_fist_does_not_close_again_on_the_way_back():
    """Back half way, then out again slowly (too slow for a punch), then home: once the fist has begun to
    open it never closes again until the next punch."""
    bend = ([-115.0] * 20 + [-115 + 100 * (k + 1) / 6 for k in range(6)] + [-15.0] * 4 + [-15 - 50 * (k + 1) / 8 for k in range(8)]
            + [-65 + 25 * (k + 1) / 12 for k in range(12)] + [-40 - 75 * (k + 1) / 10 for k in range(10)] + [-115.0] * 20)
    frames = [dict(guard("L", elbow=b), **guard("R")) for b in bend]
    g, rep = arms.grip_track(frames, np.zeros((len(frames), 3)), FPS)
    assert len(rep["L"]["punches"]) == 1 and rep["L"]["punches"][0]["peak_frame"] == 25
    assert (np.diff(g[25:, 0]) <= 1e-12).all()
    assert abs(g[40, 0] - 0.935) < 0.002 and abs(g[50, 0] - 0.935) < 0.002 and g[58, 0] == 0.0  # held while it goes out again


def test_a_guard_hand_riding_out_a_little_is_not_a_punch():
    """A fast but small extension (0.13 of the arm's length, as the guard hand rides out with the turning
    shoulders) does not make a fist; 0.17 does."""
    def ride(to):
        bend = [-115.0] * 20 + [-115 + (to + 115) * (k + 1) / 4 for k in range(4)] + [to] * 6 \
            + [to + (-115 - to) * (k + 1) / 8 for k in range(8)] + [-115.0] * 20
        frames = [dict(guard("L", elbow=b), **guard("R")) for b in bend]
        e = arms.reach(frames)[:, 0]
        g, rep = arms.grip_track(frames, np.zeros((len(frames), 3)), FPS)
        return float(e.max() - e[19]), float((np.diff(e) * FPS).max()), g, rep
    gain, speed, g, rep = ride(-95.0)
    assert 0.13 < gain < 0.14 and speed > 2.0  # fast enough to be a launch, too short to be a punch
    assert g.max() == 0.0 and rep["L"]["punches"] == []
    gain, speed, g, rep = ride(-90.0)
    assert 0.16 < gain < 0.17 and len(rep["L"]["punches"]) == 1 and g[:, 0].max() == 1.0


def test_grip_uses_the_sources_punch_and_contact_events():
    """With events the fist is complete at the contact, and starts closing when the punch is pressed - also
    through a hit-stop on the way out; a punch the reach cannot show (a hook) closes by its events alone."""
    frames, launch, peak = punch_frames("L", out=6, pause=3)
    T = len(frames)
    contact = launch + 2  # the hit lands early on the way out (then the hit-stop, then the arm goes on)
    events = [dict(t=(launch - 4 + 1) / FPS, type="punch", name="jab"), dict(t=(contact + 1) / FPS, type="block", name="jab")]
    plain, rep0 = arms.grip_track(frames, np.zeros((T, 3)), FPS)
    g, rep = arms.grip_track(frames, np.zeros((T, 3)), FPS, events)
    row0, row = rep0["L"]["punches"][0], rep["L"]["punches"][0]
    assert len(rep0["L"]["punches"]) == 1 and row0["peak_frame"] == peak  # the hit-stop does not split the punch in two
    assert row["by"] == "motion+event" and row["name"] == "jab" and row["contact_frame"] == contact
    assert row["full_frame"] == contact and g[contact, 0] == 1.0 and g[contact:peak + 1, 0].min() == 1.0
    assert row["start_frame"] == launch - 4 and g[launch - 4, 0] == 0.0 and 0.0 < g[launch - 2, 0] < 1.0
    assert g[launch - 5, 0] == 0.0 and g[:, 1].max() == 0.0 and rep["R"]["punches"] == []
    assert row0["full_frame"] >= row["full_frame"]  # (without the events it is complete half way out)
    # a hook: the arm keeps its bend, only the events tell
    still = [dict(guard("L"), **guard("R", elbow=-95.0)) for _ in range(60)]
    for t in range(20, 26):  # the right arm swings round a little (its reach grows by a few percent only)
        still[t]["forearmR"] = L("forearmR", pitch=-95.0 + 3.0 * (t - 19))
    ev = [dict(t=20 / FPS, type="punch", name="hook"), dict(t=25 / FPS, type="hit", name="hook")]
    none, _ = arms.grip_track(still, np.zeros((60, 3)), FPS)
    g, rep = arms.grip_track(still, np.zeros((60, 3)), FPS, ev)
    assert none.max() == 0.0  # (nothing in the reach says "punch")
    row = rep["R"]["punches"][0]
    assert row["by"] == "event" and g[24, 1] == 1.0 and g[18, 1] == 0.0 and g[:, 0].max() == 0.0
    assert g[24 + round(arms.EVENT_HOLD_S * FPS), 1] == 1.0 and g[-1, 1] == 0.0 and row["open_frame"] is not None


def test_slow_arm_movements_do_not_make_fists():
    """Walking (arms swinging, nearly straight) and a slow reach forward are not punches."""
    walk = [motion.walk_rots(SKEL, k / 30)[0] for k in range(60)]
    g, rep = arms.grip_track(walk, np.zeros((60, 3)), 30.0)
    assert g.max() == 0.0 and rep["L"]["punches"] == [] and rep["R"]["punches"] == []
    slow, _, _ = punch_frames("L", out=40, back=40)  # the same reach, over two thirds of a second
    g, _ = arms.grip_track(slow, np.zeros((len(slow), 3)), FPS)
    assert g.max() == 0.0


def test_fix_clip_gives_an_older_clip_fists_and_clear_elbows():
    """A clip from before the mitten (no finger bones) goes through ``fix_clip``: it comes back with them."""
    frames, _, peak = punch_frames("L")
    T = len(frames)
    old = clip_mod.Clip.from_rots(FPS, frames, np.zeros((T, 3)), bones=rig.GEOMETRY_BONES + rig.HELPER_BONES)
    new, rep = arms.fix_clip(old)
    assert set(rig.HAND_BONES) <= set(new.bones) and not set(rig.HAND_BONES) & set(old.bones)
    assert abs(rig.grip_of(new.body_rots(peak), "L") - 1.0) < 1e-4 and rig.grip_of(new.body_rots(0), "L") == 0.0
    assert rep["elbows"]["L"]["inside_after"] == 0 and rep["grip"]["L"]["punches"][0]["peak_frame"] == peak
    assert new.pose(peak)[0].shape == (len(SKEL), 3, 4) and new.meta["arms"] == dict(clear=True, grip=True)
    same, rep2 = arms.fix_clip(old, clear=False, grip=False)
    assert rep2 == {} and same.bones == old.bones and np.allclose(same.quat, old.quat, atol=1e-6)


# ---------------------------------------------------------------- a wrist given outside its limits
def tucked_with_hand(**angles):
    """The tucked guard with the right wrist held at these joint angles on every frame."""
    frames, before = tucked(48)
    for f, b in zip(frames, before):
        f["handR"] = L("handR", **angles)
        b["handR"] = f["handR"].copy()
    return frames, before


@pytest.mark.parametrize("angles, past, not_cleared, wrist_past_max", [
    (dict(yaw=110.0), 20.0, 0, 19.785),  # the forearm turned 20 degrees further over than the wrist's ball allows
    (dict(roll=35.0), 15.0, 0, 14.546),  # bent 15 degrees further towards the palm (flexion) than it allows
    (dict(roll=-50.0), 20.0, 40, 11.657)])  # bent 20 degrees further back (extension): no room left to swing for
def test_a_wrist_given_outside_its_limits_stays_no_further_out_and_the_glove_keeps_to_the_cap(angles, past, not_cleared,
                                                                                              wrist_past_max):
    """The cap is measured against the hand the function was GIVEN.  A wrist that comes in outside its limits
    is not clamped (that alone would turn the glove by 15-20 degrees, and only on the frames that are swung:
    a 20-degree jump where the swing starts); it may stay as far out as it came, never further.  So: the glove
    turns 0 degrees here, the frames that are not swung are exactly as given, the wrist is never more than
    ``past`` outside, and the report says how far out it came.  Bent back to its limit already, the right
    wrist leaves no swing that clears within the cap: 40 frames are reported under the margin instead."""
    frames, before = tucked_with_hand(**angles)
    assert abs(rig.clamp_rot("handR", before[0]["handR"])[2] - past) < 1e-6
    v = arms.clear_elbows(frames, np.zeros((48, 3)), FPS)["R"]
    turned = np.array([clip_mod.geodesic_deg(world(frames[t], "handR"), world(before[t], "handR")) for t in range(48)])
    assert turned.max() < 1e-3 and v["hand_turned_max"] < 1e-3
    W = [world(frames[t], "handR") for t in range(48)]
    W0 = [world(before[t], "handR") for t in range(48)]
    step = max(clip_mod.geodesic_deg(W[t], W[t + 1]) for t in range(47))
    assert abs(step - max(clip_mod.geodesic_deg(W0[t], W0[t + 1]) for t in range(47))) < 1e-3  # no jump of its own
    assert max(rig.clamp_rot("handR", f["handR"])[2] for f in frames) <= past + 1e-3
    for t in (0, 1, 46, 47):  # not swung: exactly as given (also the wrist that is outside)
        assert all(np.array_equal(frames[t][b], before[t][b]) for b in before[t])
    assert v["frames"] == 44 and v["wrist_in_past_frames"] == 48 and v["wrist_in_past_max"] == past
    assert len(v["not_cleared"]) == not_cleared and abs(v["wrist_past_limits_max"] - wrist_past_max) < 2e-3
    assert v["wrist_moved_max"] < 1e-3


def test_give_finds_the_share_where_the_nearest_allowed_rotation_moves_on_the_way():
    """``_give`` turns the clamped wrist towards the asked one until it is ``give`` degrees outside.  With the
    wrist out on two axes (forearm over by 40, bent towards the palm by 25) the nearest allowed rotation moves on
    the way, and the plain share give / over lands 0.52 degrees past: the share is searched for instead."""
    asked = L("handR", yaw=130.0, roll=45.0)
    hand, _, over = rig.clamp_rot("handR", asked)
    assert abs(over - 41.767) < 1e-3
    plain = rig.clamp_rot("handR", hand @ arms._fraction(hand.T @ asked, 20.0 / over))[2]
    assert abs(plain - 20.516) < 0.002  # (what the share alone gives)
    got, e = arms._give("R", hand, asked, over, 20.0)
    assert abs(e - 20.0) < 0.01 and abs(rig.clamp_rot("handR", got)[2] - 20.0) < 0.01


def test_need_takes_the_smallest_clearing_angle_when_the_edge_of_the_cap_clears():
    """With the glove allowed 11.5 degrees, the deepest frame of the tuck clears at -46.26 (glove 10.81) - between
    two points of the 3-degree grid: -45 does not clear, -48 turns the glove 12.24.  The edge of the cap lies
    past -46.26, so the frame IS clear: ``need`` says so, with the smallest angle that does it (not the edge),
    and nothing is listed."""
    frames, before = tucked(48)
    a = arms._Arm(before[24], (0, 0, 0), "R", 0.0, 11.5)
    assert abs(a.cost(-45.0)[1] - 9.7631) < 1e-3 and a.depth(-45.0) > -MARGIN and abs(a.cost(-48.0)[1] - 12.2381) < 1e-3
    lo, psi, d, why = a.need(-1.0)
    assert why is None and lo == psi and abs(psi - (-46.262)) < 0.01 and -MARGIN - 2e-5 < d <= -MARGIN
    v = arms.clear_elbows(frames, np.zeros((48, 3)), FPS, hand_turn_most=11.5)["R"]
    assert v["not_cleared"] == [] and v["hand_cap_limited"] == [] and v["under_margin_after"] == 0
    assert abs(v["swivel_max"] - 46.26) < 0.011 and abs(v["hand_turned_max"] - 10.809) < 2e-3


def test_a_spread_angle_that_cannot_be_made_is_cut_back_no_further_than_the_frame_needs(monkeypatch):
    """Frames 3 and 5 can be swung 19.3 degrees at most (the cap), frame 4 needs 35: spread over the neighbours
    the swing asks 3 and 5 for more than they can make.  They are cut back to the most that can be made - 19.3,
    which is what they need themselves - never below it.  (Stubbed arm: the frame is told by its root.)"""
    need = {2: 10.0, 3: 19.3, 4: 35.0, 5: 19.3, 6: 10.0}
    most = {3: 19.3, 5: 19.3}
    x0 = float(arms._Arm({}, (0.0, 0.0, 0.0), "R").shoulder[0])

    class Stub(arms._Arm):
        def frame(self):
            return int(round((self.shoulder[0] - x0) / 1e-3)) if self.side == "R" else -1

        def depth(self, psi=0.0, which="steer"):
            return 0.01 if (self.frame() in need and not psi and not self.rots.get("swungR")) else -0.02

        def need(self, sign, margin=arms.CLEAR_MARGIN, step=arms.SWIVEL_STEP, most_=arms.SWIVEL_MOST):
            f = self.frame()
            return (need[f], need[f], -0.02, None) if f not in most else (None, most[f], -0.001, "hand")

        def kept(self, psi):
            return abs(psi) <= most.get(self.frame(), 90.0) + 1e-9

        def pose(self, psi):
            return {"swungR": psi}, 0.0, 0.0, {"hand_past": 0.0}

    monkeypatch.setattr(arms, "_Arm", Stub)
    T = 9
    v = arms.clear_elbows([{} for _ in range(T)], np.array([[1e-3 * t, 0.0, 0.0] for t in range(T)]), 60.0, smooth_s=2 / 60)["R"]
    assert v["swivel_needed"] == [0.0, 0.0, 10.0, 19.3, 35.0, 19.3, 10.0, 0.0, 0.0]
    assert v["spread_cut"] == [3, 5] and v["swivel"][3] == 19.3 and v["swivel"][5] == 19.3
    assert v["swivel"][4] == 35.0 and v["swivel"][2] > 10.0 and v["swivel"][6] > 10.0


# ---------------------------------------------------------------- the wrist's range: "default" and "human"
def test_the_wrists_roll_is_flexion_and_extension_and_its_pitch_the_side_bend():
    """Which of the rig's angles is which on the mitten hand (``rig.hand_axes``: along the arm a, towards the
    palm n, forward = thumb side w): roll turns about w - flexion (fingertips towards the palm) is -roll on the
    left hand and +roll on the right; pitch turns about the palm's normal (side bend); yaw about the hand's
    length.  The default limits allow 20 degrees of flexion and 30 of extension on both hands."""
    for side, s in rig.SIDES:
        a, n, w = rig.hand_axes(s)
        flex = L("hand" + side, roll=-s * 20.0)
        assert abs((flex @ a) @ n - np.sin(np.radians(20.0))) < 1e-9 and abs((flex @ a) @ w) < 1e-9
        side_bend = L("hand" + side, pitch=-20.0)
        assert abs((side_bend @ a) @ w - np.sin(np.radians(20.0))) < 1e-9 and abs((side_bend @ a) @ n) < 1e-9
        twist = L("hand" + side, yaw=20.0)
        assert np.allclose(twist @ a, a)
        (p0, p1), (y0, y1), (r0, r1) = rig.limits("hand" + side)
        flexion, extension = (-r0, r1) if s > 0 else (r1, -r0)
        assert (flexion, extension) == (20.0, 30.0) and (p0, p1, y0, y1) == (-70.0, 70.0, -90.0, 90.0)
        (_, _), (_, _), (h0, h1) = rig.limits("hand" + side, "human")
        assert (h0, h1) == (-70.0, 70.0)  # flexion 70, extension 70


def test_limit_sets_are_asked_for_and_nothing_else_changes():
    import costume
    assert rig.current_limit_set() == "default" and sorted(rig.LIMIT_SETS) == ["default", "human"]
    assert rig.LIMIT_SETS["human"] == {"hand": ((-70.0, 70.0), (-90.0, 90.0), (-70.0, 70.0))}
    bent = L("handL", roll=50.0)  # extension 50: 20 past the default, inside the human range
    assert abs(rig.clamp_rot("handL", bent)[2] - 20.0) < 1e-6 and rig.clamp_rot("handL", bent, "human")[2] == 0.0
    assert rig.check_limits({"handL": bent})[0][:2] == ("handL", "roll") and rig.check_limits({"handL": bent}, limit_set="human") == []
    assert set(rig.clamp_pose({"handL": bent})[1]) == {"handL"} and rig.clamp_pose({"handL": bent}, "human")[1] == {}
    with rig.limit_set("human"):
        assert rig.current_limit_set() == "human" and rig.limits("handR")[2] == (-70.0, 70.0)
        assert rig.limits("handR", "default")[2] == (-30.0, 20.0) and rig.limits("forearmL") == rig.limits("forearmL", "default")
        assert rig.check_limits({"handL": bent}) == [] and rig.clamp_rot("handL", bent)[2] == 0.0
        with body.wearing(costume):  # an outfit's own limits still apply on top of the set
            assert rig.limits("neck") == costume.LIMITS["neck"] and rig.limits("handL")[2] == (-70.0, 70.0)
        cast = types.SimpleNamespace(LIMITS={"hand": ((-5.0, 5.0), (-5.0, 5.0), (-5.0, 5.0))})  # (a plaster cast)
        with body.wearing(cast):  # ... also on a joint the set names
            assert rig.limits("handL") == ((-5.0, 5.0), (-5.0, 5.0), (-5.0, 5.0))
    assert rig.current_limit_set() == "default"
    with pytest.raises(ValueError):
        with rig.limit_set("human"):
            raise ValueError("inside")
    assert rig.current_limit_set() == "default"  # (restored after an error too)
    with pytest.raises(ValueError, match="no limit set"):
        rig.limits("handL", "wide")
    # the limit poses sweep the set they are asked for; the default ones are what they were
    poses, wide = rig.limit_poses(4, 0), rig.limit_poses(4, 0, limit_set="human")
    assert len(poses) == len(wide) and rig.current_limit_set() == "default"
    rolls = sorted({round(rig.joint_angles("handL", p["handL"])[2], 6) for p in wide if set(p) == {"handL"}})
    assert rolls[0] == -70.0 and rolls[-1] == 70.0
    assert sorted({round(rig.joint_angles("handL", p["handL"])[2], 6) for p in poses if set(p) == {"handL"}})[::len(rolls) - 1] == [-20.0, 30.0]
    assert any(rig.check_limits(p) for p in wide) and not any(rig.check_limits(p, limit_set="human") for p in wide)


def test_with_the_human_wrist_the_elbow_clears_and_the_glove_does_not_turn():
    """The tuck that the default wrist leaves partly inside on four frames (glove at its 10-degree cap): with
    the wrist allowed to bend back 70 degrees, every frame clears and the glove keeps its orientation exactly -
    with the cap at 10 and at 0 alike.  The wrist then bends back up to 40.8 degrees: 10.8 past the default.
    The set is in force for the call only."""
    for cap in (10.0, 0.0):
        frames, before = tucked(48)
        rep = arms.clear_elbows(frames, np.zeros((48, 3)), FPS, hand_turn_most=cap, wrist_range="human")
        v = rep["R"]
        assert rep["wrist_range"] == "human" and rep["wrist_limits"]["R"] == [[-70.0, 70.0], [-90.0, 90.0], [-70.0, 70.0]]
        assert rig.current_limit_set() == "default"
        assert v["frames"] == 44 and v["not_cleared"] == [] and v["hand_cap_limited"] == [] and v["inside_after"] == 0
        assert v["hand_turned_max"] < 1e-3 and abs(v["swivel_max"] - 46.27) < 0.011
        turned = max(clip_mod.geodesic_deg(world(frames[t], "handR"), world(before[t], "handR")) for t in range(48))
        assert turned < 1e-3
        roll = min(rig.joint_angles("handR", f.get("handR", np.eye(3)))[2] for f in frames)
        assert abs(roll - (-40.81)) < 0.01  # extension 40.8 (the right hand bends back with -roll)
        assert abs(max(rig.clamp_rot("handR", f.get("handR", np.eye(3)))[2] for f in frames) - 10.813) < 2e-3  # past the default
        assert not any(rig.check_limits(f, limit_set="human") for f in frames)
    frames, _ = tucked(48)
    assert arms.clear_elbows(frames, np.zeros((48, 3)), FPS)["wrist_range"] == "default"


def test_the_fix_command_passes_the_cap_and_the_wrist_range_on(tmp_path, monkeypatch):
    """``arms.py fix`` with --hand-turn-max and --wrist-range: both reach the clearance (report and clip)."""
    frames, _ = tucked(48)
    old = clip_mod.Clip.from_rots(FPS, frames, np.zeros((48, 3)), bones=rig.GEOMETRY_BONES + rig.HELPER_BONES)
    old.save(str(tmp_path / "in.npz"))
    runs = {}
    for name, extra in (("dflt", ["--hand-turn-max", "4"]), ("human", ["--hand-turn-max", "0", "--wrist-range", "human"])):
        monkeypatch.setattr(sys, "argv", ["arms.py", "fix", str(tmp_path / "in.npz"), "-o", str(tmp_path / f"{name}.npz"), "--no-grip"] + extra)
        arms.main()
        import json
        runs[name] = (json.load(open(tmp_path / f"{name}_arms.json"))["elbows"], clip_mod.Clip.load(str(tmp_path / f"{name}.npz")))
    el, c = runs["dflt"]
    assert el["hand_turn_most"] == 4.0 and el["wrist_range"] == "default" and el["R"]["hand_turned_max"] <= 4.0 + 2e-3
    assert el["R"]["hand_cap_limited"] == list(range(18, 30)) and c.meta["arms"] == dict(clear=True, grip=False)
    el, c = runs["human"]
    assert el["hand_turn_most"] == 0.0 and el["wrist_range"] == "human" and el["R"]["not_cleared"] == []
    assert el["R"]["hand_turned_max"] < 1e-3 and c.meta["arms"] == dict(clear=True, grip=False, wrist_range="human")
    assert rig.current_limit_set() == "default"

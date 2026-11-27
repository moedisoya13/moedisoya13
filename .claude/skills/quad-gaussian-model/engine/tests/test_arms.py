"""Fast checks for the arm steps any motion can be given once it is on the rig (template/arms.py):
an elbow inside the trunk is swung out about the shoulder-wrist line with the wrist and the hand kept, the
swing is smooth in time and reported, and the mitten hands close into fists with the punches.
Poses are built from the rig's own joint angles: no source data, no baked model.  CPU, a few seconds."""
import sys
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


def test_an_elbow_tucked_into_the_chest_is_swung_out_of_it():
    """A guard that slides its elbow in front of the chest and back out: while it is in, the elbow is swung
    out by the smallest angle that clears; the wrist does not move; the swing grows and shrinks smoothly."""
    T = 48
    tuck = np.sin(np.linspace(0, np.pi, T)) ** 2  # out - in - out
    frames = [dict(guard("R", t), **guard("L")) for t in tuck]
    before = [{b: R.copy() for b, R in f.items()} for f in frames]
    roots = np.zeros((T, 3))
    deep = np.array([arms.arm_depth(f, "R") for f in before])
    assert deep[0] < -arms.CLEAR_MARGIN and deep.max() > 0.03  # (the pose as given: clear, then well inside)
    rep = arms.clear_elbows(frames, roots, FPS)
    v = rep["R"]
    assert v["needed_frames"] == int((deep > -arms.CLEAR_MARGIN).sum()) and v["inside_before"] == int((deep > 0).sum())
    assert abs(v["depth_before"] - deep.max()) < 1e-4
    after = np.array([arms.arm_depth(f, "R") for f in frames])
    assert after.max() <= -arms.CLEAR_MARGIN + 1e-6 and v["inside_after"] == 0 and v["not_cleared"] == []
    assert abs(v["depth_after"] - after.max()) < 1e-4
    psi = np.array(v["swivel"])
    assert 10.0 < v["swivel_max"] < 120.0 and psi[0] == 0.0 and psi[-1] == 0.0
    assert (np.sign(psi[psi != 0]) == np.sign(psi[np.abs(psi).argmax()])).all()  # one side for the whole run
    assert np.abs(np.diff(psi)).max() < 0.35 * v["swivel_max"]  # no pop: it builds up over many frames
    for t in range(T):
        assert np.linalg.norm(world(frames[t], "handR", rig.WRIST[-1]) - world(before[t], "handR", rig.WRIST[-1])) < 1e-3
        turned = clip_mod.geodesic_deg(world(frames[t], "handR"), world(before[t], "handR"))
        assert turned <= v["hand_turned_max"] + 1e-3 <= arms.HAND_TURN_MOST + 1e-3
        assert not rig.check_limits(frames[t])
        for b in ("upperarmL", "forearmL", "chest", "pelvis"):  # nothing else is touched
            assert np.array_equal(frames[t].get(b, np.eye(3)), before[t].get(b, np.eye(3)))
    assert v["wrist_moved_max"] < 1e-3 and rep["L"]["frames"] == 0
    # the smallest angle: half of it is not enough on the deepest frame
    k = int(deep.argmax())
    half = dict(before[k])
    arms.swivel_arm(half, "R", 0.5 * psi[k])
    assert arms.arm_depth(half, "R") > -arms.CLEAR_MARGIN
    # with the wrist's ball allowed past its limits the hand does not turn at all
    again = [{b: R.copy() for b, R in f.items()} for f in before]
    rep2 = arms.clear_elbows(again, roots, FPS, wrist_give=90.0)
    assert rep2["R"]["hand_turned_max"] < 1e-3 and rep2["R"]["inside_after"] == 0


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

"""Fast checks for importing motion authored on another skeleton (examples/soldier/import_pose.py): the
rest-pose correction (their T-pose <-> our hanging arms), elbow and knee bends, left stays left, the room
placement, feet put on the source's spots, joint limits that are reported, and the file format.
A synthetic source only: no catalogue data, no baked model.  CPU, a few seconds."""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples" / "soldier"))
import clip as clip_mod  # noqa: E402
import import_pose as ip  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402
from clip import Clip  # noqa: E402

SKEL = rig.SKELETON
RX, RY, RZ = rig.rot_x, rig.rot_y, rig.rot_z
quiet = lambda *a: None  # noqa: E731

# a 22-joint humanoid in a T-pose (metres, y up, facing +z, left = +x): parents first
_SIDE = [("Shoulder", "Chest", (0.06, 1.43, 0.0)), ("Arm", "@Shoulder", (0.21, 1.43, 0.0)),
         ("ForeArm", "@Arm", (0.49, 1.43, 0.0)), ("Hand", "@ForeArm", (0.74, 1.43, 0.0)),
         ("Leg", "Hips", (0.11, 0.92, 0.0)), ("Shin", "@Leg", (0.11, 0.50, 0.0)), ("Foot", "@Shin", (0.11, 0.09, 0.0)),
         ("ToeBase", "@Foot", (0.11, 0.03, 0.13))]
JOINTS = [("Hips", None, (0.0, 0.95, 0.0)), ("Spine1", "Hips", (0.0, 1.05, 0.0)), ("Spine2", "Spine1", (0.0, 1.17, 0.0)),
          ("Chest", "Spine2", (0.0, 1.29, 0.0)), ("Neck1", "Chest", (0.0, 1.47, 0.0)), ("Head", "Neck1", (0.0, 1.55, 0.0))]
for _name, _parent, _p in _SIDE:
    JOINTS.append(("Left" + _name, _parent.replace("@", "Left"), _p))
    JOINTS.append(("Right" + _name, _parent.replace("@", "Right"), (-_p[0], _p[1], _p[2])))
NAMES = [j[0] for j in JOINTS]
PARENT = {j[0]: j[1] for j in JOINTS}
TPOSE = {j[0]: np.array(j[2], float) for j in JOINTS}


def source(frames, fps=60.0, events=()):
    """A Source from [{"rot": {joint: 3x3}, "root": .., "stretch": .., "place": (R, p)}, ...]."""
    T = len(frames)
    rot = np.tile(np.eye(3), (T, len(NAMES), 1, 1))
    root, stretch = np.zeros((T, 3)), np.ones(T)
    pR, pp = np.tile(np.eye(3), (T, 1, 1)), np.zeros((T, 3))
    for t, f in enumerate(frames):
        for n, R in f.get("rot", {}).items():
            rot[t, NAMES.index(n)] = R
        root[t] = f.get("root", (0, 0, 0))
        stretch[t] = f.get("stretch", 1.0)
        if "place" in f:
            pR[t], pp[t] = f["place"]
    return ip.Source(list(NAMES), dict(PARENT), dict(TPOSE), fps, rot, root, stretch, pR, pp, list(events), {})


def one(rot=None, par=None, **frame):
    """Retarget a single pose: ({bone: local rotation}, root, report, clip)."""
    c, rep = ip.retarget(source([dict(rot=rot or {}, **frame)]), par, log=quiet)
    return c.body_rots(0), c.root[0].astype(float), rep, c


def direction(rots, bone, root=(0, 0, 0)):
    return rt.fk(rots, root)[SKEL.index[bone]][:, :3] @ ip.our_rest_dir(bone)


def angle(a, b):
    return math.degrees(math.acos(float(np.clip(rt.unit(a) @ rt.unit(b), -1, 1))))


# ---------------------------------------------------------------- rest poses
def test_their_tpose_is_our_tpose():
    rots, root, rep, _ = one()
    # hips at their rest height -> our pelvis at its own, less the little bend the rig's legs always keep
    assert np.abs(root[[0, 2]]).max() < 1e-6 and -0.002 < root[1] <= 0.0
    assert abs(rep["root"]["lowered_max"] + root[1]) < 1e-6 and rep["root"]["reach_max"] <= ip.Params().max_reach + 1e-6
    straight, straight_root, _, _ = one(par=ip.Params(max_reach=0.99999))
    assert np.abs(straight_root).max() < 1e-3
    assert angle(direction(rots, "upperarmL"), [1, 0, 0]) < 1e-4 and angle(direction(rots, "forearmL"), [1, 0, 0]) < 1e-4
    assert angle(direction(rots, "upperarmR"), [-1, 0, 0]) < 1e-4 and angle(direction(rots, "handR"), [-1, 0, 0]) < 1e-4
    for b in ("thighL", "shinL", "thighR", "shinR"):
        # (that bend; and the legs lean a little: our hips are narrower, our foot shorter from ankle to ball)
        assert angle(direction(rots, b), [0, -1, 0]) < 4.5, b
        assert angle(direction(straight, b), [0, -1, 0]) < 2.5, b
    for b in ("pelvis", "chest", "neck", "head", "clavL", "clavR", "toeL", "toeR"):
        assert clip_mod.geodesic_deg(rots[b], np.eye(3)) < 1e-3, b
    for b in ("footL", "footR"):  # soles flat on the ground under those leaning legs
        assert clip_mod.geodesic_deg(rt.fk(rots)[SKEL.index[b]][:, :3], np.eye(3)) < 1e-3, b
    # arms raised to the side, 80 degrees from the rest pose = "roll 90" in the rig's joint tables (its limit)
    _, angles, outside = rig.clamp_rot("upperarmL", rots["upperarmL"])
    assert outside < ip.INSIDE and abs(angles[2] - 90.0) < 1e-3 and rep["twist_passed_on"] == {}
    assert clip_mod.geodesic_deg(rots["upperarmL"], RZ(90.0 - rig.A_POSE)) < 1e-4
    assert rep["clamps"] == {}


def test_their_arms_down_is_our_rest_pose():
    """The source brought into OUR rest pose (arms hanging, 10 degrees out) gives identity rotations."""
    down = 90.0 - rig.A_POSE
    rots, root, rep, _ = one({"LeftArm": RZ(-down), "RightArm": RZ(down)})
    for b in clip_mod.body_bones():
        if b[:-1] not in ("thigh", "shin", "foot", "toe"):
            assert clip_mod.geodesic_deg(rots[b], np.eye(3)) < 1e-4, b
    assert rep["clamps"] == {} and rep["twist_passed_on"] == {}


def test_rest_corrections_are_turns_about_z_for_the_arms_only():
    src = source([{}])
    table = ip.expand_map(ip.SOMA)
    C = ip.corrections(src, table)
    assert np.allclose(C["upperarmL"], RZ(90.0 - rig.A_POSE), atol=1e-6)
    assert np.allclose(C["forearmR"], RZ(-(90.0 - rig.A_POSE)), atol=1e-6)
    assert np.allclose(C["handL"], C["forearmL"])
    for b in ("pelvis", "chest", "head", "thighL", "footR", "toeL", "clavR"):
        assert np.allclose(C[b], np.eye(3))
    assert sorted(table) == sorted(clip_mod.body_bones())  # every body bone has a source joint


# ---------------------------------------------------------------- bends keep their meaning
@pytest.mark.parametrize("bend", [30.0, 60.0, 120.0])
def test_elbow_bend_is_the_same_elbow_bend(bend):
    # the source bends its elbow about the arm's local y (the forearm of a T-pose arm goes forward)
    rots, _, rep, _ = one({"LeftForeArm": RY(-bend), "RightForeArm": RY(bend)})
    for side in "LR":
        assert np.allclose(rig.joint_angles("forearm" + side, rots["forearm" + side]), (-bend, 0, 0), atol=1e-3)
        want = np.array([(1 if side == "L" else -1) * math.cos(math.radians(bend)), 0, math.sin(math.radians(bend))])
        assert angle(direction(rots, "forearm" + side), want) < 1e-3
    assert rep["clamps"] == {}


def test_left_stays_left():
    # only his left arm swings forward, only his right knee lifts
    rots, _, _, c = one({"LeftArm": RY(-90.0), "RightLeg": RX(-60.0), "RightShin": RX(60.0)}, ip.Params(foot_ik=False))
    M = rt.fk(rots, c.root[0])
    wl, wr = rt.at(M, "handL", rig.WRIST[1]), rt.at(M, "handR", rig.WRIST[-1])
    assert wl[2] > 0.5 and wl[0] > 0 and abs(wr[2]) < 1e-3 and wr[0] < -0.5
    kl, kr = rt.at(M, "shinL", rig.KNEE[1]), rt.at(M, "shinR", rig.KNEE[-1])
    assert kr[2] > 0.3 and kr[0] < 0 and abs(kl[2]) < 1e-3 and kl[0] > 0


def test_spine_joints_compose_into_the_chest_and_the_neck_passes_its_turn_to_the_head():
    rots, _, rep, _ = one({"Spine1": RY(8.0), "Spine2": RY(10.0), "Chest": RY(12.0), "Neck1": RY(20.0), "Head": RY(20.0)})
    assert np.allclose(rig.joint_angles("chest", rots["chest"]), (0, 30, 0), atol=1e-3)
    # our neck does not turn: it is clamped (and listed), and the head makes the whole turn up
    assert clip_mod.geodesic_deg(rots["neck"], np.eye(3)) < 1e-3 and abs(rep["clamps"]["neck"]["max"] - 20.0) < 1e-2
    assert np.allclose(rig.joint_angles("head", rots["head"]), (0, 40, 0), atol=1e-3)
    M = rt.fk(rots)
    assert clip_mod.geodesic_deg(M[SKEL.index["head"]][:, :3], RY(70.0)) < 1e-3


# ---------------------------------------------------------------- the room, the scale
def test_place_frame_zero_faces_forward_and_later_steps_are_kept():
    turn = RY(90.0)  # he stands in the room facing its +x
    frames = [dict(place=(turn, np.array([1.0, 0.0, 2.0]))), dict(place=(turn, np.array([1.3, 0.0, 2.0]))),
              dict(place=(RY(120.0), np.array([1.3, 0.0, 2.0])))]
    c, _ = ip.retarget(source(frames), log=quiet)
    k = c.meta["scale"]
    assert np.isclose(k, (rig.HIP[1][1] - rig.GROUND) / 0.92)
    assert clip_mod.geodesic_deg(c.body_rots(0)["pelvis"], np.eye(3)) < 1e-4 and np.abs(c.root[0, [0, 2]]).max() < 1e-6
    assert np.allclose(c.root[1, [0, 2]], (0, 0.3 * k), atol=1e-5)  # a step along the room's +x is a step FORWARD for him
    assert np.allclose(rig.joint_angles("pelvis", c.body_rots(2)["pelvis"]), (0, 30, 0), atol=1e-3)


# ---------------------------------------------------------------- feet
def _crouch(thigh, shin, hips_xz=(0.0, 0.0)):
    """A source pose with both soles flat whose LEFT ball of the foot is at the same spot whatever the bend."""
    rot = {}
    for side in ("Left", "Right"):
        rot.update({side + "Leg": RX(-thigh), side + "Shin": RX(shin), side + "Foot": RX(thigh - shin)})
    s = source([dict(rot=rot)])
    toe = s.fk(0)[1][s.index["LeftToeBase"]]
    return dict(rot=rot, root=(hips_xz[0], 0.03 - toe[1], 0.13 - toe[2] + hips_xz[1]))


def test_stretch_only_moves_the_pelvis():
    low = _crouch(30.0, 48.0)
    a = ip.retarget(source([dict(low, stretch=1.0)]), log=quiet)[0]
    b = ip.retarget(source([dict(low, stretch=1.04)]), log=quiet)[0]
    n = ip.retarget(source([dict(low, stretch=1.04)]), ip.Params(stretch="none"), log=quiet)[0]
    k = a.meta["scale"]
    assert np.isclose(b.root[0, 1] - a.root[0, 1], k * 0.04 * (0.95 + low["root"][1]), atol=1e-5)
    assert np.allclose(n.root[0], a.root[0], atol=1e-6)
    for c in (a, b):  # the feet stay where they are, on the ground
        M = rt.fk(c.body_rots(0), c.root[0])
        assert abs(rt.at(M, "footL", rig.TOE[1])[1] - rig.TOE[1][1]) < 1e-4


def test_feet_land_on_the_sources_spots_and_do_not_slide_or_sink():
    # (ankles bent 15..17 degrees: inside our ankle's 20, so the soles can stay flat)
    frames = [_crouch(15.0, 30.0), _crouch(25.0, 42.0), _crouch(35.0, 52.0)]
    src = source(frames)
    c, rep = ip.retarget(src, log=quiet)
    k = c.meta["scale"]
    balls = []
    for t in range(len(c)):
        M = rt.fk(c.body_rots(t), c.root[t])
        toe = src.fk(t)[1][src.index["LeftToeBase"]]
        ball = rt.at(M, "footL", rig.TOE[1])
        assert np.allclose(ball, (k * toe[0], rig.TOE[1][1], k * toe[2]), atol=2e-4)  # on the scaled spot, hinge height
        for q in ip._sole_points(1) + [np.array([rig.TOE_TIP[1][0], rig.GROUND, rig.TOE_TIP[1][2]])]:
            bone = "toeL" if q[2] > rig.TOE[1][2] + 1e-6 else "footL"
            assert abs(rt.at(M, bone, q)[1] - rig.GROUND) < 3e-4  # flat on the ground: neither in it nor off it
        assert rig.joint_angles("shinL", c.body_rots(t)["shinL"])[0] > 15.0  # the knee bends, forwards
        assert rt.at(M, "shinL", rig.KNEE[1])[2] > rt.at(M, "thighL", rig.HIP[1])[2]
        balls.append(ball)
    assert np.ptp(np.array(balls), axis=0).max() < 3e-4  # the pelvis sinks; the ball of the foot stays put
    assert c.root[2, 1] < c.root[0, 1] - 0.05 and rep["clamps"] == {}
    assert c.contact[:, 0].min() == 1.0 and rep["feet"]["anchor_miss_max"] < 2e-4
    assert rt.foot_slip(c)["slide_contact_max"] < 6e-4 and rt.foot_slip(c)["sink_max"] < 3e-4
    res = ip.measure(src, c)
    assert res["feet_source"]["slide_contact_max"] < 1e-6 and res["feet"]["planted_frames"] == 6


def test_a_raised_heel_turns_the_foot_on_its_ball_and_keeps_the_toes_flat():
    # heel up 40 degrees about the ball of the foot, the toes un-bent only 80 % of that (as the catalogue does)
    f = _crouch(30.0, 60.0)
    lift = TPOSE["LeftFoot"] - TPOSE["LeftToeBase"]
    for side in ("Left", "Right"):
        f["rot"][side + "Foot"] = RX(30.0 - 60.0) @ RX(40.0)
        f["rot"][side + "ToeBase"] = RX(-32.0)
    src = source([f])
    toe = src.fk(0)[1][src.index["LeftToeBase"]]
    f["root"] = tuple(np.array(f["root"]) + (0.0, 0.03 - toe[1], 0.0))
    c, rep = ip.retarget(source([f]), log=quiet)
    M = rt.fk(c.body_rots(0), c.root[0])
    assert abs(rt.at(M, "footL", rig.TOE[1])[1] - rig.TOE[1][1]) < 2e-4  # the hinge stays down
    assert rt.at(M, "footL", rig.HEEL[1])[1] > rig.GROUND + 0.05  # the heel is up
    tip = rt.at(M, "toeL", [rig.TOE_TIP[1][0], rig.GROUND, rig.TOE_TIP[1][2]])
    assert -1e-5 < tip[1] - rig.GROUND < 2e-3  # the toes lie on the ground, not in it
    assert rep["feet"]["lift_max"] < 1e-6 and (RX(40.0) @ lift)[1] > lift[1]


# ---------------------------------------------------------------- limits are applied and written down
def test_a_joint_outside_its_limits_is_clamped_and_reported():
    back = 30.0  # the elbow bent the wrong way
    for mode in ("clamp", "report"):
        rots, _, rep, _ = one({"LeftForeArm": RY(back)}, ip.Params(limits=mode))
        row = rep["clamps"]["forearmL"]
        assert abs(row["max"] - back) < 0.05 and row["frames"] == 1 and row["share"] == 1.0 and row["clamped"] == (mode == "clamp")
        pitch = rig.joint_angles("forearmL", rots["forearmL"])[0]
        assert abs(pitch - (0.0 if mode == "clamp" else back)) < 1e-2
        assert bool(rig.check_limits(rots)) == (mode == "report")
        # the report names the angle that was out: the elbow's pitch, 30 degrees past its 0
        assert row["worst_axis"][0] == "pitch" and abs(row["worst_axis"][1] - back) < 0.05 and row["worst_axis"][3] == 0.0
        assert set(row["axes"]) == {"pitch"} and abs(row["axes"]["pitch"] - back) < 0.05
    assert "forearmR" not in rep["clamps"]
    # a neck turned about its own axis (it has no yaw): named as yaw, and the head takes the turn up
    _, _, rep, _ = one({"Neck1": RY(15.0)})
    assert rep["clamps"]["neck"]["axes"] == {"yaw": 15.0} and "head" not in rep["clamps"]


def test_a_shoulder_that_cannot_twist_keeps_the_arm_where_it_is():
    """Upper arm forward, turned about itself further than the shoulder allows, elbow bent: the upper arm is
    turned back about its own axis, the forearm takes the twist, and elbow, wrist and hand stay put."""
    # (built from OUR joint angles: 57 degrees forward, turned 101 round - the shoulder's turn ends at 70)
    asked = rig.local_rot("upperarmL", pitch=-57.0, yaw=101.0, roll=2.0)
    pose = {"LeftArm": asked @ RZ(90.0 - rig.A_POSE).T, "LeftForeArm": RY(-99.0)}
    free, _, _, _ = one(pose, ip.Params(limits="report"))
    kept, _, rep, _ = one(pose)
    near, _, rep2, _ = one(pose, ip.Params(keep_axis=False))
    assert rig.clamp_rot("upperarmL", free["upperarmL"])[2] > 20.0  # (the pose asks for more than the joint has)
    assert not rig.check_limits(kept) and not rig.check_limits(near)
    assert rep["twist_passed_on"]["upperarmL"]["max"] > 20.0 and "upperarmL" not in rep["clamps"]
    Mf, Mk, Mn = rt.fk(free), rt.fk(kept), rt.fk(near)
    for bone, p in (("forearmL", rig.ELBOW[1]), ("handL", rig.WRIST[1]), ("handL", rig.FINGERTIP[1])):
        assert np.linalg.norm(rt.at(Mk, bone, p) - rt.at(Mf, bone, p)) < 1e-3, bone
    assert clip_mod.geodesic_deg(Mk[SKEL.index["handL"]][:, :3], Mf[SKEL.index["handL"]][:, :3]) < 0.1
    # the plain nearest-rotation clamp moves the hand instead (what keep_axis is there to avoid)
    assert np.linalg.norm(rt.at(Mn, "handL", rig.WRIST[1]) - rt.at(Mf, "handL", rig.WRIST[1])) > 0.05
    assert "upperarmL" in rep2["clamps"]


def test_clear_trunk_swings_a_tucked_elbow_out_and_keeps_the_wrist():
    """A rear guard whose elbow the source tucks onto its spine line (a stick trunk): on our mannequin it is in
    the ribs.  --clear-trunk turns the arm about the shoulder-wrist line until it is out; the wrist stays."""
    elbow = np.array([-0.02, 1.37, 0.06])  # (source metres: 2 cm off the midline, 6 cm in front of the spine)
    up = rt.shortest_arc(TPOSE["RightForeArm"] - TPOSE["RightArm"], elbow - TPOSE["RightArm"])
    pose = {"RightArm": up, "RightForeArm": RY(130.0)}  # forearm folded up, the fist by the chin
    plain, _, rep0, c0 = one(pose, ip.Params(clear_elbows=False))
    clear, _, rep1, c1 = one(pose, ip.Params(clear_trunk=True, clear_elbows=False))
    M0, M1 = rt.fk(plain, c0.root[0]), rt.fk(clear, c1.root[0])
    assert ip.trunk_depth(M0, *ip._arm_points(M0, "R")) > 0.02  # (as the source has it: deep in the chest)
    assert ip.trunk_depth(M1, *ip._arm_points(M1, "R")) <= 0.0
    assert np.linalg.norm(rt.at(M1, "handR", rig.WRIST[-1]) - rt.at(M0, "handR", rig.WRIST[-1])) < 1e-3
    assert np.linalg.norm(rt.at(M1, "forearmR", rig.ELBOW[-1]) - rt.at(M0, "forearmR", rig.ELBOW[-1])) > 0.03
    row = rep1["arms_swung_out"]["R"]
    assert row["frames"] == 1 and 0.0 < row["max"] < 150.0 and "L" not in rep1["arms_swung_out"]
    assert rep0["arms_swung_out"] == {}


def tucked_guard():
    """A rear guard whose elbow the source carries in front of its spine line, the fist held out before the
    chin (source joints; on our mannequin the upper arm is then in the chest)."""
    d0 = TPOSE["RightForeArm"] - TPOSE["RightArm"]
    up = rt.shortest_arc(d0, np.array([-0.06, 1.20, 0.14]) - TPOSE["RightArm"]) @ rig.rot_axis(d0, 40.0)
    return {"RightArm": up, "RightForeArm": RY(95.0)}


def test_an_elbow_inside_the_trunk_is_swung_out_by_default_and_the_hand_stays():
    """The default import: the elbow comes out of the chest about the shoulder-wrist line; the wrist is where
    the source has it, the hand faces the way the source's does, and the report says what was done.
    ``clear_elbows=False`` is the motion as it is."""
    import arms
    pose = tucked_guard()
    asis, root0, rep0, c0 = one(pose, ip.Params(clear_elbows=False))
    out, root1, rep1, c1 = one(pose)
    assert rep0["elbows"] is None and arms.arm_depth(asis, "R", root0) > 0.03  # as the source has it: in the chest
    assert arms.arm_depth(out, "R", root1) <= -arms.CLEAR_MARGIN + 1e-5 and not rig.check_limits(out)
    M0, M1 = rt.fk(asis, root0), rt.fk(out, root1)
    assert np.linalg.norm(rt.at(M1, "handR", rig.WRIST[-1]) - rt.at(M0, "handR", rig.WRIST[-1])) < 1e-3  # wrist kept
    assert clip_mod.geodesic_deg(M1[SKEL.index["handR"]][:, :3], M0[SKEL.index["handR"]][:, :3]) < 1.0  # hand kept
    assert np.linalg.norm(rt.at(M1, "forearmR", rig.ELBOW[-1]) - rt.at(M0, "forearmR", rig.ELBOW[-1])) > 0.05  # elbow moved
    for b in ("upperarmL", "forearmL", "handL", "chest", "thighL", "footR"):  # nothing else did
        assert clip_mod.geodesic_deg(out[b], asis[b]) < 1e-4, b
    v = rep1["elbows"]["R"]
    assert v["frames"] == 1 and v["needed_frames"] == 1 and v["inside_before"] == 1 and v["inside_after"] == 0
    assert 20.0 < v["swivel_max"] < 90.0 and v["depth_before"] > 0.03 and v["depth_after"] <= -arms.CLEAR_MARGIN + 1e-4
    assert v["wrist_moved_max"] < 1e-3 and v["hand_turned_max"] < 1.0 and v["not_cleared"] == []
    assert rep1["elbows"]["L"]["frames"] == 0 and rep1["params"]["clear_elbows"] is True
    src = source([dict(rot=pose)])
    res = ip.measure(src, c1)  # against the source: the hand is still the source's hand, the upper arm is not
    assert res["orientation"]["handR"]["max"] < 1.0 and res["orientation"]["upperarmR"]["max"] > 15.0
    # "report" mode leaves every joint as asked: no clearance there either
    _, _, rep2, _ = one(pose, ip.Params(limits="report"))
    assert rep2["elbows"] is None


def test_import_closes_the_fists_with_the_punch_events():
    """The clip of a jab holds a fist at the contact event and open hands in guard; ``grip=False`` and a
    source without a punch leave the hands open; the clip stores the finger bones."""
    guard = {"LeftArm": RY(-60.0) @ RZ(-50.0), "LeftForeArm": RY(-120.0)}
    out = {"LeftArm": RY(-85.0), "LeftForeArm": RY(-10.0)}
    mid = {"LeftArm": RY(-72.0) @ RZ(-25.0), "LeftForeArm": RY(-65.0)}
    frames = [dict(rot=guard)] * 12 + [dict(rot=mid)] + [dict(rot=out)] * 4 + [dict(rot=mid)] * 2 + [dict(rot=guard)] * 16
    events = [dict(t=10 / 60, type="punch", name="jab", who=0), dict(t=13 / 60, type="block", name="jab", who=0)]
    src = source(frames, events=events)  # (frame i is shown at (i + 1) / fps: pressed on frame 9, lands on frame 12)
    c, rep = ip.retarget(src, log=quiet)
    assert set(rig.HAND_BONES) <= set(c.bones)
    grip = np.array([[rig.grip_of(c.body_rots(t), side) for side in "LR"] for t in range(len(c))])
    row = rep["grip"]["L"]["punches"][0]
    assert row["by"] == "motion+event" and row["contact_frame"] == 12 and row["full_frame"] == 12 and row["press_frame"] == 9
    assert abs(grip[12, 0] - 1.0) < 1e-5 and abs(grip[16, 0] - 1.0) < 1e-5  # a fist at the contact and at full reach
    assert grip[:8, 0].max() < 1e-6 and grip[-8:, 0].max() < 1e-6 and 0.01 < grip[11, 0] < 0.99  # open in guard, closing between
    assert np.abs(grip[:, 1]).max() < 1e-6 and rep["grip"]["R"]["punches"] == []  # the other hand never closes
    assert not any(rig.check_limits(c.body_rots(t), tol=0.06) for t in (0, 11, 13, 16, 30))
    c2, rep2 = ip.retarget(src, ip.Params(grip=False), log=quiet)
    assert rep2["grip"] is None and all(abs(rig.grip_of(c2.body_rots(t), "L")) < 1e-6 for t in range(len(c2)))
    c3, rep3 = ip.retarget(source([dict(rot=guard)] * 20), log=quiet)
    assert rep3["grip"]["L"]["punches"] == [] and abs(rig.grip_of(c3.body_rots(10), "L")) < 1e-6
    out_text = []
    ip.print_report(rep, ip.measure(src, c), log=out_text.append)  # the text report names both steps
    text = "\n".join(out_text)
    assert "elbows out of the trunk" in text and "hand L: jab (motion+event)" in text and "fist complete at" in text


# ---------------------------------------------------------------- measuring, files
def test_measure_finds_no_error_in_a_pose_inside_the_limits_and_times_a_punch():
    guard = {"LeftArm": RY(-60.0) @ RZ(-50.0), "LeftForeArm": RY(-120.0)}
    out = {"LeftArm": RY(-85.0), "LeftForeArm": RY(-10.0)}
    src = source([dict(rot=guard)] * 3 + [dict(rot=out)] * 3 + [dict(rot=guard)] * 2,
                 events=[dict(t=4 / 60, type="block", name="jab", who=0)])
    c, rep = ip.retarget(src, log=quiet)
    res = ip.measure(src, c)
    for b in ("upperarmL", "forearmL", "handL", "chest", "head"):
        assert res["orientation"][b]["max"] < 1e-3, b
    assert res["axis"]["upperarmL"]["max"] < 1e-3 and res["axis"]["forearmL"]["max"] < 1e-3
    for who in ("source", "clip"):
        assert res["punches"]["L"][who]["strike_frame"] == 3 and res["punches"]["L"][who]["longest_frame"] == 3
    assert res["holds"]["source"] == res["holds"]["clip"] == [[0, 2], [3, 5], [6, 7]]
    assert rep["events"][0]["name"] == "jab"


def test_file_round_trip(tmp_path):
    rows = lambda R: [float(v) for v in np.asarray(R).ravel()]  # noqa: E731
    fighter = dict(rot={"LeftForeArm": rows(RY(-45.0)), "Head": None}, root=[0.0, -0.02, 0.0], stretch=1.0,
                   place=dict(R=rows(RY(90.0)), p=[0.5, 0.0, 0.0]))
    other = dict(rot={}, root=[0, 0, 0])
    doc = dict(id="demo", dt=1 / 30, names=NAMES, parent=PARENT, tpose={k: list(v) for k, v in TPOSE.items()},
               frames=[dict(t=0.0, f=[fighter, other])] * 2,
               events=[dict(t=0.03, type="punch", who=0, name="jab"), dict(t=0.03, type="cover", who=1)])
    path = tmp_path / "pose.json"
    path.write_text(json.dumps(doc))
    src = ip.load_source(str(path))
    assert len(src) == 2 and src.fps == 30.0 and [e["type"] for e in src.events] == ["punch"]
    assert np.allclose(src.rot[0, NAMES.index("LeftForeArm")], RY(-45.0)) and np.allclose(src.rot[0, NAMES.index("Head")], np.eye(3))
    assert np.allclose(ip.load_source(str(path), who=1).rot, np.eye(3))
    c, rep = ip.retarget(src, log=quiet)
    c.save(str(tmp_path / "clip.npz"))
    back = Clip.load(str(tmp_path / "clip.npz"))
    assert back.fps == 30.0 and len(back) == 2 and back.meta["kind"] == "import" and back.meta["source"]["id"] == "demo"
    mats, root = back.pose(0)
    assert mats.shape == (len(SKEL), 3, 4) and np.isfinite(mats).all()
    assert np.allclose(rig.joint_angles("forearmL", back.body_rots(0)["forearmL"]), (-45, 0, 0), atol=1e-2)
    json.dumps(rep, default=clip_mod._jsonable)  # the report is plain data


# ---------------------------------------------------------------- footwork
def test_step_report_reads_the_same_footwork_from_source_and_clip():
    down = _crouch(20.0, 36.0)
    up = dict(rot=dict(down["rot"], LeftLeg=RX(-45.0), LeftShin=RX(70.0)), root=down["root"])  # his left foot off the ground
    ahead = (np.eye(3), np.array([0.0, 0.0, 0.05]))  # ... and the whole man 5 cm further on when it comes down
    frames = [down] * 3 + [up] * 3 + [dict(down, place=ahead)] * 3
    src = source(frames)
    c, _ = ip.retarget(src, log=quiet)
    k = c.meta["scale"]
    st = ip.measure(src, c)["steps"]
    # (a foot counts as down only while it is still on BOTH sides of a frame: the frames next to a jump are not)
    for who in ("source", "clip"):
        assert st[who]["L"] == dict(land=[7], lift=[2], planted_frames=4)
        assert st[who]["R"] == dict(land=[7], lift=[5], planted_frames=7)  # (carried on by the place, not lifted)
        assert st[who]["order"] == ["L lift 2", "R lift 5", "L land 7", "R land 7"]
        assert abs(st["travel"][who]["end"] - 0.05 * k) < 1e-4
    assert [v["frames"] for v in st["steps"] if v["foot"] == "L"] == [[0, 1], [7, 8]]
    assert all(v["clip"]["path"] < 3e-4 and v["source"]["path"] < 1e-9 for v in st["steps"])
    assert st["travel"]["source_place_m"]["end"] == 0.05
    landed = [v for v in st["steps"] if v["foot"] == "L"]
    assert abs((landed[1]["clip"]["ahead"] - landed[0]["clip"]["ahead"]) - 0.05 * k) < 3e-4
    assert st["apart"]["clip"][0] > -1e-3 and abs(st["apart"]["clip"][0] - st["apart"]["source"][0]) < 3e-4
    # played again, the man jumps those 5 cm back: both planted feet and the pelvis, nothing turns
    for who in ("source", "clip"):
        w = st["wrap"][who]
        assert abs(w["pelvis"] - 0.05 * k) < 3e-4
        for side in "LR":
            assert abs(w["feet"][side]["along"] - 0.05 * k) < 3e-4 and abs(w["feet"][side]["up"]) < 3e-4
            assert w["feet"][side]["planted_both"]
    assert st["wrap"]["clip"]["joint_turn_max"][1] < 1e-2

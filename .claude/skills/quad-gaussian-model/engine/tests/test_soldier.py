"""Fast checks for the soldier example: proportions, rigid binding, joints that cannot open,
planted feet, loop seams (on the bare mannequin), then the costume: materials, clashes, training path.
(CPU, well under a minute; coarse sculpts, a few thousand untrained splats.)"""
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "template"))
import body  # noqa: E402
import costume  # noqa: E402
import motion  # noqa: E402
import rig  # noqa: E402
import soldier  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402

SKEL = rig.SKELETON
quiet = lambda *a: None  # noqa: E731


@pytest.fixture(scope="module")
def sc():
    """The bare mannequin (stage 1)."""
    return soldier.sculpt(voxel=0.014, n_random=12, outfit="none", log=quiet)


@pytest.fixture(scope="module")
def splats(sc):
    model = SplatModel.from_mesh(sc.parts(True), 6000, seed=0)
    return model, soldier.splat_bones(sc, model)


@pytest.fixture(scope="module")
def dressed():
    """The soldier in his kit (stage 2), nothing culled."""
    return soldier.sculpt(voxel=0.014, cull=False, outfit="soldier", log=quiet)


@pytest.fixture(autouse=True)
def bare_by_default():
    """Every test starts on the bare mannequin; the costume tests put the outfit on themselves."""
    body.wear(None)
    yield
    body.wear(None)


def some_poses(n_random=20):
    poses = {k: SKEL.world_mats(r) for k, r in soldier.named_poses().items()}
    poses.update({f"limit{i}": SKEL.world_mats(r) for i, r in enumerate(rig.limit_poses(n_random, seed=3, corners=False))})
    poses.update({f"walk{k}": motion.walk_pose(SKEL, k / 12)[0] for k in range(12)})
    poses.update({f"turn{k}": motion.turn_pose(SKEL, k / 8, bend=10.0)[0] for k in range(8)})
    return poses


def test_proportions_match_the_table(sc):
    """Every Drillis & Contini ratio is met within 3 % on the sculpted meshes."""
    for name, target, measured, dev in soldier.proportion_table(sc):
        assert abs(dev) <= 3.0, (name, target, measured)


def test_skeleton_layout():
    names = [b.name for b in SKEL.bones]
    for b in SKEL.bones:  # parents first, as Skeleton.world_mats needs
        assert b.parent is None or names.index(b.parent) < names.index(b.name)
    assert names == rig.GEOMETRY_BONES + rig.HELPER_BONES + rig.HAND_BONES  # new bones are appended, never inserted
    assert body.BONES == rig.GEOMETRY_BONES + rig.HAND_BONES  # the mannequin: the body and its mitten hands
    assert rig.HELPER_BONES == list(rig.GORES) + ["cape", "capeTip", "plume", "plumeTip"] and len(rig.GORES) == 8
    assert rig.HAND_BONES == ["fingersL", "thumbL", "fingersR", "thumbR"]
    assert len(rig.GEOMETRY_BONES) == 20 and len(SKEL) == 36
    for j in rig.JOINTS:  # the bead is never smaller than the socket it sits in
        assert j.bead >= j.shared > 0
        assert np.allclose(SKEL.bones[SKEL.index[j.bone]].head, j.pos, atol=1e-6)


def test_joint_angles_round_trip_and_limits():
    rng = np.random.default_rng(0)
    for bone in ("chest", "head", "upperarmL", "upperarmR", "forearmR", "handL", "thighR", "footL", "fingersL",
                 "fingersR", "thumbL", "thumbR"):
        lim = rig.limits(bone)
        a = [rng.uniform(lo, hi) for lo, hi in lim]
        back = rig.joint_angles(bone, rig.local_rot(bone, *a))
        assert np.allclose(a, back, atol=1e-6), (bone, a, back)
    assert rig.limits("thighR")[2] == (-45.0, 25.0)  # mirrored: the right leg spreads towards -x
    assert rig.check_limits({"chest": rig.local_rot("chest", yaw=41)})
    assert not rig.check_limits({"chest": rig.local_rot("chest", yaw=40), "head": rig.local_rot("head", yaw=-70)})
    assert np.allclose(rig.rest_angles("upperarmL"), (0, 0, rig.A_POSE), atol=1e-6)
    for k in range(24):  # the two motions stay inside the limits
        assert not rig.check_limits(motion.walk_rots(SKEL, k / 24)[0])
        assert not rig.check_limits(motion.turn_rots(SKEL, k / 24, bend=10.0)[0])


def test_binding_is_one_hot_and_rigid(splats):
    model, bones = splats
    rep = soldier.rigid_report(model, bones, list(some_poses(6).values()))
    assert rep["one_hot"]
    assert rep["max_distance_change"] < 1e-5  # two splats of one bone never move apart
    assert rep["max_scale_change"] < 1e-5  # ... and no splat is stretched
    assert set(np.unique(bones)) == {SKEL.index[b] for b in body.BONES}  # bare: helper bones carry nothing


def test_joints_cannot_open():
    """SDF-level gap check: at every joint both bones contain the shared ball - in the rest pose and,
    moved by the pose, in world space - parent and child agree on where the joint is, and solid
    material runs through the joint in the posed union."""
    rep = soldier.sdf_gap_report(some_poses())
    assert rep["shared_ball"] < 0
    assert rep["pivot"] < 1e-5
    assert rep["posed_ball"] < 0
    assert rep["core"] < -0.3, rep


def test_turntable_outline_does_not_change_when_turning():
    rep = soldier.turntable_report(steps=5)
    for joint in ("waist", "head"):
        assert rep[joint + "_turning"] < 1e-4  # what the turning bone sweeps over is round about the yaw axis
    assert rep["waist_static"] < 1e-4  # the chest never shows past the waist disc (the jaw does overhang the neck)
    assert abs(rep["waist_radius"] - rig.TURNTABLE["waist"]["radius"] * rig.H) < 2e-3


def test_planted_feet_do_not_slide(sc):
    rep = soldier.foot_report(sc, steps=200)
    assert rep["stance_slide"] < 1e-4  # world position of the planted point
    assert rep["stance_heading_deg"] < 1e-4  # the planted foot never turns
    assert rep["max_reach"] < 1.0  # the IK never runs out of leg (that would drag the foot)
    assert rep["limit_violations"] == 0
    assert -0.004 < rep["ground_stance_min"] and rep["ground_stance_max"] < 0.004
    # the swinging foot clears the ground (but for its toe tips at toe-off: a foot that leaves the floor pitched
    # past what its toes bend dips them up to ~6 mm for a frame or two - a fifth of an art pixel)
    assert rep["ground_swing_min"] > -0.007
    # it is set down still coming down (as a heel strikes), barely moving forward; it lifts off turning on its ball
    assert rep["landing_speed_horizontal"] < 0.25 * rep["body_speed"] and rep["landing_speed"] < 0.6 * rep["body_speed"]
    assert rep["mid_swing_speed"] > rep["body_speed"]


def test_loops_are_seamless():
    rep = soldier.loop_report(lambda ph: motion.turn_pose(SKEL, ph)[0], steps=96)
    assert rep["seam_position"] < 1e-5  # pose(1) == pose(0)
    assert rep["kink"] < 0.4  # velocity is continuous everywhere (0.25 = smooth, 1 = a jump in velocity) ...
    assert rep["seam_kink"] < 0.4  # ... and across the seam
    # the walk: a foot is set down and leaves the floor with some speed (heel strike, toe-off), so its velocity may
    # change at once there (a kink ~1-1.5); a jump in POSITION would score ~4 and more
    rep = soldier.loop_report(steps=96)
    assert rep["seam_position"] < 1e-5
    assert rep["kink"] < 1.6 and rep["seam_kink"] < 1.6


def test_walk_travels_one_stride_per_cycle():
    a = motion.walk_pose(SKEL, 0.0, 0.0)[0]
    b = motion.walk_pose(SKEL, 1.0, motion.STRIDE)[0]
    d = b - a
    assert np.abs(d[:, :, :3]).max() < 1e-6
    assert np.allclose(d[:, :, 3], [0, 0, motion.STRIDE], atol=1e-5)


def test_buried_faces_are_never_seen(sc, splats):
    """Culling drops surface, but in fresh poses the culled meshes look exactly like the full ones,
    and the splats cover the posed silhouette about as well as they cover the rest pose."""
    assert 0.02 < 1 - sc.area(True) / sc.area(False) < 0.25
    model, bones = splats
    R = soldier.Renderer(model, bones, app=False)
    poses = {k: SKEL.world_mats(r) for k, r in soldier.named_poses().items()
             if k in ("rest", "knee_bent", "hip_flex", "elbow_bent", "waist_bend", "neck_nod")}
    poses["walk"] = motion.walk_pose(SKEL, 0.05)[0]
    rep = soldier.gap_report(R, sc, poses, views=((35, 8),), px=96)
    rest = rep["rest"]["missing"] / rep["rest"]["silhouette"]
    for name, g in rep.items():
        assert g["culled"] == 0, name
        assert g["missing"] / g["silhouette"] <= rest + 0.01, (name, g, rest)


def test_helper_bones_are_driven():
    rots, _ = motion.walk_rots(SKEL, 0.0)  # left leg forward
    assert set(rig.HELPER_BONES) <= set(rots)
    f, _ = motion.thigh_swing(rots["thighL"], 1)
    assert f > 10
    assert rig.euler_angles(rots["skirtFL"])[0] < -5  # the gore in front of the left thigh is pushed forward by it
    still = motion.stand_rots()[0]
    motion.drive_helpers(still)
    assert all(np.allclose(still[h], np.eye(3), atol=1e-6) for h in rig.HELPER_BONES)  # at rest nothing moves


def test_posed_union_matches_rigid_motion():
    """posed_union_sdf at a posed surface point == 0 where the rest SDF is 0."""
    mats = motion.walk_pose(SKEL, 0.3)[0]
    b = "shinL"
    p = np.asarray(rig.KNEE[1] + [rig.BEAD["knee"] * rig.H, 0, 0], np.float32)[None]  # on the knee bead
    assert abs(float(body.bone_sdf(b, p)[0])) < 1e-5
    q = body.apply(mats[SKEL.index[b]].astype(np.float64), p.astype(np.float64))
    assert abs(float(body.posed_bone_sdf(b, q, mats)[0])) < 1e-4
    assert torch.get_num_threads() >= 1


# ---------------------------------------------------------------- stage 2: the costume
def test_bake_with_training_keeps_bone_labels(sc, tmp_path):
    """The ``--iters > 0`` path: a few training steps, then the splat -> bone labels still line up,
    survive save / load, and the splats the rest pose hides were left as initialised."""
    model = soldier.bake(sc, n_splats=2500, res=48, views=3, iters=2, log=quiet)
    bones = soldier.splat_bones(sc, model)
    assert isinstance(model.part, torch.Tensor) and len(bones) == model.n == model.patch.shape[0]
    assert set(np.unique(bones)) == {SKEL.index[b] for b in body.BONES}
    init = SplatModel.from_mesh(sc.parts(True), 2500, seed=0)
    hidden = body.inside_other(init.means.detach().numpy(), soldier.splat_bones(sc, init), SKEL.world_mats({}), 0.0)
    assert hidden.any()
    d = torch.cdist(init.means[torch.as_tensor(hidden)].detach(), model.means.detach(),
                    compute_mode="donot_use_mm_for_euclid_dist").min(1).values
    assert float(d.max()) < 1e-6  # every hidden splat is still exactly where the mesh put it
    path = tmp_path / "m.pt"
    torch.save(model.state_dict(), path)
    back = SplatModel.load(str(path))
    assert torch.equal(back.part, model.part)
    rep = soldier.rigid_report(back, soldier.splat_bones(sc, back), [motion.walk_pose(SKEL, 0.3)[0]])
    assert rep["one_hot"] and rep["max_distance_change"] < 1e-5


def test_costume_dresses_every_bone_and_leaves_the_body_alone(sc, dressed):
    assert dressed.outfit == "soldier" and dressed.names == body.BONES + rig.HELPER_BONES
    assert body.outfit() is None  # sculpting did not leave the outfit on
    with dressed.worn():
        assert body.bones() == dressed.names
        p = np.asarray(rig.KNEE[1] + [rig.BEAD["knee"] * rig.H, 0, 0], np.float32)[None]  # on the knee bead
        assert abs(float(body.bone_sdf("shinL", p)[0])) < 1e-5  # hose is paint only: same solid
        assert not rig.check_limits(motion.walk_rots(SKEL, 0.2)[0])
        assert rig.limits("head")[1] == (-70.0, 70.0) and rig.limits("head")[0][0] > -20  # helmet: stiffer neck
        few = {k: v for k, v in some_poses(0).items() if k in ("rest", "knee_bent", "shoulder_up", "waist_bend", "walk3", "turn2")}
        rep = soldier.sdf_gap_report(few)  # the joints stay closed under the clothes
        assert rep["shared_ball"] < 0 and rep["posed_ball"] < 0 and rep["pivot"] < 1e-5
        assert soldier.turntable_report(steps=3)["waist_static"] < 1e-4  # nothing of the chest shows past the belt
    assert rig.limits("head")[0] == (-20.0, 25.0)  # ... and the bare limits are back
    model = SplatModel.from_mesh(dressed.parts(True), 8000, seed=0)
    bones = soldier.splat_bones(dressed, model)
    assert len(np.unique(bones)) == 36
    rep = soldier.rigid_report(model, bones, [motion.walk_pose(SKEL, 0.3)[0], motion.turn_pose(SKEL, 0.2)[0]])
    assert rep["one_hot"] and rep["max_distance_change"] < 1e-5


def test_costume_materials(dressed):
    """Steel is metallic, cloth is not; lozenges, parti-coloured hose and the rig debug paint are there;
    per-vertex roughness / metallic reach the splats through the material atlas."""
    i = {n: k for k, n in enumerate(dressed.names)}
    for bone in ("head", "neck", "clavL", "upperarmR"):
        assert dressed.metal[i[bone]].max() > 0.4, bone  # sallet, bevor, pauldron, lames
    for bone in ("skirtF", "skirtBL", "cape", "thighL", "plume"):  # (the chest is cloth too, but carries the gold brooch)
        assert dressed.metal[i[bone]].max() < 0.01 and dressed.rough[i[bone]].min() > 0.25, bone
    red, white = np.array(costume.MAT["red"][0]), np.array(costume.MAT["white"][0])
    for bone in ("chest", "skirtF", "skirtB"):
        c = dressed.colors[i[bone]]
        assert (np.abs(c - red).max(1) < 0.02).mean() > 0.15 and (np.abs(c - white).max(1) < 0.02).mean() > 0.03, bone
    assert np.abs(dressed.colors[i["thighL"]] - red).max() < 0.02  # his left leg red ...
    assert np.abs(dressed.colors[i["shinR"]] - np.array(costume.MAT["cream"][0])).max() < 0.02  # ... his right cream
    model = SplatModel.from_mesh(dressed.parts(False), 6000, seed=0)
    mat = model.material().detach().numpy()
    bones = soldier.splat_bones(dressed, model)
    steel = mat[(bones == SKEL.index["head"]) & (mat[:, 4] > 0.4)]
    assert len(steel) > 20 and abs(np.median(steel[:, 4]) - costume.MAT["steel"][2]) < 0.03
    assert abs(np.median(steel[:, 3]) - costume.MAT["steel"][1]) < 0.05
    cloth = mat[bones == SKEL.index["cape"]]
    assert cloth[:, 4].max() < 0.02 and abs(np.median(cloth[:, 3]) - costume.MAT["yellow"][1]) < 0.03
    with body.wearing(costume):
        alb, rough, metal = body.paint("head", dressed.verts[i["head"]][:500], "rig")
    allowed = np.array(list(body.RIG_COLORS.values()) + [body.RIG_OUTFIT_COLOR], np.float32)
    assert metal.max() == 0 and np.abs(alb[:, None] - allowed[None]).max(2).min(1).max() < 1e-5  # only rig colours


def test_patterns_are_fixed_to_the_cloth():
    """A pattern is a function of the rest position only, so a pose cannot slide it over the cloth."""
    x, y = np.meshgrid(np.linspace(-0.12, 0.12, 60), np.linspace(-0.3, 0.45, 120))
    hit = costume.lozenge(x, y)
    assert 0.08 < hit.mean() < 0.45
    assert hit[:, ::-1].tolist() == hit.tolist()  # mirror-symmetric about the midline
    y0 = costume.LOZ_Y0
    assert costume.lozenge(np.array([0.0]), np.array([y0]))[0] and not costume.lozenge(np.array([costume.LOZ_W / 2]), np.array([y0]))[0]


def test_costume_does_not_clash_while_walking_or_turning(dressed):
    with dressed.worn():
        rep = soldier.clash_report(dressed, walk=8, turn=6, run=6, jump=6)
    for label in ("thighs, knees through the skirt", "hips, skirt, legs through the cape"):
        d = rep[label]  # the body never shows through skirt or cape - walking, turning, sprinting, jumping,
        assert max(d["rest"], d["walk"], d["turn"], d["run"], d["jump"]) < -0.003, (label, d)  # with room to spare
    assert rep["thighs, knees through the skirt"]["big"] < 0  # ... nor with a thigh at 100 deg or the legs spread 30 deg
    d = rep["skirt gore through its neighbour"]  # no gore comes out through the next one (the audit's bug)
    assert max(d["rest"], d["walk"], d["turn"], d["run"], d["jump"], d["big"]) < 0.003, d
    for pair in ("helmet / bevor", "face / bevor, cowl", "helmet, plume / mantle, pauldrons"):
        d = rep[pair]  # the helmet clears everything up to the (helmeted) limits of the neck
        assert max(d["rest"], d["walk"], d["turn"], d["limit"]) < 0.003, (pair, d)
    for pair in ("forearm, hand / skirt, hips", "cape / legs"):
        d = rep[pair]
        assert max(d["rest"], d["walk"], d["turn"], d["run"], d["jump"]) < 0.004, (pair, d)
    d = rep["cape / skirt, hips"]
    assert max(d["rest"], d["walk"], d["turn"]) < 0.004 and max(d["run"], d["jump"]) < 0.012, d
    for pair in ("pauldron / trunk", "bevor / pauldron"):
        d = rep[pair]  # these touch by design at rest; moving must not push them in further
        assert max(d["walk"], d["turn"]) - d["rest"] < 0.004, (pair, d)
    d = rep["puffed sleeve / trunk"]  # the bare arm already sits ~4 mm in the flank; the sleeve stays near that
    assert d["rest"] < 0.010 and max(d["walk"], d["turn"], d["run"], d["jump"]) < 0.020, d


def test_helpers_keep_cloth_off_the_body():
    """The drives of the costume bones, for any pose: a gore swings out only, and only as far as the
    legs under it need; the cape hangs plumb and behind hips and legs; nothing moves at rest."""
    L = rig.local_rot
    swing = lambda rots, g: float(np.degrees(np.arccos(np.clip((np.trace(rots[g]) - 1) / 2, -1, 1))))  # noqa: E731
    still = motion.drive_helpers({})
    assert all(np.array_equal(still[h], np.eye(3)) for h in rig.HELPER_BONES)  # exactly the rest pose
    rots = motion.drive_helpers({"thighL": L("thighL", pitch=-40)})
    assert 12 < swing(rots, "skirtFL") < 45 and swing(rots, "skirtFR") < 2 and swing(rots, "skirtB") == 0
    hinge, out, axis = rig.gore_frame("skirtFL")
    hem = rig.SKIRT["skirtFL"][1] - hinge
    assert (rots["skirtFL"] @ hem) @ out > hem @ out + 0.05 and abs((rots["skirtFL"] @ axis) @ axis - 1) < 1e-9
    rots = motion.drive_helpers({"thighL": L("thighL", pitch=-100), "shinL": L("shinL", pitch=120)})
    assert 75 < swing(rots, "skirtFL") <= motion.GORE_MAX  # a thigh at 100 deg: the gore lies on top of it
    rots = motion.drive_helpers({"thighR": L("thighR", roll=-30)})
    assert swing(rots, "skirtR") > 15 and swing(rots, "skirtL") == 0  # spread: the side gore swings out
    rots = motion.drive_helpers({"chest": L("chest", pitch=25)})
    lean = rig.euler_angles(L("chest", pitch=25) @ rots["cape"])[0]  # cape orientation relative to the pelvis
    assert 5 < lean < 25  # it does not bend forward with the chest: it leans BACK to clear the hips
    rots = motion.drive_helpers({"chest": L("chest", pitch=-10)})
    assert rig.euler_angles(L("chest", pitch=-10) @ rots["cape"])[0] >= -1e-9  # arching back never tips it forward
    rots = motion.drive_helpers({"chest": L("chest", yaw=40)})
    assert abs(rig.euler_angles(L("chest", yaw=40) @ rots["cape"])[1] - 20) < 1  # half the turn: the hips hold it back
    rots = motion.drive_helpers({"thighR": L("thighR", pitch=20), "shinR": L("shinR", pitch=140)})
    assert rig.euler_angles(rots["cape"])[0] > 8  # a heel kicked up behind pushes the cape back


def test_soft_pos_is_zero_below_zero_and_smooth():
    assert all(motion.soft_pos(x, 3.0) == 0.0 for x in (-50.0, -1.0, -1e-9, 0.0))
    assert motion.soft_pos(3.0, 3.0) == 3.0 and motion.soft_pos(40.0, 3.0) == 40.0  # no shortfall once it is clear
    xs = np.linspace(-1, 5, 601)
    f = np.array([motion.soft_pos(x, 3.0) for x in xs])
    slope = np.diff(f) / np.diff(xs)
    assert (slope >= -1e-12).all() and np.abs(np.diff(slope)).max() < 0.02  # monotone, no jump in slope


def test_limits_are_exact_at_gimbal_lock_and_clamp():
    """Arm raised straight out sideways (roll = 90): pitch and yaw are no longer unique.  The limit check
    must find the reading that IS allowed, and clamp_rot must return the nearest allowed rotation."""
    L = rig.local_rot
    for rots in rig.limit_poses(48, 0):  # every pose built from angles inside the limits passes
        assert not rig.check_limits(rots)
    for roll in (89.99, 90.0, 90.01):
        for bone, sgn in (("upperarmL", 1), ("upperarmR", -1)):
            R = L(bone, pitch=-100, yaw=sgn * 30, roll=sgn * roll)
            Rc, ang, excess = rig.clamp_rot(bone, R)
            assert excess < 0.02 and not rig.check_limits({bone: R})
            assert np.abs(L(bone, *ang) - Rc).max() < 1e-9 and rig._geodesic(R, Rc) < 0.02  # round trip
            lim = rig.limits(bone)
            assert all(lo - 1e-9 <= a <= hi + 1e-9 for a, (lo, hi) in zip(ang, lim))
    # outside: the excess is the angle to the nearest allowed rotation, and the clamped pose is inside
    for bone, kw, expect in (("shinL", dict(pitch=-30), 30.0), ("head", dict(yaw=95), 25.0),
                             ("upperarmL", dict(pitch=-100, yaw=30, roll=95), 5.0), ("chest", dict(pitch=40, yaw=10), 15.0)):
        R = L(bone, **kw)
        Rc, ang, excess = rig.clamp_rot(bone, R)
        assert abs(excess - expect) < 0.3 and abs(rig._geodesic(R, Rc) - excess) < 1e-6, (bone, excess)
        assert rig.check_limits({bone: R}) and not rig.check_limits({bone: Rc})
    pose = {"shinL": L("shinL", pitch=150), "thighL": L("thighL", pitch=-50), "pelvis": rig.euler(yaw=200),
            "skirtF": rig.euler(pitch=-170)}
    clamped, moved = rig.clamp_pose(pose)
    assert set(moved) == {"shinL"} and abs(moved["shinL"] - 10.0) < 1e-6 and not rig.check_limits(clamped)
    assert np.array_equal(clamped["pelvis"], pose["pelvis"]) and np.array_equal(clamped["skirtF"], pose["skirtF"])
    rng = np.random.default_rng(1)  # random rotations: clamping always lands inside, and never moves what is inside
    for _ in range(40):
        q = rng.normal(size=4)
        q /= np.linalg.norm(q)
        w, x, y, z = q
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])
        for bone in ("upperarmL", "thighR", "head"):
            Rc, _, excess = rig.clamp_rot(bone, R)
            assert not rig.check_limits({bone: Rc}), bone
            assert rig.clamp_rot(bone, Rc)[2] < 1e-6


def test_big_motions_and_cloth_inertia():
    """Synthetic sprint and tuck jump stay inside the joint limits and loop; with ``prev`` the cloth
    drops back at a limited speed, without it the helpers depend on the pose alone."""
    with body.wearing(costume):
        for fn in (motion.run_rots, motion.jump_rots):
            for k in range(12):
                assert not rig.check_limits(fn(SKEL, k / 12)[0]), (fn.__name__, k)
    for fn in (motion.run_pose, motion.jump_pose):
        assert np.abs(fn(SKEL, 1.0)[0] - fn(SKEL, 0.0)[0]).max() < 1e-5
    L = rig.local_rot
    up = {"thighL": L("thighL", pitch=-80), "shinL": L("shinL", pitch=60)}
    state = {}
    a = motion.drive_helpers(dict(up), prev=state, dt=1 / 24)
    b = motion.drive_helpers({}, prev=state, dt=1 / 24)  # the leg snaps down; the gore follows more slowly
    c = motion.drive_helpers({})
    swing = lambda rots, g: float(np.degrees(np.arccos(np.clip((np.trace(rots[g]) - 1) / 2, -1, 1))))  # noqa: E731
    assert swing(c, "skirtFL") == 0 and swing(a, "skirtFL") > 45
    assert abs((swing(a, "skirtFL") - swing(b, "skirtFL")) - motion.FALL_RATE["gore"] / 24) < 1e-6
    for _ in range(40):
        b = motion.drive_helpers({}, prev=state, dt=1 / 24)
    assert swing(b, "skirtFL") == 0  # ... and comes to rest
    turn = motion.drive_helpers({"chest": L("chest", yaw=20)}, prev={"chest_yaw": 0.0, "head_yaw": 0.0}, dt=1 / 24)
    assert abs(rig.euler_angles(L("chest", yaw=20) @ turn["cape"])[1] - 10) > 1  # the cape trails the turn it measured


# ---------------------------------------------------------------- mitten hands: fingers, thumb, grip
def test_grip_curls_the_mitten_into_a_fist():
    """One number per hand: 0 leaves the hand as sculpted (open, relaxed), 1 is the fist - the finger block
    curled onto the palm, the thumb across it - on both hands alike, inside the joint limits all the way."""
    hand = lambda s, q: rig.hand_point(s, q)  # noqa: E731
    assert all(np.array_equal(R, np.eye(3)) for side in "LR" for R in rig.grip_rots(side, 0.0).values())
    for g in np.linspace(0.0, 1.0, 11):
        rots = rig.set_grip({}, g, 1.0 - g)
        assert not rig.check_limits(rots)
        assert abs(rig.grip_of(rots, "L") - g) < 1e-9 and abs(rig.grip_of(rots, "R") - (1.0 - g)) < 1e-9
    assert rig.grip_of({}, "L") == 0.0  # a pose that knows no finger bones holds an open hand
    assert rig.check_limits({"fingersL": rig.local_rot("fingersL", pitch=rig.FIST_CURL + 10)})
    reach = {}
    for side, s in rig.SIDES:
        M = SKEL.world_mats(rig.grip_rots(side, 1.0))
        at = lambda b, p: M[SKEL.index[b]][:, :3] @ p + M[SKEL.index[b]][:, 3]  # noqa: E731
        a, n, w = rig.hand_axes(s)
        tip = (at("fingers" + side, rig.FINGERTIP[s]) - rig.WRIST[s]) / rig.H  # where the fingertips end up
        assert tip @ a < 0.03 and 0.0 < tip @ n < 0.04  # the bone's tail: back by the heel of the hand, on its palm side
        thumb = (at("thumb" + side, rig.THUMB_END[s]) - rig.WRIST[s]) / rig.H
        assert thumb @ n > 0.012 and thumb @ w < 0.0  # the thumb lies across the folded fingers
        reach[s] = tip @ a, tip @ n, thumb @ a, thumb @ n, thumb @ w
        # the fist is the short hand: nothing of it reaches as far from the wrist as the open fingers did
        far = max(float(((at(b + side, p) - rig.WRIST[s]) @ a).max()) for b, p in
                  (("fingers", rig.FINGERTIP[s]), ("thumb", rig.THUMB_END[s]), ("fingers", rig.KNUCKLES[s])))
        assert far < 0.6 * rig.RATIO["hand"] * rig.H
    assert np.allclose(reach[1], reach[-1], atol=1e-6)  # the right hand is the mirror image of the left


def test_knuckles_and_thumb_base_cannot_open(sc):
    """The same ball-joint principle as every other joint: palm and finger block both contain the barrel
    round the knuckle line, palm and thumb both contain the ball at the thumb's base - open, half closed
    and as a fist; and the finger bones carry surface of their own (so a fist is seen to close)."""
    poses = {f"grip{g}": SKEL.world_mats(rig.set_grip({}, g, g)) for g in (0.0, 0.3, 0.6, 1.0)}
    poses["fist_bent_wrist"] = SKEL.world_mats(rig.set_grip({"handL": rig.local_rot("handL", pitch=60),
                                                             "handR": rig.local_rot("handR", pitch=-60)}, 1.0, 1.0))
    rep = soldier.sdf_gap_report(poses)
    assert rep["shared_ball"] < 0 and rep["posed_ball"] < 0 and rep["pivot"] < 1e-5 and rep["core"] < -0.3, rep
    joints = {j.name: j for j in rig.JOINTS}
    for side in "LR":
        k, t = joints["knuckle" + side], joints["thumb" + side]
        assert k.kind == "hinge" and k.parent == "hand" + side and t.kind == "bead" and t.parent == "hand" + side
        # along the whole knuckle line (not only at its middle) the barrel is inside palm AND finger block
        axis = rig.hand_axes(1 if side == "L" else -1)[2]
        line = k.pos + np.linspace(-1, 1, 9)[:, None] * rig.KNUCKLE_HALF * rig.H * axis
        ring = np.concatenate([line + 0.97 * k.shared * d for d in rig.hand_axes(1 if side == "L" else -1)[:2]]
                              + [line - 0.97 * k.shared * d for d in rig.hand_axes(1 if side == "L" else -1)[:2]])
        assert float(body.bone_sdf("hand" + side, ring).max()) < 0 and float(body.bone_sdf("fingers" + side, ring).max()) < 0
    i = {n: k for k, n in enumerate(sc.names)}
    for b in rig.HAND_BONES:
        assert len(sc.faces[i[b]]) > 50 and sc.keep[i[b]].any(), b


def test_older_clips_and_models_without_finger_bones_still_play(sc, tmp_path):
    """A clip saved by the 32-bone rig (no fingers, no thumbs) loads and plays with open hands; a model
    sculpted then (20 body bones) still gets its splats moved by the 36-bone skeleton."""
    import clip as clip_mod
    old_bones = rig.GEOMETRY_BONES + rig.HELPER_BONES  # the 32 of before
    frames = [motion.walk_rots(SKEL, k / 6)[0] for k in range(6)]
    old = clip_mod.Clip.from_rots(24.0, frames, np.zeros((6, 3)), bones=old_bones)
    path = str(tmp_path / "old.npz")
    old.save(path)
    back = clip_mod.Clip.load(path)
    assert len(back.bones) == 32 and not set(rig.HAND_BONES) & set(back.bones)
    mats, _ = back.pose(3)
    assert mats.shape == (36, 3, 4) and np.isfinite(mats).all()
    for side in "LR":  # the fingers ride on the hand exactly as sculpted: an open mitten
        assert np.allclose(mats[SKEL.index["fingers" + side]], mats[SKEL.index["hand" + side]], atol=1e-6)
        assert np.allclose(mats[SKEL.index["thumb" + side]], mats[SKEL.index["hand" + side]], atol=1e-6)
    new = clip_mod.Clip.from_rots(24.0, [rig.set_grip(dict(f), 1.0, 0.25) for f in frames], np.zeros((6, 3)))
    assert abs(rig.grip_of(new.body_rots(2), "L") - 1.0) < 1e-5 and abs(rig.grip_of(new.body_rots(2), "R") - 0.25) < 1e-5
    joined = clip_mod.blend(back, new, 2)  # old and new can still be joined: on the bones both have
    assert not set(rig.HAND_BONES) & set(joined.bones) and joined.pose(0)[0].shape == (36, 3, 4)
    # an old model: only the 20 body bones have meshes
    keep = [k for k, n in enumerate(sc.names) if n in rig.GEOMETRY_BONES]
    pick = lambda xs: [xs[k] for k in keep]  # noqa: E731
    old_sc = soldier.Sculpt(pick(sc.names), pick(sc.verts), pick(sc.faces), pick(sc.normals), pick(sc.colors),
                            pick(sc.rough), pick(sc.metal), pick(sc.keep), "none")
    mesh = str(tmp_path / soldier.MESH_FILE)
    old_sc.save(mesh)
    old_sc = soldier.Sculpt.load(mesh)
    model = SplatModel.from_mesh(old_sc.parts(True), 3000, seed=0)
    bones = soldier.splat_bones(old_sc, model)
    assert set(np.unique(bones)) == {SKEL.index[b] for b in rig.GEOMETRY_BONES}
    R = soldier.Renderer(model, bones, app=False)
    img = R.frame(soldier.camera(30, 8, 48), SKEL.world_mats(rig.set_grip({}, 1.0, 1.0)))
    assert img.shape[:2] == (48, 36) and np.isfinite(img).all()

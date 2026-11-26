"""Fast checks for the soldier's motion capture: landmark axes (left stays left), the pose solver against
known poses, joint limits, cleaning filters, contact detection, the round trip
motion -> 33 landmarks -> retarget -> compare for walk / run / jump, and clip files.
No video and no MediaPipe needed (the two tests that use OpenCV / MediaPipe skip without them).  CPU, ~20 s."""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples" / "soldier"))
import clip as clip_mod  # noqa: E402
import mocap  # noqa: E402
import motion  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402
import synth  # noqa: E402
from clip import Clip, Player  # noqa: E402

SKEL = rig.SKELETON
L = rig.local_rot
quiet = lambda *a: None  # noqa: E731


def mp_world(rots, root=(0.0, 0.0, 0.0)):
    """What MediaPipe would report for a soldier pose: hip-centred, metres, x right / y down / z away."""
    P = rt.rig_landmarks(rt.fk(rots, root))
    hips = 0.5 * (P[rt.IDX["left_hip"]] + P[rt.IDX["right_hip"]])
    return ((P - hips) / rt.UNITS_PER_M) @ rt.MP_TO_RIG.T


def solve(rots, **par):
    P = mp_world(rots) @ rt.MP_TO_RIG.T
    return rt.solve_pose(P, rt.calibrate(), rt.Params(**par))


def direction_errors(est, truth):
    a, b = rt.bone_directions(est), rt.bone_directions(truth)
    return {k: math.degrees(math.acos(float(np.clip(a[k] @ b[k], -1, 1)))) for k in a}


@pytest.fixture(scope="module")
def trips():
    """Clean round trips of the three synthetic motions, crossing the picture: {kind: (clip, report, truth, capture)}."""
    out = {}
    for kind in ("walk", "run", "jump"):
        cap, truth = synth.synthetic(kind, course=90.0)
        c, rep = rt.retarget(cap, log=quiet)
        out[kind] = (c, rep, truth, cap)
    return out


# ---------------------------------------------------------------- axes
def test_axes_keep_left_and_right():
    assert np.isclose(np.linalg.det(rt.MP_TO_RIG), 1.0)  # a rotation: no mirror
    # MediaPipe: a person facing the camera has his LEFT shoulder at larger image x, y runs down, and the
    # nose is nearer the camera than the ears (smaller z)
    W = mp_world({})
    assert W[rt.IDX["left_shoulder"], 0] > W[rt.IDX["right_shoulder"], 0]
    assert W[rt.IDX["nose"], 1] < W[rt.IDX["left_ankle"], 1]
    assert W[rt.IDX["nose"], 2] < W[rt.IDX["left_ear"], 2]
    # raise his LEFT arm sideways and kick his RIGHT leg forward: the same limbs move after the retarget
    pose = {"upperarmL": L("upperarmL", roll=80), "thighR": L("thighR", pitch=-50), "shinR": L("shinR", pitch=30)}
    rots, _ = solve(pose, shrug=0.0)
    assert rig.joint_angles("upperarmL", rots["upperarmL"])[2] == pytest.approx(80, abs=0.5)
    assert rig.joint_angles("upperarmR", rots["upperarmR"])[2] == pytest.approx(-rig.A_POSE, abs=0.5)  # still at rest
    assert rig.joint_angles("thighR", rots["thighR"])[0] == pytest.approx(-50, abs=0.5)
    assert rig.joint_angles("thighL", rots["thighL"])[0] == pytest.approx(0, abs=0.5)
    assert max(direction_errors(rots, pose).values()) < 0.5


def test_axes_check_notices_a_mirrored_or_flipped_capture():
    frames = synth.walk(seconds=0.6)
    good = np.stack([mp_world(f[0]) for f in frames]) @ rt.MP_TO_RIG.T
    assert rt.axes_check(good) == dict(face_in_front=1.0, knees_bend_forward=1.0, head_above_hips=1.0)
    mirrored = good * np.array([-1.0, 1.0, 1.0])  # a selfie-style mirror image
    assert rt.axes_check(mirrored)["face_in_front"] == 0.0
    depth_flipped = good * np.array([1.0, 1.0, -1.0])  # the wrong sign for "towards the camera"
    assert rt.axes_check(depth_flipped)["face_in_front"] == 0.0
    assert rt.axes_check(good * np.array([1.0, -1.0, 1.0]))["head_above_hips"] == 0.0


# ---------------------------------------------------------------- the pose solver
def test_rest_pose_comes_back_exactly():
    rots, excess = solve({}, shrug=0.0)
    assert not excess
    assert max(float(clip_mod.geodesic_deg(R, np.eye(3))) for R in rots.values()) < 1e-6


def test_scale_and_origin_do_not_matter():
    pose = motion.walk_rots(SKEL, 0.3)[0]
    P = mp_world(pose) @ rt.MP_TO_RIG.T
    a = rt.solve_pose(P, rt.calibrate(), rt.Params())[0]
    b = rt.solve_pose(1.37 * P + np.array([3.0, -2.0, 5.0]), rt.calibrate(), rt.Params())[0]
    assert max(float(clip_mod.geodesic_deg(a[k], b[k])) for k in a) < 1e-6
    U = P[None] * rt.UNITS_PER_M  # the soldier's own size in his own units
    assert rt.body_scale(U) == pytest.approx(1.0, abs=1e-3)
    assert rt.body_scale(U / 1.2) == pytest.approx(1.2, abs=1e-3)


@pytest.mark.parametrize("name", ["elbow", "arm_forward", "arm_overhead", "kick", "squat", "twist", "bow", "nod"])
def test_known_poses_come_back(name):
    """Bone directions of poses inside the limits are recovered (the split of a bend between neighbouring
    joints and the twist of a straight limb are not observable from 33 points; directions are)."""
    poses = {
        "elbow": {"upperarmL": L("upperarmL", pitch=-40, roll=15), "forearmL": L("forearmL", pitch=-110),
                  "upperarmR": L("upperarmR", roll=-35), "forearmR": L("forearmR", pitch=-60)},
        "arm_forward": {"upperarmL": L("upperarmL", pitch=-90), "upperarmR": L("upperarmR", pitch=40)},
        "arm_overhead": {"upperarmL": L("upperarmL", pitch=-160), "forearmL": L("forearmL", pitch=-25)},
        "kick": {"thighL": L("thighL", pitch=-80, roll=10), "shinL": L("shinL", pitch=50), "footL": L("footL", pitch=30),
                 "thighR": L("thighR", pitch=15)},
        "squat": {"thighL": L("thighL", pitch=-70), "shinL": L("shinL", pitch=110), "thighR": L("thighR", pitch=-70),
                  "shinR": L("shinR", pitch=110), "pelvis": rig.euler(pitch=20)},
        "twist": {"pelvis": rig.euler(yaw=30), "chest": L("chest", yaw=-35, roll=8)},
        "bow": {"pelvis": rig.euler(pitch=12), "chest": L("chest", pitch=12)},
        "nod": {"head": L("head", pitch=6, yaw=50)},
    }
    pose = poses[name]
    assert not rig.check_limits({k: v for k, v in pose.items() if k != "pelvis"})
    rots, excess = solve(pose, shrug=0.0)
    err = direction_errors(rots, pose)
    shared = ("pelvis", "chest", "neck")  # how a lean / nod is split along the spine is a choice, not an observation
    worst = max((b for b in err if b not in shared), key=err.get)
    assert err[worst] < 1.0, (worst, err[worst])
    assert max(err[b] for b in shared) < 8.0, {b: err[b] for b in shared}
    assert not excess, excess
    if name in ("elbow", "kick", "squat"):  # a bent limb fixes the twist too: the joint angles themselves match
        for b in ("forearmL", "shinL") + (() if name == "squat" else ("thighL",)):  # (squat: the pelvis shares its tilt)
            assert float(clip_mod.geodesic_deg(rots[b], pose.get(b, np.eye(3)))) < 1.0, b


def test_trunk_lean_is_shared_between_pelvis_and_waist():
    pose = {"pelvis": rig.euler(pitch=30)}
    rots, _ = solve(pose, waist_share=0.5)
    waist = rig.joint_angles("chest", rots["chest"])[0]
    assert 5 < waist < 25  # the waist took a share ...
    err = direction_errors(rots, pose)  # ... and the shoulders are still where they were seen
    P0, P1 = rt.rig_landmarks(rt.fk(pose)), rt.rig_landmarks(rt.fk(rots))
    sh = lambda P: 0.5 * (P[rt.IDX["left_shoulder"]] + P[rt.IDX["right_shoulder"]]) - 0.5 * (P[rt.IDX["left_hip"]] + P[rt.IDX["right_hip"]])  # noqa: E731
    assert math.degrees(math.acos(float(rt.unit(sh(P0)) @ rt.unit(sh(P1))))) < 0.5
    assert err["thighL"] < 0.5
    all_pelvis, _ = solve(pose, waist_share=0.0)
    assert abs(rig.joint_angles("chest", all_pelvis["chest"])[0]) < 0.5


# ---------------------------------------------------------------- limits
def test_poses_beyond_the_limits_are_clamped_and_reported():
    # a knee bent the wrong way, an elbow bent the wrong way, a head turned too far, a leg spread too wide
    wild = {"shinL": rig.rot_x(-40), "forearmR": rig.rot_x(50), "head": rig.rot_y(110), "thighR": rig.rot_z(-80)}
    assert rig.check_limits(wild)
    rots, excess = solve(wild, shrug=0.0)
    body = {b: rots[b] for b in rig.GEOMETRY_BONES if b != "pelvis"}
    assert not rig.check_limits(body, tol=0.1), rig.check_limits(body, tol=0.1)
    assert excess["head"] > 30 and excess["thighR"] > 25
    assert set(excess) >= {"head", "thighR"}
    R, ex = rt.limit_rot("shinL", rig.rot_x(-40))
    assert ex == pytest.approx(40, abs=0.5) and rig.joint_angles("shinL", R)[0] == pytest.approx(0, abs=1e-3)
    inside = L("upperarmL", pitch=-30, roll=20)
    R, ex = rt.limit_rot("upperarmL", inside)
    assert ex == 0.0 and np.allclose(R, inside)


def test_retargeted_clips_stay_inside_the_limits(trips):
    for kind, (c, rep, truth, _) in trips.items():
        for t in range(0, len(c), 3):
            body = {b: R for b, R in c.body_rots(t).items() if b != "pelvis"}
            assert not rig.check_limits(body, tol=0.2), (kind, t, rig.check_limits(body, tol=0.2))


# ---------------------------------------------------------------- cleaning
def test_filters():
    rng = np.random.default_rng(0)
    fps = 30.0
    t = np.arange(90) / fps
    still = np.zeros((90, 1)) + rng.normal(0, 0.01, (90, 1))
    fast = np.sin(2 * math.pi * 2.0 * t)[:, None]  # 2 Hz, amplitude 1: a swinging limb
    for f in (lambda x: rt.one_euro(x, fps), lambda x: rt.adaptive_lowpass(x[:, None], fps, 3.0, 9.0, 0.05, 0.4)[:, 0]):
        assert np.std(f(still)) < 0.6 * np.std(still)  # jitter of a still point goes down
    out = rt.adaptive_lowpass(fast[:, None], fps, 3.0, 9.0, 0.05, 0.4)[:, 0]
    assert np.abs(out - fast)[10:-10].max() < 0.02  # ... and a fast swing is kept (no lag, no loss)
    euro = rt.one_euro(fast, fps, 2.5, 1.5)
    assert np.abs(euro - fast)[10:-10].max() > 0.02  # (the one-pole One Euro does lose some of it: why it is not the default)
    assert rt.lowpass(fast[:6], fps, 3.0).shape == (6, 1)  # too short to filter: passed through


def test_spikes_and_dropouts_are_repaired():
    frames = synth.run(seconds=1.0)
    X = np.stack([mp_world(f[0]) for f in frames])
    ok = np.ones(X.shape[:2], bool)
    bad = X.copy()
    bad[12, rt.IDX["left_wrist"]] += [0.3, -0.2, 0.25]  # one wild frame
    bad[20:25, rt.IDX["right_ankle"]] += 0.4  # MediaPipe lost the ankle for five frames ...
    vis = np.ones(X.shape[:2])
    vis[20:25, rt.IDX["right_ankle"]] = 0.1  # ... and said so
    out, rep = rt.clean(bad, vis, 30.0, rt.Params(filter="none"))
    assert rep["spikes_removed"] >= 1 and rep["missing_ratio"]["right_ankle"] == pytest.approx(5 / len(X), abs=1e-3)
    assert np.abs(out - X)[12, rt.IDX["left_wrist"]].max() < 0.05
    # the bridged ankle keeps the shin's length (a straight-line bridge would shorten it)
    shin = np.linalg.norm(out[:, rt.IDX["right_ankle"]] - out[:, rt.IDX["right_knee"]], axis=-1)
    assert np.abs(shin / np.median(shin) - 1)[20:25].max() < 0.02
    naive = rt.fill_gaps(np.where(vis[..., None] < 0.5, np.nan, bad)[:, rt.IDX["right_ankle"]], vis[:, rt.IDX["right_ankle"]] >= 0.5)
    shin_naive = np.linalg.norm(naive - X[:, rt.IDX["right_knee"]], axis=-1)
    assert np.abs(shin_naive / np.median(shin) - 1)[20:25].max() > 0.05  # (it does: the foot is swinging through)
    # a landmark that jumps without a low visibility is caught by the bone it stretches
    jump = X.copy()
    jump[27, rt.IDX["left_heel"]] += [0.0, 0.0, 0.25]
    assert rt.length_outliers(jump, ok)[27, rt.IDX["left_heel"]]
    assert not rt.length_outliers(X, ok).any()


def test_contact_detection_hysteresis():
    par = rt.Params()
    fps = 30.0
    h = np.array([0.20, 0.10, 0.02, 0.01, 0.00, 0.00, 0.01, 0.035, 0.00, 0.00, 0.05, 0.12, 0.20, 0.20, 0.01, 0.20, 0.2])
    v = np.array([3.00, 2.00, 0.80, 0.20, 0.10, 0.10, 0.10, 0.85, 0.10, 0.10, 2.00, 3.00, 3.00, 3.00, 0.10, 3.00, 3.0])
    c = rt.detect_contact(h, v, fps, par)
    assert c[3] and not c[2]  # starts only once it is low AND slow (0.8 is too fast to start)
    assert c[7]  # ... but 0.85 / 3.5 cm does not END it (looser thresholds to keep a contact)
    assert rt.intervals(c) == [(3, 9)]  # the single low frame 14 is a flicker, dropped
    assert rt.intervals(np.array([0, 1, 1, 0, 1], bool)) == [(1, 2), (4, 4)]
    assert rt.footprint_ankle((0.3, 0.7), 0.0, 0.0, 1)[0] == pytest.approx(rig.ANKLE[1] + [0.3 - rig.TOE[1][0], 0, 0.7 - rig.TOE[1][2]])
    assert float(rt.planted_pitch(30.0, 1)) > 35.0 and float(rt.planted_pitch(-10.0, 1)) == -10.0


# ---------------------------------------------------------------- round trips
def test_synthetic_motions_are_sound():
    """The generators themselves: inside the joint limits, feet planted, legs never over-stretched."""
    assert max(synth.Run().frame(i / 60)[4] for i in range(42)) < 0.995
    for kind in ("walk", "run", "jump"):
        frames = synth.MOTIONS[kind]()
        for rots, _, _, _ in frames[::2]:
            body = {b: rots[b] for b in rig.GEOMETRY_BONES if b in rots and b != "pelvis"}
            assert not rig.check_limits(body, tol=2.5), (kind, rig.check_limits(body, tol=2.5))
        slip = rt.foot_slip(synth.truth_clip(frames, 30.0))
        assert slip["slide_contact_max"] < 0.004 and slip["sink_max"] < 0.01, (kind, slip)
    j = synth.Jump()
    assert 0.40 < j.t_land - j.t_off < 0.55 and j.v0[1] == pytest.approx(2.3, abs=0.2)


@pytest.mark.parametrize("kind", ["walk", "run", "jump"])
def test_round_trip(trips, kind):
    c, rep, truth, _ = trips[kind]
    res = rt.compare(c, truth)
    assert rep["axes"]["face_in_front"] == 1.0 and rep["body_scale"] == pytest.approx(rt.UNITS_PER_M, abs=0.003)
    assert res["direction_mean"] < 1.2, res["direction_mean"]
    for b, v in res["bones"].items():
        if not b.startswith(("toe", "clav")):  # toes and collar bones are not observed, they follow rules
            assert v["direction"]["mean"] < 2.5 and v["direction"]["max"] < 12.0, (b, v)
    assert max(res["root"]["rms"]) < 0.02 and max(res["root"]["max"]) < 0.05, res["root"]
    assert res["contact_agreement"] > 0.84
    # feet: planted means planted, and nothing under the ground
    assert rep["slip"]["slide_contact_max"] < 0.003 and rep["slip"]["sink_max"] < 0.003, rep["slip"]
    assert rep["slip"]["planted_frames"] > 20


def test_jump_and_run_flights_are_ballistic(trips):
    c, rep, truth, _ = trips["jump"]
    (fl,) = [f for f in rep["root"]["flights"] if "seconds" in f]
    true_first, true_last = np.flatnonzero(truth.flight)[[0, -1]]
    assert abs(fl["first"] - true_first) <= 1 and abs(fl["last"] - true_last) <= 1
    assert fl["takeoff_speed"] == pytest.approx(synth.Jump().v0[1], rel=0.15)
    assert c.root[:, 1].max() == pytest.approx(truth.root[:, 1].max(), abs=0.03)  # the height of the jump
    assert rep["root"]["gravity_seen_in_image"]["implied_time_scale"] == pytest.approx(1.0, abs=0.08)
    # in the air the centre of mass falls freely: its height has a constant second difference of -g / fps^2
    idx = np.arange(fl["first"], fl["last"] + 1)
    com = np.array([c.root[t] + rt.center_of_mass(rt.fk(c.body_rots(t))) for t in idx])
    acc = np.diff(com[:, 1], 2) * c.fps ** 2
    assert np.allclose(acc, -rt.GRAVITY, rtol=0.02), acc
    assert np.abs(np.diff(com[:, [0, 2]], 2, axis=0)).max() < 2e-4  # ... and it drifts on in a straight line
    # the run has a flight after every step
    c, rep, truth, _ = trips["run"]
    assert len([f for f in rep["root"]["flights"] if "seconds" in f]) >= 3
    assert (c.flight == truth.flight).mean() > 0.85
    # slow motion: told the video runs at half speed, gravity is a quarter and the jump comes out the same
    cap, truth = synth.synthetic("jump", course=90.0, fps=60.0)
    cap["fps"] = 30.0  # the same frames played at half speed
    slow, rep2 = rt.retarget(cap, rt.Params(time_scale=0.5), log=quiet)
    assert rep2["root"]["gravity_seen_in_image"]["implied_time_scale"] == pytest.approx(0.5, abs=0.05)
    assert slow.root[:, 1].max() == pytest.approx(truth.root[:, 1].max(), abs=0.03)


def test_without_a_2d_track_the_feet_still_hold():
    cap, truth = synth.synthetic("walk", course=0.0)
    c, rep = rt.retarget(cap, rt.Params(use_image=False), log=quiet)
    assert rep["root"]["source"].startswith("contacts only")
    res = rt.compare(c, truth)
    assert res["direction_mean"] < 1.2 and max(res["root"]["rms"]) < 0.03
    assert rep["slip"]["slide_contact_max"] < 0.003


def test_noisy_capture_degrades_gently():
    cap, truth = synth.synthetic("run", course=90.0, noise_m=0.008, image_noise_px=1.0, spikes=4, dropouts=3, seed=1)
    c, rep = rt.retarget(cap, log=quiet)
    res = rt.compare(c, truth)
    assert res["direction_mean"] < 4.0 and max(res["root"]["rms"]) < 0.08, (res["direction_mean"], res["root"])
    assert rep["slip"]["slide_contact_max"] < 0.02 and rep["slip"]["sink_max"] < 0.01
    assert max((v["max_deg"] for v in rep["limits"].values()), default=0.0) < 45.0  # no limb thrown about by a bad landmark
    for t in range(0, len(c), 4):
        assert not rig.check_limits({b: R for b, R in c.body_rots(t).items() if b != "pelvis"}, tol=0.2)


# ---------------------------------------------------------------- clips
def test_clip_files_and_playback(tmp_path, trips):
    c = trips["run"][0]
    path = str(tmp_path / "clip.npz")
    c.save(path)
    d = Clip.load(path)
    assert d.bones == c.bones and d.fps == c.fps and len(d) == len(c)
    assert np.array_equal(d.quat, c.quat) and np.array_equal(d.root, c.root) and np.array_equal(d.flight, c.flight)
    assert d.meta["version"] == rt.VERSION and d.meta["params"]["waist_share"] == 0.5 and "limits" in d.meta
    assert set(rig.GEOMETRY_BONES) <= set(d.bones) and set(rig.HELPER_BONES) <= set(d.bones)
    q = clip_mod.mat_to_quat(np.stack([rig.euler(10, 200, -80), rig.euler(-170, 5, 3), np.eye(3)]))
    assert np.allclose(clip_mod.quat_to_mat(q), np.stack([rig.euler(10, 200, -80), rig.euler(-170, 5, 3), np.eye(3)]), atol=1e-9)
    # playback: matrices for the renderer; the costume helpers are driven afresh (same result as stored here)
    p = Player(d)
    mats, root = p.pose(5)
    assert mats.shape == (len(SKEL.bones), 3, 4) and np.allclose(root, c.root[5])
    stored = d.pose(5, stored_helpers=True)[0]
    body = [SKEL.index[b] for b in rig.GEOMETRY_BONES]
    assert np.allclose(mats[body], stored[body], atol=1e-5)
    # a clip made for a rig with other helper bones still plays: unknown bones are ignored, missing ones driven
    odd = Clip(d.fps, [b for b in d.bones if b not in rig.HELPER_BONES] + ["oldSkirt"],
               np.concatenate([d.quat[:, [i for i, b in enumerate(d.bones) if b not in rig.HELPER_BONES]], d.quat[:, :1]], 1), d.root)
    assert odd.pose(3)[0].shape == mats.shape
    half = d.resample(15.0)
    assert len(half) == (len(d) + 1) // 2 and np.allclose(half.root[1], d.root[2], atol=1e-6)


def test_blend_and_loop(trips):
    walk, run = trips["walk"][0], trips["run"][0]
    both = clip_mod.blend(walk, run, overlap=6)
    assert len(both) == len(walk) + len(run) - 6
    assert np.allclose(both.root[:len(walk) - 6], walk.root[:len(walk) - 6], atol=1e-6)
    steps = np.linalg.norm(np.diff(both.root, axis=0), axis=1)
    assert steps.max() < 1.5 * max(np.linalg.norm(np.diff(run.root, axis=0), axis=1).max(), 1e-6)  # no jump at the seam
    turn = [float(clip_mod.geodesic_deg(clip_mod.quat_to_mat(both.quat[t]), clip_mod.quat_to_mat(both.quat[t + 1])).max())
            for t in range(len(both) - 1)]
    assert max(turn) < 45.0
    # loop: one gait cycle of the run, cut between two left touchdowns
    bounds = rt.cycle_bounds(run)
    assert len(bounds) >= 2 and 18 <= bounds[1] - bounds[0] <= 24  # the run's cycle is 21 frames
    loop = clip_mod.make_loop(run, bounds[0], bounds[1], overlap=3)
    assert len(loop) == bounds[1] - bounds[0] and np.linalg.norm(loop.meta["loop_travel"]) > 1.0
    p = Player(loop, loop=True)
    a, b = p.pose(len(loop) - 1), p.pose(len(loop))  # last frame of lap 1 -> first frame of lap 2
    seam = np.abs(b[0] - a[0])[[SKEL.index[x] for x in rig.GEOMETRY_BONES]].max()
    inside = max(np.abs(p.pose(i + 1)[0] - p.pose(i)[0])[[SKEL.index[x] for x in rig.GEOMETRY_BONES]].max() for i in range(3, 8))
    assert seam < 1.6 * inside, (seam, inside)


# ---------------------------------------------------------------- command line + optional parts
def test_command_line(tmp_path, monkeypatch, capsys):
    out = str(tmp_path / "synth_run")
    for argv in (["synth", "run", "-o", out, "--course", "90", "--noise", "0.004"], ["retarget", "-o", out], ["evaluate", "-o", out]):
        monkeypatch.setattr(sys, "argv", ["mocap.py"] + argv)
        mocap.main()
    files = {p.name for p in Path(out).iterdir()}
    assert {"capture.npz", "capture.json", "truth.npz", "clip.npz", "retarget.json", "evaluate.json"} <= files
    rep = json.loads((Path(out) / "retarget.json").read_text())
    assert rep["frames"] == 42 and "limits" in rep and rep["root"]["contacts"]["L"] >= 1
    c = Clip.load(str(Path(out) / "clip.npz"))
    assert c.meta["source"]["video"] == "synthetic-run" and c.meta["outfit"] == "soldier" and c.meta["code"].startswith(rt.VERSION)
    assert mocap.view_azimuth("source", c) == 0.0
    assert abs((mocap.view_azimuth("side", c) - mocap.view_azimuth("front", c)) - 90.0) < 1e-9
    assert mocap.travel_heading(c) == pytest.approx(90.0, abs=5.0)  # it ran across the picture, towards +x
    img = mocap.draw_skeleton(mocap.Image.new("RGB", (64, 48)), np.random.default_rng(0).uniform(0, 48, (33, 2)))
    assert np.asarray(img).max() > 0


def test_camera_stabiliser_follows_a_pan():
    cv2 = pytest.importorskip("cv2")
    rng = np.random.default_rng(0)
    big = cv2.GaussianBlur((rng.uniform(0, 255, (300, 500))).astype(np.uint8), (0, 0), 2.0)
    big = cv2.normalize(big, None, 0, 255, cv2.NORM_MINMAX)
    st = mocap.Stabilizer()
    for k in range(6):  # the camera pans right by 7 px a frame: the picture content moves left
        M = st.update(np.ascontiguousarray(big[40:240, 20 + 7 * k:340 + 7 * k]), box=(120, 40, 200, 180))
    assert M[0, 2] == pytest.approx(35.0, abs=1.0) and abs(M[1, 2]) < 1.0  # pixel (0, 0) now = pixel (35, 0) of frame 0
    assert M[0, 0] == pytest.approx(1.0, abs=0.01)


def test_mediapipe_loads():
    """Only that the pose landmarker can be created (needs the model file, already downloaded, and the
    system libraries libEGL / libGLESv2); skipped when any of that is missing."""
    pytest.importorskip("mediapipe")
    model = mocap.MODEL_DIR / "pose_landmarker_heavy.task"
    if not model.exists():
        pytest.skip("model not downloaded (mocap.py capture downloads it)")
    try:
        _, lm = mocap.make_landmarker(str(model))
    except SystemExit as e:
        pytest.skip(str(e).splitlines()[0])
    lm.close()

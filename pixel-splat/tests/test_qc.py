"""Fast checks for the motion quality checks (examples/soldier/qc.py): balance (static, extrapolated centre of
mass, zero-moment point), jerk (normalized jerk, one-frame pops) and punch sequencing.  Synthetic motions only:
no catalogue data, no baked model.  CPU, a few seconds."""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples" / "soldier"))
import qc  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402
from clip import Clip  # noqa: E402

FPS = 60.0


def held(rots, n=20, root=(0.0, 0.0, 0.0)):
    """A clip that holds one pose for ``n`` frames, as the checks see it."""
    return qc.from_clip(Clip.from_rots(FPS, [rots] * n, np.tile(np.asarray(root, float), (n, 1))), "held")


def grounded(rots, n=20):
    """``held``, lowered or raised so the lowest sole point is on the ground."""
    h = held(rots, 1).sole[0, :, :, 1].min()
    return held(rots, n, (0.0, -h * rt.UNITS_PER_M, 0.0))


def one_point(path, fps=FPS):
    """A Motion whose whole mass is one point following ``path`` (T, 3), metres."""
    path = np.asarray(path, float)
    T = len(path)
    return qc.Motion("point", fps, {}, path[:, None, :], np.ones(1), np.zeros((T, 2, 5, 3)), {}, 1.0)


# ---------------------------------------------------------------- the body model
def test_de_leva_masses_and_rest_com():
    assert sum(v[0] for v in qc.DE_LEVA.values()) + sum(qc.DE_LEVA[k][0] for k in
                                                       ("upperarm", "forearm", "hand", "thigh", "shank", "foot")) == pytest.approx(1.0, abs=1e-4)
    m = held({}, 8)
    # the rig's rest pose: centre of mass 0.984 m above the sole = 56.2 % of his 1.75 m, 2 mm behind the ankles
    assert m.com_height_rest == pytest.approx(0.98405, abs=5e-4)
    assert m.com[0] == pytest.approx([0.0, 0.98405, -0.00200], abs=5e-4)


def test_signed_distance_and_hull():
    sq = qc.hull(np.array([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]))
    assert len(sq) == 4
    assert qc.signed_distance([0.5, 0.5], sq) == pytest.approx(0.5)
    assert qc.signed_distance([0.9, 0.5], sq) == pytest.approx(0.1)
    assert qc.signed_distance([2.0, 0.5], sq) == pytest.approx(-1.0)
    assert qc.signed_distance([0.0, 2.0], qc.hull(np.array([[0, 0], [0, 1]]))) == pytest.approx(-1.0)  # a line has no inside


def test_contact_rule():
    m = held({}, 10)
    on = qc.contacts(m)
    assert on.all()  # standing: every sole point carries weight
    lifted = held({}, 10, (0.0, 0.020 * rt.UNITS_PER_M, 0.0))  # 2 cm up: off the ground
    assert not qc.contacts(lifted).any()
    hover = held({}, 10, (0.0, 0.010 * rt.UNITS_PER_M, 0.0))  # 1 cm up and still: animation's "planted"
    assert qc.contacts(hover).all()
    slide = qc.from_clip(Clip.from_rots(FPS, [{}] * 10, np.array([[0.0, 0.0, 2.0 * i / FPS * rt.UNITS_PER_M] for i in range(10)])), "s")
    assert not qc.contacts(slide).any()  # 2 m/s along the floor: a swinging foot, not a support


# ---------------------------------------------------------------- 1. balance
def test_standing_rest_pose_is_balanced():
    b = qc.balance(held({}))
    # the centre of mass is 3.9 cm in front of the heels' line (the nearest edge of the two feet)
    assert b["static"]["all"]["out"] == 0 and b["dynamic"]["all"]["out"] == 0 and b["zmp"]["out"] == 0
    assert b["static"]["all"]["worst_m"] == pytest.approx(0.039, abs=1e-3)
    assert b["double_support_frames"] == 20 and b["flight_frames"] == 0
    assert b["excursions"] == []
    # standing still: XCoM and ZMP are the centre of mass itself
    k = 10
    assert b["_dynamic"][k] == pytest.approx(b["_static"][k], abs=1e-6)
    assert b["_zmp"][k] == pytest.approx(b["_static"][k], abs=1e-6)


def test_leaning_far_outside_fails():
    P = 20.0  # the whole body tipped forward 20 degrees about the ankles, feet flat
    m = grounded({"pelvis": rig.euler(pitch=P), "footL": rig.euler(pitch=-P), "footR": rig.euler(pitch=-P)})
    b = qc.balance(m)
    assert b["static"]["all"]["out"] == 20
    assert b["static"]["all"]["worst_m"] == pytest.approx(-0.119, abs=2e-3)  # 11.9 cm in front of the toes
    assert b["zmp"]["out"] == b["zmp"]["frames"] > 0  # held still there: the feet cannot hold it
    assert [e["verdict"] for e in b["excursions"]] == ["open at the end of the clip"]


def test_xcom_literal():
    v = 0.5
    path = np.array([[0.0, 1.0, v * i / FPS] for i in range(30)])
    m = one_point(path)
    c, xc, w0 = qc.xcom(m)
    assert w0 == pytest.approx(math.sqrt(9.81), rel=1e-6)  # l = 1 m
    assert xc[15, 1] - c[15, 2] == pytest.approx(v / math.sqrt(9.81), abs=1e-6)  # 0.1597 m ahead


def test_zmp_of_an_inverted_pendulum_is_its_pivot():
    """A point at a constant 1 m height that obeys x'' = w^2 (x - p) needs the ground to push exactly at p."""
    w, p = math.sqrt(9.81), 0.05
    t = np.arange(60) / FPS
    x = p + 0.01 * np.cosh(w * t) + 0.02 * np.sinh(w * t)
    path = np.stack([x, np.ones_like(t), np.zeros_like(t)], 1)
    z, load = qc.zmp(one_point(path))
    h = qc.edge(FPS)
    assert np.abs(z[h:-h, 0] - p).max() < 1e-3
    assert load[h:-h] == pytest.approx(1.0, abs=1e-6)


def test_excursion_ended_by_a_step_vs_won_back_without_one():
    """Excursions of the XCoM are judged by how they end: a foot landing is a step, coming back with the same feet
    down is not physical once deeper than RECOVER_TOL."""
    T = 40
    m = one_point(np.zeros((T, 3)))
    m.sole = np.zeros((T, 2, 5, 3))
    foot = np.array([[-0.05, 0, -0.1], [0.05, 0, -0.1], [-0.05, 0, 0.1], [0.05, 0, 0.1], [0, 0, 0.12]])
    m.sole[:, 0] = foot
    m.sole[:, 1] = foot + [0.0, 0.05, 0.6]  # the other foot in the air, 60 cm ahead
    z = np.zeros(T)
    z[12:20] = 0.25  # the body goes 25 cm forward (static, so XCoM follows it too) and comes back
    m.seg = np.stack([np.zeros(T), np.ones(T), z], 1)[:, None, :]
    v = qc.balance(m)["excursions"]
    assert [e["verdict"] for e in v] == ["won back WITHOUT a step (not physical)"]
    m.sole[19:, 1, :, 1] = 0.0  # ... now the other foot lands when it comes back
    m.seg[19:, 0, 2] = 0.25  # and the body stays forward over it
    m.sole[19:, 1, :, 2] = foot[:, 2] + 0.25
    v = qc.balance(m)["excursions"]
    assert v and v[0]["verdict"] == "ended by a step"


# ---------------------------------------------------------------- 2. jerk
def test_normalized_jerk_literals():
    # a sine, trough to crest: pi^3 / 4 = 7.75 (dimensionless, whatever amplitude and duration)
    t = np.arange(int(3 * FPS)) / FPS
    x = np.stack([0.3 * np.sin(2 * math.pi * 0.5 * t), np.zeros_like(t), np.zeros_like(t)], 1)
    a, b = int(0.5 * FPS), int(1.5 * FPS)  # -A at 0.5 s, +A at 1.5 s
    assert qc.normalized_jerk(x, FPS, a, b) == pytest.approx(math.pi ** 3 / 4, rel=0.02)
    # a minimum-jerk stroke from rest to rest: sqrt(360) = 18.97 in theory; its jerk jumps at both ends, which the
    # 7-frame smoothing spreads out of the stroke - by a lot for the short strokes of punches (see PUNCH_ONSET)
    for D, nj in ((0.1, 7.388), (0.25, 14.069), (0.5, 16.510), (1.0, 17.740)):
        n0 = 30
        tau = np.clip((np.arange(200) - n0) / (D * FPS), 0, 1)
        y = 0.4 * (10 * tau ** 3 - 15 * tau ** 4 + 6 * tau ** 5)
        xs = np.stack([np.zeros_like(y), np.zeros_like(y), y], 1)
        assert qc.normalized_jerk(xs, FPS, n0, n0 + int(round(D * FPS))) == pytest.approx(nj, rel=1e-3)


def test_one_frame_pop_is_found_at_its_frame():
    t = np.arange(180) / FPS
    x = np.stack([100 * np.sin(2 * math.pi * 0.7 * t), 30 * np.cos(2 * math.pi * 0.4 * t), np.zeros_like(t)], 1)  # mm
    score, thr, sp = qc.spikes(x, FPS, qc.SPIKE_FLOOR_MM)
    assert sp == []  # a smooth path has none
    x[90, 0] += 5.0  # one frame 5 mm off
    score, thr, sp = qc.spikes(x, FPS, qc.SPIKE_FLOOR_MM)
    assert [s["frame"] for s in sp] == [90]
    assert sp[0]["score"] == pytest.approx(5.0 * 2 / 3, rel=0.02)  # the window-7 cubic keeps 1/3 of a pop


def test_joint_rotation_pop_is_found_at_its_frame():
    n = 120
    R = np.stack([rig.rot_x(30.0 * math.sin(2 * math.pi * 0.8 * i / FPS)) @ rig.rot_y(10.0 * i / n) for i in range(n)])
    path = np.degrees(qc.rotvec_path(R))
    assert qc.spikes(path, FPS, qc.SPIKE_FLOOR_DEG)[2] == []
    R[70] = R[70] @ rig.rot_z(3.0)
    sp = qc.spikes(np.degrees(qc.rotvec_path(R)), FPS, qc.SPIKE_FLOOR_DEG)[2]
    assert [s["frame"] for s in sp] == [70]


def test_smooth_motion_has_small_normalized_jerk_and_a_pop_raises_it():
    t = np.arange(int(3 * FPS)) / FPS
    x = np.stack([0.3 * np.sin(2 * math.pi * 0.5 * t), np.zeros_like(t), np.zeros_like(t)], 1)
    a, b = int(0.5 * FPS), int(1.5 * FPS)
    smooth = qc.normalized_jerk(x, FPS, a, b)
    x[60, 0] += 0.005
    assert qc.normalized_jerk(x, FPS, a, b) > 3 * smooth


# ---------------------------------------------------------------- 3. punch sequencing
def bumps(peaks, T=90, width=3.0):
    """Speed curves: one bell per segment, peaking at the given frames (wrist last in the list)."""
    k = np.arange(T, dtype=float)
    return {n: (2.0 if n == "wrist" else 500.0) * np.exp(-0.5 * ((k - f) / width) ** 2) for n, f in peaks.items()}


def test_proximal_to_distal_punch_is_recognised():
    sig = bumps(dict(pelvis=40, chest=42, shoulder=44, elbow=46, wrist=47))
    s = qc.sequence(sig, FPS, 47)
    assert s["order"] == list(qc.CHAIN)
    assert s["order_ok"] and s["lags_ok"] and s["breaks"] == []
    assert s["lags"]["pelvis->chest"] == pytest.approx(2 / FPS, abs=1e-3)
    assert s["lags"]["elbow->wrist"] == pytest.approx(1 / FPS, abs=1e-3)


def test_reversed_punch_is_flagged():
    sig = bumps(dict(pelvis=46, chest=44.5, shoulder=43, elbow=41.5, wrist=40), T=90)  # the wrist FIRST
    s = qc.sequence(sig, FPS, 40, onset=35)
    assert s["order"] == ["wrist", "elbow", "shoulder", "chest", "pelvis"]
    assert not s["order_ok"]
    assert [(b["kind"], b["inner"], b["outer"]) for b in s["breaks"]] == [
        ("reversed", "pelvis", "chest"), ("reversed", "chest", "shoulder"), ("reversed", "shoulder", "elbow"),
        ("reversed", "elbow", "wrist")]
    assert s["breaks"][0]["ms"] == pytest.approx(1.5 * 1000 / FPS, abs=0.5)
    # a part still speeding up when the window closes (0.1 s after the wrist) is caught on the window's end
    late = bumps(dict(pelvis=30, chest=31, shoulder=33, elbow=50, wrist=40), T=90)
    s = qc.sequence(late, FPS, 40, onset=35)
    assert s["peaks"]["elbow"]["edge"] and s["peaks"]["elbow"]["frame"] >= 46
    assert [(b["kind"], b["inner"], b["outer"]) for b in s["breaks"] if b["kind"] == "reversed"] == [("reversed", "elbow", "wrist")]


def test_simultaneous_within_a_frame_is_not_a_break_and_still_parts_are_left_out():
    sig = bumps(dict(pelvis=44.4, chest=44, shoulder=44.6, elbow=45, wrist=45))
    sig["pelvis"] *= 0.01  # 5 deg/s: the pelvis does not take part
    s = qc.sequence(sig, FPS, 45)
    assert s["taking_part"] == ["chest", "shoulder", "elbow", "wrist"]
    assert s["order_ok"]


def test_loose_chain_is_flagged():
    sig = bumps(dict(pelvis=20, chest=22, shoulder=24, elbow=44, wrist=45))
    s = qc.sequence(sig, FPS, 45, onset=10)
    assert s["order_ok"] and not s["lags_ok"]
    assert [(b["kind"], b["inner"], b["outer"]) for b in s["breaks"]] == [("loose", "shoulder", "elbow")]


def test_peak_time_is_sub_frame():
    k = np.arange(60, dtype=float)
    t, v, edge = qc.peak_time(np.exp(-0.5 * ((k - 30.3) / 4.0) ** 2), 10, 50)
    assert t == pytest.approx(30.3, abs=0.03) and not edge


# ---------------------------------------------------------------- words
def test_korean_particles():
    assert qc.josa("손목", "이가") == "손목이"
    assert qc.josa("어깨", "이가") == "어깨가"
    assert qc.ko_part("rot_forearmR") == "오른쪽 아래팔 회전"
    assert qc.ko_part("wristL") == "왼쪽 손목"

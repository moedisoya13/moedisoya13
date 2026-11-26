"""Synthetic captures: known soldier motions turned into the 33-landmark format a video would give.

Used to check the retarget without a video (round trip: motion -> landmarks -> retarget -> compare) and
as demo material.  Three motions, all written the way the walk loop is - feet first, in world space:

    walk   ``motion.walk_rots`` travelling forward
    run    a jog with a flight phase between the steps; the centre of mass flies a parabola
    jump   a standing jump: crouch, push off, flight (centre of mass on a parabola), landing, recovery

``make_capture`` then looks at the motion through a pinhole camera and writes what MediaPipe would report:
world landmarks (hip-centred, metres, x right / y down / z away from the camera), normalised image
landmarks and a visibility per landmark - optionally with jitter, spikes and drop-outs.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402
from clip import Clip  # noqa: E402
from pixelsplat.skin import rot_x, rot_y  # noqa: E402

H, GROUND, SKEL = rig.H, rig.GROUND, rig.SKELETON
TAU = 2 * math.pi
EZ = np.array([0.0, 0.0, 1.0])
smoothstep = motion.smoothstep


def keyed(t: float, keys) -> float:
    """Value at time t of a track given as [(time, value), ...], eased between keys, held outside."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * smoothstep((t - t0) / max(t1 - t0, 1e-9))
    return keys[-1][1]


def hermite(t: float, t0: float, y0: float, v0: float, t1: float, y1: float, v1: float) -> float:
    """Cubic through (t0, y0) and (t1, y1) with the given slopes."""
    d = t1 - t0
    s = min(max((t - t0) / d, 0.0), 1.0)
    return ((2 * s ** 3 - 3 * s ** 2 + 1) * y0 + (s ** 3 - 2 * s ** 2 + s) * d * v0
            + (-2 * s ** 3 + 3 * s ** 2) * y1 + (s ** 3 - s ** 2) * d * v1)


def _plant_leg(rots: Dict[str, np.ndarray], R_pelvis, root, name: str, s: int, ankle, W_foot, fwd, toe: float,
               free: bool = False) -> float:
    """Two-bone IK of one leg onto a world ankle position, foot rotation given in the world.  A foot in
    the air (``free``) keeps its ankle within the joint's limits rather than its exact world rotation."""
    hip = R_pelvis @ (rig.HIP[s] - rig.PELVIS) + rig.PELVIS + root
    W_thigh, W_shin, reach = motion.leg_ik(hip, ankle, fwd, s)
    rots["thigh" + name] = R_pelvis.T @ W_thigh
    rots["shin" + name] = W_thigh.T @ W_shin
    rots["foot" + name] = W_shin.T @ W_foot
    if free:
        rots["foot" + name] = rt.limit_rot("foot" + name, rots["foot" + name])[0]
    rots["toe" + name] = rig.local_rot("toe" + name, pitch=toe)
    return reach


def _com_rel(rots) -> np.ndarray:
    return rt.center_of_mass(rt.fk(rots))


# ---------------------------------------------------------------- walk
def walk(seconds: float = 2.2, fps: float = 30.0, period: float = 1.1):
    """[(rots, root, contact (2,), flight)] of the walk loop travelling forward."""
    out = []
    for i in range(int(round(seconds * fps))):
        ph = i / fps / period
        info: dict = {}
        rots, root = motion.walk_rots(SKEL, ph % 1.0, motion.STRIDE * ph, info=info)
        out.append((rots, root, [info["L"]["contact"] is not None, info["R"]["contact"] is not None], False))
    return out


# ---------------------------------------------------------------- run
class Run:
    """A jog.  One cycle = two steps; each foot is planted for ``stance`` of the cycle and between two
    stances both feet are in the air.  Horizontal speed is constant; vertically the centre of mass falls
    freely during the flights and is caught and thrown back up during the stances."""
    period = 0.70  # seconds per cycle
    stance = 0.34  # fraction of the cycle a foot is planted
    stride = 0.95 * H  # distance per cycle
    ahead = 0.090 * H  # how far in front of the hip the ankle lands
    strike, toe_off = -6.0, 52.0  # foot pitch at touch-down / take-off, degrees
    lift = 0.17 * H  # ankle rise in mid swing
    base = -0.015 * H  # height of the centre of mass at take-off, relative to the rest pose's

    def foot(self, psi: float, s: int):
        psi %= 1.0
        A0, T0, Hc = rig.ANKLE[s], rig.TOE[s], rig.HEEL[s]
        about = lambda piv, pitch: piv + rot_x(pitch) @ (A0 - piv) - A0  # noqa: E731
        if psi < self.stance:
            t = psi / self.stance
            if t < 0.10:
                pitch = self.strike * (1 - smoothstep(t / 0.10))
                return about(Hc, pitch), pitch, 0.0, True
            if t < 0.18:
                return np.zeros(3), 0.0, 0.0, True
            pitch = self.toe_off * smoothstep((t - 0.18) / 0.82)
            return about(T0, pitch), pitch, -pitch, True
        t = (psi - self.stance) / (1 - self.stance)
        start, end = about(T0, self.toe_off), about(Hc, self.strike) + np.array([0.0, 0.0, self.stride])
        ankle = start + (end - start) * smoothstep(t)
        ankle[1] += self.lift * math.sin(math.pi * t ** 0.8) ** 2
        pitch = self.toe_off + (self.strike - self.toe_off) * smoothstep((t - 0.30) / 0.70) + 10.0 * math.sin(math.pi * t) * (1 - t)
        return ankle, pitch, -self.toe_off * (1 - smoothstep(t / 0.5)), False

    def com_height(self, phase: float) -> float:
        """Centre of mass height relative to its take-off height: a dip while a foot is planted, a
        free-fall parabola in the air - position and speed join at take-off and landing."""
        tau = (phase % 0.5) * self.period
        Ts, Tf = self.stance * self.period, (0.5 - self.stance) * self.period
        v0 = 0.5 * rt.GRAVITY * Tf
        if tau < Ts:
            return -v0 * Ts * (tau / Ts) * (1 - tau / Ts)
        tf = tau - Ts
        return v0 * tf - 0.5 * rt.GRAVITY * tf * tf

    def frame(self, time: float):
        phase = time / self.period
        c1 = math.cos(TAU * phase)
        mid = self.ahead / self.stride
        over = math.cos(TAU * (phase - 0.5 * self.stance))
        yaw_p = -8.0 * c1
        R_pelvis = rig.euler(pitch=8.0, yaw=yaw_p, roll=3.0 * over)
        advance = self.stride * phase
        rots = {"pelvis": R_pelvis}
        chest_yaw = 11.0 * c1
        rots["chest"] = rig.local_rot("chest", pitch=5.0, yaw=chest_yaw - yaw_p, roll=-2.5 * over)
        rots["neck"] = rig.local_rot("neck", pitch=-5.0)
        rots["head"] = rig.local_rot("head", pitch=-6.0, yaw=-chest_yaw)
        for name, s in rig.SIDES:
            sw = c1 * s
            rots["clav" + name] = rig.local_rot("clav" + name, yaw=-s * 3.0 * sw)
            rots["upperarm" + name] = rig.local_rot("upperarm" + name, pitch=-4.0 + 36.0 * sw, roll=s * 12.0)
            rots["forearm" + name] = rig.local_rot("forearm" + name, pitch=-(82.0 - 14.0 * sw))
            rots["hand" + name] = rig.local_rot("hand" + name, pitch=-8.0)
        feet = {}
        for name, s in rig.SIDES:
            psi = (phase + (0.0 if s > 0 else 0.5)) % 1.0
            rel, pitch, toe, planted = self.foot(psi, s)
            origin = np.array([0.0, 0.0, advance + self.stride * (mid - psi)])
            feet[s] = (rig.ANKLE[s] + origin + rel, pitch, toe, planted)
        fwd = rig.euler(yaw=0.5 * yaw_p) @ EZ
        com_target = np.array([0.0, self.base + self.com_height(phase), advance])
        root = com_target.copy()
        reach = 0.0
        for _ in range(4):  # the pose depends on the root (leg IK) and the root on the pose (centre of mass)
            reach = 0.0
            for name, s in rig.SIDES:
                ankle, pitch, toe, planted = feet[s]
                reach = max(reach, _plant_leg(rots, R_pelvis, root, name, s, ankle, rot_x(pitch), fwd, toe, free=not planted))
            root = com_target - (_com_rel(rots) - self.com_rest)
        return rots, root, [feet[1][3], feet[-1][3]], not (feet[1][3] or feet[-1][3]), reach

    com_rest = _com_rel({})


def run(seconds: float = 1.4, fps: float = 30.0, start: float = 0.0):
    r = Run()
    return [r.frame(start + i / fps)[:4] for i in range(int(round(seconds * fps)))]


# ---------------------------------------------------------------- jump
class Jump:
    """A standing jump: stand, crouch (arms back), push off (arms up), fly, land on the balls of the feet,
    sink, stand up.  On the ground the feet are planted and the legs follow by IK; in the air the legs are
    posed by angle and the centre of mass follows the parabola its take-off velocity gives."""
    t_crouch, t_bottom, t_off = 0.25, 0.80, 1.02  # seconds
    depth = 0.12 * H  # how far the pelvis sinks in the crouch
    rise = 0.02 * H  # pelvis above standing at take-off (heels are up)
    speed_up = 2.4  # pelvis speed at take-off, units / s
    speed_fwd = 1.5  # ... and forwards (the trunk swinging upright takes most of it back)
    lean = 0.11 * H  # pelvis moves this far back in the crouch
    heel_up = 45.0  # foot pitch at take-off
    sink, t_sink, t_up = 0.08 * H, 0.28, 0.55
    t_heel = 0.30  # the heels come down over this long after touch-down
    back = 0.10 * H  # ... and how far the hips go back while sinking  # landing: how deep, how long down, how long up again

    def __init__(self):
        # the upper body is keyed on where the landing is EXPECTED (a plain ballistic guess), so that the
        # pose in the air does not depend on the landing time it is used to find
        self.t_guess = self.t_off + 2.0 * self.speed_up / rt.GRAVITY
        eps = 1e-4
        a, b = self._ground(self.t_off - eps), self._ground(self.t_off)
        self.com0 = b[1] + _com_rel(b[0])
        self.v0 = (self.com0 - (a[1] + _com_rel(a[0]))) / eps  # centre of mass velocity at take-off
        self.leg0 = {n: (rig.joint_angles("thigh" + n, b[0]["thigh" + n]), rig.joint_angles("shin" + n, b[0]["shin" + n])[0],
                         rig.joint_angles("foot" + n, b[0]["foot" + n])[0]) for n, _ in rig.SIDES}
        # landing: the first moment a sole point reaches the ground
        t = self.t_off + 0.05
        while self._air(t)[2] > GROUND and t < self.t_off + 3.0:
            t += 0.0005
        self.t_land = t
        rots, root, _ = self._air(t)
        prev = self._air(t - eps)
        M = rt.fk(rots, root)
        self.prints = {}
        for name, s in rig.SIDES:
            heading, pitch = rt.heading_pitch(M[SKEL.index["foot" + name]][:, :3])
            ankle = rt.at(M, "foot" + name, rig.ANKLE[s])
            a0 = rt.footprint_ankle((0.0, 0.0), heading, pitch, s)[0]
            self.prints[s] = (ankle[[0, 2]] - a0[[0, 2]], heading, pitch)
        self.root_land, self.vel_land = root, (root - prev[1]) / eps
        self.t_end = self.t_land + self.t_sink + self.t_up + 0.25

    # ---- upper body, the same tracks through all phases (times relative to the phases)
    def _upper(self, t: float) -> Tuple[Dict[str, np.ndarray], float]:
        tl = self.t_guess
        tb, tu = tl + self.t_sink, tl + self.t_sink + self.t_up
        pelvis = keyed(t, [(self.t_crouch, 0.0), (self.t_bottom, 24.0), (self.t_off, 6.0), (tl - 0.1, 10.0), (tb, 20.0), (tu, 0.0)])
        chest = keyed(t, [(self.t_crouch, 0.0), (self.t_bottom, 14.0), (self.t_off, -2.0), (tl - 0.1, 6.0), (tb, 12.0), (tu, 0.0)])
        head = keyed(t, [(self.t_crouch, 0.0), (self.t_bottom, -7.0), (self.t_off, 0.0), (tb, -6.0), (tu, 0.0)])
        arm = keyed(t, [(self.t_crouch, 2.0), (self.t_bottom, 44.0), (self.t_off + 0.06, -150.0), (tl - 0.12, -95.0),
                        (tb, -25.0), (tu, 2.0)])
        elbow = keyed(t, [(self.t_crouch, 8.0), (self.t_bottom, 30.0), (self.t_off + 0.06, 18.0), (tl - 0.12, 45.0), (tb, 30.0), (tu, 8.0)])
        rots = {"chest": rig.local_rot("chest", pitch=chest), "neck": rig.local_rot("neck", pitch=0.4 * head),
                "head": rig.local_rot("head", pitch=0.6 * head)}
        for name, s in rig.SIDES:
            rots["upperarm" + name] = rig.local_rot("upperarm" + name, pitch=arm, roll=s * 10.0)
            rots["forearm" + name] = rig.local_rot("forearm" + name, pitch=-elbow)
        return rots, pelvis

    def _ground(self, t: float):
        """Before take-off: feet flat where they stand (heels rising at the end), pelvis on a set path."""
        rots, pelvis = self._upper(t)
        R_pelvis = rig.euler(pitch=pelvis)
        rots["pelvis"] = R_pelvis
        if t <= self.t_bottom:
            y = -self.depth * smoothstep((t - self.t_crouch) / (self.t_bottom - self.t_crouch))
        else:
            y = hermite(t, self.t_bottom, -self.depth, 0.0, self.t_off, self.rise, self.speed_up)
        if t <= self.t_bottom:
            z = -self.lean * smoothstep((t - self.t_crouch) / (self.t_bottom - self.t_crouch))
        else:
            z = hermite(t, self.t_bottom, -self.lean, 0.0, self.t_off, 0.035 * H, self.speed_fwd)
        root = np.array([0.0, y, z])
        pitch = self.heel_up * smoothstep((t - (self.t_off - 0.21)) / 0.21)
        for name, s in rig.SIDES:
            ankle = rig.TOE[s] + rot_x(pitch) @ (rig.ANKLE[s] - rig.TOE[s])
            _plant_leg(rots, R_pelvis, root, name, s, ankle, rot_x(pitch), EZ, -pitch)
        return rots, root

    def _air(self, t: float):
        """In flight: legs by angle, root from the centre of mass on its parabola."""
        tf = t - self.t_off
        rots, pelvis = self._upper(t)
        R_pelvis = rig.euler(pitch=pelvis)
        rots["pelvis"] = R_pelvis
        u = smoothstep(tf / 0.22)  # into the tuck
        d = smoothstep((tf - 0.24) / 0.22)  # and out of it, reaching for the ground
        for name, s in rig.SIDES:
            (tp, ty, tr), sp, fp = self.leg0[name]
            thigh = tp + (-38.0 - tp) * u + 14.0 * d
            shin = sp + (62.0 - sp) * u - 30.0 * d
            foot = fp + (22.0 - fp) * u - 8.0 * d
            rots["thigh" + name] = rig.local_rot("thigh" + name, thigh, ty, tr)
            rots["shin" + name] = rig.local_rot("shin" + name, pitch=shin)
            rots["foot" + name] = rig.local_rot("foot" + name, pitch=foot)
            rots["toe" + name] = rig.local_rot("toe" + name, pitch=self._air_toe(tf))
        com = self.com0 + self.v0 * tf
        com[1] -= 0.5 * rt.GRAVITY * tf * tf
        root = com - _com_rel(rots)
        M = rt.fk(rots, root)
        low = min(rt.at(M, "foot" + n, p)[1] for n, s in rig.SIDES for p in (rig.HEEL[s], rt._ball_ground(s)))
        low = min(low, min(rt.at(M, "toe" + n, [rig.TOE_TIP[s][0], GROUND, rig.TOE_TIP[s][2]])[1] for n, s in rig.SIDES))
        return rots, root, low

    def _air_toe(self, tf: float) -> float:
        """Toe hinge in the air: relaxes after the push-off, bends up again as the ground comes."""
        ready = smoothstep((tf - (self.t_guess - self.t_off - 0.14)) / 0.12)
        return -self.heel_up * (1 - smoothstep(tf / 0.15)) - 28.0 * ready

    def _landed(self, t: float):
        """After touch-down: feet on their footprints, heels coming down, pelvis sinking then rising."""
        rots, pelvis = self._upper(t)
        R_pelvis = rig.euler(pitch=pelvis)
        rots["pelvis"] = R_pelvis
        tl = t - self.t_land
        y0, vy = self.root_land[1], self.vel_land[1]
        if tl <= self.t_sink:
            y = hermite(t, self.t_land, y0, vy, self.t_land + self.t_sink, -self.sink, 0.0)
        else:
            y = -self.sink * (1 - smoothstep((tl - self.t_sink) / self.t_up))
        # forwards: the pelvis ends over the feet; on the way down the hips go back (as in the crouch)
        z_feet = float(np.mean([rt.footprint_ankle(self.prints[s][0], 0.0, 0.0, s)[0][2] for s in (1, -1)]))
        if tl <= self.t_sink:
            z = hermite(t, self.t_land, self.root_land[2], self.vel_land[2], self.t_land + self.t_sink, z_feet - self.back, 0.0)
        else:
            z = z_feet - self.back * (1 - smoothstep((tl - self.t_sink) / self.t_up))
        root = np.array([self.root_land[0], y, z])
        for name, s in rig.SIDES:
            G, heading, pitch0 = self.prints[s]
            pitch = pitch0 * (1 - smoothstep(tl / self.t_heel))
            ankle, W = rt.footprint_ankle(G, heading, pitch, s)
            toe = self._air_toe(self.t_land - self.t_off)
            toe += (-max(pitch, 0.0) - toe) * smoothstep(tl / 0.06)
            _plant_leg(rots, R_pelvis, root, name, s, ankle, W, EZ, toe)
        return rots, root

    def frame(self, t: float):
        if t <= self.t_off:
            rots, root = self._ground(t)
            return rots, root, [True, True], False
        if t < self.t_land:
            rots, root, _ = self._air(t)
            return rots, root, [False, False], True
        rots, root = self._landed(t)
        return rots, root, [True, True], False


def jump(fps: float = 30.0, seconds: Optional[float] = None):
    j = Jump()
    n = int(round((seconds or j.t_end) * fps))
    return [j.frame(i / fps) for i in range(n)]


MOTIONS = {"walk": walk, "run": run, "jump": jump}


# ---------------------------------------------------------------- motion -> what a camera + MediaPipe would report
def to_camera_world(frames, course: float = 0.0):
    """Turn the whole motion about the vertical axis: course 0 = coming towards the camera, 90 = crossing
    the picture from left to right (travelling along +x)."""
    Rc = rot_y(course)
    out = []
    for rots, root, contact, flight in frames:
        r = dict(rots)
        r["pelvis"] = Rc @ np.asarray(rots.get("pelvis", np.eye(3)), float)
        out.append((r, Rc @ np.asarray(root, float), contact, flight))
    return out


def truth_clip(frames, fps: float, name: str = "synthetic") -> Clip:
    full = []
    for rots, _, _, _ in frames:
        r = dict(rots)
        motion.drive_helpers(r)
        full.append(r)
    return Clip.from_rots(fps, full, [f[1] for f in frames], contact=np.array([f[2] for f in frames], np.float32),
                          flight=np.array([f[3] for f in frames], bool), meta=dict(name=name, truth=True))


def make_capture(frames, fps: float, size=(1280, 720), fov_deg: float = 50.0, distance: float = 7.0,
                 camera_height: float = 0.0, noise_m: float = 0.0, image_noise_px: float = 0.0, spikes: int = 0,
                 dropouts: int = 0, person_scale: float = 1.0, seed: int = 0, name: str = "synthetic") -> dict:
    """The capture dict ``retarget.retarget`` takes, from frames already in the camera's world.

    The camera stands ``distance`` units in front of the origin (on +z, looking along -z) at the height
    of the standing pelvis + ``camera_height``.  ``noise_m`` = jitter of every world landmark (metres,
    standard deviation), ``spikes`` = how many single-frame outliers of 0.3 m, ``dropouts`` = how many
    landmark tracks lose 2-6 frames (visibility 0, garbage position)."""
    rng = np.random.default_rng(seed)
    T = len(frames)
    Wd, Ht = size
    focal = 0.5 * Wd / math.tan(math.radians(fov_deg) / 2.0)
    cam = np.array([0.0, rig.PELVIS[1] + camera_height, distance])
    world = np.zeros((T, 33, 3))
    image = np.zeros((T, 33, 3))
    for t, (rots, root, _, _) in enumerate(frames):
        P = rt.rig_landmarks(rt.fk(rots, root))
        hips = 0.5 * (P[rt.IDX["left_hip"]] + P[rt.IDX["right_hip"]])
        world[t] = ((P - hips) / rt.UNITS_PER_M * person_scale) @ rt.MP_TO_RIG.T
        depth = cam[2] - P[:, 2]
        image[t, :, 0] = (0.5 * Wd + focal * (P[:, 0] - cam[0]) / depth) / Wd
        image[t, :, 1] = (0.5 * Ht - focal * (P[:, 1] - cam[1]) / depth) / Ht
        image[t, :, 2] = -(P[:, 2] - hips[2]) / rt.UNITS_PER_M
    vis = np.ones((T, 33))
    if noise_m > 0:
        world += rng.normal(0.0, noise_m, world.shape)
    if image_noise_px > 0:
        image[..., :2] += rng.normal(0.0, image_noise_px, (T, 33, 2)) / np.array([Wd, Ht])
    for _ in range(spikes):
        t, j = rng.integers(1, max(T - 1, 2)), rng.integers(0, 33)
        world[t, j] += rng.normal(0.0, 0.3, 3)
    for _ in range(dropouts):
        j, n = rng.integers(11, 33), rng.integers(2, 7)
        t = rng.integers(1, max(T - n - 1, 2))
        vis[t:t + n, j] = rng.uniform(0.0, 0.3, len(vis[t:t + n, j]))
        world[t:t + n, j] += rng.normal(0.0, 0.15, world[t:t + n, j].shape)
    return dict(world=world.astype(np.float32), image=image.astype(np.float32), visibility=vis.astype(np.float32),
                presence=np.ones((T, 33), np.float32), detected=np.ones(T, bool), fps=float(fps),
                size=np.array(size, np.float32), frames=np.arange(T),
                meta=dict(video=name, synthetic=True, noise_m=noise_m, image_noise_px=image_noise_px, spikes=spikes,
                          dropouts=dropouts, person_scale=person_scale, seed=seed, camera=dict(distance=distance, fov_deg=fov_deg)))


def synthetic(kind: str, fps: float = 30.0, course: float = 0.0, **capture_kw) -> Tuple[dict, Clip]:
    """(capture, truth clip) of one of the synthetic motions."""
    frames = to_camera_world(MOTIONS[kind](fps=fps), course)
    return make_capture(frames, fps, name="synthetic-" + kind, **capture_kw), truth_clip(frames, fps, "synthetic-" + kind)

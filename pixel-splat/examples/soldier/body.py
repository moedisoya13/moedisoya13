"""Soldier body: joint beads, turntables and the bare mannequin, one solid per bone.

Layers 2-4 of the soldier (see README.md).  Every bone that carries surface gets ONE signed distance
function, defined in the rest pose:

    bone solid = flesh (muscle masses of that body segment)
               U bead        - a ball centred on the joint the bone turns about (limb joints), or
               U turntable   - a disc + ball centred on the joint of the bone that sits on it
               U sockets     - a slightly smaller ball around the joint of every child bone

Because a bone and its child both contain a ball around their common joint, and the joint is the
one point that never moves relative to either of them, the two solids overlap in EVERY pose: the
surface cannot open, whatever the rotation.  The bead is the bigger of the two balls, so the
parent's end cap always stays hidden inside it and only one surface is ever seen at a joint.

Nothing here knows about splats or rendering; soldier.py meshes these solids bone by bone.
"""
from __future__ import annotations

import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Dict, List, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import rig  # noqa: E402
from pixelsplat import sdf  # noqa: E402

H, GROUND = rig.H, rig.GROUND
F32 = np.float32
FLESH, BEAD, TURNTABLE = 0, 1, 2  # surface kinds
ROUGHNESS = 0.62
BIG = 1e3


def u(*a):
    """Numbers given as fractions of the body height -> world units (float32 array or scalar)."""
    return F32(a[0] * H) if len(a) == 1 else np.array(a, F32) * F32(H)


def P(v):
    return np.asarray(v, F32)


def at(base, dx=0.0, dy=0.0, dz=0.0):
    """A point ``base`` moved by an offset given in fractions of the body height."""
    return P(base) + np.array([dx, dy, dz], F32) * F32(H)


# ---------------------------------------------------------------- extra primitives
def disc(p, c, r, half_h, rnd):
    """Upright (y axis) cylinder with a rounded rim: the turntable."""
    q = p - P(c)
    dr = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - (r - rnd)
    dy = np.abs(q[..., 1]) - (half_h - rnd)
    return np.minimum(np.maximum(dr, dy), 0) + np.sqrt(np.maximum(dr, 0) ** 2 + np.maximum(dy, 0) ** 2) - rnd


def round_box(q, c, half, rnd):
    d = np.abs(q - P(c)) - (P(half) - rnd)
    return np.sqrt((np.maximum(d, 0) ** 2).sum(-1)) + np.minimum(d.max(-1), 0) - rnd


def blend(ds, k):
    return sdf.union(ds, float(k))


# ---------------------------------------------------------------- one solid per bone
# Each builder returns {kind: distance}; the bone solid is the hard union (min) of its kinds, which
# leaves a crisp crease around every bead and turntable.
def _pelvis(p):
    w = rig.WAIST
    flesh = blend([
        sdf.ellipsoid(p, at(rig.PELVIS, 0, 0.004, -0.003), u(0.083, 0.058, 0.056)),  # hip bones
        sdf.ellipsoid(p, at(rig.PELVIS, 0.043, -0.030, -0.032), u(0.045, 0.046, 0.040)),  # buttocks
        sdf.ellipsoid(p, at(rig.PELVIS, -0.043, -0.030, -0.032), u(0.045, 0.046, 0.040)),
        sdf.ellipsoid(p, at(rig.PELVIS, 0, -0.040, 0.003), u(0.045, 0.040, 0.047)),  # crotch
        sdf.ellipsoid(p, at(rig.PELVIS, 0, 0.012, 0.019), u(0.064, 0.050, 0.039)),  # lower belly
        sdf.round_cone(p, at(rig.PELVIS, 0, 0.012, 0), w, u(0.066), u(0.058)),  # up to the waist
    ], u(0.022))
    for s in (1, -1):
        flesh = np.minimum(flesh, sdf.sphere(p, rig.HIP[s], rig.SOCKET["hip"] * H))  # hip sockets
    t = rig.TURNTABLE["waist"]
    table = np.minimum(disc(p, w, t["radius"] * H, t["half_height"] * H, u(0.004)), sdf.sphere(p, w, t["ball"] * H))
    return {FLESH: flesh, TURNTABLE: table}


def _chest(p):
    w, n = rig.WAIST, rig.NECK
    t = rig.TURNTABLE["waist"]
    parts = [
        sdf.ellipsoid(p, at(w, 0, 0.120, -0.001), u(0.0845, 0.103, 0.0585)),  # rib cage
        sdf.ellipsoid(p, at(w, 0, 0.050, 0.004), u(0.070, 0.058, 0.0545)),  # belly above the waist
        sdf.round_cone(p, at(w, 0, 0.006, 0), at(w, 0, 0.075, 0.003), t["inner"] * H, u(0.064)),
        sdf.round_cone(p, at(n, 0, 0.008, -0.006), at(n, 0, -0.045, -0.004), u(0.034), u(0.050)),  # neck root
    ]
    for s in (1, -1):
        parts += [
            sdf.ellipsoid(p, at(w, s * 0.040, 0.150, 0.0255), u(0.047, 0.033, 0.0275)),  # chest muscle (a flat plate)
            sdf.ellipsoid(p, at(w, s * 0.047, 0.125, -0.030), u(0.0445, 0.072, 0.031)),  # shoulder blade / lats
            sdf.round_cone(p, at(n, 0, 0.004, -0.008), at(rig.SHOULDER[s], -s * 0.036, 0.004, -0.006),
                           u(0.029), u(0.023)),  # trapezius slope
        ]
    flesh = blend(parts, u(0.020))
    flesh = np.minimum(flesh, sdf.sphere(p, n, rig.SOCKET["neck"] * H))
    for s in (1, -1):
        flesh = np.minimum(flesh, sdf.sphere(p, rig.CLAV[s], rig.SOCKET["clavicle"] * H))
    flesh = np.minimum(flesh, sdf.sphere(p, w, t["inner"] * H))  # sits inside the turntable ball
    return {FLESH: flesh}


def _neck(p):
    n, hd = rig.NECK, rig.HEAD
    t = rig.TURNTABLE["head"]
    flesh = sdf.round_cone(p, n, hd, u(0.0325), u(0.0300))
    bead = sdf.sphere(p, n, rig.BEAD["neck"] * H)
    table = np.minimum(disc(p, hd, t["radius"] * H, t["half_height"] * H, u(0.003)), sdf.sphere(p, hd, t["ball"] * H))
    return {FLESH: flesh, BEAD: bead, TURNTABLE: table}


def _head(p):
    hd = rig.HEAD
    top = rig.VERTEX[1]
    chin_y = rig.CHIN[1]
    ry = u(0.0585)
    skull = sdf.ellipsoid(p, P((0.0, top - ry, -0.0045 * H)), P((u(0.0440), ry, u(0.0545))))
    jaw_c = P((0.0, chin_y + u(0.037), u(0.0155)))
    jaw = sdf.ellipsoid(p, jaw_c, u(0.0355, 0.037, 0.039))
    face = sdf.ellipsoid(p, P((0.0, rig.EYE[1] - u(0.011), u(0.025))), u(0.0365, 0.042, 0.0305))
    chin = sdf.sphere(p, P((0.0, chin_y + u(0.0125), u(0.0385))), u(0.0125))
    flesh = sdf.smin(blend([skull, jaw, face], u(0.016)), chin, u(0.009))
    eye_y = rig.EYE[1]
    brow = sdf.capsule(p, P((-u(0.021), eye_y + u(0.0125), u(0.0455))), P((u(0.021), eye_y + u(0.0125), u(0.0455))),
                       u(0.0072))
    nose = sdf.round_cone(p, P((0.0, eye_y + u(0.002), u(0.050))), P((0.0, eye_y - u(0.0185), u(0.060))),
                          u(0.0061), u(0.0083))
    flesh = sdf.smin(sdf.smin(flesh, brow, u(0.006)), nose, u(0.004))
    for s in (1, -1):
        ear = sdf.ellipsoid(p, P((s * u(0.0445), eye_y - u(0.007), -u(0.0045))), u(0.0058, 0.0167, 0.0100))
        flesh = sdf.smin(flesh, ear, u(0.002))
        socket = sdf.sphere(p, P((s * u(0.0180), eye_y, u(0.0585))), u(0.0105))  # shallow eye socket
        flesh = sdf.smax(flesh, -socket, u(0.004))
    flesh = np.minimum(flesh, sdf.sphere(p, hd, rig.TURNTABLE["head"]["inner"] * H))
    return {FLESH: flesh}


def _clav(p, s):
    c, sh = rig.CLAV[s], rig.SHOULDER[s]
    mid = at(c, s * 0.020, 0.012, -0.014)
    flesh = np.minimum(sdf.round_cone(p, mid, sh, u(0.0245), u(0.0261)), sdf.capsule(p, c, mid, u(0.0211)))
    flesh = np.minimum(flesh, sdf.sphere(p, sh, rig.SOCKET["shoulder"] * H))
    return {FLESH: flesh, BEAD: sdf.sphere(p, c, rig.BEAD["clavicle"] * H)}


def _along(a, b, t, dx=0.0, dy=0.0, dz=0.0):
    return at(P(a) + F32(t) * (P(b) - P(a)), dx, dy, dz)


def _upperarm(p, s):
    a, b = rig.SHOULDER[s], rig.ELBOW[s]
    flesh = blend([
        sdf.round_cone(p, a, b, u(0.0270), rig.SOCKET["elbow"] * H),
        sdf.ellipsoid(p, _along(a, b, 0.20, s * 0.002), u(0.0265, 0.047, 0.029)),  # deltoid
        sdf.ellipsoid(p, _along(a, b, 0.56, 0, 0, 0.007), u(0.0220, 0.047, 0.024)),  # biceps
        sdf.ellipsoid(p, _along(a, b, 0.50, 0, 0, -0.008), u(0.0215, 0.050, 0.022)),  # triceps
    ], u(0.011))
    flesh = np.minimum(flesh, sdf.sphere(p, b, rig.SOCKET["elbow"] * H))
    return {FLESH: flesh, BEAD: sdf.sphere(p, a, rig.BEAD["shoulder"] * H)}


def _forearm(p, s):
    a, b = rig.ELBOW[s], rig.WRIST[s]
    flesh = blend([
        sdf.round_cone(p, a, b, u(0.0215), rig.SOCKET["wrist"] * H),
        sdf.ellipsoid(p, _along(a, b, 0.30, 0, 0, 0.002), u(0.0228, 0.047, 0.0245)),  # forearm muscles
    ], u(0.011))
    flesh = np.minimum(flesh, sdf.sphere(p, b, rig.SOCKET["wrist"] * H))
    return {FLESH: flesh, BEAD: sdf.sphere(p, a, rig.BEAD["elbow"] * H)}


# ---- the mitten hand: palm (bone ``hand``) + the four fingers as one block on a knuckle hinge (``fingers``)
# + the thumb on a ball at its base (``thumb``).  Same principle as every other joint: the moving part
# carries the bead (a barrel along the knuckle line / a ball), the palm the slightly smaller socket around
# the same centre, so palm and fingers overlap at any curl and the fist cannot open a gap at the knuckles.
FINGERS = ((0.0150, 0.92), (0.0050, 1.00), (-0.0050, 0.94), (-0.0150, 0.78))  # (forward offset, length factor)
FINGER_SEG = (0.0245, 0.0265)  # length of the near / far half of the longest finger (fractions of H)
FINGER_BEND = (6.0, 34.0)  # degrees each half already leans towards the palm in the open, relaxed mitten
FINGER_R = (0.0066, 0.0060, 0.0053)  # radius at the knuckle, at the bend, at the tip


def hand_frame(s):
    """Unit vectors of the hand: along the arm, towards the palm side (the body), forward (thumb side)."""
    return rig.hand_axes(s)


def _hand_coords(p, s):
    """World points -> (along, palmwards, forward) from the wrist, in fractions of H."""
    a, n, w = hand_frame(s)
    d = p - P(rig.WRIST[s])
    return np.stack([d @ P(a), d @ P(n), d @ P(w)], -1) / F32(H)


def _barrel(q, c, half, r):
    """Capsule along the hand's forward axis (the knuckle line), in hand coordinates."""
    return sdf.capsule(q, P((c[0], c[1], c[2] - half)), P((c[0], c[1], c[2] + half)), r)


def _hand(p, s):
    q = _hand_coords(p, s)
    palm = round_box(q, (0.0310, 0.0, 0.002), (0.0255, 0.0075, 0.0220), 0.0065)  # starts inside the wrist bead
    mount = sdf.round_cone(q, P((0.0200, 0.0015, 0.0100)), P(rig.THUMB_BASE), 0.0085, rig.SOCKET["thumb"])  # ball of the thumb
    flesh = sdf.smin(palm, mount, 0.004)
    flesh = np.minimum(flesh, _barrel(q, rig.KNUCKLE, rig.KNUCKLE_HALF, rig.SOCKET["knuckle"]))  # knuckle socket
    flesh = np.minimum(flesh, sdf.sphere(q, P(rig.THUMB_BASE), rig.SOCKET["thumb"]))  # thumb socket
    return {FLESH: flesh * F32(H), BEAD: sdf.sphere(p, rig.WRIST[s], rig.BEAD["wrist"] * H)}


def _fingers(p, s):
    q = _hand_coords(p, s)
    kx, ky, _ = rig.KNUCKLE
    a1, a2 = (np.radians(v) for v in FINGER_BEND)
    fingers = []
    for wz, ln in FINGERS:
        l1, l2 = FINGER_SEG[0] * ln, FINGER_SEG[1] * ln
        k0 = P((kx, ky, wz))
        k1 = P((kx + l1 * np.cos(a1), ky + l1 * np.sin(a1), wz))
        k2 = P((k1[0] + l2 * np.cos(a2), k1[1] + l2 * np.sin(a2), wz))
        fingers.append(sdf.smin(sdf.round_cone(q, k0, k1, FINGER_R[0], FINGER_R[1]),
                                sdf.round_cone(q, k1, k2, FINGER_R[1], FINGER_R[2]), 0.002))
    # the web: the near half of the four fingers is one slab (a mitten), so solid material runs out of the
    # knuckle barrel into the block everywhere along the knuckle line, not only down the middle of each finger
    web = round_box(q, (kx + 0.0105, ky + 0.0012, 0.0), (0.0115, FINGER_R[1] - 0.0008, 0.0165), 0.0040)
    flesh = sdf.smin(blend(fingers, 0.0045), web, 0.003)
    bead = _barrel(q, rig.KNUCKLE, rig.KNUCKLE_HALF, rig.BEAD["knuckle"])
    return {FLESH: flesh * F32(H), BEAD: bead * F32(H)}


def _thumb(p, s):
    q = _hand_coords(p, s)
    t0, t1, t2 = P(rig.THUMB_BASE), P((0.041, 0.007, 0.034)), P(rig.THUMB_TIP)
    thumb = sdf.smin(sdf.round_cone(q, t0, t1, 0.0080, 0.0062), sdf.round_cone(q, t1, t2, 0.0062, 0.0052), 0.002)
    return {FLESH: thumb * F32(H), BEAD: sdf.sphere(q, t0, rig.BEAD["thumb"]) * F32(H)}


def _thigh(p, s):
    a, b = rig.HIP[s], rig.KNEE[s]
    flesh = blend([
        sdf.round_cone(p, a, b, u(0.0420), rig.SOCKET["knee"] * H),
        sdf.ellipsoid(p, _along(a, b, 0.42, s * 0.002, 0, 0.012), u(0.0335, 0.090, 0.0325)),  # front of the thigh
        sdf.ellipsoid(p, _along(a, b, 0.45, 0, 0, -0.012), u(0.0320, 0.085, 0.0290)),  # back of the thigh
    ], u(0.014))
    flesh = np.minimum(flesh, sdf.sphere(p, b, rig.SOCKET["knee"] * H))
    return {FLESH: flesh, BEAD: sdf.sphere(p, a, rig.BEAD["hip"] * H)}


def _shin(p, s):
    a, b = rig.KNEE[s], rig.ANKLE[s]
    flesh = blend([
        sdf.round_cone(p, a, b, u(0.0265), rig.SOCKET["ankle"] * H),
        sdf.ellipsoid(p, _along(a, b, 0.30, 0, 0, -0.0135), u(0.0250, 0.064, 0.0265)),  # calf
    ], u(0.011))
    flesh = np.minimum(flesh, sdf.sphere(p, b, rig.SOCKET["ankle"] * H))
    return {FLESH: flesh, BEAD: sdf.sphere(p, a, rig.BEAD["knee"] * H)}


def _hinge(p, c, r, half_w):
    """Barrel along x around a hinge: both bones of a hinge joint contain it."""
    return sdf.capsule(p, at(c, -half_w), at(c, half_w), r)


TOE_BARREL = rig.FOOT_W / H / 2 - rig.TOE_R  # half length of the toe hinge barrel (fraction of H)


def _foot(p, s):
    a, t = rig.ANKLE[s], rig.TOE[s]
    x = a[0]
    g = GROUND
    ry = u(0.0222)
    hz = (rig.HEEL_ROUND - rig.HEEL_BACK) * rig.FOOT_LEN  # centre of the rounded heel
    heel = sdf.ellipsoid(p, P((x, g + ry, hz)), P((u(0.0190), ry, rig.HEEL_ROUND * rig.FOOT_LEN)))  # touches the ground
    flesh = blend([
        heel,
        sdf.round_cone(p, P((x, g + u(0.020), hz + u(0.004))), t, u(0.0200), rig.TOE_R * H),
        sdf.round_cone(p, at(a, 0, -0.006, 0.006), P((x, g + u(0.0225), t[2] - u(0.018))), u(0.0200), u(0.0145)),
        sdf.ellipsoid(p, P((x, g + u(0.0150), t[2] - u(0.0220))), P((rig.FOOT_W / 2, u(0.0152), u(0.0250)))),
    ], u(0.009))
    # nothing of the foot reaches past the toe hinge except the hinge barrel itself: the foot can then
    # roll up onto the barrel (heel-off) without anything dipping below the ground
    flesh = np.maximum(flesh, p[..., 2] - (t[2] + u(0.002)))
    flesh = np.minimum(flesh, _hinge(p, t, rig.SOCKET["toe"] * H, TOE_BARREL))
    flesh = np.maximum(flesh, g - p[..., 1])  # flat sole
    return {FLESH: flesh, BEAD: sdf.sphere(p, a, rig.BEAD["ankle"] * H)}


def _toe(p, s):
    t, tip = rig.TOE[s], rig.TOE_TIP[s]
    half_len = (tip[2] - t[2] + u(0.010)) / 2
    flesh = sdf.ellipsoid(p, P((t[0], GROUND + u(0.0125), tip[2] - half_len)),
                          P((rig.FOOT_W / 2 - u(0.001), u(0.0128), half_len)))
    bead = _hinge(p, t, rig.BEAD["toe"] * H, TOE_BARREL)
    return {FLESH: np.maximum(flesh, GROUND - p[..., 1]), BEAD: np.maximum(bead, GROUND - p[..., 1])}


def _sided(fn, s):
    return lambda p: fn(p, s)


BUILDERS: Dict[str, Callable] = {"pelvis": _pelvis, "chest": _chest, "neck": _neck, "head": _head}
for _side, _s in rig.SIDES:
    for _name, _fn in (("clav", _clav), ("upperarm", _upperarm), ("forearm", _forearm), ("hand", _hand),
                       ("thigh", _thigh), ("shin", _shin), ("foot", _foot), ("toe", _toe),
                       ("fingers", _fingers), ("thumb", _thumb)):
        BUILDERS[_name + _side] = _sided(_fn, _s)
BONES: List[str] = rig.GEOMETRY_BONES + rig.HAND_BONES  # bones of the bare mannequin (the hands' fingers last)
assert set(BONES) == set(BUILDERS)

# ---------------------------------------------------------------- outfit (stage 2)
# An outfit dresses the mannequin without changing it: it adds layers to bone solids (and solids to
# helper bones), and paints.  It is any object / module with
#   BONES             extra bones that get a solid (skirt panels, cape, plume)
#   layers(bone, p)   -> {layer name: distance}, merged into the bone's solid (may be empty)
#   paint(bone, p, layer) -> albedo (N,3), roughness (N,), metallic (N,)
#   box(bone)         -> rest-pose box of the dressed bone solid, or None to keep the body's
#   LIMITS            (optional) tighter rotation limits while it is worn
#   VOXEL_SCALE       (optional) finer sculpt grid per bone
# ``wear`` puts one on for every function of this module; ``None`` = the bare mannequin.
_OUTFIT = None


def wear(outfit):
    """Put an outfit on (None = bare mannequin).  Returns the one worn before."""
    global _OUTFIT
    prev, _OUTFIT = _OUTFIT, outfit
    rig.LIMIT_OVERRIDE = dict(getattr(outfit, "LIMITS", {}) or {})
    return prev


@contextmanager
def wearing(outfit):
    prev = wear(outfit)
    try:
        yield outfit
    finally:
        wear(prev)


def outfit():
    return _OUTFIT


def bones() -> List[str]:
    """Bones that carry a solid: the mannequin's, plus the outfit's helper bones."""
    return BONES + (list(_OUTFIT.BONES) if _OUTFIT is not None else [])


def bone_layers(bone: str, p) -> Dict[object, np.ndarray]:
    """{layer: distance} of one bone: FLESH / BEAD / TURNTABLE of the body + the outfit's named layers."""
    p = np.asarray(p, F32)
    d = dict(BUILDERS[bone](p)) if bone in BUILDERS else {}
    if _OUTFIT is not None:
        d.update(_OUTFIT.layers(bone, p))
    return d


def body_sdf(bone: str, p) -> np.ndarray:
    """Signed distance to one bone of the BARE mannequin, whatever is worn."""
    d = None
    for e in BUILDERS[bone](np.asarray(p, F32)).values():
        d = e if d is None else np.minimum(d, e)
    return d


def bone_sdf(bone: str, p) -> np.ndarray:
    """Signed distance to one bone's solid (rest pose): hard union of its layers."""
    d = None
    for e in bone_layers(bone, p).values():
        d = e if d is None else np.minimum(d, e)
    return d


def bone_layer(bone: str, p) -> np.ndarray:
    """Which layer's surface is nearest at each point (object array of layer keys)."""
    k = bone_layers(bone, p)
    keys = np.empty(len(k), object)
    keys[:] = list(k)
    return keys[np.argmin(np.stack(list(k.values()), -1), -1)]


RIG_COLORS = {FLESH: (0.80, 0.74, 0.64), BEAD: (0.80, 0.50, 0.20), TURNTABLE: (0.30, 0.37, 0.52)}
RIG_OUTFIT_COLOR = (0.56, 0.58, 0.62)  # outfit layers in the rig debug paint


def paint(bone: str, p, mode: str = "costume"):
    """Material at surface points of one bone: (albedo sRGB (N,3), roughness (N,), metallic (N,)).

    mode "costume": the outfit's materials (the bare mannequin has none, so it falls back to "rig");
    mode "rig": debug colours - pale wood, brass joint beads, steel-blue turntables, grey outfit."""
    p = np.asarray(p, F32)
    layer = bone_layer(bone, p)
    if mode == "costume" and _OUTFIT is not None:
        alb, rough, metal = _OUTFIT.paint(bone, p, layer)
        return np.clip(alb, 0.02, 1).astype(F32), np.clip(rough, 0.05, 1).astype(F32), np.clip(metal, 0, 1).astype(F32)
    alb = np.array([RIG_COLORS.get(k, RIG_OUTFIT_COLOR) for k in layer], F32)
    return alb, np.full(len(p), ROUGHNESS, F32), np.zeros(len(p), F32)


# ---------------------------------------------------------------- boxes
def _box(points, pad):
    pts = np.stack([P(x) for x in points])
    return pts.min(0) - F32(pad), pts.max(0) + F32(pad)


def _boxes() -> Dict[str, Tuple[np.ndarray, np.ndarray]]:
    """Generous rest-pose boxes around every bone solid (soldier.sculpt checks that they really fit)."""
    w = rig.WAIST
    b = {
        "pelvis": (at(rig.PELVIS, -0.115, -0.125, -0.095), at(w, 0.115, 0.080, 0.095)),
        "chest": (at(w, -0.130, -0.080, -0.090), at(rig.NECK, 0.130, 0.065, 0.100)),
        "neck": _box([rig.NECK, rig.HEAD], u(0.056)),
        "head": (at(rig.HEAD, -0.068, -0.050, -0.080), at(rig.VERTEX, 0.068, 0.020, 0.088)),
    }
    for side, s in rig.SIDES:
        b["clav" + side] = _box([rig.CLAV[s], rig.SHOULDER[s]], u(0.047))
        b["upperarm" + side] = _box([rig.SHOULDER[s], rig.ELBOW[s]], u(0.051))
        b["forearm" + side] = _box([rig.ELBOW[s], rig.WRIST[s]], u(0.045))
        b["hand" + side] = _box([rig.WRIST[s], rig.KNUCKLES[s]], u(0.046))
        b["fingers" + side] = _box([rig.KNUCKLES[s], rig.hand_point(s, (0.110, 0.022, 0.0))], u(0.034))
        b["thumb" + side] = _box([rig.THUMB[s], rig.THUMB_END[s]], u(0.020))
        b["thigh" + side] = _box([rig.HIP[s], rig.KNEE[s]], u(0.066))
        b["shin" + side] = _box([rig.KNEE[s], rig.ANKLE[s]], u(0.058))
        b["foot" + side] = _box([rig.ANKLE[s], rig.TOE[s], P((rig.ANKLE[s][0], GROUND, -rig.HEEL_BACK * rig.FOOT_LEN))],
                                u(0.048))
        b["toe" + side] = _box([rig.TOE[s], rig.TOE_TIP[s]], u(0.046))
    return b


BOXES = _boxes()  # of the bare mannequin
VOXEL_SCALE = {"hand": 0.55, "fingers": 0.5, "thumb": 0.5, "head": 0.8, "toe": 0.8, "foot": 0.9}  # finer grid where the detail is small


def box(bone: str) -> Tuple[np.ndarray, np.ndarray]:
    """Rest-pose box around a bone's solid as currently dressed."""
    b = _OUTFIT.box(bone) if _OUTFIT is not None else None
    return b if b is not None else BOXES[bone]


def measure_box(bone: str, reach: float = 0.42, step: float = 0.016, pad: float = 0.022):
    """Box of a bone solid found by probing its SDF on a coarse grid around the bone (for outfits)."""
    bn = rig.SKELETON.bones[rig.SKELETON.index[bone]]
    lo = np.minimum(bn.head, bn.tail) - reach
    hi = np.maximum(bn.head, bn.tail) + reach
    axes = [np.arange(lo[a], hi[a] + step, step, dtype=F32) for a in range(3)]
    g = np.stack(np.meshgrid(*axes, indexing="ij"), -1)
    inside = bone_sdf(bone, g) < step  # thin shells still register
    if not inside.any():
        raise ValueError(f"bone {bone!r} has no solid within {reach} of its axis")
    pts = g[inside]
    return pts.min(0) - F32(pad), pts.max(0) + F32(pad)


def voxel_for(bone: str, voxel: float) -> float:
    key = bone[:-1] if bone[-1] in "LR" and bone[:-1] in VOXEL_SCALE else bone
    scale = VOXEL_SCALE.get(key, 1.0)
    if _OUTFIT is not None:
        scale = min(scale, getattr(_OUTFIT, "VOXEL_SCALE", {}).get(bone, 1.0))
    return voxel * scale


def components(bone: str) -> Dict[str, sdf.Component]:
    """The one-entry component dict ``pixelsplat.sdf.mesh_components`` expects for this bone."""
    return {bone: (lambda p, _b=bone: bone_sdf(_b, p), box(bone))}


# ---------------------------------------------------------------- posed solids
def invert(mats: np.ndarray) -> np.ndarray:
    """Inverse of (B,3,4) rigid transforms."""
    R = mats[:, :, :3]
    Rt = np.transpose(R, (0, 2, 1))
    t = -np.einsum("bij,bj->bi", Rt, mats[:, :, 3])
    return np.concatenate([Rt, t[:, :, None]], 2)


def apply(mat: np.ndarray, p: np.ndarray) -> np.ndarray:
    return p @ mat[:, :3].T + mat[:, 3]


def posed_bone_sdf(bone: str, p_world, mats, inv=None) -> np.ndarray:
    """Distance to one bone's solid after the pose ``mats`` (B,3,4 rest->posed)."""
    inv = invert(np.asarray(mats, np.float64)) if inv is None else inv
    return bone_sdf(bone, apply(inv[rig.SKELETON.index[bone]], np.asarray(p_world, np.float64)).astype(F32))


def posed_union_sdf(p_world, mats) -> np.ndarray:
    """Distance to the whole posed figure = min over the rigidly moved bone solids."""
    inv = invert(np.asarray(mats, np.float64))
    p_world = np.asarray(p_world, np.float64)
    d = np.full(p_world.shape[:-1], BIG, F32)
    for b in bones():
        q = apply(inv[rig.SKELETON.index[b]], p_world).astype(F32)
        lo, hi = box(b)
        m = np.all((q >= lo - 0.05) & (q <= hi + 0.05), -1)
        if m.any():
            d[m] = np.minimum(d[m], bone_sdf(b, q[m]))
    return d


def inside_other(p_rest, owner, mats, margin: float, only=None) -> np.ndarray:
    """For points that ride on bone ``owner[i]`` (given in the rest pose): True where the posed point
    lies deeper than ``margin`` inside the solid of some OTHER bone, i.e. cannot be seen.

    ``only`` = optional bool mask of the points worth testing (the rest are returned False)."""
    mats = np.asarray(mats, np.float64)
    inv = invert(mats)
    p_rest = np.asarray(p_rest, np.float64)
    owner = np.asarray(owner)
    idx = np.arange(len(p_rest)) if only is None else np.nonzero(only)[0]
    hidden = np.zeros(len(p_rest), bool)
    if len(idx) == 0:
        return hidden
    world = np.einsum("nij,nj->ni", mats[owner[idx], :, :3], p_rest[idx]) + mats[owner[idx], :, 3]
    for b in bones():
        bi = rig.SKELETON.index[b]
        cand = owner[idx] != bi
        q = apply(inv[bi], world[cand]).astype(F32)
        lo, hi = box(b)
        m = np.all((q >= lo) & (q <= hi), -1)
        if not m.any():
            continue
        sel = np.nonzero(cand)[0][m]
        hit = bone_sdf(b, q[m]) < -margin
        hidden[idx[sel[hit]]] = True
    return hidden


def never_visible(p_rest, owner, poses_mats, margin: float) -> np.ndarray:
    """True where a point is buried inside another bone in EVERY given pose."""
    todo = np.ones(len(p_rest), bool)
    for mats in poses_mats:
        if not todo.any():
            break
        todo &= inside_other(p_rest, owner, mats, margin, only=todo)
    return todo

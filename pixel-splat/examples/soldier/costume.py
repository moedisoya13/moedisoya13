"""Soldier costume (stage 2): a 15th-century foot soldier's kit, laid over the mannequin of body.py.

Nothing of the body changes - not a bone, joint or motion.  The costume is an *outfit* for
``body.wear``: per bone it adds layers to the bone's solid (so cloth and plate ride rigidly on the
bone they are tied to, exactly like the flesh), gives solids to the twelve helper bones (skirt gores,
cape, plume) and paints every surface with a material: albedo, roughness, metallic.

    head      sallet (bowl, long tail, brim), torse (twisted orange/black band), plume holder, face
    plume*    plume feathers                       neck      bevor (plate collar under the chin)
    chest     tabard body, mantle + cowl (dagged), brooch
    clav      mantle over the shoulder, pauldron cap, strap + buckle
    upperarm  two pauldron lames, puffed sleeve    forearm   tight sleeve + buttons
    hand      glove + cuff                         pelvis    belt (= the waist turntable), buckle, skirt yoke
    skirt*    tabard skirt, eight gores            cape*     the mantle's long back drape (dagged hem)
    legs      two-coloured hose                    foot/toe  shoes with a pointed toe

Patterns (lozenges, studs, the twist of the torse) are functions of the REST position, and every
piece moves rigidly with one bone - so a pattern stays glued to its cloth in any pose.

Only period dress is taken from the reference drawings (sallet, bevor, tabard, chaperon mantle,
parti-coloured hose); no likeness of a person.

Numbers below are written for a figure 1.80 tall and scaled by ``S`` to rig.H.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import body  # noqa: E402
import rig  # noqa: E402
from pixelsplat import sdf  # noqa: E402

NAME = "soldier"
F32 = np.float32
S = rig.H / 1.80  # design units -> world units
GROUND = rig.GROUND
BONES = list(rig.HELPER_BONES)  # the 8 skirt gores, cape, capeTip, plume, plumeTip all get a solid
VOXEL_SCALE = {**{g: 0.7 for g in rig.GORES}, "cape": 0.7, "capeTip": 0.7, "plume": 0.6, "plumeTip": 0.6,
               "head": 0.7, "neck": 0.8, "clavL": 0.8, "clavR": 0.8}
# With the helmet on the neck is stiffer: tipping the head back drives the sallet's tail into the cowl and
# the shoulders, nodding with a bent neck drives the chin into the bevor (measured by
# ``soldier.py verify --checks clash``).  Turning stays free: +-70 degrees.
LIMITS = {
    "neck": ((-10.0, 10.0), (0.0, 0.0), (-6.0, 6.0)),
    "head": ((-8.0, 12.0), (-70.0, 70.0), (-5.0, 5.0)),
}


def m(v):
    return F32(v * S)


def pt(x, y, z):
    """A design-space point (ground at y = -1) -> world."""
    return np.array([x * S, GROUND + (y - GROUND) * S, z * S], F32)


def P(v):
    return np.asarray(v, F32)


# ---------------------------------------------------------------- materials (albedo sRGB, roughness, metallic)
MAT = {
    # metals are kept only part-metallic: in the dark studio a full metal mirrors the dark surroundings and
    # reads black, while the drawing shows steel as a light blue-grey with bright edges
    "steel": ((0.66, 0.75, 0.86), 0.36, 0.55),
    "steel_dark": ((0.40, 0.48, 0.60), 0.42, 0.55),
    "gold": ((0.98, 0.78, 0.34), 0.32, 0.65),
    "gem": ((0.78, 0.10, 0.12), 0.15, 0.00),
    "red": ((0.74, 0.15, 0.10), 0.85, 0.0),  # tabard, left hose
    "white": ((0.94, 0.91, 0.84), 0.85, 0.0),  # lozenges
    "cream": ((0.90, 0.84, 0.66), 0.85, 0.0),  # right hose
    "yellow": ((0.93, 0.76, 0.36), 0.88, 0.0),  # mantle
    "ochre": ((0.84, 0.55, 0.17), 0.88, 0.0),  # mantle lining, side skirts
    "green": ((0.50, 0.63, 0.25), 0.86, 0.0),  # sleeves
    "green_dark": ((0.33, 0.45, 0.18), 0.86, 0.0),
    "button": ((0.74, 0.80, 0.42), 0.55, 0.0),
    "teal": ((0.14, 0.33, 0.38), 0.85, 0.0),  # arming collar
    "leather": ((0.42, 0.25, 0.15), 0.55, 0.0),  # gloves, belt
    "leather_dark": ((0.25, 0.15, 0.10), 0.50, 0.0),  # shoes
    "strap": ((0.86, 0.47, 0.17), 0.55, 0.0),  # orange leather straps
    "orange": ((0.92, 0.46, 0.13), 0.75, 0.0),  # torse, plume
    "black": ((0.13, 0.12, 0.13), 0.75, 0.0),
    "feather_tip": ((0.24, 0.16, 0.13), 0.75, 0.0),
    "skin": ((0.90, 0.71, 0.59), 0.60, 0.0),
    "lip": ((0.78, 0.54, 0.47), 0.60, 0.0),
}


class Paint:
    """Per-point material being filled in."""

    def __init__(self, n: int, base: str):
        a, r, mt = MAT[base]
        self.alb = np.tile(np.array(a, F32), (n, 1))
        self.rough = np.full(n, r, F32)
        self.metal = np.full(n, mt, F32)

    def set(self, mask, name: str, shade: float = 1.0):
        if np.any(mask):
            a, r, mt = MAT[name]
            self.alb[mask] = np.array(a, F32) * shade
            self.rough[mask] = r
            self.metal[mask] = mt

    def shade(self, factor):
        self.alb *= np.asarray(factor, F32)[:, None]

    def out(self):
        return self.alb, self.rough, self.metal


def tri(t):
    """Triangle wave, period 1, range -1..1."""
    return 2.0 * np.abs(2.0 * (t - np.floor(t + 0.5))) - 1.0


# ---------------------------------------------------------------- tabard: red with white lozenges
LOZ_W, LOZ_H = 0.168 * S, 0.290 * S  # lattice spacing (columns, rows of the same column)
LOZ_A, LOZ_B = 0.040 * S, 0.086 * S  # half width, half height of one lozenge
LOZ_Y0 = GROUND + (0.270 + 1.0) * S  # a lozenge sits on the breast bone
TABARD_HALF = 0.128 * S  # the heraldic field: front and back, this far either side of the midline


def lozenge(x, y):
    """True inside a white lozenge of the staggered lattice (rest coordinates: sticks to the cloth)."""
    v = (y - LOZ_Y0) / (LOZ_H / 2)
    hit = np.zeros(np.shape(x), bool)
    for dj in (-1, 0, 1):
        j = np.round(v) + dj
        dx = x - np.mod(j, 2) * LOZ_W / 2
        dx = np.mod(dx + LOZ_W / 2, LOZ_W) - LOZ_W / 2
        hit |= np.abs(dx) / LOZ_A + np.abs(y - LOZ_Y0 - j * LOZ_H / 2) / LOZ_B < 1.0
    return hit


def paint_tabard(pa: Paint, mask, p, field=None):
    pa.set(mask, "red")
    f = np.abs(p[:, 0]) < TABARD_HALF if field is None else field
    pa.set(mask & f & lozenge(p[:, 0], p[:, 1]), "white")


# ---------------------------------------------------------------- skirt: belt, yoke, eight gores
BELT_Y = float(rig.WAIST[1])
SK_ZC = float(rig.SKIRT_ZC)
SK_Y = np.array([rig.Y(h) for h in rig.SKIRT_H])  # hem, yoke bottom, top (under the belt)
SK_T = 0.0085 * S  # half thickness of the cloth
SK_ROUND = 0.002 * S  # rounding of the cloth's edges (so its faces sit SK_T + SK_ROUND from the middle)
HEM_Y, YOKE_Y, SK_TOP = SK_Y
GORE_TOP = SK_TOP - 0.035 * S  # the gores start a little below the belt, inside the yoke
FIELD = 51.0  # degrees either side of front / back that carry the tabard's colours; the flanks are ochre


def skirt_coords(p):
    """(rho, phi, reach): elliptical-cone coordinates of the skirt.  rho = 1 on the skirt surface,
    phi = azimuth (0 = front, +90 deg = his left), reach = horizontal distance from the skirt's axis."""
    a, b = rig.skirt_radii(p[..., 1])
    x, z = p[..., 0], p[..., 2] - SK_ZC
    rho = np.sqrt((x / a) ** 2 + (z / b) ** 2).astype(F32)
    return rho, np.arctan2(x / a, z / b), np.sqrt(x * x + z * z).astype(F32)


def skirt_depth(p, scale: float = 1.0):
    """Distance outside (+) / inside (-) the skirt cone, measured along the ray from the skirt's axis."""
    rho, _, reach = skirt_coords(p)
    return reach * (1.0 - scale / np.maximum(rho, 1e-4))


def _angle_diff(phi, centre_deg):
    d = phi - math.radians(centre_deg)
    return np.abs(np.arctan2(np.sin(d), np.cos(d)))


def yoke_sdf(p):
    """Top of the skirt, rigid on the pelvis: covers hips and buttocks from the belt to hip level."""
    d = np.maximum(skirt_depth(p), np.maximum(p[..., 1] - SK_TOP, YOKE_Y - p[..., 1]))
    return d - m(0.004)


def gore_sdf(p, name):
    """One gore (hanging strip) of the skirt: a slab of the elliptical cone, from under the belt to the hem."""
    _, phi, reach = skirt_coords(p)
    d_shell = np.abs(skirt_depth(p)) - SK_T
    d_side = (_angle_diff(phi, rig.GORES[name]) - math.radians(rig.GORE_HALF)) * np.maximum(reach, m(0.03))
    d_y = np.maximum(p[..., 1] - GORE_TOP, HEM_Y - p[..., 1])
    return np.maximum(np.maximum(d_shell, d_side), d_y) - SK_ROUND


def gore_poke(p, name, seam: float = 0.0):
    """How far a point sticks out THROUGH a gore (rest frame of the gore): > 0 = beyond the gore's outer
    face while inside its outline; -inf where the gore does not cover the point.  ``seam`` (degrees)
    leaves out a strip along the gore's two side edges - where it overlaps its neighbours."""
    _, phi, _ = skirt_coords(p)
    inside = _angle_diff(phi, rig.GORES[name]) < math.radians(rig.GORE_HALF - seam)
    covered = inside & (p[..., 1] > HEM_Y) & (p[..., 1] < GORE_TOP)
    return np.where(covered, skirt_depth(p) - (SK_T + SK_ROUND), -np.inf)


SEAM = 1.5  # degrees: neighbouring gores overlap by 0.5 deg; a lifted gore lying on that strip is not "through"


# ---------------------------------------------------------------- cape: the mantle's long back drape
CAPE_Y = np.array([float(rig.CAPE[2][1]), float(rig.CAPE[1][1]), float(rig.CAPE[0][1]) + 0.03 * S])  # hem, hinge, top
CAPE_Z = np.array([float(rig.CAPE[2][2]), float(rig.CAPE[1][2]), float(rig.CAPE[0][2])])  # top is re-set below: tucked into the mantle
CAPE_W = np.array([0.172, 0.142, 0.100]) * S  # half width: gathered under the mantle, spreading to the hem
CAPE_FOLD = np.array([0.013, 0.008, 0.0]) * S  # depth of the hanging folds at those heights
CAPE_FOLD_W = 0.050 * S  # spacing of the folds
CAPE_T = 0.0085 * S
CAPE_CURL = 0.55 / S  # the drape wraps forward at its edges: z += CURL * x^2
DAG = 0.062 * S  # width of one tooth of the dagged hem
DAG_DEPTH = 0.046 * S


def cape_mid(p):
    """z of the cape's middle surface at a point's (x, y): leaning back, curled round, hanging in folds."""
    y, x = p[..., 1], p[..., 0]
    fold = np.interp(y, CAPE_Y, CAPE_FOLD).astype(F32) * np.cos(x * F32(math.pi / CAPE_FOLD_W))
    return np.interp(y, CAPE_Y, CAPE_Z).astype(F32) + F32(CAPE_CURL) * x * x + fold


def cape_sdf(p, tip: bool):
    y = p[..., 1]
    d_shell = np.abs(p[..., 2] - cape_mid(p)) - CAPE_T
    d_side = np.abs(p[..., 0]) - np.interp(y, CAPE_Y, CAPE_W).astype(F32)
    hinge = CAPE_Y[1]
    if tip:
        hem = CAPE_Y[0] + DAG_DEPTH * 0.5 * (1 + tri(p[..., 0] / DAG))  # dagged: a row of V-shaped teeth
        d_y = np.maximum(y - (hinge + m(0.012)), hem - y)
    else:
        d_y = np.maximum(y - CAPE_Y[2], hinge - m(0.012) - y)
    return np.maximum(np.maximum(d_shell, d_side), d_y) - m(0.002)


def cape_poke(p):
    """How far a point sticks out behind the cape's outer (rear) face; -inf where the cape does not cover it."""
    y = p[..., 1]
    covered = (np.abs(p[..., 0]) < np.interp(y, CAPE_Y, CAPE_W)) & (y > CAPE_Y[0] + DAG_DEPTH) & (y < CAPE_Y[2])
    return np.where(covered, cape_mid(p) - (CAPE_T + m(0.002)) - p[..., 2], -np.inf)


# ---------------------------------------------------------------- trunk
MANTLE_T = 0.020 * S  # the mantle lies this thick over chest and shoulders
TUNIC_T = 0.010 * S
MANTLE_EDGE = GROUND + (0.378 + 1.0) * S  # mean height of the mantle's dagged edge on chest and back
COWL_C = pt(0.0, 0.512, -0.012)
BROOCH = pt(0.046, 0.428, 0.0)  # x, y; z is put on the mantle surface below


def _chest_flesh(p):
    return body.BUILDERS["chest"](p)[body.FLESH]


def _under_arm(p):
    """0 on chest and back, rising to 1 at the flanks under the arms (where the sleeves sit)."""
    return np.clip((np.abs(p[..., 0]) - m(0.125)) / m(0.035), 0, 1)


def mantle_edge(p):
    """Height of the mantle's lower edge around the trunk: dagged (zig-zag teeth) on chest and back,
    drawn up to the shoulders at the flanks so that no cloth hangs into the armpits."""
    phi = np.arctan2(p[..., 0], p[..., 2])
    return MANTLE_EDGE + m(0.024) * tri(phi * 16 / (2 * math.pi)) + m(0.095) * _under_arm(p) ** 2


def chest_mantle(p):
    """Mantle on chest and back: from its dagged edge up to the cowl (above that the neck is bare)."""
    y = p[..., 1]
    d = _chest_flesh(p) - MANTLE_T * (1 - 0.6 * _under_arm(p))
    return np.maximum(np.maximum(d, mantle_edge(p) - y), y - (COWL_C[1] + m(0.016)))


def cowl_sdf(p):
    """The hood, pushed back: a thick roll of cloth around the base of the neck."""
    q = p - COWL_C
    ring = np.sqrt(q[..., 0] ** 2 + (q[..., 2] * 0.92) ** 2) - m(0.074)
    return np.sqrt(ring ** 2 + (q[..., 1] * 1.05) ** 2) - m(0.031)


def _surface_z(fn, x, y, z0, z1):
    """z of a surface along the line (x, y, .) between z0 (inside) and z1 (outside), by bisection."""
    for _ in range(24):
        zm = 0.5 * (z0 + z1)
        if float(fn(np.array([[x, y, zm]], F32))[0]) < 0:
            z0 = zm
        else:
            z1 = zm
    return 0.5 * (z0 + z1)


BROOCH[2] = _surface_z(chest_mantle, BROOCH[0], BROOCH[1], 0.0, 0.3 * S)
# the cape starts inside the mantle on the back (no step where it comes out) and leaves it lower down
CAPE_Z[2] = _surface_z(chest_mantle, 0.0, float(CAPE_Y[2]), 0.0, -0.3 * S) + 0.013 * S


def _chest(p):
    brooch = sdf.ellipsoid(p, BROOCH, P((m(0.024), m(0.024), m(0.011))))
    y = p[..., 1]
    # the tabard thins out to nothing under the arms: the sleeves sit there
    return {"tunic": np.maximum(_chest_flesh(p) - TUNIC_T * (1 - _under_arm(p)), np.maximum(BELT_Y - y, y - COWL_C[1])),
            "mantle": chest_mantle(p), "cowl": cowl_sdf(p), "brooch": brooch}


def _paint_chest(p, layer):
    pa = Paint(len(p), "red")
    pa.set(p[:, 1] > COWL_C[1] - m(0.02), "teal")  # the root of the neck above the cowl: arming collar
    paint_tabard(pa, layer == "tunic", p)
    cloth = (layer == "mantle") | (layer == "cowl")
    pa.set(cloth, "yellow")
    pa.set((layer == "mantle") & (p[:, 1] - mantle_edge(p) < m(0.011)), "ochre")  # lining shows along the edge
    pa.set((layer == "cowl") & (p[:, 1] < COWL_C[1] - m(0.012)), "yellow", 0.90)
    r = np.linalg.norm((p - BROOCH)[:, :2], axis=1)
    br = layer == "brooch"
    pa.set(br, "gold")
    pa.set(br & (r < m(0.011)), "gem")
    return pa.out()


def _pelvis(p):
    w = rig.WAIST
    buckle = body.round_box(p, P((0.0, w[1], rig.TURNTABLE["waist"]["radius"] * rig.H + m(0.002))),
                            P((m(0.024), m(0.021), m(0.008))), m(0.004))
    return {"yoke": yoke_sdf(p), "buckle": buckle}


STUDS = 18


def _paint_pelvis(p, layer):
    pa = Paint(len(p), "red")
    pa.set(p[:, 0] < 0, "cream")  # what little shows of the body under the skirt wears the hose
    yoke = layer == "yoke"
    front_back = _tabard_field(p)
    pa.set(yoke, "ochre")
    paint_tabard(pa, yoke & front_back, p, field=np.abs(p[:, 0]) < TABARD_HALF)
    belt = layer == body.TURNTABLE
    pa.set(belt, "leather")
    az = np.arctan2(p[:, 0], p[:, 2]) * STUDS / (2 * math.pi)
    rad = np.sqrt(p[:, 0] ** 2 + p[:, 2] ** 2)
    stud = (np.abs(az - np.round(az)) < 0.17) & (np.abs(p[:, 1] - BELT_Y) < m(0.0085)) & (rad > m(0.108))
    pa.set(belt & stud, "gold")
    pa.set(belt & (np.abs(np.abs(p[:, 1] - BELT_Y) - m(0.018)) < m(0.0035)) & (rad > m(0.108)), "leather", 0.72)
    pa.set(layer == "buckle", "gold")
    return pa.out()


def _tabard_field(p):
    """Front and back of the skirt carry the tabard (red, lozenges); the flanks are ochre."""
    _, phi, _ = skirt_coords(p)
    return (_angle_diff(phi, 0.0) < math.radians(FIELD)) | (_angle_diff(phi, 180.0) < math.radians(FIELD))


def _skirt(p, name):
    return {"gore": gore_sdf(p, name)}


def _paint_skirt(p, layer, name):
    pa = Paint(len(p), "ochre")
    field = _tabard_field(p)
    paint_tabard(pa, field, p)
    pa.set(skirt_depth(p) < 0, "ochre", 0.82)  # the inside of the cloth: lining
    pa.set(p[:, 1] < HEM_Y + m(0.016), "ochre")  # hem band
    pa.set((p[:, 1] < HEM_Y + m(0.016)) & ~field, "ochre", 0.78)
    return pa.out()


def _cape(p, name):
    return {"cloth": cape_sdf(p, name == "capeTip")}


def _paint_cape(p, layer, name):
    pa = Paint(len(p), "yellow")
    pa.set(p[:, 2] > cape_mid(p), "ochre")  # the side that faces the body: lining
    hem = CAPE_Y[0] + DAG_DEPTH * 0.5 * (1 + tri(p[:, 0] / DAG))
    pa.set((p[:, 1] - hem < m(0.014)) & (name == "capeTip"), "ochre")
    return pa.out()


# ---------------------------------------------------------------- shoulders and arms
PAULDRON_R = 0.090 * S
ARM_HEAD_R = 0.063 * S  # the head of the sleeve, a ball round the shoulder joint (hidden in the pauldron)
ELBOW_R = 0.047 * S
LAMES = ((0.030, 0.083, 0.004, 0.078, -0.022), (0.072, 0.0765, 0.050, 0.128, 0.004))
# each lame: sphere centre along the arm, radius, band start, band end (along the arm), how far round
# the arm it wraps (limit of the outward coordinate)


def arm_frame(s):
    """Unit vectors of the rest-pose arm: along it (down), outwards (away from the body), forward."""
    a = rig.ARM_AXIS[s]
    out = np.array([s * a[1] * -1.0, s * a[0], 0.0])  # perpendicular to the arm, pointing away from the body
    return P(a), P(out), P((0.0, 0.0, 1.0))


def _clav(p, s):
    sh = rig.SHOULDER[s]
    flesh = body.BUILDERS["clav" + ("L" if s > 0 else "R")](p)[body.FLESH]
    n = np.array([s * 0.42, 0.91, 0.0], F32)
    n /= np.linalg.norm(n)
    q = p - P(sh)
    cap = np.maximum(sdf.length(q) - PAULDRON_R, -(q @ n) - m(0.010))  # a dome over the top and outside of the shoulder
    a, b = pt(s * 0.096, 0.522, 0.050), pt(s * 0.150, 0.538, 0.050)
    strap = sdf.capsule(p, a, b, m(0.0135))
    buckle = body.round_box(p, a + 0.42 * (b - a) + P((0, m(0.004), m(0.006))), P((m(0.011), m(0.013), m(0.012))), m(0.003))
    return {"mantle": flesh - MANTLE_T * 0.9, "pauldron": cap, "strap": strap, "buckle": buckle}


def _paint_clav(p, layer, s):
    pa = Paint(len(p), "yellow")
    q = p - P(rig.SHOULDER[s])
    plate = layer == "pauldron"
    pa.set(plate, "steel")
    n = np.array([s * 0.42, 0.91, 0.0], F32)
    n /= np.linalg.norm(n)
    h = q @ n  # height above the rim plane
    pa.set(plate & (h < m(0.004)), "steel_dark")  # rolled rim
    az = np.arctan2(q[:, 2], s * q[:, 0] * 0.91 - q[:, 1] * 0.42) * 12 / (2 * math.pi)
    pa.set(plate & (np.abs(h - m(0.016)) < m(0.006)) & (np.abs(az - np.round(az)) < 0.20), "gold")  # rivets
    pa.set(layer == "strap", "strap")
    pa.set(layer == "buckle", "gold")
    return pa.out()


def _upperarm(p, s):
    a, out, fwd = arm_frame(s)
    sh, el = P(rig.SHOULDER[s]), P(rig.ELBOW[s])
    L = float(np.linalg.norm(el - sh))
    q = p - sh
    al, ou, fw = q @ a, q @ out, q @ fwd
    side = "L" if s > 0 else "R"
    flesh = body.BUILDERS["upperarm" + side](p)[body.FLESH]
    # puffed sleeve: bulges outwards, forwards and backwards, hardly at all towards the ribs
    e = np.stack([(al - 0.52 * L) / m(0.118), (ou - m(0.026)) / m(0.066), (fw + m(0.003)) / m(0.078)], -1)
    k0 = sdf.length(e)
    puff = k0 * (k0 - 1.0) / np.maximum(sdf.length(e / P((m(0.118), m(0.066), m(0.078)))), 1e-6)
    cloth = m(0.006) * np.clip((ou + m(0.030)) / m(0.030), 0, 1)  # the sleeve adds nothing on the side that faces the ribs
    sleeve = sdf.smin(flesh - cloth, puff, m(0.012))
    c = np.stack([(al - 0.885 * L) / m(0.017), ou / m(0.049), fw / m(0.050)], -1)  # gathered into a band above the elbow
    k1 = sdf.length(c)
    cuff = k1 * (k1 - 1.0) / np.maximum(sdf.length(c / P((m(0.017), m(0.049), m(0.050)))), 1e-6)
    layers = {"sleeve": sleeve, "cuff": cuff, "head": sdf.length(q) - ARM_HEAD_R}
    for i, (c_al, r, a0, a1, wrap) in enumerate(LAMES):
        ball = sdf.length(q - m(c_al) * a) - m(r)
        layers[f"lame{i + 1}"] = np.maximum(np.maximum(ball, np.maximum(m(a0) - al, al - m(a1))), m(wrap) - ou)
    return layers


def _paint_upperarm(p, layer, s):
    a, out, fwd = arm_frame(s)
    q = p - P(rig.SHOULDER[s])
    al, fw, ou = q @ a, q @ fwd, q @ out
    pa = Paint(len(p), "green")
    ang = np.arctan2(fw, ou)
    pa.shade(0.93 + 0.07 * np.cos(ang * 9))  # gathers running down the sleeve
    pa.set(layer == "cuff", "green_dark")
    for i, (c_al, r, a0, a1, wrap) in enumerate(LAMES):
        lm = layer == f"lame{i + 1}"
        pa.set(lm, "steel")
        pa.set(lm & (al > m(a1) - m(0.007)), "steel_dark")  # lower edge of the plate
        t = ang * 10 / (2 * math.pi)
        pa.set(lm & (np.abs(al - (m(a1) - m(0.017))) < m(0.005)) & (np.abs(t - np.round(t)) < 0.18), "gold")
    return pa.out()


BUTTONS = (0.34, 0.47, 0.60, 0.73, 0.86)  # along the forearm


def _forearm(p, s):
    a, out, _ = arm_frame(s)
    el, wr = P(rig.ELBOW[s]), P(rig.WRIST[s])
    side = "L" if s > 0 else "R"
    flesh = body.BUILDERS["forearm" + side](p)[body.FLESH]
    sleeve = np.minimum(flesh - m(0.005), sdf.sphere(p, el, ELBOW_R))
    buttons = None
    for t in BUTTONS:
        r = (0.0387 + (0.026 - 0.0387) * t + 0.006) * S
        b = sdf.sphere(p, el + t * (wr - el) + r * out, m(0.0105))
        buttons = b if buttons is None else np.minimum(buttons, b)
    return {"sleeve": sleeve, "buttons": buttons}


def _paint_forearm(p, layer, s):
    pa = Paint(len(p), "green")
    pa.set(layer == "buttons", "button")
    return pa.out()


def _hand(p, s):
    a, _, _ = arm_frame(s)
    wr = P(rig.WRIST[s])
    side = "L" if s > 0 else "R"
    flesh = body.BUILDERS["hand" + side](p)[body.FLESH]
    cuff = sdf.round_cone(p, wr - m(0.062) * a, wr - m(0.004) * a, m(0.049), m(0.037))  # flares up the forearm
    return {"glove": flesh - m(0.0045), "cuff": cuff}


def _paint_hand(p, layer, s):
    a, _, _ = arm_frame(s)
    al = (p - P(rig.WRIST[s])) @ a
    pa = Paint(len(p), "leather")
    pa.set((layer == "cuff") & (al < -m(0.048)), "leather", 1.35)  # paler turned-over edge
    return pa.out()


# ---------------------------------------------------------------- legs
def _toe(p, s):
    """Toe of the shoe: one smooth cap over toes and toe hinge, drawn out into a blunt point."""
    t, tip = rig.TOE[s], rig.TOE_TIP[s]
    q = (p - P((t[0], 0.0, 0.0))) * P((1 / 1.75, 1.0, 1.0))  # 1.75x as wide as it is high
    cap = sdf.round_cone(q, P((0.0, GROUND + m(0.027), t[2] - m(0.004))), P((0.0, GROUND + m(0.014), tip[2] + m(0.016))),
                         m(0.0285), m(0.0115))
    return {"shoe": np.maximum(cap, GROUND - p[..., 1])}


def _paint_leg(p, layer, bone, s):
    if bone in ("foot", "toe"):
        pa = Paint(len(p), "leather_dark")
        pa.set(p[:, 1] < GROUND + m(0.007), "leather_dark", 0.7)  # sole
        return pa.out()
    return Paint(len(p), "red" if s > 0 else "cream").out()


# ---------------------------------------------------------------- neck and head
AXIS_Z = float(rig.HEAD[2])  # the head turns about the vertical line x = 0, z = AXIS_Z
BEVOR_Y = (GROUND + (0.490 + 1.0) * S, GROUND + (0.572 + 1.0) * S)  # bottom (in the cowl), top (chin level)
BEVOR_R = (0.081 * S, 0.118 * S)  # middle radius of the plate at bottom and top (in front): it flares towards the chin
BEVOR_SIDE = 0.016 * S  # ... and flares this much less at the sides, to stay clear of the pauldrons
BEVOR_T = 0.0075 * S  # half thickness
BEVOR_WRAP = 108.0  # degrees either side of straight ahead


def _neck(p):
    y = p[..., 1]
    t = np.clip((y - BEVOR_Y[0]) / (BEVOR_Y[1] - BEVOR_Y[0]), 0, 1)
    r = np.sqrt(p[..., 0] ** 2 + (p[..., 2] - AXIS_Z) ** 2)
    phi = np.arctan2(p[..., 0], p[..., 2] - AXIS_Z)
    top = BEVOR_R[1] - BEVOR_SIDE * (1 - np.cos(phi))
    r_mid = BEVOR_R[0] + (top - BEVOR_R[0]) * t ** 1.6
    d = np.maximum(np.abs(r - r_mid) - BEVOR_T, np.maximum(y - BEVOR_Y[1], BEVOR_Y[0] - y))
    d = np.maximum(d, (np.abs(phi) - math.radians(BEVOR_WRAP)) * np.maximum(r, m(0.03)))
    return {"bevor": d - m(0.002)}


def _paint_neck(p, layer):
    pa = Paint(len(p), "teal")
    bv = layer == "bevor"
    pa.set(bv, "steel")
    pa.set(bv & (p[:, 1] > BEVOR_Y[1] - m(0.008)), "steel_dark")  # rolled upper edge
    phi = np.arctan2(p[:, 0], p[:, 2] - AXIS_Z) * 14 / (2 * math.pi)
    pa.set(bv & (np.abs(p[:, 1] - (BEVOR_Y[0] + m(0.030))) < m(0.0055)) & (np.abs(phi - np.round(phi)) < 0.2), "gold")
    return pa.out()


EYE_Y = float(rig.EYE[1])
BOWL_C = pt(0.0, 0.6987, -0.0121)
BOWL_R = P((m(0.0950), m(0.1185), m(0.1140)))
RIM_FRONT = EYE_Y + m(0.0125)  # the bowl's edge over the eyes
RIM_SIDE = GROUND + (0.612 + 1.0) * S  # ... and over ears and nape (about mouth level)
TORSE_Y = GROUND + (0.668 + 1.0) * S
TORSE_R = 0.0135 * S
PLUME_ROOT = P(rig.PLUME[0])


def _bowl_coords(p):
    q = (p - BOWL_C) / BOWL_R
    return sdf.length(q), np.arctan2(p[..., 0], p[..., 2] - BOWL_C[2])


def helmet_sdf(p):
    """Sallet: round bowl, brim over the eyes with a pointed prow, long tail swept back and a little up."""
    k0, phi = _bowl_coords(p)
    k1 = sdf.length((p - BOWL_C) / BOWL_R / BOWL_R)
    bowl = k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)
    c = np.cos(phi)
    front = np.clip((c - 0.42) / 0.29, 0, 1)
    front = front * front * (3 - 2 * front)
    rim = RIM_SIDE + (RIM_FRONT - RIM_SIDE) * front
    bowl = sdf.smax(bowl, rim - p[..., 1], m(0.006))
    brim = sdf.ellipsoid(p, pt(0.0, 0.7005, 0.084), P((m(0.086), m(0.0125), m(0.052))))
    prow = sdf.round_cone(p, pt(0.0, 0.706, 0.105), pt(0.0, 0.6945, 0.160), m(0.0125), m(0.0045))
    comb = sdf.capsule(p, pt(0.0, 0.806, 0.050), pt(0.0, 0.790, -0.085), m(0.0085))
    # tail: a broad flat tongue (x stretched 1.9x) running back and down, its tip turned up
    ps = p * P((1 / 1.9, 1.0, 1.0))
    tail = sdf.round_cone(ps, pt(0.0, 0.652, -0.072), pt(0.0, 0.592, -0.166), m(0.046), m(0.017))
    tip = sdf.round_cone(ps, pt(0.0, 0.592, -0.166), pt(0.0, 0.600, -0.200), m(0.017), m(0.008))
    d = sdf.smin(sdf.smin(bowl, np.minimum(tail, tip), m(0.018)), sdf.smin(brim, prow, m(0.008)), m(0.008))
    d = sdf.smin(d, comb, m(0.008))
    for s in (1, -1):
        d = np.minimum(d, sdf.sphere(p, pt(s * 0.0935, 0.676, 0.006), m(0.0145)))  # rondel at the temple
    return d


def torse_sdf(p):
    """Twisted cloth band tied round the bowl, from temple to temple across the back."""
    k0, phi = _bowl_coords(p)
    y_scale = np.sqrt(np.maximum(1 - ((TORSE_Y - BOWL_C[1]) / BOWL_R[1]) ** 2, 0.05))
    rad = (sdf.length(((p - BOWL_C) / BOWL_R)[..., [0, 2]]) / y_scale - 1.0) * m(0.105) - m(0.004)
    d = np.sqrt(rad ** 2 + (p[..., 1] - TORSE_Y) ** 2) - TORSE_R
    return np.maximum(d, (math.radians(62) - np.abs(phi)) * m(0.09))


def _head(p):
    holder = sdf.capsule(p, PLUME_ROOT - P((0, m(0.02), -m(0.012))), PLUME_ROOT + P((0, m(0.020), -m(0.014))), m(0.0125))
    return {"helmet": helmet_sdf(p), "torse": torse_sdf(p), "holder": holder}


def _paint_head(p, layer):
    pa = Paint(len(p), "skin")
    face_shadow = (np.abs(p[:, 1] - EYE_Y) < m(0.011)) & (p[:, 2] > m(0.04))
    pa.set(face_shadow, "skin", 0.62)  # eyes: lost in the shade of the brim
    pa.set((np.abs(p[:, 1] - (rig.CHIN[1] + m(0.040))) < m(0.0035)) & (np.abs(p[:, 0]) < m(0.020)) & (p[:, 2] > m(0.06)), "lip")
    hel = layer == "helmet"
    pa.set(hel, "steel")
    _, phi = _bowl_coords(p)
    c = np.cos(phi)
    front = np.clip((c - 0.42) / 0.29, 0, 1)
    rim = RIM_SIDE + (RIM_FRONT - RIM_SIDE) * front * front * (3 - 2 * front)
    pa.set(hel & (p[:, 1] < rim + m(0.009)) & (p[:, 2] > -m(0.06)), "steel_dark")  # edge of the bowl
    t = phi * 16 / (2 * math.pi)
    pa.set(hel & (np.abs(p[:, 1] - (RIM_SIDE + m(0.024))) < m(0.0055)) & (np.abs(t - np.round(t)) < 0.17)
           & (np.abs(phi) > math.radians(60)), "gold")  # rivets of the lining band
    tor = layer == "torse"
    twist = np.sin(phi * 13 + (p[:, 1] - TORSE_Y) / TORSE_R * 1.9)
    pa.set(tor, "orange")
    pa.set(tor & (twist < 0), "black")
    pa.set(layer == "holder", "steel_dark")
    return pa.out()


# ---------------------------------------------------------------- plume
# each feather: lean back from vertical at its root / at its tip (degrees), length, sideways drift
FEATHERS = ((-8, 2, 0.215, -0.20), (6, 22, 0.250, 0.22), (18, 42, 0.262, -0.10), (32, 60, 0.246, 0.12),
            (46, 78, 0.226, -0.24), (60, 94, 0.196, 0.20), (26, 50, 0.236, 0.02))
PLUME_SPLIT = 0.48  # where a feather passes from the plume bone to the plumeTip bone
BLADE = 2.1  # a feather is this many times broader than it is thick


def _feather_points(i):
    lean0, lean1, length, drift = FEATHERS[i]
    pts = []
    for t in (0.0, PLUME_SPLIT, 0.78, 1.0):
        # integrate the direction along the feather: it starts leaning lean0 and ends leaning lean1
        n = 12
        acc = np.zeros(3)
        for k in range(n):
            tt = (k + 0.5) / n * t
            a = math.radians(lean0 + (lean1 - lean0) * tt)
            acc += np.array([drift * (0.4 + 1.2 * tt), math.cos(a), -math.sin(a)]) * (t / n)
        pts.append(PLUME_ROOT + (acc * length * S).astype(F32))
    return pts


FEATHER_PTS = [_feather_points(i) for i in range(len(FEATHERS))]


def _plume(p, tip: bool):
    d = None
    squash = P((BLADE, 1.0, 1.0))
    for pts in FEATHER_PTS:
        segs = ((pts[1] - 0.12 * (pts[2] - pts[1]), pts[2], 0.027, 0.024), (pts[2], pts[3], 0.024, 0.009)) if tip \
            else ((pts[0], pts[1] + 0.12 * (pts[1] - pts[0]), 0.013, 0.027),)
        for a, b, r0, r1 in segs:
            # a blade: broad in the plane the plume fans out in (y, z), thin across (x)
            e = sdf.round_cone((p - a) * squash, np.zeros(3, F32), (b - a) * squash, m(r0), m(r1))
            d = e if d is None else np.minimum(d, e)
    return {"feather": d / BLADE}


def _paint_plume(p, layer):
    pa = Paint(len(p), "orange")
    dist = np.linalg.norm(p - PLUME_ROOT, axis=1)
    barbs = 0.90 + 0.10 * np.cos(dist / (0.0085 * S) * math.pi)
    pa.shade(barbs)
    pa.set(dist > m(0.205), "feather_tip")
    return pa.out()


# ---------------------------------------------------------------- outfit interface
def _side(bone: str) -> Tuple[str, int]:
    if bone[-1] in "LR" and bone[:-1] in ("clav", "upperarm", "forearm", "hand", "thigh", "shin", "foot", "toe"):
        return bone[:-1], (1 if bone[-1] == "L" else -1)
    return bone, 0


def layers(bone: str, p) -> Dict[str, np.ndarray]:
    """Costume layers of one bone (rest pose): {name: signed distance}."""
    base, s = _side(bone)
    if base == "chest":
        return _chest(p)
    if base == "pelvis":
        return _pelvis(p)
    if base == "neck":
        return _neck(p)
    if base == "head":
        return _head(p)
    if base == "clav":
        return _clav(p, s)
    if base == "upperarm":
        return _upperarm(p, s)
    if base == "forearm":
        return _forearm(p, s)
    if base == "hand":
        return _hand(p, s)
    if base == "toe":
        return _toe(p, s)
    if base in rig.GORES:
        return _skirt(p, base)
    if base in ("cape", "capeTip"):
        return _cape(p, base)
    if base in ("plume", "plumeTip"):
        return _plume(p, base == "plumeTip")
    return {}  # thigh, shin, foot: hose and the body of the shoe are paint only


def paint(bone: str, p, layer):
    """(albedo, roughness, metallic) at surface points of one bone; ``layer`` = nearest layer per point."""
    base, s = _side(bone)
    if base == "chest":
        return _paint_chest(p, layer)
    if base == "pelvis":
        return _paint_pelvis(p, layer)
    if base == "neck":
        return _paint_neck(p, layer)
    if base == "head":
        return _paint_head(p, layer)
    if base == "clav":
        return _paint_clav(p, layer, s)
    if base == "upperarm":
        return _paint_upperarm(p, layer, s)
    if base == "forearm":
        return _paint_forearm(p, layer, s)
    if base == "hand":
        return _paint_hand(p, layer, s)
    if base in rig.GORES:
        return _paint_skirt(p, layer, base)
    if base in ("cape", "capeTip"):
        return _paint_cape(p, layer, base)
    if base in ("plume", "plumeTip"):
        return _paint_plume(p, layer)
    return _paint_leg(p, layer, base, s)


_BOX_CACHE: Dict[str, Tuple[np.ndarray, np.ndarray]] = {}
_DRESSED = {"chest", "pelvis", "neck", "head", "clav", "upperarm", "forearm", "hand", "toe"}


def box(bone: str) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """Rest-pose box of a dressed bone (measured once from its solid); None = same as the bare bone."""
    if _side(bone)[0] not in _DRESSED and bone not in BONES:
        return None
    if bone not in _BOX_CACHE:
        with body.wearing(sys.modules[__name__]):
            _BOX_CACHE[bone] = body.measure_box(bone)
    return _BOX_CACHE[bone]


# garments that hang over another bone: (garment bone, how far a point pokes through it)
COVERS = {name: (lambda p, _n=name: gore_poke(p, _n)) for name in rig.GORES}
COVERS_GORE = {name: (lambda p, _n=name: gore_poke(p, _n, SEAM)) for name in rig.GORES}  # gore against gore
COVERS["cape"] = cape_poke
COVERS["capeTip"] = cape_poke
SKIRT_BONES = tuple(rig.GORES)


def _past_shoulder(p, s):
    """The part of the upper arm that is clear of the shoulder (the puff of the sleeve)."""
    a, _, _ = arm_frame(s)
    return (p - P(rig.SHOULDER[s])) @ a > m(0.105)


ARMOUR = ("helmet", "torse", "holder")
CLOTH = ("tunic", "mantle", "cowl", "brooch")
# pairs of pieces that should not run into each other: (label, group A, group B); a group is a list of
# (bone, layers or None = the whole bone solid, optional mask over rest points)
CLASH_PAIRS = (
    ("puffed sleeve / trunk", [("upperarmL", None, lambda p: _past_shoulder(p, 1)),
                               ("upperarmR", None, lambda p: _past_shoulder(p, -1))], [("chest", None, None)]),
    ("forearm, hand / skirt, hips", [(b, None, None) for b in ("forearmL", "forearmR", "handL", "handR")],
     [(b, None, None) for b in ("pelvis", "thighL", "thighR") + SKIRT_BONES]),
    ("helmet / bevor", [("head", ARMOUR, None)], [("neck", ("bevor",), None)]),
    ("face / bevor, cowl", [("head", (body.FLESH,), None)], [("neck", ("bevor",), None), ("chest", CLOTH, None)]),
    ("helmet, plume / mantle, pauldrons", [("head", ARMOUR, None), ("plume", None, None), ("plumeTip", None, None)],
     [("chest", CLOTH, None), ("clavL", None, None), ("clavR", None, None)]),
    ("bevor / pauldron", [("neck", ("bevor",), None)], [(b, ("pauldron", "strap", "buckle"), None) for b in ("clavL", "clavR")]),
    ("pauldron / trunk", [(b, ("pauldron",), None) for b in ("clavL", "clavR")], [("chest", None, None)]),
    ("cape / skirt, hips", [("cape", None, None), ("capeTip", None, None)],
     [(b, None, None) for b in ("pelvis",) + SKIRT_BONES]),
    ("skirt / shins, feet", [(b, None, None) for b in SKIRT_BONES],
     [(b, None, None) for b in ("shinL", "shinR", "footL", "footR", "toeL", "toeR")]),
    ("cape / legs", [("cape", None, None), ("capeTip", None, None)],
     [(b, None, None) for b in ("thighL", "thighR", "shinL", "shinR", "footL", "footR")]),
)
# what the hanging garments must keep covered: (label, garment bones, bones underneath).  Of a thigh only
# the part below the skirt's yoke counts (its top is inside the yoke, which is rigid on the pelvis).
# Of the lower leg only the knee counts for the skirt: shin and foot hang below the hem or - heel kicked up
# behind - are legitimately OUTSIDE it (they got there round the hem, not through the cloth); whether they
# cut into the cloth is measured as an ordinary clash instead ("skirt / shins, feet").
LEGS = ("thighL", "thighR", "shinL", "shinR", "footL", "footR")
THROUGH = (
    ("thighs, knees through the skirt", SKIRT_BONES, ("thighL", "thighR", "shinL", "shinR")),
    ("skirt gore through its neighbour", SKIRT_BONES, SKIRT_BONES),
    ("hips, skirt, legs through the cape", ("cape", "capeTip"), ("pelvis",) + SKIRT_BONES + LEGS),
)


def under_mask(bone: str, p) -> np.ndarray:
    """Which rest-pose points of a bone a hanging garment is responsible for hiding."""
    if bone.startswith("thigh"):
        return p[:, 1] < rig.HIP[1][1] - m(0.090)
    return np.ones(len(p), bool)


def under_skirt_mask(bone: str, p) -> np.ndarray:
    """... and which of them the SKIRT is responsible for: of a shin only the knee."""
    if bone.startswith("shin"):
        return p[:, 1] > rig.KNEE[1][1] - m(0.075)
    return under_mask(bone, p)

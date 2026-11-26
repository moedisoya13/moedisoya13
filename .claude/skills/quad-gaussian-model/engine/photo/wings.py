"""Nike's wings, modelled from side-view photographs of the Louvre statue.

Each wing is a curved *sheet* standing behind the shoulder.  Its outline and its feather relief are
not invented: ``extract_wings.py`` cut them out of one photograph per wing (left wing = the original
marble seen from the statue's left, right wing = the 1880s plaster reconstruction seen from its
right) and stored them in ``wings.npz`` as two small images per wing, both drawn in the statue's side
plane (z = front/back, y = height):

  * ``sdf``    - signed distance to the wing's silhouette (negative inside), in model units
  * ``relief`` - feather ridges and grooves in [-1, 1], running the way the photographed feathers run

The 3D shape = that silhouette extruded to a slab around the sheet ``x = sheet_x(s, z, y)`` (the wings
open into a V when seen from the front/back), thick and rounded along the leading edge and the root,
thin at the trailing feather tips, with the relief pressed into both faces.

Coordinates as in nike.py: y up, the figure faces +z, +x is her left; s = +1 left wing, -1 right wing.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

F32 = np.float32
DATA = Path(__file__).resolve().parent / "wings.npz"

# Where the wing leaves the back (shoulder blade) and how far it opens sideways.  Measured on the
# front / back photographs: the tips end ~0.45-0.5 beyond the shoulders.
ROOT = {1: (0.105, 0.50, -0.08), -1: (-0.105, 0.50, -0.08)}  # bone pivot of each wing
SHEET = {  # x = s * (x0 + open * t + bow * t * (1 - t / span)),  t = distance behind z0
    1: dict(x0=0.125, z0=-0.06, open=0.62, bow=0.10, span=0.95, lean=0.05, y0=0.55),
    -1: dict(x0=0.125, z0=-0.06, open=0.62, bow=0.10, span=0.95, lean=0.05, y0=0.55),
}
T_EDGE = 0.010   # half thickness right at the silhouette (feather tips)
T_BODY = 0.019   # half thickness of the feathered blade
T_LEAD = 0.024   # extra half thickness along the leading edge ("arm" of the wing)
RELIEF = 0.0085  # depth of the feather relief pressed into the faces
ROUND = 0.006


def sheet_x(s, z, y):
    """x of the wing sheet at side-plane position (z, y)."""
    k = SHEET[s]
    t = np.maximum(k["z0"] - z, 0.0)
    return s * (k["x0"] + k["open"] * t + k["bow"] * t * (1 - t / k["span"]) + k["lean"] * (y - k["y0"]))


def _sheet_cos(s, z):
    """cos of the angle between the sheet and the side plane (turns x offsets into true thickness)."""
    k = SHEET[s]
    t = np.maximum(k["z0"] - z, 0.0)
    dx = np.where(t > 0, k["open"] + k["bow"] * (1 - 2 * t / k["span"]), 0.0)
    return 1.0 / np.sqrt(1.0 + dx * dx + k["lean"] ** 2)


class _Wing:
    def __init__(self, z, s):
        side = "L" if s > 0 else "R"
        self.s = s
        self.sdf = z["sdf" + side].astype(F32)        # (ny, nz) rows = y ascending, cols = z ascending
        self.relief = z["relief" + side].astype(F32) / 127.0
        self.lead = z["lead" + side].astype(F32)      # distance below the leading (upper) edge
        self.z0, self.y0, self.h = (float(v) for v in z["grid" + side])
        self.frame = z["frame" + side].astype(F32)    # leading-edge polyline, root -> tip
        ny, nz = self.sdf.shape
        ins = np.argwhere(self.sdf < 0)
        ylo, zlo = ins.min(0) * self.h + (self.y0, self.z0)
        yhi, zhi = ins.max(0) * self.h + (self.y0, self.z0)
        zz, yy = np.meshgrid([zlo, zhi], [ylo, yhi])
        xs = sheet_x(s, zz, yy)
        pad = 0.06
        self.aabb = (np.array([xs.min() - pad, ylo - 0.02, zlo - 0.02], F32),
                     np.array([xs.max() + pad, yhi + 0.02, zhi + 0.02], F32))

    def sample(self, img, z, y, fill):
        """Bilinear lookup of a side-plane image at (z, y); ``fill`` outside the image."""
        u = (z - self.z0) / self.h
        v = (y - self.y0) / self.h
        ny, nz = img.shape
        ok = (u >= 0) & (u <= nz - 1.001) & (v >= 0) & (v <= ny - 1.001)
        u0 = np.clip(np.floor(u), 0, nz - 2).astype(np.int64)
        v0 = np.clip(np.floor(v), 0, ny - 2).astype(np.int64)
        fu, fv = np.clip(u - u0, 0, 1), np.clip(v - v0, 0, 1)
        a = img[v0, u0] * (1 - fu) + img[v0, u0 + 1] * fu
        b = img[v0 + 1, u0] * (1 - fu) + img[v0 + 1, u0 + 1] * fu
        return np.where(ok, a * (1 - fv) + b * fv, fill).astype(F32)


_CACHE = {}


def wing(s) -> _Wing:
    if s not in _CACHE:
        with np.load(DATA) as z:
            _CACHE[s] = _Wing(z, s)
    return _CACHE[s]


def sources() -> dict:
    """Which photographs / camera registration the stored outlines came from."""
    with np.load(DATA) as z:
        return json.loads(str(z["meta"]))


def wing_frame(s):
    """Leading edge (root -> tip) of one wing as a polyline, traced on the photographed outline."""
    return [np.array(q, F32) for q in wing(s).frame]


def wing_aabb(s):
    return wing(s).aabb


def wing_sdf(p, s):
    w = wing(s)
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    d2 = w.sample(w.sdf, z, y, 0.05)               # silhouette distance in the side plane
    inside = np.maximum(-d2, 0.0)
    lead = w.sample(w.lead, z, y, 1.0)
    rel = w.sample(w.relief, z, y, 0.0)
    # thickness: thin at the feather tips, a blade inside, a thick rounded "arm" under the leading edge
    grow = np.clip(inside / 0.045, 0, 1)
    grow = grow * (2 - grow)
    t = T_EDGE + (T_BODY - T_EDGE) * grow + T_LEAD * np.exp(-(lead / 0.085) ** 2) * np.clip(inside / 0.03, 0, 1)
    t = t + RELIEF * rel * np.clip(inside / 0.02, 0, 1)
    h = np.abs(x - sheet_x(s, z, y)) * _sheet_cos(s, z) - t
    qa, qb = d2 + ROUND, h + ROUND
    d = np.sqrt(np.maximum(qa, 0) ** 2 + np.maximum(qb, 0) ** 2) + np.minimum(np.maximum(qa, qb), 0) - ROUND
    # root: a short thick stem under the leading edge, from the shoulder blade into the sheet
    r0 = np.array(ROOT[s], F32)
    r1 = w.frame[1] * 0.4 + w.frame[0] * 0.6
    pa, ba = p - r0, r1 - r0
    tt = np.clip((pa * ba).sum(-1) / float(ba @ ba), 0, 1)
    stem = np.sqrt(((pa - tt[..., None] * ba) ** 2).sum(-1)) - (0.055 - 0.02 * tt)
    k = 0.04
    hh = np.clip(0.5 + 0.5 * (stem - d) / k, 0, 1)
    return (stem + (d - stem) * hh - k * hh * (1 - hh)).astype(F32)

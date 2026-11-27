"""Gray-box level: a small layout table (``layout.json``, metres) -> terrain queries -> surface splats.

    layout.json --Level--> height(x, z), surface(x, z)      what gameplay code asks ("how high is the
                       \\                                    ground here, what am I standing on")
                        `-> splats(spacing) -> SplatModel   what the renderer draws

Nothing is trained and no mesh is built: every element is a simple analytic shape, so the splats are
laid directly ON the shape in a regular lattice (one splat per lattice cell, sized to overlap its
neighbours).  A lattice needs about a fifth of the splats that random surface sampling
(``SplatModel.from_mesh``) needs for a hole-free surface, and it is exact: a splat's centre, normal
and size come from the shape's formula.

Elements (``type``):
    hill     smooth bump                       at, radius, height
    pond     flat sunken disc ("water")        at, radius [rx, rz], depth, bank (width of the shore slope)
    plateau  raised box with cliff sides       at, size [sx, sz], height, rot
    ramp     sloped box                        at, size [length, width], rot, height [start, end]
    path     a strip painted on the ground     points [[x, z], ...], width
    spawn    marker disc + pointer on ground   at, facing
    rock     half ellipsoid on the ground      at, size [sx, height, sz], rot
    tree     trunk + cone / sphere canopy      at, height, radius, canopy, (trunk = trunk radius)

Coordinates: the layout is in METRES, x = east, z = south, heights above the meadow; angles in degrees
turning from +x towards +z.  The world uses the soldier's convention: y up, ground at y = GROUND = -1,
1.80 world units = a 1.75 m person, so  world = metres * UNITS_PER_M.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

UNITS_PER_M = 1.80 / 1.75  # same scale as examples/soldier/rig.py (H = 1.80 for a 1.75 m man)
GROUND = -1.0  # world y of the meadow (examples/soldier/rig.py GROUND)
MATERIALS = ("grass", "path", "water", "cliff", "rock", "trunk", "canopy", "marker")
MAT = {name: i for i, name in enumerate(MATERIALS)}
# neutral greys (sRGB).  Walkable ground gets lighter with height so levels read without colour.
TONE = {"grass": 0.50, "path": 0.66, "water": 0.20, "cliff": 0.34, "rock": 0.42, "trunk": 0.27, "canopy": 0.38,
        "marker": 0.90}
TONE_PER_M = 0.07  # walkable ground: + this much per metre of height ...
TONE_RANGE = (0.40, 0.74)  # ... clamped to this range
SKIRT = 0.6  # metres: depth of the wall around the level's outer edge
DEFAULT_LAYOUT = Path(__file__).with_name("layout.json")


def _rot2(deg: float):
    a = math.radians(deg)
    return math.cos(a), math.sin(a)


def _smooth(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _local(x, z, at, rot):
    """World (x, z) -> the element's own axes (u along its ``rot`` direction, v across)."""
    c, s = _rot2(rot)
    dx, dz = x - at[0], z - at[1]
    return dx * c + dz * s, -dx * s + dz * c


def frame_from_normal(n: np.ndarray):
    """Two unit tangents (tu, tv) with tu x tv = n, for (N,3) unit normals."""
    up = np.where(np.abs(n[:, 1:2]) > 0.95, np.array([[1.0, 0.0, 0.0]]), np.array([[0.0, 1.0, 0.0]]))
    tu = np.cross(up, n)
    tu /= np.linalg.norm(tu, axis=1, keepdims=True)
    return tu, np.cross(n, tu)


def fibonacci_sphere(n: int) -> np.ndarray:
    """n nearly evenly spread unit vectors."""
    i = np.arange(n) + 0.5
    y = 1 - 2 * i / n
    r = np.sqrt(np.clip(1 - y * y, 0, 1))
    phi = i * math.pi * (3 - math.sqrt(5))
    return np.stack([r * np.cos(phi), y, r * np.sin(phi)], 1)


@dataclass
class Splats:
    """Surface splats in WORLD units (see module docstring).  R = [tu | tv | normal] per splat."""
    pos: np.ndarray  # (N,3)
    tu: np.ndarray  # (N,3)
    tv: np.ndarray  # (N,3)
    normal: np.ndarray  # (N,3)
    scale: np.ndarray  # (N,2) sigma along tu, tv
    mat: np.ndarray  # (N,) index into MATERIALS
    elem: np.ndarray  # (N,) index into Level.elements, -1 = plain terrain
    height_m: np.ndarray  # (N,) height above the meadow in metres (for the tone)

    def __len__(self):
        return len(self.pos)

    @property
    def albedo(self) -> np.ndarray:
        return tone(self.mat, self.height_m)


def tone(mat: np.ndarray, height_m: np.ndarray) -> np.ndarray:
    """(N,3) neutral grey per splat: by material, walkable ground also by height."""
    base = np.array([TONE[m] for m in MATERIALS])[mat]
    walk = (mat == MAT["grass"]) | (mat == MAT["path"])
    lifted = np.clip(base + TONE_PER_M * height_m, *TONE_RANGE)
    lifted = np.where(mat == MAT["path"], np.clip(lifted, TONE["path"], 0.82), lifted)
    g = np.where(walk, lifted, base)
    return np.repeat(g[:, None], 3, 1).astype(np.float32)


class Level:
    def __init__(self, layout: dict):
        self.layout = layout
        self.name = layout.get("name", "level")
        self.size = tuple(float(v) for v in layout["size"])  # metres (x, z), centred on the origin
        self.grid = dict(layout.get("grid", {"minor": 1.0, "major": 5.0}))
        self.elements: List[dict] = list(layout.get("elements", []))
        self.demo = dict(layout.get("demo", {}))
        known = {"hill", "pond", "plateau", "ramp", "path", "spawn", "rock", "tree"}
        for e in self.elements:
            if e.get("type") not in known:
                raise ValueError(f"unknown element type {e.get('type')!r}; known: {sorted(known)}")

    @classmethod
    def load(cls, path=None) -> "Level":
        return cls(json.loads(Path(path or DEFAULT_LAYOUT).read_text()))

    def of(self, kind: str) -> List[dict]:
        return [e for e in self.elements if e["type"] == kind]

    # ------------------------------------------------------------ queries (metres in, metres out)
    def _block(self, e, x, z):
        """(inside mask, top height) of a plateau / ramp at points (x, z)."""
        u, v = _local(x, z, e["at"], e.get("rot", 0.0))
        su, sv = e["size"]
        inside = (np.abs(u) <= su / 2) & (np.abs(v) <= sv / 2)
        if e["type"] == "plateau":
            return inside, np.full(np.shape(u), float(e["height"]))
        h0, h1 = e["height"]
        return inside, h0 + (h1 - h0) * np.clip(u / su + 0.5, 0, 1)

    def height(self, x, z) -> np.ndarray:
        """Ground height (metres above the meadow) at (x, z) metres; works on arrays."""
        x, z = np.asarray(x, np.float64), np.asarray(z, np.float64)
        h = np.zeros(np.broadcast(x, z).shape)
        for e in self.of("hill"):
            r = np.hypot(x - e["at"][0], z - e["at"][1]) / e["radius"]
            h = h + e["height"] * 0.5 * (1 + np.cos(np.pi * np.clip(r, 0, 1)))
        for e in self.of("pond"):
            rx, rz = e["radius"]
            q = np.hypot((x - e["at"][0]) / rx, (z - e["at"][1]) / rz)
            shore = e.get("bank", 0.8) / min(rx, rz)  # the bank's width, in units of q
            h = -e["depth"] + (h + e["depth"]) * _smooth((q - 1) / shore)
        for e in self.of("plateau") + self.of("ramp"):
            inside, top = self._block(e, x, z)
            h = np.where(inside, np.maximum(h, top), h)
        return h

    def surface(self, x, z) -> np.ndarray:
        """Material index (into MATERIALS) of the walkable surface at (x, z) metres."""
        x, z = np.asarray(x, np.float64), np.asarray(z, np.float64)
        m = np.full(np.broadcast(x, z).shape, MAT["grass"])
        on_block = np.zeros(m.shape, bool)
        for e in self.of("plateau") + self.of("ramp"):
            on_block |= self._block(e, x, z)[0]
        for e in self.of("pond"):
            rx, rz = e["radius"]
            q = np.hypot((x - e["at"][0]) / rx, (z - e["at"][1]) / rz)
            m = np.where((q <= 1) & ~on_block, MAT["water"], m)
        for e in self.of("path"):
            m = np.where((self.path_distance(e, x, z) <= e["width"] / 2) & (m != MAT["water"]), MAT["path"], m)
        for e in self.of("spawn"):
            m = np.where(self.spawn_mask(e, x, z), MAT["marker"], m)
        return m

    @staticmethod
    def path_distance(e, x, z) -> np.ndarray:
        """Distance (m) from (x, z) to the path's centre line."""
        pts = np.asarray(e["points"], np.float64)
        d = np.full(np.broadcast(x, z).shape, np.inf)
        for a, b in zip(pts[:-1], pts[1:]):
            ab = b - a
            t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / max(float(ab @ ab), 1e-12), 0, 1)
            d = np.minimum(d, np.hypot(x - (a[0] + t * ab[0]), z - (a[1] + t * ab[1])))
        return d

    @staticmethod
    def spawn_mask(e, x, z, radius: float = 0.55, pointer: float = 1.15, width: float = 0.3) -> np.ndarray:
        """A disc where the unit spawns plus a short pointer in the direction it faces."""
        u, v = _local(x, z, e["at"], e.get("facing", 0.0))
        return (np.hypot(u, v) <= radius) | ((u >= 0) & (u <= pointer) & (np.abs(v) <= width / 2))

    def bounds_world(self):
        """(lo, hi) world-space box that contains everything (for framing the camera)."""
        sx, sz = self.size
        top = max([0.0] + [e["height"] for e in self.of("hill") + self.of("plateau")] +
                  [max(e["height"]) for e in self.of("ramp")])
        prop = max([0.0] + [e["height"] for e in self.of("tree")] + [e["size"][1] for e in self.of("rock")])
        low = max([SKIRT] + [e["depth"] for e in self.of("pond")]) + 0.4  # (a coarse lattice deepens the skirt a little)
        U = UNITS_PER_M
        return (np.array([-sx / 2 * U, GROUND - low * U, -sz / 2 * U]),
                np.array([sx / 2 * U, GROUND + (top + prop) * U, sz / 2 * U]))

    # ------------------------------------------------------------ geometry
    def terrain_grid(self, spacing: float):
        """Cell centres (x (nx,), z (nz,)) of the terrain lattice and the height there (nz, nx)."""
        sx, sz = self.size
        nx, nz = int(round(sx / spacing)), int(round(sz / spacing))
        x = -sx / 2 + (np.arange(nx) + 0.5) * (sx / nx)
        z = -sz / 2 + (np.arange(nz) + 0.5) * (sz / nz)
        return x, z, self.height(x[None, :], z[:, None])

    def splats(self, spacing: float = 0.125, overlap: float = 0.62, wall_slope: float = 1.5,
               skirt: float = SKIRT) -> Splats:
        """All surface splats.  ``spacing`` = lattice step in metres; ``overlap`` = splat sigma / step
        (0.5 is the smallest that leaves no hole in no-blend rendering, see README); a height step
        of more than ``wall_slope`` * spacing between two cells becomes a vertical wall; ``skirt`` =
        depth (m) of the wall that closes the level's outer edge (0 = none)."""
        parts = [self._terrain_tops(spacing, overlap, wall_slope),
                 self._terrain_walls(spacing, overlap, wall_slope, skirt)]
        for i, e in enumerate(self.elements):
            if e["type"] == "rock":
                parts.append(self._rock(e, i, spacing, overlap))
            elif e["type"] == "tree":
                parts.append(self._tree(e, i, spacing, overlap))
        parts = [p for p in parts if p is not None and len(p["pos"])]
        cat = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
        U = UNITS_PER_M
        pos = cat["pos"] * U
        pos[:, 1] += GROUND
        return Splats(pos.astype(np.float32), cat["tu"].astype(np.float32), cat["tv"].astype(np.float32),
                      cat["normal"].astype(np.float32), (cat["scale"] * U).astype(np.float32),
                      cat["mat"].astype(np.int64), cat["elem"].astype(np.int64), cat["pos"][:, 1].astype(np.float32))

    def _walls(self, H, wall):
        """Which neighbouring cell pairs are split by a wall: (along x (nz, nx-1), along z (nz-1, nx))."""
        return np.abs(np.diff(H, axis=1)) > wall, np.abs(np.diff(H, axis=0)) > wall

    def _terrain_tops(self, d, overlap, wall_slope):
        x, z, H = self.terrain_grid(d)
        dx, dz = x[1] - x[0], z[1] - z[0]
        wx, wz = self._walls(H, wall_slope * d)

        def grad(dH, wall, step, axis):
            """Slope from the neighbours on the same side of every wall (one-sided next to a cliff)."""
            g = np.where(wall, 0.0, dH / step)
            ok = (~wall).astype(np.float64)
            pad = [(0, 0), (0, 0)]
            pad[axis] = (1, 1)
            g, ok = np.pad(g, pad), np.pad(ok, pad)
            sl = [slice(None), slice(None)]
            a, b = list(sl), list(sl)
            a[axis], b[axis] = slice(0, -1), slice(1, None)
            return (g[tuple(a)] + g[tuple(b)]) / np.maximum(ok[tuple(a)] + ok[tuple(b)], 1)

        gx = grad(np.diff(H, axis=1), wx, dx, 1)
        gz = grad(np.diff(H, axis=0), wz, dz, 0)
        X, Z = np.meshgrid(x, z)
        n = np.stack([-gx, np.ones_like(gx), -gz], -1).reshape(-1, 3)
        n /= np.linalg.norm(n, axis=1, keepdims=True)
        tu = np.stack([np.ones_like(gx), gx, np.zeros_like(gx)], -1).reshape(-1, 3)
        tu /= np.linalg.norm(tu, axis=1, keepdims=True)
        tv = np.cross(n, tu)
        s = overlap * max(dx, dz)
        scale = np.stack([s * np.sqrt(1 + gx ** 2), s * np.sqrt(1 + gz ** 2)], -1).reshape(-1, 2)
        pos = np.stack([X, H, Z], -1).reshape(-1, 3)
        return dict(pos=pos, tu=tu, tv=tv, normal=n, scale=scale, mat=self.surface(X, Z).reshape(-1),
                    elem=np.full(len(pos), -1))

    def _terrain_walls(self, d, overlap, wall_slope, skirt=0.0):
        x, z, H = self.terrain_grid(d)
        if skirt > 0:  # one ring of virtual cells below the edge: the usual wall rule then closes the rim
            dx, dz = x[1] - x[0], z[1] - z[0]
            x = np.concatenate([[x[0] - dx], x, [x[-1] + dx]])
            z = np.concatenate([[z[0] - dz], z, [z[-1] + dz]])
            H = np.pad(H, 1, mode="edge")
            for edge in (np.s_[0, :], np.s_[-1, :], np.s_[:, 0], np.s_[:, -1]):
                H[edge] -= max(skirt, 2 * wall_slope * d)
            H[0, 0] = H[0, 1]; H[0, -1] = H[0, -2]; H[-1, 0] = H[-1, 1]; H[-1, -1] = H[-1, -2]  # noqa: E702
        wx, wz = self._walls(H, wall_slope * d)
        out = {k: [] for k in ("pos", "tu", "tv", "normal", "scale")}
        Y, Xp, Zp = np.array([0.0, 1.0, 0.0]), np.array([1.0, 0.0, 0.0]), np.array([0.0, 0.0, 1.0])
        for axis, wall in ((1, wx), (0, wz)):
            jj, ii = np.nonzero(wall)
            if len(jj) == 0:
                continue
            a = H[jj, ii]
            b = H[jj, ii + 1] if axis == 1 else H[jj + 1, ii]
            lo, hi = np.minimum(a, b), np.maximum(a, b)
            cnt = np.ceil((hi - lo) / d).astype(int)
            rep = np.repeat(np.arange(len(jj)), cnt)
            k = np.arange(len(rep)) - np.repeat(np.cumsum(cnt) - cnt, cnt)
            step = ((hi - lo) / cnt)[rep]
            y = lo[rep] + (k + 0.5) * step
            if axis == 1:
                px, pz = 0.5 * (x[ii] + x[ii + 1])[rep], z[jj][rep]
                across, along = Xp, Zp
            else:
                px, pz = x[ii][rep], 0.5 * (z[jj] + z[jj + 1])[rep]
                across, along = Zp, Xp
            sign = np.where(a > b, 1.0, -1.0)[rep]  # the wall faces the LOW side
            n = sign[:, None] * across
            # right-handed frame per facing: (Y, Z, +X), (Z, Y, -X), (X, Y, +Z), (Y, X, -Z)
            first_is_y = (sign > 0) if axis == 1 else (sign < 0)
            tu = np.where(first_is_y[:, None], Y, along)
            tv = np.where(first_is_y[:, None], along, Y)
            sy, sh = overlap * step, np.full(len(rep), overlap * d)
            scale = np.where(first_is_y[:, None], np.stack([sy, sh], 1), np.stack([sh, sy], 1))
            for key, val in (("pos", np.stack([px, y, pz], 1)), ("tu", tu), ("tv", tv), ("normal", n), ("scale", scale)):
                out[key].append(val)
        if not out["pos"]:
            return None
        res = {k: np.concatenate(v) for k, v in out.items()}
        res["mat"] = np.full(len(res["pos"]), MAT["cliff"])
        res["elem"] = np.full(len(res["pos"]), -1)
        return res

    @staticmethod
    def _prop(pos, normal, sigma, mat, elem):
        tu, tv = frame_from_normal(normal)
        return dict(pos=pos, tu=tu, tv=tv, normal=normal, scale=np.repeat(np.reshape(sigma, (-1, 1)), 2, 1) *
                    np.ones((len(pos), 2)), mat=np.full(len(pos), MAT[mat]), elem=np.full(len(pos), elem))

    def _rock(self, e, idx, d, overlap):
        """Upper half of an ellipsoid with semi-axes (sx/2, height, sz/2), its centre on the ground."""
        a, b, c = e["size"][0] / 2, e["size"][1], e["size"][2] / 2
        big, mid = sorted((a, b, c))[2], sorted((a, b, c))[1]
        n_pts = int(math.ceil(4 * math.pi * big * mid / d ** 2))
        u = fibonacci_sphere(n_pts)
        u = u[u[:, 1] > -0.08]  # the buried half is never seen
        cs, sn = _rot2(e.get("rot", 0.0))
        rot = np.array([[cs, 0, -sn], [0, 1, 0], [sn, 0, cs]])  # local x -> (cos, sin) in (x, z)
        p = (u * [a, b, c]) @ rot.T
        nrm = (u / [a, b, c]) @ rot.T
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
        base = float(self.height(e["at"][0], e["at"][1]))
        p += [e["at"][0], base, e["at"][1]]
        sigma = 1.1 * overlap * math.sqrt(4 * math.pi / n_pts) * big
        return self._prop(p, nrm, sigma, "rock", idx)

    def _tree(self, e, idx, d, overlap):
        """Stand-in tree: a cylinder trunk and a cone or sphere canopy; ``height`` = total height."""
        Ht, R = float(e["height"]), float(e["radius"])
        rt = float(e.get("trunk", 0.06 * Ht))
        base = float(self.height(e["at"][0], e["at"][1]))
        at = np.array([e["at"][0], base, e["at"][1]])
        kind = e.get("canopy", "cone")
        if kind not in ("cone", "sphere"):
            raise ValueError(f"tree canopy must be 'cone' or 'sphere', got {kind!r}")
        trunk_top = 0.3 * Ht if kind == "cone" else Ht - R
        parts = []
        # trunk: rings of splats
        n_phi = max(8, int(math.ceil(2 * math.pi * rt / d)))
        n_y = max(1, int(math.ceil(trunk_top / d)))
        phi = (np.arange(n_phi) + 0.5) * 2 * math.pi / n_phi
        yy = (np.arange(n_y) + 0.5) * trunk_top / n_y
        P, Yg = np.meshgrid(phi, yy)
        nrm = np.stack([np.cos(P), np.zeros_like(P), np.sin(P)], -1).reshape(-1, 3)
        pos = nrm * rt + np.stack([np.zeros(P.size), Yg.reshape(-1), np.zeros(P.size)], 1)
        sig = 1.1 * overlap * max(trunk_top / n_y, 2 * math.pi * rt / n_phi)
        parts.append(self._prop(pos + at, nrm, sig, "trunk", idx))
        if kind == "sphere":
            n_pts = int(math.ceil(4 * math.pi * R * R / d ** 2))
            u = fibonacci_sphere(n_pts)
            parts.append(self._prop(u * R + at + [0, Ht - R, 0], u, 1.1 * overlap * math.sqrt(4 * math.pi / n_pts) * R,
                                    "canopy", idx))
        else:
            Hc = Ht - trunk_top
            L = math.hypot(R, Hc)
            n_s = max(2, int(math.ceil(L / d)))
            pos, nrm = [], []
            for k in range(n_s):
                t = (k + 0.5) / n_s
                r = R * (1 - t)
                m = max(6, int(math.ceil(2 * math.pi * r / d)))
                ph = (np.arange(m) + 0.5 * (k % 2)) * 2 * math.pi / m
                pos.append(np.stack([r * np.cos(ph), np.full(m, trunk_top + t * Hc), r * np.sin(ph)], 1))
                nrm.append(np.stack([np.cos(ph) * Hc / L, np.full(m, R / L), np.sin(ph) * Hc / L], 1))
            # the flat underside, so the canopy is closed when seen from a low sun (shadow map)
            m = int(math.ceil(R / d))
            gx, gz = np.meshgrid((np.arange(-m, m + 1)) * d, (np.arange(-m, m + 1)) * d)
            keep = np.hypot(gx, gz) <= R
            under = np.stack([gx[keep], np.full(keep.sum(), trunk_top), gz[keep]], 1)
            pos.append(under)
            nrm.append(np.tile([0.0, -1.0, 0.0], (len(under), 1)))
            parts.append(self._prop(np.concatenate(pos) + at, np.concatenate(nrm), 1.1 * overlap * max(L / n_s, d),
                                    "canopy", idx))
        return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}

    # ------------------------------------------------------------ helpers for placing things
    def to_world(self, x, z, lift: float = 0.0) -> np.ndarray:
        """World position of the ground point at layout (x, z) metres (+ ``lift`` metres)."""
        h = self.height(x, z)
        return np.stack([np.asarray(x, np.float64) * UNITS_PER_M, GROUND + (h + lift) * UNITS_PER_M,
                         np.asarray(z, np.float64) * UNITS_PER_M], -1)

    def summary(self) -> Dict[str, int]:
        out: Dict[str, int] = {}
        for e in self.elements:
            out[e["type"]] = out.get(e["type"], 0) + 1
        return out


def to_model(sp: Splats, opacity: float = 0.95, roughness: float = 0.92):
    """Splats -> the engine's SplatModel (no training; patch 0, material = grey tone, rough, no metal)."""
    from pixelsplat.splats import SplatModel, _logit, rot_to_quat

    R = np.stack([sp.tu, sp.tv, sp.normal], -1).astype(np.float64)  # columns
    n = len(sp)
    return SplatModel(sp.pos, rot_to_quat(R), np.log(sp.scale), np.full(n, _logit(opacity), np.float32), sp.albedo,
                      np.full(n, roughness, np.float32), np.zeros(n, np.float32))


def polyline_point(points, s: float):
    """Point and heading (degrees, from +x towards +z) at arc length ``s`` along a polyline (clamped)."""
    pts = np.asarray(points, np.float64)
    seg = np.diff(pts, axis=0)
    ln = np.hypot(seg[:, 0], seg[:, 1])
    s = float(np.clip(s, 0.0, ln.sum()))
    i = int(min(np.searchsorted(np.cumsum(ln), s, side="left"), len(ln) - 1))
    t = (s - (np.cumsum(ln)[i] - ln[i])) / max(ln[i], 1e-12)
    return pts[i] + t * seg[i], math.degrees(math.atan2(seg[i, 1], seg[i, 0]))


def polyline_length(points) -> float:
    pts = np.asarray(points, np.float64)
    return float(np.hypot(*np.diff(pts, axis=0).T).sum())

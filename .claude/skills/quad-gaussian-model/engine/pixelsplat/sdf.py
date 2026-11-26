"""Tiny signed-distance-field (SDF) sculpting kit + meshing.

Used to *sculpt* assets procedurally when no 3D model file exists.
All functions take points ``p`` of shape (...,3) (float32) and return (...,).
Negative = inside, positive = outside.
"""
from __future__ import annotations

from typing import Callable, Dict, Sequence, Tuple

import numpy as np

F32 = np.float32


def _v(a):
    return np.asarray(a, F32)


def dot(a, b):
    return (a * b).sum(-1)


def length(a):
    return np.sqrt((a * a).sum(-1))


# ------------------------------------------------------------------ primitives
def sphere(p, c, r):
    return length(p - _v(c)) - r


def ellipsoid(p, c, r):
    """Approximate ellipsoid distance (Quilez)."""
    q = (p - _v(c)) / _v(r)
    k0 = length(q)
    k1 = length(q / _v(r))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def capsule(p, a, b, r):
    a, b = _v(a), _v(b)
    pa, ba = p - a, b - a
    h = np.clip(dot(pa, ba) / dot(ba, ba), 0, 1)
    return length(pa - h[..., None] * ba) - r


def round_cone(p, a, b, r1, r2):
    """Capsule whose radius tapers from r1 (at a) to r2 (at b) (Quilez)."""
    a, b = _v(a), _v(b)
    ba = b - a
    l2 = float(dot(ba, ba))
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = dot(pa, ba)
    z = y - l2
    x = pa * l2 - y[..., None] * ba
    x2 = dot(x, x)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d1 = np.sqrt(x2 + z2) * il2 - r2
    d2 = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))


def flat_capsule(p, a, b, r, half_thick, normal):
    """A capsule squashed into a slab of ±half_thick along ``normal`` — a feather/blade."""
    n = _v(normal) / np.linalg.norm(normal)
    h = dot(p - _v(a), n)
    pp = p - h[..., None] * n  # project into the slab plane
    d2 = capsule(pp, a, b, r)
    dz = np.abs(h) - half_thick
    out = np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(dz, 0) ** 2)
    return out + np.minimum(np.maximum(d2, dz), 0)


# ------------------------------------------------------------------ operators
def smin(a, b, k):
    """Smooth union — blends shapes like clay (k = blend radius)."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def union(ds: Sequence[np.ndarray], k: float):
    d = ds[0]
    for e in ds[1:]:
        d = smin(d, e, k)
    return d


# ------------------------------------------------------------------ noise
def _hash3(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(F32) / 65535.0


def value_noise(p, freq=4.0, seed=0, octaves=3):
    """Smooth 3D value noise in [0,1]."""
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        q = p * (freq * 2 ** o)
        i = np.floor(q).astype(np.int64)
        f = q - i
        f = f * f * (3 - 2 * f)
        acc = 0.0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = ((f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1])
                         * (f[..., 2] if dz else 1 - f[..., 2]))
                    acc = acc + w * _hash3(i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz, seed + o)
        total = total + amp * acc
        norm += amp
        amp *= 0.5
    return total / norm


# ------------------------------------------------------------------ meshing
Component = Tuple[Callable[[np.ndarray], np.ndarray], Tuple[np.ndarray, np.ndarray]]


def mesh_components(components: Dict[str, Component], voxel: float, k: float = 0.02, pad: float = 0.06):
    """Mesh the smooth union of named components with marching cubes.

    Each component = (sdf_fn, (aabb_lo, aabb_hi)); it is only evaluated inside
    its own padded box, which keeps fine detail (feathers) affordable.
    Returns verts (V,3), faces (F,3).
    """
    from skimage.measure import marching_cubes

    los = np.min([np.asarray(b[0]) for _, b in components.values()], 0) - pad
    his = np.max([np.asarray(b[1]) for _, b in components.values()], 0) + pad
    shape = np.ceil((his - los) / voxel).astype(int) + 1
    field = np.full(shape, 1.0, F32)
    for name, (fn, (lo, hi)) in components.items():
        i0 = np.maximum(np.floor((np.asarray(lo) - pad - los) / voxel).astype(int), 0)
        i1 = np.minimum(np.ceil((np.asarray(hi) + pad - los) / voxel).astype(int) + 1, shape)
        axes = [los[a] + voxel * np.arange(i0[a], i1[a], dtype=F32) for a in range(3)]
        P = np.stack(np.meshgrid(*axes, indexing="ij"), -1).astype(F32)
        d = fn(P)
        sl = tuple(slice(i0[a], i1[a]) for a in range(3))
        field[sl] = smin(field[sl], d.astype(F32), k)
    verts, faces, _, _ = marching_cubes(field, 0.0, spacing=(voxel,) * 3)
    verts = verts + los
    # outward winding, whatever the library version returns: the signed volume
    # Σ v0·(v1×v2)/6 of a closed surface is positive exactly when its faces point outward
    # (scikit-image 0.26 already does; older code here flipped unconditionally → inward)
    v = verts[faces].astype(np.float64)
    if (v[:, 0] * np.cross(v[:, 1], v[:, 2])).sum() < 0:
        faces = faces[:, ::-1]
    return verts.astype(F32), np.ascontiguousarray(faces, dtype=np.int32)


def sdf_normal(fn, p, eps=2e-3):
    e = np.eye(3, dtype=F32) * eps
    g = np.stack([fn(p + e[i]) - fn(p - e[i]) for i in range(3)], -1)
    return g / (np.linalg.norm(g, axis=-1, keepdims=True) + 1e-12)


def ambient_occlusion(fn, p, n, steps=(0.015, 0.035, 0.07, 0.12)):
    """Cheap SDF ambient occlusion in [0,1] (1 = open, 0 = deep crevice)."""
    occ, w = 0.0, 1.0
    for h in steps:
        occ = occ + w * np.maximum(h - fn(p + n * h), 0) / h
        w *= 0.6
    return np.clip(1.0 - 0.55 * occ, 0, 1)

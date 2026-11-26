"""Ground-truth G-buffer renderer for meshes (CPU, numba z-buffer rasterizer).

Produces, per pixel:  albedo(3, sRGB) | normal(3, world) | depth(1, camera z)
                      | roughness(1) | metallic(1) | alpha(1)
These images are the *teacher* the splats learn from.
"""
from __future__ import annotations

from typing import List

import numpy as np
from numba import njit

from .camera import Camera
from .mesh import Part

# channel layout of a G-buffer array (H,W,C)
ALB, NRM, DEP, RGH, MET, ALP = slice(0, 3), slice(3, 6), 6, 7, 8, 9
GBUF_C = 10


@njit(cache=True, fastmath=True)
def _sample(tex, u, v):
    """Bilinear texture lookup, repeat wrap, glTF/trimesh UV (v=0 at bottom)."""
    H, W = tex.shape[0], tex.shape[1]
    u = u - np.floor(u)
    v = v - np.floor(v)
    x = u * W - 0.5
    y = (1.0 - v) * H - 0.5
    x0 = int(np.floor(x))
    y0 = int(np.floor(y))
    fx = x - x0
    fy = y - y0
    out = np.zeros(3, np.float32)
    for dy in range(2):
        for dx in range(2):
            w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy)
            xx = (x0 + dx) % W
            yy = (y0 + dy) % H
            for c in range(3):
                out[c] += w * tex[yy, xx, c]
    return out


@njit(cache=True, fastmath=True)
def _raster_part(gb, zbuf, P, V, F, N, UV, has_uv, base_tex, has_tex, base_col, VC, has_vc,
                 mr_tex, has_mr, rough, metal, ortho):
    H, W = zbuf.shape
    nv = V.shape[0]
    sx = np.empty(nv)
    sy = np.empty(nv)
    sz = np.empty(nv)  # camera depth
    for i in range(nv):
        X = V[i, 0] * P[0, 0] + V[i, 1] * P[0, 1] + V[i, 2] * P[0, 2] + P[0, 3]
        Y = V[i, 0] * P[1, 0] + V[i, 1] * P[1, 1] + V[i, 2] * P[1, 2] + P[1, 3]
        Wh = V[i, 0] * P[2, 0] + V[i, 1] * P[2, 1] + V[i, 2] * P[2, 2] + P[2, 3]
        Z = V[i, 0] * P[3, 0] + V[i, 1] * P[3, 1] + V[i, 2] * P[3, 2] + P[3, 3]
        sz[i] = Z
        if ortho:
            sx[i] = X
            sy[i] = Y
        else:
            w = Wh if abs(Wh) > 1e-9 else 1e-9
            sx[i] = X / w
            sy[i] = Y / w
    for f in range(F.shape[0]):
        a, b, c = F[f, 0], F[f, 1], F[f, 2]
        if sz[a] <= 1e-4 or sz[b] <= 1e-4 or sz[c] <= 1e-4:
            continue
        x0, y0, x1, y1, x2, y2 = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-12:
            continue
        minx = max(int(np.floor(min(x0, min(x1, x2)))), 0)
        maxx = min(int(np.ceil(max(x0, max(x1, x2)))), W - 1)
        miny = max(int(np.floor(min(y0, min(y1, y2)))), 0)
        maxy = min(int(np.ceil(max(y0, max(y1, y2)))), H - 1)
        for py in range(miny, maxy + 1):
            fy = py + 0.5
            for px in range(minx, maxx + 1):
                fx = px + 0.5
                l0 = ((x1 - fx) * (y2 - fy) - (x2 - fx) * (y1 - fy)) / area
                l1 = ((x2 - fx) * (y0 - fy) - (x0 - fx) * (y2 - fy)) / area
                l2 = 1.0 - l0 - l1
                if l0 < 0 or l1 < 0 or l2 < 0:
                    continue
                if ortho:
                    b0, b1, b2 = l0, l1, l2
                    z = b0 * sz[a] + b1 * sz[b] + b2 * sz[c]
                else:  # perspective-correct barycentrics
                    i0, i1, i2 = l0 / sz[a], l1 / sz[b], l2 / sz[c]
                    s = i0 + i1 + i2
                    z = 1.0 / s
                    b0, b1, b2 = i0 * z, i1 * z, i2 * z
                if z >= zbuf[py, px]:
                    continue
                zbuf[py, px] = z
                nx = b0 * N[a, 0] + b1 * N[b, 0] + b2 * N[c, 0]
                ny = b0 * N[a, 1] + b1 * N[b, 1] + b2 * N[c, 1]
                nz = b0 * N[a, 2] + b1 * N[b, 2] + b2 * N[c, 2]
                nl = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-12
                col = base_col.copy()
                r = rough
                m = metal
                if has_uv:
                    u = b0 * UV[a, 0] + b1 * UV[b, 0] + b2 * UV[c, 0]
                    v = b0 * UV[a, 1] + b1 * UV[b, 1] + b2 * UV[c, 1]
                    if has_tex:
                        t = _sample(base_tex, u, v)
                        for k in range(3):
                            col[k] *= t[k]
                    if has_mr:
                        t = _sample(mr_tex, u, v)
                        r = rough * t[1]
                        m = metal * t[2]
                if has_vc:
                    for k in range(3):
                        col[k] *= b0 * VC[a, k] + b1 * VC[b, k] + b2 * VC[c, k]
                gb[py, px, 0] = col[0]
                gb[py, px, 1] = col[1]
                gb[py, px, 2] = col[2]
                gb[py, px, 3] = nx / nl
                gb[py, px, 4] = ny / nl
                gb[py, px, 5] = nz / nl
                gb[py, px, 6] = z
                gb[py, px, 7] = r
                gb[py, px, 8] = m
                gb[py, px, 9] = 1.0


_DUMMY_TEX = np.ones((1, 1, 3), np.float32)
_DUMMY2 = np.zeros((1, 2), np.float32)
_DUMMY3 = np.zeros((1, 3), np.float32)


def render_gbuffer(parts: List[Part], cam: Camera, ssaa: int = 2) -> np.ndarray:
    """Render the G-buffer (H,W,10). ``ssaa`` = supersampling factor (anti-aliasing)."""
    hi = cam.scaled(ssaa) if ssaa > 1 else cam
    H, W = hi.height, hi.width
    gb = np.zeros((H, W, GBUF_C), np.float32)
    zbuf = np.full((H, W), np.inf, np.float64)
    # 4x4: rows 0..2 = A @ viewmat (homog pixel), row 3 = camera z
    P = np.zeros((4, 4))
    P[:3] = hi.A @ hi.viewmat
    P[3] = hi.viewmat[2]
    for p in parts:
        _raster_part(gb, zbuf, P, p.verts.astype(np.float64), p.faces,
                     p.normals.astype(np.float64),
                     p.uv if p.uv is not None else _DUMMY2, p.uv is not None,
                     p.base_tex if p.base_tex is not None else _DUMMY_TEX, p.base_tex is not None,
                     np.asarray(p.base_color, np.float32),
                     p.vert_colors.astype(np.float32) if p.vert_colors is not None else _DUMMY3,
                     p.vert_colors is not None,
                     p.mr_tex if p.mr_tex is not None else _DUMMY_TEX, p.mr_tex is not None,
                     float(p.roughness), float(p.metallic), hi.ortho)
    if ssaa > 1:
        # premultiply by coverage, box-downsample, keep premultiplied (alpha in ch 9)
        a = gb[..., 9:10]
        pre = gb.copy()
        pre[..., :9] *= a
        pre = pre.reshape(cam.height, ssaa, cam.width, ssaa, GBUF_C).mean((1, 3))
        gb = pre
    return gb  # NOTE: channels 0..8 are premultiplied by alpha (ch 9)


def sample_surface(parts: List[Part], n: int, rng: np.random.Generator):
    """Area-weighted random surface points with their material attributes.

    Returns dict of arrays: pos(n,3) normal(n,3) albedo(n,3) rough(n) metal(n).
    """
    areas = np.array([p.area for p in parts])
    counts = rng.multinomial(n, areas / areas.sum())
    out = {k: [] for k in ("pos", "normal", "albedo", "rough", "metal", "part")}
    for pi, (p, k) in enumerate(zip(parts, counts)):
        if k == 0:
            continue
        v = p.verts[p.faces]
        fa = 0.5 * np.linalg.norm(np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0]), axis=1)
        fi = rng.choice(len(fa), size=k, p=fa / fa.sum())
        r1, r2 = rng.random(k), rng.random(k)
        s = np.sqrt(r1)
        b = np.stack([1 - s, s * (1 - r2), s * r2], 1).astype(np.float32)  # uniform in triangle
        tri = p.faces[fi]
        pos = (p.verts[tri] * b[..., None]).sum(1)
        nrm = (p.normals[tri] * b[..., None]).sum(1)
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
        col = np.tile(p.base_color[None], (k, 1)).astype(np.float32)
        rough = np.full(k, p.roughness, np.float32)
        metal = np.full(k, p.metallic, np.float32)
        if p.uv is not None:
            uv = (p.uv[tri] * b[..., None]).sum(1)
            if p.base_tex is not None:
                col *= np.stack([_sample(p.base_tex, float(a), float(c)) for a, c in uv])
            if p.mr_tex is not None:
                mr = np.stack([_sample(p.mr_tex, float(a), float(c)) for a, c in uv])
                rough *= mr[:, 1]
                metal *= mr[:, 2]
        if p.vert_colors is not None:
            col *= (p.vert_colors[tri] * b[..., None]).sum(1)
        for key, val in (("pos", pos), ("normal", nrm), ("albedo", col), ("rough", rough),
                         ("metal", metal), ("part", np.full(k, pi))):
            out[key].append(val)
    return {k: np.concatenate(v).astype(np.float32 if k != "part" else np.int32) for k, v in out.items()}

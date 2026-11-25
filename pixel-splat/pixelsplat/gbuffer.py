"""G-buffer clean-up at the pixel-art resolution (pure numpy, works on the dicts from
:func:`pixelsplat.shade.gbuffer_from_render`).

Why this exists: with no-blend ("hard") compositing every art pixel shows exactly ONE splat.
When splats are smaller than an art pixel that splat is an almost random pick, so a pixel can
show a stray normal / albedo / a hole to the surface behind → salt-and-pepper speckle that
also flickers in motion.  Three tools fix that without re-introducing blending:

  * :func:`select_downsample` — rasterize S× larger, then let each art pixel *vote*: majority
    coverage decides the silhouette, the majority depth layer decides which surface is seen,
    and the most typical sample of that layer (the medoid) supplies ALL attributes.  Still one
    splat per pixel (crisp, no averaging), but a representative one.
  * :func:`despeckle` — replace isolated outlier pixels by their most typical same-surface
    neighbour; one-pixel-wide lines survive because they have neighbours that agree with them.
  * :func:`smooth_normals` — edge-preserving (depth + normal aware) blur of the normals only.

Plus two screen-space shading helpers used by ``shade``: :func:`ssao` and :func:`curvature`.
"""
from __future__ import annotations

from typing import Optional

import numpy as np

_FAR = 1e9  # "no surface here" depth (finite, so differences stay well defined)
_OFFS8 = ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1))


def _normalize(v, eps=1e-8):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + eps)


def _shift(a: np.ndarray, dy: int, dx: int, fill=0):
    """a[y+dy, x+dx] with ``fill`` outside the image (no wrap-around, unlike np.roll)."""
    out = np.full_like(a, fill)
    H, W = a.shape[:2]
    ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
    xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
    out[yd, xd] = a[ys, xs]
    return out


# ------------------------------------------------------------------ supersample + vote
def select_downsample(gb: dict, s: int, alpha_threshold: float = 0.5, mode: str = "medoid",
                      depth_tol: float = 0.04, albedo_weight: float = 2.0) -> dict:
    """Reduce an S×-supersampled hard G-buffer to the art grid by picking, not averaging.

    ``mode`` = "medoid" (one representative sample supplies every channel — stays flat and
    crisp) or "mean" (average the samples of the winning depth layer — smoother, softer).
    The returned ``alpha`` is the covered fraction, so the usual 0.5 threshold = majority vote.
    """
    H, W = gb["alpha"].shape
    h, w = H // s, W // s
    S = s * s

    def blk(a):
        a = a[:h * s, :w * s]
        return a.reshape(h, s, w, s, *a.shape[2:]).swapaxes(1, 2).reshape(h, w, S, *a.shape[2:])

    cov = blk(gb["alpha"]) > alpha_threshold  # (h,w,S)
    n = cov.sum(-1)
    d = np.where(cov, blk(gb["depth"]), _FAR)
    # the surface most samples see: depth layer around the median covered depth
    ds = np.sort(d, -1)
    med = np.take_along_axis(ds, np.maximum((n - 1) // 2, 0)[..., None], -1)
    layer = cov & (np.abs(d - med) <= depth_tol)
    lw = layer[..., None].astype(np.float32)
    cnt = np.maximum(lw.sum(2), 1)
    nrm, alb = blk(gb["normal"]), blk(gb["albedo"])
    n_mean = _normalize((nrm * lw).sum(2) / cnt)
    a_mean = (alb * lw).sum(2) / cnt
    cost = ((nrm - n_mean[:, :, None]) ** 2).sum(-1) + albedo_weight * ((alb - a_mean[:, :, None]) ** 2).sum(-1)
    pick = np.where(layer, cost, _FAR).argmin(-1)[..., None]  # (h,w,1)

    def take(a):
        b = blk(a)
        idx = pick.reshape(pick.shape + (1,) * (b.ndim - 3))
        return np.take_along_axis(b, idx, 2)[:, :, 0]

    out = {k: take(v) for k, v in gb.items() if isinstance(v, np.ndarray) and v.shape[:2] == (H, W)}
    if mode == "mean":
        out["normal"] = n_mean.astype(np.float32)
        out["albedo"] = a_mean.astype(np.float32)
        for k in ("rough", "metal", "depth"):
            out[k] = ((blk(gb[k]) * lw[..., 0]).sum(2) / cnt[..., 0]).astype(np.float32)
    elif mode != "medoid":
        raise ValueError(mode)
    out["alpha"] = (n / S).astype(np.float32)
    out["id"] = np.where(n > 0, out["id"], -1)
    return out


# ------------------------------------------------------------------ outlier removal
def despeckle(gb: dict, alpha_threshold: float = 0.5, depth_tol: float = 0.04, normal_cos: float = 0.8,
              albedo_tol: float = 0.10, max_similar: int = 1, min_surface: int = 4) -> dict:
    """Replace isolated outlier pixels with their most typical same-surface neighbour.

    A pixel is a speck when at least ``min_surface`` of its 8 neighbours lie on the same surface
    (depth within ``depth_tol``) but at most ``max_similar`` of them look like it (normal within
    ``normal_cos`` AND albedo within ``albedo_tol``).  Lines and edges are kept: their pixels
    have neighbours that agree.  Also fills pin-holes (pixels that see through to a far surface
    while most of their neighbours agree on a nearer one)."""
    mask = gb["alpha"] > alpha_threshold
    d = np.where(mask, gb["depth"], _FAR)
    nrm, alb = gb["normal"], gb["albedo"]
    nb_m = np.stack([_shift(mask, dy, dx, False) for dy, dx in _OFFS8])  # (8,H,W)
    nb_d = np.stack([_shift(d, dy, dx, _FAR) for dy, dx in _OFFS8])
    nb_n = np.stack([_shift(nrm, dy, dx) for dy, dx in _OFFS8])  # (8,H,W,3)
    nb_a = np.stack([_shift(alb, dy, dx) for dy, dx in _OFFS8])
    # pin-holes: the pixel is much farther than the median of its covered neighbours
    nb_sorted = np.sort(np.where(nb_m, nb_d, _FAR), 0)
    k = nb_m.sum(0)
    med = np.take_along_axis(nb_sorted, np.maximum((k - 1) // 2, 0)[None], 0)[0]
    near = nb_m & (np.abs(nb_d - med[None]) <= depth_tol)  # neighbours on the majority surface
    hole = (k >= 6) & (near.sum(0) >= 6) & (d - med > 2 * depth_tol)  # d = "inf" where nothing was hit
    same = nb_m & (np.abs(nb_d - d[None]) <= depth_tol)
    similar = same & ((nb_n * nrm[None]).sum(-1) > normal_cos) & (np.abs(nb_a - alb[None]).max(-1) < albedo_tol)
    speck = mask & (same.sum(0) >= min_surface) & (similar.sum(0) <= max_similar)
    ref = np.where(hole[None], near, same)  # which neighbours may donate
    fix = speck | hole
    if not fix.any():
        return gb
    rw = ref[..., None].astype(np.float32)
    cnt = np.maximum(rw.sum(0), 1)
    n_mean = _normalize((nb_n * rw).sum(0) / cnt)
    a_mean = (nb_a * rw).sum(0) / cnt
    cost = ((nb_n - n_mean[None]) ** 2).sum(-1) + 2.0 * ((nb_a - a_mean[None]) ** 2).sum(-1)
    pick = np.where(ref, cost, _FAR).argmin(0)  # (H,W) index of the donor neighbour
    out = dict(gb)
    ys, xs = np.nonzero(fix)
    p = pick[ys, xs]
    sy = np.clip(ys + np.array([o[0] for o in _OFFS8])[p], 0, mask.shape[0] - 1)
    sx = np.clip(xs + np.array([o[1] for o in _OFFS8])[p], 0, mask.shape[1] - 1)
    for key in ("albedo", "normal", "rough", "metal", "depth", "id", "alpha"):
        if key in gb:
            a = gb[key].copy()
            a[ys, xs] = gb[key][sy, sx]
            out[key] = a
    return out


def smooth_normals(gb: dict, amount: float = 0.5, alpha_threshold: float = 0.5, depth_tol: float = 0.04,
                   normal_power: float = 4.0, passes: int = 1) -> dict:
    """Edge-preserving normal blur: neighbours count only when they are on the same surface
    (depth) and already point a similar way (so creases and silhouettes stay sharp)."""
    if amount <= 0:
        return gb
    mask = gb["alpha"] > alpha_threshold
    d = np.where(mask, gb["depth"], _FAR)
    n0 = gb["normal"]
    n = n0
    for _ in range(passes):
        acc = n.copy()
        for dy, dx in _OFFS8:
            wsp = 1.0 if dy == 0 or dx == 0 else 0.6
            nn = _shift(n, dy, dx)
            ok = _shift(mask, dy, dx, False) & (np.abs(_shift(d, dy, dx, _FAR) - d) <= depth_tol)
            wgt = wsp * ok * np.clip((nn * n).sum(-1), 0, 1) ** normal_power
            acc = acc + nn * wgt[..., None]
        n = _normalize(acc)
    out = dict(gb)
    out["normal"] = np.where(mask[..., None], _normalize(n0 * (1 - amount) + n * amount), n0).astype(np.float32)
    return out


# ------------------------------------------------------------------ screen-space shading helpers
def ssao(gb: dict, P: np.ndarray, radius_px: float = 3.0, world_radius: float = 0.12, alpha_threshold: float = 0.5,
         bias: float = 0.08) -> np.ndarray:
    """Screen-space ambient occlusion in 0..1 (1 = open).  ``P`` = (H,W,3) world position per pixel.

    For a ring of neighbours: how far does the neighbour rise above this pixel's tangent plane?
    Deep folds / the gaps between feathers get dark; flat or convex areas stay open."""
    mask = gb["alpha"] > alpha_threshold
    n = gb["normal"]
    occ = np.zeros(mask.shape, np.float32)
    tot = 0.0
    r1, r2 = max(1, int(round(radius_px * 0.4))), max(2, int(round(radius_px)))
    offs = [(dy * r, dx * r) for r in (r1, r2) for dy, dx in _OFFS8]
    for dy, dx in offs:
        v = _shift(P, dy, dx) - P
        dist = np.linalg.norm(v, axis=-1) + 1e-6
        rise = (v * n).sum(-1) / dist  # sine of the elevation above the tangent plane
        fall = np.clip(1 - dist / world_radius, 0, 1)  # far-away occluders do not count
        occ += np.where(_shift(mask, dy, dx, False), np.clip(rise - bias, 0, 1) * fall, 0)
        tot += 1.0
    ao = 1 - np.clip(occ / tot * 2.4, 0, 1)
    return np.where(mask, ao, 1.0).astype(np.float32)


def curvature(gb: dict, viewmat: np.ndarray, alpha_threshold: float = 0.5, depth_tol: float = 0.04) -> np.ndarray:
    """Signed screen-space curvature from the normals: > 0 on ridges (convex), < 0 in grooves.

    It is the divergence of the view-space normal; neighbours across a depth jump are ignored."""
    mask = gb["alpha"] > alpha_threshold
    nv = gb["normal"] @ np.asarray(viewmat, np.float32)[:3, :3].T  # camera space: x right, y down
    d = np.where(mask, gb["depth"], _FAR)

    def nb(comp, dy, dx):
        ok = _shift(mask, dy, dx, False) & (np.abs(_shift(d, dy, dx, _FAR) - d) <= depth_tol)
        return np.where(ok, _shift(nv[..., comp], dy, dx), nv[..., comp])

    c = (nb(0, 0, 1) - nb(0, 0, -1)) + (nb(1, 1, 0) - nb(1, -1, 0))
    return np.where(mask, c, 0.0).astype(np.float32)


def world_positions(cam, depth: np.ndarray) -> np.ndarray:
    """(H,W,3) world position per pixel from camera-space depth; perspective or orthographic."""
    rays = cam.pixel_rays().astype(np.float64)
    R = cam.viewmat[:3, :3]
    if cam.ortho:
        ys, xs = np.mgrid[0:cam.height, 0:cam.width].astype(np.float64) + 0.5
        s, cx, cy = cam.A[0, 0], cam.A[0, 3], cam.A[1, 3]
        pc = np.stack([(xs - cx) / s, (ys - cy) / s, depth.astype(np.float64)], -1)
        return ((pc - cam.viewmat[:3, 3]) @ R).astype(np.float32)
    t = depth / np.maximum((rays * R[2]).sum(-1), 1e-6)
    return (cam.position + rays * t[..., None]).astype(np.float32)


def clean(gb: dict, despeckle_on: bool = True, normal_smooth: float = 0.0, alpha_threshold: float = 0.5,
          depth_tol: float = 0.04, passes: Optional[int] = None) -> dict:
    """Convenience: despeckle then (optionally) smooth normals."""
    if despeckle_on:
        gb = despeckle(gb, alpha_threshold, depth_tol)
    if normal_smooth > 0:
        gb = smooth_normals(gb, normal_smooth, alpha_threshold, depth_tol, passes=passes or 1)
    return gb

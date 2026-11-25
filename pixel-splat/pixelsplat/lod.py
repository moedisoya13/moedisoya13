"""Level of detail for splats ("mip-mapping"): merge splats that are smaller than an art pixel.

Why: with no-blend (hard) compositing every art pixel shows ONE splat.  If six splats fall into
a pixel, which one wins is close to random → speckle in stills and shimmer in motion, and the
fine albedo detail they carry aliases into noise.  The reference renders look calm because
their quads are *larger* than a pixel: each one is a flat dab covering 1–4 pixels.

``merge_splats`` builds that from a dense trained model: splats are grouped by a 3D grid cell
(+ the side their normal faces, so the front and back of a thin wing never merge), and each
group becomes one splat with the area-weighted mean position / normal / material and the
group's total area.  Detail finer than the cell is averaged (pre-filtered) instead of aliased.

``lod_for_camera`` picks the cell size from the camera so a merged splat spans about
``px_per_splat`` art pixels.  The result is an ordinary :class:`SplatModel` (skinning, patch
snapping and shadow maps work unchanged); build it once per clip, not per frame.
"""
from __future__ import annotations

import numpy as np
import torch

from .camera import Camera
from .splats import SplatModel, _logit, rot_to_quat


def pixel_world_size(cam: Camera, target=(0.0, 0.0, 0.0)) -> float:
    """World-space size of one pixel at the distance of ``target``."""
    if cam.ortho:
        return 1.0 / float(cam.A[0, 0])
    z = float(cam.viewmat[2, :3] @ np.asarray(target, np.float64) + cam.viewmat[2, 3])
    return z / float(cam.A[0, 0])


def merge_splats(model: SplatModel, cell: float, overlap: float = 1.0, seed: int = 0) -> SplatModel:
    """One splat per occupied (grid cell, normal side); see the module docstring.

    ``overlap`` scales the merged radius: the merged splat is a round disc whose sigma is
    ``overlap × sqrt(sum of member areas)``, capped at 0.75 cell (1 = area-preserving;
    lower = less fattening of silhouettes, too low = pin-holes between dabs)."""
    with torch.no_grad():
        p = model.means.detach().numpy().astype(np.float64)
        R = model.rot().detach().numpy()
        n = R[..., 2].astype(np.float64)
        s = model.scales().detach().numpy().astype(np.float64)
        mat = model.material().detach().numpy().astype(np.float64)
        op = model.opacity().detach().numpy().astype(np.float64)
    area = s[:, 0] * s[:, 1]
    w = area * op
    ijk = np.floor(p / cell).astype(np.int64)
    side = np.abs(n).argmax(1) * 2 + (np.take_along_axis(n, np.abs(n).argmax(1)[:, None], 1)[:, 0] > 0)
    key = np.concatenate([ijk, side[:, None]], 1)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    g = int(inv.max()) + 1

    def wmean(a):
        out = np.zeros((g,) + a.shape[1:])
        np.add.at(out, inv, a * w.reshape((-1,) + (1,) * (a.ndim - 1)))
        return out

    wsum = np.maximum(np.bincount(inv, w, g), 1e-20)
    pos = wmean(p) / wsum[:, None]
    nrm = wmean(n)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
    m = wmean(mat) / wsum[:, None]
    asum = np.bincount(inv, area, g)
    member = np.sqrt(asum / np.bincount(inv, minlength=g))  # typical radius of the splats that merged
    # a dab never grows far beyond its own cell, and never shrinks below what it was made of
    sigma = np.maximum(np.minimum(overlap * np.sqrt(asum), 0.75 * cell), member)
    opac = np.zeros(g)
    np.maximum.at(opac, inv, op)
    # tangent frame around the merged normal (random spin, like SplatModel.from_mesh)
    rng = np.random.default_rng(seed)
    a = rng.normal(size=nrm.shape)
    tu = a - (a * nrm).sum(1, keepdims=True) * nrm
    tu /= np.linalg.norm(tu, axis=1, keepdims=True) + 1e-12
    tv = np.cross(nrm, tu)
    Rm = np.stack([tu, tv, nrm], -1)
    # patch id: majority vote is overkill — take the patch of the heaviest member
    order = np.argsort(w)
    patch = np.zeros(g, np.int64)
    patch[inv[order]] = model.patch.numpy()[order]
    out = SplatModel(pos, rot_to_quat(Rm), np.log(np.stack([sigma, sigma], 1)), _logit(opac),
                     np.clip(m[:, :3], 1e-4, 1 - 1e-4), np.clip(m[:, 3], 1e-4, 1 - 1e-4),
                     np.clip(m[:, 4], 1e-4, 1 - 1e-4), patch=patch)
    out.lod_cell = cell
    return out


def lod_for_camera(model: SplatModel, cam: Camera, target=(0.0, 0.0, 0.0), px_per_splat: float = 1.5,
                   **kw) -> SplatModel:
    """Merged copy of ``model`` whose splats span about ``px_per_splat`` art pixels in ``cam``.
    Returns ``model`` itself when its splats are already that large."""
    cell = pixel_world_size(cam, target) * px_per_splat
    with torch.no_grad():
        typical = float(model.scales().prod(1).sqrt().median())
    if 2.0 * typical >= cell:  # splats already cover ≥ a cell: nothing to gain
        return model
    return merge_splats(model, cell, **kw)

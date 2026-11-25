"""Shadow maps for splats: real cast shadows and self-shadowing for a directional light.

The posed splats are rasterized once more from the light's point of view with an
orthographic camera (no blending: front splat wins), giving a depth map.  Any
world point — on the model or on the ground — is then in shadow when something
in that map sits closer to the light than the point does.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import torch

from .camera import Camera, orbit_camera
from .raster import RasterConfig, rasterize


@dataclass
class ShadowMap:
    cam: Camera
    depth: np.ndarray  # (S,S) light-space depth of the nearest occluder
    covered: np.ndarray  # (S,S) bool, an occluder exists


def make_shadow_map(means, R, scales, opacity, light_dir, center, extent: float = 1.5, res: int = 256,
                    k: int = 256) -> ShadowMap:
    """Orthographic depth map of the (posed) splats seen from a directional light.

    ``light_dir`` points *towards* the light; ``center``/``extent`` = the volume to cover."""
    L = np.asarray(light_dir, np.float64)
    L = L / np.linalg.norm(L)
    az = math.degrees(math.atan2(L[0], L[2]))
    el = math.degrees(math.asin(np.clip(L[1], -1, 1)))
    cam = orbit_camera(az, el, res, res, radius=6.0, ortho=True, ortho_extent=extent, target=tuple(center))
    with torch.no_grad():
        rc = RasterConfig(tile=4, k=k, hard=True, cull_backfaces=False)
        feats = torch.zeros(means.shape[0], 1)
        out = rasterize(means, R, scales, opacity, feats, R[..., 2], cam, rc)
        while out["overflow"] > 0.01 and rc.k < 2048:
            rc = RasterConfig(tile=4, k=rc.k * 2, hard=True, cull_backfaces=False)
            out = rasterize(means, R, scales, opacity, feats, R[..., 2], cam, rc)
    a = out["alpha"].numpy()
    d = out["depth"].numpy() / np.maximum(a, 1e-6)
    return ShadowMap(cam, d.astype(np.float32), a > 0.5)


def visibility(sm: ShadowMap, P: np.ndarray, bias: float = 0.03, pcf: int = 1) -> np.ndarray:
    """Fraction (0..1) of the light reaching world points ``P`` (...,3).  ``pcf`` = filter radius."""
    V = sm.cam.viewmat
    X = P @ V[:3, :3].T + V[:3, 3]
    A = sm.cam.A
    px = A[0, 0] * X[..., 0] + A[0, 3]
    py = A[1, 1] * X[..., 1] + A[1, 3]
    z = X[..., 2]
    S = sm.depth.shape[0]
    hits = np.zeros(P.shape[:-1], np.float32)
    n = 0
    for dy in range(-pcf, pcf + 1):
        for dx in range(-pcf, pcf + 1):
            ix = np.floor(px + dx).astype(np.int64)
            iy = np.floor(py + dy).astype(np.int64)
            inside = (ix >= 0) & (iy >= 0) & (ix < S) & (iy < S)
            ixc, iyc = np.clip(ix, 0, S - 1), np.clip(iy, 0, S - 1)
            occ = inside & sm.covered[iyc, ixc] & (z > sm.depth[iyc, ixc] + bias)
            hits += occ
            n += 1
    return 1.0 - hits / n


def world_points(cam: Camera, depth: np.ndarray) -> np.ndarray:
    """World position of every pixel from a camera-space depth (z) map (perspective)."""
    rays = cam.pixel_rays().astype(np.float64)
    fwd = cam.viewmat[2, :3]
    t = depth / np.maximum((rays * fwd).sum(-1), 1e-6)
    return cam.position + rays * t[..., None]

"""Cameras.

Convention (same as OpenCV / gsplat): camera space x→right, y→down, z→forward.
A camera is a world→camera 4x4 ``viewmat`` plus a 3x4 projection ``A`` that maps
camera-space homogeneous points to homogeneous *pixel* coordinates.

- perspective: A = [K | 0]            → pixel = (A @ [X,Y,Z,1]) / Z
- orthographic: A = [[s,0,0,cx],[0,s,0,cy],[0,0,0,1]] → no divide (w = 1)

Keeping projection as a single 3x4 matrix lets the 2D-splat rasterizer treat
both cases with the same homography math.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class Camera:
    viewmat: np.ndarray  # (4,4) world -> camera
    A: np.ndarray  # (3,4) camera -> homogeneous pixel
    width: int
    height: int
    ortho: bool

    @property
    def position(self) -> np.ndarray:
        R = self.viewmat[:3, :3]
        t = self.viewmat[:3, 3]
        return -R.T @ t

    def scaled(self, factor: float) -> "Camera":
        """Same view at a different resolution (factor 2 = twice the pixels)."""
        S = np.diag([factor, factor, 1.0])
        A = S @ self.A
        return Camera(self.viewmat.copy(), A, int(round(self.width * factor)),
                      int(round(self.height * factor)), self.ortho)

    def pixel_rays(self):
        """World-space ray direction (normalized) per pixel center, (H,W,3)."""
        H, W = self.height, self.width
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float64) + 0.5
        R = self.viewmat[:3, :3]
        if self.ortho:
            d_cam = np.broadcast_to(np.array([0.0, 0.0, 1.0]), (H, W, 3))
        else:
            K = self.A[:, :3]
            Kinv = np.linalg.inv(K)
            pix = np.stack([xs, ys, np.ones_like(xs)], -1)
            d_cam = pix @ Kinv.T
        d_world = d_cam @ R  # R^T applied row-wise
        d_world = d_world / np.linalg.norm(d_world, axis=-1, keepdims=True)
        return d_world.astype(np.float32)


def look_at(eye, target, up=(0.0, 1.0, 0.0)) -> np.ndarray:
    """World→camera matrix with x right, y down, z forward (looking at target)."""
    eye = np.asarray(eye, np.float64)
    target = np.asarray(target, np.float64)
    up = np.asarray(up, np.float64)
    f = target - eye
    f /= np.linalg.norm(f)
    r = np.cross(f, up)
    if np.linalg.norm(r) < 1e-8:
        r = np.cross(f, np.array([0.0, 0.0, 1.0]))
    r /= np.linalg.norm(r)
    d = np.cross(f, r)  # "down" in camera = y axis
    R = np.stack([r, d, f], 0)  # rows = camera axes in world
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = -R @ eye
    return M


def orbit_camera(azimuth_deg: float, elevation_deg: float, width: int, height: int,
                 radius: float = 3.0, fov_deg: float = 30.0, ortho: bool = False,
                 ortho_extent: float = 1.15, target=(0.0, 0.0, 0.0)) -> Camera:
    """Camera on a sphere around ``target`` (Y is world up).

    ``ortho_extent`` = half of the visible world height for orthographic views.
    The scene is normalized to fit in [-1,1]^3 so the defaults frame it.
    """
    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    tgt = np.asarray(target, np.float64)
    eye = tgt + radius * np.array([math.sin(az) * math.cos(el), math.sin(el),
                                   math.cos(az) * math.cos(el)])
    V = look_at(eye, tgt)
    cx, cy = width / 2.0, height / 2.0
    if ortho:
        s = (height / 2.0) / ortho_extent
        A = np.array([[s, 0, 0, cx], [0, s, 0, cy], [0, 0, 0, 1.0]])
    else:
        f = (height / 2.0) / math.tan(math.radians(fov_deg) / 2.0)
        A = np.array([[f, 0, cx, 0], [0, f, cy, 0], [0, 0, 1.0, 0]])
    return Camera(V, A, width, height, ortho)


def fit_radius_for_fov(fov_deg: float, extent: float = 1.15) -> float:
    """Distance at which a sphere-ish object of half-height ``extent`` fills the frame."""
    return extent / math.tan(math.radians(fov_deg) / 2.0) + 0.2

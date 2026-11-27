"""The reference game's camera: orthographic, looking down at a fixed angle, on a WORLD-LOCKED pixel grid.

Measured from the reference video (see README.md, "카메라 측정"):
    projection      orthographic (ground flow at the top and at the bottom of the screen is equal)
    elevation       about 30 degrees above the horizon (estimate, +-8)
    visible area    211.3 x 123.5 art pixels
    person          a 1.75 m character stands about 16 art pixels tall

One camera (``level_camera``) frames the whole level; every picture is a WINDOW of it (same view matrix,
shifted principal point).  Because the projection is orthographic, moving the window by whole pixels
shows exactly the same pixels of the static world, just shifted - a panning camera cannot shimmer.
The fraction of a pixel that is left over is applied after the nearest-neighbour upscale
(``subpixel_crop``), which is what the reference does too (its art grid slides with the ground).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

import numpy as np

from pixelsplat.camera import Camera, orbit_camera

RADIUS = 300.0  # distance of the eye from the world origin (orthographic: only has to clear the level)


@dataclass(frozen=True)
class RefCam:
    elev: float = 30.0  # degrees above the horizon (90 = straight down)
    az: float = 0.0  # 0 = camera south of the scene looking north (-z); screen right = +x
    px_per_unit: float = 9.6  # art pixels per WORLD unit (1.80 units = 1.75 m)
    view: Tuple[int, int] = (211, 124)  # art pixels (width, height) of one screen

    def ground_footprint(self) -> Tuple[float, float]:
        """(width, depth) in world units of the ground rectangle one screen shows."""
        return self.view[0] / self.px_per_unit, self.view[1] / self.px_per_unit / math.sin(math.radians(self.elev))

    def person_px(self, height_units: float = 1.80) -> float:
        """Screen height in art pixels of a thin vertical pole of that height."""
        return height_units * math.cos(math.radians(self.elev)) * self.px_per_unit


def axes(spec: RefCam):
    """World directions of screen-right, screen-up and the viewing direction."""
    az, el = math.radians(spec.az), math.radians(spec.elev)
    to_eye = np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)])
    fwd = -to_eye
    right = np.cross(fwd, [0.0, 1.0, 0.0])
    right /= np.linalg.norm(right)
    return right, np.cross(right, fwd), fwd


def origin_camera(spec: RefCam, origin=(0.0, 0.0, 0.0)) -> Camera:
    """2x2-pixel orthographic camera whose pixel (1, 1) is the world ``origin``: it fixes the pixel
    lattice in the world, independent of the level's size."""
    return orbit_camera(spec.az, spec.elev, 2, 2, radius=RADIUS, ortho=True, ortho_extent=1.0 / spec.px_per_unit,
                        target=tuple(origin))


def project(cam: Camera, P) -> np.ndarray:
    """(…,3) world points -> (…,3) = pixel x, pixel y, camera depth (orthographic cameras)."""
    P = np.asarray(P, np.float64)
    X = P @ cam.viewmat[:3, :3].T + cam.viewmat[:3, 3]
    return np.stack([cam.A[0, 0] * X[..., 0] + cam.A[0, 3], cam.A[1, 1] * X[..., 1] + cam.A[1, 3], X[..., 2]], -1)


def window(cam: Camera, x0: int, y0: int, w: int, h: int) -> Camera:
    """The sub-image [x0, x0+w) x [y0, y0+h) of ``cam`` as its own camera (whole pixels only)."""
    if int(x0) != x0 or int(y0) != y0:
        raise ValueError("windows start on whole pixels (that is what keeps the static world stable)")
    A = cam.A.copy()
    A[0, 3] -= x0
    A[1, 3] -= y0
    return Camera(cam.viewmat.copy(), A, int(w), int(h), True)


def level_camera(spec: RefCam, lo, hi, margin: int = 3, origin=(0.0, 0.0, 0.0)) -> Camera:
    """Camera whose image holds the world box [lo, hi] (+ margin px), on the lattice of ``origin_camera``."""
    cam0 = origin_camera(spec, origin)
    lo, hi = np.asarray(lo, np.float64), np.asarray(hi, np.float64)
    corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    px = project(cam0, corners)
    x0, y0 = int(math.floor(px[:, 0].min())) - margin, int(math.floor(px[:, 1].min())) - margin
    x1, y1 = int(math.ceil(px[:, 0].max())) + margin, int(math.ceil(px[:, 1].max())) + margin
    return window(cam0, x0, y0, x1 - x0, y1 - y0)


def unproject_to_plane(cam: Camera, px, py, y: float) -> np.ndarray:
    """World point on the horizontal plane at height ``y`` seen at pixel (px, py)."""
    R = cam.viewmat[:3, :3]
    s, cx, cy = cam.A[0, 0], cam.A[0, 3], cam.A[1, 3]
    px, py = np.asarray(px, np.float64), np.asarray(py, np.float64)
    pc = np.stack([(px - cx) / s, (py - cy) / s, np.zeros(np.broadcast(px, py).shape)], -1)
    o = (pc - cam.viewmat[:3, 3]) @ R  # a point of the pixel's ray
    d = R[2]  # ray direction
    t = (y - o[..., 1]) / d[1]
    return o + t[..., None] * d


def view_origin(cam: Camera, spec: RefCam, focus_world, anchor=(0.5, 0.5)) -> Tuple[float, float]:
    """Top-left corner (float pixels) of the screen that shows ``focus_world`` at the relative screen
    position ``anchor`` (0.5, 0.5 = centre)."""
    p = project(cam, focus_world)
    return float(p[0] - anchor[0] * spec.view[0]), float(p[1] - anchor[1] * spec.view[1])


def split_subpixel(v: float) -> Tuple[int, float]:
    """A float pixel offset = whole pixels (the window) + a fraction in [0, 1) (applied after upscaling)."""
    i = math.floor(v)
    return int(i), float(v - i)


def subpixel_crop(img: np.ndarray, frac_x: float, frac_y: float, scale: int, out_w: int, out_h: int) -> np.ndarray:
    """Nearest-neighbour upscale of a frame rendered one art pixel larger than the screen, shifted by
    the sub-pixel remainder: smooth scrolling without re-sampling the art."""
    big = np.repeat(np.repeat(img, scale, 0), scale, 1)
    ox, oy = int(round(frac_x * scale)), int(round(frac_y * scale))
    return big[oy:oy + out_h * scale, ox:ox + out_w * scale]

"""Deferred shading + pixel-art post-processing ("the pile of hacks").

Pipeline per frame:
  1. rasterize splats into a LOW-RES G-buffer (this resolution *is* the pixel grid)
  2. optional "Almost Pixel Perfect" patch snapping before rasterizing
  3. deferred PBR lighting per pixel (GGX specular + Lambert + sky/env term)
  4. hacks: binary alpha, toon-ish light steps, outline, palette quantization
  5. nearest-neighbour upscale for display
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import List, Optional

import numpy as np
import torch

from .camera import Camera
from .raster import RasterConfig, rasterize

BG = np.array([0.075, 0.075, 0.11], np.float32)  # dark navy, like the reference posts


@dataclass
class Light:
    direction: tuple  # world-space direction *towards* the light
    color: tuple = (1.0, 0.95, 0.88)
    intensity: float = 3.0


@dataclass
class ShadeConfig:
    lights: List[Light] = field(default_factory=lambda: [
        Light((-0.6, 0.7, 0.8), (1.0, 0.93, 0.82), 3.2),  # warm key
        Light((0.8, 0.3, -0.7), (0.55, 0.65, 1.0), 1.6),  # cool rim from behind
    ])
    sky: tuple = (0.18, 0.2, 0.28)  # ambient / reflection colour from above
    ground: tuple = (0.06, 0.05, 0.05)
    env_strength: float = 1.0
    exposure: float = 1.0
    alpha_threshold: float = 0.5  # hack: coverage → binary
    light_steps: int = 0  # hack: >0 quantizes diffuse light into N bands (toon)
    outline: float = 0.0  # hack: 0..1 darken silhouette / depth-edge pixels
    outline_depth: float = 0.06  # depth jump (world units) that counts as an edge
    palette: int = 0  # hack: >0 quantize final colours to N-colour k-means palette
    background: tuple = tuple(BG.tolist())
    # ground contact shadow: soft dark disc on a ground plane under the character
    ground_y: Optional[float] = None
    shadow_center: tuple = (0.0, 0.0)  # (x, z) world
    shadow_radius: tuple = (0.32, 0.22)  # (rx, rz)
    shadow_strength: float = 0.55
    shadow_steps: int = 3  # quantized (pixel-art) falloff


def _normalize(v, eps=1e-8):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + eps)


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def aces(x):
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)


def gbuffer_from_render(out) -> dict:
    """Un-premultiply a raster output into a plain G-buffer (numpy)."""
    a = out["alpha"].detach().numpy()
    inv = 1.0 / np.maximum(a, 1e-6)[..., None]
    f = out["feat"].detach().numpy() * inv
    return dict(alpha=a, albedo=np.clip(f[..., :3], 0, 1), rough=np.clip(f[..., 3], 0.04, 1),
                metal=np.clip(f[..., 4], 0, 1), normal=_normalize(out["normal"].detach().numpy()),
                depth=out["depth"].detach().numpy() * inv[..., 0], id=out["id"].numpy())


def shade(gb: dict, cam: Camera, cfg: ShadeConfig, light_vis: Optional[list] = None) -> np.ndarray:
    """Deferred PBR shading → (H,W,3) linear radiance (before tonemapping).

    ``light_vis`` = optional per-light (H,W) visibility in 0..1 (shadow maps)."""
    n = gb["normal"]
    V = -cam.pixel_rays()  # towards the eye
    alb = srgb_to_linear(gb["albedo"])
    rough = gb["rough"][..., None]
    metal = gb["metal"][..., None]
    a2 = (rough ** 2) ** 2
    f0 = 0.04 * (1 - metal) + alb * metal
    nv = np.clip((n * V).sum(-1, keepdims=True), 1e-4, 1)
    k = (rough + 1) ** 2 / 8
    col = np.zeros_like(alb)
    for li, L in enumerate(cfg.lights):
        l = _normalize(np.asarray(L.direction, np.float32))
        h = _normalize(V + l)
        nl = np.clip((n * l).sum(-1, keepdims=True), 0, 1)
        if cfg.light_steps > 0:
            nl = np.ceil(nl * cfg.light_steps) / cfg.light_steps
        nh = np.clip((n * h).sum(-1, keepdims=True), 0, 1)
        vh = np.clip((V * h).sum(-1, keepdims=True), 0, 1)
        D = a2 / (np.pi * (nh * nh * (a2 - 1) + 1) ** 2)
        G = (nv / (nv * (1 - k) + k)) * (nl / (nl * (1 - k) + k) + 1e-6)
        F = f0 + (1 - f0) * (1 - vh) ** 5
        spec = D * G * F / (4 * nv * np.maximum(nl, 1e-4))
        diff = (1 - F) * (1 - metal) * alb / np.pi
        vis = 1.0
        if light_vis is not None and li < len(light_vis) and light_vis[li] is not None:
            vis = light_vis[li][..., None]
        col += (diff + spec) * nl * vis * np.asarray(L.color, np.float32) * L.intensity
    # cheap environment: sky/ground gradient for diffuse ambient and reflections
    sky, gnd = np.asarray(cfg.sky, np.float32), np.asarray(cfg.ground, np.float32)
    amb = gnd + (sky - gnd) * (0.5 + 0.5 * n[..., 1:2])
    r = _normalize(2 * (n * V).sum(-1, keepdims=True) * n - V)
    env = gnd + (sky - gnd) * np.clip(0.5 + 0.8 * r[..., 1:2], 0, 1)
    env = env * (1 - rough) + amb * rough  # rough metals see the blurred average
    Fr = f0 + (np.maximum(1 - rough, f0) - f0) * (1 - nv) ** 5
    col += cfg.env_strength * (amb * alb * (1 - metal) + env * Fr * 2.0)
    return col * cfg.exposure


def ground_shadow(cam: Camera, cfg: ShadeConfig) -> np.ndarray:
    """(H,W) darkening factor 0..1 for background pixels whose ray hits the shadow disc."""
    if cfg.ground_y is None:
        return np.zeros((cam.height, cam.width), np.float32)
    rays = cam.pixel_rays()
    if cam.ortho:
        R = cam.viewmat[:3, :3]
        ys, xs = np.mgrid[0:cam.height, 0:cam.width].astype(np.float64) + 0.5
        s = cam.A[0, 0]
        cx, cy = cam.A[0, 3], cam.A[1, 3]
        pc = np.stack([(xs - cx) / s, (ys - cy) / s, np.zeros_like(xs)], -1)
        origin = (pc - cam.viewmat[:3, 3]) @ R  # camera-plane points in world
    else:
        origin = np.broadcast_to(cam.position, rays.shape)
    t = (cfg.ground_y - origin[..., 1]) / np.where(np.abs(rays[..., 1]) < 1e-6, -1e-6, rays[..., 1])
    hit = origin + t[..., None] * rays
    dx = (hit[..., 0] - cfg.shadow_center[0]) / cfg.shadow_radius[0]
    dz = (hit[..., 2] - cfg.shadow_center[1]) / cfg.shadow_radius[1]
    r = np.sqrt(dx * dx + dz * dz)
    f = np.clip(1 - r, 0, 1)
    if cfg.shadow_steps > 0:
        f = np.ceil(f * cfg.shadow_steps) / cfg.shadow_steps
    return np.where(t > 0, f * cfg.shadow_strength, 0).astype(np.float32)


def postprocess(rgb_lin: np.ndarray, gb: dict, cfg: ShadeConfig, cam: Optional[Camera] = None,
                background: Optional[np.ndarray] = None) -> np.ndarray:
    """Tonemap + pixel-art hacks → (H,W,3) sRGB in 0..1.

    ``background`` = optional (H,W,3) sRGB image behind the model (sky, ground…)."""
    img = linear_to_srgb(aces(rgb_lin))
    mask = gb["alpha"] > cfg.alpha_threshold
    if cfg.outline > 0:
        d = np.where(mask, gb["depth"], 1e9)
        edge = np.zeros_like(mask)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nb = np.roll(np.roll(d, dy, 0), dx, 1)
            edge |= mask & ((nb - d) > cfg.outline_depth)  # neighbour is farther / background
        img = np.where(edge[..., None], img * (1 - cfg.outline), img)
    if cfg.palette > 0 and mask.sum() > cfg.palette:
        from sklearn.cluster import KMeans

        px = img[mask]
        km = KMeans(n_clusters=cfg.palette, n_init=1, random_state=0).fit(px[:: max(1, len(px) // 4000)])
        img[mask] = km.cluster_centers_[km.predict(px)]
    if background is not None:
        bg = background
    else:
        bg = np.asarray(cfg.background, np.float32)
        if cam is not None and cfg.ground_y is not None:
            bg = bg * (1 - ground_shadow(cam, cfg))[..., None]
    return np.where(mask[..., None], img, bg)


# ------------------------------------------------------------------ snapping
def patch_snap_shift(model, cam: Camera, means: Optional[torch.Tensor] = None) -> torch.Tensor:
    """"Almost Pixel Perfect": move every patch by < 1 px so that the patch's
    anchor (centroid) lands exactly on a pixel centre.  Inside a patch the
    pixel pattern then moves in whole-pixel steps instead of shimmering."""
    with torch.no_grad():
        P = torch.as_tensor(cam.A @ cam.viewmat, dtype=torch.float32)  # (3,4)
        npatch = int(model.patch.max()) + 1
        means = model.means if means is None else means
        cent = torch.zeros(npatch, 3).index_add_(0, model.patch, means.detach())
        cnt = torch.bincount(model.patch, minlength=npatch).clamp_min(1)[:, None]
        cent = cent / cnt
        h = cent @ P[:, :3].T + P[:, 3]
        xy = h[:, :2] / h[:, 2:3]
        snapped = torch.floor(xy) + 0.5
        return (snapped - xy)[model.patch]


def patch_colors(model, seed: int = 3) -> torch.Tensor:
    rng = np.random.default_rng(seed)
    npatch = int(model.patch.max()) + 1
    pal = rng.uniform(0.3, 0.95, (npatch, 3)).astype(np.float32)
    return torch.as_tensor(pal)[model.patch]


@dataclass
class FrameConfig:
    raster: RasterConfig = field(default_factory=lambda: RasterConfig(tile=4, k=256))
    shade: ShadeConfig = field(default_factory=ShadeConfig)
    snap: bool = False
    mode: str = "lit"  # lit | albedo | normal | depth | patches


def render_gbuffer_frame(model, cam: Camera, cfg: FrameConfig, pose=None) -> dict:
    """Rasterize (optionally posed / patch-snapped) splats into a plain G-buffer dict."""
    with torch.no_grad():
        if pose is None:
            R = model.rot()
            pose = (model.means, R, model.scales())
        means, R, scales = pose
        shift = patch_snap_shift(model, cam, means) if cfg.snap else None
        feats = (torch.cat([patch_colors(model), torch.zeros(model.n, 2)], -1) if cfg.mode == "patches"
                 else model.material())
        rc = cfg.raster

        def go(rc):
            return rasterize(means, R, scales, model.opacity(), feats, R[..., 2], cam, rc, shift)

        out = go(rc)
        # inference only: if some tiles ran out of slots, retry with more (never silently truncate much)
        while out["overflow"] > 0.01 and rc.k < 2048:
            rc = replace(rc, k=rc.k * 2)
            out = go(rc)
    return gbuffer_from_render(out)


def render_frame(model, cam: Camera, cfg: FrameConfig, pose=None) -> np.ndarray:
    """One low-res pixel-art frame (H,W,3) sRGB 0..1.

    ``pose`` = optional (means, R, scales) from :func:`pixelsplat.skin.pose_splats`
    (an animated frame); default is the trained rest pose."""
    gb = render_gbuffer_frame(model, cam, cfg, pose)
    sc = cfg.shade
    mask = (gb["alpha"] > sc.alpha_threshold)[..., None]
    bg = np.asarray(sc.background, np.float32)
    if cfg.mode == "lit":
        return postprocess(shade(gb, cam, sc), gb, sc, cam)
    if cfg.mode in ("albedo", "patches"):
        return np.where(mask, gb["albedo"], bg)
    if cfg.mode == "normal":
        return np.where(mask, gb["normal"] * 0.5 + 0.5, bg)
    if cfg.mode == "depth":
        d = gb["depth"]
        dm = d[mask[..., 0]]
        lo, hi = (np.percentile(dm, 2), np.percentile(dm, 98)) if dm.size else (0.0, 1.0)
        z = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
        return np.where(mask, np.repeat(1 - z[..., None], 3, -1), bg)
    raise ValueError(cfg.mode)


def upscale(img: np.ndarray, factor: int) -> np.ndarray:
    return np.repeat(np.repeat(img, factor, 0), factor, 1)

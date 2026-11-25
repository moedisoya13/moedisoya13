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
from .raster import RasterConfig, render_model

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


def shade(gb: dict, cam: Camera, cfg: ShadeConfig) -> np.ndarray:
    """Deferred PBR shading → (H,W,3) linear radiance (before tonemapping)."""
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
    for L in cfg.lights:
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
        col += (diff + spec) * nl * np.asarray(L.color, np.float32) * L.intensity
    # cheap environment: sky/ground gradient for diffuse ambient and reflections
    sky, gnd = np.asarray(cfg.sky, np.float32), np.asarray(cfg.ground, np.float32)
    amb = gnd + (sky - gnd) * (0.5 + 0.5 * n[..., 1:2])
    r = _normalize(2 * (n * V).sum(-1, keepdims=True) * n - V)
    env = gnd + (sky - gnd) * np.clip(0.5 + 0.8 * r[..., 1:2], 0, 1)
    env = env * (1 - rough) + amb * rough  # rough metals see the blurred average
    Fr = f0 + (np.maximum(1 - rough, f0) - f0) * (1 - nv) ** 5
    col += cfg.env_strength * (amb * alb * (1 - metal) + env * Fr * 2.0)
    return col * cfg.exposure


def postprocess(rgb_lin: np.ndarray, gb: dict, cfg: ShadeConfig) -> np.ndarray:
    """Tonemap + pixel-art hacks → (H,W,3) sRGB in 0..1."""
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
    bg = np.asarray(cfg.background, np.float32)
    return np.where(mask[..., None], img, bg)


# ------------------------------------------------------------------ snapping
def patch_snap_shift(model, cam: Camera) -> torch.Tensor:
    """"Almost Pixel Perfect": move every patch by < 1 px so that the patch's
    anchor (centroid) lands exactly on a pixel centre.  Inside a patch the
    pixel pattern then moves in whole-pixel steps instead of shimmering."""
    with torch.no_grad():
        P = torch.as_tensor(cam.A @ cam.viewmat, dtype=torch.float32)  # (3,4)
        npatch = int(model.patch.max()) + 1
        cent = torch.zeros(npatch, 3).index_add_(0, model.patch, model.means)
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


def render_frame(model, cam: Camera, cfg: FrameConfig) -> np.ndarray:
    """One low-res pixel-art frame (H,W,3) sRGB 0..1."""
    shift = patch_snap_shift(model, cam) if cfg.snap else None
    feats = torch.cat([patch_colors(model), torch.zeros(model.n, 2)], -1) if cfg.mode == "patches" else None
    rc = cfg.raster
    with torch.no_grad():
        out = render_model(model, cam, rc, feats=feats, shift=shift)
        # inference only: if some tiles ran out of slots, retry with more (never silently truncate much)
        while out["overflow"] > 0.01 and rc.k < 2048:
            rc = replace(rc, k=rc.k * 2)
            out = render_model(model, cam, rc, feats=feats, shift=shift)
    gb = gbuffer_from_render(out)
    sc = cfg.shade
    mask = (gb["alpha"] > sc.alpha_threshold)[..., None]
    bg = np.asarray(sc.background, np.float32)
    if cfg.mode == "lit":
        return postprocess(shade(gb, cam, sc), gb, sc)
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

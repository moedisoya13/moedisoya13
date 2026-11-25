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

from . import gbuffer as gbuf
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
    # ---- look options; every default below is neutral (= the original renderer). ``stylized()``
    # returns a tuned set.  See docs/LOOK.md for what each one does and why.
    terminator: float = 0.0  # 0..1: crisper light/shadow edge (two-tone ramp blended over Lambert)
    terminator_width: float = 0.10  # softness of that edge in N·L units
    ssao: float = 0.0  # screen-space ambient occlusion strength (folds, gaps between feathers)
    ssao_radius: float = 3.0  # in art pixels
    cavity: float = 0.0  # curvature shading: grooves darker ...
    ridge: float = 0.0  # ... and ridges lighter (edge highlight)
    rim: float = 0.0  # fresnel rim from lights that sit behind the model
    rim_power: float = 2.5
    spec_scale: float = 1.0  # multiplies the direct specular lobe (sheen control)
    outline_silhouette: Optional[float] = None  # outline strength against the background; None = ``outline``
    outline_tint: tuple = (1.0, 1.0, 1.0)  # outline pixels are multiplied by (1-outline)·tint
    contrast: float = 0.0  # S-curve on luminance (hue preserved)
    saturation: float = 1.0
    shadow_tint: Optional[tuple] = None  # split toning: colour the darks drift towards ...
    highlight_tint: Optional[tuple] = None  # ... and the lights (classic pixel-art hue shifting)
    tint_strength: float = 0.5
    palette_colors: Optional[np.ndarray] = None  # fixed (N,3) sRGB palette → stable across frames
    flat_splats: bool = False  # all pixels of one splat get one colour (flat dabs, needs gb["id"])
    bloom: float = 0.0  # glow around highlights, spills onto the background
    bloom_threshold: float = 0.72
    bloom_radius: float = 2.0  # art pixels
    glow: float = 0.0  # faint halo of the model's own colour on the background
    glow_radius: float = 10.0


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
        nl_raw = (n * l).sum(-1, keepdims=True)
        nl = np.clip(nl_raw, 0, 1)
        if cfg.terminator > 0:
            # two-tone ramp: the lit side stays bright almost up to the terminator, then drops fast
            wdt = max(cfg.terminator_width, 1e-3)
            band = np.clip((nl_raw + 0.5 * wdt) / wdt, 0, 1)
            band = band * band * (3 - 2 * band)
            nl = nl * (1 - cfg.terminator) + cfg.terminator * band * (0.62 + 0.38 * nl)
        if cfg.light_steps > 0:
            nl = np.ceil(nl * cfg.light_steps) / cfg.light_steps
        nh = np.clip((n * h).sum(-1, keepdims=True), 0, 1)
        vh = np.clip((V * h).sum(-1, keepdims=True), 0, 1)
        D = a2 / (np.pi * (nh * nh * (a2 - 1) + 1) ** 2)
        G = (nv / (nv * (1 - k) + k)) * (nl / (nl * (1 - k) + k) + 1e-6)
        F = f0 + (1 - f0) * (1 - vh) ** 5
        spec = D * G * F / (4 * nv * np.maximum(nl, 1e-4))
        if cfg.spec_scale != 1.0:
            spec = spec * cfg.spec_scale
        diff = (1 - F) * (1 - metal) * alb / np.pi
        vis = 1.0
        if light_vis is not None and li < len(light_vis) and light_vis[li] is not None:
            vis = light_vis[li][..., None]
        lcol = np.asarray(L.color, np.float32) * L.intensity
        col += (diff + spec) * nl * vis * lcol
        if cfg.rim > 0:
            # back light grazing the silhouette: only for lights behind the model as seen from here
            back = np.clip(-(V * l).sum(-1, keepdims=True), 0, 1)
            rim = back * (1 - nv) ** cfg.rim_power * np.clip(nl_raw + 0.35, 0, 1)
            col += cfg.rim * rim * vis * lcol * (0.6 * alb + 0.4 * f0) / np.pi * 4.0
    # cheap environment: sky/ground gradient for diffuse ambient and reflections
    sky, gnd = np.asarray(cfg.sky, np.float32), np.asarray(cfg.ground, np.float32)
    amb = gnd + (sky - gnd) * (0.5 + 0.5 * n[..., 1:2])
    r = _normalize(2 * (n * V).sum(-1, keepdims=True) * n - V)
    env = gnd + (sky - gnd) * np.clip(0.5 + 0.8 * r[..., 1:2], 0, 1)
    env = env * (1 - rough) + amb * rough  # rough metals see the blurred average
    Fr = f0 + (np.maximum(1 - rough, f0) - f0) * (1 - nv) ** 5
    ambient = cfg.env_strength * (amb * alb * (1 - metal) + env * Fr * 2.0)
    if cfg.ssao > 0:
        ao = gbuf.ssao(gb, gbuf.world_positions(cam, gb["depth"]), cfg.ssao_radius,
                       alpha_threshold=cfg.alpha_threshold)
        ao = 1 - cfg.ssao * (1 - ao[..., None])
        ambient = ambient * ao
        col = col * (0.45 + 0.55 * ao)  # a little of it on direct light too: reads as a contact shadow
    col += ambient
    if cfg.cavity > 0 or cfg.ridge > 0:
        c = gbuf.curvature(gb, cam.viewmat, cfg.alpha_threshold)[..., None]
        col = col * (1 - cfg.cavity * np.clip(-c * 1.2, 0, 1)) * (1 + cfg.ridge * np.clip(c * 1.2, 0, 1))
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


def _luma(c):
    return c @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def grade(img: np.ndarray, cfg: ShadeConfig) -> np.ndarray:
    """Colour grading in sRGB: luminance S-curve, saturation, split toning (dark → shadow_tint,
    light → highlight_tint).  Neutral settings return the input unchanged."""
    if cfg.contrast == 0 and cfg.saturation == 1 and cfg.shadow_tint is None and cfg.highlight_tint is None:
        return img
    img = np.clip(img, 0, 1)
    L = _luma(img)[..., None]
    if cfg.contrast != 0:
        Lc = np.clip(L + cfg.contrast * (L * L * (3 - 2 * L) - L) * 2.0, 0, 1)
        img = img * (Lc / np.maximum(L, 1e-4))
        L = Lc
    if cfg.saturation != 1:
        img = L + (img - L) * cfg.saturation
    if cfg.shadow_tint is not None or cfg.highlight_tint is not None:
        def unit(t):
            t = np.ones(3, np.float32) if t is None else np.asarray(t, np.float32)
            return t / max(float(_luma(t)), 1e-4)  # same brightness, only the hue moves

        t = np.clip((L - 0.15) / 0.6, 0, 1)
        t = t * t * (3 - 2 * t)
        tint = unit(cfg.shadow_tint) * (1 - t) + unit(cfg.highlight_tint) * t
        img = img * (1 + cfg.tint_strength * (tint - 1))
    return np.clip(img, 0, 1).astype(np.float32)


def _blur(a: np.ndarray, sigma: float) -> np.ndarray:
    from scipy.ndimage import gaussian_filter

    return gaussian_filter(a, sigma=(sigma, sigma) + (0,) * (a.ndim - 2), mode="nearest")


def fit_palette(images, n: int = 24, mask_bg: Optional[tuple] = None, seed: int = 0) -> np.ndarray:
    """k-means palette (N,3) sRGB from one or more frames — fit it ONCE per clip and pass it as
    ``ShadeConfig.palette_colors`` so the colours do not flicker from frame to frame."""
    from sklearn.cluster import KMeans

    px = np.concatenate([np.asarray(im, np.float32).reshape(-1, 3) for im in images])
    if mask_bg is not None:
        px = px[np.abs(px - np.asarray(mask_bg, np.float32)).sum(-1) > 0.03]
    px = px[:: max(1, len(px) // 20000)]
    return KMeans(n_clusters=min(n, len(px)), n_init=2, random_state=seed).fit(px).cluster_centers_.astype(np.float32)


def apply_palette(px: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """Nearest palette colour for (M,3) sRGB pixels (luminance-weighted distance)."""
    wgt = np.array([0.9, 1.2, 0.6], np.float32)
    pal = np.asarray(palette, np.float32)
    out = np.empty_like(px)
    for i in range(0, len(px), 8192):
        d = (((px[i:i + 8192, None] - pal[None]) * wgt) ** 2).sum(-1)
        out[i:i + 8192] = pal[d.argmin(1)]
    return out


def postprocess(rgb_lin: np.ndarray, gb: dict, cfg: ShadeConfig, cam: Optional[Camera] = None,
                background: Optional[np.ndarray] = None) -> np.ndarray:
    """Tonemap + pixel-art hacks → (H,W,3) sRGB in 0..1.

    ``background`` = optional (H,W,3) sRGB image behind the model (sky, ground…)."""
    img = linear_to_srgb(aces(rgb_lin))
    mask = gb["alpha"] > cfg.alpha_threshold
    img = grade(img, cfg)
    if cfg.flat_splats and "id" in gb and mask.any():
        # one colour per splat: pixels that show the same splat become one flat dab
        _, inv = np.unique(gb["id"][mask], return_inverse=True)
        cnt = np.bincount(inv).astype(np.float32)
        px = img[mask]
        img[mask] = np.stack([np.bincount(inv, px[:, c]) / cnt for c in range(3)], -1)[inv]
    o_sil = cfg.outline if cfg.outline_silhouette is None else cfg.outline_silhouette
    if cfg.outline > 0 or o_sil > 0:
        d = np.where(mask, gb["depth"], 1e9)
        edge = np.zeros_like(mask)  # inner edge: the neighbour is a farther part of the model
        sil = np.zeros_like(mask)  # silhouette: the neighbour is background
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nb = np.roll(np.roll(d, dy, 0), dx, 1)
            far = mask & ((nb - d) > cfg.outline_depth)
            sil |= far & (nb > 1e8)
            edge |= far & (nb <= 1e8)
        tint = np.asarray(cfg.outline_tint, np.float32)
        for e, strength in ((edge & ~sil, cfg.outline), (sil, o_sil)):
            if strength > 0:
                img = np.where(e[..., None], img * (1 - strength) * tint, img)
    if cfg.palette_colors is not None and mask.any():
        img[mask] = apply_palette(img[mask], cfg.palette_colors)
    elif cfg.palette > 0 and mask.sum() > cfg.palette:
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
    out = np.where(mask[..., None], img, bg)
    if cfg.glow > 0 and mask.any():
        # the model lights the air around it a little (the reference has this faint halo)
        halo = _blur(mask.astype(np.float32), cfg.glow_radius)[..., None] * img[mask].mean(0)
        out = np.where(mask[..., None], out, out + cfg.glow * halo * (1 - out))
    if cfg.bloom > 0 and mask.any():
        bright = np.where(mask[..., None], np.clip(img - cfg.bloom_threshold, 0, None), 0) / (1 - cfg.bloom_threshold)
        b = 0.6 * _blur(bright, cfg.bloom_radius) + 0.4 * _blur(bright, cfg.bloom_radius * 3)
        out = 1 - (1 - out) * (1 - np.clip(cfg.bloom * b, 0, 1))  # screen blend
    return out


def stylized(base: Optional[ShadeConfig] = None, strength: float = 1.0, low_key: bool = True,
             **overrides) -> ShadeConfig:
    """A copy of ``base`` with the look options switched on at tuned values (see docs/LOOK.md).

    ``strength`` scales all of them together (0 = unchanged ``base``); ``overrides`` win.
    ``low_key`` also turns the ambient light and the exposure down, so that shadows go properly
    dark and only the lit ridges are bright (the reference renders are lit like this); switch it
    off for scenes that bring their own bright environment."""
    base = ShadeConfig() if base is None else base
    k = strength
    opts = dict(terminator=0.8 * k, ssao=0.6 * k, cavity=0.35 * k, ridge=0.2 * k, rim=0.6 * k,
                contrast=0.35 * k, saturation=1 + 0.1 * k, shadow_tint=(0.62, 0.52, 0.95),
                highlight_tint=(1.0, 0.93, 0.78), tint_strength=0.22 * k, bloom=0.5 * k, glow=0.03 * k)
    if low_key:
        opts.update(exposure=base.exposure * (1 - 0.45 * k), env_strength=base.env_strength * (1 - 0.6 * k))
    opts.update(overrides)
    return replace(base, **opts)


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
    # ---- pixel decisions / G-buffer clean-up (defaults = off = the original behaviour)
    supersample: int = 1  # rasterize S× larger, then each art pixel picks a representative sample
    select: str = "mean"  # how: "mean" (area-average of the winning surface; steadiest) | "medoid" (one splat)
    despeckle: bool = False  # replace isolated outlier pixels / pin-holes by a typical neighbour
    normal_smooth: float = 0.0  # 0..1 edge-preserving blur of the normals at the art resolution
    depth_tol: float = 0.04  # world-units depth difference that still counts as "same surface"


def clean_frame(shade: Optional[ShadeConfig] = None, app: bool = True, supersample: int = 2,
                despeckle: bool = True, normal_smooth: float = 0.6, **kw) -> FrameConfig:
    """FrameConfig with the G-buffer clean-up on at the tuned values.  ``app`` = "Almost Pixel
    Perfect" (no-blend compositing + patch snapping); the clean-up is what makes that mode calm."""
    return FrameConfig(raster=RasterConfig(tile=4, k=256, hard=app), shade=shade or ShadeConfig(), snap=app,
                       supersample=supersample, despeckle=despeckle, normal_smooth=normal_smooth, **kw)


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

        ss = max(1, int(cfg.supersample))
        art_cam = cam
        if ss > 1:
            # the snap shift is decided on the ART grid (whole art pixels), then scaled: the
            # sub-samples of an art pixel keep seeing the same splats while a patch moves
            cam = cam.scaled(ss)
            shift = shift * ss if shift is not None else None
        out = go(rc)
        # inference only: if some tiles ran out of slots, retry with more (never silently truncate much)
        while out["overflow"] > 0.01 and rc.k < 2048:
            rc = replace(rc, k=rc.k * 2)
            out = go(rc)
    gb = gbuffer_from_render(out)
    if ss > 1:
        gb = gbuf.select_downsample(gb, ss, cfg.shade.alpha_threshold, cfg.select, cfg.depth_tol)
        assert gb["alpha"].shape == (art_cam.height, art_cam.width)
    if cfg.despeckle and cfg.mode != "patches":
        gb = gbuf.despeckle(gb, cfg.shade.alpha_threshold, cfg.depth_tol)
    if cfg.normal_smooth > 0:
        gb = gbuf.smooth_normals(gb, cfg.normal_smooth, cfg.shade.alpha_threshold, cfg.depth_tol)
    return gb


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

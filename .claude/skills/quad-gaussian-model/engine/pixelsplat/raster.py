"""Differentiable tile-based rasterizer for 2D Gaussian (quad) splats — pure PyTorch, CPU OK.

Math follows 2DGS (Huang et al. 2024) as implemented in gsplat's
``_torch_impl_2dgs.py``:

  * a splat is the plane  P(u,v) = p + u*s_u*t_u + v*s_v*t_v  (local coords u,v)
  * T = A·[ s_u t_u | s_v t_v | p ]  is a 3x3 homography local(u,v,1) → pixel(x·w, y·w, w)
  * for pixel (x,y) the ray hits the splat plane at (u,v) = cross(x·r2−r0, y·r2−r1)
    (r0,r1,r2 = rows of T) — exact, perspective-correct, no ellipse approximation
  * kernel  G(u,v) = exp(−½ ρ^m),  ρ = (|u|^p + |v|^p)^(1/p)
        p=2,m=2 → the usual round Gaussian;  p→∞ → square "quad" contours;  m↑ → hard edge
  * front-to-back alpha compositing per pixel (depth-sorted per tile)

Binning: the image is split into T×T tiles; each tile keeps the K nearest
(front-most) splats whose screen AABB overlaps it.  Everything after binning is
dense tensor math, so autograd gives the backward pass for free.

Outputs are a G-buffer: material features, world normal, camera depth, coverage.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import torch

from .camera import Camera


@dataclass
class RasterConfig:
    tile: int = 8
    k: int = 96  # max splats per tile
    kernel_p: float = 2.0  # contour shape: 2 = round, 8+ = square quad
    kernel_m: float = 2.0  # falloff: 2 = Gaussian, 6+ = hard-edged
    cutoff: float = 3.0  # ignore ρ beyond this (in sigmas)
    cull_backfaces: bool = True
    min_screen_sigma: bool = True  # gsplat's screen-space low-pass (keeps tiny splats visible)
    hard: bool = False  # inference hack: first splat with alpha>hard_thresh wins (no blending)
    hard_thresh: float = 0.35


def _cam_tensors(cam: Camera):
    V = torch.as_tensor(cam.viewmat, dtype=torch.float32)
    A = torch.as_tensor(cam.A, dtype=torch.float32)
    return V, A


def project(means, R, scales, cam: Camera, shift: Optional[torch.Tensor] = None):
    """Per-splat homography rows, depth row, screen AABB, facing flag.

    ``shift`` (N,2) moves each splat's footprint by (dx,dy) pixels — used by the
    "Almost Pixel Perfect" patch snapping.
    """
    V, A = _cam_tensors(cam)
    Rcw, tcw = V[:3, :3], V[:3, 3]
    p_c = means @ Rcw.T + tcw
    tu_c = (R[..., 0] * scales[:, :1]) @ Rcw.T
    tv_c = (R[..., 1] * scales[:, 1:2]) @ Rcw.T
    n_c = R[..., 2] @ Rcw.T
    A3, a4 = A[:, :3], A[:, 3]
    cu = tu_c @ A3.T  # direction columns (w=0)
    cv = tv_c @ A3.T
    cp = p_c @ A3.T + a4  # point column (w=1)
    T = torch.stack([cu, cv, cp], -1)  # (N,3,3): T[:, row, col]
    r0, r1, r2 = T[:, 0], T[:, 1], T[:, 2]
    if shift is not None:
        r0 = r0 + shift[:, :1] * r2
        r1 = r1 + shift[:, 1:2] * r2
    zrow = torch.stack([tu_c[:, 2], tv_c[:, 2], p_c[:, 2]], -1)
    depth = p_c[:, 2]
    with torch.no_grad():
        test = torch.tensor([1.0, 1.0, -1.0])
        d = (r2 * r2 * test).sum(-1)
        valid = d.abs() > 1e-10
        f = test / torch.where(valid, d, torch.ones_like(d))[:, None]
        mx = (r0 * r2 * f).sum(-1)
        my = (r1 * r2 * f).sum(-1)
        ex = (mx ** 2 - (r0 * r0 * f).sum(-1)).clamp_min(1e-4).sqrt()
        ey = (my ** 2 - (r1 * r1 * f).sum(-1)).clamp_min(1e-4).sqrt()
        if cam.ortho:
            facing = n_c[:, 2] < 0
        else:
            facing = (n_c * p_c).sum(-1) < 0
        valid = valid & (depth > 1e-3)
    return dict(r0=r0, r1=r1, r2=r2, zrow=zrow, depth=depth, mean2d=torch.stack([mx, my], -1),
                ext=torch.stack([ex, ey], -1), valid=valid, facing=facing)


def rasterize(means, R, scales, opacity, feats, normals, cam: Camera, cfg: RasterConfig,
              shift: Optional[torch.Tensor] = None):
    """Render a G-buffer. feats (N,F) arbitrary per-splat features, normals (N,3) world.

    Returns dict: feat (H,W,F), normal (H,W,3), depth (H,W), alpha (H,W), id (H,W)
    (all premultiplied by coverage except ``alpha``/``id``; id = front-most splat, -1 = none),
    plus three floats about "truncated" tiles (more than K candidates, only the K front-most
    kept): ``overflow`` = their share of ALL tiles (training log), ``overflow_occupied`` = their
    share of the tiles that hold any splat (what "should I retry with a larger K" has to look
    at: empty background tiles would otherwise dilute it), ``overflow_open`` = same, counting
    only truncated tiles that still have a pixel the kept splats did not close — when it is 0 a
    larger K cannot change the picture (the dropped splats are all behind closed pixels).
    """
    H, W, Ts = cam.height, cam.width, cfg.tile
    pr = project(means, R, scales, cam, shift)
    N = means.shape[0]
    tw, th = math.ceil(W / Ts), math.ceil(H / Ts)
    nt = tw * th
    K = min(cfg.k, N)

    # ---------------- binning (no grad): per tile, the K front-most overlapping splats
    # sparse (splat, tile) pairs → sort by (tile, depth) → keep rank < K   (like gsplat isect lists)
    with torch.no_grad():
        rad = cfg.cutoff * pr["ext"] + 0.5
        mx, my = pr["mean2d"].unbind(-1)
        ok = pr["valid"]
        if cfg.cull_backfaces:
            ok = ok & pr["facing"]
        if cfg.hard:
            # no-blend mode: alpha ≤ opacity, so these can never pass hard_thresh — binning them
            # would only use up the K slots of a tile and hide the splats behind
            ok = ok & (opacity.detach() > cfg.hard_thresh)
        tx0 = ((mx - rad[:, 0]) / Ts).floor().clamp(-1, tw).long()
        tx1 = ((mx + rad[:, 0]) / Ts).floor().clamp(-1, tw).long()
        ty0 = ((my - rad[:, 1]) / Ts).floor().clamp(-1, th).long()
        ty1 = ((my + rad[:, 1]) / Ts).floor().clamp(-1, th).long()
        ok = ok & (tx1 >= 0) & (ty1 >= 0) & (tx0 < tw) & (ty0 < th)
        ids = ok.nonzero()[:, 0]
        tx0, tx1 = tx0[ids].clamp(0, tw - 1), tx1[ids].clamp(0, tw - 1)
        ty0, ty1 = ty0[ids].clamp(0, th - 1), ty1[ids].clamp(0, th - 1)
        nx, ny = tx1 - tx0 + 1, ty1 - ty0 + 1
        cnt = nx * ny
        pi = torch.repeat_interleave(torch.arange(len(ids)), cnt)
        local = torch.arange(len(pi)) - torch.repeat_interleave(cnt.cumsum(0) - cnt, cnt)
        tile_id = (ty0[pi] + local // nx[pi]) * tw + (tx0[pi] + local % nx[pi])
        spl = ids[pi]
        drank = torch.empty(N, dtype=torch.long)
        drank[pr["depth"].detach().argsort()] = torch.arange(N)
        order = torch.argsort(tile_id * N + drank[spl])
        tile_s, spl_s = tile_id[order], spl[order]
        counts = torch.bincount(tile_s, minlength=nt)
        starts = counts.cumsum(0) - counts
        rank = torch.arange(len(tile_s)) - starts[tile_s]
        keep = rank < K
        idx = torch.full((nt, K), N, dtype=torch.long)
        idx[tile_s[keep], rank[keep]] = spl_s[keep]
        kmask = idx < N  # empty slots keep index N = the all-zero dummy splat appended by g()
        over = counts > K
        overflow = float(over.float().mean())
        occupied = max(int((counts > 0).sum()), 1)
        overflow_occupied = float(over.sum()) / occupied
        # pixel centres per tile
        tyy, txx = torch.meshgrid(torch.arange(th, dtype=torch.float32), torch.arange(tw, dtype=torch.float32), indexing="ij")
        txx, tyy = txx.reshape(-1, 1), tyy.reshape(-1, 1)
        ly, lx = torch.meshgrid(torch.arange(Ts, dtype=torch.float32), torch.arange(Ts, dtype=torch.float32), indexing="ij")
        px = (txx * Ts + lx.reshape(1, -1) + 0.5)  # (nt,P)
        py = (tyy * Ts + ly.reshape(1, -1) + 0.5)

    # ---------------- per pixel × per splat (dense)
    def g(t):  # gather (nt,K,...); empty slots read a zero row, never a real splat (whose NaN/inf
        return torch.cat([t, t.new_zeros((1,) + t.shape[1:])])[idx]  # would survive the 0-mask)

    r0, r1, r2 = g(pr["r0"]), g(pr["r1"]), g(pr["r2"])
    X = px[:, :, None, None]
    Y = py[:, :, None, None]
    hu = X * r2[:, None] - r0[:, None]  # (nt,P,K,3)
    hv = Y * r2[:, None] - r1[:, None]
    c = torch.linalg.cross(hu, hv, dim=-1)
    c2 = c[..., 2]
    c2 = torch.where(c2.abs() < 1e-10, torch.full_like(c2, 1e-10), c2)
    u = c[..., 0] / c2
    v = c[..., 1] / c2
    p, m = cfg.kernel_p, cfg.kernel_m
    if p == 2.0 and m == 2.0:
        e = 0.5 * (u * u + v * v)
    else:
        s = u.abs().clamp_max(1e3) ** p + v.abs().clamp_max(1e3) ** p
        e = 0.5 * (s + 1e-12) ** (m / p)
    rho_ok = e < 0.5 * cfg.cutoff ** m
    e_plane = e
    if cfg.min_screen_sigma:
        m2 = g(pr["mean2d"])
        dx = X[..., 0] - m2[:, None, :, 0]
        dy = Y[..., 0] - m2[:, None, :, 1]
        e = torch.minimum(e, dx * dx + dy * dy)
        rho_ok = rho_ok | (dx * dx + dy * dy < 0.5)
    e = e.clamp_max(50.0)
    op = g(opacity)[:, None, :]
    alpha = (op * torch.exp(-e)).clamp_max(0.99)
    alpha = alpha * (rho_ok & kmask[:, None, :] & (c[..., 2].abs() > 1e-10)).float()

    if cfg.hard:
        hit = alpha > cfg.hard_thresh
        first = hit & (hit.float().cumsum(-1) == 1)
        w = first.float()
    else:
        trans = torch.cumprod(1.0 - alpha, dim=-1)
        trans = torch.cat([torch.ones_like(trans[..., :1]), trans[..., :-1]], -1)
        w = alpha * trans  # (nt,P,K)

    zr = g(pr["zrow"])  # (nt,K,3)
    if cfg.min_screen_sigma:
        # the screen-space dot also lights pixels whose ray meets the splat's PLANE far outside
        # the splat (edge-on: anywhere, even behind the camera).  Pull such a hit point back to
        # the rim of the splat's support (ρ = cutoff), so the depth stays inside the splat's own
        # depth range.  Hits within the cutoff are untouched (factor exactly 1).
        pull = (2.0 * e_plane / cfg.cutoff ** m).clamp_min(1.0)  # (ρ/cutoff)^m, at least 1
        pull = torch.rsqrt(pull) if m == 2.0 else pull ** (-1.0 / m)
        dz = (zr[:, None, :, 0] * u.clamp(-1e3, 1e3) + zr[:, None, :, 1] * v.clamp(-1e3, 1e3)) * pull
        z = dz + zr[:, None, :, 2]
    else:
        z = zr[:, None, :, 0] * u + zr[:, None, :, 1] * v + zr[:, None, :, 2]
    out_f = torch.einsum("tpk,tkf->tpf", w, g(feats))
    out_n = torch.einsum("tpk,tkf->tpf", w, g(normals))
    out_d = (w * z).sum(-1)
    out_a = w.sum(-1)
    with torch.no_grad():
        # hard: a pixel is closed once any splat won it; blended: once it is (almost) opaque
        open_px = (out_a < (0.5 if cfg.hard else 0.999)) & (px < W) & (py < H)
        overflow_open = float((over & open_px.any(-1)).sum()) / occupied
        has = w.max(-1).values > 0
        fid = torch.gather(idx, 1, w.argmax(-1))
        fid = torch.where(has, fid, torch.full_like(fid, -1))

    def img(t):  # (nt,P,C) → (H,W,C)
        C = t.shape[-1]
        return t.reshape(th, tw, Ts, Ts, C).permute(0, 2, 1, 3, 4).reshape(th * Ts, tw * Ts, C)[:H, :W]

    return dict(feat=img(out_f), normal=img(out_n), depth=img(out_d[..., None])[..., 0],
                alpha=img(out_a[..., None])[..., 0], id=img(fid[..., None])[..., 0],
                overflow=overflow, overflow_occupied=overflow_occupied, overflow_open=overflow_open)


def render_model(model, cam: Camera, cfg: RasterConfig, feats: Optional[torch.Tensor] = None,
                 shift: Optional[torch.Tensor] = None):
    R = model.rot()
    return rasterize(model.means, R, model.scales(), model.opacity(),
                     model.material() if feats is None else feats, R[..., 2], cam, cfg, shift)

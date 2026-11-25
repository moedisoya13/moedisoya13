"""Fit splats to the mesh's G-buffer (albedo, normal, depth, roughness, metallic, coverage).

"Learning the whole g-buffer": the loss compares every G-buffer channel the
splats render against the mesh's ground-truth G-buffer from many viewpoints.
Lighting is NOT baked in — it is applied later (deferred), so lights can move.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass

import numpy as np
import torch

from .camera import fit_radius_for_fov, orbit_camera
from .gt import render_gbuffer
from .raster import RasterConfig, render_model
from .splats import SplatModel


@dataclass
class TrainConfig:
    n_splats: int = 16000
    res: int = 192  # training resolution (square)
    n_views: int = 64
    iters: int = 1500
    fov: float = 30.0
    elev_range: tuple = (-15.0, 50.0)
    seed: int = 0
    tile: int = 4
    k: int = 128
    w_albedo: float = 1.0
    w_material: float = 0.5
    w_normal: float = 0.5
    w_depth: float = 0.5
    w_alpha: float = 1.0
    log_every: int = 100


def make_views(parts, cfg: TrainConfig):
    rng = np.random.default_rng(cfg.seed + 1)
    radius = fit_radius_for_fov(cfg.fov)
    views = []
    for i in range(cfg.n_views):
        az = (i / cfg.n_views) * 360.0 + rng.uniform(-3, 3)  # even azimuth coverage
        el = rng.uniform(*cfg.elev_range)
        cam = orbit_camera(az, el, cfg.res, cfg.res, radius=radius, fov_deg=cfg.fov)
        views.append((cam, torch.as_tensor(render_gbuffer(parts, cam, ssaa=2))))
    return views


def train(parts, cfg: TrainConfig, log=print) -> SplatModel:
    torch.manual_seed(cfg.seed)
    model = SplatModel.from_mesh(parts, cfg.n_splats, seed=cfg.seed)
    t0 = time.time()
    views = make_views(parts, cfg)
    log(f"[train] {model.n} splats, {len(views)} GT views @ {cfg.res}px ({time.time() - t0:.1f}s)")
    if cfg.iters <= 0:
        return model
    scene_scale = 1.0
    opt = torch.optim.Adam([
        {"params": [model.means], "lr": 2e-4 * scene_scale},
        {"params": [model.quats], "lr": 2e-3},
        {"params": [model.log_scales], "lr": 5e-3},
        {"params": [model.opacity_logit], "lr": 3e-2},
        {"params": [model.albedo_logit, model.rough_logit, model.metal_logit], "lr": 2e-2},
    ])
    rcfg = RasterConfig(tile=cfg.tile, k=cfg.k)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda i: 0.1 ** (i / max(cfg.iters, 1)))
    order = np.random.default_rng(cfg.seed + 2)
    ema, t0 = None, time.time()
    for it in range(1, cfg.iters + 1):
        cam, gt = views[order.integers(len(views))]
        out = render_model(model, cam, rcfg)
        a = gt[..., 9]
        l_alb = (out["feat"][..., :3] - gt[..., 0:3]).abs().mean()
        l_mat = (out["feat"][..., 3:5] - gt[..., 7:9]).abs().mean()
        l_nrm = (out["normal"] - gt[..., 3:6]).abs().mean()
        l_dep = (out["depth"] - gt[..., 6]).abs().mean()
        l_alp = (out["alpha"] - a).abs().mean()
        loss = (cfg.w_albedo * l_alb + cfg.w_material * l_mat + cfg.w_normal * l_nrm
                + cfg.w_depth * l_dep + cfg.w_alpha * l_alp)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        sched.step()
        with torch.no_grad():  # keep splats from growing absurdly large
            model.log_scales.clamp_(max=math.log(0.08))
        ema = loss.item() if ema is None else 0.9 * ema + 0.1 * loss.item()
        if it % cfg.log_every == 0 or it == cfg.iters:
            log(f"[train] it {it:5d}  loss {ema:.4f}  (alb {l_alb.item():.4f} nrm {l_nrm.item():.4f} "
                f"dep {l_dep.item():.4f} a {l_alp.item():.4f})  overflow {out['overflow']:.2f}  "
                f"{(time.time() - t0) / it:.2f}s/it")
    with torch.no_grad():
        keep = model.opacity() > 0.05
    model.prune(keep)
    log(f"[train] pruned to {model.n} splats")
    return model


def assign_patches(model: SplatModel, n_patches: int = 80, seed: int = 0, normal_weight: float = 0.15):
    """Cluster splats into spatial patches (k-means on position + a bit of normal)."""
    from sklearn.cluster import KMeans

    x = torch.cat([model.means.detach(), normal_weight * model.normals().detach()], -1).numpy()
    km = KMeans(n_clusters=n_patches, n_init=2, random_state=seed).fit(x)
    model.patch = torch.as_tensor(km.labels_, dtype=torch.long)
    return model

"""The splat model: a cloud of flat, oriented 2D Gaussian "quads" (surfels).

Each splat i has
  geometry : center mean_i (3), rotation quat_i (4, wxyz), log-scales (2)
             → tangent axes t_u, t_v and normal n = t_u × t_v (the flat quad)
  coverage : opacity logit (1)
  material : albedo (3, sRGB), roughness (1), metallic (1)   ← the G-buffer payload
  patch id : which "Almost Pixel Perfect" patch it belongs to (int, not trained)
"""
from __future__ import annotations

import numpy as np
import torch

from .gt import sample_surface


def quat_to_rot(q: torch.Tensor) -> torch.Tensor:
    q = q / q.norm(dim=-1, keepdim=True).clamp_min(1e-12)
    w, x, y, z = q.unbind(-1)
    return torch.stack([
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ], -1).reshape(q.shape[:-1] + (3, 3))


def rot_to_quat(R: np.ndarray) -> np.ndarray:
    """(N,3,3) rotation matrices → (N,4) wxyz quaternions (numerically robust)."""
    N = R.shape[0]
    q = np.zeros((N, 4))
    tr = R[:, 0, 0] + R[:, 1, 1] + R[:, 2, 2]
    for i in range(N):
        m = R[i]
        if tr[i] > 0:
            s = np.sqrt(tr[i] + 1.0) * 2
            q[i] = [0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
            q[i] = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
        elif m[1, 1] > m[2, 2]:
            s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
            q[i] = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
        else:
            s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
            q[i] = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
    return q.astype(np.float32)


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


class SplatModel(torch.nn.Module):
    def __init__(self, means, quats, log_scales, opacity_logit, albedo, rough, metal, patch=None):
        super().__init__()
        P = torch.nn.Parameter
        t = lambda a: torch.as_tensor(np.asarray(a), dtype=torch.float32)
        self.means = P(t(means))
        self.quats = P(t(quats))
        self.log_scales = P(t(log_scales))
        self.opacity_logit = P(t(opacity_logit))
        # material stored as logits so they stay in [0,1]
        self.albedo_logit = P(t(_logit(np.asarray(albedo))))
        self.rough_logit = P(t(_logit(np.asarray(rough))))
        self.metal_logit = P(t(_logit(np.asarray(metal))))
        n = self.means.shape[0]
        self.register_buffer("patch", torch.as_tensor(patch if patch is not None else np.zeros(n), dtype=torch.long))

    # ---- activated attributes
    @property
    def n(self) -> int:
        return self.means.shape[0]

    def rot(self):
        return quat_to_rot(self.quats)

    def scales(self):
        return self.log_scales.exp()

    def opacity(self):
        return torch.sigmoid(self.opacity_logit)

    def material(self):
        """(N,5): albedo sRGB(3), roughness, metallic."""
        return torch.cat([torch.sigmoid(self.albedo_logit), torch.sigmoid(self.rough_logit)[:, None],
                          torch.sigmoid(self.metal_logit)[:, None]], -1)

    def normals(self):
        return self.rot()[..., 2]

    # ---- construction
    @classmethod
    def from_mesh(cls, parts, n: int, seed: int = 0, scale_mult: float = 0.9, opacity: float = 0.95):
        """Initialise splats directly on the mesh surface (no training needed yet).

        Each splat sits on the surface, faces along the surface normal, has a
        random spin around it, and its radius matches the sampling density.
        """
        rng = np.random.default_rng(seed)
        s = sample_surface(parts, n, rng)
        nrm = s["normal"].astype(np.float64)
        # random tangent frame around each normal
        a = rng.normal(size=nrm.shape)
        tu = a - (a * nrm).sum(1, keepdims=True) * nrm
        tu /= np.linalg.norm(tu, axis=1, keepdims=True) + 1e-12
        tv = np.cross(nrm, tu)
        R = np.stack([tu, tv, nrm], -1)  # columns
        total_area = sum(p.area for p in parts)
        r = np.sqrt(total_area / n) * scale_mult
        log_s = np.full((n, 2), np.log(r), np.float32)
        m = cls(s["pos"], rot_to_quat(R), log_s, np.full(n, _logit(opacity), np.float32),
                s["albedo"], s["rough"], s["metal"])
        m.part = s["part"]
        return m

    def state(self) -> dict:
        return {k: v.detach().clone() for k, v in self.state_dict().items()}

    @classmethod
    def load(cls, path: str) -> "SplatModel":
        sd = torch.load(path, map_location="cpu")
        n = sd["means"].shape[0]
        m = cls(np.zeros((n, 3)), np.tile([1, 0, 0, 0], (n, 1)), np.zeros((n, 2)), np.zeros(n),
                np.full((n, 3), 0.5), np.full(n, 0.5), np.full(n, 0.5))
        m.load_state_dict(sd)
        return m

    @torch.no_grad()
    def prune(self, keep: torch.Tensor):
        for name in ("means", "quats", "log_scales", "opacity_logit", "albedo_logit", "rough_logit", "metal_logit"):
            p = getattr(self, name)
            setattr(self, name, torch.nn.Parameter(p.data[keep].clone()))
        self.patch = self.patch[keep].clone()

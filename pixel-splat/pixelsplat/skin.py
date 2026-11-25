"""Skeletal animation for splats (linear blend skinning, LBS).

Splats are trained once in a rest pose.  Each splat gets weights over bones;
per frame every bone has a 3x4 rest→posed transform, and a splat is moved by
the weighted blend of its bones' transforms.  Its two tangent axes are
transformed too, so the flat quad turns (and its normal + lighting follow).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
import torch


@dataclass
class Bone:
    name: str
    parent: Optional[str]
    head: np.ndarray  # rest-pose joint (pivot) position
    tail: np.ndarray  # rest-pose end position (used for weights)


class Skeleton:
    def __init__(self, bones: List[Bone]):
        self.bones = bones
        self.index = {b.name: i for i, b in enumerate(bones)}

    def __len__(self):
        return len(self.bones)

    def world_mats(self, local_rot: Dict[str, np.ndarray], root_offset=np.zeros(3)) -> np.ndarray:
        """(B,3,4) rest→posed transforms. ``local_rot[name]`` = 3x3 rotation about the
        bone's own head, applied in the parent's posed frame (forward kinematics)."""
        out = {}
        for b in self.bones:  # bones are listed parents-first
            R = local_rot.get(b.name, np.eye(3))
            T = np.eye(4)
            T[:3, :3] = R
            T[:3, 3] = b.head - R @ b.head  # rotate about the head
            if b.parent is None:
                T[:3, 3] += root_offset
                out[b.name] = T
            else:
                out[b.name] = out[b.parent] @ T
        return np.stack([out[b.name][:3] for b in self.bones]).astype(np.float32)


def seg_dist(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(float(ab @ ab), 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


def distance_weights(p: np.ndarray, skel: Skeleton, sigma: float = 0.05,
                     allowed: Optional[np.ndarray] = None) -> np.ndarray:
    """Soft weights from distance to each bone segment: w ∝ exp(-(d/σ)²).

    ``allowed`` (N,B) bool masks bones a point may use (e.g. wings only follow
    wing bones + chest)."""
    d = np.stack([seg_dist(p, b.head, b.tail) for b in skel.bones], 1)
    logit = -((d - d.min(1, keepdims=True)) / sigma) ** 2
    if allowed is not None:
        logit = np.where(allowed, logit, -1e9)
    w = np.exp(logit - logit.max(1, keepdims=True))
    w[w < 1e-3] = 0
    return (w / w.sum(1, keepdims=True)).astype(np.float32)


def pose_splats(model, weights: torch.Tensor, mats: torch.Tensor):
    """Return posed (means, R, scales) for the rasterizer.

    weights (N,B), mats (B,3,4).  Each splat's blended matrix M = Σ w_b mats_b.
    """
    M = torch.einsum("nb,bij->nij", weights, mats)  # (N,3,4)
    A, t = M[:, :, :3], M[:, :, 3]
    means = torch.einsum("nij,nj->ni", A, model.means) + t
    R0 = model.rot()
    s = model.scales()
    tu = torch.einsum("nij,nj->ni", A, R0[..., 0] * s[:, :1])
    tv = torch.einsum("nij,nj->ni", A, R0[..., 1] * s[:, 1:2])
    su = tu.norm(dim=-1, keepdim=True).clamp_min(1e-8)
    e1 = tu / su
    tv_o = tv - (tv * e1).sum(-1, keepdim=True) * e1
    sv = tv_o.norm(dim=-1, keepdim=True).clamp_min(1e-8)
    e2 = tv_o / sv
    e3 = torch.linalg.cross(e1, e2, dim=-1)
    # keep the original outward side of the quad
    n_ref = torch.einsum("nij,nj->ni", A, R0[..., 2])
    flip = ((e3 * n_ref).sum(-1, keepdim=True) < 0).float()
    e2 = e2 * (1 - 2 * flip)
    e3 = e3 * (1 - 2 * flip)
    R = torch.stack([e1, e2, e3], -1)
    return means, R, torch.cat([su, sv], -1)


def rot_x(deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def rot_axis(axis, deg):
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    th = np.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(th) * K + (1 - np.cos(th)) * K @ K

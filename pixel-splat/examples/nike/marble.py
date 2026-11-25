"""Surface painting for the Nike sculpt: weathered Parian marble + the plaster right wing.

Kept separate from the geometry (nike.py) so the look can be tuned without touching the sculpt.
``paint`` receives the mesh vertices, their normals, an SDF of the whole statue (for ambient
occlusion / cavity tests) and a per-vertex component label, and returns (V,3) sRGB colours.
"""
from __future__ import annotations

import numpy as np

from pixelsplat import sdf

V = lambda *a: np.array(a, np.float32)  # noqa: E731


def paint(verts: np.ndarray, nrm: np.ndarray, full_sdf, labels: np.ndarray, names: list) -> np.ndarray:
    # weathered Parian marble: cavities grey, soft mottling, slightly warm
    ao = sdf.ambient_occlusion(full_sdf, verts, nrm)
    mott = sdf.value_noise(verts, 5.0, seed=11, octaves=4)
    vein = sdf.value_noise(verts * V(1, 3, 1), 9.0, seed=3, octaves=2)
    base = V(0.87, 0.85, 0.81)
    col = base[None] * (0.80 + 0.22 * mott[:, None]) * (0.94 + 0.06 * vein[:, None])
    col = col * (0.42 + 0.58 * ao[:, None] ** 1.2)
    col = col * V(1.0, 0.99, 0.965)[None]
    # the right wing is plaster: paler, greyer and without the marble's mottling
    plaster = labels == names.index("wingR")
    flat = V(0.90, 0.895, 0.885)[None] * (0.50 + 0.50 * ao[plaster, None] ** 1.2)
    col[plaster] = 0.25 * col[plaster] + 0.75 * flat
    return np.clip(col, 0, 1).astype(np.float32)

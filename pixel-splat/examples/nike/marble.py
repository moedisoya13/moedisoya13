"""Surface painting for the Nike sculpt: weathered Parian marble + the plaster right wing.

Kept separate from the geometry (nike.py) so the look can be tuned without touching the sculpt.
``paint`` receives the mesh vertices, their normals, an SDF of the whole statue (for ambient
occlusion / cavity tests) and a per-vertex component label, and returns (V,3) sRGB colours.

The paint only looks at the *shape* (through the SDF), never at named body parts, so it keeps
working when the sculpt changes.  Layers, modelled on the statue in the Louvre:

  1. base        pale cream marble with broad, soft mottling
  2. patina      warm honey / ochre weathering, heavier where the stone is sheltered and low
  3. recess dirt brown-grey grime in folds and between feathers (wide + narrow occlusion)
  4. grooves     thin dark lines exactly in the creases (negative curvature) → feathers and
                 folds separate from each other even when the light is flat
  5. edge wear   ridges rubbed lighter and cooler (positive curvature)
  6. streaks     faint vertical rain marks on steep faces
  7. grain       small hue / value jitter so neighbouring pixels are never the same flat colour

``paint(..., style="flat")`` is the original uniform look (kept for comparisons).
``repaint_splats`` re-paints an already trained splat model in seconds (no re-sculpt / re-bake).
"""
from __future__ import annotations

import numpy as np

from pixelsplat import sdf

V = lambda *a: np.array(a, np.float32)  # noqa: E731

# palette (sRGB)
CREAM = V(0.90, 0.875, 0.815)  # clean, exposed marble
HONEY = V(0.80, 0.665, 0.475)  # warm weathering
OCHRE = V(0.62, 0.455, 0.29)  # heavier staining low down / sheltered
GRIME = V(0.30, 0.225, 0.175)  # dirt deep in the folds
GROOVE = V(0.20, 0.15, 0.13)  # the line at the bottom of a crease
WORN = V(0.965, 0.955, 0.925)  # rubbed edges
PLASTER = V(0.88, 0.875, 0.86)


def _smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def _mix(a, b, t):
    return a * (1 - t[:, None]) + b * t[:, None]


def curvature(fn, p, h):
    """Mean curvature of the SDF surface at scale ``h`` (> 0 convex ridge, < 0 groove), unit 1/length."""
    acc = -6.0 * fn(p)
    for ax in range(3):
        e = np.zeros(3, np.float32)
        e[ax] = h
        acc = acc + fn(p + e) + fn(p - e)
    return acc / (h * h)


def surface_features(verts, nrm, full_sdf) -> dict:
    """Shape descriptors the paint layers are built from (all (V,) float32)."""
    ao = sdf.ambient_occlusion(full_sdf, verts, nrm)  # wide: 1 = open, 0 = deep
    ao_fine = sdf.ambient_occlusion(full_sdf, verts, nrm, steps=(0.006, 0.012, 0.022))
    return dict(ao=ao.astype(np.float32), ao_fine=ao_fine.astype(np.float32),
                curv=curvature(full_sdf, verts, 0.006).astype(np.float32))


def paint_flat(verts, nrm, full_sdf, labels, names) -> np.ndarray:
    """The original look: nearly uniform marble × ambient occlusion × soft noise."""
    ao = sdf.ambient_occlusion(full_sdf, verts, nrm)
    mott = sdf.value_noise(verts, 5.0, seed=11, octaves=4)
    vein = sdf.value_noise(verts * V(1, 3, 1), 9.0, seed=3, octaves=2)
    base = V(0.87, 0.85, 0.81)
    col = base[None] * (0.80 + 0.22 * mott[:, None]) * (0.94 + 0.06 * vein[:, None])
    col = col * (0.42 + 0.58 * ao[:, None] ** 1.2)
    col = col * V(1.0, 0.99, 0.965)[None]
    plaster = labels == names.index("wingR")
    flat = V(0.90, 0.895, 0.885)[None] * (0.50 + 0.50 * ao[plaster, None] ** 1.2)
    col[plaster] = 0.25 * col[plaster] + 0.75 * flat
    return np.clip(col, 0, 1).astype(np.float32)


def paint(verts: np.ndarray, nrm: np.ndarray, full_sdf, labels: np.ndarray, names: list,
          style: str = "weathered", features: dict | None = None, detail: float = 1.0) -> np.ndarray:
    """``detail`` scales the fine layers (grime, grooves, edge wear, streaks, grain, veins): 1 is
    tuned for figures ≈ 250 art pixels tall; go lower for small sprites (fine paint that is
    smaller than an art pixel turns into noise), higher for close-ups."""
    if style == "flat":
        return paint_flat(verts, nrm, full_sdf, labels, names)
    f = features or surface_features(verts, nrm, full_sdf)
    ao, ao_fine, curv = f["ao"], f["ao_fine"], f["curv"]
    noise = sdf.value_noise
    y = verts[:, 1]
    lo, hi = float(y.min()), float(y.max())
    height = (y - lo) / max(hi - lo, 1e-6)  # 0 = feet, 1 = wing tips

    # 1. base: cream marble, broad soft mottling in value
    mott = noise(verts, 4.0, seed=11, octaves=4)
    col = CREAM[None] * (0.90 + 0.14 * mott[:, None])

    # 2. patina: big warm patches; sheltered and low areas weather more
    patch = noise(verts, 2.2, seed=21, octaves=3)
    shelter = 1 - ao
    pat = _smooth(patch + 0.50 * shelter + 0.12 * (1 - height) - 0.10 * np.clip(nrm[:, 1], 0, 1), 0.42, 0.95)
    col = _mix(col, HONEY[None] * (0.92 + 0.12 * mott[:, None]), 0.70 * pat)
    stain = _smooth(noise(verts, 3.4, seed=5, octaves=3) + 0.6 * shelter + 0.10 * (1 - height), 0.78, 1.2)
    col = _mix(col, OCHRE[None], 0.40 * stain)

    # 3. dirt in the recesses: wide occlusion = soft shading, fine occlusion = packed grime
    col = col * (0.56 + 0.44 * ao[:, None] ** 1.1)
    col = _mix(col, GRIME[None], np.clip(0.30 * detail, 0, 1) * _smooth(1 - ao_fine, 0.25, 0.85))

    # 4. grooves: a dark line in every crease; 5. edge wear on every ridge
    groove = _smooth(-curv, 25.0, 90.0)
    col = _mix(col, GROOVE[None], np.clip(0.30 * detail, 0, 1) * groove)
    ridge = _smooth(curv, 12.0, 60.0) * _smooth(ao, 0.55, 0.9)
    col = _mix(col, WORN[None], np.clip(0.45 * detail, 0, 1) * ridge)

    # 6. rain streaks: noise stretched along Y, only on steep faces
    streak = noise(verts * V(1, 0.10, 1), 26.0, seed=31, octaves=2)
    steep = 1 - np.abs(nrm[:, 1])
    col = col * (1 - 0.10 * detail * _smooth(streak, 0.55, 0.85) * steep)[:, None]

    # 7. grain: small hue + value jitter (a few art pixels wide), plus sparse grey veins
    g1 = noise(verts, 13.0, seed=41, octaves=2) - 0.5
    g2 = noise(verts, 13.0, seed=42, octaves=2) - 0.5
    col = col * (1 + 0.07 * detail * g1[:, None]) + detail * g2[:, None] * V(0.04, -0.008, -0.045)[None]
    vein = np.abs(noise(verts * V(1, 2.2, 1), 6.0, seed=3, octaves=3) - 0.5)
    col = _mix(col, col * V(0.74, 0.76, 0.82)[None], np.clip(0.4 * detail, 0, 1) * (1 - _smooth(vein, 0.0, 0.035)))

    # the right wing is a plaster reconstruction: paler, greyer, far less weathered — but its
    # feathers still need their separating lines
    if "wingR" in names:
        pl = labels == names.index("wingR")
        if pl.any():
            p = PLASTER[None] * (0.93 + 0.07 * mott[pl, None]) * (0.55 + 0.45 * ao[pl, None] ** 1.1)
            p = _mix(p, V(0.42, 0.40, 0.39)[None], np.clip(0.45 * detail, 0, 1) * _smooth(1 - ao_fine[pl], 0.15, 0.8))
            p = _mix(p, V(0.30, 0.28, 0.28)[None], np.clip(0.45 * detail, 0, 1) * groove[pl])
            p = _mix(p, V(0.95, 0.95, 0.94)[None], np.clip(0.30 * detail, 0, 1) * ridge[pl])
            p = p * (1 + 0.05 * detail * g1[pl, None])
            col[pl] = 0.18 * col[pl] + 0.82 * p
    return np.clip(col, 0.02, 1).astype(np.float32)


def repaint_splats(model, full_sdf, component_labels, style: str = "weathered", detail: float = 1.0):
    """Give an already trained splat model this paint (in place): evaluate ``paint`` at every
    splat centre.  A trained splat's albedo is the mesh colour under it, so this is equivalent
    to re-sculpting + re-baking with the new paint, minus the wait.  Returns the model."""
    import torch

    from pixelsplat.splats import _logit

    p = model.means.detach().numpy().astype(np.float32)
    n = sdf.sdf_normal(full_sdf, p).astype(np.float32)
    lab, names = component_labels(p)
    col = paint(p, n, full_sdf, lab, names, style=style, detail=detail)
    with torch.no_grad():
        model.albedo_logit.copy_(torch.as_tensor(_logit(col), dtype=torch.float32))
    return model

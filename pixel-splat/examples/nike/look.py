"""The Nike's render look: which renderer options are on, and how strongly.

Kept out of nike.py / colossus.py so the look can be tuned (or switched back to "classic")
without touching the sculpt or the animation.  See docs/LOOK.md for what every option does.

    fc = look.upgrade(FrameConfig(...))          # studio shots on the dark background
    sc = look.colossus_shade(base_shade_config)  # dusk plaza (bright sky behind her)
"""
from __future__ import annotations

from dataclasses import replace

from pixelsplat.shade import FrameConfig, ShadeConfig, stylized

LOOKS = ("stylized", "classic")


def studio_shade(sc: ShadeConfig) -> ShadeConfig:
    """Dark-background look: low-key light, crisp terminator, cavity shading, warm/cool grading.
    No outline against the background (a dark line on a dark backdrop only eats the silhouette);
    inner depth edges keep a soft one."""
    return stylized(sc, outline=min(sc.outline, 0.2), outline_silhouette=0.0, sky=(0.15, 0.15, 0.22))


def colossus_shade(sc: ShadeConfig) -> ShadeConfig:
    """Dusk plaza: the sky is bright, so keep the scene's own exposure (no low-key), keep the
    silhouette outline (it reads against the sky), no halo on the painted background."""
    return stylized(sc, low_key=False, exposure=sc.exposure * 0.85, glow=0.0, bloom=0.35, terminator=0.5,
                    ssao=0.45, contrast=0.22, tint_strength=0.15, saturation=1.05)


def clean(fc: FrameConfig) -> FrameConfig:
    """G-buffer clean-up for the no-blend (Almost Pixel Perfect) mode; blended frames need none."""
    if not fc.raster.hard:
        return fc
    return replace(fc, supersample=2, select="mean", despeckle=True, normal_smooth=0.6)


def upgrade(fc: FrameConfig, look: str = "stylized") -> FrameConfig:
    if look == "classic":
        return fc
    if look != "stylized":
        raise ValueError(f"unknown look {look!r}; choose from {LOOKS}")
    return replace(clean(fc), shade=studio_shade(fc.shade))

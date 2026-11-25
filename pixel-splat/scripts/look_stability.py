"""Measure shimmer of the "Almost Pixel Perfect" mode with and without the G-buffer clean-up
and the stylized look (adapted from snap_stability.py; same sub-pixel camera motions).

For every pair of consecutive frames:
  changed  = share of object pixels whose colour changed (sum |Δrgb| > 6/255, as in snap_stability)
  flicker  = share of object pixels that jump (sum |Δrgb| > 40/255) and are back to their old
             colour one frame later (A→B→A): pixels that pop, i.e. speckle that comes and goes.
             Smoothly moving texture changes pixels but rarely pops them back.
  mean |Δ| = average absolute colour change per object pixel and channel (0..255): how MUCH the
             picture changes, not how many pixels.  ``changed`` counts a 2-level drift of a smooth
             gradient the same as a pixel that flips from light to dark; this one does not.
Lower = steadier.  ``changed`` also grows with how much texture/contrast the image has, so
compare it between rows that share a look; ``flicker`` is the fairer number across looks.

  python scripts/look_stability.py out/nike/nike_splats.pt --extent 1.3 --target 0,-0.1,-0.2
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pixelsplat.camera import fit_radius_for_fov, orbit_camera  # noqa: E402
from pixelsplat.shade import (FrameConfig, ShadeConfig, clean_frame, postprocess,  # noqa: E402
                              render_gbuffer_frame, shade, stylized)
from pixelsplat.raster import RasterConfig  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402


def make_cam(i, motion, step, px, W, a):
    r = fit_radius_for_fov(30, a.extent)
    tgt = np.asarray(a.target, np.float64)
    if motion == "orbit":  # turntable: `step` degrees per frame
        return orbit_camera(a.az + i * step, 12, W, px, radius=r, target=tgt)
    pix_world = 2 * r * np.tan(np.radians(15)) / px
    right = np.array([np.cos(np.radians(a.az)), 0.0, -np.sin(np.radians(a.az))])
    return orbit_camera(a.az, 12, W, px, radius=r, target=tgt + right * i * step * pix_world)


def rates(frames, masks):
    q = [np.round(np.clip(f, 0, 1) * 255).astype(np.int16) for f in frames]
    ch, fl, en = [], [], []
    for i in range(len(q) - 1):
        obj = masks[i] | masks[i + 1]
        d1 = np.abs(q[i + 1] - q[i]).sum(-1)
        ch.append(((d1 > 6) & obj).sum() / max(obj.sum(), 1))
        en.append(d1[obj].mean() / 3 if obj.any() else 0.0)
        if i + 2 < len(q):
            back = np.abs(q[i + 2] - q[i]).sum(-1) <= 6
            fl.append(((d1 > 40) & back & obj).sum() / max(obj.sum(), 1))
    return float(np.mean(ch)), float(np.mean(fl)) if fl else float("nan"), float(np.mean(en))


def measure(model, a, base: ShadeConfig, log=print):
    """→ {(motion, row): (changed, flicker)} for the rows before / clean / clean+stylized."""
    W = int(a.px * a.aspect)
    raw = FrameConfig(raster=RasterConfig(tile=4, k=256, hard=True), shade=base, snap=True)
    cln = clean_frame(base)
    sty = stylized(base)
    out = {}
    for motion, step in (("pan", a.pan_step), ("orbit", a.orbit_step)):
        seq = {k: [] for k in ("before", "clean", "clean+stylized")}
        msk = {k: [] for k in seq}
        for i in range(a.frames):
            cam = make_cam(i, motion, step, a.px, W, a)
            g0 = render_gbuffer_frame(model, cam, raw)
            g1 = render_gbuffer_frame(model, cam, cln)
            for key, gb, sc in (("before", g0, base), ("clean", g1, base), ("clean+stylized", g1, sty)):
                seq[key].append(postprocess(shade(gb, cam, sc), gb, sc, cam))
                msk[key].append(gb["alpha"] > sc.alpha_threshold)
        for key in seq:
            out[(motion, key)] = rates(seq[key], msk[key])
            c, f, e = out[(motion, key)]
            log(f"{motion:5s} {key:15s} changed/frame {c:6.1%}   flicker {f:6.2%}   mean |Δ| {e:5.2f}/255")
        out[(motion, "frames")] = seq
    return out


def main():
    torch.set_num_threads(2)
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--px", type=int, default=128)
    ap.add_argument("--aspect", type=float, default=0.8)
    ap.add_argument("--frames", type=int, default=10)
    ap.add_argument("--az", type=float, default=20.0)
    ap.add_argument("--extent", type=float, default=1.15, help="half-height the camera frames")
    ap.add_argument("--target", type=lambda s: tuple(float(v) for v in s.split(",")), default=(0.0, 0.0, 0.0))
    ap.add_argument("--orbit-step", type=float, default=0.15, help="degrees of orbit per frame")
    ap.add_argument("--pan-step", type=float, default=0.13, help="pixels of pan per frame")
    a = ap.parse_args()
    measure(SplatModel.load(a.model), a, ShadeConfig(outline=0.3))


if __name__ == "__main__":
    main()

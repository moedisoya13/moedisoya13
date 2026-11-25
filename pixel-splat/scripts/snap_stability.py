"""Measure pixel shimmer ("pixel creep") with and without patch snapping.

Moves the camera by a tiny amount per frame (sub-pixel motion) and reports how
many object pixels change colour between consecutive frames.  Lower = steadier.

  python scripts/snap_stability.py out/demo/model.pt [--px 128] [--frames 24]
"""
import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pixelsplat.camera import fit_radius_for_fov, orbit_camera  # noqa: E402
from pixelsplat.shade import FrameConfig, render_frame  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402


def make_cam(i, motion, step, px, W):
    r = fit_radius_for_fov(30)
    if motion == "orbit":  # turntable: `step` degrees per frame
        return orbit_camera(20 + i * step, 12, W, px, radius=r)
    # pan: slide camera + target sideways by `step` pixels per frame (pure translation)
    pix_world = 2 * r * np.tan(np.radians(15)) / px
    right = np.array([np.cos(np.radians(20)), 0.0, -np.sin(np.radians(20))])
    return orbit_camera(20, 12, W, px, radius=r, target=right * i * step * pix_world)


def shimmer(model, px, frames, step, snap, mode, motion):
    W = int(px * 0.8)
    prev, rates = None, []
    for i in range(frames):
        cam = make_cam(i, motion, step, px, W)
        img = render_frame(model, cam, FrameConfig(snap=snap, mode=mode))
        q = np.round(img * 255).astype(np.int16)
        if prev is not None:
            obj = (np.abs(q - q[0, 0]).sum(-1) > 0) | (np.abs(prev - prev[0, 0]).sum(-1) > 0)
            changed = (np.abs(q - prev).sum(-1) > 6) & obj
            rates.append(changed.sum() / max(obj.sum(), 1))
        prev = q
    return float(np.mean(rates))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--px", type=int, default=128)
    ap.add_argument("--frames", type=int, default=24)
    ap.add_argument("--orbit-step", type=float, default=0.15, help="degrees of orbit per frame")
    ap.add_argument("--pan-step", type=float, default=0.13, help="pixels of pan per frame")
    a = ap.parse_args()
    m = SplatModel.load(a.model)
    for motion, step in (("orbit", a.orbit_step), ("pan", a.pan_step)):
        for mode in ("albedo", "lit"):
            off = shimmer(m, a.px, a.frames, step, False, mode, motion)
            on = shimmer(m, a.px, a.frames, step, True, mode, motion)
            print(f"{motion:5s} {mode:7s} changed pixels/frame: snap off {off:6.1%}   snap on {on:6.1%}")


if __name__ == "__main__":
    main()

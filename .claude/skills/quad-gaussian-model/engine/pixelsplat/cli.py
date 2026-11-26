"""Command line:  python -m pixelsplat <bake|render|demo> ...

  bake   : mesh (.glb/.gltf/.obj/...) or "demo" → trained splat model (.pt)
  render : model (.pt) → pixel-art turntable (GIF + MP4 + contact sheet + debug views)
  demo   : bake the built-in procedural knight and render it
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import time

import numpy as np
import torch
from PIL import Image

from .camera import fit_radius_for_fov, orbit_camera
from .mesh import load_mesh, make_demo_knight, normalize_parts
from .raster import RasterConfig
from .shade import FrameConfig, Light, ShadeConfig, render_frame, upscale
from .splats import SplatModel
from .train import TrainConfig, assign_patches, train


def _save_png(img, path):
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)


def cmd_bake(a):
    parts = make_demo_knight() if a.mesh == "demo" else load_mesh(a.mesh)
    parts = normalize_parts(parts, up_axis=a.up)
    print(f"[bake] {len(parts)} parts, {sum(len(p.faces) for p in parts)} triangles, "
          f"{sum(p.base_tex is not None for p in parts)} textured")
    cfg = TrainConfig(n_splats=a.splats, res=a.res, n_views=a.views, iters=a.iters, seed=a.seed)
    # check the cheap things BEFORE the (long) training, not after it
    if a.patches < 1:
        raise SystemExit(f"[bake] --patches must be at least 1 (got {a.patches})")
    patches = a.patches
    if patches > a.splats:
        print(f"[bake] warning: --patches {patches} > --splats {a.splats}; using {a.splats} patches")
        patches = a.splats
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    model = train(parts, cfg)
    torch.save(model.state_dict(), a.out)  # the training result is on disk before anything else can fail
    patches = min(patches, model.n)  # training may have pruned splats
    assign_patches(model, patches, seed=a.seed)
    torch.save(model.state_dict(), a.out)
    with open(os.path.splitext(a.out)[0] + ".json", "w") as f:
        json.dump({"source": a.mesh, "splats": model.n, "patches": patches, **vars(cfg)}, f, indent=1, default=str)
    print(f"[bake] saved {model.n} splats → {a.out}")
    return a.out


def _frame_cfg(a, mode="lit"):
    quad = dict(kernel_p=8.0, kernel_m=6.0) if a.quad else {}
    rc = RasterConfig(tile=4, k=256, hard=a.hard or a.app, **quad)
    sc = ShadeConfig(outline=a.outline, palette=a.palette, light_steps=a.light_steps, exposure=a.exposure)
    if a.light_follow:
        sc.lights = [Light((-0.6, 0.7, 0.8), (1.0, 0.93, 0.82), 3.2)]
    return FrameConfig(raster=rc, shade=sc, snap=a.snap or a.app, mode=mode)


def cmd_render(a):
    model = SplatModel.load(a.model)
    os.makedirs(a.out, exist_ok=True)
    fdir = os.path.join(a.out, "frames")
    shutil.rmtree(fdir, ignore_errors=True)
    os.makedirs(fdir)
    radius = fit_radius_for_fov(a.fov)
    W = int(round(a.px * a.aspect))
    frames, t0 = [], time.time()
    for i in range(a.frames):
        az = a.azimuth + 360.0 * i / a.frames
        cam = orbit_camera(az, a.elev, W, a.px, radius=radius, fov_deg=a.fov, ortho=a.ortho)
        img = render_frame(model, cam, _frame_cfg(a))
        big = upscale(img, a.scale)
        _save_png(big, os.path.join(fdir, f"{i:04d}.png"))
        frames.append(big)
    print(f"[render] {a.frames} frames {W}x{a.px}px in {time.time() - t0:.1f}s")
    ims = [Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)) for f in frames]
    gif = os.path.join(a.out, "turntable.gif")
    ims[0].save(gif, save_all=True, append_images=ims[1:], duration=int(1000 / a.fps), loop=0)
    mp4 = os.path.join(a.out, "turntable.mp4")
    if shutil.which("ffmpeg"):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i",
                        os.path.join(fdir, "%04d.png"), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", mp4], check=True)
    # contact sheet (8 evenly spaced frames) + debug views of the first frame
    pick = [frames[int(i * a.frames / 8)] for i in range(8)]
    sheet = np.concatenate([np.concatenate(pick[:4], 1), np.concatenate(pick[4:], 1)], 0)
    _save_png(sheet, os.path.join(a.out, "sheet.png"))
    cam = orbit_camera(a.azimuth, a.elev, W, a.px, radius=radius, fov_deg=a.fov, ortho=a.ortho)
    dbg = [render_frame(model, cam, _frame_cfg(a, m)) for m in ("lit", "albedo", "normal", "depth", "patches")]
    _save_png(upscale(np.concatenate(dbg, 1), max(1, a.scale // 2)), os.path.join(a.out, "gbuffer.png"))
    print(f"[render] wrote {gif}, {mp4}, sheet.png, gbuffer.png")


def main(argv=None):
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    ap = argparse.ArgumentParser(prog="pixelsplat", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def bake_args(p):
        p.add_argument("--splats", type=int, default=16000, help="number of quad splats")
        p.add_argument("--res", type=int, default=160, help="training resolution")
        p.add_argument("--views", type=int, default=48, help="ground-truth viewpoints")
        p.add_argument("--iters", type=int, default=1500, help="optimisation steps (0 = mesh init only)")
        p.add_argument("--patches", type=int, default=80, help="patches for --snap")
        p.add_argument("--up", choices=["y", "z"], default="y", help="model's up axis")
        p.add_argument("--seed", type=int, default=0)

    def render_args(p):
        p.add_argument("--px", type=int, default=128, help="pixel-art height in pixels")
        p.add_argument("--aspect", type=float, default=0.8, help="width / height")
        p.add_argument("--scale", type=int, default=6, help="nearest-neighbour upscale for output")
        p.add_argument("--frames", type=int, default=72)
        p.add_argument("--fps", type=int, default=24)
        p.add_argument("--elev", type=float, default=12.0, help="camera elevation (deg)")
        p.add_argument("--azimuth", type=float, default=20.0, help="start azimuth (deg)")
        p.add_argument("--fov", type=float, default=30.0)
        p.add_argument("--ortho", action="store_true", help="orthographic camera")
        p.add_argument("--snap", action="store_true", help="patch snapping to the pixel grid")
        p.add_argument("--app", action="store_true", help='"Almost Pixel Perfect" = --snap + --hard')
        p.add_argument("--quad", action="store_true", help="square hard-edged splat kernel")
        p.add_argument("--hard", action="store_true", help="no blending: front splat wins each pixel")
        p.add_argument("--outline", type=float, default=0.35, help="edge darkening 0..1")
        p.add_argument("--palette", type=int, default=0, help="quantize to N colours (0 = off)")
        p.add_argument("--light-steps", type=int, default=0, help="toon light bands (0 = smooth)")
        p.add_argument("--exposure", type=float, default=1.0)
        p.add_argument("--light-follow", action="store_true", help="single key light only")

    b = sub.add_parser("bake", help="mesh → splats")
    b.add_argument("mesh", help='mesh file or "demo"')
    b.add_argument("-o", "--out", default="out/model.pt")
    bake_args(b)
    r = sub.add_parser("render", help="splats → pixel-art turntable")
    r.add_argument("model")
    r.add_argument("-o", "--out", default="out/render")
    render_args(r)
    d = sub.add_parser("demo", help="bake + render the procedural knight")
    d.add_argument("-o", "--out", default="out/demo")
    bake_args(d)
    render_args(d)

    a = ap.parse_args(argv)
    if a.cmd == "bake":
        cmd_bake(a)
    elif a.cmd == "render":
        cmd_render(a)
    else:
        out_dir = a.out
        a.mesh, a.out = "demo", os.path.join(out_dir, "model.pt")
        model_path = cmd_bake(a)
        a.model, a.out = model_path, out_dir
        cmd_render(a)


if __name__ == "__main__":
    main()

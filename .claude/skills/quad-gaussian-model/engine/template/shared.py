"""Helpers every figure shares: single-bone patches for "Almost Pixel Perfect", image / clip writers,
and the studio lights.

Copied unchanged from the Nike example this engine grew out of (there: ``nike.bone_patches``,
``nike.save_png``, ``nike.save_anim``, ``nike.nike_shade`` - here ``studio_lights``, renamed so it is not
confused with ``look.studio_shade``, the stylized grading of the same studio), so the soldier template
does not need that example.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pixelsplat.shade import Light, ShadeConfig  # noqa: E402

GROUND = -1.0


def bone_patches(model, W: torch.Tensor, total: int = 80, seed: int = 0):
    """"Almost Pixel Perfect" patches that never straddle two bones.

    Splats are grouped by their dominant bone, then each group is split by
    k-means (patch count ∝ group size).  A patch therefore moves (almost)
    rigidly, so snapping it to the pixel grid keeps its pixels stable."""
    from sklearn.cluster import KMeans

    dom = W.argmax(1).numpy()
    X = model.means.detach().numpy()
    patch = np.zeros(len(X), np.int64)
    nxt = 0
    for b in np.unique(dom):
        idx = np.nonzero(dom == b)[0]
        k = int(max(1, min(len(idx), round(total * len(idx) / len(X)))))
        lab = KMeans(n_clusters=k, n_init=2, random_state=seed).fit_predict(X[idx]) if k > 1 else np.zeros(len(idx), int)
        patch[idx] = lab + nxt
        nxt += k
    model.patch = torch.as_tensor(patch)
    return nxt


def save_png(img, path):
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)


def save_anim(frames, out_dir, name, fps):
    ims = [Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)) for f in frames]
    ims[0].save(os.path.join(out_dir, name + ".gif"), save_all=True, append_images=ims[1:],
                duration=int(round(1000 / fps)), loop=0)
    if shutil.which("ffmpeg"):
        tmp = os.path.join(out_dir, "_frames_" + name)
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp)
        for i, im in enumerate(ims):
            im.save(os.path.join(tmp, f"{i:04d}.png"))
        # loop the clip 3x in the mp4 so short cycles are watchable
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "2", "-framerate", str(fps), "-i",
                        os.path.join(tmp, "%04d.png"), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-crf", "15", os.path.join(out_dir, name + ".mp4")], check=True)
        shutil.rmtree(tmp)


def studio_lights(key=(-0.55, 0.75, 0.75), rim=(0.85, 0.35, -0.6), **kw):
    sc = ShadeConfig(
        lights=[Light(key, (1.0, 0.92, 0.80), 3.0),  # warm key (default: front-left, above)
                Light(rim, (0.55, 0.65, 1.0), 1.5)],  # cool rim from behind
        sky=(0.16, 0.18, 0.26), ground=(0.05, 0.045, 0.05), outline=0.3, ground_y=GROUND,
        shadow_radius=(0.30, 0.22), **kw)
    return sc

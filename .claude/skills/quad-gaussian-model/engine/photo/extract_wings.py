"""Cut Nike's two wings out of side-view photographs and store them as ``wings.npz``.

    python photo/extract_wings.py --left LEFT.jpg --right RIGHT.jpg [--debug DIR]

The photographs are NOT part of the repository (licences); only the small derived outline / relief
images are.  Sources used for the committed ``wings.npz``:

  left wing  (original marble)        a left-side view of the statue, figure facing screen-left,
                                      1750x2576 px scan supplied by the user (f271040d-image.jpg)
  right wing (1880s plaster rebuild)  Wikimedia Commons, "Louvre Victoire de Samothrace (Winged
                                      Victory) (9811957165).jpg", 2444x3439 px - a right-side view,
                                      figure facing screen-right, left wing hidden behind the right

How a photograph becomes geometry
  1. segment the statue from the pale wall (brightness / colour threshold), keep only what lies in a
     hand-drawn region around the wing whose border crosses the statue at the shoulder (root cut);
  2. register the photo to the model with body landmarks visible in the same photo: the top of the
     neck break (model y = 0.64) and the sole / plinth top (model y = -1) fix the scale and height, the
     neck fixes front/back; the camera looks from the side and from below by ``elev`` degrees from
     ``dist`` body units away;
  3. for every point (z, y) of the wing sheet (wings.sheet_x gives its x) look up the photo pixel it
     projects to -> silhouette mask and feather relief in the model's side plane.  Because the sheet
     moves away from the body toward the tip, this also undoes the "seen from below" shift.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wings  # noqa: E402

NECK = (0.0, 0.64, 0.06)  # model point of the neck-break landmark
# CAMERAS: neither photo records where it was taken from.  Both show the far wing completely hidden
# behind the statue, so the azimuth / elevation below were picked (grid search) as the pair for which
# the wing built from the *other* photo hides best: about 84 deg from the front, about 6 deg below.
# They are estimates - a few degrees either way moves a wing tip by a few hundredths of a unit.
H = 0.004                 # side-plane texel (model units)
Z_RANGE, Y_RANGE = (-1.42, 0.10), (-0.02, 1.16)
ROOT_IN = 0.09            # how far the root is continued into the body

WINGS = {
    "L": dict(
        s=1, source="user-supplied left-side photo f271040d-image.jpg (1750x2576)",
        neck_px=(680, 492), sole_y=1955,   # landmarks read off the photo (pixels)
        azim=84.0, elev=6.0, dist=10.0,    # camera: her left, a little in front of side-on and below (see CAMERAS)
        dz=0.04,                           # depth nudge that seats the root on the model's (more upright) back
        seg=("lum", 0.56),                 # statue = darker than the wall
        keep=[(742, 512), (790, 440), (1100, 270), (1700, 270), (1700, 780), (1150, 780), (1000, 905),
              (880, 905), (848, 846), (835, 838), (815, 800), (790, 700), (765, 600)],
        add=[dict(poly=[(742, 500), (1010, 395), (1030, 425), (760, 548)], rule=("grow", 9))],  # sky-lit top rim
    ),
    "R": dict(
        s=-1, source="Commons: Louvre Victoire de Samothrace (Winged Victory) (9811957165).jpg (2444x3439)",
        neck_px=(1300, 572), sole_y=1955,
        azim=-84.0, elev=6.0, dist=7.2,    # 39 mm lens on APS-C, statue 1383 px tall -> about 10.8 m away
        dz=0.04,
        seg=("sat", 0.33),                 # statue = more saturated than the wall
        keep=[(1212, 540), (1150, 470), (900, 280), (200, 280), (200, 760), (700, 760), (860, 900),
              (1040, 915), (1069, 895), (1088, 822), (1115, 752), (1139, 683), (1177, 613)],
        # the sunlit top edge next to the shoulder is blown out to the wall's colour: grow the mask 20 px there
        add=[dict(poly=[(740, 290), (1215, 480), (1215, 620), (740, 430)], rule=("grow", 20))],
    ),
}


def poly_mask(shape, poly):
    im = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([tuple(q) for q in poly], fill=1)
    return np.asarray(im).astype(bool)


def rule_mask(a, rule, statue=None):
    kind, thr = rule
    lum = a.mean(-1)
    if kind == "grow":
        return ndi.binary_dilation(statue, iterations=int(thr))
    if kind == "lum":
        return lum < thr
    if kind == "sat":
        return (a.max(-1) - a.min(-1)) / (a.max(-1) + 1e-6) > thr
    raise ValueError(kind)


def segment(a, cfg):
    sm = ndi.gaussian_filter(a, (2, 2, 0))
    statue = rule_mask(sm, cfg["seg"])
    statue = ndi.binary_closing(ndi.binary_opening(statue, iterations=2), iterations=4)
    lab, n = ndi.label(statue)
    statue = lab == (1 + int(np.argmax(ndi.sum(statue, lab, range(1, n + 1)))))
    statue = ndi.binary_fill_holes(statue)
    m = statue & poly_mask(statue.shape, cfg["keep"])
    for extra in cfg.get("add", []):
        m |= rule_mask(sm, extra["rule"], statue) & poly_mask(statue.shape, extra["poly"])
    m = ndi.binary_closing(m, iterations=3)
    lab, n = ndi.label(m)
    m = lab == (1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1)))))
    return ndi.binary_fill_holes(m), statue


def feather_relief(lum, mk, seed=3):
    """Feather relief in the side plane, ~[-1, 1], from the photo's (log) brightness ``lum``.

    A dark, grainy or soft photo does not give usable height from brightness alone, but the *direction*
    its feathers run in is robust: the structure tensor of the brightness gives that direction at every
    point, noise smeared along it (line integral convolution) gives ridges and grooves that follow the
    photographed feathers - long quills streaming to the tip, the fan hanging by the body - and the
    band-passed brightness itself is added on top for the larger light/dark feather rows."""
    mf = mk.astype(float)

    def nb(x, sig):  # blur that ignores everything outside the wing
        return ndi.gaussian_filter(x * mf, sig) / np.maximum(ndi.gaussian_filter(mf, sig), 1e-3)

    gy, gx = np.gradient(nb(lum, 1.0))
    jxx, jxy, jyy = nb(gx * gx, 9), nb(gx * gy, 9), nb(gy * gy, 9)
    th = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2  # along the streaks
    vx, vy = np.cos(th), np.sin(th)
    noise = ndi.gaussian_filter(np.random.default_rng(seed).standard_normal(lum.shape), 1.7)
    yy, xx = np.mgrid[0:lum.shape[0], 0:lum.shape[1]].astype(float)
    acc, n = noise.copy(), 1
    for sgn in (1, -1):
        px, py, dx, dy = xx.copy(), yy.copy(), vx * sgn, vy * sgn
        for _ in range(18):
            ux = ndi.map_coordinates(vx, [py, px], order=1, mode="nearest")
            uy = ndi.map_coordinates(vy, [py, px], order=1, mode="nearest")
            flip = np.where(ux * dx + uy * dy < 0, -1.0, 1.0)  # a direction has no sign: keep going the same way
            dx, dy = ux * flip, uy * flip
            px += dx
            py += dy
            acc += ndi.map_coordinates(noise, [py, px], order=1, mode="nearest")
            n += 1
    streak = acc / n
    streak /= 2.0 * streak[mk].std()
    band = nb(lum, 2.0) - nb(lum, 9.0)
    band /= 2.2 * band[mk].std()
    return np.clip(0.75 * streak + 0.5 * band, -1, 1) * mk


def camera(cfg):
    """Distant camera aimed at the neck landmark: model point -> photo pixel."""
    phi, e = math.radians(cfg["azim"]), math.radians(cfg["elev"])
    toward = np.array([math.sin(phi) * math.cos(e), -math.sin(e), math.cos(phi) * math.cos(e)])  # statue -> camera
    right = np.array([math.cos(phi), 0.0, -math.sin(phi)])
    up = np.array([math.sin(phi) * math.sin(e), math.cos(e), math.cos(phi) * math.sin(e)])
    scale = (cfg["sole_y"] - cfg["neck_px"][1]) / ((NECK[1] + 1.0) * math.cos(e))  # px per model unit at the neck
    p0 = np.array(NECK) + (0, 0, cfg["dz"])

    def project(P):
        d = P - p0
        k = scale / (1.0 - (d @ toward) / cfg["dist"])  # nearer to the camera = larger
        return cfg["neck_px"][0] + k * (d @ right), cfg["neck_px"][1] - k * (d @ up)

    return project, scale


def extract(path, cfg, debug=None, tag=""):
    a = np.asarray(ImageOps.exif_transpose(Image.open(path)).convert("RGB"), np.float32) / 255
    m, statue = segment(a, cfg)
    project, scale = camera(cfg)
    s = cfg["s"]
    zs = np.arange(Z_RANGE[0], Z_RANGE[1] + 1e-6, H)
    ys = np.arange(Y_RANGE[0], Y_RANGE[1] + 1e-6, H)
    zz, yy = np.meshgrid(zs, ys)
    P = np.stack([wings.sheet_x(s, zz, yy), yy, zz], -1)
    px, py = project(P)
    soft = ndi.gaussian_filter(m.astype(np.float32), 0.35 * H * scale)  # anti-aliased down-sampling
    mk = ndi.map_coordinates(soft, [py, px], order=1, mode="constant") > 0.5
    lab, n = ndi.label(mk)
    mk = lab == (1 + int(np.argmax(ndi.sum(mk, lab, range(1, n + 1)))))
    # the sharp corner where the cut meets the top edge would stick up beside the neck: round it off
    yy_, zz_ = np.mgrid[-7:8, -7:8]
    opened = ndi.binary_opening(mk, structure=(yy_ ** 2 + zz_ ** 2) <= 49)
    corner = (zz > -0.22) & (yy > 0.55)
    mk = np.where(corner, opened, mk)
    # the photo cannot show where the wing disappears into the back: carry the root edge ROOT_IN further
    # forward at shoulder-blade height so the sheet sinks into the model's back instead of ending in a cut
    front = len(zs) - 1 - np.argmax(mk[:, ::-1], 1)
    for i in np.nonzero(mk.any(1) & (ys > 0.34) & (ys < 0.58))[0]:  # between waist and shoulder top
        t = min((ys[i] - 0.34) / 0.07, (0.58 - ys[i]) / 0.05, 1.0)
        stop = min(front[i] + int(round(ROOT_IN * t * t * (3 - 2 * t) / H)), int((0.02 - zs[0]) / H))
        mk[i, front[i]:max(stop, front[i])] = True  # ... but never past the middle of the shoulder
    sdf = (ndi.distance_transform_edt(~mk) - ndi.distance_transform_edt(mk)) * H
    sdf = ndi.gaussian_filter(sdf, 0.8)
    lum = np.log(np.clip(a.mean(-1), 0.02, 1))
    lum = ndi.map_coordinates(ndi.gaussian_filter(lum, 0.35 * H * scale), [py, px], order=1, mode="nearest")
    relief = ndi.gaussian_filter(feather_relief(lum, mk), 0.8)
    # distance below the leading (upper) edge, column by column
    top = np.where(mk.any(0), ys[::-1][np.argmax(mk[::-1], 0)], np.nan)
    cols = np.nonzero(mk.any(0))[0]
    top = np.interp(np.arange(len(zs)), cols, top[cols])
    top = ndi.maximum_filter1d(ndi.gaussian_filter1d(top, 3), 5)
    lead = np.clip(top[None, :] - yy, 0, 1)
    # leading-edge polyline root -> tip (used as the wing bone and flap axis)
    z_tip, z_root = zs[cols.min()], wings.ROOT[s][2]
    frame = [np.array(wings.ROOT[s])]
    for f in (0.25, 0.5, 0.75):
        z = z_root + f * (z_tip - z_root)
        y = float(np.interp(z, zs, top)) - 0.05
        frame.append(np.array([wings.sheet_x(s, z, y), y, z]))
    zt = z_tip + 0.03
    col = mk[:, int(round((zt - zs[0]) / H))]
    yt = float(ys[col].mean())
    frame.append(np.array([wings.sheet_x(s, zt, yt), yt, zt]))
    if debug:
        o = (a * 255).astype(np.uint8)
        edge = m ^ ndi.binary_erosion(m, iterations=2)
        o[edge] = (0, 255, 0)
        im = Image.fromarray(o)
        d = ImageDraw.Draw(im)
        d.line([tuple(q) for q in cfg["keep"]] + [tuple(cfg["keep"][0])], fill=(255, 0, 255), width=2)
        x, y = cfg["neck_px"]
        d.ellipse((x - 8, y - 8, x + 8, y + 8), outline=(255, 0, 0), width=3)
        d.line((x - 200, cfg["sole_y"], x + 500, cfg["sole_y"]), fill=(255, 0, 0), width=3)
        bb = np.argwhere(m)
        (y0, x0), (y1, x1) = bb.min(0) - 60, bb.max(0) + 60
        im.crop((max(x0, 0), max(y0, 0), x1, y1)).save(os.path.join(debug, f"seg{tag}.jpg"), quality=90)
        chart = np.where(mk, 0.5 + 0.5 * relief, 0.0)[::-1]
        Image.fromarray((np.clip(chart, 0, 1) * 255).astype(np.uint8)).save(os.path.join(debug, f"chart{tag}.png"))
    meta = {k: cfg[k] for k in ("source", "neck_px", "sole_y", "azim", "elev", "dist", "dz")}
    meta["px_per_unit"] = round(scale, 1)
    return dict(sdf=sdf.astype(np.float16), relief=np.round(np.clip(relief, -1, 1) * 127).astype(np.int8),
                lead=lead.astype(np.float16), grid=np.array([zs[0], ys[0], H], np.float64),
                frame=np.stack(frame).astype(np.float32)), meta


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--left", required=True, help="left-side photo (left wing)")
    ap.add_argument("--right", required=True, help="right-side photo (right wing)")
    ap.add_argument("--out", default=str(wings.DATA))
    ap.add_argument("--debug", help="directory for segmentation / chart previews")
    ap.add_argument("--set", action="append", default=[], help="override, e.g. L.elev=15")
    a = ap.parse_args()
    for kv in a.set:
        k, v = kv.split("=")
        side, key = k.split(".")
        WINGS[side][key] = float(v)
    if a.debug:
        os.makedirs(a.debug, exist_ok=True)
    out, meta = {}, {}
    for side, path in (("L", a.left), ("R", a.right)):
        data, meta[side] = extract(path, WINGS[side], a.debug, side)
        out.update({k + side: v for k, v in data.items()})
        print(f"[wings] {side}: {meta[side]['px_per_unit']} px/unit, frame\n{np.round(data['frame'], 3)}")
    meta["sheet"] = {("L" if s > 0 else "R"): wings.SHEET[s] for s in (1, -1)}
    np.savez_compressed(a.out, meta=json.dumps(meta), **out)
    print("[wings] wrote", a.out, os.path.getsize(a.out) // 1024, "kB")


if __name__ == "__main__":
    main()

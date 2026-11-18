"""Turn a generated video of one character on a flat chroma background into an animation strip.

  python3 tools/anim/extract.py VIDEO --char hero --clip move_side --char-h 192 [options]

Steps: decode frames -> key out the background -> (loop clips) find the cleanest cycle ->
sample N frames -> crop to the union box -> scale so the standing character is --char-h px tall
-> write assets/anim/<char>/<clip>.webp and update assets/anim/manifest.json.

Options
  --frames N        frames in the strip (default 16)
  --fps F           playback fps written to the manifest (default: N / cycle seconds)
  --loop / --once   loop clip (find a cycle) or one-shot (use --range)
  --range A:B       source frame range to use (seconds, e.g. 1.2:2.4); for --loop it bounds the search
  --period A:B      allowed cycle length in seconds for the search (default 0.45:1.4)
  --cycles K        the picked cycle spans K repetitions of the shortest match (default 1)
  --key auto|green|magenta
  --strike I        attack clips: strip frame index where the hit lands (written to the manifest)
  --sheet PATH      also write a contact sheet PNG for review
  --dry             don't write assets, only the sheet
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def decode(video):
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    cap.release()
    return frames, fps


def key_frame(rgb, bg):
    """Return RGBA with the chroma background removed and its spill suppressed."""
    f = rgb.astype(np.float32)
    d = np.sqrt(((f - bg) ** 2).sum(-1))
    # chroma-aware: a pixel is background-like when its dominant channel matches the key's
    k = int(np.argmax(bg))
    others = [c for c in range(3) if c != k]
    if bg[others].max() < 90:  # green screen
        dom = f[..., k] - np.maximum(f[..., others[0]], f[..., others[1]])
        a = 1.0 - np.clip((dom - 18) / 55.0, 0, 1)
    else:  # magenta: two high channels
        lo = int(np.argmin(bg))
        dom = np.minimum(f[..., (lo + 1) % 3], f[..., (lo + 2) % 3]) - f[..., lo]
        a = 1.0 - np.clip((dom - 30) / 70.0, 0, 1)
    a = np.where(d < 38, 0, a)
    solid = a > 0.5
    # keep the main body and anything near it; drop stray specks
    lab, n = nd.label(nd.binary_dilation(solid, iterations=6))
    if n > 1:
        sizes = nd.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, np.where(sizes >= max(60, sizes.max() * 0.02))[0] + 1)
        a = np.where(keep, a, 0)
    a = nd.gaussian_filter(a, 0.6)
    a = np.clip((a - 0.15) / 0.7, 0, 1)
    out = f.copy()
    # despill on the edge band
    edge = (a > 0) & (a < 1)
    if bg[others].max() < 90:
        lim = np.maximum(out[..., others[0]], out[..., others[1]])
        out[..., k] = np.where(edge | (out[..., k] > lim + 25), np.minimum(out[..., k], lim), out[..., k])
    else:
        lo = int(np.argmin(bg)); hi = [(lo + 1) % 3, (lo + 2) % 3]
        m = out[..., lo]
        for c in hi:
            out[..., c] = np.where(edge, np.minimum(out[..., c], m + 30), out[..., c])
    return np.dstack([np.clip(out, 0, 255), a * 255]).astype(np.uint8)


def feature(rgba):
    small = cv2.resize(rgba, (64, 36), interpolation=cv2.INTER_AREA).astype(np.float32)
    a = small[..., 3:4] / 255.0
    return np.concatenate([(small[..., :3] * a).ravel() / 255.0, a.ravel() * 2])


def find_cycle(feats, fps, lo_s, hi_s, a0, a1, cycles):
    lo, hi = max(3, int(lo_s * fps)), int(hi_s * fps)
    best = None
    for i in range(a0, a1):
        for p in range(lo, hi + 1):
            j = i + p * cycles
            if j + 2 >= a1:
                break
            # same pose and same direction of motion at both ends
            e = np.abs(feats[i] - feats[j]).mean() + np.abs(feats[i + 1] - feats[j + 1]).mean() \
                + 0.5 * np.abs(feats[i + 2] - feats[j + 2]).mean()
            # a cycle must actually move: reject near-static stretches
            mid = np.abs(feats[i] - feats[i + (j - i) // 2]).mean()
            score = e / (mid + 1e-4)
            if best is None or score < best[0]:
                best = (score, i, j, e, mid)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('--char', required=True); ap.add_argument('--clip', required=True)
    ap.add_argument('--char-h', type=int, required=True)
    ap.add_argument('--frames', type=int, default=16); ap.add_argument('--fps', type=float, default=0)
    ap.add_argument('--loop', dest='loop', action='store_true', default=True); ap.add_argument('--once', dest='loop', action='store_false')
    ap.add_argument('--range', default=''); ap.add_argument('--period', default='0.45:1.4'); ap.add_argument('--cycles', type=int, default=1)
    ap.add_argument('--key', default='auto'); ap.add_argument('--sheet', default=''); ap.add_argument('--dry', action='store_true')
    ap.add_argument('--strike', type=int, default=-1, help='frame index (in the strip) where the hit lands; attack clips')
    ap.add_argument('--stand', type=int, default=0, help='source frame index used to measure the standing height')
    o = ap.parse_args()

    frames, fps = decode(o.video)
    n = len(frames)
    if not n:
        sys.exit('no frames decoded')
    h, w = frames[0].shape[:2]
    corners = np.concatenate([frames[0][:12, :12].reshape(-1, 3), frames[0][:12, -12:].reshape(-1, 3),
                              frames[0][-12:, :12].reshape(-1, 3), frames[0][-12:, -12:].reshape(-1, 3)])
    bg = np.median(corners, axis=0).astype(np.float32)
    print(f'{n} frames {w}x{h} @ {fps:.2f} fps, key {bg.astype(int).tolist()}')

    keyed = [key_frame(f, bg) for f in frames]
    a0, a1 = 0, n
    if o.range:
        s, e = o.range.split(':'); a0, a1 = int(float(s) * fps), min(n, int(float(e) * fps))

    if o.loop:
        feats = [feature(k) for k in keyed]
        lo_s, hi_s = map(float, o.period.split(':'))
        best = find_cycle(feats, fps, lo_s, hi_s, a0, a1, o.cycles)
        if not best:
            sys.exit('no cycle found')
        score, i, j, e, mid = best
        print(f'cycle: frames {i}..{j} ({(j - i) / fps:.2f} s), end mismatch {e:.4f}, motion {mid:.4f}, score {score:.3f}')
        idx = [i + round(k * (j - i) / o.frames) for k in range(o.frames)]
        seconds = (j - i) / fps
    else:
        idx = [a0 + round(k * (a1 - 1 - a0) / (o.frames - 1)) for k in range(o.frames)]
        seconds = (a1 - a0) / fps
    sel = [keyed[k] for k in idx]

    # standing height from the reference frame
    sa = keyed[o.stand][..., 3] > 128
    ys = np.where(sa.any(1))[0]; stand_h = ys.max() - ys.min() + 1
    scale = o.char_h / stand_h
    # union box
    union = np.zeros((h, w), bool)
    for s in sel:
        union |= s[..., 3] > 24
    ys = np.where(union.any(1))[0]; xs = np.where(union.any(0))[0]
    pad = 6
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad + 1)
    # anchor: feet = bottom of the standing reference, x = body centre of the reference
    rs = np.where(sa.any(0))[0]
    ax_src = (rs.min() + rs.max()) / 2.0
    ay_src = np.where(sa.any(1))[0].max() + 1
    fw, fh = round((x1 - x0) * scale), round((y1 - y0) * scale)
    strip = Image.new('RGBA', (fw * len(sel), fh), (0, 0, 0, 0))
    for k, s in enumerate(sel):
        im = Image.fromarray(s[y0:y1, x0:x1], 'RGBA').resize((fw, fh), Image.LANCZOS)
        strip.paste(im, (k * fw, 0))
    anchor = [round((ax_src - x0) * scale), round((ay_src - y0) * scale)]
    fps_out = o.fps or round(len(sel) / seconds, 2)
    print(f'strip {fw}x{fh} x {len(sel)}, anchor {anchor}, charH {o.char_h}, fps {fps_out}')

    if o.sheet:
        cols = min(8, len(sel)); rows = (len(sel) + cols - 1) // cols
        sheet = Image.new('RGBA', (cols * fw, rows * fh), (70, 74, 110, 255))
        for k in range(len(sel)):
            sheet.alpha_composite(strip.crop((k * fw, 0, (k + 1) * fw, fh)), ((k % cols) * fw, (k // cols) * fh))
        sheet.convert('RGB').save(o.sheet)
    if o.dry:
        return
    out_dir = os.path.join(ROOT, 'assets', 'anim', o.char)
    os.makedirs(out_dir, exist_ok=True)
    rel = f'{o.char}/{o.clip}.webp'
    strip.save(os.path.join(ROOT, 'assets', 'anim', rel), 'WEBP', quality=84, method=6)
    mf = os.path.join(ROOT, 'assets', 'anim', 'manifest.json')
    m = json.load(open(mf)) if os.path.exists(mf) else {}
    m.setdefault(o.char, {})[o.clip] = {'file': rel, 'frames': len(sel), 'fw': fw, 'fh': fh, 'fps': fps_out,
                                        'loop': bool(o.loop), 'anchor': anchor, 'charH': o.char_h}
    if o.strike >= 0:
        m[o.char][o.clip]['strike'] = o.strike
    json.dump(m, open(mf, 'w'), indent=1)
    print('wrote', rel, os.path.getsize(os.path.join(ROOT, 'assets', 'anim', rel)) // 1024, 'KB')


if __name__ == '__main__':
    main()

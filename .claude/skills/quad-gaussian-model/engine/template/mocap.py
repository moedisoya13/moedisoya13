"""Motion capture for the soldier: video -> pose landmarks -> rig motion -> render.

    python template/mocap.py capture  run.mp4 -o out/mocap/run          # MediaPipe: 33 landmarks per frame
    python template/mocap.py retarget -o out/mocap/run                   # -> clip.npz + retarget.json
    python template/mocap.py render   -o out/mocap/run --model out/soldier_final --views side,front
    python template/mocap.py render   -o out/mocap/run --model out/soldier_final --compare run.mp4

Every step leaves files in the output folder and the next step reads them:

    capture.npz    world / image landmarks, visibility, camera motion, fps        (capture, synth)
    capture.json   video name, frame range, model file + sha256, detection gaps
    clip.npz       the motion on the soldier's rig (see clip.py)                   (retarget)
    retarget.json  what the retarget did: cleaning, contacts, flights, joint limits, foot slip
    truth.npz      synthetic motions only: the motion the landmarks were made from (synth)
    evaluate.json  synthetic only: retargeted clip against the truth              (evaluate)
    frames_<view>/ rendered frames, one PNG each (rendering can be interrupted and resumed)
    <view>.gif/.mp4, compare.gif/.mp4                                              (render)

Without a video:  ``synth run|walk|jump`` writes a capture made from a known soldier motion (the same
format, optionally with noise), so retarget and render can be tried and measured:

    python template/mocap.py synth run -o out/mocap/synth_run --course 90
    python template/mocap.py retarget -o out/mocap/synth_run
    python template/mocap.py evaluate -o out/mocap/synth_run

Only ``capture`` needs MediaPipe and OpenCV (requirements-mocap.txt).  The original video is read, never
copied: nothing of it goes into the repository (out/ is not tracked).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(HERE))
import clip as clip_mod  # noqa: E402
import retarget as rt  # noqa: E402
import rig  # noqa: E402
from clip import Clip, Player  # noqa: E402

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_{kind}/float16/latest/"
             "pose_landmarker_{kind}.task")
MODEL_DIR = PROJECT / "out" / "models"
H, GROUND = rig.H, rig.GROUND


def _json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, default=clip_mod._jsonable)


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def code_version() -> str:
    try:
        rev = subprocess.run(["git", "-C", str(PROJECT), "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                             timeout=10).stdout.strip()
    except Exception:  # noqa: BLE001  (no git: the version string alone)
        rev = ""
    return rt.VERSION + ("+" + rev if rev else "")


def load_capture(out: str) -> dict:
    z = np.load(os.path.join(out, "capture.npz"), allow_pickle=False)
    cap = {k: z[k] for k in z.files if k != "meta"}
    cap["fps"] = float(cap["fps"])
    cap["meta"] = json.loads(str(z["meta"])) if "meta" in z.files else {}
    return cap


def save_capture(out: str, cap: dict):
    os.makedirs(out, exist_ok=True)
    arrays = {k: np.asarray(v) for k, v in cap.items() if k != "meta"}
    np.savez_compressed(os.path.join(out, "capture.npz"), meta=np.array(json.dumps(cap.get("meta", {}), ensure_ascii=False,
                                                                                    default=clip_mod._jsonable)), **arrays)
    _json(os.path.join(out, "capture.json"), cap.get("meta", {}))


# ---------------------------------------------------------------- capture (MediaPipe)
def ensure_model(kind: str = "heavy") -> Tuple[str, dict]:
    """Path of the pose landmarker model, downloaded once into out/models/ (not tracked by git);
    size and sha256 are written next to it."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    path = MODEL_DIR / f"pose_landmarker_{kind}.task"
    info_path = MODEL_DIR / f"pose_landmarker_{kind}.json"
    if not path.exists():
        import urllib.request
        url = MODEL_URL.format(kind=kind)
        print(f"[capture] downloading {url}")
        tmp = str(path) + ".part"
        with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(tmp, path)
    info = dict(file=path.name, url=MODEL_URL.format(kind=kind), bytes=path.stat().st_size, sha256=sha256(path))
    if not info_path.exists() or json.loads(info_path.read_text()).get("sha256") != info["sha256"]:
        _json(info_path, info)
    return str(path), info


def make_landmarker(model_path: str, poses: int = 2, min_conf: float = 0.5):
    """MediaPipe PoseLandmarker in VIDEO mode (it tracks from frame to frame)."""
    try:
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
    except ImportError as e:
        raise SystemExit("capture needs MediaPipe:  uv pip install -r requirements-mocap.txt   (" + str(e) + ")")
    opt = vision.PoseLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=model_path),
                                       running_mode=vision.RunningMode.VIDEO, num_poses=poses,
                                       min_pose_detection_confidence=min_conf, min_pose_presence_confidence=min_conf,
                                       min_tracking_confidence=min_conf)
    try:
        return mp, vision.PoseLandmarker.create_from_options(opt)
    except OSError as e:
        raise SystemExit(f"MediaPipe could not load its library: {e}\n"
                         "It needs the system libraries libEGL.so.1 and libGLESv2.so.2 "
                         "(Debian/Ubuntu:  apt-get install -y libegl1 libgles2).")


def pick_person(cands: List[np.ndarray], prev: Optional[np.ndarray], how: str) -> int:
    """Which of the detected people to follow.  cands: image landmarks (33, 3+) of each.  With a previous
    choice: the nearest one (hip centre).  First time: the largest / most central / leftmost / rightmost."""
    hips = [0.5 * (c[rt.IDX["left_hip"], :2] + c[rt.IDX["right_hip"], :2]) for c in cands]
    if prev is not None:
        return int(np.argmin([np.linalg.norm(h - prev) for h in hips]))
    if how == "center":
        return int(np.argmin([np.linalg.norm(h - 0.5) for h in hips]))
    if how in ("left", "right"):
        xs = [h[0] for h in hips]
        return int(np.argmin(xs) if how == "left" else np.argmax(xs))
    area = [np.ptp(c[:, 0]) * np.ptp(c[:, 1]) for c in cands]
    return int(np.argmax(area))


class Stabilizer:
    """Follows the BACKGROUND from frame to frame (corner features outside the person's box, tracked by
    optical flow, fitted with shift + zoom + roll), so a panning or zooming camera can be undone:
    ``matrix`` maps pixels of the current frame to pixels of the first frame."""

    def __init__(self):
        self.prev = None
        self.matrix = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
        self.tracked = 0

    def update(self, gray: np.ndarray, box: Optional[Tuple[float, float, float, float]] = None) -> np.ndarray:
        import cv2
        if self.prev is not None:
            mask = np.full(gray.shape, 255, np.uint8)
            if box is not None:
                h, w = gray.shape
                x0, y0, x1, y1 = box
                mx, my = 0.15 * (x1 - x0) + 8, 0.10 * (y1 - y0) + 8
                mask[max(int(y0 - my), 0):min(int(y1 + my), h), max(int(x0 - mx), 0):min(int(x1 + mx), w)] = 0
            p0 = cv2.goodFeaturesToTrack(self.prev, maxCorners=300, qualityLevel=0.01, minDistance=12, mask=mask)
            M = None
            if p0 is not None and len(p0) >= 8:
                p1, st, _ = cv2.calcOpticalFlowPyrLK(self.prev, gray, p0, None)
                ok = st[:, 0] == 1
                self.tracked = int(ok.sum())
                if ok.sum() >= 8:
                    M, _ = cv2.estimateAffinePartial2D(p1[ok], p0[ok], method=cv2.RANSAC, ransacReprojThreshold=2.0)
            if M is not None:  # current -> previous, then previous -> first
                A = np.vstack([self.matrix, [0, 0, 1]]) @ np.vstack([M, [0, 0, 1]])
                self.matrix = A[:2]
        self.prev = gray
        return self.matrix.copy()


def cmd_capture(a):
    try:
        import cv2
    except ImportError as e:
        raise SystemExit("capture needs OpenCV:  uv pip install -r requirements-mocap.txt   (" + str(e) + ")")
    video = a.video
    if not os.path.exists(video):
        raise SystemExit(f"no such video: {video}")
    out = a.out or str(PROJECT / "out" / "mocap" / Path(video).stem)
    os.makedirs(out, exist_ok=True)
    model_path, model_info = ensure_model(a.model)
    mp, landmarker = make_landmarker(model_path, a.poses, a.min_confidence)
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f"cannot open {video}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    W, Hh = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    f0 = int(round(a.start * fps))
    f1 = min(int(round(a.end * fps)) if a.end else total, total) if total > 0 else (int(round(a.end * fps)) if a.end else 10 ** 9)
    if f0 > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    world, image, vis, pres, det, idx, cams, others = [], [], [], [], [], [], [], []
    stab = Stabilizer() if a.stabilize else None
    prev_hip, box = None, None
    t0 = time.time()
    i = f0
    while i < f1:
        ok, frame = cap.read()
        if not ok:
            break
        if (i - f0) % a.every == 0:
            rgb = np.ascontiguousarray(frame[:, :, ::-1])
            res = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(round(1000.0 * i / fps)))
            n = len(res.pose_landmarks)
            w = np.full((33, 3), np.nan, np.float32)
            im = np.full((33, 3), np.nan, np.float32)
            v, p = np.zeros(33, np.float32), np.zeros(33, np.float32)
            if n:
                cands = [np.array([[l.x, l.y, l.z] for l in pl], np.float32) for pl in res.pose_landmarks]
                k = pick_person(cands, prev_hip, a.select)
                im = cands[k]
                w = np.array([[l.x, l.y, l.z] for l in res.pose_world_landmarks[k]], np.float32)
                v = np.array([l.visibility if l.visibility is not None else 1.0 for l in res.pose_landmarks[k]], np.float32)
                p = np.array([l.presence if l.presence is not None else 1.0 for l in res.pose_landmarks[k]], np.float32)
                prev_hip = 0.5 * (im[rt.IDX["left_hip"], :2] + im[rt.IDX["right_hip"], :2])
                box = (im[:, 0].min() * W, im[:, 1].min() * Hh, im[:, 0].max() * W, im[:, 1].max() * Hh)
            if stab is not None:
                cams.append(stab.update(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), box))
            world.append(w), image.append(im), vis.append(v), pres.append(p), det.append(bool(n)), idx.append(i), others.append(n)
            if len(idx) % 30 == 0:
                print(f"[capture] frame {i} ({len(idx)} done, {time.time() - t0:.0f}s)")
        i += 1
    cap.release()
    landmarker.close()
    if not idx:
        raise SystemExit("no frames read")
    det = np.array(det)
    gaps = [(int(idx[x]), int(idx[y])) for x, y in rt.intervals(~det)]
    meta = dict(video=os.path.basename(video), video_sha256=sha256(video), size=[W, Hh], video_fps=fps, every=a.every,
                start_s=a.start, end_s=(idx[-1] + 1) / fps, frames=[int(idx[0]), int(idx[-1])], model=model_info,
                select=a.select, people_seen_max=int(max(others)), undetected_frames=int((~det).sum()), undetected_ranges=gaps,
                stabilized=bool(a.stabilize), code=code_version())
    c = dict(world=np.array(world), image=np.array(image), visibility=np.array(vis), presence=np.array(pres), detected=det,
             fps=np.array(fps / a.every), size=np.array([W, Hh], np.float32), frames=np.array(idx), meta=meta)
    if stab is not None:
        c["cam"] = np.array(cams, np.float32)
        d = c["cam"][-1]
        meta["camera_motion"] = dict(shift_px=[round(float(d[0, 2]), 1), round(float(d[1, 2]), 1)],
                                     zoom=round(float(math.hypot(d[0, 0], d[1, 0])), 4))
    save_capture(out, c)
    print(f"[capture] {len(idx)} frames at {fps / a.every:.2f} fps, {int(det.sum())} with a pose "
          f"({(~det).sum()} without{': ' + str(gaps[:6]) if gaps else ''}) -> {out}/capture.npz ({time.time() - t0:.0f}s)")


# ---------------------------------------------------------------- synth / retarget / evaluate
def cmd_synth(a):
    import synth
    cap, truth = synth.synthetic(a.kind, fps=a.fps, course=a.course, noise_m=a.noise, image_noise_px=a.image_noise,
                                 spikes=a.spikes, dropouts=a.dropouts, person_scale=a.person_scale, seed=a.seed)
    out = a.out or str(PROJECT / "out" / "mocap" / ("synth_" + a.kind))
    cap["meta"]["code"] = code_version()
    cap["meta"]["course"] = a.course
    save_capture(out, cap)
    truth.save(os.path.join(out, "truth.npz"))
    print(f"[synth] {a.kind}: {len(truth)} frames at {a.fps:g} fps -> {out}/capture.npz, truth.npz")


def _params(a) -> rt.Params:
    par = rt.Params()
    for k, v in vars(a).items():
        if v is not None and hasattr(par, k):
            setattr(par, k, v)
    return par


def cmd_retarget(a):
    import body
    import costume
    cap = load_capture(a.out)
    par = _params(a)
    t0 = time.time()
    # the limits are those of the outfit that will be worn (the helmet stiffens the neck)
    with body.wearing(costume if a.outfit == "soldier" else None):
        c, report = rt.retarget(cap, par)
    c.meta["name"] = cap["meta"].get("video", os.path.basename(os.path.normpath(a.out)))
    c.meta["outfit"] = a.outfit
    c.meta["code"] = code_version()
    c.save(os.path.join(a.out, "clip.npz"))
    report["seconds"] = round(time.time() - t0, 2)
    report["params"] = c.meta["params"]
    _json(os.path.join(a.out, "retarget.json"), report)
    print(f"[retarget] {len(c)} frames ({c.duration:.2f} s) -> {a.out}/clip.npz  ({report['seconds']} s)")
    print(f"  axes check: {report['axes']}")
    r = report["root"]
    print(f"  root: {r['source']}; contacts L {r['contacts']['L']} R {r['contacts']['R']}; flights {len(r['flights'])}"
          + (f" (gravity seen in the image {r['gravity_seen_in_image']['median']} vs {rt.GRAVITY:.2f}:"
             f" time scale {r['gravity_seen_in_image']['implied_time_scale']})" if "gravity_seen_in_image" in r else ""))
    s = report["slip"]
    print(f"  feet: slide per contact <= {s['slide_contact_max']}, below ground <= {s['sink_max']} (world units)")
    if report["limits"]:
        print("  joints held back by their limits (max deg / share of frames):")
        for b, v in sorted(report["limits"].items(), key=lambda kv: -kv[1]["max_deg"]):
            print(f"    {b:10s} {v['max_deg']:6.1f}  {100 * v['frames_ratio']:5.1f} %")
    else:
        print("  no joint reached its limit")


def cmd_evaluate(a):
    c = Clip.load(os.path.join(a.out, "clip.npz"))
    truth = Clip.load(os.path.join(a.out, "truth.npz"))
    res = rt.compare(c, truth)
    res["slip"] = rt.foot_slip(c)
    res["truth_slip"] = rt.foot_slip(truth)
    _json(os.path.join(a.out, "evaluate.json"), res)
    print(f"[evaluate] {res['frames']} frames: bone direction error mean {res['direction_mean']} deg (max {res['direction_max']}), "
          f"local rotation mean {res['local_mean']} deg")
    print(f"  root rms (x, y, z) {res['root']['rms']}  max {res['root']['max']}   contacts agree {res['contact_agreement']}")
    print(f"  {'bone':10s} {'local mean':>10s} {'max':>7s} {'direction mean':>15s} {'max':>7s}")
    for b, v in res["bones"].items():
        print(f"  {b:10s} {v['local']['mean']:10.2f} {v['local']['max']:7.2f} {v['direction']['mean']:15.2f} {v['direction']['max']:7.2f}")
    return res


# ---------------------------------------------------------------- drawing
def draw_skeleton(img: Image.Image, pts: np.ndarray, vis: Optional[np.ndarray] = None, width: int = 2) -> Image.Image:
    """2D skeleton over an image.  pts: (33, 2) pixels.  His left side orange, his right side blue."""
    d = ImageDraw.Draw(img)
    for i, j in rt.CONNECTIONS:
        if not (np.isfinite(pts[i]).all() and np.isfinite(pts[j]).all()):
            continue
        sure = vis is None or min(vis[i], vis[j]) >= 0.5
        left, right = rt.LM[i].startswith("left") or rt.LM[j].startswith("left"), rt.LM[i].startswith("right") or rt.LM[j].startswith("right")
        col = (255, 150, 40) if left and not right else (70, 170, 255) if right and not left else (235, 235, 235)
        if not sure:
            col = tuple(int(0.45 * c) for c in col)
        d.line([tuple(pts[i]), tuple(pts[j])], fill=col, width=width)
    return img


def ground_marks(frame: np.ndarray, cam, root, az: float, spacing: float = 0.25) -> np.ndarray:
    """Dots on the ground at fixed places of the world (a grid of ``spacing`` units; every fourth one
    brighter), so that travel shows although the camera follows the figure - and so that a planted foot can be
    seen to stay next to the same dot.  Only where the figure cannot be: in front of it (towards the
    camera) and beside it."""
    out = frame.copy()
    hgt, wid = frame.shape[:2]
    a = math.radians(az)
    toward, right = np.array([math.sin(a), math.cos(a)]), np.array([math.cos(a), -math.sin(a)])
    cx, cz = float(root[0]), float(root[2])
    n = int(3.0 / spacing)
    for ix in range(int(round(cx / spacing)) - n, int(round(cx / spacing)) + n + 1):
        for iz in range(int(round(cz / spacing)) - n, int(round(cz / spacing)) + n + 1):
            x, z = ix * spacing, iz * spacing
            d = np.array([x - cx, z - cz])
            t, r = float(d @ toward), float(d @ right)
            if not (t >= 0.55 or (abs(r) >= 0.50 and t >= -0.25)):
                continue
            p = cam.A @ (cam.viewmat @ np.array([x, GROUND, z, 1.0]))
            if p[2] <= 1e-6:
                continue
            u, v = int(p[0] / p[2]), int(p[1] / p[2])
            if 0 <= u < wid and 0 <= v < hgt:
                major = ix % 4 == 0 and iz % 4 == 0
                out[v, u] = np.clip(out[v, u] + (0.30 if major else 0.12), 0, 1)
    return out


def save_anim(frames: List[np.ndarray], path_noext: str, fps: float, loops: int = 1):
    """GIF (PIL) and, with ffmpeg, MP4 (even size, yuv420p).  frames: float images 0..1 or uint8."""
    ims = [Image.fromarray(f if f.dtype == np.uint8 else (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)) for f in frames]
    ims[0].save(path_noext + ".gif", save_all=True, append_images=ims[1:], duration=int(round(1000 / fps)), loop=0)
    if shutil.which("ffmpeg"):
        tmp = path_noext + "_tmp"
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp)
        for i, im in enumerate(ims):
            im.save(os.path.join(tmp, f"{i:05d}.png"))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", str(loops - 1), "-framerate", f"{fps:g}", "-i",
                        os.path.join(tmp, "%05d.png"), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-crf", "15", path_noext + ".mp4"], check=True)
        shutil.rmtree(tmp)


# ---------------------------------------------------------------- render
def travel_heading(c: Clip) -> float:
    """Direction (degrees, 0 = +z towards the camera of the video, 90 = +x) the figure moves or, if it stays
    on the spot, faces."""
    d = c.root[-1] - c.root[0]
    if math.hypot(d[0], d[2]) > 0.3:
        return math.degrees(math.atan2(d[0], d[2]))
    f = np.mean([c.rots(i)["pelvis"] @ np.array([0.0, 0.0, 1.0]) for i in range(0, len(c), max(len(c) // 8, 1))], 0)
    return math.degrees(math.atan2(f[0], f[2]))


def view_azimuth(view: str, c: Clip) -> float:
    """Camera azimuth of a named view: ``source`` = the video's own camera, ``front`` / ``side`` / ``back`` /
    ``three`` (three-quarter) relative to where the figure is going, or a number of degrees."""
    if view == "source":
        return 0.0
    h = travel_heading(c)
    table = {"front": h, "side": h + 90.0, "back": h + 180.0, "three": h + 40.0, "side2": h - 90.0}
    if view in table:
        return table[view]
    return float(view)


def camera_path(c: Clip, follow_height: float = 0.25) -> np.ndarray:
    """Where the camera looks, per frame: it follows the figure over the ground (smoothly) and only a part
    of its ups and downs, so a jump is seen to leave the ground."""
    root = c.root.astype(np.float64)
    tgt = rt.lowpass(root, c.fps, 2.0) if len(c) >= 12 else root.copy()
    slow = rt.lowpass(root[:, 1], c.fps, 0.5) if len(c) >= 12 else root[:, 1]
    tgt[:, 1] = follow_height * slow
    return tgt


def cmd_render(a):
    import soldier
    from pixelsplat.shade import upscale
    c = Clip.load(os.path.join(a.out, a.clip))
    if a.step > 1:
        c = c.sub(0, len(c), a.step)
    first, last = a.first, (len(c) if a.last is None else min(a.last, len(c)))
    sc, model, bones = soldier.load_model(a.model)
    t_start = time.time()
    done_all = True
    with sc.worn():
        R = soldier.Renderer(model, bones, app=True, look_name=a.look)
        tgt = camera_path(c)
        rise = float(np.max(np.abs(c.root[:, 1] - tgt[:, 1]))) if len(c) else 0.0
        extent = a.extent * H if a.extent else soldier.EXTENT + 0.6 * rise + 0.02 * H
        views = a.views.split(",") if a.views else []
        if a.compare is not None and "source" not in views:
            views.append("source")
        for view in views:
            az = view_azimuth(view, c)
            fdir = os.path.join(a.out, f"frames_{view}")
            os.makedirs(fdir, exist_ok=True)
            player = Player(c)
            n_new = 0
            for i in range(first, last):
                path = os.path.join(fdir, f"{i:05d}.png")
                mats, root = player.pose(i)  # (always: the cloth state has to pass through every frame)
                if os.path.exists(path) and not a.force:
                    continue
                if time.time() - t_start > a.budget:
                    done_all = False
                    break
                center = np.array(soldier.CENTER) + tgt[i]
                cam = soldier.camera(az, a.elevation, a.px, a.aspect, target=tuple(center), extent=extent)
                img = R.frame(cam, mats, root, az=az)
                if a.marks:
                    img = ground_marks(img, cam, root, az)
                Image.fromarray((np.clip(upscale(img, a.scale), 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)
                n_new += 1
            have = [os.path.join(fdir, f"{i:05d}.png") for i in range(first, last)]
            missing = sum(not os.path.exists(p) for p in have)
            print(f"[render] {view} (azimuth {az:.0f}): {n_new} new frames, {missing} to go ({time.time() - t_start:.0f}s)")
            if missing == 0:
                frames = [np.asarray(Image.open(p).convert("RGB")) for p in have]
                save_anim(frames, os.path.join(a.out, view), c.fps, a.loops)
                print(f"[render] -> {a.out}/{view}.gif / .mp4 ({len(frames)} frames at {c.fps:g} fps)")
    if not done_all:
        print(f"[render] stopped after the time budget ({a.budget:.0f} s): run the same command again to continue")
        return False
    if a.compare is not None:
        make_compare(a, c, first, last)
    return True


def make_compare(a, c: Clip, first: int, last: int):
    """Side by side: the source (video frame with the 2D skeleton, or the landmarks alone) | the soldier seen
    from the video's camera."""
    cap = load_capture(a.out)
    step = a.step
    Wd, Ht = (int(v) for v in cap["size"])
    fdir = os.path.join(a.out, "frames_source")
    reader = None
    if a.compare and os.path.exists(a.compare):
        import cv2
        reader = cv2.VideoCapture(a.compare)
    frames = []
    for i in range(first, last):
        right = Image.open(os.path.join(fdir, f"{i:05d}.png")).convert("RGB")
        k = i * step
        hgt = right.height
        wid = int(round(hgt * Wd / Ht))
        left = None
        if reader is not None:
            import cv2
            reader.set(cv2.CAP_PROP_POS_FRAMES, int(cap["frames"][k]))
            ok, fr = reader.read()
            if ok:
                left = Image.fromarray(np.ascontiguousarray(fr[:, :, ::-1])).resize((wid, hgt), Image.BILINEAR)
        if left is None:
            left = Image.new("RGB", (wid, hgt), (24, 26, 34))
        pts = np.asarray(cap["image"][k], np.float64)[:, :2] * np.array([wid, hgt])
        draw_skeleton(left, pts, np.asarray(cap["visibility"][k]) if "visibility" in cap else None, width=max(hgt // 200, 2))
        both = Image.new("RGB", (left.width + right.width, hgt), (0, 0, 0))
        both.paste(left, (0, 0))
        both.paste(right, (left.width, 0))
        frames.append(np.asarray(both))
    if reader is not None:
        reader.release()
    save_anim(frames, os.path.join(a.out, "compare"), c.fps, a.loops)
    print(f"[render] -> {a.out}/compare.gif / .mp4")


# ---------------------------------------------------------------- joining clips
def cmd_blend(a):
    ca, cb = Clip.load(a.a), Clip.load(a.b)
    out = clip_mod.blend(ca, cb, a.overlap)
    os.makedirs(os.path.dirname(os.path.abspath(a.out_clip)), exist_ok=True)
    out.save(a.out_clip)
    print(f"[blend] {len(ca)} + {len(cb)} frames, {a.overlap} blended -> {len(out)} frames: {a.out_clip}")
    print(f"  feet after blending: {rt.foot_slip(out)}")


def cmd_loop(a):
    c = Clip.load(a.clip)
    bounds = rt.cycle_bounds(c)
    start, end = a.start, a.end
    if start is None or end is None:
        if len(bounds) < 2:
            raise SystemExit(f"need two left-foot touchdowns to cut a cycle, found {bounds}: give --start and --end")
        start, end = bounds[0], bounds[-1]
    out = clip_mod.make_loop(c, start, end, a.overlap)
    out.save(a.out_clip)
    print(f"[loop] frames {start}..{end} of {len(c)} (touchdowns at {bounds}) -> {len(out)} frames, "
          f"travel per lap {out.meta['loop_travel']}: {a.out_clip}")


# ---------------------------------------------------------------- command line
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("capture", help="video -> landmarks (MediaPipe)")
    p.add_argument("video")
    p.add_argument("-o", "--out", default=None, help="output folder (default out/mocap/<video name>)")
    p.add_argument("--start", type=float, default=0.0, help="seconds")
    p.add_argument("--end", type=float, default=None, help="seconds")
    p.add_argument("--every", type=int, default=1, help="use every n-th frame")
    p.add_argument("--model", default="heavy", choices=["heavy", "full", "lite"])
    p.add_argument("--poses", type=int, default=2, help="how many people to look for")
    p.add_argument("--select", default="largest", choices=["largest", "center", "left", "right"],
                   help="whom to follow when several people are seen (then: the nearest to the last frame's choice)")
    p.add_argument("--min-confidence", type=float, default=0.5)
    p.add_argument("--no-stabilize", dest="stabilize", action="store_false", help="do not track the camera's own motion")
    p.set_defaults(fn=cmd_capture)

    p = sub.add_parser("synth", help="a capture made from a known soldier motion")
    p.add_argument("kind", choices=["walk", "run", "jump"])
    p.add_argument("-o", "--out", default=None)
    p.add_argument("--fps", type=float, default=30.0)
    p.add_argument("--course", type=float, default=90.0, help="0 = towards the camera, 90 = across the picture")
    p.add_argument("--noise", type=float, default=0.0, help="jitter of the world landmarks, metres")
    p.add_argument("--image-noise", type=float, default=0.0, help="jitter of the image landmarks, pixels")
    p.add_argument("--spikes", type=int, default=0)
    p.add_argument("--dropouts", type=int, default=0)
    p.add_argument("--person-scale", type=float, default=1.0)
    p.add_argument("--seed", type=int, default=0)
    p.set_defaults(fn=cmd_synth)

    p = sub.add_parser("retarget", help="landmarks -> clip on the soldier's rig")
    p.add_argument("-o", "--out", required=True)
    p.add_argument("--outfit", default="soldier", choices=["soldier", "none"], help="whose joint limits apply")
    p.add_argument("--time-scale", dest="time_scale", type=float, default=None, help="video speed: 0.5 = half-speed slow motion")
    p.add_argument("--fov", dest="fov_deg", type=float, default=None, help="horizontal field of view of the camera, degrees")
    p.add_argument("--filter", default=None, choices=["adaptive", "one_euro", "none"])
    p.add_argument("--min-visibility", dest="min_visibility", type=float, default=None)
    p.add_argument("--waist-share", dest="waist_share", type=float, default=None)
    p.add_argument("--flight", dest="flight_xz", default=None, choices=["auto", "momentum", "image", "mixed"])
    p.add_argument("--no-image", dest="use_image", action="store_const", const=False, default=None,
                   help="ignore the 2D track (the root then comes from the feet alone; jumps are not seen)")
    p.add_argument("--no-foot-ik", dest="foot_ik", action="store_const", const=False, default=None)
    p.set_defaults(fn=cmd_retarget)

    p = sub.add_parser("evaluate", help="synthetic captures: retargeted clip against the truth")
    p.add_argument("-o", "--out", required=True)
    p.set_defaults(fn=cmd_evaluate)

    p = sub.add_parser("render", help="clip -> frames -> GIF / MP4 on the trained soldier")
    p.add_argument("-o", "--out", required=True)
    p.add_argument("--clip", default="clip.npz", help="clip file inside the output folder")
    p.add_argument("--model", default=str(PROJECT / "out" / "soldier_final"), help="folder of the baked soldier")
    p.add_argument("--views", default="side", help="comma list: source, front, side, side2, back, three, or degrees")
    p.add_argument("--compare", nargs="?", const="", default=None, metavar="VIDEO",
                   help="also write compare.gif/.mp4: source (video with 2D skeleton; landmarks alone without VIDEO) | soldier")
    p.add_argument("--px", type=int, default=192, help="frame height in pixels (keep <= 192 on this machine)")
    p.add_argument("--aspect", type=float, default=0.75)
    p.add_argument("--scale", type=int, default=3, help="nearest-neighbour upscale of the saved frames")
    p.add_argument("--elevation", type=float, default=6.0)
    p.add_argument("--extent", type=float, default=None, help="half height of the view, as a fraction of body height")
    p.add_argument("--look", default="stylized")
    p.add_argument("--step", type=int, default=1, help="render every n-th frame of the clip")
    p.add_argument("--first", type=int, default=0)
    p.add_argument("--last", type=int, default=None)
    p.add_argument("--budget", type=float, default=150.0, help="stop after this many seconds; run again to continue")
    p.add_argument("--loops", type=int, default=2, help="how many times the MP4 repeats the clip")
    p.add_argument("--force", action="store_true", help="render frames again even if they exist")
    p.add_argument("--no-marks", dest="marks", action="store_false", help="no dots on the ground")
    p.set_defaults(fn=cmd_render)

    p = sub.add_parser("blend", help="clip A followed by clip B, cross-faded")
    p.add_argument("a")
    p.add_argument("b")
    p.add_argument("out_clip")
    p.add_argument("--overlap", type=int, default=6)
    p.set_defaults(fn=cmd_blend)

    p = sub.add_parser("loop", help="cut one gait cycle out of a clip and make it repeat seamlessly")
    p.add_argument("clip")
    p.add_argument("out_clip")
    p.add_argument("--start", type=int, default=None)
    p.add_argument("--end", type=int, default=None)
    p.add_argument("--overlap", type=int, default=4)
    p.set_defaults(fn=cmd_loop)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()

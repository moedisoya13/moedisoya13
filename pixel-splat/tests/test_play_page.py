"""The play page's JavaScript, run in headless Chromium (Node Playwright, tests/page_driver.js) on a tiny
export: a baked mini level (plateau + ramp, a tree) with synthetic sprites (a red card per frame), written by
the same code as the real build.  What is checked is behaviour: collisions, corners, ramp height, occlusion
behind a tree, shade from the ground's own sunlight, the one-two returning to idle without drift or camera
shake, walk / run speeds, root-motion signs, modifier keys, error display, decode of the atlases.

The tests marked ``slow`` run on the real build (out/play3) if it exists: frame time with 4x CPU throttling,
the audit's own repro spots.  Skipped without node + playwright."""
import functools
import http.server
import json
import math
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "examples" / "map"))
import graybox  # noqa: E402
import isocam  # noqa: E402
import level as lv  # noqa: E402
import play  # noqa: E402

DRIVER = ROOT / "tests" / "page_driver.js"
PAGE = Path(os.environ.get("PLAY_PAGE_TEMPLATE", play.TEMPLATE))  # (mutation runs swap in a broken copy)
NODE = shutil.which("node")


def _have_playwright() -> bool:
    if not NODE:
        return False
    r = subprocess.run([NODE, "-e", "require('playwright')"], capture_output=True)
    return r.returncode == 0


pytestmark = pytest.mark.skipif(not _have_playwright(), reason="needs node + playwright (headless Chromium)")

LAYOUT = {"name": "pagetest", "size": [12, 10], "grid": {"minor": 1.0, "major": 5.0}, "elements": [
    {"type": "plateau", "at": [-3.5, -3.0], "size": [3, 3], "height": 1.0},
    {"type": "ramp", "at": [-3.5, 0.25], "size": [3.5, 2], "rot": -90, "height": [0.0, 1.0]},
    {"type": "tree", "at": [3, -2], "height": 4.0, "radius": 1.2, "canopy": "sphere"}],
    "demo": {"stand": {"at": [1.0, 3.0], "facing": 90}}}
TREE = (3.0, -2.0)
POCKET = (8, 31)  # a terrain cell (i, j) cut off but for one corner (carved into terrain.png)


# ---------------------------------------------------------------- a tiny export
def card(m, n_rows=18, width=6, g=0, b=0):
    """A red card standing on the anchor: n_rows px tall, its pixels' depth offsets those of a vertical line."""
    rgba = np.zeros((n_rows, width, 4), np.uint8)
    rgba[...] = [255, g, b, 255]
    rows = np.arange(n_rows) - (n_rows - 1)  # the bottom row is the anchor row
    h = rows / m[1][1]  # world units above the ground point (m[1][1] < 0: screen y grows downwards)
    off = np.repeat((m[2][1] * h)[:, None], width, 1)
    data = play.pack_offset16(off, np.ones(off.shape, bool))
    return dict(rgba=rgba, data=data, ox=-(width // 2), oy=-(n_rows - 1))


def synthetic_sprites(m, one_frame=False):
    facings = list(range(0, 360, 45))
    spec = {"idle": ("loop", 1 if one_frame else 4), "walk": ("gait", 8), "run": ("gait", 8),
            "onetwo": ("action", 1 if one_frame else 12),
            "start": ("transition", 12), "stopA": ("transition", 12), "stopB": ("transition", 14),
            "w2r_0": ("transition", 3), "w2r_5": ("transition", 3), "r2w_0": ("transition", 3), "r2w_5": ("transition", 3)}
    frames, anims = [], {}
    for ai, (name, (kind, n)) in enumerate(spec.items()):
        per = []
        for fi, _ in enumerate(facings):
            idx = []
            for i in range(n):
                frames.append(card(m, g=(ai * 3) % 40, b=(fi * 5 + i) % 40))
                idx.append(len(frames) - 1)
            per.append(idx)
        a = dict(kind=kind, fps=60.0, frames=per)
        if name == "walk":
            a.update(stride_m=1.12, speed=1.4, frames_per_cycle=n)
        if name == "run":
            a.update(stride_m=2.5, speed=3.75, frames_per_cycle=n)
        if kind == "transition":
            src, tgt, enter, ex = dict(start=("idle", "walk", 0, 0.5), stopA=("walk", "idle", 0.0, 0),
                                       stopB=("walk", "idle", 0.5, 0), w2r_0=("walk", "run", 0.0, 0.4),
                                       w2r_5=("walk", "run", 0.5, 0.9), r2w_0=("run", "walk", 0.0, 0.4),
                                       r2w_5=("run", "walk", 0.5, 0.9))[name]
            adv = [[0.02, 0.0]] * n if name != "stopB" else [[0.02, 0.01]] * n
            a.update(source=src, target=tgt, enter=enter, exit=ex, advance=adv)
        anims[name] = a
    return frames, anims


def make_export(out: Path, one_frame=False, break_anim=False):
    bake = out / "bake"
    bake.mkdir(parents=True)
    _, data = graybox.bake(lv.Level(LAYOUT), isocam.RefCam(), spacing=0.25, shadow_res=256, log=lambda *a: None)
    np.savez_compressed(bake / graybox.BAKE_FILE, **data)
    (bake / "layout_used.json").write_text(json.dumps(LAYOUT))
    st = graybox.Stage(str(bake))
    assets = out / "assets"
    assets.mkdir()
    level = play.export_level(st, str(assets), 0.25, log=lambda *a: None)
    # carve a pocket that only touches the open ground at one corner
    ter = play.load_rgba(str(assets / "terrain.png")).copy()
    i, j = POCKET
    ter[j - 1:j + 2, i - 1:i + 2, 2] = 0  # ring of blocked cells around (i, j) ...
    ter[j, i, 2] = 255  # ... the pocket itself walkable
    ter[j - 1, i - 1, 2] = 255  # the ring's corner cell open: it touches the pocket at one corner only
    ter[j - 1, i - 2, 2] = ter[j - 2, i - 1, 2] = 255
    play.save_rgba(ter, str(assets / "terrain.png"))
    m = play.world_to_screen(st.cam)
    frames, anims = synthetic_sprites(m, one_frame)
    if break_anim:
        anims["onetwo"]["frames"] = [[] for _ in anims["onetwo"]["frames"]]
    color, dat, rects = play.pack_atlas(frames)
    play.save_webp_lossless(color, str(assets / "sprites.webp"))
    play.save_rgba(dat, str(assets / "sprites_data.png"))
    manifest = dict(version=2, density=1, camera=dict(world_to_screen=m, units_per_m=lv.UNITS_PER_M, ground_y=lv.GROUND),
                    start=dict(at=LAYOUT["demo"]["stand"]["at"], facing=90), level=level,
                    sprites=dict(color="sprites.webp", data="sprites_data.png", depth_scale=play.SPRITE_DEPTH_SCALE,
                                 depth_zero=32768, facings=list(range(0, 360, 45)), anims=anims,
                                 frames=[r + [f["ox"], f["oy"]] for r, f in zip(rects, frames)]))
    (assets / "manifest.json").write_text(json.dumps(manifest))
    shutil.copyfile(PAGE, out / "index.html")
    host_page(out)
    return out, st


def host_page(folder: Path, page: Path = None):
    """The page as the host serves it: the content wrapped in a document with a charset and a device-width
    viewport (without one a phone lays the page out 980 px wide)."""
    body = Path(page or folder / "index.html").read_text(encoding="utf-8")
    (folder / "host.html").write_text('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" '
                                      'content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n'
                                      + body + "\n</body></html>\n", encoding="utf-8")


class _Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{".html": "text/html; charset=utf-8",
                                                                                ".webp": "image/webp"})

    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    root = tmp_path_factory.mktemp("site")
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield root, f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


@pytest.fixture(scope="module")
def site(server):
    root, url = server
    out, st = make_export(root / "tiny")
    return url + "/tiny/host.html", out, st


def drive(url, scenarios, viewport=(800, 600), dsf=1, touch=False, cpu=0, timeout=300):
    job = dict(url=url, viewport=list(viewport), dsf=dsf, touch=touch, cpu=cpu, scenarios=scenarios)
    r = subprocess.run([NODE, str(DRIVER)], input=json.dumps(job), capture_output=True, text=True, timeout=timeout,
                       cwd=str(ROOT))
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)["scenarios"]


def hold(code, ms):
    return [{"op": "down", "code": code}, {"op": "wait", "ms": ms}, {"op": "up", "code": code}]


# ---------------------------------------------------------------- tests
def test_page_runs_without_errors_on_a_phone_and_a_desktop(site):
    url, _, _ = site
    probe = ("() => ({scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, "
             "body: document.body.scrollWidth - window.innerWidth})")
    for vp, dsf, touch in (((390, 844), 3, True), ((1280, 800), 1, False)):
        res = drive(url, [[{"op": "wait", "ms": 500}, {"op": "state"}, {"op": "eval", "js": probe}, {"op": "status"}]],
                    vp, dsf, touch)[0]
        assert res["errors"] == [], res["errors"]
        st, sc, status = res["results"]
        assert st["anim"] == "idle" and st["frames"] > 5 and status["hidden"]
        assert sc["scroll"] <= 0 and sc["body"] <= 0, sc
        if touch:  # one art pixel = one CSS pixel on a phone
            assert st["view"]["cssPerArt"] == 1 and st["view"]["sDev"] == 3
        else:
            assert st["view"]["cssPerArt"] == 2 and st["view"]["sDev"] == 2


def test_atlases_decode_byte_exact(site):
    """The colour atlas is lossless WebP, the data atlas PNG: the bytes the page reads are the file's."""
    url, out, _ = site
    res = drive(url, [[{"op": "eval", "js": "() => window.bbDebug.atlasSums()"}]])[0]
    c = play.load_rgba(str(out / "assets" / "sprites.webp")).astype(np.int64)
    d = play.load_rgba(str(out / "assets" / "sprites_data.png")).astype(np.int64)
    on = c[..., 3] == 255
    want_c = int((c[..., 0] + 3 * c[..., 1] + 7 * c[..., 2])[on].sum())
    want_d = int((d * np.arange(1, 5)).sum())
    assert res["results"][0] == [want_c, want_d]


def test_level_depth_decodes_like_the_exporter(site):
    url, out, _ = site
    dep = play.load_rgba(str(out / "assets" / "level_depth.png"))
    lv_m = json.loads((out / "assets" / "manifest.json").read_text())["level"]
    want = play.unpack_depth16(dep, lv_m["depth_lo"], lv_m["depth_hi"])
    rng = np.random.default_rng(3)
    ys, xs = np.nonzero(np.isfinite(want))
    pick = rng.choice(len(ys), 60, replace=False)
    pts = [[int(xs[k]), int(ys[k])] for k in pick] + [[0, 0]]
    res = drive(url, [[{"op": "eval", "js": "() => window.bbDebug.levelDepth(%s)" % json.dumps(pts)}]])[0]
    got = res["results"][0]
    for (x, y), d in zip(pts, got):
        w = want[y, x]
        assert (d is None) == (not np.isfinite(w)) and (d is None or abs(d - w) < 1e-4), (x, y, d, w)


def test_trunks_block_and_corners_cannot_be_cut(site):
    url, _, _ = site
    i, j = POCKET
    cx, cz = -6 + (i - 1 + 0.5) * 0.25, -5 + (j - 1 + 0.5) * 0.25  # the open cell touching the pocket's corner
    res = drive(url, [
        [{"op": "teleport", "x": 1.2, "z": -2.0, "facing": 0}] + hold("KeyD", 1500) + [{"op": "state"}],
        [{"op": "teleport", "x": cx, "z": cz, "facing": 45}, {"op": "down", "code": "KeyD"}] + hold("KeyS", 800)
        + [{"op": "up", "code": "KeyD"}, {"op": "state"}],
    ])
    st = res[0]["results"][-1]
    assert st["walkable"] and st["x"] < TREE[0] - 0.45, st  # stopped short of the trunk (radius 0.24 + body 0.25)
    st = res[1]["results"][-1]
    assert math.floor((st["x"] + 6) / 0.25) != i or math.floor((st["z"] + 5) / 0.25) != j, st


def test_ramp_carries_the_figure_up_to_the_plateau(site):
    url, _, _ = site
    res = drive(url, [[{"op": "teleport", "x": -3.5, "z": 2.0, "facing": 270}] + hold("KeyW", 3200) + [{"op": "state"}]])
    st = res[0]["results"][-1]
    assert st["z"] < -1.6 and st["height"] == pytest.approx(1.0, abs=0.02), st


def test_tree_hides_the_figure_and_the_ground_decides_its_shade(site):
    url, out, st = site
    sun = play.load_rgba(str(out / "assets" / "sun.png"))[..., 0] >= 128
    # a spot north of the tree: on screen behind the crown, but the ground there is in the sun
    behind = (TREE[0], TREE[1] - 2.0)
    # a walkable shaded spot of the ground near the tree (its shadow falls left and a little towards us)
    js, is_ = np.nonzero(~sun)
    d = (-6 + (is_ + 0.5) * 0.0625 - TREE[0]) ** 2 + (-5 + (js + 0.5) * 0.0625 - TREE[1] - 1.0) ** 2
    order = np.argsort(d)
    grid = play.walk_grid(st.level, 0.25)
    for k in order:
        x, z = -6 + (is_[k] + 0.5) * 0.0625, -5 + (js[k] + 0.5) * 0.0625
        jj, ii = play.cell_of(grid, x, z)
        if grid["walk"][jj, ii] and np.hypot(x - TREE[0], z - TREE[1]) > 1.0:
            shaded = (float(x), float(z))
            break
    sc = [{"op": "wait", "ms": 300}]
    res = drive(url, [[{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 90}] + sc + [{"op": "eval", "js": "() => window.bbDebug.countRed()"}, {"op": "state"}],
                      [{"op": "teleport", "x": behind[0], "z": behind[1], "facing": 90}] + sc + [{"op": "eval", "js": "() => window.bbDebug.countRed()"}, {"op": "state"}],
                      [{"op": "teleport", "x": shaded[0], "z": shaded[1], "facing": 90}] + sc + [{"op": "eval", "js": "() => window.bbDebug.countRed()"}, {"op": "state"}]])
    (n_open, r_open), st_open = res[0]["results"][1:]
    (n_behind, _), st_behind = res[1]["results"][1:]
    (n_shade, r_shade), st_shade = res[2]["results"][1:]
    assert n_open == 6 * 18 and r_open == 255 and not st_open["shade"]
    assert n_behind < 0.5 * n_open, n_behind  # the crown is in front
    assert not st_behind["shade"]  # ... yet the figure stands in the sun
    assert st_shade["shade"] and n_shade > 0.9 * n_open and r_shade < 200  # in the tree's shadow: darkened


def test_feet_on_the_ramp_are_not_cut_by_the_slope(site):
    url, _, _ = site
    res = drive(url, [[{"op": "teleport", "x": -3.5, "z": 0.5, "facing": 90}, {"op": "wait", "ms": 300},
                       {"op": "eval", "js": "() => window.bbDebug.countRed()"}]])
    assert res[0]["results"][-1][0] == 6 * 18


def test_one_two_plays_returns_to_idle_without_drift_or_camera_shake(site):
    url, _, _ = site
    steps = [{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, {"op": "wait", "ms": 200}, {"op": "state"}]
    for _ in range(10):
        steps += [{"op": "press", "code": "KeyJ"}, {"op": "sample", "ms": 400, "every": 20}]
    steps += [{"op": "state"}]
    res = drive(url, [steps])[0]
    first, last = res["results"][1], res["results"][-1]
    samples = [s for r in res["results"][2:-1] for s in r]
    assert any(s["anim"] == "onetwo" for s in samples) and last["anim"] == "idle"
    assert (last["x"], last["z"]) == (first["x"], first["z"])  # ten one-twos: not a millimetre of drift
    assert {(s["cam"]["x"], s["cam"]["y"]) for s in samples} == {(first["cam"]["x"], first["cam"]["y"])}


def test_walk_and_run_speeds_and_the_transitions_between(site):
    url, _, _ = site
    res = drive(url, [[{"op": "teleport", "x": -1.5, "z": 3.8, "facing": 0}, {"op": "down", "code": "KeyD"},
                       {"op": "wait", "ms": 900}, {"op": "sample", "ms": 1000, "every": 100}, {"op": "up", "code": "KeyD"},
                       {"op": "sample", "ms": 1000, "every": 25}],
                      [{"op": "teleport", "x": -5.4, "z": 3.8, "facing": 0}, {"op": "down", "code": "ShiftLeft"},
                       {"op": "down", "code": "KeyD"}, {"op": "wait", "ms": 1200}, {"op": "sample", "ms": 1000, "every": 100},
                       {"op": "up", "code": "KeyD"}, {"op": "up", "code": "ShiftLeft"}]])
    walk = res[0]["results"][1]
    v = (walk[-1]["x"] - walk[0]["x"]) / 0.9
    assert all(s["anim"] == "walk" for s in walk) and 1.2 < v < 1.6, v
    stop = res[0]["results"][2]
    assert stop[-1]["anim"] == "idle" and any(s["anim"].startswith("stop") for s in stop)
    run = res[1]["results"][1]
    runs = [s for s in run if s["anim"] == "run"]
    v = (runs[-1]["x"] - runs[0]["x"]) / ((len(runs) - 1) * 0.1)
    assert len(runs) >= 5 and 3.2 < v < 4.3, (v, [s["anim"] for s in run])


def test_root_motion_signs(site):
    """Transition root motion [forward, his left] is turned by the facing: facing east, his left is north (-z);
    facing south (+z, towards the camera), his left is east (+x)."""
    url, _, _ = site
    res = drive(url, [[{"op": "teleport", "x": 0.0, "z": 3.0, "facing": 0}, {"op": "eval", "js": "() => window.bbDebug.advance('stopB', 0)"}],
                      [{"op": "teleport", "x": 0.0, "z": 3.0, "facing": 90}, {"op": "eval", "js": "() => window.bbDebug.advance('stopB', 0)"}],
                      [{"op": "teleport", "x": 0.0, "z": 3.0, "facing": 0}] + hold("KeyS", 400) + [{"op": "state"}]])
    x, z = res[0]["results"][-1]
    assert x == pytest.approx(0.02) and z == pytest.approx(3.0 - 0.01)
    x, z = res[1]["results"][-1]
    assert x == pytest.approx(0.01) and z == pytest.approx(3.0 + 0.02)
    st = res[2]["results"][-1]
    assert st["facing"] == 90 and st["z"] > 3.0  # S walks towards the camera and faces it


def test_modifier_keys_and_hidden_page_release_the_figure(site):
    url, _, _ = site
    hide = ("() => { Object.defineProperty(document, 'hidden', {value: true, configurable: true}); "
            "document.dispatchEvent(new Event('visibilitychange')); return true; }")
    res = drive(url, [[{"op": "teleport", "x": 0.0, "z": 3.0, "facing": 90}, {"op": "down", "code": "Control"},
                       {"op": "down", "code": "KeyD"}, {"op": "wait", "ms": 500}, {"op": "state"}],
                      [{"op": "teleport", "x": 0.0, "z": 3.0, "facing": 90}, {"op": "down", "code": "KeyD"},
                       {"op": "wait", "ms": 300}, {"op": "eval", "js": hide}, {"op": "wait", "ms": 900}, {"op": "state"},
                       {"op": "wait", "ms": 500}, {"op": "state"}]])
    st = res[0]["results"][-1]
    assert st["x"] == 0.0 and st["anim"] == "idle"  # Ctrl+D is the browser's
    a, b = res[1]["results"][-2:]
    assert b["anim"] == "idle" and a["x"] == b["x"]  # keys were let go when the page was hidden


def test_errors_are_shown_and_one_frame_clips_work(server):
    root, url = server
    make_export(root / "one", one_frame=True)
    make_export(root / "broken", break_anim=True)
    res = drive(url + "/one/host.html", [[{"op": "wait", "ms": 300}, {"op": "press", "code": "KeyJ"}, {"op": "wait", "ms": 400},
                                           {"op": "state"}, {"op": "eval", "js": "() => { window.bbDebug.fault(); return 1; }"},
                                           {"op": "wait", "ms": 300}, {"op": "status"}]])[0]
    assert res["results"][0]["anim"] == "idle"
    assert res["results"][-1]["error"] and "오류" in res["results"][-1]["text"]
    res = drive(url + "/broken/host.html", [[{"op": "status"}]])[0]
    assert res["results"][0]["error"] and "onetwo" in res["results"][0]["text"]


def test_focus_ring_and_touch_hint_are_visible(site):
    url, _, _ = site
    ring = "() => [document.activeElement.id, getComputedStyle(document.getElementById('stage'), '::after').opacity]"
    hint = ("() => { const e = document.querySelector('.pad-hint'), s = getComputedStyle(e); "
            "return [s.display, s.color, s.backgroundColor]; }")
    res = drive(url, [[{"op": "eval", "js": "() => { document.getElementById('bJ').focus(); return 1; }"},
                       {"op": "press", "code": "Shift+Tab"}, {"op": "eval", "js": ring}]])[0]
    assert res["results"][-1] == ["view", "1"]
    res = drive(url, [[{"op": "wait", "ms": 300}, {"op": "eval", "js": ring}]])[0]  # focused by the page itself: no ring
    assert res["results"][-1] == ["view", "0"]
    res = drive(url, [[{"op": "eval", "js": hint}]], (390, 844), 3, True)[0]
    disp, fg, bg = res["results"][0]
    assert disp == "grid"
    rgb = lambda s: [float(v) for v in s[s.index("(") + 1:s.index(")")].split(",")]  # noqa: E731
    f, b = rgb(fg), rgb(bg)
    lum = lambda c: sum(w * ((v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4)  # noqa: E731
                        for w, v in zip((0.2126, 0.7152, 0.0722), c))
    ratios = []
    for ground in ((240, 240, 240), (60, 60, 70)):  # over the brightest and darkest ground
        comp = [b[k] * b[3] + ground[k] * (1 - b[3]) for k in range(3)]
        l1, l2 = sorted((lum(f[:3]), lum(comp)), reverse=True)
        ratios.append((l1 + 0.05) / (l2 + 0.05))
    worst = min(ratios)
    assert worst >= 4.5, worst


# ---------------------------------------------------------------- the real build (slow)
PLAY3 = ROOT / "out" / "play3"


@pytest.fixture(scope="module")
def real(server):
    if not (PLAY3 / "assets" / "manifest.json").exists():
        pytest.skip("needs out/play3 (play.py build)")
    root, url = server
    site = root / "play3"
    site.mkdir()
    os.symlink(PLAY3 / "assets", site / "assets")
    host_page(site, PLAY3 / "index.html")
    return url + "/play3/host.html"


@pytest.mark.slow
def test_real_build_audit_spots(real):
    res = drive(real, [
        # bug 1: north of the cone tree at (17, -12), the crown covers the feet on screen, the ground is lit
        [{"op": "teleport", "x": 16.375, "z": -18.125, "facing": 90}, {"op": "wait", "ms": 200}, {"op": "state"}],
        # bug 5: the diagonal pocket between two rocks is out of reach
        [{"op": "eval", "js": "() => window.bbDebug.canStep(-2.375, 1.125, -2.625, 0.875)"}],
        # bug 4: feet on the pond's south bank are drawn
        [{"op": "teleport", "x": -9.0, "z": 12.4, "facing": 0}, {"op": "wait", "ms": 300}, {"op": "state"}],
    ], (1280, 800))
    assert all(r["errors"] == [] for r in res)
    assert res[0]["results"][-1]["shade"] is False
    assert res[1]["results"][0] is False


@pytest.mark.slow
def test_real_build_frame_time_with_4x_cpu_throttle(real):
    res = drive(real, [[{"op": "teleport", "x": -1.0, "z": 4.4, "facing": 0}, {"op": "down", "code": "ShiftLeft"},
                        {"op": "down", "code": "KeyD"}, {"op": "wait", "ms": 3000}, {"op": "frames"}]],
                (390, 844), 3, True, cpu=4)[0]
    t = np.array(res["results"][-1])
    assert res["errors"] == [] and np.percentile(t, 95) < 12.0, np.percentile(t, [50, 95])

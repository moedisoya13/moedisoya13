"""The play page's JavaScript, run in headless Chromium (Node Playwright, tests/page_driver.js) on a tiny
export: a baked mini level (plateau + ramp, a tree) with synthetic sprites (a red card per frame), written by
the same code as the real build.  What is checked is behaviour: collisions, corners, ramp height, occlusion
behind a tree and behind a plateau top, shade from the ground's own sunlight, the one-two returning to idle
without drift or camera shake, walk / run speeds, the touch stick, root-motion signs and continuity, one
frame per display frame at 60 / 120 / 30 Hz (exact rAF timestamps), modifier keys (Cmd), error display,
decode of the atlases, the two canvases in register at fractional device pixel ratios.

The tests marked ``slow`` run on the real build (out/play6, or $PLAY_BUILD) if it exists: frame time with 4x CPU
throttling, the audit's own repro spots, the one-two's real root motion, the real cuts.  Skipped without node +
playwright."""
import functools
import http.server
import itertools
import json
import math
import os
import re
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
def card(m, n_rows=18, width=6, g=0, b=0, lean=0.0, dx=0):
    """A red card standing on the anchor: n_rows px tall, its pixels' depth offsets those of a vertical line
    (``lean`` world units in front of the anchor, towards the camera: like a guard's fists held forward)."""
    rgba = np.zeros((n_rows, width, 4), np.uint8)
    rgba[...] = [255, g, b, 255]
    rows = np.arange(n_rows) - (n_rows - 1)  # the bottom row is the anchor row
    h = (rows - m[1][2] * lean) / m[1][1]  # world units above the ground point (m[1][1] < 0: y grows downwards)
    off = np.repeat((m[2][1] * h + m[2][2] * lean)[:, None], width, 1)
    data = play.pack_offset16(off, np.ones(off.shape, bool))
    return dict(rgba=rgba, data=data, ox=-(width // 2) + dx, oy=-(n_rows - 1))


def synthetic_sprites(m, one_frame=False, lean=0.0):
    facings = list(range(0, 360, 45))
    spec = {"idle": ("loop", 1 if one_frame else 4), "walk": ("gait", 48), "run": ("gait", 40),
            "onetwo": ("action", 1 if one_frame else 12),
            "start": ("transition", 12), "stopA": ("transition", 12), "stopB": ("transition", 14),
            "w2r_0": ("transition", 3), "w2r_5": ("transition", 3), "r2w_0": ("transition", 3), "r2w_5": ("transition", 3)}
    spec.update({f"qw{j}": ("transition", 4) for j in range(4)})  # quick stops into the one-two (J while moving)
    spec.update({f"qr{j}": ("transition", 4) for j in range(8)})
    frames, anims = [], {}
    for ai, (name, (kind, n)) in enumerate(spec.items()):
        per = []
        for fi, _ in enumerate(facings):
            idx = []
            for i in range(n):
                lunge = min(i, n - 1 - i) if name == "onetwo" else 0  # the one-two's root motion is in its sprites
                frames.append(card(m, g=(ai * 3) % 40, b=(fi * 5 + i) % 40, lean=lean, dx=lunge))
                idx.append(len(frames) - 1)
            per.append(idx)
        a = dict(kind=kind, fps=60.0, frames=per)
        if name == "walk":
            a.update(stride_m=1.12, speed=1.4, frames_per_cycle=n)
        if name == "run":
            a.update(stride_m=2.5, speed=3.75, frames_per_cycle=n)
        if name == "onetwo":
            a.update(chain_from=8 if n > 8 else n)
        if name[0] == "q":
            a.update(source="walk" if name[1] == "w" else "run", target="onetwo", exit=5,
                     enter=int(name[2]) / (4 if name[1] == "w" else 8), advance=[[0.01, 0.0]] * n)
        if kind == "transition" and name[0] != "q":
            src, tgt, enter, ex = dict(start=("idle", "walk", 0, 0.5), stopA=("walk", "idle", 0.0, 0),
                                       stopB=("walk", "idle", 0.5, 0), w2r_0=("walk", "run", 0.0, 0.4125),
                                       w2r_5=("walk", "run", 0.5, 0.9), r2w_0=("run", "walk", 0.0, 0.4),
                                       r2w_5=("run", "walk", 0.5, 0.9))[name]
            adv = [[0.02, 0.0]] * n if name != "stopB" else [[0.02, 0.01]] * n
            a.update(source=src, target=tgt, enter=enter, exit=ex, advance=adv)
        anims[name] = a
    return frames, anims


def make_export(out: Path, one_frame=False, break_anim=False, layout=None, lean=0.0, page_h=0):
    """``page_h``: sprite atlas pages this tall (play.pack_atlas_pages, as the build does now); 0 = one atlas (the
    older format, which the page still reads)."""
    layout = layout or LAYOUT
    bake = out / "bake"
    bake.mkdir(parents=True)
    _, data = graybox.bake(lv.Level(layout), isocam.RefCam(), spacing=0.25, shadow_res=256, log=lambda *a: None)
    np.savez_compressed(bake / graybox.BAKE_FILE, **data)
    (bake / "layout_used.json").write_text(json.dumps(layout))
    st = graybox.Stage(str(bake))
    assets = out / "assets"
    assets.mkdir()
    level = play.export_level(st, str(assets), 0.25, log=lambda *a: None)
    if layout is LAYOUT:  # carve a pocket that only touches the open ground at one corner
        ter = play.load_rgba(str(assets / "terrain.png")).copy()
        i, j = POCKET
        ter[j - 1:j + 2, i - 1:i + 2, 2] = 0  # ring of blocked cells around (i, j) ...
        ter[j, i, 2] = 255  # ... the pocket itself walkable
        ter[j - 1, i - 1, 2] = 255  # the ring's corner cell open: it touches the pocket at one corner only
        ter[j - 1, i - 2, 2] = ter[j - 2, i - 1, 2] = 255
        play.save_rgba(ter, str(assets / "terrain.png"))
    m = play.world_to_screen(st.cam)
    frames, anims = synthetic_sprites(m, one_frame, lean)
    if break_anim:
        anims["onetwo"]["frames"] = [[] for _ in anims["onetwo"]["frames"]]
    sprites = dict(depth_scale=play.SPRITE_DEPTH_SCALE, depth_zero=32768, facings=list(range(0, 360, 45)), anims=anims)
    if page_h:
        pages, rects = play.pack_atlas_pages(frames, 256, page_h)
        sprites["pages"] = []
        for p, (color, dat) in enumerate(pages):
            play.save_webp_lossless(color, str(assets / f"sprites_{p}.webp"))
            play.save_rgba(dat, str(assets / f"sprites_data_{p}.png"))
            sprites["pages"].append(dict(color=f"sprites_{p}.webp", data=f"sprites_data_{p}.png",
                                         size=[color.shape[1], color.shape[0]]))
        sprites["frames"] = [r[:4] + [f["ox"], f["oy"], r[4]] for r, f in zip(rects, frames)]
    else:
        color, dat, rects = play.pack_atlas(frames)
        play.save_webp_lossless(color, str(assets / "sprites.webp"))
        play.save_rgba(dat, str(assets / "sprites_data.png"))
        sprites.update(color="sprites.webp", data="sprites_data.png",
                       frames=[r + [f["ox"], f["oy"]] for r, f in zip(rects, frames)])
    manifest = dict(version=2, density=2, camera=dict(world_to_screen=m, units_per_m=lv.UNITS_PER_M, ground_y=lv.GROUND),
                    start=dict(at=layout["demo"]["stand"]["at"], facing=90), level=level, sprites=sprites)
    manifest["files"] = play.asset_sizes(str(assets), manifest)
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


def host_phone(folder: Path, name: str, insets, root_pad=True, page: Path = None) -> str:
    """The page as the host serves it on an iPhone: the host's reset pads :root top and bottom by the safe-area
    insets.  Chromium has no notch (its env(safe-area-inset-*) is 0), so the insets [top, right, bottom, left]
    are written in as fixed px wherever env() asks for them - the host's reset and the page's own CSS alike.
    ``root_pad`` False: the page opened on its own (no host padding)."""
    t, r, b, l = insets
    sub = lambda s: re.sub(r"env\(\s*safe-area-inset-(top|right|bottom|left)\s*(,[^)]*)?\)",  # noqa: E731
                           lambda m: f"{dict(top=t, right=r, bottom=b, left=l)[m.group(1)]}px", s)
    body = sub(Path(page or folder / "index.html").read_text(encoding="utf-8"))
    reset = "*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}"
    if root_pad:
        reset += ":root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}"
    (folder / f"{name}.html").write_text(
        '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, '
        f'initial-scale=1, viewport-fit=cover"><style>{sub(reset)}</style></head><body>\n{body}\n</body></html>\n',
        encoding="utf-8")
    return f"{name}.html"


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


def drive(url, scenarios, viewport=(800, 600), dsf=1, touch=False, cpu=0, timeout=300, manual=False):
    """``manual``: the page's requestAnimationFrame is driven by "ticks" steps (exact frame timestamps)."""
    job = dict(url=url, viewport=list(viewport), dsf=dsf, touch=touch, cpu=cpu, scenarios=scenarios, manualRaf=manual)
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
        # (the tiny site says density 2, like the build): 1.5 CSS px per art px on a phone, 4.5 device px rounded
        # down to 4 (more ground); 3 on the 1280 px desktop (the size of a 3x build at 1 and 2 CSS px)
        if touch:
            assert st["view"]["cssPerArt"] == 1.5 and st["view"]["sDev"] == 4
        else:
            assert st["view"]["cssPerArt"] == 3 and st["view"]["sDev"] == 3


def atlas_sums(assets: Path):
    """What bbDebug.atlasSums() must give: the frames' pixels one after another (rows of each rectangle), read from
    the atlas files - [r + 3g + 7b over opaque pixels, depth offset * (i % 13 + 1), shadow pixels, opaque pixels]."""
    S = json.loads((assets / "manifest.json").read_text())["sprites"]
    pages = [(play.load_rgba(str(assets / p["color"])).astype(np.int64), play.load_rgba(str(assets / p["data"])).astype(np.int64))
             for p in play.atlas_pages(S)]
    cs, ds = [], []
    for fr in S["frames"]:
        x, y, w, h = fr[:4]
        c, d = pages[fr[6] if len(fr) > 6 else 0]
        cs.append(c[y:y + h, x:x + w].reshape(-1, 4))
        ds.append(d[y:y + h, x:x + w].reshape(-1, 4))
    c, d = np.concatenate(cs), np.concatenate(ds)
    on = c[:, 3] >= 128
    dz = d[:, 0] * 256 + d[:, 1] - S["depth_zero"]
    return [int((c[:, 0] + 3 * c[:, 1] + 7 * c[:, 2])[on].sum()), int((dz * (np.arange(len(dz)) % 13 + 1)).sum()),
            int((d[:, 2] >= 128).sum()), int(on.sum())]


def test_atlases_decode_byte_exact(site, server):
    """The colour atlas is lossless WebP, the data atlas PNG: the bytes the page keeps are the file's - one atlas
    (older builds) and atlas pages (play.pack_atlas_pages; here 6 pages of 256 x 64), decoded a strip at a time."""
    url, out, _ = site
    res = drive(url, [[{"op": "eval", "js": "() => window.bbDebug.atlasSums()"}]])[0]
    assert res["errors"] == [] and res["results"][0] == atlas_sums(out / "assets")
    root, base = server
    paged, _ = make_export(root / "paged", page_h=64)
    m = json.loads((paged / "assets" / "manifest.json").read_text())
    assert len(m["sprites"]["pages"]) >= 3 and play.check(str(paged)) == []
    res = drive(base + "/paged/host.html", [[{"op": "eval", "js": "() => window.bbDebug.atlasSums()"},
                                              {"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, {"op": "wait", "ms": 200},
                                              {"op": "eval", "js": "() => window.bbDebug.countRed()"}]])[0]
    assert res["errors"] == [] and res["results"][0] == atlas_sums(paged / "assets")
    assert res["results"][2][0] >= 6 * 18 * 0.9  # the card is drawn (6 x 18 px)


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
    """The one-two's lunge is drawn inside its sprites (here: the card slides up to 5 px and back): the figure
    moves on screen and comes back, the anchor and the camera stay put.  (The real clip: the slow test.)"""
    url, _, _ = site
    steps = [{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, ticks(3), {"op": "state"}]
    for _ in range(10):
        steps += [{"op": "press", "code": "KeyJ"}, ticks(30)]
    steps += [{"op": "state"}]
    res = drive(url, [steps], manual=True)[0]
    first, last = res["results"][2], res["results"][-1]
    samples = flat(res["results"][3:-1])
    assert sum(1 for i, r in enumerate(samples) if r[0] == "onetwo" and (i == 0 or samples[i - 1][0] != "onetwo")) == 10
    assert last["anim"] == "idle"
    assert {(r[3], r[4]) for r in samples} == {(first["x"], first["z"])}  # ten one-twos: not a millimetre of drift
    man = json.loads((site[1] / "assets" / "manifest.json").read_text())["sprites"]
    ox = [man["frames"][r[5]][4] for r in samples]
    assert max(ox) - min(ox) == 5 and first["box"][:2] == last["box"][:2]  # lunged 5 px, back on the same pixel
    res = drive(url, [[{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, ticks(3), {"op": "press", "code": "KeyJ"}]
                      + [ticks(2), {"op": "state"}] * 12], manual=True)[0]
    sts = [s for s in res["results"] if isinstance(s, dict)]
    assert {(s["cam"]["x"], s["cam"]["y"]) for s in sts} == {(sts[0]["cam"]["x"], sts[0]["cam"]["y"])}
    assert len({s["box"][0] for s in sts}) >= 3  # the box moved with the lunge


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


JITTER = {60: [16.7, 16.7, 16.6], 120: [8.3, 8.4, 8.3], 30: [33.3, 33.4, 33.3]}  # rAF steps of real displays (ms)


def ticks(n, hz=60):
    d = JITTER[hz]
    return {"op": "ticks", "dts": [d[i % len(d)] for i in range(n)]}


def runs(recs):
    """Consecutive records of the same animation: [(anim, [records])]."""
    out = []
    for r in recs:
        if out and out[-1][0] == r[0]:
            out[-1][1].append(r)
        else:
            out.append((r[0], [r]))
    return out


def flat(results):
    return [r for step in results if isinstance(step, list) for r in step]


def test_one_frame_per_display_frame_at_60_120_and_30_hz(site):
    """With the timestamps of a real 60 Hz display (16.7, 16.7, 16.6 ms) every display frame shows the next frame
    of a clip (the one-two, the start and stop transitions, the idle) - none twice, none skipped - and a steady
    walk steps its 48-frame cycle by exactly one frame.  At 120 Hz each frame shows twice, at 30 Hz every other."""
    url = site[0]
    for hz, per in ((60, 1), (120, 2), (30, 0.5)):
        sec = lambda t: int(round(t * hz))  # noqa: E731
        res = drive(url, [[{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, ticks(3, hz), {"op": "press", "code": "KeyJ"},
                           ticks(sec(0.6), hz)],
                          [{"op": "teleport", "x": -1.5, "z": 3.8, "facing": 0}, ticks(3, hz), {"op": "down", "code": "KeyD"},
                           ticks(sec(1.3), hz), {"op": "up", "code": "KeyD"}, ticks(sec(1.0), hz)]], manual=True)
        seen = set()
        for sc in res:
            assert sc["errors"] == []
            for anim, rr in runs(flat(sc["results"])):
                if anim in ("walk", "run"):
                    steps = [(b[2] - a[2]) % 48 for a, b in zip(rr, rr[1:])]
                    want = {60: {1}, 120: {0, 1}, 30: {2}}[hz]
                    assert set(steps) <= want, (hz, anim, steps)
                    if hz == 120:  # a frame shows twice, never once or three times
                        assert "11" not in "".join(map(str, steps)) and "00" not in "".join(map(str, steps)), steps
                    seen.add(anim)
                    continue
                ks = [r[1] for r in rr]
                n = 4 if anim == "idle" else None
                steps = [((b - a) % n) if n else b - a for a, b in zip(ks, ks[1:])]
                if per == 2:  # every frame shown for two display frames (the first and last may be cut short)
                    held = [len(list(g)) for _, g in itertools.groupby(ks)]
                    assert set(held[1:-1]) <= {2} and set(steps) <= {0, 1}, (hz, anim, str(ks))
                else:
                    assert set(steps) <= {int(1 / per) if per < 1 else 1}, (hz, anim, ks)
                seen.add(anim)
        assert {"onetwo", "start", "walk", "idle"} <= seen and seen & {"stopA", "stopB"}, seen


def test_transitions_cut_one_frame_after_their_entry_with_continuous_root_motion(site):
    """walk -> stop and walk -> run: the transition's frame 0 (the pose one frame after the entry) follows the
    gait frame AT the entry (not the one before it), and the figure moves by the transition's own first advance
    that display frame (not a gait step plus it): 2 cm per frame here, the walk 2.33 cm."""
    url = site[0]
    res = drive(url, [[{"op": "teleport", "x": -5.4, "z": 3.8, "facing": 0}, ticks(3), {"op": "down", "code": "KeyD"},
                       ticks(80), {"op": "down", "code": "ShiftLeft"}, ticks(60), {"op": "up", "code": "ShiftLeft"},
                       ticks(60), {"op": "up", "code": "KeyD"}, ticks(70)]], manual=True)[0]
    assert res["errors"] == []
    recs = flat(res["results"])
    anims = json.loads((site[1] / "assets" / "manifest.json").read_text())["sprites"]["anims"]
    cuts = 0
    for i in range(2, len(recs) - 1):
        a, b = recs[i - 1], recs[i]
        if a[0] in ("walk", "run") and b[0] != a[0]:
            t = anims[b[0]]
            n = len(anims[a[0]]["frames"][0])
            assert a[2] == round(t["enter"] * n) % n and b[1] == 0, (a, b)  # entry frame, then frame 0
            step = math.hypot(b[3] - a[3], b[4] - a[4])
            assert step == pytest.approx(math.hypot(*t["advance"][0]), abs=0.003), (b[0], step)
            nxt = math.hypot(recs[i + 1][3] - b[3], recs[i + 1][4] - b[4])
            assert nxt == pytest.approx(math.hypot(*t["advance"][1]), abs=0.003), (b[0], nxt)
            cuts += 1
    assert cuts >= 3, [r[0] for r in recs]  # walk -> run, run -> walk, walk -> stop


def test_touch_stick_walks_below_80_percent_and_runs_above(site):
    """A phone: the stick pushed half way walks at half speed - the start and the stop too (their clips play at
    the stick's speed, so their root motion does not jump to full speed) - and past 80 % it runs."""
    url = site[0]
    cx, cy = 100, 520  # CSS px in a 390 x 844 phone: the left part of the game area
    res = drive(url, [[{"op": "teleport", "x": -5.4, "z": 3.8, "facing": 0}, ticks(3),
                       {"op": "touch", "type": "touchStart", "points": [[cx, cy, 1]]},
                       {"op": "touch", "type": "touchMove", "points": [[cx + 26, cy, 1]]}, ticks(150),
                       {"op": "touch", "type": "touchEnd", "points": []}, ticks(90),
                       {"op": "touch", "type": "touchStart", "points": [[cx, cy, 2]]},
                       {"op": "touch", "type": "touchMove", "points": [[cx + 60, cy, 2]]}, ticks(120),
                       {"op": "touch", "type": "touchEnd", "points": []}, ticks(5)]],
                (390, 844), 3, True, manual=True)[0]
    assert res["errors"] == []
    half, rest, fast = res["results"][2], res["results"][3], res["results"][4]

    def speed(rr, k=12):  # m/s over k display frames (60 Hz)
        return [math.hypot(b[3] - a[3], b[4] - a[4]) * 60 / k for a, b in zip(rr, rr[k:])]
    assert {r[0] for r in half} == {"start", "walk"}, {r[0] for r in half}
    walk = [r for r in half if r[0] == "walk"]
    assert np.median(speed(walk)) == pytest.approx(0.5 * 1.4, rel=0.05)
    start = [r for r in half if r[0] == "start"]
    assert len(start) == pytest.approx(12 / 0.5, abs=2)  # 12 frames at half speed
    assert max(speed(half + rest)) < 0.5 * 1.4 * 1.25, max(speed(half + rest))  # (full speed: 1.2-1.4 m/s)
    assert rest[-1][0] == "idle" and any(r[0].startswith("stop") for r in rest)
    assert any(r[0] == "run" for r in fast)
    runs_ = [r for r in fast if r[0] == "run"]
    assert np.median(speed(runs_, 6)) == pytest.approx(3.75, rel=0.05)


class Finger:
    """A scripted thumb for the "drag" step: one display frame per entry (60 Hz timestamps), a touch event or none.
    Coordinates in CSS px of a 390 x 844 phone; the stick's centre where it touches (OX, OY)."""
    OX, OY, R = 100.0, 520.0, 52.0

    def __init__(self):
        self.frames, self.last, self.marks = [], None, {}

    def _dt(self):
        return JITTER[60][len(self.frames) % 3]

    def tick(self, n=1):
        for _ in range(n):
            self.frames.append([self._dt(), None, None])
        return self

    def down(self, extra=()):
        self.frames.append([self._dt(), "touchStart", [[self.OX, self.OY, 1], *extra]])
        self.last = (self.OX, self.OY)
        return self

    def to(self, x, y, n=1, extra=()):
        for _ in range(n):
            if (round(x, 3), round(y, 3)) == self.last and not extra:
                self.frames.append([self._dt(), None, None])
            else:
                self.frames.append([self._dt(), "touchMove", [[x, y, 1], *extra]])
            self.last = (round(x, 3), round(y, 3))
        return self

    def polar(self, deg, push, n=1):
        a = math.radians(deg)
        return self.to(self.OX + math.cos(a) * push * self.R, self.OY + math.sin(a) * push * self.R, n)

    def up(self):
        self.frames.append([self._dt(), "touchEnd", []])
        return self

    def mark(self, name):
        self.marks[name] = len(self.frames)
        return self


def drag(url, fingers, at=(-5.4, 3.8)):
    res = drive(url, [[{"op": "teleport", "x": at[0], "z": at[1], "facing": 0}, ticks(3), {"op": "drag", "frames": f.frames}]
                      for f in fingers], (390, 844), 3, True, manual=True)
    for r in res:
        assert r["errors"] == [], r["errors"]
    return [r["results"][-1] for r in res]


def test_stick_holds_its_facing_and_its_gait_near_the_edges(site):
    """A thumb resting on the edge between two facings (22.5 deg, wobbling +-4 deg) used to flip the figure about
    11 times a second; the stick now keeps a facing until it points 8 deg past its sector.  A thumb resting at the
    run threshold (80 %, wobbling +-4 %) no longer flips between run and walk: run from 80 %, walk again below 68 %."""
    url = site[0]
    f = Finger().down()
    for i in range(150):
        f.polar(22.5 + 4 * math.sin(2 * math.pi * 3 * i / 60), 0.7)
    g = Finger().down().polar(0, 1.0, 60).mark("hover")
    for i in range(240):
        g.polar(0, 0.8 + 0.04 * math.sin(2 * math.pi * 2 * i / 60))
    a, b = drag(url, [f, g])
    facings = [r[6] for r in a[30:]]
    assert sum(1 for p, q in zip(facings, facings[1:]) if p != q) <= 1, facings
    hover = [r[0] for r in b[g.marks["hover"]:]]
    assert "run" in hover and not any(x.startswith("r2w") for x in hover), sorted(set(hover))


def test_stick_reversal_turn_start_and_the_floating_centre(site):
    """180 deg with the stick while walking: 45 deg every 2 frames while 90 deg or more remain (was every 3), so it
    moves off the other way at >= 80 % speed within 5 display frames, never backwards.  From standing it turns
    45 deg a frame first and only then starts (the start clip moves along his facing: it used to set off the old
    way).  Pushed to run from standing, the walk start goes straight into walk -> run (it ends at its entry).
    A thumb dragged 2 reaches out pulls the stick's centre 1 reach along."""
    url = site[0]
    rev = Finger().down().polar(0, 0.7, 70).mark("t").polar(180, 0.7, 30)
    turn = Finger().tick(2).down().mark("t").polar(180, 0.7, 30)
    run = Finger().down().mark("t").polar(0, 1.0, 40)
    a, b, c = drag(url, [rev, turn, run], at=(-1.0, 3.8))
    g = rev.marks["t"]
    vx = [(a[i][3] - a[i - 1][3]) * 60 for i in range(g, len(a))]
    assert all(v <= 1e-6 for v in vx), vx  # no step east once the stick points west: no walking backwards
    first = next(i for i, v in enumerate(vx) if -v >= 0.8 * 0.7 * 1.4)
    assert first <= 5 and a[g + 6][6] == 180, (first, [r[6] for r in a[g:g + 8]])
    g = turn.marks["t"]
    seq = [(r[0], r[6]) for r in b[g:g + 8]]
    s = next(i for i, (an, _) in enumerate(seq) if an == "start")
    assert s <= 4 and abs(((seq[s][1] - 180) + 180) % 360 - 180) <= 45, seq
    assert max(b[i][3] - b[i - 1][3] for i in range(g, len(b))) <= 1e-6  # no step east (the old way)
    names = [r[0] for r in c[run.marks["t"]:]]
    after = names[names.index("start"):]
    nxt = next(x for x in after if x != "start")
    assert nxt.startswith("w2r"), after[:30]
    O, R = Finger.OX, Finger.R
    fl = drive(url, [[{"op": "teleport", "x": -5.4, "z": 3.8, "facing": 0}, ticks(3),
                      {"op": "drag", "frames": Finger().down().frames}, {"op": "state"},
                      {"op": "drag", "frames": Finger().to(O + 2 * R, Finger.OY, 3).frames}, {"op": "state"},
                      {"op": "drag", "frames": Finger().to(O + 0.6 * R, Finger.OY, 3).frames}, {"op": "state"}]],
                 (390, 844), 3, True, manual=True)[0]
    assert fl["errors"] == []
    s0, s1, s2 = (r["stick"] for r in fl["results"] if isinstance(r, dict))
    assert s1["cx"] - s0["cx"] == pytest.approx(R) and s1["dx"] == pytest.approx(1.0) and s1["run"]
    assert s2["cx"] == pytest.approx(s1["cx"]) and s2["dx"] == pytest.approx(-0.4, abs=1e-6)  # (from the moved centre)


def test_the_button_works_while_the_stick_is_held(site):
    """Two thumbs: the stick held (walking) and a tap on the one-two button with the other.  The tap plays the
    quick stop into the one-two; the stick stays held through it and the figure walks on afterwards."""
    url = site[0]
    res = drive(url, [[{"op": "eval", "js": "() => { const r = document.getElementById('bJ').getBoundingClientRect();"
                                              " return [r.left + r.width / 2, r.top + r.height / 2]; }"}]],
                (390, 844), 3, True)[0]
    bx, by = res["results"][0]
    f = Finger().down().polar(0, 0.7, 60).mark("tap")
    stick = [f.OX + 0.7 * f.R, f.OY, 1]
    f.frames.append([f._dt(), "touchStart", [stick, [bx, by, 2]]])
    f.frames.append([f._dt(), "touchMove", [stick]])  # (the button's finger lifts: it is no longer listed)
    f.tick(200)
    r = drag(url, [f])[0]
    names = [x[0] for x in r[f.marks["tap"]:]]
    assert "onetwo" in names and names[-1] in ("walk", "start"), names[::10]
    assert names.index("onetwo") <= 20


def test_cmd_lets_go_of_held_keys(site):
    """macOS sends no keyup for a key let go while Cmd is down: Cmd going down (or up) lets go of every key."""
    url = site[0]
    res = drive(url, [[{"op": "teleport", "x": -1.5, "z": 3.8, "facing": 0}, ticks(3), {"op": "down", "code": "KeyD"},
                       ticks(60), {"op": "down", "code": "Meta"}, ticks(90), {"op": "state"}, ticks(30), {"op": "state"},
                       {"op": "up", "code": "Meta"}, ticks(30), {"op": "state"}]], manual=True)[0]
    assert res["errors"] == []
    a, b, c = [r for r in res["results"] if isinstance(r, dict)]
    assert a["anim"] == "idle" and (a["x"], a["z"]) == (b["x"], b["z"]) == (c["x"], c["z"]) and c["anim"] == "idle"


def test_j_while_moving_goes_through_a_quick_stop_into_the_one_two(site):
    """J while running (or walking): no stop and no guard bounce - the gait waits for the next quick-stop entry
    (run: every 1/8 cycle = 5 frames, walk: 1/4 = 12) and that clip hands over to the one-two at its exit frame + 1."""
    url, out, _ = site
    anims = json.loads((out / "assets" / "manifest.json").read_text())["sprites"]["anims"]
    for keys, wait in ((["ShiftLeft", "KeyD"], 5), (["KeyD"], 12)):
        res = drive(url, [[{"op": "teleport", "x": -5.4, "z": 3.8, "facing": 0}, ticks(3)]
                          + [{"op": "down", "code": k} for k in keys] + [ticks(80), {"op": "press", "code": "KeyJ"}, ticks(30)]],
                    manual=True)[0]
        assert res["errors"] == []
        before, after = res["results"][-2], res["results"][-1]
        gait = before[-1][0]
        assert gait == ("run" if len(keys) == 2 else "walk")
        seq = [r[0] for r in after]
        q = next(i for i, a in enumerate(seq) if a[0] == "q")
        assert q <= wait and set(seq[:q]) == {gait}, seq  # the gait went on to the entry, nothing else
        t = anims[seq[q]]
        prev = after[q - 1] if q else before[-1]
        assert t["source"] == gait and prev[2] == round(t["enter"] * len(anims[gait]["frames"][0])) and after[q][1] == 0
        o = seq.index("onetwo")
        assert set(seq[q:o]) == {seq[q]} and after[o][1] == t["exit"] + 1, (seq, after[o])


def test_j_late_in_a_one_two_chains_one_more_and_no_more(site):
    """J during a one-two: before its cross is out (frame chain_from) the press is dropped; after it, one press -
    or several - queue exactly one follow-up, which starts on the display frame after the last one."""
    url, out, _ = site
    ot = json.loads((out / "assets" / "manifest.json").read_text())["sprites"]["anims"]["onetwo"]
    assert ot["chain_from"] == 8
    res = drive(url, [[{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, ticks(3), {"op": "press", "code": "KeyJ"},
                       ticks(4), {"op": "press", "code": "KeyJ"}, ticks(6), {"op": "press", "code": "KeyJ"}, ticks(1),
                       {"op": "press", "code": "KeyJ"}, ticks(40)]], manual=True)[0]
    assert res["errors"] == []
    recs = flat(res["results"])
    starts = [i for i, r in enumerate(recs) if r[0] == "onetwo" and r[1] == 0 and (i == 0 or recs[i - 1][:2] != r[:2])]
    assert len(starts) == 2, [r[:2] for r in recs]  # the early press dropped, the two late ones = one follow-up
    assert recs[starts[1] - 1][:2] == ["onetwo", 11]  # straight from the last frame, no idle between
    assert recs[-1][0] == "idle"


def test_a_reversal_does_not_walk_backwards(site):
    """D then A (walking, and running): the body turns 180 deg in 4 steps of 45 deg (0.2 s).  While it faces more
    than 90 deg away from where it moves, it must not move (it used to walk backwards: 10 frames walking, about
    0.6 m running); it then sets off the other way."""
    url = site[0]
    for keys in (["KeyD"], ["ShiftLeft", "KeyD"]):
        other = [k if k != "KeyD" else "KeyA" for k in keys]
        res = drive(url, [[{"op": "teleport", "x": -1.0, "z": 3.8, "facing": 0}, ticks(3)]
                          + [{"op": "down", "code": k} for k in keys] + [ticks(60), {"op": "up", "code": "KeyD"},
                                                                          {"op": "down", "code": "KeyA"}, ticks(60)]],
                    manual=True)[0]
        assert res["errors"] == []
        recs = res["results"][-1]
        back = 0.0
        for a, b in zip(recs, recs[1:]):
            dx, dz = b[3] - a[3], b[4] - a[4]
            if math.hypot(dx, dz) < 1e-9:
                continue
            f = math.radians(b[6])
            if dx * math.cos(f) + dz * math.sin(f) < -1e-6 * math.hypot(dx, dz):  # more than 90 deg off: its back that way
                back += math.hypot(dx, dz)
        assert back < 0.005, (keys, back)
        assert recs[-1][3] < recs[0][3] - 0.3 and recs[-1][6] == 180  # it did turn and go the other way


LEDGE = {"name": "ledgetest", "size": [8, 8], "grid": {"minor": 1.0, "major": 5.0},
         "elements": [{"type": "plateau", "at": [0.0, 1.0], "size": [3, 1.5], "height": 1.0}],
         "demo": {"stand": {"at": [0.0, -2.0], "facing": 90}}}


def test_a_plateau_top_hides_the_figure_standing_behind_it(server):
    """The figure stands just north of (behind) a 1 m plateau, 0.375 m from its edge; its card stands 0.3 m in
    front of the feet, towards the camera (like a guard's fists), still behind the edge.  The plateau's top is grass, i.e. GROUND, which gets the big depth allowance meant for the
    ground at the feet: with it the card was drawn over the top.  Now no red pixel lies over the top (ground
    1 m up, heights from our own unprojection of level_depth.png), the card's lower part is hidden, its top peeks."""
    root, url = server
    out, st = make_export(root / "ledge", layout=LEDGE, lean=0.3)
    red = ("() => { const s = window.bbDebug.state(), [bx, by, w, h] = s.box, out = [];"
           " for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) {"
           " const [r, g, b] = window.bbDebug.pixel(x - s.cam.x, y - s.cam.y);"
           " if (r > 90 && g < 50 && b < 50) out.push([x, y]); } return out; }")
    res = drive(url + "/ledge/host.html", [[{"op": "teleport", "x": 0.0, "z": -0.125, "facing": 90}, ticks(3),
                                             {"op": "eval", "js": red}, {"op": "rows"},
                                             {"op": "eval", "js": "() => window.bbDebug.drawnOver(0.3)"}]], manual=True)[0]
    assert res["errors"] == [] and res["results"][0] is True
    pts, rows, over = res["results"][2:]
    man = json.loads((out / "assets" / "manifest.json").read_text())
    lvm, cam = man["level"], man["camera"]
    dep = play.load_rgba(str(out / "assets" / "level_depth.png"))
    depth = play.unpack_depth16(dep, lvm["depth_lo"], lvm["depth_hi"])
    m = np.array(cam["world_to_screen"])
    xy = np.array(pts, float)
    w = (np.c_[xy + 0.5, depth[xy[:, 1].astype(int), xy[:, 0].astype(int)]] - m[:, 3]) @ np.linalg.inv(m[:, :3]).T
    height = (w[:, 1] - cam["ground_y"]) / cam["units_per_m"]
    on_top = int((height > 0.5).sum())
    print("red pixels", len(pts), "on the plateau top", on_top)
    assert len(pts) > 0 and on_top <= 6, on_top  # the head peeks over the top; on it at most one row of 6 px
    drawn = [i for i, (a, b) in enumerate(rows) if a]
    assert sum(b for a, b in rows) - sum(a for a, b in rows) >= 5 * 6 and max(drawn) < len(rows) - 5, rows
    assert over["over"] == []  # (nothing drawn thanks to the ground allowance over ground 0.3 m above the feet)


def test_the_two_canvases_stay_in_register_at_fractional_device_pixel_ratios(site):
    """The level canvas and the figure canvas must land on the same device-pixel grid: a device-pixel screenshot
    is compared with the page's own pixels inside the figure box and in a ring around it, at shifts of up to
    4 device px.  Both must match best at the same shift with <= 0.5 % mismatch (at dpr 2.625 in landscape the
    game area was centred on 160.125 device px and the grid lines broke at the box edges).  Phones of every common
    dpr, both orientations, and a turn from portrait to landscape."""
    url = site[0]
    probe = ("() => { const r = document.getElementById('view').getBoundingClientRect(), d = devicePixelRatio;"
             " return [r.left * d, r.top * d]; }")
    cases = [(dpr, vp, None) for dpr in (1, 1.25, 1.5, 1.75, 2, 2.625, 3) for vp in ((412, 915), (915, 412))]
    cases.append((2.625, (412, 915), (915, 412)))
    for dpr, vp, turn in cases:
        steps = [{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, ticks(3)]
        if turn:
            steps += [{"op": "viewport", "w": turn[0], "h": turn[1]}, {"op": "wait", "ms": 200}, ticks(3)]
        r = drive(url, [steps + [{"op": "align"}, {"op": "eval", "js": probe}]], vp, dpr, True, manual=True)[0]
        assert r["errors"] == []
        a, origin = r["results"][-2:]
        fig, ring = a["fig"]["best"], a["ring"]["best"]
        assert fig[1:] == ring[1:] and fig[0] <= 0.5 and ring[0] <= 0.5, (dpr, vp, turn, a)
        assert all(abs(v - round(v)) < 0.05 for v in origin), (dpr, vp, turn, origin)


IPHONES = [  # name, CSS px, dpr, safe-area insets [top, right, bottom, left] upright / on its side
    ("SE", (375, 667), 2, (20, 0, 0, 0), (0, 0, 0, 0)),
    ("13 mini", (375, 812), 3, (50, 0, 34, 0), (0, 50, 21, 50)),
    ("15", (393, 852), 3, (59, 0, 34, 0), (0, 59, 21, 59)),
    ("15 Pro Max", (430, 932), 3, (59, 0, 34, 0), (0, 59, 21, 59))]
FIT_PROBE = """() => {
  const R = (s) => { const e = document.querySelector(s); if (!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null;
                     const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const st = window.bbDebug.state();
  return { W: innerWidth, H: innerHeight, scroll: [document.documentElement.scrollWidth - innerWidth,
           document.documentElement.scrollHeight - innerHeight, scrollY], dpr: devicePixelRatio,
           app: R('.app'), bar: R('.bar'), play: R('#play'), stage: R('#stage'), view: R('#view'), bJ: R('#bJ'), hint: R('.pad-hint'),
           st: { view: st.view, box: st.box, cam: st.cam }, status: document.getElementById('status').hidden }; }"""


def test_the_page_fits_iphone_screens_inside_the_hosts_safe_area_padding(server, site):
    """iPhone SE, 13 mini, 15, 15 Pro Max, upright and on their side, in the host's skeleton (it pads :root by the
    safe-area insets; Chromium has none, so they are written in).  The page used to add the insets again
    (59 + 34 CSS px lost upright on a 15).  Now: everything inside the safe area, nothing to scroll, no inset counted
    twice, the game area on whole device pixels with the figure in view, the button and the stick hint inside the play
    area (upright: in the deck under the game area), a one-line header on a phone on its side."""
    root, base = server
    out = site[1]
    for name, (w, h), dpr, up, side in IPHONES:
        for orient, vp, ins in (("upright", (w, h), up), ("side", (h, w), side)):
            page = host_phone(out, "fit_" + re.sub(r"\W", "", name + orient), ins)
            res = drive(f"{base}/tiny/{page}", [[{"op": "teleport", "x": 1.0, "z": 3.0, "facing": 0}, {"op": "wait", "ms": 300},
                                                  {"op": "eval", "js": FIT_PROBE}]], vp, dpr, True)[0]
            assert res["errors"] == [], (name, orient, res["errors"])
            m = res["results"][-1]
            t, r, b, lft = ins
            safe = [lft, t, m["W"] - r, m["H"] - b]
            inside = lambda q, box: box is not None and q[0] >= box[0] - 0.5 and q[1] >= box[1] - 0.5 and \
                q[2] <= box[2] + 0.5 and q[3] <= box[3] + 0.5  # noqa: E731
            why = (name, orient, m)
            assert m["status"] and m["scroll"] == [0, 0, 0], why
            for k in ("bar", "play", "stage", "bJ", "hint"):
                assert inside(m[k], safe), (k,) + why
            assert inside(m["bJ"], m["play"]) and inside(m["hint"], m["play"]) and inside(m["view"], m["stage"]), why
            assert m["bar"][1] - safe[1] <= 8.5 and safe[3] - m["play"][3] <= 8.5, why   # no inset twice
            v, box, cam = m["st"]["view"], m["st"]["box"], m["st"]["cam"]
            assert box[0] - cam["x"] >= 0 and box[1] - cam["y"] >= 0 and box[0] + box[2] - cam["x"] <= v["w"] \
                and box[1] + box[3] - cam["y"] <= v["h"], why          # the figure in view
            assert abs(m["stage"][1] * dpr - round(m["stage"][1] * dpr)) < 0.02, why   # (two canvases in register)
            assert v["sDev"] == {2: 3, 3: 4}[dpr], why   # density 2: 1.5 CSS px per art px, 4.5 rounded down at dpr 3
            share = (m["stage"][3] - m["stage"][1]) / (safe[3] - safe[1])
            if orient == "upright":
                assert m["bJ"][1] >= m["stage"][3] and m["hint"][1] >= m["stage"][3], why   # thumbs under the game
                assert 0.55 <= share and (m["stage"][3] - m["stage"][1]) <= 1.4 * (m["stage"][2] - m["stage"][0]) + 1, (share,) + why
            else:
                assert m["bar"][3] - m["bar"][1] <= 22 and share >= 0.88, (share,) + why
    # opened on its own (no host padding): the page pads the insets itself, once
    page = host_phone(out, "fit_alone", (59, 0, 34, 0), root_pad=False)
    m = drive(f"{base}/tiny/{page}", [[{"op": "wait", "ms": 300}, {"op": "eval", "js": FIT_PROBE}]], (393, 852), 3, True)[0]["results"][-1]
    assert 59 <= m["bar"][1] <= 59 + 8.5 and 852 - 34 - 8.5 <= m["play"][3] <= 852 - 34, m
    # the visible area shrinks under the layout (a keyboard, a browser bar over the page): the app shrinks to it
    shrink = """() => { const vv = { scale: 1, offsetTop: 0, height: innerHeight - 300, addEventListener() {} };
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      window.dispatchEvent(new Event('resize')); return 1; }"""
    m = drive(f"{base}/tiny/{page}", [[{"op": "wait", "ms": 200}, {"op": "eval", "js": shrink}, {"op": "wait", "ms": 200},
                                       {"op": "eval", "js": FIT_PROBE}]], (393, 852), 3, True)[0]["results"][-1]
    assert m["app"][3] <= 852 - 300 + 0.5 and m["bJ"][3] <= 852 - 300 and m["scroll"][2] == 0, m


# ---------------------------------------------------------------- the real build (slow)
BUILD = Path(os.environ.get("PLAY_BUILD", ROOT / "out" / "play6"))


@pytest.fixture(scope="module")
def real(server):
    if not (BUILD / "assets" / "manifest.json").exists():
        pytest.skip(f"needs {BUILD} (play.py build)")
    root, url = server
    site = root / "real"
    site.mkdir()
    os.symlink((BUILD / "assets").resolve(), site / "assets")
    host_page(site, BUILD / "index.html")
    return url + "/real/host.html"


@pytest.mark.slow
def test_real_build_audit_spots(real):
    rows = {"op": "rows"}
    over = {"op": "eval", "js": "() => window.bbDebug.drawnOver(0.3)"}
    pond = [[{"op": "teleport", "x": -9.0, "z": 12.4, "facing": f}, ticks(3), rows] for f in (0, 90, 180, 270)]
    # behind the 1.6 m plateau (audit 3, finding 1) and the next worst spots of the auditor's scan
    behind = [[{"op": "teleport", "x": x, "z": -14.375, "facing": 45}, ticks(3), rows, over] for x in (12.375, 6.125, 19.375)]
    res = drive(real, [
        # bug 1: north of the cone tree at (17, -12), the crown covers the feet on screen, the ground is lit
        [{"op": "teleport", "x": 16.375, "z": -18.125, "facing": 90}, ticks(3), {"op": "state"}],
        # bug 5: the diagonal pocket between two rocks is out of reach
        [{"op": "eval", "js": "() => window.bbDebug.canStep(-2.375, 1.125, -2.625, 0.875)"}],
    ] + pond + behind, (1280, 800), manual=True)
    assert all(r["errors"] == [] for r in res)
    assert res[0]["results"][-1]["shade"] is False
    assert res[1]["results"][0] is False
    # bug 4: on the pond's south bank the feet (the bottom 10 rows of the figure) are drawn, every pixel
    for r in res[2:6]:
        assert r["results"][0] is True
        rr = [(a, b) for a, b in r["results"][-1] if b]
        assert sum(b - a for a, b in rr[-10:]) == 0, rr[-10:]
    # finding 1: standing behind the plateau, only the head shows over its top - nothing is drawn on the top
    for r in res[6:]:
        assert r["results"][0] is True
        rr, ov = r["results"][-2:]
        assert ov["over"] == [], ov["over"][:5]
    rr = res[6]["results"][-2]
    drawn = [i for i, (a, b) in enumerate(rr) if a]
    assert drawn and max(drawn) < 0.25 * len(rr), (drawn, len(rr))  # (12.375, -14.375): the head, not the shoulders


@pytest.mark.slow
def test_real_build_frame_time_with_4x_cpu_throttle(real):
    """The page's own work per display frame (update + camera + compositing the figure box: performance.now()
    around it, 0.1 ms resolution; not the browser's compositing) while running, with the CPU throttled 4x (a
    slow phone).  Measured here: median 0.5-0.8 ms, p95 1.4-1.8 ms.  Bound: median < 1.5 ms and p95 < 4 ms, a
    quarter of a 60 Hz frame (a regression to whole-screen drawing measured 10 ms, p95 15 ms)."""
    for vp, dsf, touch in (((390, 844), 3, True), ((1280, 800), 1, False)):
        res = drive(real, [[{"op": "teleport", "x": -1.0, "z": 4.4, "facing": 0}, {"op": "down", "code": "ShiftLeft"},
                            {"op": "down", "code": "KeyD"}, {"op": "wait", "ms": 3000}, {"op": "frames"}]],
                    vp, dsf, touch, cpu=4)[0]
        t = np.array(res["results"][-1])
        assert res["errors"] == [] and len(t) >= 120, len(t)
        assert np.median(t) < 1.5 and np.percentile(t, 95) < 4.0, (vp, np.percentile(t, [50, 95]))


@pytest.mark.slow
def test_real_build_one_two_moves_inside_the_sprites_and_comes_back(real):
    """The real one-two lunges (its root motion is inside the sprites): the drawn figure moves several pixels and
    comes back, while the anchor, and so the camera, do not move at all - also right after a walk and a stop
    (whose root motion moved the anchor)."""
    res = drive(real, [[{"op": "teleport", "x": -1.0, "z": 4.4, "facing": 0}, ticks(3), {"op": "down", "code": "KeyD"},
                        ticks(60), {"op": "up", "code": "KeyD"}, ticks(90)]
                       + [{"op": "press", "code": "KeyJ"}, ticks(150)] * 3], (1280, 800), manual=True)[0]
    assert res["errors"] == []
    recs = flat(res["results"])
    walked = [r for r in recs if r[0] in ("walk", "start")]
    assert walked and recs[0][3] < walked[-1][3]
    i0 = next(i for i, r in enumerate(recs) if r[0] == "onetwo") - 1
    still = recs[i0:]
    assert still[0][0] == "idle" and {(r[3], r[4]) for r in still} == {(still[0][3], still[0][4])}
    assert sum(1 for a, b in zip(still, still[1:]) if a[0] == "idle" and b[0] == "onetwo") == 3
    man = json.loads((BUILD / "assets" / "manifest.json").read_text())["sprites"]
    cx = [man["frames"][r[5]][4] + man["frames"][r[5]][2] / 2 for r in still]  # box centre - anchor, art px
    assert max(cx) - min(cx) >= 4, (min(cx), max(cx))  # the lunge (18.6 cm = 6 art px)
    idle = [c for r, c in zip(still, cx) if r[0] == "idle"]
    assert max(idle) - min(idle) <= 1  # back where it was after every one-two
    res = drive(real, [[{"op": "teleport", "x": -1.0, "z": 4.4, "facing": 0}, ticks(3), {"op": "press", "code": "KeyJ"}]
                       + [ticks(10), {"op": "state"}] * 16], (1280, 800), manual=True)[0]
    cams = {(s["cam"]["x"], s["cam"]["y"]) for s in res["results"] if isinstance(s, dict)}
    assert len(cams) == 1, cams


@pytest.mark.slow
def test_real_build_cuts_are_one_frame_and_root_motion_continuous(real):
    """walk -> stop, walk -> run -> walk with the timestamps of a 60 Hz display: at every cut from a gait the page
    shows the gait's entry frame and then the transition's frame 0, and the joint jump between the two (poses
    from moves.py) is the one moves.py reports for that cut; the figure moves by about one frame's travel there
    (no double step, no standstill)."""
    import moves as mv  # noqa: PLC0415

    clip = ROOT / "out" / "onetwo4" / "5m" / "clip.npz"
    if not clip.exists():
        pytest.skip("needs out/onetwo4/5m/clip.npz")
    res = drive(real, [[{"op": "teleport", "x": -1.0, "z": 4.4, "facing": 0}, ticks(3), {"op": "down", "code": "KeyD"},
                        ticks(150), {"op": "up", "code": "KeyD"}, ticks(90)],
                       [{"op": "teleport", "x": -6.0, "z": 4.4, "facing": 0}, ticks(3), {"op": "down", "code": "KeyD"},
                        ticks(72), {"op": "down", "code": "ShiftLeft"}, ticks(72), {"op": "up", "code": "ShiftLeft"},
                        ticks(72), {"op": "up", "code": "KeyD"}, ticks(72)]], (1280, 800), manual=True)
    m = mv.Moves(str(clip))
    loops, T = m.loops(), m.transitions()
    seen = set()
    for r in res:
        assert r["errors"] == []
        recs = flat(r["results"])
        for i in range(2, len(recs) - 1):
            a, b = recs[i - 1], recs[i]
            if a[0] not in ("walk", "run") or b[0] == a[0]:
                continue
            t, n = T[b[0]], len(loops[a[0]])
            assert a[2] == round(t["enter"] * n) % n and b[1] == 0, (a, b)
            deg = mv.jump_deg(loops[a[0]][a[2]], t["frames"][0])[0]
            assert deg < 14.0, (b[0], deg)   # (the rebuilt run: run -> r2w 13.55 deg, as moves.py report says)
            step = [math.hypot(q[3] - p[3], q[4] - p[4]) for p, q in zip(recs[i - 2:i + 1], recs[i - 1:i + 2])]
            assert 0.6 < step[1] / step[0] < 1.4 and 0.6 < step[2] / step[1] < 1.4, (b[0], step)
            seen.add(b[0])
    assert seen & {"stopA", "stopB"} and seen & {"w2r_0", "w2r_5"} and seen & {"r2w_0", "r2w_5"}, seen


@pytest.mark.slow
def test_real_build_j_while_running_punches_within_a_third_of_a_second(real):
    """J while running / walking: from the key press to the first display frame whose lead (left) hand is 5 cm or
    more ahead of its guard position (the jab reaching out; poses from moves.py).  Run: <= 0.35 s, walk: <= 0.6 s
    (quick stops every 1/8 run cycle, every 1/4 walk cycle: the walk cycle is 1.0 s since the rebuilt gait, so up to
    0.25 s of waiting; measured 0.55 s, was 0.45 with the 0.8 s cycle).  Then a press late in the one-two chains the next one:
    its first frame follows the last with a small joint jump."""
    import moves as mv  # noqa: PLC0415

    clip = ROOT / "out" / "onetwo4" / "5m" / "clip.npz"
    if not clip.exists():
        pytest.skip("needs out/onetwo4/5m/clip.npz")
    m = mv.Moves(str(clip))
    loops, ot, T = m.loops(), m.onetwo(), m.transitions()
    hand = mv.rig.SKELETON.index["handL"]
    guard = float(ot[0].mats()[hand, 2, 3]) * mv.M

    def pose(r):  # the pose a display frame showed
        if r[0] in ("walk", "run"):
            return loops[r[0]][r[2]]
        if r[0] == "idle":
            return loops["idle"][r[1]]
        return ot[r[1]] if r[0] == "onetwo" else T[r[0]]["frames"][r[1]]
    out = {}
    for keys, bound, t0 in ((["ShiftLeft", "KeyD"], 0.35, 90), (["KeyD"], 0.6, 60)):  # (t0: the start / w2r are over)
        worst = 0
        for wait in range(t0, t0 + 24, 3):  # J at 8 points of the gait cycle
            res = drive(real, [[{"op": "teleport", "x": -6.0, "z": 4.4, "facing": 0}, ticks(3)]
                               + [{"op": "down", "code": k} for k in keys]
                               + [ticks(wait), {"op": "press", "code": "KeyJ"}, ticks(40)]], (1280, 800), manual=True)[0]
            assert res["errors"] == []
            after = res["results"][-1]
            reach = next(i for i, r in enumerate(after) if float(pose(r).mats()[hand, 2, 3]) * mv.M >= guard + 0.05)
            worst = max(worst, (reach + 1) / 60)
            assert not any(r[0].startswith(("stop", "r2w")) for r in after)
        out[keys[-1] if len(keys) == 1 else "run"] = worst
        assert worst <= bound, (keys, worst)
    print("J -> jab reaching out, worst of 8 phases:", out)
    res = drive(real, [[{"op": "teleport", "x": -1.0, "z": 4.4, "facing": 0}, ticks(3), {"op": "press", "code": "KeyJ"},
                        ticks(100), {"op": "press", "code": "KeyJ"}, ticks(80)]], (1280, 800), manual=True)[0]
    recs = flat(res["results"])
    i = next(i for i, r in enumerate(recs) if r[0] == "onetwo" and r[1] == 0 and i > 10)
    assert recs[i - 1][:2] == ["onetwo", len(ot) - 1]
    assert mv.jump_deg(ot[-1], ot[0])[0] < 2.5


@pytest.fixture(scope="module")
def real_now(server):
    """The page as it is now (the template) on the real build's assets: the stick's numbers with the real clips."""
    if not (BUILD / "assets" / "manifest.json").exists():
        pytest.skip(f"needs {BUILD} (play.py build)")
    root, url = server
    site = root / "real_now"
    site.mkdir()
    os.symlink((BUILD / "assets").resolve(), site / "assets")
    host_page(site, PAGE)
    return url + "/real_now/host.html"


@pytest.mark.slow
def test_real_build_stick_numbers(real_now):
    """The stick with the real clips (60 Hz, a scripted thumb; README "터치 스틱 QC" has the table): a reversal
    moves off the other way at >= 80 % speed within 100 ms (was 150 ms), the thumb on a facing edge changes the
    facing at most twice in 3 s (was 11 times a second), resting at the run threshold never drops back to a walk,
    standing to a run at >= 80 % speed within 0.9 s (0.95 s before play5c; then 0.55 s once the walk start led straight
    into walk -> run; 0.87 s since the rebuilt start: 36 frames with the weight shift, was 24),
    and a 2 s circle at run is followed within 5 deg (95th percentile; was 9 deg)."""
    at = (-0.6, 1.625)
    walk = Finger().down().polar(0, 0.7, 70).mark("t").polar(180, 0.7, 30)
    runr = Finger().down().polar(0, 1.0, 70).mark("t").polar(180, 1.0, 30)
    edge = Finger().down()
    for i in range(180):
        edge.polar(22.5 + 4 * math.sin(2 * math.pi * 3 * i / 60), 0.7)
    hover = Finger().down().polar(0, 1.0, 80).mark("t")
    for i in range(180):
        hover.polar(0, 0.8 + 0.04 * math.sin(2 * math.pi * 2 * i / 60))
    go = Finger().tick(2).down().mark("t").polar(0, 1.0, 60)
    circ = Finger().down().polar(0, 1.0, 30).mark("t")
    for i in range(240):
        circ.polar(360 * i / 120, 1.0)
    a, b, c, d, e, f = drag(real_now, [walk, runr, edge, hover, go, circ], at=at)
    for recs, fg, speed in ((a, walk, 0.7 * 1.4), (b, runr, 3.75)):
        g = fg.marks["t"]
        t80 = next(i for i in range(g, len(recs)) if -(recs[i][3] - recs[i - 1][3]) * 60 >= 0.8 * speed) - g + 1
        assert t80 / 60 <= 0.1, t80
    facings = [r[6] for r in c[60:]]
    assert sum(1 for p, q in zip(facings, facings[1:]) if p != q) <= 2, facings
    names = [r[0] for r in d[hover.marks["t"]:]]
    assert "run" in names and not any(x.startswith("r2w") for x in names), sorted(set(names))
    g = go.marks["t"]
    t80 = next(i for i in range(g, len(e)) if (e[i][3] - e[i - 1][3]) * 60 >= 0.8 * 3.75) - g + 1
    assert t80 / 60 <= 0.9, t80
    g = circ.marks["t"]
    v = np.diff(np.array([[r[3], r[4]] for r in f[g - 1:g + 240]]), axis=0)
    want = 360 * np.arange(240) / 120
    err = np.abs((np.degrees(np.arctan2(v[:, 1], v[:, 0])) - want + 540) % 360 - 180)[np.hypot(*v.T) > 1e-6]
    assert np.percentile(err[60:], 95) <= 5, np.percentile(err[60:], 95)

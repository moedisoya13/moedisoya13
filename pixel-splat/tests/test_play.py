"""Playable web build of the gray-box map (examples/map/play.py): the encodings the page decodes, the
walkable cells, the manifest <-> files check, and the page template's hosting rules.  CPU, seconds."""
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "examples" / "map"))
import graybox  # noqa: E402
import isocam  # noqa: E402
import level as lv  # noqa: E402
import play  # noqa: E402


# ------------------------------------------------------------------ encodings
def test_depth_packing_round_trip():
    rng = np.random.default_rng(0)
    d = rng.uniform(283.0, 317.0, (40, 50))
    valid = rng.uniform(size=d.shape) > 0.2
    lit = np.where(rng.uniform(size=d.shape) > 0.5, 255, 0).astype(np.uint8)
    rgba = play.pack_depth16(d, valid, 283.0, 317.0, lit)
    assert rgba.dtype == np.uint8 and rgba.shape == (40, 50, 4) and (rgba[..., 3] == 255).all()
    back = play.unpack_depth16(rgba, 283.0, 317.0)
    step = 34.0 / 65534
    assert np.abs(back[valid] - d[valid]).max() <= step / 2 + 1e-9
    assert np.isinf(back[~valid]).all()
    np.testing.assert_array_equal(rgba[..., 2], lit)
    # the page's own formula (index.html): q = R*256 + G; depth = lo + q * (hi - lo) / (empty - 1)
    q = rgba[..., 0].astype(np.float64) * 256 + rgba[..., 1]
    np.testing.assert_allclose(283.0 + q[valid] * 34.0 / (play.DEPTH_EMPTY - 1), back[valid])


def test_sprite_offsets_and_heights_round_trip():
    rng = np.random.default_rng(1)
    off = rng.uniform(-1.5, 1.5, (20, 30))
    m = rng.uniform(size=off.shape) > 0.3
    rgba = play.pack_offset16(off, m)
    back = play.unpack_offset16(rgba)
    assert np.abs(back[m] - off[m]).max() <= 0.5 / play.SPRITE_DEPTH_SCALE + 1e-12
    assert (back[~m] == 0).all()
    h = rng.uniform(-0.4, 2.0, (16, 12))
    walk = rng.uniform(size=h.shape) > 0.5
    hb, wb = play.unpack_height(play.pack_height(h, walk))
    assert np.abs(hb - h).max() <= 0.0005 + 1e-12
    np.testing.assert_array_equal(wb, walk)


def test_world_to_screen_is_the_bake_camera():
    cam = isocam.level_camera(isocam.RefCam(), [-24, -2, -20], [24, 8, 20])
    M = np.array(play.world_to_screen(cam))
    P = np.random.default_rng(2).uniform(-20, 20, (25, 3))
    np.testing.assert_allclose(np.c_[P, np.ones(len(P))] @ M.T, isocam.project(cam, P), atol=1e-9)


# ------------------------------------------------------------------ walkable cells
@pytest.fixture(scope="module")
def grid():
    return play.walk_grid(lv.Level.load(), 0.25)


def _walk(grid, x, z):
    j, i = play.cell_of(grid, x, z)
    return bool(grid["walk"][j, i])


def test_walkable_mask_blocks_water_trunks_rocks_cliffs_and_the_rim(grid):
    L = lv.Level.load()
    stand = L.demo["stand"]["at"]
    assert _walk(grid, *stand)  # the page starts here
    pond = L.of("pond")[0]["at"]
    assert not _walk(grid, *pond)
    for t in L.of("tree"):
        assert not _walk(grid, *t["at"]), t["at"]
    for r in L.of("rock"):
        assert not _walk(grid, *r["at"]), r["at"]
    assert not _walk(grid, 10.0, -4.0)  # the plateau's south cliff, west of the ramp
    assert not _walk(grid, 23.9, 0.0) and not _walk(grid, 0.0, -19.9)  # the rim
    assert _walk(grid, 13.0, -1.5) and _walk(grid, 13.0, -9.0)  # ramp middle, plateau top
    assert 0.85 < grid["walk"].mean() < 0.97


def test_the_ramp_connects_the_meadow_and_the_plateau(grid):
    L = lv.Level.load()
    reach = play.reachable(grid, L.demo["stand"]["at"])
    j, i = play.cell_of(grid, 13.0, -9.0)
    assert reach[j, i]  # up the ramp
    j, i = play.cell_of(grid, 4.5, -11.0)
    assert grid["walk"][j, i] and not reach[j, i]  # the ledge: cliffs on every side, no way up
    # without the ramp the plateau is cut off: the connection really is the ramp
    d = json.loads(json.dumps(L.layout))
    d["elements"] = [e for e in d["elements"] if e["type"] != "ramp"]
    g2 = play.walk_grid(lv.Level(d), 0.25)
    j, i = play.cell_of(g2, 13.0, -9.0)
    assert not play.reachable(g2, L.demo["stand"]["at"])[j, i]


# ------------------------------------------------------------------ export + check
@pytest.fixture(scope="module")
def tiny_export(tmp_path_factory):
    """Level layers of a tiny baked level + two synthetic sprite frames, through the same writers."""
    layout = {"name": "t", "size": [8, 6], "grid": {"minor": 1.0, "major": 5.0}, "elements": [
        {"type": "plateau", "at": [2, -1], "size": [2, 2], "height": 1.0},
        {"type": "tree", "at": [-2, -1], "height": 2.0, "radius": 0.6, "canopy": "sphere"}],
        "demo": {"stand": {"at": [0, 1.5], "facing": 60}}}
    bake = tmp_path_factory.mktemp("bake")
    _, data = graybox.bake(lv.Level(layout), isocam.RefCam(), spacing=0.25, shadow_res=64, log=lambda *a: None)
    np.savez_compressed(bake / graybox.BAKE_FILE, **data)
    (bake / "layout_used.json").write_text(json.dumps(layout))
    out = tmp_path_factory.mktemp("play")
    assets = out / "assets"
    assets.mkdir()
    st = graybox.Stage(str(bake))
    level = play.export_level(st, str(assets), 0.25, log=lambda *a: None)
    frames = []
    for k in range(2):
        rgba = np.zeros((5, 4, 4), np.uint8)
        rgba[1:4, 1:3] = [200, 150, 90, 255]
        frames.append(dict(rgba=rgba, data=play.pack_offset16(np.full((5, 4), -0.1 * k), rgba[..., 3] > 0),
                           ox=-2, oy=-4))
    color, dat, rects = play.pack_atlas(frames, width=16)
    play.save_rgba(color, str(assets / "sprites.png"))
    play.save_rgba(dat, str(assets / "sprites_data.png"))
    manifest = dict(level=level, sprites=dict(color="sprites.png", data="sprites_data.png", facings=[0],
                                              frames=[r + [f["ox"], f["oy"]] for r, f in zip(rects, frames)],
                                              anims={"walk": dict(frames=[[0, 1]], loop=True),
                                                     "punch": dict(frames=[[1, 0]], loop=False, root=[[0, 0], [0.1, 0]])}))
    (assets / "manifest.json").write_text(json.dumps(manifest))
    (out / "index.html").write_text("<title>t</title>")
    return out, st, level


def test_level_layers_match_the_bake(tiny_export):
    out, st, level = tiny_export
    W, H = st.cam.width, st.cam.height
    assert level["size"] == [W, H]
    col = play.load_rgba(str(out / "assets" / "level.png"))
    np.testing.assert_array_equal(col[..., :3], play.to_u8(st.frame(0, 0, W, H)))
    dep = play.load_rgba(str(out / "assets" / "level_depth.png"))
    d = play.unpack_depth16(dep, level["depth_lo"], level["depth_hi"])
    covered = st.gb["alpha"] > 0.5
    np.testing.assert_array_equal(np.isfinite(d), covered)
    assert np.abs(d[covered] - st.gb["depth"][covered]).max() < (level["depth_hi"] - level["depth_lo"]) / 65534
    assert ((dep[..., 2] == 0) & covered).any() and ((dep[..., 2] == 255) & covered).any()  # shade and sun
    # one row down on flat ground: nearer by 1 / (m tan e)
    assert level["flat_depth_per_row"] == pytest.approx(-1 / (11.1 * math.tan(math.radians(45))), rel=1e-6)
    assert all(0.3 < r < 0.8 for r in level["shadow_ratio"])
    h, walk = play.unpack_height(play.load_rgba(str(out / "assets" / "terrain.png")))
    assert h.shape == (24, 32) and h.max() == pytest.approx(1.0) and walk.any() and not walk.all()


def test_check_finds_a_consistent_export_and_the_broken_ones(tiny_export, tmp_path):
    import shutil

    out, _, _ = tiny_export
    assert play.check(str(out)) == []
    bad = tmp_path / "bad"
    shutil.copytree(out, bad)
    m = json.loads((bad / "assets" / "manifest.json").read_text())
    m["sprites"]["frames"][1][0] = 30  # off the 16-px-wide atlas
    m["sprites"]["anims"]["punch"]["root"] = [[0, 0]]  # one root entry for two frames
    m["sprites"]["anims"]["walk"]["frames"] = [[0, 7]]  # a frame that does not exist
    (bad / "assets" / "manifest.json").write_text(json.dumps(m))
    (bad / "assets" / "terrain.png").unlink()
    problems = play.check(str(bad))
    assert len(problems) == 4, problems
    assert any("terrain.png missing" in p for p in problems) and any("frame 1 lies outside" in p for p in problems)


PLAY = ROOT / "out" / "play"


@pytest.mark.skipif(not (PLAY / "assets" / "manifest.json").exists(), reason="needs a built out/play (play.py build)")
def test_the_built_page_is_consistent():
    assert play.check(str(PLAY)) == []
    m = json.loads((PLAY / "assets" / "manifest.json").read_text())
    S = m["sprites"]
    assert S["facings"] == list(range(0, 360, 45))
    assert len(S["anims"]["walk"]["frames"][0]) == play.WALK_FRAMES
    for name in ("onetwo", "inout"):
        assert S["anims"][name]["fps"] == pytest.approx(30.0)
    size = sum(p.stat().st_size for p in PLAY.rglob("*") if p.is_file())
    assert size < 8e6


# ------------------------------------------------------------------ the page template
def test_page_template_follows_the_hosting_rules():
    html = play.TEMPLATE.read_text()
    first = [ln for ln in html.splitlines() if ln.strip()][:2]
    assert first == ["<title>BB 필드 테스트</title>", '<meta name="claude:viewport-fit-sides" content="cover">']
    low = html.lower()
    for tag in ("<!doctype", "<html", "<head", "<body"):
        assert not re.search(re.escape(tag) + r"[\s>]", low), tag  # (<header> is fine)
    assert low.count("<style") == 1
    for call in ("alert(", "confirm(", "prompt(", "window.open", "download"):
        assert call not in html, call
    assert "<script src" not in low and "@import" not in low
    for url in re.findall(r"""(?:fetch|loadImage)\(\s*["'`]([^"'`]+)""", html):
        assert not re.match(r"^[a-z]+:|^//|^/", url), url  # relative URLs only
    assert "localstorage" not in low or "try" in low
    assert "100vh" not in html and "height: 100%" in html
    assert "max(16px, env(safe-area-inset-left, 0px))" in html and "max(16px, env(safe-area-inset-right, 0px))" in html
    assert "prefers-reduced-motion" in html and "color-scheme: dark" in html and ":focus-visible" in html
    assert len(html.encode()) < 40_000

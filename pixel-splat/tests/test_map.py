"""Gray-box map example: layout -> geometry (heights, materials, splats) and the reference camera's
math (orthographic projection, whole-pixel windows, sub-pixel scrolling).  CPU, a few seconds."""
import math
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples" / "map"))
import graybox  # noqa: E402
import isocam  # noqa: E402
import level as lv  # noqa: E402
from pixelsplat.raster import RasterConfig, rasterize  # noqa: E402
from pixelsplat.shade import gbuffer_from_render  # noqa: E402

U = lv.UNITS_PER_M
quiet = lambda *a: None  # noqa: E731


def small_layout(**extra):
    d = {"name": "t", "size": [8, 6], "grid": {"minor": 1.0, "major": 5.0}, "elements": [
        {"type": "plateau", "at": [2, -1], "size": [2, 2], "height": 1.0, "rot": 0},
        {"type": "ramp", "at": [2, 1], "size": [2, 1], "rot": -90, "height": [0.0, 1.0]},
        {"type": "hill", "at": [-2, -1], "radius": 1.5, "height": 0.5},
        {"type": "pond", "at": [-2, 1.5], "radius": [1.0, 0.6], "depth": 0.3, "bank": 0.4},
        {"type": "path", "points": [[-4, 0], [0, 0]], "width": 0.5},
        {"type": "spawn", "at": [0, 2], "facing": 0},
        {"type": "rock", "at": [0.5, -2], "size": [1.0, 0.6, 0.8], "rot": 30},
        {"type": "tree", "at": [-3.2, -2.2], "height": 2.0, "radius": 0.6, "canopy": "cone"},
        {"type": "tree", "at": [3.3, 2.2], "height": 2.0, "radius": 0.6, "canopy": "sphere"}]}
    d.update(extra)
    return d


@pytest.fixture(scope="module")
def level():
    return lv.Level(small_layout())


@pytest.fixture(scope="module")
def splats(level):
    return level.splats(0.25)


# ------------------------------------------------------------------ layout -> heights / materials
def test_default_layout_loads_and_has_the_blockout_elements():
    L = lv.Level.load()
    kinds = L.summary()
    for k in ("hill", "plateau", "ramp", "pond", "path", "rock", "tree", "spawn"):
        assert kinds.get(k, 0) >= 1, k
    for key in ("stand", "walk"):
        assert key in L.demo
    with pytest.raises(ValueError):
        lv.Level({"size": [4, 4], "elements": [{"type": "castle"}]})


def _problems(**changes):
    """Problems of the small layout with one element replaced / added: changes = {index: element}."""
    d = small_layout()
    for i, e in changes.items():
        i = int(i[1:])
        if i < len(d["elements"]):
            d["elements"][i] = e
        else:
            d["elements"].append(e)
    with pytest.raises(lv.LayoutError) as err:
        lv.Level(d)
    return err.value.problems, str(err.value)


def test_layout_errors_name_the_element_and_the_field():
    """These used to be a bare KeyError: 'radius' / 'cannot unpack non-iterable int object', or nothing."""
    probs, text = _problems(e3={"type": "pond", "name": "pond", "at": [-2, 1.5], "radius": 4, "depth": 0.3})
    assert len(probs) == 1 and "elements[3]" in probs[0] and "pond 'pond'" in probs[0] and "'radius'" in probs[0]
    assert "[a, b]" in probs[0] and "지금: 4" in probs[0] and text.startswith("layout.json에 고칠 곳이 1개")
    probs, _ = _problems(e2={"type": "hill", "at": [-2, -1], "height": 0.5})
    assert "elements[2]" in probs[0] and "'radius' 값이 없습니다" in probs[0]
    probs, _ = _problems(e0={"type": "plateau", "at": [2, -1], "size": [2, 2], "height": 1.0, "rotation": 45})
    assert "모르는 항목 'rotation'" in probs[0] and "혹시 'rot'" in probs[0]
    probs, _ = _problems(e0={"type": "plateau", "at": [2, -1], "size": [2, 2], "height": -1.0})
    assert "'height'는 0보다 큰 숫자" in probs[0]
    probs, _ = _problems(e9={"type": "tree", "at": [3.9, 0], "height": 2.0, "radius": 0.6})  # canopy over the edge
    assert "elements[9]" in probs[0] and "맵 밖" in probs[0]
    probs, _ = _problems(e9={"type": "rock", "at": [30, 0], "size": [1, 1, 1]})
    assert "맵 밖" in probs[0]
    probs, _ = _problems(e9={"type": "tree", "at": [0, 0], "height": 2.0, "radius": 2.5, "canopy": "sphere"})
    assert "radius(2.5)는 height(2.0)보다" in probs[0]
    probs, _ = _problems(e9={"type": "towr", "at": [0, 0]})
    assert "모르는 종류" in probs[0] and "'tower'" not in probs[0]
    probs, _ = _problems(e9={"type": "ramp", "at": [0, 0], "size": [2, 1], "height": 1.0, "name": "r"})
    assert "ramp 'r'" in probs[0] and "[시작, 끝]" in probs[0]
    probs, _ = _problems(e9={"type": "path", "points": [[0, 0]], "width": 1}, e10={"type": "spawn", "at": [0, True]})
    assert len(probs) == 2 and "elements[10]" in probs[1]
    # several problems are listed together, and the top level / demo are checked as well
    bad = dict(small_layout(), sizee=[1, 2], demo={"stand": {"at": [99, 0]}, "wlak": {}})
    with pytest.raises(lv.LayoutError) as err:
        lv.Level(bad)
    msgs = err.value.problems
    assert any("'sizee'" in m and "혹시 'size'" in m for m in msgs)
    assert any(m.startswith("demo.stand") and "맵 밖" in m for m in msgs)
    assert any("'wlak'" in m and "혹시 'walk'" in m for m in msgs)
    assert isinstance(err.value, ValueError)


def test_layout_json_syntax_errors_say_where(tmp_path):
    p = tmp_path / "broken.json"
    p.write_text('{"size": [8, 6],\n "elements": [\n  {"type": "hill" "at": [0, 0]}\n ]}')
    with pytest.raises(lv.LayoutError, match="3번째 줄"):
        lv.Level.load(p)


def test_the_shipped_layouts_are_valid():
    assert lv.validate_layout(lv.Level.load().layout) == []
    assert lv.validate_layout(small_layout()) == []


def test_bounds_hold_stacked_hills():
    """Overlapping hills add up: the framing box used to take only the tallest single hill."""
    L = lv.Level({"size": [10, 10], "elements": [{"type": "hill", "at": [0, 0], "radius": 3.0, "height": 1.0}
                                               for _ in range(3)] +
                  [{"type": "hill", "at": [0.5, 0.2], "radius": 2.0, "height": 0.8}]})
    lo, hi = L.bounds_world()
    sp = L.splats(0.25)
    assert ((sp.pos[:, 1] - lv.GROUND) / U).max() > 3.5  # ~3.8 m: well above any single hill
    assert (sp.pos >= lo - 1e-4).all() and (sp.pos <= hi + 1e-4).all()


def test_units_match_the_soldier():
    assert 1.75 * U == pytest.approx(1.80)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples" / "soldier"))
    import rig  # noqa: PLC0415

    assert rig.H == pytest.approx(1.75 * U) and rig.GROUND == lv.GROUND


def test_heights(level):
    assert level.height(2.0, -1.0) == pytest.approx(1.0)  # on the plateau
    assert level.height(3.5, -1.0) == pytest.approx(0.0)  # beside it
    assert level.height(2.0, 1.0) == pytest.approx(0.5)  # middle of the ramp
    assert level.height(2.0, 0.05) == pytest.approx(0.975)  # near its top (rot -90: it climbs towards -z)
    assert level.height(2.0, 1.95) == pytest.approx(0.025)
    assert level.height(-2.0, -1.0) == pytest.approx(0.5)  # hill top
    assert level.height(-2.0, -2.6) == pytest.approx(0.0)  # beyond its radius
    assert level.height(-2.0, 1.5) == pytest.approx(-0.3)  # pond floor
    x, z = np.meshgrid(np.linspace(-4, 4, 9), np.linspace(-3, 3, 7))
    assert level.height(x, z).shape == (7, 9)


def test_ramp_is_linear_and_rotates():
    L = lv.Level({"size": [10, 10], "elements": [{"type": "ramp", "at": [0, 0], "size": [4, 2], "rot": 0, "height": [0, 2]}]})
    xs = np.linspace(-1.9, 1.9, 9)
    np.testing.assert_allclose(L.height(xs, 0.0), (xs / 4 + 0.5) * 2, atol=1e-9)
    assert L.height(0.0, 1.2) == 0  # outside its width
    L45 = lv.Level({"size": [10, 10], "elements": [{"type": "ramp", "at": [0, 0], "size": [4, 2], "rot": 90, "height": [0, 2]}]})
    assert L45.height(0.0, 1.0) == pytest.approx(1.5)  # rot 90: local +u is +z
    assert L45.height(1.5, 0.0) == 0


def test_surface_materials(level):
    M = lv.MAT
    assert level.surface(-2.0, 0.0) == M["path"]
    assert level.surface(-2.0, 1.5) == M["water"]
    assert level.surface(0.0, 2.0) == M["marker"] and level.surface(0.9, 2.0) == M["marker"]  # disc and pointer
    assert level.surface(-0.9, 2.0) == M["grass"]  # nothing behind the marker
    assert level.surface(3.5, -2.5) == M["grass"]
    # a plateau standing in a pond is not water on top
    L = lv.Level({"size": [6, 6], "elements": [{"type": "pond", "at": [0, 0], "radius": [2, 2], "depth": 0.3},
                                             {"type": "plateau", "at": [0, 0], "size": [1, 1], "height": 0.5}]})
    assert L.surface(0.0, 0.0) == M["grass"] and L.surface(1.0, 0.0) == M["water"]


def test_path_distance_and_polyline():
    e = {"points": [[0, 0], [4, 0], [4, 3]], "width": 1.0}
    assert lv.Level.path_distance(e, 2.0, 0.7) == pytest.approx(0.7)
    assert lv.Level.path_distance(e, 5.0, 4.0) == pytest.approx(math.hypot(1, 1))
    assert lv.polyline_length(e["points"]) == pytest.approx(7.0)
    p, h = lv.polyline_point(e["points"], 1.0)
    np.testing.assert_allclose(p, [1, 0])
    assert h == pytest.approx(0.0)
    p, h = lv.polyline_point(e["points"], 5.0)
    np.testing.assert_allclose(p, [4, 1])
    assert h == pytest.approx(90.0)
    p, _ = lv.polyline_point(e["points"], 99.0)  # clamped to the end
    np.testing.assert_allclose(p, [4, 3])


# ------------------------------------------------------------------ layout -> splats
def test_splat_frames_are_orthonormal_and_right_handed(splats):
    for v in (splats.tu, splats.tv, splats.normal):
        np.testing.assert_allclose(np.linalg.norm(v, axis=1), 1.0, atol=1e-5)
    np.testing.assert_allclose(np.cross(splats.tu, splats.tv), splats.normal, atol=1e-5)
    assert np.isfinite(splats.pos).all() and (splats.scale > 0).all()


def test_terrain_tops_sit_on_the_height_function(level, splats):
    walk = np.isin(splats.mat, [lv.MAT[m] for m in ("grass", "path", "water", "marker")])
    assert walk.sum() == (8 / 0.25) * (6 / 0.25)  # one per lattice cell
    p = splats.pos[walk]
    np.testing.assert_allclose(p[:, 1], lv.GROUND + level.height(p[:, 0] / U, p[:, 2] / U) * U, atol=1e-5)
    assert (splats.normal[walk][:, 1] > 0.5).all()  # they face up
    np.testing.assert_array_equal(splats.mat[walk], level.surface(p[:, 0] / U, p[:, 2] / U))
    np.testing.assert_allclose(splats.height_m[walk], level.height(p[:, 0] / U, p[:, 2] / U), atol=1e-5)


def test_flat_ground_has_no_holes_in_no_blend_rendering():
    """Hard compositing shows a splat where 0.95 exp(-r^2/2) > 0.35, i.e. within 1.41 sigma of its centre:
    every ground point must be that close to some splat."""
    from scipy.spatial import cKDTree

    sp = lv.Level({"size": [4, 3], "elements": []}).splats(0.25, skirt=0.0)
    assert (sp.mat == lv.MAT["grass"]).all()
    rng = np.random.default_rng(0)
    q = np.stack([rng.uniform(-2 * U, 2 * U, 4000), rng.uniform(-1.5 * U, 1.5 * U, 4000)], 1)
    dist, _ = cKDTree(sp.pos[:, [0, 2]]).query(q)
    reach = math.sqrt(2 * math.log(0.95 / 0.35)) * sp.scale.min()
    assert dist.max() < reach


def test_cliffs_become_walls_that_face_the_low_side(level, splats):
    wall = splats.mat == lv.MAT["cliff"]
    assert wall.sum() > 100
    n, p = splats.normal[wall], splats.pos[wall] / U
    assert np.abs(n[:, 1]).max() < 1e-6  # vertical faces
    east = (np.abs(p[:, 0] - 3.0) < 1e-3) & (np.abs(p[:, 2] + 1.0) < 0.9)  # the plateau's +x face
    assert east.sum() >= 4 * 6 and (n[east, 0] > 0.99).all()
    south_of_ramp = (np.abs(p[:, 2] - 0.0) < 1e-3) & (np.abs(p[:, 0] - 1.25) < 0.2)  # plateau face beside the ramp
    assert south_of_ramp.any() and (n[south_of_ramp, 2] > 0.99).all()
    y = (splats.pos[wall][east, 1] - lv.GROUND) / U
    assert y.min() < 0.13 and y.max() > 0.87  # the column of splats spans the whole 1 m cliff
    # no wall where the ramp meets the plateau (same height on both sides)
    assert not ((np.abs(p[:, 2] - 0.0) < 1e-3) & (np.abs(p[:, 0] - 2.0) < 0.3)).any()


def test_skirt_closes_the_level_edge():
    L = lv.Level({"size": [4, 3], "elements": []})
    sp = L.splats(0.25, skirt=1.0)
    wall = sp.mat == lv.MAT["cliff"]
    assert wall.sum() == 2 * (16 + 12) * 4  # every rim cell, four splats (1 m) deep
    p, n = sp.pos[wall] / U, sp.normal[wall]
    assert (np.isclose(np.abs(p[:, 0]), 2.0) | np.isclose(np.abs(p[:, 2]), 1.5)).all()
    assert ((p[:, [0, 2]] * n[:, [0, 2]]).sum(1) > 0).all()  # facing outwards
    assert (sp.pos[wall][:, 1] < lv.GROUND).all()
    assert L.splats(0.25, skirt=0.0).mat.tolist().count(lv.MAT["cliff"]) == 0
    lo, hi = L.bounds_world()  # the camera's framing box holds the default skirt
    dflt = L.splats(0.25)
    assert (dflt.pos >= lo - 1e-4).all() and (dflt.pos <= hi + 1e-4).all()


def test_props(level, splats):
    rock = level.elements.index(level.of("rock")[0])
    r = splats.elem == rock
    assert r.sum() > 20 and (splats.mat[r] == lv.MAT["rock"]).all()
    p = splats.pos[r] / U - [0.5, lv.GROUND / U, -2.0]
    c, s = math.cos(math.radians(30)), math.sin(math.radians(30))
    local = np.stack([p[:, 0] * c + p[:, 2] * s, p[:, 1], -p[:, 0] * s + p[:, 2] * c], 1)  # undo the rock's turn
    np.testing.assert_allclose(((local / [0.5, 0.6, 0.4]) ** 2).sum(1), 1.0, atol=1e-4)  # on the ellipsoid
    assert local[:, 1].max() > 0.55 and local[:, 1].min() > -0.06  # dome of the stated height, bottom cut
    assert ((p * splats.normal[r]).sum(1) > 0).all()  # normals point outwards
    for kind, tree in zip(("cone", "sphere"), level.of("tree")):
        t = splats.elem == level.elements.index(tree)
        mats = set(np.unique(splats.mat[t]).tolist())
        assert mats == {lv.MAT["trunk"], lv.MAT["canopy"]}, kind
        top = ((splats.pos[t][:, 1] - lv.GROUND) / U).max()
        assert 2.0 - 0.2 < top <= 2.0 + 1e-5, kind
        foot = ((splats.pos[t][:, 1] - lv.GROUND) / U).min()
        assert 0 <= foot < 0.2


def test_props_stand_on_the_terrain():
    L = lv.Level({"size": [8, 8], "elements": [{"type": "plateau", "at": [0, 0], "size": [4, 4], "height": 1.5},
                                             {"type": "tree", "at": [0, 0], "height": 3.0, "radius": 1.0, "canopy": "sphere"}]})
    sp = L.splats(0.25)
    y = (sp.pos[sp.elem == 1][:, 1] - lv.GROUND) / U
    assert y.min() >= 1.5 and y.max() == pytest.approx(4.5, abs=0.02)  # trunk foot on the plateau, crown 3 m above
    np.testing.assert_allclose(L.to_world(0.0, 0.0), [0, lv.GROUND + 1.5 * U, 0])


def test_tone_is_neutral_and_rises_with_height(splats):
    a = splats.albedo
    assert a.shape == (len(splats), 3) and np.ptp(a, axis=1).max() == 0  # grey: r = g = b
    g = lv.MAT["grass"]
    lo, mid, hi = (lv.tone(np.array([g]), np.array([h]))[0, 0] for h in (0.0, 1.0, 50.0))
    assert lo < mid < hi == pytest.approx(lv.TONE_RANGE[1])
    assert lv.tone(np.array([lv.MAT["water"]]), np.array([3.0]))[0, 0] == pytest.approx(lv.TONE["water"])


def test_to_model_keeps_the_geometry(splats):
    m = lv.to_model(splats)
    assert m.n == len(splats)
    R = m.rot().detach().numpy()
    np.testing.assert_allclose(R[..., 2], splats.normal, atol=1e-4)
    np.testing.assert_allclose(R[..., 0], splats.tu, atol=1e-4)
    np.testing.assert_allclose(m.scales().detach().numpy(), splats.scale, rtol=1e-5)
    np.testing.assert_allclose(m.material().detach().numpy()[:, :3], splats.albedo, atol=1e-4)
    assert float(m.material().detach()[:, 4].max()) < 1e-3  # no metal


# ------------------------------------------------------------------ camera math
SPEC = isocam.RefCam()


def _build_args(*argv):
    warnings = []
    a = graybox.resolve_build_args(graybox.build_parser().parse_args(["build", *argv]), warn=warnings.append)
    return a, warnings


def test_default_camera_is_the_chosen_45_degrees():
    """The user chose 45 degrees ("맵 카메라는 45°로"); the scale goes with it (16 px mannequin)."""
    assert (SPEC.elev, SPEC.az, SPEC.px_per_unit, SPEC.view) == (45.0, 0.0, 11.1, (211, 124))
    a, w = _build_args()  # the command line has the same defaults
    assert (a.elev, a.az, a.px_per_unit, a.view_w, a.view_h, a.out) == (45.0, 0.0, 11.1, 211, 124, "out/map_45")
    assert w == []
    b, w = _build_args("--elev", "30", "--px-per-unit", "9.6")
    assert (b.elev, b.px_per_unit, b.out) == (30.0, 9.6, "out/map_30")  # the 30 degree option still works


def test_elevation_alone_picks_the_calibrated_scale_and_its_own_folder():
    """``--elev 30`` used to keep 11.1 px per unit (a figure 17-18 px tall) and write over out/map."""
    a, w = _build_args("--elev", "30")
    assert (a.px_per_unit, a.out, w) == (9.6, "out/map_30", [])
    a, w = _build_args("--elev", "37.5")  # not measured: an estimate between the two, and a warning
    assert 9.6 < a.px_per_unit < 11.1 and a.out == "out/map_37_5"
    assert len(w) == 1 and "no measured scale" in w[0]
    a, w = _build_args("--elev", "45", "-o", "somewhere", "--px-per-unit", "10")
    assert (a.px_per_unit, a.out, w) == (10.0, "somewhere", [])


@pytest.mark.parametrize("bad", [0.0, -10.0, 4.9, 85.1, 90.0, float("nan")])
def test_camera_elevation_is_validated(bad):
    """elev 0 used to raise ZeroDivisionError inside sun_direction; negative or >= 90 were accepted."""
    with pytest.raises(ValueError, match="between 5 and 85"):
        isocam.RefCam(elev=bad)
    with pytest.raises(SystemExit):  # the command line says so before anything is baked
        graybox.build_parser().parse_args(["build", "--elev", str(bad)])
    for ok in (5.0, 30.0, 45.0, 85.0):
        assert np.isfinite(graybox.sun_direction(isocam.RefCam(elev=ok))).all()


def test_build_refuses_to_replace_a_bake_made_with_another_camera(tmp_path, capsys):
    import json

    (tmp_path / "small.json").write_text(json.dumps({"size": [4, 4], "grid": {"minor": 1.0, "major": 0}, "elements": []}))
    old = np.array([30.0, 0.0, 9.6, 211, 124])
    np.savez(tmp_path / graybox.BAKE_FILE, spec=old)
    argv = ["--layout", str(tmp_path / "small.json"), "-o", str(tmp_path), "--spacing", "0.5", "--shadow-res", "32"]
    a, _ = _build_args(*argv)
    with pytest.raises(SystemExit, match="another camera"):
        graybox.cmd_build(a)
    np.testing.assert_array_equal(graybox.bake_spec(str(tmp_path)), old)  # untouched
    a, _ = _build_args(*argv, "--force")
    graybox.cmd_build(a)
    np.testing.assert_allclose(graybox.bake_spec(str(tmp_path))[:3], [45.0, 0.0, 11.1])
    a, _ = _build_args(*argv)  # the same camera again: allowed without --force
    graybox.cmd_build(a)
    capsys.readouterr()


def test_reference_numbers():
    s = math.sqrt(0.5)  # sin 45 = cos 45
    assert SPEC.person_px(1.80) == pytest.approx(1.8 * s * 11.1)  # a 1.75 m pole: 14.1 px
    w, d = SPEC.ground_footprint()
    assert w == pytest.approx(211 / 11.1) and d == pytest.approx(124 / 11.1 / s)
    assert w / U == pytest.approx(18.5, abs=0.05) and d / U == pytest.approx(15.4, abs=0.05)  # metres per screen
    old = isocam.RefCam(elev=30.0, px_per_unit=9.6)
    assert old.person_px(1.80) == pytest.approx(14.96, abs=0.01)
    assert old.ground_footprint()[1] / U == pytest.approx(25.1, abs=0.05)


def test_axes_and_projection_scale():
    right, up, fwd = isocam.axes(SPEC)
    np.testing.assert_allclose(right, [1, 0, 0], atol=1e-12)
    e = math.radians(SPEC.elev)
    np.testing.assert_allclose(fwd, [0, -math.sin(e), -math.cos(e)], atol=1e-12)
    assert up[1] > 0 and abs(up @ fwd) < 1e-12
    cam = isocam.origin_camera(SPEC)
    assert cam.ortho
    m, e = SPEC.px_per_unit, math.radians(SPEC.elev)
    o = isocam.project(cam, [0, 0, 0])
    np.testing.assert_allclose(o[:2], [1, 1], atol=1e-9)  # the lattice is pinned to the world origin
    np.testing.assert_allclose(isocam.project(cam, [1, 0, 0]) - o, [m, 0, 0], atol=1e-9)  # east = screen right
    np.testing.assert_allclose(isocam.project(cam, [0, 1, 0]) - o, [0, -m * math.cos(e), -math.sin(e)], atol=1e-9)
    np.testing.assert_allclose(isocam.project(cam, [0, 0, 1]) - o, [0, m * math.sin(e), -math.cos(e)], atol=1e-9)


def test_azimuth_turns_the_view():
    cam = isocam.origin_camera(isocam.RefCam(az=90.0))
    o = isocam.project(cam, [0, 0, 0])
    d = isocam.project(cam, [0, 0, -1]) - o  # seen from the east, north (-z) is on the right
    np.testing.assert_allclose(d[:2], [SPEC.px_per_unit, 0], atol=1e-9)


def test_windows_shift_pixels_only():
    cam = isocam.level_camera(SPEC, [-5, -1.5, -4], [5, 2, 4])
    P = np.random.default_rng(1).uniform(-3, 3, (20, 3))
    sub = isocam.window(cam, 7, -3, 40, 30)
    d = isocam.project(cam, P) - isocam.project(sub, P)
    np.testing.assert_allclose(d, np.tile([7, -3, 0], (20, 1)), atol=1e-9)
    assert (sub.width, sub.height) == (40, 30)
    np.testing.assert_array_equal(sub.viewmat, cam.viewmat)
    with pytest.raises(ValueError):
        isocam.window(cam, 0.5, 0, 8, 8)


def test_level_camera_frames_the_box_on_the_world_lattice():
    lo, hi = np.array([-5, -1.5, -4.0]), np.array([5, 2, 4.0])
    cam = isocam.level_camera(SPEC, lo, hi, margin=3)
    corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    px = isocam.project(cam, corners)
    assert px[:, 0].min() >= 3 - 1e-9 and px[:, 0].max() <= cam.width - 3 + 1e-9
    assert px[:, 1].min() >= 3 - 1e-9 and px[:, 1].max() <= cam.height - 3 + 1e-9
    # a bigger level uses the SAME pixel lattice: positions differ by whole pixels
    big = isocam.level_camera(SPEC, lo * 3, hi * 3)
    d = isocam.project(cam, corners)[:, :2] - isocam.project(big, corners)[:, :2]
    np.testing.assert_allclose(d, np.round(d), atol=1e-9)


def test_unproject_round_trip():
    cam = isocam.level_camera(isocam.RefCam(elev=37.0, az=25.0), [-5, -1.5, -4], [5, 2, 4])
    P = np.random.default_rng(2).uniform(-3, 3, (10, 3))
    P[:, 1] = -1.0
    px = isocam.project(cam, P)
    np.testing.assert_allclose(isocam.unproject_to_plane(cam, px[:, 0], px[:, 1], -1.0), P, atol=1e-9)
    # one pixel down on screen = 1 / (m sin e) further south on the ground (1.41 : 1 at 45 degrees, 2 : 1 at 30)
    for spec in (SPEC, isocam.RefCam(elev=30.0, px_per_unit=9.6)):
        flat = isocam.origin_camera(spec)
        step = isocam.unproject_to_plane(flat, 1.0, 2.0, 0.0) - isocam.unproject_to_plane(flat, 1.0, 1.0, 0.0)
        np.testing.assert_allclose(step, [0, 0, 1 / (spec.px_per_unit * math.sin(math.radians(spec.elev)))], atol=1e-9)


def test_view_origin_and_subpixel_split():
    cam = isocam.level_camera(SPEC, [-20, -1.5, -20], [20, 2, 20])
    focus = np.array([1.3, -1.0, 2.1])
    fx, fy = isocam.view_origin(cam, SPEC, focus, (0.5, 0.5))
    ix, frac = isocam.split_subpixel(fx)
    assert ix + frac == pytest.approx(fx) and 0 <= frac < 1
    p = isocam.project(isocam.window(cam, ix, isocam.split_subpixel(fy)[0], *SPEC.view), focus)
    assert abs(p[0] - 211 / 2) < 1 and abs(p[1] - 124 / 2) < 1
    assert isocam.split_subpixel(-0.25) == (-1, 0.75)


def test_subpixel_crop_scrolls_by_output_pixels():
    img = np.zeros((5, 7, 3), np.float32)
    img[:, 3] = 1.0  # one bright column
    a = isocam.subpixel_crop(img, 0.0, 0.0, 4, 6, 4)
    b = isocam.subpixel_crop(img, 0.5, 0.25, 4, 6, 4)
    assert a.shape == b.shape == (16, 24, 3)
    assert np.nonzero(a[0, :, 0])[0].tolist() == [12, 13, 14, 15]
    assert np.nonzero(b[0, :, 0])[0].tolist() == [10, 11, 12, 13]  # half an art pixel = 2 output pixels


def _raster(model, cam):
    with torch.no_grad():
        R = model.rot()
        out = rasterize(model.means, R, model.scales(), model.opacity(), model.material(), R[..., 2], cam,
                        RasterConfig(tile=4, k=64, hard=True, cutoff=2.0))
    return gbuffer_from_render(out)


def test_projection_agrees_with_the_rasterizer():
    """isocam.project is numpy; the engine projects in torch.  One splat must land where project says."""
    from pixelsplat.splats import SplatModel, _logit

    P = np.array([[0.7, -1.0, 0.4]])
    m = SplatModel(P, [[math.sqrt(0.5), -math.sqrt(0.5), 0, 0]], np.log([[0.12, 0.12]]), [_logit(0.95)],
                   [[0.5, 0.5, 0.5]], [0.9], [0.0])  # quaternion: the normal (local z) turned to +y
    assert float(m.rot().detach()[0, 1, 2]) == pytest.approx(1.0, abs=1e-5)
    cam = isocam.level_camera(SPEC, [-2, -1.2, -2], [2, -0.8, 2])
    gb = _raster(m, cam)
    ys, xs = np.nonzero(gb["alpha"] > 0.5)
    assert len(xs) >= 2
    px = isocam.project(cam, P[0])
    assert abs(xs.mean() + 0.5 - px[0]) < 0.6 and abs(ys.mean() + 0.5 - px[1]) < 0.6
    assert gb["depth"][gb["alpha"] > 0.5].mean() == pytest.approx(px[2], abs=0.15)
    # footprint of a round ground splat at 45 degrees: about 1.4 times as wide as tall
    assert np.ptp(xs) >= np.ptp(ys)


def test_static_world_is_pixel_identical_under_whole_pixel_pans(level):
    """The claim behind the baked level: with an orthographic camera a window moved by whole pixels
    shows exactly the same pixels, shifted."""
    model = lv.to_model(level.splats(0.25))
    cam = isocam.level_camera(SPEC, *level.bounds_world())
    a = _raster(model, isocam.window(cam, 16, 12, 48, 32))
    b = _raster(model, isocam.window(cam, 16 + 5, 12 + 3, 48, 32))
    assert (a["alpha"] > 0.5).mean() > 0.5
    np.testing.assert_array_equal(a["id"][3:, 5:], b["id"][:-3, :-5])
    np.testing.assert_allclose(a["depth"][3:, 5:], b["depth"][:-3, :-5], atol=1e-4)


def test_raster_tiled_matches_one_big_raster(level):
    model = lv.to_model(level.splats(0.25))
    # az 7: seen exactly from the south, mirror-image splats of a tree have EQUAL depth and the engine's
    # front-to-back order between them is arbitrary (it may differ between a chunk and the whole image)
    cam = isocam.level_camera(isocam.RefCam(az=7.0), *level.bounds_world())
    T = graybox.model_tensors(model)
    rc = RasterConfig(tile=4, k=64, hard=True, cutoff=2.0)
    whole = _raster(model, cam)
    tiled = graybox.raster_tiled(*T, cam, rc, chunk=32)
    for key in ("alpha", "depth", "albedo", "normal"):
        np.testing.assert_allclose(tiled[key], whole[key], atol=1e-4, err_msg=key)
    np.testing.assert_array_equal(tiled["id"], whole["id"])
    assert tiled["id"].max() < model.n and (tiled["alpha"] > 0.5).mean() > 0.4


# ------------------------------------------------------------------ bake + frame (tiny, no mannequin)
@pytest.fixture(scope="module")
def baked(level, tmp_path_factory):
    import json

    out = tmp_path_factory.mktemp("map")
    model, data = graybox.bake(level, SPEC, spacing=0.25, shadow_res=128, log=quiet)
    np.savez_compressed(out / graybox.BAKE_FILE, **data)
    (out / "layout_used.json").write_text(json.dumps(level.layout))
    return graybox.Stage(str(out)), data


def test_bake_covers_the_level_and_labels_materials(baked):
    st, data = baked
    mask = data["alpha"] > 0.5
    assert 0.3 < mask.mean() < 0.95
    assert set(np.unique(data["mat"][mask]).tolist()) >= {lv.MAT[m] for m in ("grass", "path", "water", "cliff", "canopy")}
    assert (data["mat"][~mask] == -1).all()
    np.testing.assert_allclose(np.linalg.norm(data["sun"]), 1.0, atol=1e-9)
    assert data["sun"][1] > 0.5 and data["sm_covered"].mean() > 0.2
    assert np.ptp(data["albedo"][mask], axis=1).max() < 1e-6  # still neutral grey after the grid overlay


def _runs(dark: np.ndarray) -> np.ndarray:
    d = np.diff(np.concatenate([[0], dark.astype(int), [0]]))
    return np.nonzero(d == -1)[0] - np.nonzero(d == 1)[0]


def test_grid_lines_are_one_pixel_wide(baked):
    st, data = baked
    # the meadow south of everything: flat grass; darker pixels there are grid lines only
    foot = st.level.to_world(1.5, 2.6)
    p = isocam.project(st.cam, foot)
    row = data["albedo"][int(p[1]), int(p[0]) - 12:int(p[0]) + 12, 0]
    mat = data["mat"][int(p[1]), int(p[0]) - 12:int(p[0]) + 12]
    assert (mat == lv.MAT["grass"]).all()
    dark = row < row.max() - 0.01
    runs = np.diff(np.concatenate([[0], dark.astype(int), [0]]))
    lengths = np.nonzero(runs == -1)[0] - np.nonzero(runs == 1)[0]
    if dark.all():  # the probe row is itself a z line: use the next one
        pytest.skip("probe row coincides with a grid line")
    assert len(lengths) >= 2 and (lengths == 1).all()
    gaps = np.diff(np.nonzero(runs == 1)[0])
    ppm = SPEC.px_per_unit * U  # one metre = 11.42 px
    assert set(gaps.tolist()) <= {math.floor(ppm), math.ceil(ppm)}


def test_the_x0_and_z0_lines_are_one_pixel_wide_too(baked):
    """The world origin sits on a pixel CORNER (isocam.origin_camera), so the x = 0 line ran exactly
    between two pixel centres and the old test |x - k| < half passed on both: 2 px in every bake."""
    st, data = baked
    alb, mat = data["albedo"][..., 0], data["mat"]
    c = isocam.project(st.cam, st.level.to_world(0.0, 0.5))
    assert abs(c[0] - round(c[0])) < 1e-9  # the tie really is there: x = 0 is a pixel boundary
    widths = []
    for z in np.linspace(0.4, 0.9, 6):  # flat grass east of the path's end, between the z = 0 and z = 1 lines
        q = isocam.project(st.cam, st.level.to_world(0.0, z))
        r, col = int(q[1]), int(round(q[0]))
        seg, m = alb[r, col - 4:col + 4], mat[r, col - 4:col + 4]
        assert (m == lv.MAT["grass"]).all()
        widths.append(int((seg < seg.max() - 0.01).sum()))
    assert widths == [1] * 6
    # the z = 0 line, in the columns at x = 0.5 m (grass between the plateau and the path's end)
    q = isocam.project(st.cam, st.level.to_world(0.5, 0.0))
    col, r = int(q[0]), int(q[1])
    seg, m = alb[r - 4:r + 5, col], mat[r - 4:r + 5, col]
    assert (m == lv.MAT["grass"]).all()
    assert _runs(seg < seg.max() - 0.01).tolist() == [1]


@pytest.mark.parametrize("az", [0.0, 30.0, -55.0])
def test_grid_lines_on_flat_ground_draw_one_pixel_per_line(az):
    """Every x and z line, x = 0 / z = 0 included, takes exactly ONE pixel per row (or per column, for a
    line running more across the screen than down it).  Under a turned camera a pixel's right and down
    steps both move along x and z: the band is the larger step, not their sum (a sum is a 2 px line)."""
    spec = isocam.RefCam(az=az)
    cam = isocam.level_camera(spec, [-6, -1.5, -6], [6, -0.5, 6])
    ys, xs = np.mgrid[0:cam.height, 0:cam.width] + 0.5
    P = isocam.unproject_to_plane(cam, xs, ys, -1.0)  # flat ground, every pixel centre
    ex, ey = graybox.pixel_steps_on_surface(cam, np.array([0.0, 1.0, 0.0]))
    inner = (np.abs(P[..., 0]) < 5 * U) & (np.abs(P[..., 2]) < 5 * U)
    for step in (1.0, 5.0):
        masks = graybox.grid_line_masks(cam, P, step)
        for axis, on in zip((0, 2), masks):
            k = np.round(P[..., axis] / U / step).astype(int)
            per_row = abs(ex[axis]) >= abs(ey[axis])  # the line crosses every row once (else every column)
            lines = (on & inner) if per_row else (on & inner).T
            kk = k if per_row else k.T
            for r in range(lines.shape[0]):
                hit = kk[r][lines[r]]
                assert len(np.unique(hit)) == len(hit), (az, step, axis, r)  # one pixel per line
        assert masks[0][inner].any() and masks[1][inner].any()
    if az != 0:
        return
    # x = 0 is still drawn, by one pixel per row, although it lies exactly on a pixel boundary
    fx = isocam.project(cam, [0.0, -1.0, 0.0])[0] % 1.0
    assert min(fx, 1 - fx) < 1e-9
    on_x, _ = graybox.grid_line_masks(cam, P, 1.0)
    zero = on_x & inner & (np.round(P[..., 0] / U) == 0)
    rows = np.unique(np.nonzero(inner)[0])
    assert (zero[rows].sum(1) == 1).all()


def test_bake_draws_the_grid_with_the_per_pixel_normals(monkeypatch):
    """The ramp test calls grid_overlay directly; this checks that bake() hands it the normals."""
    seen = {}
    real = graybox.grid_overlay

    def spy(level, cam, P, mat, albedo, normal=None):
        seen["normal"] = normal
        return real(level, cam, P, mat, albedo, normal)

    monkeypatch.setattr(graybox, "grid_overlay", spy)
    L = lv.Level({"size": [6, 6], "elements": [{"type": "ramp", "at": [0, 0], "size": [4, 3], "rot": -90, "height": [0, 1]}]})
    _, data = graybox.bake(L, SPEC, spacing=0.25, shadow_res=32, log=quiet)
    assert seen["normal"] is not None and seen["normal"].shape == data["normal"].shape
    np.testing.assert_array_equal(seen["normal"], data["normal"])
    assert (np.abs(seen["normal"][..., 2]) > 0.2).any()  # (the ramp's normals tilt: not all straight up)


def test_pixel_steps_on_surface():
    cam = isocam.level_camera(SPEC, [-5, -1.5, -4], [5, 2, 4])
    up = np.array([0.0, 1.0, 0.0])
    ex, ey = graybox.pixel_steps_on_surface(cam, up)
    o = isocam.unproject_to_plane(cam, 0.0, 0.0, -1.0)  # flat ground: the same as unprojecting to the plane
    np.testing.assert_allclose(ex, isocam.unproject_to_plane(cam, 1.0, 0.0, -1.0) - o, atol=1e-9)
    np.testing.assert_allclose(ey, isocam.unproject_to_plane(cam, 0.0, 1.0, -1.0) - o, atol=1e-9)
    # a slope rising to the north (facing the camera, like the ramp) is seen more face-on: a pixel covers
    # less of it in z; one facing away, more
    a = math.radians(17.7)
    toward, away = (np.array([0.0, math.cos(a), s * math.sin(a)]) for s in (1, -1))
    e = math.radians(SPEC.elev)
    for n, el in ((toward, e + a), (away, e - a)):
        _, dy = graybox.pixel_steps_on_surface(cam, n)
        assert abs(n @ dy) < 1e-9  # it lies in the surface
        np.testing.assert_allclose(abs(dy[2]), math.cos(a) / (SPEC.px_per_unit * math.sin(el)), rtol=1e-9)


def test_grid_lines_stay_one_pixel_wide_on_a_ramp():
    """With the flat-ground tolerance about half of the z lines on a ramp were two pixels thick."""
    L = lv.Level({"size": [12, 12], "grid": {"minor": 1.0, "major": 5.0}, "elements": [
        {"type": "ramp", "at": [0, 0], "size": [8, 6], "rot": -90, "height": [0.0, 2.5]}]})
    cam = isocam.level_camera(SPEC, *L.bounds_world())
    sp = L.splats(0.125, skirt=0.0)
    gb = graybox.raster_tiled(*graybox.model_tensors(lv.to_model(sp)), cam,
                              RasterConfig(tile=4, k=64, hard=True, cutoff=2.0))
    P = graybox.gbuf.world_positions(cam, gb["depth"])
    mat = np.where(gb["alpha"] > 0.5, sp.mat[np.maximum(gb["id"], 0)], -1)
    flat_tol = graybox.grid_overlay(L, cam, P, mat, gb["albedo"])
    per_px = graybox.grid_overlay(L, cam, P, mat, gb["albedo"], gb["normal"])
    xm, ym, zm = P[..., 0] / U, (P[..., 1] - lv.GROUND) / U, P[..., 2] / U
    ramp = (gb["alpha"] > 0.5) & (np.abs(xm) < 2.5) & (np.abs(zm) < 3.5) & (ym > 0.1)

    def z_line_thickness(img):
        dark = ramp & (img[..., 0] < gb["albedo"][..., 0] - 1e-6)
        out = []
        for col in range(dark.shape[1]):
            d = np.diff(np.concatenate([[0], dark[:, col].astype(int), [0]]))
            out += (np.nonzero(d == -1)[0] - np.nonzero(d == 1)[0]).tolist()
        return np.array([v for v in out if v < 6])  # (x lines run along the column: skipped)

    old, new = z_line_thickness(flat_tol), z_line_thickness(per_px)
    assert len(new) > 40 and (old == 2).mean() > 0.2
    assert (new == 1).mean() > 0.9


def test_frame_is_lit_shadowed_and_outlined(baked):
    st, _ = baked
    img = st.frame(0, 0, st.cam.width, st.cam.height)
    assert img.shape == (st.cam.height, st.cam.width, 3) and np.isfinite(img).all()
    cam, gb, actor_mask, sms = st.gbuffer(0, 0, st.cam.width, st.cam.height)
    assert not actor_mask.any() and sms == []
    vis = st.sun_visibility(cam, gb, sms)
    mask = gb["alpha"] > 0.5
    lit = float(vis[mask].mean())
    assert 0.5 < lit < 0.98  # trees and the plateau throw shadows, most ground is lit
    ground = mask & (st.mat == lv.MAT["grass"])
    assert img[ground & (vis > 0.5)].mean() > img[ground & (vis < 0.5)].mean() + 0.1
    np.testing.assert_allclose(img[~mask], np.tile(graybox.BACKGROUND, ((~mask).sum(), 1)), atol=1e-6)
    # windows outside the level are background, partly outside are cropped without error
    np.testing.assert_allclose(st.frame(-500, -500, 16, 16), np.broadcast_to(graybox.BACKGROUND, (16, 16, 3)), atol=1e-6)
    assert st.frame(st.cam.width - 8, st.cam.height - 8, 16, 16).shape == (16, 16, 3)


def test_cliff_faces_read_as_walls_and_nothing_else_changes(baked, monkeypatch):
    """Camera-facing cliffs were near-black, almost the background: the bounce lifts them, on cliff
    pixels only."""
    st, _ = baked
    W, H = st.cam.width, st.cam.height
    lit, layers = st.frame(0, 0, W, H, layers=True)
    monkeypatch.setattr(graybox, "WALL_BOUNCE", 0.0)
    dark = st.frame(0, 0, W, H)
    cliff = st.mat == lv.MAT["cliff"]
    changed = np.abs(lit - dark).max(-1) > 1e-6
    assert changed.any() and not (changed & ~cliff).any()
    face = cliff & (st.gb["normal"][..., 2] > 0.9)  # the faces turned to the camera
    bg = np.asarray(graybox.BACKGROUND)
    assert np.median(lit[face].mean(-1)) > bg.mean() + 0.15 > np.median(dark[face].mean(-1))
    assert set(layers) == {"alpha", "depth", "actor", "sun"} and layers["depth"].shape == (H, W)


def test_shaded_frames_do_not_change_when_the_window_moves(baked):
    """AO, outline and the shadow filter read neighbouring pixels; the guard band keeps the frame's own
    edge out of them, so a pan by whole pixels moves the finished picture and changes nothing else."""
    st, _ = baked
    a, b = st.frame(10, 8, 40, 30), st.frame(13, 10, 40, 30)
    assert a.shape == (30, 40, 3) and a.std() > 0.05
    np.testing.assert_allclose(a[2:, 3:], b[:-2, :-3], atol=1e-5)
    full = st.frame(0, 0, st.cam.width, st.cam.height)
    np.testing.assert_allclose(a, full[8:38, 10:50], atol=1e-5)  # ... and equals a cut of the whole level


@pytest.mark.parametrize("spec", [SPEC, isocam.RefCam(elev=30.0, px_per_unit=9.6)], ids=["45deg", "30deg"])
def test_edge_mask_ignores_sloping_ground_but_finds_steps(spec):
    cam = isocam.level_camera(spec, [-2, -1.2, -2], [2, -0.8, 2])
    H, W = cam.height, cam.width
    ys, xs = np.mgrid[0:H, 0:W] + 0.5
    P = isocam.unproject_to_plane(cam, xs, ys, -1.0)
    n = np.zeros((H, W, 3), np.float32)
    n[..., 1] = 1
    gb = dict(alpha=np.ones((H, W), np.float32), normal=n, depth=isocam.project(cam, P)[..., 2].astype(np.float32))
    # neighbouring rows ARE far apart in depth (1 / (m tan e): 0.18 at 30 degrees, 0.09 at 45) ...
    step = 1 / (spec.px_per_unit * math.tan(math.radians(spec.elev)))
    np.testing.assert_allclose(np.abs(np.diff(gb["depth"], axis=0)), step, rtol=1e-3)
    assert not graybox.edge_mask(gb, P.astype(np.float32)).any()  # ... and still no outline on flat ground
    # raise the right half by 1 unit: its pixels are nearer, the step gets an outline on the near side
    P2 = P.copy()
    P2[:, W // 2:, 1] += 1.0
    gb2 = dict(gb, depth=isocam.project(cam, P2)[..., 2].astype(np.float32))
    e = graybox.edge_mask(gb2, P2.astype(np.float32))
    assert e[:, W // 2].all() and not e[:, W // 2 - 1].any() and e.sum() == H


def test_mannequin_placement_math():
    mats = np.zeros((2, 3, 4), np.float32)
    mats[:, :, :3] = np.eye(3)
    mats[1, :, 3] = [0, 0.5, 0.2]
    spot = np.array([3.0, lv.GROUND + 0.7, -2.0])
    out = graybox.Mannequin.place(mats, spot, facing_deg=0.0)  # face +x
    foot = out[0, :, :3] @ np.array([0, lv.GROUND, 0]) + out[0, :, 3]
    np.testing.assert_allclose(foot, spot, atol=1e-6)  # the rig's ground point lands on the spot
    np.testing.assert_allclose(out[0, :, :3] @ np.array([0, 0, 1.0]), [1, 0, 0], atol=1e-6)  # its front (+z) -> +x
    np.testing.assert_allclose(out[1, :, 3] - out[0, :, 3], [0.2, 0.5, 0], atol=1e-6)  # offsets turn with it
    south = graybox.Mannequin.place(mats, spot, facing_deg=90.0)
    np.testing.assert_allclose(south[0, :, :3], np.eye(3), atol=1e-6)  # 90 = +z = the rig's own front


def test_sun_matches_the_reference_shadow_direction():
    sun = graybox.sun_direction(SPEC)
    right, up, fwd = isocam.axes(SPEC)
    shadow = -(sun - sun[1] * np.array([0, 1, 0]))  # where the shadow of a pole points, on the ground
    assert shadow @ right < 0  # to the screen's left
    cam = isocam.origin_camera(SPEC)
    d = isocam.project(cam, shadow) - isocam.project(cam, [0, 0, 0])
    assert d[1] > 0 and abs(d[1]) < 0.3 * abs(d[0])  # and slightly towards the viewer (down on screen)


def test_sun_keeps_the_screen_shadow_when_the_elevation_changes():
    """The sun was read off the reference as a screen shape; under 30 degrees it is the first-tuned
    altitude 52 / azimuth 100, under 45 another sun casts the same picture."""
    old = isocam.RefCam(elev=30.0, px_per_unit=9.6)
    az, alt = math.radians(100.0), math.radians(52.0)
    np.testing.assert_allclose(graybox.sun_direction(old),
                               [math.sin(az) * math.cos(alt), math.sin(alt), math.cos(az) * math.cos(alt)], atol=1e-12)

    def pole_shadow(spec):  # tip of a 1-unit pole's shadow on screen, in units of the pole's screen height
        sun, cam = graybox.sun_direction(spec), isocam.origin_camera(spec)
        tip = np.array([0.0, 1.0, 0.0]) - sun / sun[1]  # the sun ray through the top of the pole hits y = 0 here
        top = isocam.project(cam, [0, 1, 0])[:2] - isocam.project(cam, [0, 0, 0])[:2]
        return (isocam.project(cam, tip)[:2] - isocam.project(cam, [0, 0, 0])[:2]) / np.linalg.norm(top)

    np.testing.assert_allclose(pole_shadow(SPEC), pole_shadow(old), atol=1e-9)
    np.testing.assert_allclose(pole_shadow(SPEC), graybox.SUN_SHADOW_ON_SCREEN, atol=1e-9)
    assert math.degrees(math.asin(graybox.sun_direction(SPEC)[1])) == pytest.approx(57.66, abs=0.01)
    # ... and when the camera turns (azimuth), the sun turns with it: same picture on screen
    for spec in (isocam.RefCam(az=30.0), isocam.RefCam(elev=30.0, az=-70.0, px_per_unit=9.6)):
        np.testing.assert_allclose(pole_shadow(spec), graybox.SUN_SHADOW_ON_SCREEN, atol=1e-9)
    turned = graybox.sun_direction(isocam.RefCam(az=30.0))
    np.testing.assert_allclose(turned[1], graybox.sun_direction(SPEC)[1], atol=1e-12)  # same altitude
    assert not np.allclose(turned, graybox.sun_direction(SPEC))


def test_reference_art_resamples_a_known_grid():
    """A synthetic 'video frame': random art pixels enlarged by a non-integer pitch with an offset."""
    rng = np.random.default_rng(0)
    art = rng.uniform(0, 1, (20, 30, 3)).astype(np.float32)
    pitch, ox, oy = 8.745, 3.0, 5.0
    ys = np.clip(np.floor((np.arange(170) - oy) / pitch).astype(int), 0, 19)
    xs = np.clip(np.floor((np.arange(260) - ox) / pitch).astype(int), 0, 29)
    frame = art[ys][:, xs]
    got = graybox.reference_art(frame, pitch)
    # the recovered grid is a contiguous block of the original art pixels
    best = min(float(np.abs(got[:16, :26] - art[j:j + 16, i:i + 26]).mean()) for j in range(3) for i in range(3))
    assert best < 0.02


# Extreme points of the bare mannequin standing (motion.stand_rots), feet at the origin, facing +z, in
# world units: crown / front / back of the head and the toe tips, heels and outer edges of the soles.
# Read off the baked out/bb2 (60k splat centres) once: the points that are highest / lowest on screen
# at 30 and 45 degrees for 24 facings, thinned to 12.  out/ is not in git, so the real-render test below
# skips on a clean checkout; this one always runs.
BB_REST_EXTREMES = np.array([
    [0.025, 1.794, 0.002], [-0.012, 1.803, 0.010], [0.014, 1.776, 0.053], [-0.029, 1.763, 0.061],
    [-0.003, 1.770, -0.075], [0.008, 1.773, -0.073],
    [0.089, 0.012, 0.196], [-0.105, 0.015, 0.195], [0.141, 0.014, 0.144], [-0.132, 0.009, 0.164],
    [0.092, 0.016, -0.076], [-0.111, 0.012, -0.061]])


def test_mannequin_extremes_span_about_16_px_at_the_calibrated_cameras():
    """No baked model needed: the screen height (rows between the highest and lowest point, before
    rasterization adds the splats' own size) of the standing mannequin, over 8 facings.  Rendered, 11.1
    gives 16 px (15 at some spots facing 90 / 270), 11.3 gives 17-18 and 10.6 mostly 15; the mean span
    for those is 15.69 / 14.72, so a +-0.15 band around the calibrated 15.41 catches either."""
    expected = {45.0: 15.41, 30.0: 15.65}
    for elev, ppu in isocam.CALIBRATED.items():
        spec = isocam.RefCam(elev=elev, px_per_unit=ppu)
        cam = isocam.origin_camera(spec)
        spans = []
        for facing in range(0, 360, 45):
            mats = np.zeros((1, 3, 4))
            mats[0, :, :3] = np.eye(3)
            m = graybox.Mannequin.place(mats, [0.0, lv.GROUND, 0.0], facing)[0]
            P = BB_REST_EXTREMES @ m[:, :3].T + m[:, 3] + [0, lv.GROUND, 0]
            y = isocam.project(cam, P)[:, 1]
            spans.append(y.max() - y.min())
        assert np.mean(spans) == pytest.approx(expected[elev], abs=0.15), (elev, spans)
        assert 14.5 < min(spans) and max(spans) < 16.2, (elev, spans)
    assert isocam.CALIBRATED[SPEC.elev] == SPEC.px_per_unit


BB = Path(__file__).resolve().parents[1] / "out" / "bb"


@pytest.mark.skipif(not (BB / "soldier_splats.pt").exists(), reason="needs the baked mannequin in out/bb")
def test_standing_mannequin_is_16_px_at_the_default_camera(tmp_path):
    """The reference character is about 16 art px tall; the default scale is fitted so the bare mannequin
    is too (a small flat level on the same world-locked lattice; three sub-pixel positions)."""
    import json

    torch.set_num_threads(2)
    layout = {"name": "flat", "size": [12, 12], "elements": [], "demo": {"stand": {"at": [-1.0, 4.4], "facing": 60}}}
    _, data = graybox.bake(lv.Level(layout), SPEC, spacing=0.25, shadow_res=64, log=quiet)
    np.savez_compressed(tmp_path / graybox.BAKE_FILE, **data)
    (tmp_path / "layout_used.json").write_text(json.dumps(layout))
    st = graybox.Stage(str(tmp_path))
    man = graybox.Mannequin(str(BB), 1000)
    got = []
    for at in ([-1.0, 4.4], [-0.79, 4.57], [-0.39, 4.81]):
        st.level.demo["stand"]["at"] = at
        got.append(graybox.figure_height_px(st, man))
    assert got == [16, 16, 16]

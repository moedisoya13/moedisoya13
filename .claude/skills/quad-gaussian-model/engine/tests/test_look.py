"""Checks for the look options: G-buffer clean-up, stylized shading, splat LOD, marble paint."""
from dataclasses import replace

import numpy as np
import pytest
import torch

from pixelsplat import gbuffer as gbuf
from pixelsplat.camera import fit_radius_for_fov, orbit_camera
from pixelsplat.lod import lod_for_camera, merge_splats, pixel_world_size
from pixelsplat.mesh import make_demo_knight, normalize_parts
from pixelsplat.raster import RasterConfig
from pixelsplat.shade import (FrameConfig, ShadeConfig, apply_palette, clean_frame, fit_palette, grade, postprocess,
                              render_frame, render_gbuffer_frame, shade, stylized)
from pixelsplat.splats import SplatModel
from pixelsplat.train import assign_patches


@pytest.fixture(scope="module")
def model():
    parts = normalize_parts(make_demo_knight())
    m = SplatModel.from_mesh(parts, 6000, seed=0)
    assign_patches(m, 20)
    return m


@pytest.fixture(scope="module")
def cam():
    return orbit_camera(30, 15, 64, 80, radius=fit_radius_for_fov(30))


def flat_gb(h=12, w=12):
    """A flat, fully covered G-buffer facing +z: every clean-up step must leave it alone."""
    n = np.zeros((h, w, 3), np.float32)
    n[..., 2] = 1
    return dict(alpha=np.ones((h, w), np.float32), albedo=np.full((h, w, 3), 0.6, np.float32),
                rough=np.full((h, w), 0.5, np.float32), metal=np.zeros((h, w), np.float32), normal=n,
                depth=np.full((h, w), 3.0, np.float32), id=np.arange(h * w).reshape(h, w))


# ------------------------------------------------------------------ G-buffer clean-up
def test_despeckle_removes_isolated_pixel_keeps_lines():
    gb = flat_gb()
    gb["albedo"][5, 5] = 0.05  # one stray dark pixel
    gb["normal"][8, 2] = (0.0, 1.0, 0.0)  # one stray normal
    gb["albedo"][2, 1:11] = 0.1  # a one-pixel-wide line must survive
    out = gbuf.despeckle(gb)
    assert np.allclose(out["albedo"][5, 5], 0.6)
    assert np.allclose(out["normal"][8, 2], (0, 0, 1))
    assert np.allclose(out["albedo"][2, 2:10], 0.1)
    assert gbuf.despeckle(flat_gb()) is not None and np.array_equal(gbuf.despeckle(flat_gb())["albedo"], flat_gb()["albedo"])


def test_despeckle_fills_pinholes():
    gb = flat_gb()
    gb["alpha"][6, 6] = 0.0  # nothing was hit
    gb["depth"][3, 3] = 9.0  # sees through to something far behind
    gb["albedo"][3, 3] = 0.0
    out = gbuf.despeckle(gb)
    assert out["alpha"][6, 6] == 1.0
    assert out["depth"][3, 3] == pytest.approx(3.0) and np.allclose(out["albedo"][3, 3], 0.6)


def test_smooth_normals_preserves_creases_and_unit_length():
    gb = flat_gb()
    gb["normal"][:, 6:] = (1.0, 0.0, 0.0)  # a 90° crease down the middle
    rng = np.random.default_rng(0)
    noisy = gb["normal"] + rng.normal(0, 0.08, gb["normal"].shape).astype(np.float32)
    gb["normal"] = noisy / np.linalg.norm(noisy, axis=-1, keepdims=True)
    out = gbuf.smooth_normals(gb, 1.0)
    assert np.allclose(np.linalg.norm(out["normal"], axis=-1), 1, atol=1e-4)
    ideal = flat_gb()["normal"]
    ideal[:, 6:] = (1.0, 0.0, 0.0)
    err = lambda n: np.arccos(np.clip((n * ideal).sum(-1), -1, 1)).mean()  # noqa: E731
    assert err(out["normal"]) < 0.6 * err(gb["normal"])  # less noise ...
    assert (out["normal"][:, 5] * ideal[:, 5]).sum(-1).min() > 0.95  # ... and the crease did not bleed
    assert (out["normal"][:, 6] * ideal[:, 6]).sum(-1).min() > 0.95


@pytest.mark.parametrize("mode", ["medoid", "mean"])
def test_select_downsample_majority(mode):
    hi = flat_gb(8, 8)
    hi["alpha"][:, :3] = 0  # left art column: 2 of 4 samples in the first block column... make it 3 of 4 empty
    hi["alpha"][0, 3] = 0
    hi["albedo"][4:6, 4:6] = 0.6
    hi["albedo"][4, 4] = 0.0  # one outlier sample among four
    hi["depth"][6:8, 6:8] = (3.0, 3.0), (3.0, 9.0)  # one sample sees a far surface
    lo = gbuf.select_downsample(hi, 2, mode=mode)
    assert lo["alpha"].shape == (4, 4) and lo["albedo"].shape == (4, 4, 3)
    assert (lo["alpha"][:, 0] == 0).all() and lo["alpha"][0, 1] == 0.25 and lo["alpha"][1, 1] == 0.5
    assert lo["depth"][3, 3] == pytest.approx(3.0)  # the far sample is not the majority layer
    if mode == "medoid":
        assert np.allclose(lo["albedo"][2, 2], 0.6)  # the outlier never wins
    else:
        assert np.allclose(lo["albedo"][2, 2], 0.45)


def test_supersampled_frame_matches_plain_silhouette(model, cam):
    sc = ShadeConfig()
    plain = render_gbuffer_frame(model, cam, FrameConfig(raster=RasterConfig(tile=4, k=256, hard=True), snap=True))
    clean = render_gbuffer_frame(model, cam, clean_frame(sc))
    a, b = plain["alpha"] > 0.5, clean["alpha"] > 0.5
    assert clean["alpha"].shape == (cam.height, cam.width)
    assert (a & b).sum() / (a | b).sum() > 0.88  # majority vote trims the overhang of a single sample
    assert np.allclose(np.linalg.norm(clean["normal"][b], axis=-1), 1, atol=1e-3)
    img = render_frame(model, cam, clean_frame(stylized(sc)))
    assert img.shape == (cam.height, cam.width, 3) and np.isfinite(img).all() and 0 <= img.min() and img.max() <= 1


def test_clean_frame_works_on_posed_splats(model, cam):
    with torch.no_grad():
        R = model.rot()
        pose = (model.means + torch.tensor([0.07, 0.0, 0.0]), R, model.scales())  # the whole body steps sideways
    still = render_gbuffer_frame(model, cam, clean_frame())
    moved = render_gbuffer_frame(model, cam, clean_frame(), pose=pose)
    xs = lambda g: np.nonzero(g["alpha"] > 0.5)[1].mean()  # noqa: E731
    assert abs(xs(moved) - xs(still)) > 0.5


# ------------------------------------------------------------------ shading / grading
def test_look_options_are_neutral_by_default(model, cam):
    """New options must not change the original renderer: defaults are all 'off'."""
    sc = ShadeConfig()
    assert (sc.terminator, sc.ssao, sc.cavity, sc.ridge, sc.rim, sc.contrast, sc.bloom, sc.glow) == (0,) * 8
    assert sc.saturation == 1 and sc.spec_scale == 1 and sc.outline_silhouette is None and not sc.flat_splats
    fc = FrameConfig()
    assert fc.supersample == 1 and not fc.despeckle and fc.normal_smooth == 0
    x = np.random.default_rng(0).uniform(0, 1, (4, 4, 3)).astype(np.float32)
    assert grade(x, sc) is x
    assert stylized(sc, strength=0.0, low_key=False, shadow_tint=None, highlight_tint=None, tint_strength=0.5) == sc


def test_stylized_darkens_shadows_and_keeps_lights(model, cam):
    gb = render_gbuffer_frame(model, cam, FrameConfig())
    base = ShadeConfig()
    m = gb["alpha"] > 0.5
    lum = lambda sc: (postprocess(shade(gb, cam, sc), gb, sc, cam) @ np.array([0.2126, 0.7152, 0.0722]))[m]  # noqa: E731
    a, b = lum(base), lum(stylized(base, bloom=0.0, glow=0.0))
    assert np.percentile(b, 10) < np.percentile(a, 10)  # deeper shadows
    assert b.std() / b.mean() > a.std() / a.mean()  # more contrast relative to the mean


def test_terminator_is_monotonic_and_sharper(model, cam):
    gb = flat_gb(1, 64)
    ang = np.linspace(-np.pi / 2, np.pi / 2, 64)
    gb["normal"] = np.stack([np.sin(ang), np.zeros(64), np.cos(ang)], -1)[None].astype(np.float32)
    c = orbit_camera(0, 0, 64, 1, radius=3.0, ortho=True)
    from pixelsplat.shade import Light
    base = ShadeConfig(lights=[Light((1.0, 0.0, 0.0), (1, 1, 1), 3.0)], env_strength=0.0, spec_scale=0.0)
    soft = shade(gb, c, base)[0, :, 0]
    crisp = shade(gb, c, replace(base, terminator=1.0))[0, :, 0]
    assert (np.diff(crisp) >= -1e-5).all()
    assert np.abs(np.diff(crisp)).max() > 2 * np.abs(np.diff(soft)).max()


def test_outline_silhouette_can_be_switched_off(model, cam):
    gb = render_gbuffer_frame(model, cam, FrameConfig())
    lin = shade(gb, cam, ShadeConfig())
    both = postprocess(lin, gb, ShadeConfig(outline=0.5), cam)
    inner = postprocess(lin, gb, ShadeConfig(outline=0.5, outline_silhouette=0.0), cam)
    none = postprocess(lin, gb, ShadeConfig(), cam)
    changed_both, changed_inner = (both != none).any(-1), (inner != none).any(-1)
    assert changed_inner.sum() < changed_both.sum() and (changed_inner <= changed_both).all()


def test_glow_and_bloom_only_brighten(model, cam):
    gb = render_gbuffer_frame(model, cam, FrameConfig())
    lin = shade(gb, cam, ShadeConfig())
    a = postprocess(lin, gb, ShadeConfig(), cam)
    b = postprocess(lin, gb, ShadeConfig(bloom=0.6, glow=0.1), cam)
    assert (b >= a - 1e-6).all() and b.max() <= 1.0
    assert (b[gb["alpha"] <= 0.5] > a[gb["alpha"] <= 0.5] + 1e-4).any()  # the halo reaches the background


def test_fixed_palette_and_flat_splats(model, cam):
    gb = render_gbuffer_frame(model, cam, FrameConfig(raster=RasterConfig(tile=4, k=256, hard=True)))
    lin = shade(gb, cam, ShadeConfig())
    m = gb["alpha"] > 0.5
    pal = fit_palette([postprocess(lin, gb, ShadeConfig(), cam)[m]], 8)
    img = postprocess(lin, gb, ShadeConfig(palette_colors=pal), cam)
    assert len(np.unique(np.round(img[m], 4), axis=0)) <= 8
    assert np.allclose(apply_palette(pal.copy(), pal), pal)
    flat = postprocess(lin, gb, ShadeConfig(flat_splats=True), cam)
    ids = gb["id"][m]
    one = ids == np.bincount(ids).argmax()  # the splat covering the most pixels
    assert one.sum() > 1 and np.ptp(flat[m][one], axis=0).max() < 1e-6


def test_ssao_and_curvature_signs():
    """A V-shaped groove is occluded and has negative curvature; a ridge is open and positive."""
    h, w = 9, 16
    xs = (np.arange(w) - 7.5) * 0.02
    for sign in (+1, -1):  # +1 = groove (centre is farther), -1 = ridge
        depth = np.tile(3.0 - sign * (np.abs(xs) - 0.15), (h, 1)).astype(np.float32)
        n = np.zeros((h, w, 3), np.float32)
        n[..., 0] = -sign * np.sign(xs) * 0.7071
        n[..., 2] = 0.7071
        gb = dict(flat_gb(h, w), depth=depth, normal=n)
        c = orbit_camera(0, 0, w, h, radius=3.0, ortho=True, ortho_extent=h * 0.01)
        P = gbuf.world_positions(c, depth)
        ao = gbuf.ssao(gb, P, radius_px=3, world_radius=0.2)[4, 6:10].mean()
        curv = gbuf.curvature(gb, c.viewmat)[4, 7:9].mean()
        if sign > 0:
            assert ao < 0.9 and curv < 0
        else:
            assert ao > 0.99 and curv > 0


# ------------------------------------------------------------------ LOD
def test_lod_merges_and_still_covers(model, cam):
    small = orbit_camera(30, 15, 40, 50, radius=fit_radius_for_fov(30))
    cell = pixel_world_size(small) * 1.5
    lod = merge_splats(model, cell, overlap=1.0)
    assert lod.n < 0.6 * model.n and int(lod.patch.max()) <= int(model.patch.max())
    fc = FrameConfig(raster=RasterConfig(tile=4, k=256, hard=True))
    a = render_gbuffer_frame(model, small, fc)["alpha"] > 0.5
    b = render_gbuffer_frame(lod, small, fc)["alpha"] > 0.5
    assert (a & b).sum() / a.sum() > 0.93 and (a & b).sum() / (a | b).sum() > 0.8
    big = orbit_camera(30, 15, 400, 500, radius=fit_radius_for_fov(30))
    assert lod_for_camera(model, big) is model  # splats already larger than a pixel: untouched

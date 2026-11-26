"""Regression tests for the confirmed core bugs of the audit (F1..F9)."""
import math
from pathlib import Path

import numpy as np
import pytest
import torch

from pixelsplat import cli, sdf
from pixelsplat import gbuffer as gbuf
from pixelsplat.camera import fit_radius_for_fov, orbit_camera
from pixelsplat.mesh import make_demo_knight, normalize_parts
from pixelsplat.raster import RasterConfig, rasterize
from pixelsplat.shade import FrameConfig, ShadeConfig, postprocess, render_gbuffer_frame
from pixelsplat.shadow import make_shadow_map, visibility
from pixelsplat.splats import SplatModel, _logit

NIKE = Path(__file__).resolve().parents[1] / "models" / "nike_v4_60k.pt"


def facing(z, s=0.3, op=0.95, x=0.0):
    """Splats on the z axis that face a camera at +z: (means, R, scales, opacity, feats)."""
    n = len(z)
    means = torch.zeros(n, 3)
    means[:, 0] = torch.as_tensor(x, dtype=torch.float32)
    means[:, 2] = torch.as_tensor(z, dtype=torch.float32)
    R = torch.eye(3).expand(n, 3, 3).clone()
    scales = torch.full((n, 2), 1.0) * torch.as_tensor(s, dtype=torch.float32).reshape(-1, 1)
    opacity = torch.full((n,), 1.0) * torch.as_tensor(op, dtype=torch.float32)
    feats = torch.arange(n, dtype=torch.float32)[:, None] + 1
    return means, R, scales, opacity, feats


# ------------------------------------------------------------------ F1: NaN in the last splat
@pytest.mark.parametrize("bad", ["nan_mean", "inf_scale"])
@pytest.mark.parametrize("hard", [False, True])
def test_bad_last_splat_does_not_poison_the_frame(bad, hard):
    cam = orbit_camera(0, 0, 16, 16, radius=3.0, fov_deg=30)
    rc = RasterConfig(tile=4, k=8, hard=hard)
    m, R, s, o, f = facing([0.0, 0.1, 0.2])
    with torch.no_grad():
        ref = rasterize(m[:2], R[:2], s[:2], o[:2], f[:2], R[:2, :, 2], cam, rc)
    base = m.clone().requires_grad_()
    poison = torch.zeros(3, 3)
    if bad == "nan_mean":
        poison[2, 0] = float("nan")
    else:
        s = s.clone()
        s[2] = float("inf")
    out = rasterize(base + poison, R, s, o, f, R[..., 2], cam, rc)
    for key in ("alpha", "depth", "feat", "normal"):
        assert torch.isfinite(out[key]).all(), key
        assert torch.allclose(out[key], ref[key], atol=1e-6), key
    assert (out["alpha"] > 0.5).any()
    (out["alpha"].sum() + out["depth"].sum() + out["feat"].sum()).backward()
    assert torch.isfinite(base.grad[:2]).all()


# ------------------------------------------------------------------ F2: depth of edge-on splats
def _tilted(deg):
    a = math.radians(deg)  # rotation about y: 0 = facing the camera at +z, 90 = seen from the side
    return torch.tensor([[[math.cos(a), 0.0, math.sin(a)], [0.0, 1.0, 0.0], [-math.sin(a), 0.0, math.cos(a)]]])


@pytest.mark.parametrize("kernel", [(2.0, 2.0), (8.0, 6.0)])
def test_edge_on_splat_depth_stays_inside_the_splat(kernel):
    cam = orbit_camera(0, 0, 17, 17, radius=3.0, fov_deg=30)  # pixel 8 is the exact image centre
    R = _tilted(89.9)
    means = torch.tensor([[0.028, 0.0, 0.0]], requires_grad=True)  # ~0.3 px right of the centre
    scales = torch.full((1, 2), 0.3, requires_grad=True)
    out = rasterize(means, R, scales, torch.tensor([0.95]), torch.ones(1, 1), R[..., 2], cam,
                    RasterConfig(tile=4, k=4, cull_backfaces=False, kernel_p=kernel[0], kernel_m=kernel[1]))
    alpha = out["alpha"].detach()
    cov = alpha > 0.05
    assert cov[8, 8]
    d = (out["depth"].detach() / alpha.clamp_min(1e-6))[cov]
    # the splat reaches 3σ = 0.9 in depth around its centre (z = 3); it was 3 ± 16 (the plane
    # extrapolated far outside the splat)
    assert (d - 3.0).abs().max() < 0.9 + 1e-3, d
    out["depth"].sum().backward()
    assert torch.isfinite(means.grad).all() and torch.isfinite(scales.grad).all()


def test_depth_of_real_plane_hits_is_unchanged():
    cam = orbit_camera(0, 0, 32, 32, radius=3.0, fov_deg=30)
    R = _tilted(60.0)
    args = (torch.zeros(1, 3), R, torch.full((1, 2), 0.2), torch.tensor([0.95]), torch.ones(1, 1), R[..., 2], cam)
    on = rasterize(*args, RasterConfig(tile=4, k=4, cull_backfaces=False, min_screen_sigma=True))
    off = rasterize(*args, RasterConfig(tile=4, k=4, cull_backfaces=False, min_screen_sigma=False))
    cov = off["alpha"] > 0.05
    d_on, d_off = (on["depth"] / on["alpha"].clamp_min(1e-6))[cov], (off["depth"] / off["alpha"])[cov]
    assert cov.sum() > 50 and float(d_off.max() - d_off.min()) > 0.3  # the tilt shows in the depth
    assert torch.allclose(d_on, d_off, atol=1e-5)


@pytest.mark.skipif(not NIKE.exists(), reason="saved model not present")
def test_saved_model_depth_stays_inside_the_model():
    torch.set_num_threads(2)
    m = SplatModel.load(str(NIKE))
    cam = orbit_camera(20, 10, 160, 160, radius=fit_radius_for_fov(30, 1.3), fov_deg=30, target=(0, -0.1, -0.2))
    with torch.no_grad():
        R = m.rot()
        for hard in (False, True):
            o = rasterize(m.means, R, m.scales(), m.opacity(), m.material(), R[..., 2], cam,
                          RasterConfig(tile=4, k=256, hard=hard))
            a = o["alpha"]
            d = (o["depth"] / a.clamp_min(1e-6))[a > 0.05]
            assert 4.4 < float(d.min()) and float(d.max()) < 5.8, (hard, float(d.min()), float(d.max()))


# ------------------------------------------------------------------ F3: tile overflow retry
def _stack_in_front_of_a_wall(n_front=300, side=12):
    """A wall (red, ~10 % of the image) and, in front of it, a tight stack of small opaque splats."""
    g = (np.arange(side) + 0.5 - side / 2) * 0.04
    gx, gy = np.meshgrid(g, g)
    n = n_front + side * side
    means = np.zeros((n, 3))
    means[:n_front, 2] = np.linspace(0.5, 0.2, n_front)
    means[n_front:, 0], means[n_front:, 1] = gx.ravel(), gy.ravel()
    ls = np.log(np.concatenate([np.full(n_front, 0.012), np.full(side * side, 0.03)]))[:, None].repeat(2, 1)
    alb = np.zeros((n, 3))
    alb[n_front:] = [1, 0, 0]
    return SplatModel(means, np.tile([1, 0, 0, 0], (n, 1)), ls, _logit(np.full(n, 0.95)), alb,
                      np.full(n, 0.5), np.zeros(n))


def test_overflow_retry_looks_at_occupied_tiles_only():
    m = _stack_in_front_of_a_wall()
    cam = orbit_camera(0, 0, 128, 128, radius=3.0, fov_deg=30)
    with torch.no_grad():
        R = m.rot()
        args = (m.means, R, m.scales(), m.opacity(), m.material(), R[..., 2], cam)
        once = rasterize(*args, RasterConfig(tile=4, k=256, hard=True))
        full = rasterize(*args, RasterConfig(tile=4, k=1024, hard=True))
    assert full["overflow"] == 0
    cov_full = (full["alpha"] > 0.5).numpy()
    assert 0.03 < cov_full.mean() < 0.15  # the model fills only a small part of the image
    assert once["overflow"] < 0.01 < once["overflow_occupied"]  # … so the whole-image ratio hides it
    assert once["overflow_open"] > 0
    holes = cov_full & ~(once["alpha"] > 0.5).numpy()
    assert holes.sum() > 20  # truncated tiles lose the wall behind the stack
    gb = render_gbuffer_frame(m, cam, FrameConfig(raster=RasterConfig(tile=4, k=256, hard=True)))
    assert ((gb["alpha"] > 0.5) == cov_full).all()  # the frame renderer retried with more slots
    assert (gb["albedo"][holes][:, 0] > 0.9).all()


def test_no_retry_when_truncation_cannot_change_the_picture(monkeypatch):
    # 300 opaque layers that each fill the whole image: every tile is truncated at K=256, but
    # every pixel is already closed by the front layer, so a larger K would be wasted work
    m, R, s, o, f = facing(np.linspace(0.5, 0.0, 300), s=2.0)
    cam = orbit_camera(0, 0, 32, 32, radius=3.0, fov_deg=30)
    with torch.no_grad():
        out = rasterize(m, R, s, o, f, R[..., 2], cam, RasterConfig(tile=4, k=256, hard=True))
    assert out["overflow_occupied"] == 1.0 and out["overflow_open"] == 0.0
    import pixelsplat.shade as shade_mod

    calls = []
    monkeypatch.setattr(shade_mod, "rasterize", lambda *a, **k: (calls.append(a[7].k), rasterize(*a, **k))[1])
    n = len(m)
    model = SplatModel(m.numpy(), np.tile([1, 0, 0, 0], (n, 1)), np.log(s.numpy()), _logit(o.numpy()),
                       np.full((n, 3), 0.5), np.full(n, 0.5), np.zeros(n))
    gb = render_gbuffer_frame(model, cam, FrameConfig(raster=RasterConfig(tile=4, k=256, hard=True)))
    assert calls == [256] and (gb["alpha"] > 0.5).all()


def test_hard_binning_skips_splats_that_can_never_win():
    nf = 300  # front splats too transparent to pass hard_thresh: they must not use up the K slots
    z = np.concatenate([np.linspace(0.5, 0.1, nf), [0.0]])
    m, R, s, o, f = facing(z, s=np.concatenate([np.full(nf, 0.006), [0.05]]),
                           op=np.concatenate([np.full(nf, 0.06), [0.95]]))
    cam = orbit_camera(0, 0, 129, 129, radius=3.0, fov_deg=30)
    with torch.no_grad():
        out = rasterize(m, R, s, o, f, R[..., 2], cam, RasterConfig(tile=4, k=256, hard=True))
        soft = rasterize(m, R, s, o, f, R[..., 2], cam, RasterConfig(tile=4, k=256, hard=False))
    assert float(out["alpha"][64, 64]) == 1.0 and int(out["id"][64, 64]) == nf
    assert out["overflow"] == 0
    assert soft["overflow"] > 0  # blending still needs (and bins) the transparent ones


# ------------------------------------------------------------------ F4: 2/4 tie of the 2x vote
def _line_gb(cols, h=16, w=16):
    alpha = np.zeros((h, w), np.float32)
    alpha[:, cols] = 1
    n = np.zeros((h, w, 3), np.float32)
    n[..., 2] = 1
    return dict(alpha=alpha, albedo=np.full((h, w, 3), 0.6, np.float32), rough=np.full((h, w), 0.5, np.float32),
                metal=np.zeros((h, w), np.float32), normal=n, depth=np.full((h, w), 3.0, np.float32),
                id=np.arange(h * w).reshape(h, w))


@pytest.mark.parametrize("mode", ["medoid", "mean"])
def test_two_of_four_tie_counts_as_covered(mode):
    thr = ShadeConfig().alpha_threshold

    def vote(gb):
        return gbuf.select_downsample(gb, 2, thr, mode, tie_covers=True)

    out = vote(_line_gb([3, 4]))  # a 2 px line across an art-pixel border: 2 of 4 on either side
    mask = out["alpha"] > thr
    assert mask[:, 1:3].all() and mask.sum() == 8 * 2  # was: the whole line vanished
    assert np.allclose(out["depth"][mask], 3.0) and np.allclose(out["albedo"][mask], 0.6)
    dots = _line_gb([3])
    dots["alpha"][1::2] = 0  # one sample of four: still a minority
    one = vote(dots)
    assert (one["alpha"][:, 1] == 0.25).all() and not (one["alpha"] > thr).any()
    assert (vote(_line_gb([]))["alpha"] == 0).all()
    assert (vote(_line_gb(list(range(16))))["alpha"] == 1).all()
    # without the switch the function still returns the plain fraction
    assert (gbuf.select_downsample(_line_gb([3, 4]), 2, thr, mode)["alpha"][:, 1:3] == 0.5).all()


def test_frame_renderer_keeps_a_thin_line_on_an_art_pixel_border():
    # a column of small splats whose 2x image is a ~2 sample wide line centred on an art-pixel border
    n = 40
    cam = orbit_camera(0, 0, 32, 32, radius=3.0, fov_deg=30)
    f = cam.A[0, 0]
    means = np.zeros((n, 3))
    means[:, 1] = np.linspace(-0.5, 0.5, n)  # x = 0 projects onto the border between columns 15 | 16
    sigma = 0.36 * 3.0 / f  # hard hit radius 1.41σ ≈ 0.5 art px = 1 sample on either side
    m = SplatModel(means, np.tile([1, 0, 0, 0], (n, 1)), np.full((n, 2), np.log(sigma)), _logit(np.full(n, 0.95)),
                   np.full((n, 3), 0.6), np.full(n, 0.5), np.zeros(n))
    gb = render_gbuffer_frame(m, cam, FrameConfig(raster=RasterConfig(tile=4, k=64, hard=True), supersample=2))
    mask = gb["alpha"] > 0.5
    assert mask[8:24, 15:17].all()  # was empty: both columns got exactly 2 of 4


# ------------------------------------------------------------------ F5: outline must not wrap around
def test_outline_does_not_wrap_around_the_image():
    h, w = 12, 10
    gb = _line_gb(list(range(w)), h, w)
    gb["alpha"][3:] = 0  # the model touches the top edge (rows 0..2), nothing at the bottom
    cfg = ShadeConfig(outline=0.5)
    img = postprocess(np.full((h, w, 3), 0.3, np.float32), gb, cfg)
    assert np.allclose(img[0], img[1])  # top row: its "neighbour above" is outside, not the bottom row
    assert (img[2] < img[1] - 0.05).all()  # the real silhouette (bottom of the model) is still drawn
    gb = _line_gb(list(range(w)), h, w)
    gb["alpha"][:, 3:] = 0  # same for a model that touches only the left edge
    img = postprocess(np.full((h, w, 3), 0.3, np.float32), gb, cfg)
    assert np.allclose(img[:, 0], img[:, 1]) and (img[:, 2] < img[:, 1] - 0.05).all()


# ------------------------------------------------------------------ F6: marching-cubes winding
def _sphere_mesh():
    r = 0.6
    comp = {"ball": (lambda p: np.linalg.norm(p, axis=-1) - r, (np.full(3, -r), np.full(3, r)))}
    return sdf.mesh_components(comp, voxel=0.05)


def _volume_and_outward(verts, faces):
    v = verts[faces].astype(np.float64)
    vol = (v[:, 0] * np.cross(v[:, 1], v[:, 2])).sum() / 6.0
    nrm = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
    return vol, float(((nrm * v.mean(1)).sum(-1) > 0).mean())


def test_sdf_mesh_faces_point_outward(monkeypatch):
    vol, outward = _volume_and_outward(*_sphere_mesh())
    assert vol == pytest.approx(4 / 3 * math.pi * 0.6 ** 3, rel=0.05) and outward > 0.95
    import skimage.measure as skm

    orig = skm.marching_cubes

    def flipped(*a, **k):  # a library version with the opposite winding must give the same result
        verts, faces, *rest = orig(*a, **k)
        return (verts, faces[:, ::-1], *rest)

    monkeypatch.setattr(skm, "marching_cubes", flipped)
    vol, outward = _volume_and_outward(*_sphere_mesh())
    assert vol > 0.85 and outward > 0.95


# ------------------------------------------------------------------ F7: shadow acne
SUN = np.array((0.86, 0.42, 0.30))


def _plane_splats(normal, center, size, n):
    nrm = np.asarray(normal, float)
    nrm = nrm / np.linalg.norm(nrm)
    a = np.cross(nrm, [0, 1, 0])
    a /= np.linalg.norm(a)
    b = np.cross(nrm, a)
    g = ((np.arange(n) + 0.5) / n - 0.5) * size
    U, V = np.meshgrid(g, g)
    P = np.asarray(center) + U.reshape(-1, 1) * a + V.reshape(-1, 1) * b
    Rm = np.repeat(np.stack([a, b, nrm], -1)[None], len(P), 0)
    spl = (torch.tensor(P, dtype=torch.float32), torch.tensor(Rm, dtype=torch.float32),
           torch.full((len(P), 2), size / n * 0.8), torch.full((len(P),), 0.95))
    return spl, (a, b, nrm)


@pytest.mark.parametrize("angle", [70, 80])
def test_no_shadow_acne_on_a_surface_lit_at_a_grazing_angle(angle):
    torch.set_num_threads(2)
    L = SUN / np.linalg.norm(SUN)
    perp = np.cross(L, [0, 1, 0])
    perp /= np.linalg.norm(perp)
    t = math.radians(angle)
    c = np.array((0.0, -0.1, -0.2))
    spl, (a, b, nrm) = _plane_splats(math.cos(t) * L + math.sin(t) * perp, c, 0.8, 60)
    sm = make_shadow_map(*spl, SUN, center=c, extent=1.45, res=320, k=64)
    g = np.linspace(-0.3, 0.3, 121)
    U, V = np.meshgrid(g, g)
    P = c + U[..., None] * a + V[..., None] * b  # points ON the plane: nothing shades them
    old = (visibility(sm, P, bias=0.025, pcf=1) < 1).mean()
    new = (visibility(sm, P, bias=0.025, pcf=1, normals=np.broadcast_to(nrm, P.shape)) < 1).mean()
    assert old > 0.3  # the fixed bias alone: the PCF neighbours read the plane itself as an occluder
    assert new < 0.02


def test_real_shadow_survives_the_acne_fix():
    torch.set_num_threads(2)
    L = SUN / np.linalg.norm(SUN)
    Lh = np.array([L[0], 0, L[2]])
    Lh /= np.linalg.norm(Lh)
    (m, R, s, o), _ = _plane_splats(Lh, (0, -0.8, -0.2), 0.4, 40)  # a 0.4 high wall on the ground y=-1
    sm = make_shadow_map(m, R, s, o, SUN, center=(0, -0.1, -0.2), extent=1.45, res=320, k=64)
    d = np.linspace(0, 1.2, 1201)
    P = np.array((0, -1.0, -0.2))[None] - d[:, None] * Lh  # walk away from the wall, on the ground
    expect = 0.4 / math.tan(math.asin(L[1]))  # 0.867
    plain = d[np.where(visibility(sm, P, bias=0.02, pcf=1) < 0.5)[0][-1]]
    up = np.broadcast_to(np.array((0.0, 1.0, 0.0)), P.shape)
    offs = d[np.where(visibility(sm, P, bias=0.02, pcf=1, normals=up) < 0.5)[0][-1]]
    assert abs(plain - expect) < 0.05  # the call without normals is unchanged (0.891 measured)
    assert abs(offs - expect) < 0.05


# ------------------------------------------------------------------ F8: bake must not lose the training
BAKE = ["--splats", "300", "--iters", "0", "--views", "2", "--res", "32"]


def test_bake_with_more_patches_than_splats(tmp_path):
    out = tmp_path / "m.pt"
    cli.main(["bake", "demo", "-o", str(out), "--patches", "500", *BAKE])
    m = SplatModel.load(str(out))
    assert m.n == 300 and 0 < int(m.patch.max()) < 300


def test_bake_saves_before_patch_assignment(tmp_path, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("k-means failed")

    monkeypatch.setattr(cli, "assign_patches", boom)
    out = tmp_path / "m.pt"
    with pytest.raises(RuntimeError):
        cli.main(["bake", "demo", "-o", str(out), "--patches", "20", *BAKE])
    assert SplatModel.load(str(out)).n == 300  # the trained splats are on disk anyway


# ------------------------------------------------------------------ F9: `part` follows prune / save / load
def test_part_labels_follow_prune_and_save_load(tmp_path):
    parts = normalize_parts(make_demo_knight())
    m = SplatModel.from_mesh(parts, 800, seed=0)
    part0 = np.asarray(m.part).copy()
    assert len(part0) == 800 and len(np.unique(part0)) > 1
    keep = torch.arange(800) % 3 != 0
    m.prune(keep)
    assert len(m.part) == m.n == int(keep.sum())
    assert (np.asarray(m.part) == part0[keep.numpy()]).all()
    path = tmp_path / "m.pt"
    torch.save(m.state_dict(), path)
    m2 = SplatModel.load(str(path))
    assert (np.asarray(m2.part) == np.asarray(m.part)).all()
    # files written before `part` was stored still load
    sd = {k: v for k, v in m.state_dict().items() if k != "part"}
    torch.save(sd, path)
    assert SplatModel.load(str(path)).n == m.n

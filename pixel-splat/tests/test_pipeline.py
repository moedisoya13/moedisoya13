"""Fast sanity checks for the pixelsplat pipeline (CPU, < ~30 s)."""
import numpy as np
import pytest
import torch

from pixelsplat.camera import fit_radius_for_fov, orbit_camera
from pixelsplat.gt import render_gbuffer
from pixelsplat.mesh import make_demo_knight, normalize_parts
from pixelsplat.raster import RasterConfig, render_model
from pixelsplat.shade import FrameConfig, patch_snap_shift, render_frame
from pixelsplat.splats import SplatModel
from pixelsplat.train import assign_patches


@pytest.fixture(scope="module")
def scene():
    parts = normalize_parts(make_demo_knight())
    model = SplatModel.from_mesh(parts, 6000, seed=0)
    assign_patches(model, 20)
    return parts, model


@pytest.mark.parametrize("ortho", [False, True])
def test_splat_coverage_matches_mesh(scene, ortho):
    """Mesh-initialised splats should cover (almost) every pixel the mesh covers.

    Untrained splats overhang the silhouette by ~1 px (disks hanging over edges);
    training removes that, so IoU is only loosely bounded here while recall is strict."""
    parts, model = scene
    cam = orbit_camera(30, 15, 96, 96, radius=fit_radius_for_fov(30), ortho=ortho)
    gt = render_gbuffer(parts, cam, ssaa=2)[..., 9] > 0.5
    with torch.no_grad():
        out = render_model(model, cam, RasterConfig(tile=4, k=512))
    pred = out["alpha"].numpy() > 0.5
    iou = (gt & pred).sum() / (gt | pred).sum()
    assert out["overflow"] == 0.0
    recall = (gt & pred).sum() / gt.sum()
    assert recall > 0.99, recall
    assert iou > 0.8, iou


def test_depth_and_normals_agree(scene):
    parts, model = scene
    cam = orbit_camera(-40, 20, 96, 96, radius=fit_radius_for_fov(30))
    gb = render_gbuffer(parts, cam, ssaa=1)
    with torch.no_grad():
        out = render_model(model, cam, RasterConfig(tile=4, k=512))
    a = out["alpha"].numpy()
    both = (gb[..., 9] > 0.99) & (a > 0.99)
    d_err = np.abs(out["depth"].numpy()[both] / a[both] - gb[..., 6][both])
    assert np.median(d_err) < 0.02
    n = out["normal"].numpy()[both]
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    cos = (n * gb[..., 3:6][both]).sum(-1)
    assert np.median(cos) > 0.95


def test_gradients_are_finite(scene):
    _, model = scene
    cam = orbit_camera(10, 5, 64, 64, radius=fit_radius_for_fov(30))
    for kw in ({}, {"kernel_p": 8.0, "kernel_m": 6.0}):
        model.zero_grad()
        out = render_model(model, cam, RasterConfig(tile=4, k=128, **kw))
        (out["feat"].sum() + out["normal"].sum() + out["depth"].sum() + out["alpha"].sum()).backward()
        grads = [p.grad for p in model.parameters() if p.grad is not None]
        assert grads and all(torch.isfinite(g).all() for g in grads)


def test_patch_snap_puts_anchors_on_pixel_centres(scene):
    _, model = scene
    cam = orbit_camera(33.3, 11.1, 80, 100, radius=fit_radius_for_fov(30))
    shift = patch_snap_shift(model, cam)
    assert shift.abs().max() <= 0.5 + 1e-5
    # every splat in a patch gets the same shift
    for pid in range(int(model.patch.max()) + 1):
        s = shift[model.patch == pid]
        assert torch.allclose(s, s[:1].expand_as(s))


@pytest.mark.parametrize("mode", ["lit", "albedo", "normal", "depth", "patches"])
def test_render_frame_modes(scene, mode):
    _, model = scene
    cam = orbit_camera(0, 10, 48, 64, radius=fit_radius_for_fov(30))
    img = render_frame(model, cam, FrameConfig(mode=mode, snap=True))
    assert img.shape == (64, 48, 3) and np.isfinite(img).all()
    assert 0.0 <= img.min() and img.max() <= 1.0


def test_pose_splats_identity_and_rigid(scene):
    """Identity bones leave splats untouched; a rigid rotation rotates means and normals."""
    from pixelsplat.skin import pose_splats, rot_y

    _, model = scene
    W = torch.ones(model.n, 1)
    I = torch.as_tensor(np.eye(3, 4), dtype=torch.float32)[None]
    with torch.no_grad():
        m, R, s = pose_splats(model, W, I)
        assert torch.allclose(m, model.means, atol=1e-5)
        assert torch.allclose(s, model.scales(), atol=1e-5)
        assert torch.allclose(R[..., 2], model.normals(), atol=1e-4)
        Rot = torch.as_tensor(rot_y(40.0), dtype=torch.float32)
        M = torch.cat([Rot, torch.tensor([[0.1], [0.0], [0.2]])], 1)[None]
        m2, R2, s2 = pose_splats(model, W, M)
        assert torch.allclose(m2, model.means @ Rot.T + torch.tensor([0.1, 0.0, 0.2]), atol=1e-5)
        assert torch.allclose(R2[..., 2], model.normals() @ Rot.T, atol=1e-4)
        assert torch.allclose(s2, model.scales(), atol=1e-5)

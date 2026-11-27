"""Short check (20 - 30 s on 4 CPU cores) that the engine in a work folder is installed and behaves.

    <python> selftest.py WORKDIR            # WORKDIR = the folder setup.sh filled

Runs the real commands on a tiny job and checks numbers, not just exit codes:

  1 imports     the libraries of requirements.txt load; versions are printed
  2 sculpt      bare mannequin, coarse grid (soldier.py sculpt --outfit none --voxel 0.02)
  3 bake        3000 splats, no training   (soldier.py bake --splats 3000 --res 64 --iters 0)
  4 rigid       every splat rides on exactly one bone; a pose leaves same-bone distances unchanged
  5 render      one "Almost Pixel Perfect" frame of a walking pose -> out/selftest/selftest_app.png
  6 feet        over a travelling walk cycle the planted foot does not move in the world
  7 arms        the mitten hands close into a fist (grip 0 -> 1) and an elbow tucked into the chest is swung out
                of it with the wrist left where it was

Exit code 0 = all passed.  Open the PNG and look at it: a number cannot tell a figure from a blob.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

OUT = "out/selftest"
results = []


def step(name):
    def wrap(fn):
        t0 = time.time()
        try:
            detail = fn()
            results.append((name, True, detail, time.time() - t0))
        except Exception as e:  # noqa: BLE001 - report every step, then fail at the end
            results.append((name, False, f"{type(e).__name__}: {e}", time.time() - t0))
        ok, detail, dt = results[-1][1:]
        print(f"[{'PASS' if ok else 'FAIL'}] {name:8s} {dt:5.1f}s  {detail}", flush=True)
        return fn
    return wrap


def run(*args):
    r = subprocess.run([sys.executable, "template/soldier.py", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1])
    return r.stdout.strip().splitlines()[-1]


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    work = Path(sys.argv[1]).resolve()
    if not (work / "pixelsplat").is_dir() or not (work / "template" / "soldier.py").is_file():
        raise SystemExit(f"{work} has no engine (pixelsplat/, template/): run setup.sh first")
    os.chdir(work)
    sys.path[:0] = [str(work), str(work / "template")]
    t_all = time.time()

    @step("imports")
    def _():
        import numba, numpy, PIL, scipy, skimage, sklearn, torch, trimesh  # noqa: E401,F401
        return (f"python {sys.version.split()[0]}, torch {torch.__version__.split('+')[0]}, numpy {numpy.__version__}, "
                f"numba {numba.__version__}, {os.cpu_count()} cpu")

    if not results[-1][1]:
        raise SystemExit("libraries missing: install requirements.txt into this interpreter (setup.sh does it)")

    @step("sculpt")
    def _():
        last = run("sculpt", "-o", OUT, "--outfit", "none", "--voxel", "0.02")
        assert (work / OUT / "soldier_mesh.npz").is_file(), "no mesh file written"
        return last.replace("[sculpt] ", "")

    @step("bake")
    def _():
        last = run("bake", "-o", OUT, "--splats", "3000", "--res", "64", "--iters", "0")
        assert (work / OUT / "soldier_splats.pt").is_file(), "no splat file written"
        return last.replace("[bake] ", "")

    import numpy as np

    state = {}

    @step("rigid")
    def _():
        import motion
        import soldier
        sc, model, bones = soldier.load_model(OUT)
        R = soldier.Renderer(model, bones, app=True)
        state.update(soldier=soldier, motion=motion, R=R)
        W = R.W.numpy()
        assert ((W == 0) | (W == 1)).all() and (W.sum(1) == 1).all(), "weights are not one-hot"
        mats, _root = motion.walk_pose(soldier.SKEL, 0.2)
        rest = model.means.detach().numpy()
        posed = R.pose(mats)[0].detach().numpy()  # pose_splats -> (means, rotations, scales)
        worst = 0.0
        rng = np.random.default_rng(0)
        for b in np.unique(bones):
            idx = np.nonzero(bones == b)[0]
            if len(idx) < 2:
                continue
            i, j = rng.choice(idx, 200), rng.choice(idx, 200)
            d0 = np.linalg.norm(rest[i] - rest[j], axis=1)
            d1 = np.linalg.norm(posed[i] - posed[j], axis=1)
            worst = max(worst, float(np.abs(d1 - d0).max()))
        assert worst < 1e-5, f"same-bone splat distance changed by {worst:.2e}"
        return f"{model.n} splats on {len(np.unique(bones))} bones, one-hot; same-bone distance change max {worst:.1e}"

    @step("render")
    def _():
        soldier, motion, R = state["soldier"], state["motion"], state["R"]
        from pixelsplat.shade import upscale
        import shared
        cam = soldier.camera(px=96)
        mats, root = motion.walk_pose(soldier.SKEL, 0.2)
        img = R.frame(cam, mats, root)
        assert np.isfinite(img).all(), "non-finite pixels"
        fig = R.coverage(cam, mats)
        frac = float(fig.mean())
        assert 0.05 < frac < 0.5, f"figure covers {100 * frac:.1f}% of the frame (expected 5-50%)"
        rows = np.nonzero(fig.any(1))[0]
        tall = (rows.max() - rows.min() + 1) / fig.shape[0]
        assert tall > 0.6, f"figure is only {100 * tall:.0f}% of the frame height"
        colours = len(np.unique((img[fig] * 31).astype(np.uint8), axis=0))
        assert colours > 8, "figure is one flat colour"
        path = work / OUT / "selftest_app.png"
        shared.save_png(upscale(img, 4), str(path))
        return f"{img.shape[1]}x{img.shape[0]}px, figure {100 * frac:.1f}% of frame, {100 * tall:.0f}% of height -> {path}"

    @step("feet")
    def _():
        rep = state["soldier"].foot_report(steps=120)
        assert rep["stance_slide"] < 1e-5, f"planted foot slides {rep['stance_slide']:.2e}"
        assert rep["limit_violations"] == 0, f"{rep['limit_violations']} joint-limit violations in the walk"
        assert rep["max_reach"] < 1.0, f"leg over-stretched ({rep['max_reach']:.4f})"
        return (f"planted point moves {rep['stance_slide']:.1e} (world units), heading {rep['stance_heading_deg']:.1e} deg, "
                f"leg reach {rep['max_reach']:.4f}, limit violations 0")

    @step("arms")
    def _():
        import arms
        import retarget as rt
        import rig
        soldier, R = state["soldier"], state["R"]
        skel = soldier.SKEL
        hand = [skel.index[b] for b in ("handL", "fingersL", "thumbL")]
        mine = np.isin(R.bones, hand)
        assert mine.sum() > 20 and np.isin(R.bones, hand[1:]).sum() > 5, "the fingers and thumb carry no splats"
        axis = rig.ARM_AXIS[1]
        reach = {}
        for g in (0.0, 1.0):  # how far the hand's splats reach from the wrist: open, and as a fist
            rots = rig.set_grip({}, g, g)
            assert not rig.check_limits(rots), f"grip {g} is outside the joint limits"
            pts = R.pose(skel.world_mats(rots))[0].detach().numpy()[mine]
            reach[g] = float(((pts - rig.WRIST[1]) @ axis).max())
        assert reach[1.0] < 0.75 * reach[0.0], f"the fist is not shorter than the open hand ({reach[1.0]:.3f} vs {reach[0.0]:.3f})"
        # a rear guard with its elbow slid in front of the chest (where a stick figure's elbow can go)
        d = rt.unit(np.array([0.50, -0.78, 0.36]))
        pose = {"upperarmR": rt.shortest_arc(rig.ARM_AXIS[-1], d) @ rig.rot_axis(rig.ARM_AXIS[-1], 30.0),
                "forearmR": rig.local_rot("forearmR", pitch=-110.0)}
        frames = [dict(pose) for _ in range(3)]
        wrist = rt.at(rt.fk(pose), "handR", rig.WRIST[-1])
        before = arms.arm_depth(pose, "R")
        rep = arms.clear_elbows(frames, np.zeros((3, 3)), 30.0)["R"]
        moved = float(np.linalg.norm(rt.at(rt.fk(frames[1]), "handR", rig.WRIST[-1]) - wrist))
        assert before > 0.02, f"the test pose is not inside the chest ({before:.4f})"
        assert rep["inside_after"] == 0 and not rep["not_cleared"], f"elbow still inside: {rep['depth_after']:.4f}"
        assert moved < 1e-3 and not rig.check_limits(frames[1]), f"wrist moved {moved:.2e}"
        return (f"fist reaches {reach[1.0]:.3f} from the wrist (open hand {reach[0.0]:.3f}); elbow {before:+.3f} -> "
                f"{rep['depth_after']:+.3f} in the chest by a {rep['swivel_max']:.0f} deg swivel, wrist moved {moved:.1e}, "
                f"hand turned {rep['hand_turned_max']:.1f} deg")

    failed = [n for n, ok, *_ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed in {time.time() - t_all:.0f}s"
          + (f" - FAILED: {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

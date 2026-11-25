"""Re-paint an already trained Nike splat model with the current marble.py — no re-sculpt, no re-bake.

A trained splat's albedo is the mesh colour underneath it, so evaluating the paint at every splat
centre gives the same result as sculpting + baking again with the new paint (about a minute
instead of half an hour).  Only valid while the sculpt's shape (nike.full_sdf) still matches the
model; after a geometry change, sculpt and bake again.

    python examples/nike/repaint.py out/nike_colossus/nike_splats.pt -o out/nike_colossus/nike_splats_painted.pt
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))
import marble  # noqa: E402
import nike  # noqa: E402
from pixelsplat.splats import SplatModel  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model", help="trained splats (.pt)")
    ap.add_argument("-o", "--out", required=True, help="where to write the re-painted model (.pt)")
    ap.add_argument("--style", default="weathered", choices=["weathered", "flat"])
    ap.add_argument("--detail", type=float, default=1.0, help="strength of the fine paint layers (see marble.paint)")
    a = ap.parse_args()
    model = SplatModel.load(a.model)
    d = np.abs(nike.full_sdf(model.means.detach().numpy().astype(np.float32)))
    print(f"[repaint] {model.n} splats; median distance to the sculpt surface {np.median(d):.4f} "
          f"(should be ≈ a splat radius or less — if not, the sculpt changed: re-bake instead)")
    marble.repaint_splats(model, nike.full_sdf, nike.component_labels, style=a.style, detail=a.detail)
    torch.save(model.state_dict(), a.out)
    print("[repaint] wrote", a.out)


if __name__ == "__main__":
    main()

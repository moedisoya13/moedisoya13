"""Mesh input: load GLB/GLTF/OBJ into simple "parts" with PBR material info.

A *part* is one triangle mesh with one material:
  base color (texture or constant), roughness, metallic (texture or constant).
Normal maps are ignored (geometry normals only).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np


@dataclass
class Part:
    name: str
    verts: np.ndarray  # (V,3) float32
    faces: np.ndarray  # (F,3) int32
    normals: np.ndarray  # (V,3) float32, vertex normals
    uv: Optional[np.ndarray] = None  # (V,2) float32
    base_tex: Optional[np.ndarray] = None  # (H,W,3) float32 sRGB 0..1
    base_color: np.ndarray = field(default_factory=lambda: np.ones(3, np.float32))  # sRGB factor
    vert_colors: Optional[np.ndarray] = None  # (V,3) sRGB 0..1
    mr_tex: Optional[np.ndarray] = None  # (H,W,3): G=roughness, B=metallic (glTF)
    roughness: float = 0.6
    metallic: float = 0.0

    @property
    def area(self) -> float:
        v = self.verts[self.faces]
        return float(0.5 * np.linalg.norm(np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0]), axis=1).sum())


def _img_to_float(img) -> np.ndarray:
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    return np.ascontiguousarray(a)


def load_mesh(path: str) -> List[Part]:
    """Load any trimesh-readable file into Parts (scene transforms applied)."""
    import trimesh

    scene = trimesh.load(path, force="scene")
    parts: List[Part] = []
    for i, m in enumerate(scene.dump(concatenate=False)):
        if not isinstance(m, trimesh.Trimesh) or len(m.faces) == 0:
            continue
        p = Part(name=str(m.metadata.get("name", f"part{i}")),
                 verts=np.asarray(m.vertices, np.float32),
                 faces=np.asarray(m.faces, np.int32),
                 normals=np.asarray(m.vertex_normals, np.float32))
        vis = m.visual
        if isinstance(vis, trimesh.visual.TextureVisuals):
            mat = vis.material
            if vis.uv is not None and len(vis.uv) == len(m.vertices):
                p.uv = np.asarray(vis.uv, np.float32)
            # PBRMaterial (glTF) or SimpleMaterial (OBJ)
            bct = getattr(mat, "baseColorTexture", None) or getattr(mat, "image", None)
            if bct is not None and p.uv is not None:
                p.base_tex = _img_to_float(bct)
            bcf = getattr(mat, "baseColorFactor", None)
            if bcf is None:
                bcf = getattr(mat, "diffuse", None)
            if bcf is not None:
                bcf = np.asarray(bcf, np.float32)[:3]
                if bcf.max() > 1.0:
                    bcf = bcf / 255.0
                p.base_color = bcf
            mrt = getattr(mat, "metallicRoughnessTexture", None)
            if mrt is not None and p.uv is not None:
                p.mr_tex = _img_to_float(mrt)
            rf = getattr(mat, "roughnessFactor", None)
            mf = getattr(mat, "metallicFactor", None)
            p.roughness = float(rf) if rf is not None else (1.0 if mrt is not None else 0.6)
            p.metallic = float(mf) if mf is not None else (1.0 if mrt is not None else 0.0)
        elif isinstance(vis, trimesh.visual.ColorVisuals) and vis.kind is not None:
            vc = np.asarray(vis.vertex_colors, np.float32)[:, :3] / 255.0
            p.vert_colors = vc
        parts.append(p)
    if not parts:
        raise ValueError(f"no triangle meshes found in {path}")
    return parts


def normalize_parts(parts: List[Part], up_axis: str = "y") -> List[Part]:
    """Center the model and scale it so its largest half-extent is 1 (Y up)."""
    allv = np.concatenate([p.verts for p in parts])
    if up_axis == "z":  # convert Z-up assets to Y-up
        R = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], np.float32)
        for p in parts:
            p.verts = p.verts @ R.T
            p.normals = p.normals @ R.T
        allv = np.concatenate([p.verts for p in parts])
    lo, hi = allv.min(0), allv.max(0)
    c = (lo + hi) / 2
    s = 1.0 / max((hi - lo).max() / 2, 1e-8)
    for p in parts:
        p.verts = ((p.verts - c) * s).astype(np.float32)
    return parts


# ---------------------------------------------------------------- demo asset
def make_demo_knight() -> List[Part]:
    """A crude procedural knight built from primitives (no external assets).

    It exists only to exercise the pipeline end to end: metal (helmet, sword,
    shield), cloth (tabard), leather (legs/arms), and a *textured* shield with a
    gold cross so the UV-texture path is tested too.
    """
    import trimesh
    from trimesh.creation import box, capsule, cylinder, icosphere

    parts: List[Part] = []

    def add(name, m, color, rough, metal, uv=None, tex=None):
        m = m.copy()
        parts.append(Part(name, np.asarray(m.vertices, np.float32), np.asarray(m.faces, np.int32),
                          np.asarray(m.vertex_normals, np.float32), uv=uv, base_tex=tex,
                          base_color=np.asarray(color, np.float32), roughness=rough, metallic=metal))

    def T(m, *, t=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, s=None):
        if s is not None:
            m.apply_scale(s)
        for ang, ax in ((rx, [1, 0, 0]), (ry, [0, 1, 0]), (rz, [0, 0, 1])):
            if ang:
                m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(ang), ax))
        m.apply_translation(t)
        return m

    steel, leather, cloth, gold = (0.78, 0.78, 0.80), (0.36, 0.24, 0.15), (0.62, 0.20, 0.18), (0.95, 0.70, 0.25)
    # legs + boots
    for x in (-0.13, 0.13):
        add("leg", T(capsule(height=0.75, radius=0.085, count=[16, 16]), t=(x, -0.55, 0), rx=90), leather, 0.8, 0.0)
        add("boot", T(box(extents=[0.16, 0.12, 0.26]), t=(x, -0.95, 0.04)), (0.25, 0.17, 0.11), 0.7, 0.0)
    # tabard (cloth skirt) and torso armour
    add("tabard", T(cylinder(radius=0.27, height=0.55, sections=24), t=(0, -0.2, 0), rx=90, s=(1, 1, 0.8)), cloth, 0.9, 0.0)
    add("torso", T(capsule(height=0.45, radius=0.24, count=[20, 20]), t=(0, 0.22, 0), rx=90, s=(1, 1, 0.75)), steel, 0.3, 1.0)
    add("pauldron", T(icosphere(subdivisions=3, radius=0.14), t=(-0.30, 0.42, 0), s=(1, 0.8, 1)), steel, 0.25, 1.0)
    add("pauldron", T(icosphere(subdivisions=3, radius=0.14), t=(0.30, 0.42, 0), s=(1, 0.8, 1)), steel, 0.25, 1.0)
    # helmet
    add("helmet", T(icosphere(subdivisions=4, radius=0.17), t=(0, 0.72, 0), s=(1, 1.15, 1)), steel, 0.2, 1.0)
    add("visor", T(box(extents=[0.22, 0.03, 0.03]), t=(0, 0.72, 0.165)), (0.05, 0.05, 0.05), 0.5, 0.0)
    # sword arm (right side of the figure = -x) and sword
    add("arm", T(capsule(height=0.42, radius=0.065, count=[12, 12]), t=(-0.36, 0.15, 0.08), rx=70), leather, 0.8, 0.0)
    add("blade", T(box(extents=[0.05, 0.85, 0.015]), t=(-0.38, 0.45, 0.42), rx=-35), steel, 0.15, 1.0)
    add("guard", T(box(extents=[0.22, 0.035, 0.035]), t=(-0.38, 0.02, 0.18), rx=-35), gold, 0.3, 1.0)
    # shield arm + kite shield with a textured gold cross (planar UVs)
    add("arm", T(capsule(height=0.40, radius=0.065, count=[12, 12]), t=(0.36, 0.12, 0.10), rx=80), leather, 0.8, 0.0)
    # cylinder axis is +z, so the disk already faces the camera at azimuth 0
    sh = T(cylinder(radius=0.36, height=0.05, sections=40), t=(0.40, 0.05, 0.30), s=(0.8, 1.15, 1))
    v = np.asarray(sh.vertices)
    lo, hi = v.min(0), v.max(0)
    uv = np.stack([(v[:, 0] - lo[0]) / (hi[0] - lo[0]), (v[:, 1] - lo[1]) / (hi[1] - lo[1])], 1).astype(np.float32)
    tex = np.ones((64, 64, 3), np.float32) * np.asarray(steel, np.float32)
    tex[:, 26:38] = gold  # vertical bar
    tex[18:30, 8:56] = gold  # horizontal bar (row 0 = top, v=1)
    tex[:3], tex[-3:], tex[:, :3], tex[:, -3:] = gold, gold, gold, gold  # rim
    add("shield", sh, (1, 1, 1), 0.35, 1.0, uv=uv, tex=tex)
    return parts

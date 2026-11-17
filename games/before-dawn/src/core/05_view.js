// What the player can see, as pure deterministic math (no DOM): the isometric projection in
// "map px", the camera frame of a floor, and the simulation's view rectangle — the rule hook for
// "nothing hits from off screen" on floors larger than the screen.
//
// Map px: logical screen px of the projection with its origin at world (0, 0) and no camera:
//   mx = (x − y) × ISO_X,  my = (x + y) × ISO_Y.   1u is 56.6 px across, 28.3 px down (diagonal).
// The camera's focus is a map point; the renderer puts it at logical (ROOM_CX, ROOM_CY), so the
// view shows map x ∈ [fx − 640, fx + 640], y ∈ [fy − 350, fy + 370]. Logical size is always
// 1280 × 720 (letterboxed, also in forced landscape), so the view is the same on every device.
//
// Per axis: if the floor's projected box plus C.CAM.frame margins fits the view, the focus is the
// room centre (v1: every room fits on both axes, so v1 is unchanged); else the focus follows and
// is clamped so the view stays inside the frame.
//
//   BD.view.map(x, y) → [mx, my]            BD.view.unmap(mx, my) → [x, y] (ground plane)
//   BD.view.frame(grid) → {x0, x1, y0, y1 (map px, with margins), fitX, fitY, cx, cy (room centre)}
//   BD.view.fits(grid) → both axes fit (the camera never moves)
//   BD.view.focus(grid, mx, my) → [fx, fy]  the focus for a wanted focus (clamped / centred)
//   BD.view.rect(w, pad) → {x0, x1, y0, y1} map px every client is guaranteed to show this tick
//   BD.view.inView(w, x, y, pad) → bool      the circle of radius pad (u) at (x, y) is inside rect
//   BD.view.corners(w, pad) → [[x, y] × 4]   rect's screen corners in world units (TL, TR, BR, BL)
// pad > 0 asks for a margin inside the edge, pad < 0 accepts points just outside it.

const C = BD.C;
const V = BD.view = {};
const SX = C.ISO_X * Math.SQRT2, SY = C.ISO_Y * Math.SQRT2; // px per world unit, as a circle projects

V.map = (x, y) => [(x - y) * C.ISO_X, (x + y) * C.ISO_Y];
V.unmap = (mx, my) => [(mx / C.ISO_X + my / C.ISO_Y) / 2, (my / C.ISO_Y - mx / C.ISO_X) / 2];

const frames = new WeakMap();
V.frame = function (grid) {
  let f = frames.get(grid);
  if (f) return f;
  const W = grid.w, H = grid.h, m = C.CAM.frame;
  const x0 = -H * C.ISO_X - m.x, x1 = W * C.ISO_X + m.x;
  const y0 = -m.top, y1 = (W + H) * C.ISO_Y + m.bottom; // top margin covers the back walls (WALL_H)
  f = {
    x0, x1, y0, y1, w: x1 - x0, h: y1 - y0,
    fitX: x1 - x0 <= C.VIEW_W, fitY: y1 - y0 <= C.VIEW_H,
    cx: (W / 2 - H / 2) * C.ISO_X, cy: (W / 2 + H / 2) * C.ISO_Y,
  };
  frames.set(grid, f);
  return f;
};
V.fits = (grid) => { const f = V.frame(grid); return f.fitX && f.fitY; };

const clampAxis = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : v < lo ? lo : v > hi ? hi : v);
V.focus = function (grid, mx, my) {
  const f = V.frame(grid);
  const fx = f.fitX ? f.cx : clampAxis(mx, f.x0 + C.ROOM_CX, f.x1 - (C.VIEW_W - C.ROOM_CX));
  const fy = f.fitY ? f.cy : clampAxis(my, f.y0 + C.ROOM_CY, f.y1 - (C.VIEW_H - C.ROOM_CY));
  return [fx, fy];
};

// The hero-centred (clamped) view, inset by the camera slack on following axes.
V.rect = function (w, pad) {
  const g = w.grid, f = V.frame(g), h = w.hero;
  const [hx, hy] = V.map(h.x, h.y);
  const [fx, fy] = V.focus(g, hx, hy);
  const sx = (f.fitX ? 0 : C.CAM.slack.x) + (pad || 0) * SX, sy = (f.fitY ? 0 : C.CAM.slack.y) + (pad || 0) * SY;
  return { x0: fx - C.ROOM_CX + sx, x1: fx + C.VIEW_W - C.ROOM_CX - sx, y0: fy - C.ROOM_CY + sy, y1: fy + C.VIEW_H - C.ROOM_CY - sy };
};
V.inView = function (w, x, y, pad) {
  const r = V.rect(w, pad);
  const mx = (x - y) * C.ISO_X, my = (x + y) * C.ISO_Y;
  return mx >= r.x0 && mx <= r.x1 && my >= r.y0 && my <= r.y1;
};
V.corners = function (w, pad) {
  const r = V.rect(w, pad);
  return [V.unmap(r.x0, r.y0), V.unmap(r.x1, r.y0), V.unmap(r.x1, r.y1), V.unmap(r.x0, r.y1)];
};

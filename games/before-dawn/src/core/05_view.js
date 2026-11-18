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
// Per axis: if the floor's projected box plus C.CAM.fit margins fits the view, the focus is the
// room centre (v1: every room fits on both axes, so v1 is unchanged); else the focus follows and
// is clamped so the view stays inside the frame (the box plus C.CAM.frame margins).
//
//   BD.view.map(x, y) → [mx, my]            BD.view.unmap(mx, my) → [x, y] (ground plane)
//   BD.view.frame(grid) → {x0, x1, y0, y1 (map px, box + frame margins), fitX, fitY, cx, cy (room centre)}
//   BD.view.fits(grid) → both axes fit (the camera never moves)
//   BD.view.focus(grid, mx, my) → [fx, fy]  the focus for a wanted focus (clamped / centred)
//   BD.view.rect(w, pad) → {x0, x1, y0, y1} map px of the combat window C (GDD-V2 §5.6)
//   BD.view.screen(w, pad) → the same for the screen rectangle S
//   BD.view.inView(w, x, y, pad) / onScreen(w, x, y, pad) → bool   the point (pad u inside) is in C / S
//   BD.view.corners(w, pad) / screenCorners(w, pad) → [[x, y] × 4]  C's / S's corners in world units
// pad > 0 asks for a margin inside the edge, pad < 0 accepts points just outside it.
// The camera centre is simulation state (w.cam, below): every client draws exactly that focus.

const C = BD.C;
const V = BD.view = {};
const SX = C.ISO_X * Math.SQRT2, SY = C.ISO_Y * Math.SQRT2; // px per world unit, as a circle projects

V.map = (x, y) => [(x - y) * C.ISO_X, (x + y) * C.ISO_Y];
V.unmap = (mx, my) => [(mx / C.ISO_X + my / C.ISO_Y) / 2, (my / C.ISO_Y - mx / C.ISO_X) / 2];

const frames = new WeakMap();
V.frame = function (grid) {
  let f = frames.get(grid);
  if (f) return f;
  const W = grid.w, H = grid.h, m = C.CAM.frame, q = C.CAM.fit;
  const bx0 = -H * C.ISO_X, bx1 = W * C.ISO_X, by1 = (W + H) * C.ISO_Y; // the floor's projected box (by0 = 0)
  const fitX = bx1 - bx0 + 2 * q.x <= C.VIEW_W, fitY = by1 + q.top + q.bottom <= C.VIEW_H;
  const x0 = bx0 - m.x, x1 = bx1 + m.x, y0 = -m.top, y1 = by1 + m.bottom; // top margin covers the back walls
  f = {
    x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, fitX, fitY,
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

// ---- the simulation's camera (GDD-V2 §5.6) ------------------------------------------------------
// The camera centre is simulation state, w.cam = {x, y, lx, ly} (world u; lx/ly = the eased walking
// direction), so "is it on screen" is a deterministic rule: the client draws exactly this focus
// (plus screen shake) and never moves on its own. Updated once per tick after the hero moves.
//   BD.view.snapCam(w)        jump to the target (floor entry, teleports); the lead is dropped
//   BD.view.updateCam(w, dt)  ease toward hero + lead (C.V2.cam); a hero C.V2.cam.snap u (|dx| + |dy|)
//                             away from it was teleported (tests, later skills): it snaps
//   BD.view.focusOf(w) → [fx, fy] map px drawn at logical (ROOM_CX, ROOM_CY): map(cam), clamped
//                        by BD.view.focus (a fitting axis stays on the room centre, as in v1)
const clampCam = (v, side) => { const e = Math.min(C.V2.cam.edge, side / 2); return v < e ? e : v > side - e ? side - e : v; };
V.snapCam = function (w) {
  const h = w.hero, g = w.grid;
  w.cam = { x: clampCam(h.x, g.w), y: clampCam(h.y, g.h), lx: 0, ly: 0, grid: g };
  return w.cam;
};
// The camera the rules see: w.cam, or — when the hero was moved more than C.V2.cam.snap u away from
// it or the floor grid was replaced since the last tick (tests, teleports) — the snapped camera the
// next tick will have. A pure query: it never writes w.cam.
const stale = (w) => { const c = w.cam, h = w.hero; return !c || c.grid !== w.grid || Math.abs(c.x - h.x) + Math.abs(c.y - h.y) > C.V2.cam.snap; };
V.camOf = function (w) {
  if (!stale(w)) return w.cam;
  const h = w.hero, g = w.grid;
  return { x: clampCam(h.x, g.w), y: clampCam(h.y, g.h) };
};
V.updateCam = function (w, dt) {
  const h = w.hero, g = w.grid, K = C.V2.cam;
  if (stale(w)) return V.snapCam(w); // first tick, a teleport, a new grid
  const c = w.cam;
  let mx = 0, my = 0;
  if (!h.dead && h.dashT > 0) { mx = h.dashDX; my = h.dashDY; } else if (!h.dead && h.moving) { mx = h.moveX; my = h.moveY; }
  const kl = 1 - Math.exp(-dt / K.leadTau);
  c.lx += (mx - c.lx) * kl; c.ly += (my - c.ly) * kl;
  const tx = h.x + c.lx * K.lead, ty = h.y + c.ly * K.lead;
  const kf = 1 - Math.exp(-K.follow * dt);
  c.x = clampCam(c.x + (tx - c.x) * kf, g.w); c.y = clampCam(c.y + (ty - c.y) * kf, g.h);
  return c;
};
V.focusOf = function (w) {
  const p = V.camOf(w);
  const [mx, my] = V.map(p.x, p.y);
  return V.focus(w.grid, mx, my);
};

// S, the screen rectangle (GDD-V2 §5.6): the whole 1280 × 720 view around the focus, in map px.
V.screen = function (w, pad) {
  const [fx, fy] = V.focusOf(w), sx = (pad || 0) * SX, sy = (pad || 0) * SY;
  return { x0: fx - C.ROOM_CX + sx, x1: fx + C.VIEW_W - C.ROOM_CX - sx, y0: fy - C.ROOM_CY + sy, y1: fy + C.VIEW_H - C.ROOM_CY - sy };
};
// C, the combat window: S without the HUD bands (C.V2.combat) on a following axis; on an axis where
// the floor fits the view (every v1 room) it is the whole view, so v1 rooms are unchanged.
V.rect = function (w, pad) {
  const f = V.frame(w.grid), [fx, fy] = V.focusOf(w), K = C.V2.combat;
  const sx = (pad || 0) * SX, sy = (pad || 0) * SY;
  const lx0 = f.fitX ? 0 : K.x0, lx1 = f.fitX ? C.VIEW_W : K.x1, ly0 = f.fitY ? 0 : K.y0, ly1 = f.fitY ? C.VIEW_H : K.y1;
  return { x0: fx - C.ROOM_CX + lx0 + sx, x1: fx - C.ROOM_CX + lx1 - sx, y0: fy - C.ROOM_CY + ly0 + sy, y1: fy - C.ROOM_CY + ly1 - sy };
};
const inside = (r, x, y) => { const mx = (x - y) * C.ISO_X, my = (x + y) * C.ISO_Y; return mx >= r.x0 && mx <= r.x1 && my >= r.y0 && my <= r.y1; };
V.inView = (w, x, y, pad) => inside(V.rect(w, pad), x, y);
V.onScreen = (w, x, y, pad) => inside(V.screen(w, pad), x, y);
V.corners = function (w, pad) {
  const r = V.rect(w, pad);
  return [V.unmap(r.x0, r.y0), V.unmap(r.x1, r.y0), V.unmap(r.x1, r.y1), V.unmap(r.x0, r.y1)];
};
V.screenCorners = function (w, pad) {
  const r = V.screen(w, pad);
  return [V.unmap(r.x0, r.y0), V.unmap(r.x1, r.y0), V.unmap(r.x1, r.y1), V.unmap(r.x0, r.y1)];
};

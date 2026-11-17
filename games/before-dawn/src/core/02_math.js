// Geometry helpers and the generic shape tests used by strikes, telegraphs and hitboxes.
// Shapes (all in world units, angles in radians unless the field says deg):
//   circle {x, y, r}
//   fan    {x, y, dir, r, half}        half = half-angle in DEGREES
//   line   {x, y, dir, len, width}     rectangle starting at (x,y) along dir
//   ring   {x, y, r0, r1}
// shapeHits(shape, px, py, pr) tests a circle of radius pr against the shape:
// "edge" semantics, matching GDD §2.3 (edgeDist ≤ reach and angle ≤ half + asin(r/d)).

const M = BD.math = {};
M.TAU = Math.PI * 2;
M.DEG = Math.PI / 180;
M.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
M.len = (x, y) => Math.sqrt(x * x + y * y);
M.dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
M.angle = (x, y) => Math.atan2(y, x);
M.wrap = (a) => { while (a > Math.PI) a -= M.TAU; while (a < -Math.PI) a += M.TAU; return a; };
M.angDiff = (a, b) => Math.abs(M.wrap(a - b));
M.norm = (x, y) => { const l = Math.sqrt(x * x + y * y); return l > 1e-9 ? [x / l, y / l] : [0, 0]; };
M.round = (v, d) => { const p = Math.pow(10, d || 0); return Math.round(v * p) / p; };

M.shapeHits = function (s, px, py, pr) {
  pr = pr || 0;
  const dx = px - s.x, dy = py - s.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  switch (s.shape || s.kind) {
    case 'circle':
      return d <= s.r + pr;
    case 'ring':
      return d <= s.r1 + pr && d >= Math.max(0, s.r0 - pr);
    case 'fan': {
      if (d - pr > s.r) return false;
      if (d < 1e-6) return true;
      const extra = Math.asin(Math.min(1, pr / d));
      return M.angDiff(Math.atan2(dy, dx), s.dir) <= s.half * M.DEG + extra;
    }
    case 'line': {
      const cx = Math.cos(s.dir), cy = Math.sin(s.dir);
      const t = dx * cx + dy * cy;
      const p = -dx * cy + dy * cx;
      return t >= -pr && t <= s.len + pr && Math.abs(p) <= s.width / 2 + pr;
    }
    default:
      return BD.fail(`unknown shape '${s.shape || s.kind}'`);
  }
};

// Outline polygon of a shape (world coords) — used by the renderer and the bot.
M.shapePoly = function (s, scale) {
  const k = scale === undefined ? 1 : scale;
  const pts = [];
  switch (s.shape || s.kind) {
    case 'circle': {
      for (let i = 0; i < 28; i++) { const a = (i / 28) * M.TAU; pts.push([s.x + Math.cos(a) * s.r * k, s.y + Math.sin(a) * s.r * k]); }
      return [pts];
    }
    case 'fan': {
      const h = s.half * M.DEG, n = Math.max(6, Math.ceil(s.half / 6));
      pts.push([s.x, s.y]);
      for (let i = 0; i <= n; i++) { const a = s.dir - h + (2 * h * i) / n; pts.push([s.x + Math.cos(a) * s.r * k, s.y + Math.sin(a) * s.r * k]); }
      return [pts];
    }
    case 'line': {
      const cx = Math.cos(s.dir), cy = Math.sin(s.dir), w = s.width / 2, L = s.len * k;
      return [[[s.x - cy * w, s.y + cx * w], [s.x + cx * L - cy * w, s.y + cy * L + cx * w], [s.x + cx * L + cy * w, s.y + cy * L - cx * w], [s.x + cy * w, s.y - cx * w]]];
    }
    case 'ring': {
      const outer = [], inner = [], r1 = s.r0 + (s.r1 - s.r0) * k;
      for (let i = 0; i < 36; i++) { const a = (i / 36) * M.TAU; outer.push([s.x + Math.cos(a) * r1, s.y + Math.sin(a) * r1]); inner.push([s.x + Math.cos(-a) * s.r0, s.y + Math.sin(-a) * s.r0]); }
      return [outer, inner];
    }
    default:
      return BD.fail(`unknown shape '${s.shape || s.kind}'`);
  }
};

// Follow camera (browser only). Places the world under the 1280 × 720 logical view by setting
// view.rox / view.roy each frame, so view.proj(), view.toWorld() and everything drawn through
// them (renderer, UI, card and enemy drawers, particles, baked decals' blit, telegraph clip)
// follow it. All in logical px, so it is the same at every resolution and in forced landscape
// (the quarter turn is applied after, in view.begin / view.toLogical).
//
// Per axis (BD.view.frame): a floor that fits stands still with the room centred — every v1 room,
// pixel for pixel as before. Otherwise the focus eases toward the hero plus a look-ahead along
// the way he walks (dash: the dash direction), lags or leads him by at most C.CAM.slack px (the
// margin the simulation's view rectangle keeps, BD.view.rect), and is clamped to the floor's
// frame. Wall-clock dt; a new floor or world snaps without easing.
//
//   BD.client.camera.update(ui, dt)   called by drawWorld before anything is drawn
//   BD.client.camera.focus → [fx, fy] map px of the screen point (ROOM_CX, ROOM_CY)
//   BD.client.camera.snap()           jump to the hero on the next update (teleports, cutscenes)

const C = BD.C;
const CAM = BD.client.camera = { focus: [0, 0], cam: null, look: [0, 0], grid: null, moving: false };

const ease = (dt, tau) => (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
const clamp = (v, a) => (v < -a ? -a : v > a ? a : v);

CAM.snap = function () { CAM.cam = null; };

CAM.update = function (ui, dt) {
  const w = ui.app.world, v = ui.view;
  if (!w || !w.grid) return;
  const g = w.grid, f = BD.view.frame(g), h = w.hero, K = C.CAM;
  const [hx, hy] = BD.view.map(h.x, h.y);
  if (g !== CAM.grid) { CAM.grid = g; CAM.cam = null; CAM.look = [0, 0]; }
  let fx, fy;
  if (f.fitX && f.fitY) {
    [fx, fy] = [f.cx, f.cy];
    CAM.moving = false;
  } else {
    // look-ahead: toward the way he walks (or dashes), eased so turning does not jerk the view
    let dx = 0, dy = 0;
    if (h.dashT > 0) { dx = h.dashDX; dy = h.dashDY; } else if (h.moving && !h.dead) { dx = h.moveX; dy = h.moveY; }
    const [lx, ly] = BD.view.map(dx * K.lookahead, dy * K.lookahead);
    const kl = ease(dt, K.lookTime);
    CAM.look[0] += (lx - CAM.look[0]) * kl; CAM.look[1] += (ly - CAM.look[1]) * kl;
    if (!CAM.cam) CAM.cam = [hx, hy];
    const kf = ease(dt, K.follow);
    CAM.cam[0] += (hx + CAM.look[0] - CAM.cam[0]) * kf;
    CAM.cam[1] += (hy + CAM.look[1] - CAM.cam[1]) * kf;
    // never further from the hero than the slack the simulation's view rectangle allows for
    CAM.cam[0] = hx + clamp(CAM.cam[0] - hx, K.slack.x);
    CAM.cam[1] = hy + clamp(CAM.cam[1] - hy, K.slack.y);
    [fx, fy] = BD.view.focus(g, CAM.cam[0], CAM.cam[1]);
    // whole device pixels while moving: chunk edges and sprites stay crisp, no shimmer
    const S = v.dpr * v.scale || 1;
    fx = Math.round(fx * S) / S; fy = Math.round(fy * S) / S;
    CAM.moving = true;
  }
  CAM.focus = [fx, fy];
  v.rox = C.ROOM_CX - fx; v.roy = C.ROOM_CY - fy;
};

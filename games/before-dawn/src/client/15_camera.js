// Camera (browser only). Places the world under the 1280 × 720 logical view by setting
// view.rox / view.roy each frame, so view.proj(), view.toWorld() and everything drawn through
// them (renderer, UI, card and enemy drawers, particles, baked decals' blit, telegraph clip)
// follow it. All in logical px, so it is the same at every resolution and in forced landscape
// (the quarter turn is applied after, in view.begin / view.toLogical).
//
// GDD-V2 §5.6: the camera centre is simulation state (w.cam, src/core/05_view.js), so what the
// rules call "on screen" is exactly what is drawn. This file only draws BD.view.focusOf(w): a
// floor that fits stands still with the room centred (every v1 room, pixel for pixel as before);
// a bigger floor shows the simulation's eased, look-ahead camera. Screen shake is ui.camera, added
// by the renderer on top. Whole device pixels while it moves, so chunks and sprites stay crisp.
//
//   BD.client.camera.update(ui, dt)   called by drawWorld before anything is drawn
//   BD.client.camera.focus → [fx, fy] map px of the screen point (ROOM_CX, ROOM_CY)
//   BD.client.camera.snap()           kept for callers; the simulation snaps w.cam itself

const C = BD.C;
const CAM = BD.client.camera = { focus: [0, 0], cam: null, look: [0, 0], grid: null, moving: false };

CAM.snap = function () { CAM.cam = null; };

CAM.update = function (ui, dt) {
  const w = ui.app.world, v = ui.view;
  if (!w || !w.grid) return;
  const g = w.grid, f = BD.view.frame(g);
  if (g !== CAM.grid) { CAM.grid = g; CAM.cam = null; }
  let [fx, fy] = BD.view.focusOf(w);
  CAM.moving = !(f.fitX && f.fitY);
  if (CAM.moving) { const S = v.dpr * v.scale || 1; fx = Math.round(fx * S) / S; fy = Math.round(fy * S) / S; }
  CAM.focus = [fx, fy];
  v.rox = C.ROOM_CX - fx; v.roy = C.ROOM_CY - fy;
};

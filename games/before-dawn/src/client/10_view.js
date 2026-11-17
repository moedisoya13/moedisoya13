// Canvas, letterboxing and the isometric projection of GDD §0:
//   sx = ox + (wx − wy) × 40,  sy = oy + (wx + wy) × 20
// The room's centre (W/2, H/2) is placed at logical (640, 350). Logical size 1280 × 720.
//
// Portrait windows: `portrait` (→ app.rotate, the rotate prompt) is true while the window is taller
// than wide, unless the player chose forced landscape on the prompt (setForced):
//   'turn' — the 1280 × 720 picture is drawn a quarter turn round to fill the portrait window and
//            the player turns the device by hand (rotation lock, viewers and in-app browsers
//            that never rotate). rot = +1 draws it clockwise (home bar on the right), −1 the
//            other way when the screen reports itself upside down. Pointer positions map back
//            through the same turn (toLogical), so drags, the joystick and buttons follow the picture.
//   'fit'  — upright and letterboxed (a tall desktop window).
// Either ends as soon as the window is really landscape. The size is re-read every frame in
// begin() (and on orientationchange / visualViewport resize), since some browsers rotate without
// a resize event or report the new size late. onTurn(fn) tells the UI the moment `portrait`
// changes, so it can hold the world before the next tick (the tap-to-continue state).

const C = BD.C;
BD.client = BD.client || {};

BD.client.createView = function (canvas) {
  const v = {
    canvas, g: canvas.getContext('2d'), dpr: 1, scale: 1, offX: 0, offY: 0, cw: 0, ch: 0,
    rox: C.ROOM_CX, roy: C.ROOM_CY, portrait: false, tall: false, forced: null, rot: 0,
  };
  // which way to turn the picture: clockwise unless the portrait screen is upside down
  const turnDir = function () {
    let a = 0;
    try { a = window.screen && window.screen.orientation ? window.screen.orientation.angle : Number(window.orientation) || 0; } catch (err) { a = 0; }
    return Math.abs(a) === 180 ? -1 : 1;
  };
  v.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = window.innerWidth, ch = window.innerHeight;
    v.dpr = dpr; v.cw = cw; v.ch = ch;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    v.tall = ch > cw;
    if (!v.tall) v.forced = null;
    v.rot = v.forced === 'turn' ? turnDir() : 0;
    const fw = v.rot ? ch : cw, fh = v.rot ? cw : ch; // the frame the picture is fitted into
    v.scale = Math.min(fw / C.VIEW_W, fh / C.VIEW_H);
    v.offX = (fw - C.VIEW_W * v.scale) / 2; v.offY = (fh - C.VIEW_H * v.scale) / 2;
    const was = v.portrait;
    v.portrait = v.tall && !v.forced;
    if (was !== v.portrait) for (const fn of turnFns) fn(v.portrait);
  };
  // fn(portrait) whenever `portrait` changes, at once (before the next tick can run)
  const turnFns = [];
  v.onTurn = (fn) => { turnFns.push(fn); };
  // forced landscape on a portrait window: 'turn' | 'fit' | null (see the top of this file)
  v.setForced = function (kind) { v.forced = kind || null; v.resize(); };
  // logical transform for drawing
  v.begin = function () {
    if (window.innerWidth !== v.cw || window.innerHeight !== v.ch || Math.min(2, window.devicePixelRatio || 1) !== v.dpr) v.resize();
    const g = v.g, s = v.dpr * v.scale, d = v.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#050508';
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (v.rot === 1) g.setTransform(0, s, -s, 0, d * (v.cw - v.offY), d * v.offX);
    else if (v.rot === -1) g.setTransform(0, -s, s, 0, d * v.offY, d * (v.ch - v.offX));
    else g.setTransform(s, 0, 0, s, d * v.offX, d * v.offY);
  };
  v.clipLogical = function () {
    v.g.beginPath(); v.g.rect(0, 0, C.VIEW_W, C.VIEW_H); v.g.clip();
  };
  // client px → logical, and back
  v.toLogical = function (cx, cy) {
    if (v.rot === 1) return [(cy - v.offX) / v.scale, (v.cw - cx - v.offY) / v.scale];
    if (v.rot === -1) return [(v.ch - cy - v.offX) / v.scale, (cx - v.offY) / v.scale];
    return [(cx - v.offX) / v.scale, (cy - v.offY) / v.scale];
  };
  v.toClient = function (lx, ly) {
    const fx = v.offX + lx * v.scale, fy = v.offY + ly * v.scale;
    if (v.rot === 1) return [v.cw - fy, fx];
    if (v.rot === -1) return [fy, v.ch - fx];
    return [fx, fy];
  };
  v.setRoom = function (W, H) {
    v.rox = C.ROOM_CX - (W / 2 - H / 2) * C.ISO_X;
    v.roy = C.ROOM_CY - (W / 2 + H / 2) * C.ISO_Y;
  };
  // world → logical screen (z = height in px)
  v.proj = (wx, wy, z) => [v.rox + (wx - wy) * C.ISO_X, v.roy + (wx + wy) * C.ISO_Y - (z || 0)];
  // screen-space direction → normalised world direction
  v.screenDirToWorld = function (sx, sy) {
    const wx = sx / (2 * C.ISO_X) + sy / (2 * C.ISO_Y), wy = -sx / (2 * C.ISO_X) + sy / (2 * C.ISO_Y);
    return BD.math.norm(wx, wy);
  };
  // world direction → screen direction (for sprite facing)
  v.worldDirToScreen = (dx, dy) => [(dx - dy) * C.ISO_X, (dx + dy) * C.ISO_Y];
  // a rotation can come without a resize event, or before the new size is readable
  const recheck = () => { v.resize(); setTimeout(() => v.resize(), 250); };
  window.addEventListener('orientationchange', recheck);
  try {
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => v.resize());
    if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) window.screen.orientation.addEventListener('change', recheck);
  } catch (err) { /* older browsers: the per-frame check in begin() still catches it */ }
  return v;
};

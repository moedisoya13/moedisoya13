// Canvas, letterboxing and the isometric projection of GDD §0:
//   sx = ox + (wx − wy) × 40,  sy = oy + (wx + wy) × 20
// The room's centre (W/2, H/2) is placed at logical (640, 350). Logical size 1280 × 720.

const C = BD.C;
BD.client = BD.client || {};

BD.client.createView = function (canvas) {
  const v = {
    canvas, g: canvas.getContext('2d'), dpr: 1, scale: 1, offX: 0, offY: 0, cw: 0, ch: 0,
    rox: C.ROOM_CX, roy: C.ROOM_CY, portrait: false,
  };
  v.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = window.innerWidth, ch = window.innerHeight;
    v.dpr = dpr; v.cw = cw; v.ch = ch;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    v.scale = Math.min(cw / C.VIEW_W, ch / C.VIEW_H);
    v.offX = (cw - C.VIEW_W * v.scale) / 2; v.offY = (ch - C.VIEW_H * v.scale) / 2;
    v.portrait = ch > cw;
  };
  // logical transform for drawing
  v.begin = function () {
    const g = v.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#050508';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.offX, v.dpr * v.offY);
  };
  v.clipLogical = function () {
    v.g.beginPath(); v.g.rect(0, 0, C.VIEW_W, C.VIEW_H); v.g.clip();
  };
  // client px → logical
  v.toLogical = (cx, cy) => [(cx - v.offX) / v.scale, (cy - v.offY) / v.scale];
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
  return v;
};

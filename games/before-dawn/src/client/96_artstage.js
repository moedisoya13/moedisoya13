// Visual-only staging for the stage art (browser only; never used by the game): a 48 × 48 floor
// laid out by GDD-V2 §5.2/§5.3 — nine 16-u zones with their fills, office boundary walls, every
// site in its states — so the look of zone fills, props and sites can be seen and tuned before the
// generator emits them; and a prop sheet with every catalogue id.
//
//   BD.client.artStage.stage(w, {layout, theme, enemies, fills})  replaces floor 2 with the showcase
//       layout: 'plaza'|'office'|'atrium'|'hall'|'ruin' — its §5.3 zone fills (default: 'showcase'
//       = all eight fills on one floor, looked at as an office); theme: a floor type colour
//   BD.client.artStage.sheet({theme}) → canvas with every prop, site, wall item, growth, labelled
//   URL: ?artstage=office&theme=magic stages it when a run starts; ?propsheet=1 shows the sheet
// The floor carries floor.stage = {layout, zones} as the generator would (docs/ARCHITECTURE.md §10);
// the props themselves are inferred from the SOLID cells, the path a generator that emits only
// cells and zone fills gets.

const C = BD.C;
const R = BD.client.render;
const KIT = R.kit;
const ST = R.stage;
const AS = BD.client.artStage = {};
const Z = 16;
const LAYOUT_FILLS = { // GDD-V2 §5.3: centre zone, the others' choices
  plaza: ['pillars', ['open', 'pillars', 'planters', 'ring']],
  office: ['cubicles', ['cubicles', 'aisle', 'planters', 'open']],
  atrium: ['island', ['pillars', 'planters', 'open']],
  hall: ['chamber', ['aisle', 'pillars']],
  ruin: ['ring', ['planters', 'cubicles', 'ring', 'pillars']],
};
const SHOWCASE = [['open', 'pillars', 'planters'], ['aisle', 'chamber', 'cubicles'], ['ring', 'island', 'open']]; // [zy][zx]

// ---- zone fills on a char grid ('.' floor, '#' solid, ' ' void) -------------------------------------
function fillZone(cells, W, zx, zy, fill, rng) {
  const x0 = zx * Z, y0 = zy * Z, set = (x, y, c) => { cells[y * W + x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c || '#'); };
  const cx = x0 + 8, cy = y0 + 8;
  if (fill === 'open') { const n = rng.int(1, 2); for (let i = 0; i < n; i++) set(x0 + 4 + rng.int(0, 1) * 7, y0 + 4 + i * 7, '#'); }
  else if (fill === 'pillars') { for (const dx of [-4, 4]) for (const dy of [-4, 4]) rect(cx + dx - 1, cy + dy - 1, 2, 2); }
  else if (fill === 'planters') { for (const [x, y, h] of [[3, 3, true], [9, 3, false], [3, 8, false], [7, 9, true], [11, 10, false], [7, 5, true]]) rect(x0 + x, y0 + y, h ? 3 : 1, h ? 1 : 3); }
  else if (fill === 'aisle') { const along = rng.next() < 0.5; for (const k of [4, 8, 12]) if (along) rect(x0 + 5, y0 + k - 1, 5, 1); else rect(x0 + k - 1, y0 + 5, 1, 5); }
  else if (fill === 'cubicles') { const skip = [[1, 1], [2, 0]]; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (!skip.some((s) => s[0] === i && s[1] === j)) rect(x0 + 3 + i * 4, y0 + 3 + j * 4, 2, 2); }
  else if (fill === 'ring') rect(x0 + 6, y0 + 6, 4, 4);
  else if (fill === 'chamber') {
    for (let i = 0; i < 12; i++) { const d = i >= 5 && i <= 7; if (!d) { set(x0 + 2 + i, y0 + 2, '#'); set(x0 + 2 + i, y0 + 13, '#'); set(x0 + 2, y0 + 2 + i, '#'); set(x0 + 13, y0 + 2 + i, '#'); } }
  } else if (fill === 'island') {
    rect(x0 + 2, y0 + 2, 12, 12, ' ');
    rect(x0 + 5, y0 + 5, 6, 6, '.');
    rect(x0 + 6, y0 + 2, 3, 3, '.'); rect(x0 + 6, y0 + 11, 3, 3, '.'); rect(x0 + 2, y0 + 6, 3, 3, '.'); rect(x0 + 11, y0 + 6, 3, 3, '.');
  }
}

AS.build = function (o) {
  o = o || {};
  const W = 48, H = 48, rng = KIT.rng('artstage:' + (o.layout || 'showcase') + ':' + (o.seed || 1));
  const cells = new Array(W * H).fill('.');
  const zones = [];
  const lay = LAYOUT_FILLS[o.layout];
  for (let zy = 0; zy < 3; zy++) for (let zx = 0; zx < 3; zx++) {
    let fill;
    if (!lay) fill = SHOWCASE[zy][zx];
    else if ((zx === 0 && zy === 0) || (zx === 2 && zy === 2)) fill = 'open';
    else if (zx === 1 && zy === 1) fill = lay[0];
    else fill = lay[1][Math.floor(rng.next() * lay[1].length)];
    if (o.fills && o.fills[zy * 3 + zx]) fill = o.fills[zy * 3 + zx];
    fillZone(cells, W, zx, zy, fill, rng);
    zones.push({ zx, zy, fill });
  }
  // office: boundary walls between zones, two 3-wide doors per 16-cell boundary
  const look = lay ? o.layout : (o.look || 'office');
  if (look === 'office') {
    for (const b of [Z, 2 * Z]) for (let i = 0; i < W; i++) {
      const k = i % Z, door = (k >= 3 && k <= 5) || (k >= 10 && k <= 12);
      if (door) continue;
      if (cells[i * W + b] === '.') cells[i * W + b] = '#';
      if (cells[b * W + i] === '.') cells[b * W + i] = '#';
    }
  }
  return { W, H, cells: cells.join(''), zones, layout: look };
};

// the sites in their states, on free cells near the zone centres
const SITES = [
  ['seal', 'intact', 0, 2], ['seal', 'cracked', 2, 0], ['seal', 'broken', 2, 1],
  ['nest', 'alive', 0, 1], ['nest', 'dead', 1, 0], ['brazier', 'lit', 1, 1], ['brazier', 'cold', 1, 2],
  ['spring', 'full', 0, 0], ['spring', 'dry', 2, 2], ['chest', 'closed', 1, 2], ['chest', 'open', 0, 2], ['rift', 'available', 2, 1],
];
function freeNear(grid, x, y) {
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const cx = Math.floor(x + dx), cy = Math.floor(y + dy);
    let ok = true;
    for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1 && ok; i++) if (!grid.walkable(cx + i, cy + j)) ok = false;
    if (ok) return [cx + 0.5, cy + 0.5];
  }
  return [x, y];
}

AS.stage = function (w, o) {
  o = o || {};
  const n = 2, old = w.run.floors[n];
  const b = AS.build(o);
  const f = BD.gen.floor(w.seed, w.tier, n, old.domType, old.nextDomType, { size: [b.W, b.H], offscreen: { indicators: true, minimap: true } });
  const grid = BD.Grid.fromString(b.W, b.H, b.cells);
  const layout = BD.gen.place(grid, BD.sub(w.seed, 'gen', 'artstage'), 0);
  if (typeof layout === 'string') throw new Error('[BD] artstage: ' + layout);
  f.cells = b.cells; f.w = b.W; f.h = b.H; f.layout = layout; f.pattern = 'artstage';
  f.spawns = Object.assign({}, f.spawns, { w1: [] }); // no wave: the placed crowd below is all
  f.stage = { layout: b.layout, zones: b.zones };
  if (o.theme) f.domType = o.theme;
  w.run.floors[n] = f;
  BD.flow.enterFloor(w, n);
  w.enemies = []; w.rifts = []; w.queue = []; w.wave.n = 3; w.freezeT = 0;
  w.sites = SITES.map(([id, state, zx, zy], i) => { const [x, y] = freeNear(w.grid, zx * Z + 8 + (i % 2 ? 2.5 : -2.5), zy * Z + 8 + (i % 3) - 1); return { id, state, x, y }; });
  const kinds = BD.enemies.all().filter((d) => d.type !== 'boss').map((d) => d.id), rng = BD.sub(w.seed, 'stage', 'art');
  let free = [];
  for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) if (w.grid.walkable(x, y) && Math.hypot(x + 0.5 - w.hero.x, y + 0.5 - w.hero.y) >= 6) free.push([x + 0.5, y + 0.5]);
  free = rng.shuffle(free);
  for (let i = 0; i < (o.enemies || 0) && i < free.length; i++) BD.W.makeEnemy(w, kinds[i % kinds.length], free[i][0], free[i][1], { via: 'placed' });
  R.invalidate();
  BD.client.camera.snap();
  return { w: b.W, h: b.H, layout: b.layout, zones: b.zones.map((z) => z.fill), props: ST.of(w).props.length };
};

// ---- the prop sheet ---------------------------------------------------------------------------------
const CELL = { w: 300, h: 250 };
function fitOf(d) {
  if (d.layer === 'decor') return d.id === 'wall_desk' ? [2, 0.56] : [1, 0.56];
  for (const s of [[1, 1], [2, 2], [3, 1], [5, 1], [4, 4], [3, 3], [2, 1], [6, 1]]) if (d.fit(s[0], s[1])) return s;
  return [1, 1];
}
function label(g, x, y, s1, s2) {
  g.font = BD.ui.font ? BD.ui.font(15, 800) : '800 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineWidth = 4; g.strokeStyle = BD.ui.INK; g.strokeText(s1, x, y); g.fillStyle = '#f3ead8'; g.fillText(s1, x, y);
  if (s2) { g.font = BD.ui.font ? BD.ui.font(12, 600) : '600 12px sans-serif'; g.strokeText(s2, x, y + 16); g.fillStyle = '#c9c2b2'; g.fillText(s2, x, y + 16); }
}
function tile(g, P, x0, y0, w, h, col) {
  KIT.fill(g, [P(x0, y0), P(x0 + w, y0), P(x0 + w, y0 + h), P(x0, y0 + h)], col);
  KIT.poly(g, [P(x0, y0), P(x0 + w, y0), P(x0 + w, y0 + h), P(x0, y0 + h)]); KIT.ink(g, 1.5);
}
AS.sheet = function (o) {
  o = o || {};
  const theme = o.theme || 'beast', layout = o.layout || 'office', col = C.FLOOR_COLORS[theme] || '#888888';
  const props = R.props.all(), sites = [];
  for (const id of R.sites.ids()) for (const s of R.sites.get(id).states) sites.push([id, s]);
  const walls = ['clock', 'exit', 'board', 'whiteboard', 'tv', 'vent', 'extinguisher', 'poster'];
  const cols = 6, entries = props.length + sites.length + 4 + 3;
  const rows = Math.ceil(entries / cols);
  const cv = document.createElement('canvas'), s = o.scale || 1;
  cv.width = cols * CELL.w * s; cv.height = (rows * CELL.h + 60) * s;
  const g = cv.getContext('2d'); g.scale(s, s);
  g.fillStyle = '#16141c'; g.fillRect(0, 0, cols * CELL.w, rows * CELL.h + 60);
  label(g, cols * CELL.w / 2, 36, '여명 전야 — 무대 소품 시트 (' + theme + ' / ' + layout + ')', 'prop ids · footprint w×h (cells) · sites by state · wall items · growths');
  const keep = KIT.s; KIT.s = s;
  let i = 0;
  const slot = () => { const cx = (i % cols) * CELL.w + CELL.w / 2, cy = Math.floor(i / cols) * CELL.h + 60; i++; return [cx, cy]; };
  for (const d of props) {
    const [cx, cy] = slot(), [fw, fh] = fitOf(d), inst = { id: d.id, x: 0, y: 0, w: fw, h: fh, v: 1 };
    const oy = cy + 150 - (fw + fh) * 20 * 0.5 - 10;
    const P = KIT.proj(cx - (fw - fh) * 20, oy);
    tile(g, P, -0.4, -0.4, fw + 0.8, fh + 0.8, col);
    R.props.shadow(g, P, inst);
    const sp = R.props.whole(inst, theme, layout), p = P(0, 0); KIT.blit(g, sp, p[0], p[1]);
    label(g, cx, cy + CELL.h - 34, d.id + '  ' + (Number.isInteger(fw) ? fw + '×' + fh : 'decor'), d.name + (d.tall ? ' · 높음' : ''));
  }
  for (const [id, st] of sites) {
    const [cx, cy] = slot(), P = KIT.proj(cx, cy + 140);
    tile(g, P, -1, -1, 2, 2, col);
    const sp = KIT.sprite('S:' + id + '|' + st + '|' + theme, -70, -R.sites.get(id).height - 20, 70, 46, (gg) => R.sites.get(id).draw(gg, KIT.proj(0, 0), st, { theme }));
    const p = P(0, 0); KIT.blit(g, sp, p[0], p[1]);
    if (R.sites.get(id).anim) R.sites.get(id).anim(g, p[0], p[1], st, 0.4);
    label(g, cx, cy + CELL.h - 34, 'site ' + id, (st || '') + ' · ' + R.sites.get(id).name);
  }
  // wall items, two per slot, on a short wall
  for (let k = 0; k < walls.length; k += 2) {
    const [cx, cy] = slot(), P = KIT.proj(cx - 40, cy + 120), rng = KIT.rng('sheetwall' + k);
    tile(g, P, 0, 0, 3, 1.4, col);
    for (let x = 0; x < 3; x++) R.paint.wallSeg(g, P, x, 0, x + 1, 0, 'y0', 'solid', rng, x === 0, x === 2);
    R.paint.wallItem(g, P, 'y0', 0.3, walls[k], 2); R.paint.wallItem(g, P, 'y0', 1.6, walls[k + 1], 5);
    label(g, cx, cy + CELL.h - 34, 'wall: ' + walls[k] + ', ' + walls[k + 1], '벽 장식 (side y0)');
  }
  { // the elevator and a glass bay
    const [cx, cy] = slot(), P = KIT.proj(cx - 70, cy + 120), rng = KIT.rng('sheetelev');
    tile(g, P, 0, 0, 4, 1.2, col);
    for (let x = 0; x < 4; x++) R.paint.wallSeg(g, P, x, 0, x + 1, 0, 'y0', 'solid', rng, x === 0, x === 3);
    R.paint.elevator(g, P, 'y0', 0);
    label(g, cx, cy + CELL.h - 34, 'wall: elevator (4 u bay)', '부서진 엘리베이터');
  }
  { const [cx, cy] = slot(), P = KIT.proj(cx - 60, cy + 120), rng = KIT.rng('sheetglass'); tile(g, P, 0, 0, 3, 1.2, col); for (let x = 0; x < 3; x++) R.paint.wallSeg(g, P, x, 0, x + 1, 0, 'y0', 'glass', rng, x === 0, x === 2); label(g, cx, cy + CELL.h - 34, 'wall: glass bay', '유리 커튼월 (하늘이 비친다)'); }
  for (const kind of ['spike', 'crystal', 'mix']) {
    const [cx, cy] = slot(), P = KIT.proj(cx, cy + 150);
    tile(g, P, -1, -1, 2, 2, col);
    const p = P(0, 0); ST.drawGrowth(g, p[0], p[1], { n: 5, size: 1.3, kind, seed: 1234 + kind.length }, theme);
    label(g, cx, cy + CELL.h - 34, 'growth: ' + kind, '마왕성 침식');
  }
  KIT.s = keep;
  return cv;
};

// ---- URL switches -------------------------------------------------------------------------------------
let params = null;
try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
const want = params && params.get('artstage');
const sheetOn = params && params.get('propsheet');
let staged = false, sheetCv = null;
BD.ui.effects.register({
  id: 'artstage',
  reset() { staged = false; },
  update(dt, ui) {
    if (!want || staged || ui.app.mode !== 'play' || !ui.app.world) return;
    staged = true;
    AS.stage(ui.app.world, { layout: want === '1' ? 'showcase' : want, theme: params.get('theme') || undefined, enemies: Number(params.get('enemies')) || 0 });
  },
  draw(g, ui, layer) {
    if (!sheetOn || layer !== 'screen') return;
    if (!sheetCv) sheetCv = AS.sheet({ theme: params.get('theme') || 'beast' });
    g.fillStyle = '#16141c'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    const k = Math.min(C.VIEW_W / sheetCv.width, C.VIEW_H / sheetCv.height);
    g.drawImage(sheetCv, 0, 0, sheetCv.width * k, sheetCv.height * k);
  },
});

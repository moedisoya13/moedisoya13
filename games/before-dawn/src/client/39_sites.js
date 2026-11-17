// Sites (browser only): the places a floor asks you to go — GDD-V2 §5.4/§5.5/§5.9 — drawn from
// the facet kit, plus the depth-sorted stage pass of drawWorld (prop slices, front growths, sites).
//
//   R.sites.register({id, name, states: [...], height, draw(g, P, state, ctx), anim?(g, x, y, state, t)})
//   R.sites.draw(g, v, id, x, y, state, t, theme)   cached body at world (x, y) + its animated part
//   R.sites.door(g, v, w, t)                        the stairs door on its back wall (w.stairs)
//   R.sites.spawnMarks(g, v, w, t)                  the floor's spawn rifts (layout.rifts)
//   R.stage.pushItems(items, g, v, w, t, actorOn)   prop slices, front growths and sites → items
// World objects drawn as sites: w.altar ('altar', its state), w.trial ('rift', available|active),
// and any w.sites / w.floor.sites entries {id | kind, x, y, state} the gameplay side adds (ids in
// docs/ARCHITECTURE.md §10). Draw in local coordinates: the site's centre is world (0, 0) of P.

const C = BD.C;
const U = BD.ui;
const R = BD.client.render;
const KIT = R.kit;
const ST = R.stage;
const SI = R.sites = { defs: new Map() };
SI.register = function (d) {
  if (SI.defs.has(d.id)) throw new Error('[BD] duplicate site id ' + d.id);
  SI.defs.set(d.id, Object.assign({ states: [null], height: 80, name: d.id }, d));
};
SI.ids = () => [...SI.defs.keys()].sort();
SI.get = (id) => SI.defs.get(id) || null;
const pal = KIT.pal;
const STONE = pal('#8c8698'), STONE_D = pal('#5d566c'), GOLD = { top: '#ffd96a', left: '#e0b23e', right: '#7a5a1c' };

// a flat glow without gradients: stacked translucent discs (screen space)
function glow(g, x, y, r, color, a) {
  for (const [k, al] of [[1, 0.18], [0.66, 0.26], [0.36, 0.5]]) { g.beginPath(); g.ellipse(x, y, r * k, r * k * 0.62, 0, 0, 6.2832); g.fillStyle = KIT.rgba(color, al * (a === undefined ? 1 : a)); g.fill(); }
}
SI.glow = glow;
function ringPts(P, r, z, n) { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832; pts.push(P(Math.cos(a) * r, Math.sin(a) * r, z)); } return pts; }

// ---- the sites ---------------------------------------------------------------------------------------
// altar (card swap / prayer): a stepped stone table with an open book of light; lit when it offers
SI.register({
  id: 'altar', name: '제단', states: ['off', 'lit', 'used'], height: 70,
  draw(g, P, st) {
    const lit = st === 'lit' || st === 'open';
    KIT.bevelBox(g, P, -0.5, -0.5, 1, 1, 0, 10, STONE_D, 0.06);
    KIT.box(g, P, -0.34, -0.34, 0.68, 0.68, 10, 30, lit ? pal('#cfc6b4') : STONE, { taper: 0.04 });
    KIT.bevelBox(g, P, -0.42, -0.42, 0.84, 0.84, 30, 38, lit ? pal('#e6dfcc') : STONE, 0.06);
    // the book: two pages
    const a = P(-0.22, 0.05, 40), b = P(0.02, 0.18, 44), c = P(0.22, -0.05, 40), d = P(-0.02, -0.18, 44), m0 = P(0, 0, 41), m1 = P(-0.04, 0, 47);
    KIT.fill(g, [a, b, m1, m0], lit ? '#fff6dc' : '#bdb6a6'); KIT.fill(g, [m0, m1, d, c], lit ? '#f1e4bd' : '#a49d8e');
    KIT.poly(g, [a, b, m1, d, c, m0]); KIT.ink(g, 1.4);
    const f = P(0, 0.42, 20); KIT.fill(g, [[f[0], f[1] - 7], [f[0] + 5, f[1]], [f[0], f[1] + 7], [f[0] - 5, f[1]]], lit ? '#ffd96a' : '#6c6964'); KIT.poly(g, [[f[0], f[1] - 7], [f[0] + 5, f[1]], [f[0], f[1] + 7], [f[0] - 5, f[1]]]); KIT.ink(g, 1.2);
  },
  anim(g, x, y, st, t) {
    if (st !== 'lit' && st !== 'open') return;
    const yy = y - 54 - Math.sin(t * 3) * 3;
    glow(g, x, yy, 26, '#ffe6a0', 0.9);
    for (let i = 0; i < 4; i++) { const a = t * 0.8 + i * 1.57; KIT.line(g, [[x + Math.cos(a) * 8, yy + Math.sin(a) * 4], [x + Math.cos(a) * 20, yy + Math.sin(a) * 10]], 1.4, 'rgba(255,240,200,0.7)'); }
  },
});
// spring (HP): octagonal basin, water, a spout; dry once used
SI.register({
  id: 'spring', name: '샘', states: ['full', 'dry'], height: 64,
  draw(g, P, st) {
    const dry = st === 'dry' || st === 'used';
    KIT.prismN(g, P, 0, 0, 0.62, 8, 0, 18, STONE, { lw: 2.2 });
    const inner = ringPts(P, 0.5, 17, 16);
    KIT.fill(g, inner, dry ? '#3b3530' : '#3aa0d8');
    if (!dry) { KIT.fill(g, ringPts(P, 0.34, 17, 16), '#79c8ee'); KIT.poly(g, ringPts(P, 0.22, 17, 16)); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke(); }
    else { for (let i = 0; i < 3; i++) { const a = i * 2.1; KIT.line(g, [P(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 17), P(Math.cos(a + 0.4) * 0.3, Math.sin(a + 0.4) * 0.3, 17), P(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 17)], 1.1); } }
    KIT.poly(g, inner); KIT.ink(g, 1.4);
    KIT.prismN(g, P, -0.18, -0.18, 0.14, 6, 17, 48, STONE_D, { lw: 1.6 });
    const s = P(-0.18, -0.18, 48); KIT.fill(g, [[s[0] - 6, s[1]], [s[0], s[1] - 8], [s[0] + 6, s[1]], [s[0], s[1] + 3]], dry ? '#6c6964' : '#bfe6f6'); KIT.poly(g, [[s[0] - 6, s[1]], [s[0], s[1] - 8], [s[0] + 6, s[1]], [s[0], s[1] + 3]]); KIT.ink(g, 1.2);
  },
  anim(g, x, y, st, t) {
    if (st === 'dry' || st === 'used') return;
    const k = (t * 0.8) % 1; g.beginPath(); g.ellipse(x, y - 17, 6 + 22 * k, (6 + 22 * k) * 0.5, 0, 0, 6.2832); g.lineWidth = 1.4; g.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - k)) + ')'; g.stroke();
    KIT.line(g, [[x - 7, y - 44], [x - 2, y - 30 + Math.sin(t * 9) * 2], [x + 2, y - 20]], 2, 'rgba(191,230,246,0.85)');
  },
});
// chest (card +1): closed with bands and a lock; open with its lid back and light inside
SI.register({
  id: 'chest', name: '상자', states: ['closed', 'open'], height: 60,
  draw(g, P, st) {
    const wood = { top: '#7a4f8a', left: '#5f3a6e', right: '#2c1a36' }, open = st === 'open';
    KIT.box(g, P, -0.42, -0.28, 0.84, 0.56, 0, 22, wood);
    for (const x of [-0.3, 0.18]) KIT.box(g, P, x, -0.29, 0.1, 0.58, 0, 23, GOLD, { lw: 1.2, dots: false });
    if (!open) {
      KIT.box(g, P, -0.44, -0.3, 0.88, 0.6, 22, 36, wood, { taper: 0.1 });
      for (const x of [-0.3, 0.18]) KIT.box(g, P, x, -0.31, 0.1, 0.62, 22, 37, GOLD, { lw: 1.2, dots: false, taper: 0.08 });
      const l = P(0.02, 0.3, 26); KIT.fill(g, [[l[0] - 4, l[1] - 5], [l[0] + 4, l[1] - 5], [l[0] + 4, l[1] + 4], [l[0] - 4, l[1] + 4]], GOLD.top); KIT.poly(g, [[l[0] - 4, l[1] - 5], [l[0] + 4, l[1] - 5], [l[0] + 4, l[1] + 4], [l[0] - 4, l[1] + 4]]); KIT.ink(g, 1.2);
      return;
    }
    KIT.fill(g, [P(-0.38, 0.24, 22), P(0.38, 0.24, 22), P(0.38, -0.24, 22), P(-0.38, -0.24, 22)], '#fff1b8');
    // lid tipped back against the far edge
    const a = P(-0.44, -0.3, 22), b = P(0.44, -0.3, 22), c = P(0.44, -0.42, 40), d = P(-0.44, -0.42, 40);
    KIT.fill(g, [a, b, c, d], wood.left); KIT.poly(g, [a, b, c, d]); KIT.ink(g, 1.8);
  },
  anim(g, x, y, st, t) { if (st === 'open') glow(g, x, y - 26, 24 + Math.sin(t * 4) * 2, '#fff1b8', 0.7); },
});
// trial rift: a standing tear in the air over a scorched crack, shards round it
SI.register({
  id: 'rift', name: '시련의 균열', states: ['available', 'active', 'spent'], height: 110,
  draw(g, P, st) {
    const spent = st === 'spent' || st === 'done', c = P(0, 0);
    KIT.poly(g, ringPts(P, 0.62, 0, 12)); g.fillStyle = 'rgba(10,10,12,0.55)'; g.fill(); KIT.halftone(g, 0.4);
    for (const [a, r] of [[0.4, 0.5], [2.3, 0.55], [4.1, 0.48]]) { const p = P(Math.cos(a) * r, Math.sin(a) * r); KIT.shard(g, p[0], p[1], 22, 6, (Math.cos(a)) * 6); }
    if (spent) { KIT.line(g, [[c[0] - 18, c[1] + 2], [c[0] - 4, c[1] - 3], [c[0] + 6, c[1] + 3], [c[0] + 20, c[1] - 1]], 2.4); return; }
    const h = st === 'active' ? 100 : 84, wd = st === 'active' ? 16 : 11;
    const pts = [[c[0], c[1] - 4], [c[0] - wd * 0.6, c[1] - h * 0.25], [c[0] - wd, c[1] - h * 0.5], [c[0] - wd * 0.4, c[1] - h * 0.72], [c[0] - 2, c[1] - h], [c[0] + wd * 0.5, c[1] - h * 0.7], [c[0] + wd, c[1] - h * 0.46], [c[0] + wd * 0.5, c[1] - h * 0.22]];
    KIT.fill(g, pts, '#14061f'); KIT.poly(g, pts); g.lineWidth = 4; g.strokeStyle = '#b98cff'; g.stroke(); KIT.ink(g, 1.6);
    const inner = pts.map((p) => [c[0] + (p[0] - c[0]) * 0.45, c[1] - 4 + (p[1] - c[1] + 4) * 0.8]);
    KIT.fill(g, inner, '#5b2d91');
  },
  anim(g, x, y, st, t) {
    if (st === 'spent' || st === 'done') return;
    const h = st === 'active' ? 100 : 84;
    glow(g, x, y - h * 0.5, 30 + Math.sin(t * 5) * 3, '#9b59d0', st === 'active' ? 0.9 : 0.6);
    for (let i = 0; i < 3; i++) { const k = (t * 0.7 + i / 3) % 1; g.fillStyle = 'rgba(201,160,255,' + (1 - k) + ')'; g.fillRect(x - 10 + i * 9, y - h * (0.2 + k * 0.9), 3, 3); }
  },
});
// seal stone (seals task): a dark rune obelisk; cracked, then broken with its top on the ground
SI.register({
  id: 'seal', name: '봉인석', states: ['intact', 'cracked', 'broken'], height: 120,
  draw(g, P, st) {
    const stone = pal('#4c4560');
    KIT.prismN(g, P, 0, 0, 0.7, 8, 0, 10, STONE_D, { lw: 2.2 });
    KIT.prismN(g, P, 0, 0, 0.52, 6, 10, 16, STONE, { lw: 1.6 });
    if (st === 'broken') {
      KIT.prismN(g, P, 0, 0, 0.32, 6, 16, 48, stone, { taper: 0.1 });
      const t = [P(-0.3, 0.1, 48), P(-0.05, 0.3, 58), P(0.3, -0.1, 44), P(0.1, -0.3, 52)]; KIT.fill(g, t, '#2b2638'); KIT.poly(g, t); KIT.ink(g, 1.6);
      // the fallen top
      const a = P(0.55, 0.35, 0), b = P(1.05, 0.05, 0), c2 = P(1.1, 0.25, 22), d = P(0.6, 0.55, 22);
      KIT.fill(g, [a, b, c2, d], stone.left); KIT.poly(g, [a, b, c2, d]); KIT.ink(g, 1.8);
      const r = KIT.rng('sealbits'); for (let i = 0; i < 4; i++) { const p = P(r.range(-0.6, 0.8), r.range(0.3, 0.8)); KIT.rock(g, p[0], p[1], r.range(4, 7), r, stone); }
      return;
    }
    KIT.prismN(g, P, 0, 0, 0.36, 6, 16, 96, stone, { taper: 0.25 });
    KIT.prismN(g, P, 0, 0, 0.27, 6, 96, 116, stone, { taper: 0.95 });
    // runes on the lit faces
    const rune = st === 'cracked' ? '#8a6fb0' : '#d8c4ff';
    for (let i = 0; i < 4; i++) { const z = 30 + i * 16, p = P(-0.08, 0.3, z); KIT.line(g, [[p[0] - 4, p[1] - 3], [p[0] + 2, p[1] + 2], [p[0] - 3, p[1] + 6]], 2, rune); }
    if (st === 'cracked') { const p = P(0.05, 0.3, 90); KIT.line(g, [p, [p[0] + 4, p[1] + 14], [p[0] - 2, p[1] + 26], [p[0] + 5, p[1] + 40], [p[0] + 1, p[1] + 58]], 1.8); KIT.line(g, [[p[0] + 4, p[1] + 14], [p[0] + 10, p[1] + 20]], 1.2); }
  },
  anim(g, x, y, st, t) {
    if (st === 'broken') return;
    glow(g, x, y - 70, st === 'cracked' ? 18 : 28, '#c9a0ff', (st === 'cracked' ? 0.45 : 0.75) + Math.sin(t * 3) * 0.12);
  },
});
// nest (nests task): a ribbed black mound with pale pods and glowing seams; collapsed when destroyed
SI.register({
  id: 'nest', name: '둥지', states: ['alive', 'dead'], height: 90,
  draw(g, P, st) {
    const dead = st === 'dead' || st === 'destroyed', r = KIT.rng('nest'), c = P(0, 0);
    const body = dead ? { top: '#4a4652', left: '#37333f', right: '#1c1a22' } : { top: '#3b2a4f', left: '#2a1d3a', right: '#120b1a' };
    KIT.poly(g, ringPts(P, 0.85, 0, 12)); g.fillStyle = 'rgba(10,10,12,0.45)'; g.fill(); KIT.halftone(g, 0.35);
    const h = dead ? 26 : 62;
    // the mound: overlapping ribbed lobes, back to front
    const lobes = [[-0.3, -0.3, 0.55], [0.3, -0.25, 0.5], [-0.35, 0.25, 0.5], [0.25, 0.3, 0.55], [0, 0, 0.6]];
    for (const [lx, ly, lr] of lobes) {
      const b = P(lx, ly), hh = h * lr * r.range(0.9, 1.2);
      const pts = [[b[0] - lr * 34, b[1] + 4], [b[0] - lr * 26, b[1] - hh * 0.6], [b[0] - lr * 6, b[1] - hh], [b[0] + lr * 18, b[1] - hh * 0.8], [b[0] + lr * 34, b[1] + 2], [b[0], b[1] + lr * 14]];
      KIT.fill(g, pts, body.left); KIT.fill(g, [pts[2], pts[3], pts[4], pts[5]], body.right); KIT.fill(g, [pts[1], pts[2], [b[0] - lr * 4, b[1] - hh * 0.55]], body.top);
      KIT.poly(g, pts); KIT.ink(g, 1.8);
      if (!dead) KIT.line(g, [[b[0] - lr * 10, b[1] - hh * 0.7], [b[0] - lr * 2, b[1] - hh * 0.3], [b[0] + lr * 6, b[1] - 2]], 1.6, '#c86bff');
    }
    if (!dead) for (const [px, py] of [[-0.45, 0.45], [0.5, 0.4], [0.1, 0.62]]) { const p = P(px, py); g.beginPath(); g.ellipse(p[0], p[1] - 7, 6, 8, 0, 0, 6.2832); g.fillStyle = '#e8dcc8'; g.fill(); KIT.ink(g, 1.4); KIT.line(g, [[p[0] - 2, p[1] - 11], [p[0] - 3, p[1] - 5]], 1, 'rgba(255,255,255,0.8)'); }
    for (let i = 0; i < 4; i++) { const a = r.range(0, 6.283), p = P(Math.cos(a) * 0.55, Math.sin(a) * 0.55); KIT.spike(g, p[0], p[1], dead ? 14 : 30, 4, Math.cos(a) * 10); }
  },
  anim(g, x, y, st, t) { if (st === 'dead' || st === 'destroyed') return; glow(g, x, y - 34, 24 + Math.sin(t * 2.2) * 4, '#a64dff', 0.5); },
});
// brazier (hold task): a stone bowl on a pedestal; cold ash, or a pale holy flame
SI.register({
  id: 'brazier', name: '화로', states: ['cold', 'lit'], height: 110,
  draw(g, P, st) {
    KIT.prismN(g, P, 0, 0, 0.62, 8, 0, 10, STONE_D, { lw: 2.2 });
    KIT.prismN(g, P, 0, 0, 0.22, 6, 10, 46, STONE, { taper: 0.15 });
    KIT.prismN(g, P, 0, 0, 0.55, 8, 46, 62, pal('#6a6274'), { taper: -0.25, lw: 2.2 });
    const inner = ringPts(P, 0.56, 62, 16);
    KIT.fill(g, inner, st === 'lit' ? '#fff3c4' : '#3a3530'); KIT.poly(g, inner); KIT.ink(g, 1.4);
    if (st !== 'lit') { const r = KIT.rng('ash'); for (let i = 0; i < 5; i++) { const p = P(r.range(-0.3, 0.3), r.range(-0.3, 0.3), 62); KIT.rock(g, p[0], p[1], r.range(3, 5), r, pal('#6b6560')); } }
    for (const a of [0.4, 2.5, 4.4]) { const p = P(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 10); KIT.line(g, [p, [p[0] + Math.cos(a) * 6, p[1] - 30]], 3); }
  },
  anim(g, x, y, st, t) {
    if (st !== 'lit') return;
    const base = y - 62;
    glow(g, x, base - 20, 44, '#fff0b0', 0.55);
    for (let i = 0; i < 5; i++) {
      const ox = (i - 2) * 7, h = 26 + 10 * Math.sin(t * 9 + i * 1.7) + (i === 2 ? 16 : 0);
      const pts = [[x + ox - 7, base], [x + ox - 2, base - h * 0.6], [x + ox + Math.sin(t * 7 + i) * 3, base - h], [x + ox + 5, base - h * 0.5], [x + ox + 7, base]];
      KIT.fill(g, pts, i % 2 ? '#fff6d0' : '#ffe08a'); KIT.poly(g, pts); KIT.ink(g, 1.2);
    }
  },
});
// spawn rift mark on the floor (where waves come in): a crack with a violet glow
SI.register({
  id: 'spawn_rift', name: '균열 자리', states: [null], height: 20,
  draw(g, P) {
    const pts = []; const r = KIT.rng('spawn');
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.2832, rr = (i % 2 ? 0.28 : 0.55) * r.range(0.8, 1.1); pts.push(P(Math.cos(a) * rr, Math.sin(a) * rr)); }
    KIT.fill(g, pts, '#2a0f40'); KIT.poly(g, pts); g.lineWidth = 3; g.strokeStyle = '#7a3fc0'; g.stroke(); KIT.ink(g, 1.4);
    KIT.fill(g, pts.map((p) => { const c = P(0, 0); return [c[0] + (p[0] - c[0]) * 0.4, c[1] + (p[1] - c[1]) * 0.4]; }), '#9b59d0');
  },
});

// ---- drawing ---------------------------------------------------------------------------------------
function bodySprite(id, st, theme) {
  const d = SI.defs.get(id), H = d.height + 20;
  return KIT.sprite('S:' + id + '|' + st + '|' + theme, -70, -H, 70, 46, (g) => d.draw(g, KIT.proj(0, 0), st, { theme }));
}
SI.draw = function (g, v, id, x, y, st, t, theme) {
  const d = SI.defs.get(id);
  if (!d) return;
  const p = v.proj(x, y);
  KIT.blit(g, bodySprite(id, st, theme || ''), p[0], p[1]);
  if (d.anim) d.anim(g, p[0], p[1], st, t);
};
SI.spawnMarks = function (g, v, w) {
  for (const r of w.floor.layout.rifts || []) if (R.flatOn(v, r[0], r[1], 0.6)) { const p = v.proj(r[0], r[1]); KIT.blit(g, bodySprite('spawn_rift', null, ''), p[0], p[1]); }
};
// the stairs door, set into its back wall: a steel frame; locked — a violet seal across it; open —
// warm light and the first steps up
// The frame, leaves, seal and crystal lock are one cached sprite per side and state (a halftone
// fill per frame would make the browser raster the chunk blits before it, synchronously); only the
// chains' pulse and the open door's light are drawn each frame.
function doorBody(g, at, open) {
  const q = (u0, u1, z0, z1, d) => [at(u0, z0, d), at(u1, z0, d), at(u1, z1, d), at(u0, z1, d)];
  KIT.fill(g, q(-1.0, 1.0, 0, 84), '#6c7280'); KIT.poly(g, q(-1.0, 1.0, 0, 84)); KIT.ink(g, 2.4);
  KIT.fill(g, q(-0.75, 0.75, 4, 74), open ? '#3a2a14' : '#15161c');
  if (open) {
    for (let i = 0; i < 5; i++) KIT.fill(g, q(-0.7, 0.7, 6 + i * 13, 12 + i * 13), KIT.rgba('#ffd98a', 0.35 + i * 0.12));
    KIT.poly(g, q(-0.75, 0.75, 4, 74)); KIT.ink(g, 1.6);
    const sign = q(-0.4, 0.4, 76, 83); KIT.fill(g, sign, '#2f9a5a'); KIT.poly(g, sign); KIT.ink(g, 1.2);
    return;
  }
  KIT.fill(g, q(-0.72, -0.02, 6, 72), '#2a2d36'); KIT.fill(g, q(0.02, 0.72, 6, 72), '#2a2d36');
  KIT.poly(g, q(-0.75, 0.75, 4, 74)); KIT.ink(g, 1.6);
  KIT.line(g, [at(0, 6), at(0, 72)], 2);
  for (const [u0, z0, u1, z1] of [[-0.7, 12, 0.7, 66], [0.7, 12, -0.7, 66]]) KIT.line(g, [at(u0, z0), at(u1, z1)], 5.5);
}
SI.door = function (g, v, w, t) {
  const s = w.stairs;
  if (!s) return;
  const y0 = s.side === 'y0', o = y0 ? v.proj(s.x, 0) : v.proj(0, s.y);
  const local = (P) => (u, z, d) => (y0 ? P(u, d || 0.02, z) : P(d || 0.02, u, z));
  const sp = KIT.sprite('D:' + s.side + '|' + !!s.open, -64, -112, 64, 44, (gg) => {
    const at = local(KIT.proj(0, 0));
    doorBody(gg, at, s.open);
    if (!s.open) { const c = at(0, 39); KIT.shard(gg, c[0], c[1] + 10, 22, 8, 0); }
  });
  KIT.blit(g, sp, o[0], o[1]);
  const at = (u, z, d) => (y0 ? v.proj(s.x + u, d || 0.02, z) : v.proj(d || 0.02, s.y + u, z));
  if (s.open) { const c0 = at(0, 40); glow(g, c0[0], c0[1], 40 + Math.sin(t * 4) * 3, '#ffe6a0', 0.6); return; }
  // the seal's violet chains pulse
  const pulse = 0.6 + 0.25 * Math.sin(t * 3);
  for (const [u0, z0, u1, z1] of [[-0.7, 12, 0.7, 66], [0.7, 12, -0.7, 66]]) KIT.line(g, [at(u0, z0), at(u1, z1)], 3, KIT.rgba('#b98cff', pulse));
};

// ---- the depth-sorted stage pass ------------------------------------------------------------------
const growthSprite = (c, theme) => KIT.sprite('G:' + c.seed + '|' + theme + '|' + c.size, -32 * c.size - 30, -100 * c.size - 24, 32 * c.size + 30, 14 * c.size + 10, (g) => ST.drawGrowth(g, 0, 0, c, theme));
ST.pushItems = function (items, g, v, w, t, actorOn) {
  const m = ST.of(w), W = m.W, grid = w.grid, theme = m.theme, layout = m.layout;
  if (!m.solids) { m.solids = []; for (let y = 0; y < m.H; y++) for (let x = 0; x < W; x++) if (grid.get(x, y) === BD.CELL.SOLID) m.solids.push([x, y]); }
  // who could be hidden this frame: the hero, every enemy on screen and every warning, as the
  // screen point of the middle of the body (the warning's centre) with its depth key. A tall prop
  // slice or a slab-edge growth whose core covers one of those points from in front is drawn
  // see-through (GDD-V2 §5.9: figures behind tall props stay visible); a figure merely brushing
  // its edge does not fade it.
  const behind = [];
  const h = w.hero, hp = v.proj(h.x, h.y);
  behind.push([h.x + h.y, hp[0], hp[1] - 44]);
  for (const e of w.enemies) {
    if (e.dead || !actorOn(v, e.x, e.y, e.size)) continue;
    const p = v.proj(e.x, e.y);
    behind.push([e.x + e.y, p[0], p[1] - 34 * (e.size || 1)]);
  }
  for (const tg of w.telegraphs) { const p = v.proj(tg.x, tg.y); behind.push([tg.x + tg.y, p[0], p[1]]); }
  const covers = (k, x0, y0, x1, y1) => {
    for (const b of behind) if (b[0] < k - 0.3 && b[1] > x0 && b[1] < x1 && b[2] > y0 && b[2] < y1) return true;
    return false;
  };
  for (const [x, y] of m.solids) {
    if (!actorOn(v, x + 0.5, y + 0.5, 0.6)) continue;
    const i = m.cellProp[y * W + x];
    if (i < 0) continue;
    const p = m.props[i], d = R.props.get(p.id), tall = d.tall, H = tall ? d.height(p) : 0;
    items.push({ k: x + y + 1, f: () => {
      const sp = R.props.piece(p, x - p.x, y - p.y, theme, layout), q = v.proj(x, y);
      KIT.blit(g, sp, q[0], q[1], tall && covers(x + y + 1, q[0] - 34, q[1] + 34 - H, q[0] + 34, q[1] + 34) ? 0.42 : undefined);
    } });
  }
  for (const c of m.growth.front) {
    if (!actorOn(v, c.x, c.y, 0.8)) continue;
    items.push({ k: c.x + c.y, f: () => {
      const q = v.proj(c.x, c.y), sp = growthSprite(c, theme), r = 18 * c.size;
      KIT.blit(g, sp, q[0], q[1], covers(c.x + c.y + 0.3, q[0] - r, q[1] - 72 * c.size, q[0] + r, q[1] + 6) ? 0.42 : undefined);
    } });
  }
  if (w.trial && (w.trial.state === 'available' || w.trial.state === 'active')) {
    const tr = w.trial;
    items.push({ k: tr.x + tr.y, f: () => SI.draw(g, v, 'rift', tr.x, tr.y, tr.state, t, theme) });
  }
  for (const list of [w.sites, w.floor.sites]) if (Array.isArray(list)) for (const s of list) {
    const id = s.id || s.kind;
    if (!SI.defs.has(id) || !actorOn(v, s.x, s.y, 1)) continue;
    items.push({ k: s.x + s.y, f: () => SI.draw(g, v, id, s.x, s.y, s.state === undefined ? SI.defs.get(id).states[0] : s.state, t, theme) });
  }
};

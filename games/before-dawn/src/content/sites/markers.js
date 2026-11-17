// Where the floor's places are, for the minimap and the screen edge (GDD-V2 §5.7), as a
// BD.render.markers source (src/client/70_offscreen.js draws them; the UI may restyle):
//   task places left (seal, nest, brazier sites; the hunt's chiefs)   gold, edge + minimap, always
//   optional sites (altar, chest, rift, spring)                       minimap only: '?' until known,
//                                                                     then their kind; grey once used
//   spring (unused) and flasks                                        blue on the edge while HP ≤ 50
// Plus the drawers of the shockwave (seal, holy stone) and the beacon (hold). Browser-only calls.
const GOLD = '#ffd24a', BLUE = '#3aa0ff', GREY = '#8a8790', VIOLET = '#c9a0ff';
const COLOR = { seal: GOLD, nest: GOLD, brazier: GOLD, chief: GOLD, altar: '#f1e4b0', chest: '#e0b23e', rift: VIOLET, spring: BLUE };
const LOW_HP = 50;

// small glyphs in ink (edge marker discs) — one per kind, readable at 11–15 px
function glyph(g, kind, x, y, r) {
  const ink = BD.ui.INK, k = r / 11;
  g.save(); g.translate(x, y); g.scale(k, k);
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 2.2;
  if (kind === 'seal') { g.beginPath(); g.moveTo(0, -8); g.lineTo(4, 6); g.lineTo(-4, 6); g.closePath(); g.fill(); }
  else if (kind === 'nest') { g.beginPath(); g.arc(0, 1, 5.5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 1, 2, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'brazier') { g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(6, -1, 3, 5); g.lineTo(-3, 5); g.quadraticCurveTo(-6, -1, 0, -8); g.fill(); }
  else if (kind === 'chief') { g.beginPath(); g.moveTo(-7, 5); g.lineTo(-7, -4); g.lineTo(-3, 0); g.lineTo(0, -7); g.lineTo(3, 0); g.lineTo(7, -4); g.lineTo(7, 5); g.closePath(); g.fill(); }
  else if (kind === 'spring' || kind === 'flask') { g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(6, 1, 0, 6); g.quadraticCurveTo(-6, 1, 0, -8); g.fill(); }
  g.restore();
}
// minimap glyphs: a ringed dot in the kind's colour, '?' for an unknown site, grey when used
function mini(kind, color, known, used) {
  return function (g, x, y) {
    const ink = BD.ui.INK;
    g.beginPath(); g.arc(x, y, used ? 3 : 4.2, 0, Math.PI * 2); g.fillStyle = used ? GREY : known ? color : '#f3ead8'; g.fill();
    g.lineWidth = 1.3; g.strokeStyle = ink; g.stroke();
    if (!known && !used) { g.font = '800 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.fillText('?', x, y + 0.5); }
    else if (!used && (kind === 'seal' || kind === 'nest' || kind === 'brazier' || kind === 'chief')) { g.beginPath(); g.arc(x, y, 6.2, 0, Math.PI * 2); g.lineWidth = 1.4; g.strokeStyle = GOLD; g.stroke(); }
  };
}

BD.render.markers.register({
  id: 'places',
  collect(w, out) {
    if (!w.floor || !w.floor.v2) return;
    const low = w.hero.hp <= LOW_HP;
    for (const s of w.sites) {
      const def = BD.sites.get(s.kind), used = s.phase === 'used' || (s.phase === 'active' && s.kind !== 'rift'), task = !s.optional;
      const color = COLOR[s.kind] || GOLD;
      if (task && !used) out.push({ x: s.x, y: s.y, kind: 'objective', color, id: 's' + s.id, icon: (g, x, y, r) => glyph(g, s.kind, x, y, r), miniIcon: mini(s.kind, color, true, false) });
      else if (task) out.push({ x: s.x, y: s.y, kind: 'objective', color: GREY, id: 's' + s.id, edge: false, miniIcon: mini(s.kind, color, true, true) });
      else {
        const edge = s.kind === 'spring' && !used && low && s.known;
        out.push({ x: s.x, y: s.y, kind: 'objective', color: s.known ? color : '#f3ead8', id: 's' + s.id, edge, icon: (g, x, y, r) => glyph(g, s.kind, x, y, r), miniIcon: mini(s.kind, color, s.known || !!def.known, used) });
      }
    }
    for (const e of w.enemies) {
      if (e.dead || !e.flags.chief) continue;
      out.push({ x: e.x, y: e.y, kind: 'objective', color: GOLD, id: 'c' + e.id, icon: (g, x, y, r) => glyph(g, 'chief', x, y, r), miniIcon: mini('chief', GOLD, true, false) });
    }
    if (low) for (const p of w.pickups) if (p.kind === 'flask') out.push({ x: p.x, y: p.y, kind: 'objective', color: BLUE, id: 'f' + p.id, mini: false, icon: (g, x, y, r) => glyph(g, 'flask', x, y, r) });
  },
});

// a shockwave ring (seal broken, holy stone): ev {x, y, r}
BD.render.vfx.register({
  id: 'shock',
  draw(g, v, ev, k) {
    const r = ev.r * (0.25 + 0.75 * Math.sqrt(k)), pts = [];
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push(v.proj(ev.x + Math.cos(a) * r, ev.y + Math.sin(a) * r)); }
    g.save();
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.globalAlpha = 1 - k; g.strokeStyle = BD.ui.INK; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#fff3c4'; g.lineWidth = 5; g.stroke();
    g.restore();
  },
});
// the beacon over the brazier (hold done): a column of light
BD.render.vfx.register({
  id: 'beacon',
  draw(g, v, ev, k) {
    const b = v.proj(ev.x, ev.y), w = 26 * (1 - k * 0.5);
    g.save(); g.globalAlpha = 0.75 * (1 - k);
    g.fillStyle = '#ffe6a0'; g.fillRect(b[0] - w / 2, b[1] - 700, w, 700);
    g.fillStyle = '#ffffff'; g.fillRect(b[0] - w / 6, b[1] - 700, w / 3, 700);
    g.restore();
  },
});

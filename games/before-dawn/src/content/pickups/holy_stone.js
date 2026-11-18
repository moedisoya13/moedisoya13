// 성광석 (holy stone) — GDD-V2 §6. Step on it (0.6u): a 7u shockwave — fodder die (their shards
// drop), every other enemy takes 40 and is pushed 2u. From a cleared rift (always) and a threat's
// death (1.5 %); at most 2 on a floor. Kept for when you are surrounded.
const R = 7, DMG = 40, PUSH = 2;

BD.pickups.register({
  id: 'holy_stone', name: '성광석', touch: BD.C.INTERACT.flaskTouch, radius: R, dmg: DMG, push: PUSH,
  take(w, p) {
    BD.places.shock(w, p.x, p.y, R, { dmg: DMG, push: PUSH });
    BD.W.toast(w, '성광석 — 빛이 터진다');
    return true;
  },
});

// a white octagonal stone with a cross of light (drawn in code, GDD-V2 §6)
BD.render.pickups.register({
  id: 'holy_stone',
  draw(g, v, p, t) {
    const c = v.proj(p.x, p.y, 12 + Math.sin(t * 2 + p.id) * 2), sh = v.proj(p.x, p.y), k = 0.6 + 0.4 * Math.sin(t * 3 + p.id);
    g.save();
    g.beginPath(); g.ellipse(sh[0], sh[1], 11, 5, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    g.translate(c[0], c[1]);
    g.globalAlpha = 0.35 + 0.35 * k; g.fillStyle = '#fffbea';
    g.fillRect(-2, -24, 4, 48); g.fillRect(-20, -2, 40, 4);
    g.globalAlpha = 1;
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; pts.push([Math.cos(a) * 10, Math.sin(a) * 11]); }
    g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
    g.fillStyle = '#f4f1ff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = BD.ui.INK; g.stroke();
    g.beginPath(); g.moveTo(pts[5][0], pts[5][1]); g.lineTo(pts[6][0], pts[6][1]); g.lineTo(0, 0); g.closePath(); g.fillStyle = '#d6d0ec'; g.fill();
    g.fillStyle = '#ffd96a'; g.fillRect(-1.5, -6, 3, 12); g.fillRect(-5, -1.5, 10, 3);
    g.restore();
  },
});

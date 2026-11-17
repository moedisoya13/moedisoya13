// 검기 (shape) — GDD §5.3, §5.6. Unlock: first time on 3F.
// Aim range 6.5u (line of sight needed beyond the blade; the engine checks it). Every swing
// fires a crescent: 13u/s, range 6.5u, width 1.0u, factor 0.6, gone at the first enemy.
// Enemies the same swing's blade hit are skipped. With 관통 (or 일섬 ≥ 4, which gives the
// swing pierce) the wave passes through up to 3 enemies. A 발도-charged swing's wave flies
// 0.6u further and keeps the ×2.5 (drawcut.js reads `charged` on the projectile).
// On screen: a flying orange crescent (projectile drawer 'wave').
const K = BD.cardKit;
const M = BD.math;
const T = { acquire: 6.5, speed: 13, range: 6.5, width: 1.0, factor: 0.6, pierceWith: 3, chargedRange: 0.6 };

BD.cards.register({
  id: 'sword_wave', name: '검기', family: 'shape', icon: 'sword_wave',
  unlock: (save) => save.bestFloor >= 3,
  desc: '조준 사거리 6.5u(시야선 필요). 베기마다 초승달 검기 발사: 속도 13u/s, 사거리 6.5u, 폭 1.0u, 배율 0.6, 첫 적에 맞고 사라짐. 같은 베기의 칼에 맞은 적은 검기에 다시 맞지 않는다.',
  T,
  stats(ctx, s) { s.acquireRange = Math.max(s.acquireRange || 0, T.acquire); },
  afterSwing(ctx) {
    const sw = ctx.swing;
    ctx.projectile({
      x: sw.x, y: sw.y, dir: sw.aim, speed: T.speed, range: T.range + (sw.charged ? T.chargedRange : 0),
      width: T.width, factor: T.factor, pierce: K.hasPierce(ctx.w) ? T.pierceWith : 1,
      skip: new Set(sw.hits.map((h) => h.e.id)), source: 'wave', kind: 'wave',
      charged: !!sw.charged, chained: !!sw.data.chained,
    });
  },
  hud() { return {}; },
});

BD.render.projectiles.register({
  id: 'wave',
  draw(g, v, p, w) {
    const D = K.draw;
    const fade = M.clamp((p.range - p.travelled) / 1.2, 0.25, 1);
    const cx = Math.cos(p.dir), cy = Math.sin(p.dir), z = 16;
    const big = p.pierce > 1 || p.charged ? 1.15 : 1;
    const outer = [], inner = [];
    for (let i = 0; i <= 14; i++) {
      const a = p.dir - 1.25 + (2.5 * i) / 14;
      outer.push(v.proj(p.x - cx * 0.3 + Math.cos(a) * 0.62 * big, p.y - cy * 0.3 + Math.sin(a) * 0.62 * big, z));
      inner.push(v.proj(p.x - cx * 0.48 + Math.cos(a) * 0.56 * big, p.y - cy * 0.48 + Math.sin(a) * 0.56 * big, z));
    }
    const els = BD.cardRt.elements(w);
    // motion streaks behind
    g.strokeStyle = D.rgba(K.ORANGE, 0.35 * fade); g.lineWidth = 2;
    for (const off of [-0.35, 0, 0.35]) {
      const a0 = v.proj(p.x - cx * 0.4 - cy * off, p.y - cy * 0.4 + cx * off, z), a1 = v.proj(p.x - cx * 1.4 - cy * off, p.y - cy * 1.4 + cx * off, z);
      g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.stroke();
    }
    const poly = outer.concat(inner.reverse());
    g.globalAlpha = fade;
    if (D.rim(w)) { D.path(g, poly, true); g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.stroke(); }
    D.path(g, poly, true);
    g.fillStyle = p.charged ? '#fff3d6' : K.ORANGE; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = K.INK; g.stroke();
    els.forEach((el, i) => {
      D.path(g, outer.slice(2 + i, outer.length - 2 - i));
      g.strokeStyle = K.ELEMENT_COLORS[el]; g.lineWidth = 2.5; g.stroke();
    });
    D.path(g, outer.slice(3, outer.length - 3)); g.strokeStyle = '#fff3d6'; g.lineWidth = 1.5; g.stroke();
    g.globalAlpha = 1;
  },
});

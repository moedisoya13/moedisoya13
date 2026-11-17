// 검기 (shape) — GDD §5.3, §5.6, GDD-V2 §4.4. Unlock: first time on 3F.
// Aim range 6.5u (line of sight needed beyond the blade; the engine checks it). Every swing
// fires crescents: 13u/s, width 1.0u, factor 0.6, each passing through up to 2 enemies.
// Enemies the same swing's blade hit are skipped, and the crescents of one swing share what they
// hit (each enemy is cut once per swing by the wave). With 관통 (or 일섬 at its pierce stage) every
// crescent passes through 2 more (GDD-V2 §4.4 "검기가 꿰뚫는 수 +2"). A 발도-charged swing's wave
// flies 0.6u further and keeps the ×2.5 (drawcut.js reads `charged` on the projectile).
// Levels (cumulative, ctx.lv):
//   1 one crescent, range 6.5u, pierce 2, factor 0.6   2 factor 0.8   3 three ways (0°, ±16°)
//   4 pierce 4, width 1.3u   5 five ways (0°, ±16°, ±32°), range 8u
// On screen: flying orange crescents (projectile drawer 'wave'), wider when they pierce more.
const K = BD.cardKit;
const M = BD.math;
const T = { acquire: 6.5, speed: 13, chargedRange: 0.6, pierceBonus: 2 };

BD.cards.register({
  id: 'sword_wave', name: '검기', family: 'shape', icon: 'sword_wave',
  unlock: (save) => save.bestFloor >= 3, unlockText: '3층에 처음 도달',
  desc: '조준 사거리 6.5u(시야선 필요). 베기마다 초승달 검기 발사: 속도 13u/s, 사거리 6.5u, 폭 1.0u, 배율 0.6, 적 2명까지 꿰뚫는다. 같은 베기의 칼에 맞은 적은 검기에 다시 맞지 않는다.',
  T,
  levels: [null,
    { text: '조준 6.5u. 베기마다 초승달 1발(13u/s, 사거리 6.5u, 폭 1.0u, 배율 0.6), 적 2명까지 꿰뚫는다', range: 6.5, width: 1.0, factor: 0.6, pierce: 2, spread: [0] },
    { text: '배율 0.8', factor: 0.8 },
    { text: '세 갈래(0°, ±16°)', spread: [0, -16, 16] },
    { text: '적 4명까지, 폭 1.3u', pierce: 4, width: 1.3 },
    { text: '다섯 갈래(0°, ±16°, ±32°), 사거리 8u', spread: [0, -16, 16, -32, 32], range: 8 },
  ],
  stats(ctx, s) { s.acquireRange = Math.max(s.acquireRange || 0, T.acquire); },
  afterSwing(ctx) {
    const sw = ctx.swing, lv = ctx.lv;
    const skip = new Set(sw.hits.map((h) => h.e.id));
    const group = { chained: !!sw.data.chained }; // lightning chains once per swing (lightning.js)
    const pierce = lv.pierce + (K.hasPierce(ctx.w) ? T.pierceBonus : 0);
    for (const deg of lv.spread) {
      const p = ctx.projectile({
        x: sw.x, y: sw.y, dir: sw.aim + deg * M.DEG, speed: T.speed, range: lv.range + (sw.charged ? T.chargedRange : 0),
        width: lv.width, factor: lv.factor, pierce, skip, source: 'wave', kind: 'wave',
        charged: !!sw.charged, chained: group.chained, group,
      });
      if (p) p.hitIds = skip; // one set for the swing's crescents
    }
  },
  hud() { return {}; },
});

BD.render.projectiles.register({
  id: 'wave',
  draw(g, v, p, w) {
    const D = K.draw;
    const fade = M.clamp((p.range - p.travelled) / 1.2, 0.25, 1);
    const cx = Math.cos(p.dir), cy = Math.sin(p.dir), z = 16;
    const big = (p.width || 1) * (p.pierce > 2 || p.charged ? 1.15 : 1);
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

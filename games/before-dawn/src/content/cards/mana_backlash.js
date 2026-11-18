// 마력 역류 (target: magic) — GDD §5.3, GDD-V2 §4.4, §8. Unlock: 1200 magic-type kills in total (v2).
// Extra damage to magic-type enemies. A mage the blade hits is bound for 2.5 s (status `bind`; the
// mage's teleport reads it). Killing a magic-type enemy (any source) bursts on every other enemy
// whose edge is within the radius (source 'burst').
// Levels (cumulative, ctx.lv):
//   1 +5 to magic, bind 2.5 s, a magic kill bursts 12 in 1.8u   2 +8   3 burst radius 2.4u
//   4 burst 18   5 a threat or elite kill of any type bursts too
// On screen: purple chains on bound enemies (decor 'mana_chains', over the engine's bind ring), a
// purple chain snap when the bind lands (vfx 'mana_chain'), a purple explosion on a burst (vfx
// 'mana_burst'). Slot: glow on a magic floor, flash on a hit.
const K = BD.cardKit;
const M = BD.math;
const T = { bind: 2.5 };

BD.cards.register({
  id: 'mana_backlash', name: '마력 역류', family: 'target', targetType: 'magic', icon: 'mana_backlash',
  unlock: (save) => (save.counters.magicKills || 0) >= 1200, unlockText: '누적 마법 유형 처치 1200',
  desc: '마법 유형에게 피해 +5. 맞은 마도사는 2.5초간 순간이동 불가(속박). 마법 유형을 처치하면 반경 1.8u의 다른 적에게 12 피해.',
  T,
  levels: [null,
    { text: '마법 유형에게 +5. 맞은 마도사는 2.5초 순간이동 불가. 마법 유형 처치 시 반경 1.8u에 12 피해', flat: 5, r: 1.8, dmg: 12, any: false },
    { text: '마법 유형에게 +8', flat: 8 },
    { text: '폭발 반경 2.4u', r: 2.4 },
    { text: '폭발 피해 18', dmg: 18 },
    { text: '위협·정예를 처치해도(유형 무관) 폭발', any: true },
  ],
  flat(ctx, e) { return e.type === 'magic' ? ctx.lv.flat : 0; },
  onHit(ctx, e) {
    if (e.type !== 'magic') return;
    ctx.status(e, 'bind', { dur: T.bind });
    K.targetFlash(ctx);
    K.vfx(ctx, 'mana_chain', { x: K.r3(e.x), y: K.r3(e.y), life: 0.4 });
  },
  on: {
    kill(ev, ctx) {
      const lv = ctx.lv;
      let go = K.etype(ev) === 'magic';
      if (!go && lv.any) { const e = BD.W.enemyById(ctx.w, ev.enemyId); go = !!(ev.elite || (e && e.role === 'threat')); }
      if (!go) return;
      K.burst(ctx, ev.x, ev.y, lv.r, lv.dmg, ev.enemyId);
      K.vfx(ctx, 'mana_burst', { x: ev.x, y: ev.y, r: lv.r, life: 0.5 });
    },
  },
  hud(state, ctx) { return K.targetHud(state, ctx, 'magic'); },
});

function chainLinks(g, x0, y0, x1, y1, a, n) {
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
    g.save(); g.translate(x, y); g.rotate(Math.atan2(y1 - y0, x1 - x0) + (i % 2 ? Math.PI / 2 : 0));
    g.beginPath(); g.ellipse(0, 0, 5, 2.6, 0, 0, M.TAU);
    g.lineWidth = 4; g.strokeStyle = 'rgba(10,10,12,' + a + ')'; g.stroke();
    g.lineWidth = 2; g.strokeStyle = K.draw.rgba('#b07ce8', a); g.stroke();
    g.restore();
  }
}

BD.render.decor.register({
  id: 'mana_chains', target: 'enemy',
  draw(g, v, e, w, box, t) {
    if (!e.statuses.bind || !BD.cardRt.has(w, 'mana_backlash')) return;
    const a = Math.min(1, e.statuses.bind.t / 0.4);
    const top = box.top + (box.y - box.top) * 0.35, bot = box.top + (box.y - box.top) * 0.75, hw = box.w * 0.42;
    chainLinks(g, box.x - hw, top, box.x + hw, bot, a, 6);
    chainLinks(g, box.x + hw, top, box.x - hw, bot, a, 6);
  },
});

BD.render.vfx.register({
  id: 'mana_chain',
  draw(g, v, ev, k) {
    const a = 1 - k, c = v.proj(ev.x, ev.y, 36), s = 22 * (1.3 - 0.3 * k);
    chainLinks(g, c[0] - s, c[1] - s * 0.6, c[0] + s, c[1] + s * 0.6, a, 5);
    chainLinks(g, c[0] + s, c[1] - s * 0.6, c[0] - s, c[1] + s * 0.6, a, 5);
  },
});

BD.render.vfx.register({
  id: 'mana_burst',
  draw(g, v, ev, k) { K.draw.burst(g, v, ev.x, ev.y, ev.r, k, '#9b59d0', 0.45); },
});

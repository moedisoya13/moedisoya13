// 성광 (target: undead) — GDD §5.3, §6.2, GDD-V2 §4.4. Extra damage to undead. Ghouls do not rise
// again: any hero-side damage to an undead enemy marks it `noRevive` before its death is resolved,
// so a ghoul killed by the blade, a chain, a burn or a burst dies without going down, and a corpse
// already down is finished on the next tick (engine rule for `flags.noRevive`).
// Levels (cumulative, ctx.lv):
//   1 +8 to undead, no revive   2 +12
//   3 an undead kill (any source) bursts in a cross: radius 1.6u, 12 to every enemy (all types)
//   4 +16, the cross 18   5 also every 10th kill of any type bursts (one cross per kill at most)
// On screen: a white cross splashes off every undead the blade hits (vfx 'holy_cross'); the burst
// is a big white cross with a ring on the ground (vfx 'holy_burst'). Slot: glow while this floor's
// dominant type is undead; flash on a hit (≤ 2 per second); pips toward the 10th kill at level 5.
const K = BD.cardKit;
const T = { burstR: 1.6, every: 10 };

function mark(w, ev) {
  if (K.etype(ev) !== 'undead') return;
  const e = BD.W.enemyById(w, ev.enemyId);
  if (e) e.flags.noRevive = true;
}
BD.cards.register({
  id: 'holy_light', name: '성광', family: 'target', targetType: 'undead', unlock: 'base', icon: 'holy_light',
  desc: '언데드에게 피해 +8. 구울이 다시 일어나지 않는다.',
  T,
  levels: [null,
    { text: '언데드에게 피해 +8. 구울이 다시 일어나지 않는다', flat: 8, burst: 0, every: 0 },
    { text: '언데드에게 +12', flat: 12 },
    { text: '언데드를 처치하면 십자 폭발: 반경 1.6u, 12 피해(모든 유형)', burst: 12 },
    { text: '언데드에게 +16, 폭발 18', flat: 16, burst: 18 },
    { text: '유형과 상관없이 처치 10번째마다 십자 폭발', every: T.every },
  ],
  init(ctx) { ctx.state.kills = 0; },
  flat(ctx, e) { return e.type === 'undead' ? ctx.lv.flat : 0; },
  onHit(ctx, e) {
    if (e.type !== 'undead') return;
    e.flags.noRevive = true;
    K.targetFlash(ctx);
    K.vfx(ctx, 'holy_cross', { x: K.r3(e.x), y: K.r3(e.y), r: K.r3(e.r), life: 0.4 });
  },
  on: {
    hit(ev, ctx) { mark(ctx.w, ev); },
    kill(ev, ctx) {
      const lv = ctx.lv;
      if (!lv.burst) return;
      let go = K.etype(ev) === 'undead';
      if (lv.every) { ctx.state.kills++; if (ctx.state.kills >= lv.every) { ctx.state.kills = 0; go = true; } }
      if (!go) return;
      K.burst(ctx, ev.x, ev.y, T.burstR, lv.burst, ev.enemyId);
      K.vfx(ctx, 'holy_burst', { x: ev.x, y: ev.y, r: T.burstR, life: 0.45 });
    },
  },
  hud(state, ctx) {
    const o = K.targetHud(state, ctx, 'undead');
    if (ctx && ctx.lv.every) o.pips = Math.floor(state.kills / 2);
    return o;
  },
});

BD.render.vfx.register({
  id: 'holy_cross',
  draw(g, v, ev, k) {
    const a = 1 - k, c = v.proj(ev.x, ev.y, 30 + ev.r * 40), s = (14 + 10 * k) * (0.8 + ev.r);
    g.save(); g.translate(c[0], c[1]); g.rotate(0.15 * k);
    g.globalAlpha = a;
    const bar = (x, y, w2, h2) => { g.fillRect(x, y, w2, h2); g.strokeRect(x, y, w2, h2); };
    g.fillStyle = '#ffffff'; g.strokeStyle = K.INK; g.lineWidth = 2;
    bar(-s * 0.16, -s, s * 0.32, s * 2);
    bar(-s * 0.7, -s * 0.45, s * 1.4, s * 0.3);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.arc(0, -s * 0.3, s * 1.1, 0, Math.PI * 2); g.fill();
    g.restore();
  },
});

// 3단계 십자 폭발: a ground cross of light the width of the burst, a ring, and a tall cross.
BD.render.vfx.register({
  id: 'holy_burst',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k, R = ev.r * (0.5 + 0.5 * Math.min(1, k * 3));
    D.ellipse(g, v, ev.x, ev.y, R, 'rgba(255,255,255,' + 0.22 * a + ')', 'rgba(10,10,12,' + 0.7 * a + ')', 4);
    D.ellipse(g, v, ev.x, ev.y, R, null, 'rgba(255,248,214,' + a + ')', 2);
    g.lineCap = 'round';
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const p0 = v.proj(ev.x - dx * R, ev.y - dy * R, 4), p1 = v.proj(ev.x + dx * R, ev.y + dy * R, 4);
      g.strokeStyle = 'rgba(10,10,12,' + 0.7 * a + ')'; g.lineWidth = 11; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = 6; g.stroke();
    }
    g.lineCap = 'butt';
    const c = v.proj(ev.x, ev.y, 60 + 30 * k), s = 26 * (1 - 0.3 * k);
    g.save(); g.translate(c[0], c[1]); g.globalAlpha = a;
    g.fillStyle = '#ffffff'; g.strokeStyle = K.INK; g.lineWidth = 2.5;
    g.fillRect(-s * 0.16, -s, s * 0.32, s * 2); g.strokeRect(-s * 0.16, -s, s * 0.32, s * 2);
    g.fillRect(-s * 0.7, -s * 0.45, s * 1.4, s * 0.3); g.strokeRect(-s * 0.7, -s * 0.45, s * 1.4, s * 0.3);
    g.restore();
  },
});

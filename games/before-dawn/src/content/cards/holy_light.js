// 성광 (target: undead) — GDD §5.3, §6.2. +8 damage to undead. Ghouls do not rise again:
// any hero-side damage to an undead enemy marks it `noRevive` before its death is resolved,
// so a ghoul killed by the blade, a chain, a burn or a burst dies without going down, and a
// corpse already down is finished on the next tick (engine rule for `flags.noRevive`).
// On screen: a white cross splashes off every undead the blade hits (vfx 'holy_cross').
// Slot: glow while this floor's dominant type is undead; flash on a hit (≤ 2 per second).
const K = BD.cardKit;
const T = { flat: 8 };

function mark(w, ev) {
  if (K.etype(ev) !== 'undead') return;
  const e = BD.W.enemyById(w, ev.enemyId);
  if (e) e.flags.noRevive = true;
}
BD.cards.register({
  id: 'holy_light', name: '성광', family: 'target', targetType: 'undead', unlock: 'base', icon: 'holy_light',
  desc: '언데드에게 피해 +8. 구울이 다시 일어나지 않는다.',
  T,
  flat(ctx, e) { return e.type === 'undead' ? T.flat : 0; },
  onHit(ctx, e) {
    if (e.type !== 'undead') return;
    e.flags.noRevive = true;
    K.targetFlash(ctx);
    K.vfx(ctx, 'holy_cross', { x: K.r3(e.x), y: K.r3(e.y), r: K.r3(e.r), life: 0.4 });
  },
  on: { hit(ev, ctx) { mark(ctx.w, ev); } },
  hud(state, ctx) { return K.targetHud(state, ctx, 'undead'); },
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

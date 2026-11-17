// 갑옷 파쇄 (target: heavy) — GDD §5.3, §4, §6.2.
// The dark knight's front guard (direct hits from its front 120° at 20 %) is ignored: the card
// sets `stats.mods.ignoreGuard`, which the dark knight's defense reads (ARCHITECTURE §3.3).
// Every hit on a heavy enemy adds a crack (sunder +1, at most 5, permanent on that enemy):
// it takes +15 % per crack from the blade (stage ③ multiplier 1 + 0.15 × cracks, applied
// before this hit's crack is added).
// On screen: armour shards fly off on every heavy hit (vfx 'armor_shards'); the engine draws
// one crack line per stack on the enemy. Slot: glow on a heavy floor, flash on a hit.
const K = BD.cardKit;
const T = { perCrack: 15, max: 5 };

BD.cards.register({
  id: 'armor_break', name: '갑옷 파쇄', family: 'target', targetType: 'heavy', unlock: 'base', icon: 'armor_break',
  desc: '중갑의 정면 방어를 무시. 중갑을 맞힐 때마다 균열 +1(최대 5, 그 적에게 영구): 받는 피해 +15%씩.',
  T,
  stats(ctx, s) { s.mods.ignoreGuard = true; },
  // integer percent so 10 × 1.45 rounds as 14.5 → 15, not 14.499…
  mult(ctx, e) {
    if (e.type !== 'heavy') return 1;
    const n = e.statuses.sunder ? e.statuses.sunder.n : 0;
    return (100 + T.perCrack * n) / 100;
  },
  onHit(ctx, e) {
    if (e.type !== 'heavy') return;
    ctx.status(e, 'sunder', { n: 1, max: T.max });
    K.targetFlash(ctx);
    K.vfx(ctx, 'armor_shards', { x: K.r3(e.x), y: K.r3(e.y), dir: K.r3(Math.atan2(e.y - ctx.hero.y, e.x - ctx.hero.x)), n: e.statuses.sunder ? e.statuses.sunder.n : 1, life: 0.5 });
  },
  hud(state, ctx) { return K.targetHud(state, ctx, 'heavy'); },
});

BD.render.vfx.register({
  id: 'armor_shards',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k;
    for (let i = 0; i < 7; i++) {
      const an = ev.dir + (D.hash(ev.x * 7 + i, ev.y) - 0.5) * 2.2, sp = 0.5 + D.hash(i, ev.x) * 0.9;
      const d = sp * k * 1.4, z = 40 + 60 * k * (1 - k) * 2 - 30 * k * k;
      const c = v.proj(ev.x + Math.cos(an) * d, ev.y + Math.sin(an) * d, Math.max(4, z));
      const s = 4 + (i % 3) * 2, rot = k * 9 + i;
      g.save(); g.translate(c[0], c[1]); g.rotate(rot); g.globalAlpha = a;
      D.path(g, [[-s, -s * 0.4], [s * 0.8, -s * 0.7], [s * 0.4, s * 0.6], [-s * 0.6, s * 0.5]], true);
      g.fillStyle = i % 2 ? '#8b8f9e' : '#c9ccd6'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = K.INK; g.stroke();
      g.restore();
    }
    // a crack flash on the plate
    const c0 = v.proj(ev.x, ev.y, 44);
    g.globalAlpha = a; g.strokeStyle = '#ffffff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(c0[0] - 9, c0[1] - 8); g.lineTo(c0[0] - 2, c0[1] - 1); g.lineTo(c0[0] - 6, c0[1] + 4); g.lineTo(c0[0] + 7, c0[1] + 10); g.stroke();
    g.globalAlpha = 1;
  },
});

// 갑옷 파쇄 (target: heavy) — GDD §5.3, §4, §6.2, GDD-V2 §4.4.
// The dark knight's front guard (direct hits from its front 120° at 20 %) is ignored: the card
// sets `stats.mods.ignoreGuard`, which the dark knight's defense reads (ARCHITECTURE §3.3).
// Every hit on a heavy enemy adds a crack (sunder +1, at most 5, permanent on that enemy): it takes
// more per crack from the blade (stage ③ multiplier, applied before this hit's crack is added).
// Levels (cumulative, ctx.lv):
//   1 +15 % per crack, max 5   2 +20 % per crack
//   3 an enemy with 5 cracks that dies bursts in shards: radius 2.0u, 25 to every other enemy
//   4 cracks also build on elites, guardians and the demon king of any type (at most 3 there)
//   5 a heavy or elite kill empowers the next 3 swings × 1.5
// On screen: armour shards fly off every cracked hit (vfx 'armor_shards'), bright crack lines on the
// enemy (decor 'armor_cracks'), a grey-white shard burst at level 3 (vfx 'armor_burst'), the blade
// glows steel-white while empowered (decor 'armor_edge'). Slot: glow on a heavy floor, flash on a
// hit, pips = empowered swings left.
const K = BD.cardKit;
const T = { max: 5, royalMax: 3, burstR: 2.0, empower: 3, empowerMult: 1.5 };
const royal = (e) => !!(e.elite || e.guardian || e.boss);
const crackMax = (lv, e) => (e.type === 'heavy' ? T.max : lv.royal && royal(e) ? T.royalMax : 0);

BD.cards.register({
  id: 'armor_break', name: '갑옷 파쇄', family: 'target', targetType: 'heavy', unlock: 'base', icon: 'armor_break',
  desc: '중갑의 정면 방어를 무시. 중갑을 맞힐 때마다 균열 +1(최대 5, 그 적에게 영구): 받는 피해 +15%씩.',
  T,
  levels: [null,
    { text: '중갑의 정면 방어 무시. 중갑을 맞힐 때마다 균열 +1(최대 5): 받는 피해 +15%씩', per: 15, burst: 0, royal: false, empower: false },
    { text: '균열당 +20%', per: 20 },
    { text: '균열 5인 적이 죽으면 파편 폭발: 반경 2.0u, 25 피해', burst: 25 },
    { text: '균열이 정예·수호자·마왕에게도 쌓인다(최대 3)', royal: true },
    { text: '중갑이나 정예를 처치하면 다음 베기 3번이 피해 × 1.5', empower: true },
  ],
  init(ctx) { ctx.state.empower = 0; ctx.state.cur = false; },
  stats(ctx, s) { s.mods.ignoreGuard = true; },
  // integer percent so 10 × 1.45 rounds as 14.5 → 15, not 14.499…
  mult(ctx, e) {
    const n = e.statuses.sunder ? e.statuses.sunder.n : 0;
    let m = (100 + ctx.lv.per * n) / 100;
    if (ctx.state.cur && ctx.swing && ctx.swing.isSwing) m *= T.empowerMult;
    return m;
  },
  onHit(ctx, e) {
    const max = crackMax(ctx.lv, e);
    if (!max) return;
    ctx.status(e, 'sunder', { n: 1, max });
    K.targetFlash(ctx);
    K.vfx(ctx, 'armor_shards', { x: K.r3(e.x), y: K.r3(e.y), dir: K.r3(Math.atan2(e.y - ctx.hero.y, e.x - ctx.hero.x)), n: e.statuses.sunder ? e.statuses.sunder.n : 1, life: 0.5 });
  },
  on: {
    kill(ev, ctx) {
      const lv = ctx.lv, e = BD.W.enemyById(ctx.w, ev.enemyId);
      if (lv.burst && e && e.statuses.sunder && e.statuses.sunder.n >= T.max) {
        K.burst(ctx, ev.x, ev.y, T.burstR, lv.burst, ev.enemyId);
        K.vfx(ctx, 'armor_burst', { x: ev.x, y: ev.y, r: T.burstR, life: 0.5 });
      }
      if (lv.empower && (K.etype(ev) === 'heavy' || ev.elite)) ctx.state.empower = T.empower;
    },
    // an empowered swing is decided at ① (a kill during it empowers the three after it)
    swing(ev, ctx) { const st = ctx.state; st.cur = st.empower > 0; if (st.cur) st.empower--; },
    swing_end(ev, ctx) { ctx.state.cur = false; },
  },
  hud(state, ctx) {
    const o = K.targetHud(state, ctx, 'heavy');
    if (state.empower > 0) o.pips = state.empower;
    return o;
  },
});

// Bright crack lines, one per stack: the engine's ink cracks do not show on black armour.
BD.render.decor.register({
  id: 'armor_cracks', target: 'enemy',
  draw(g, v, e, w, box) {
    const s = e.statuses.sunder;
    if (!s || e.down) return;
    const hgt = box.y - box.top, D = K.draw;
    for (let i = 0; i < s.n; i++) {
      const y0 = box.top + hgt * (0.3 + 0.09 * i), x0 = box.x + (i % 2 ? 2 : -12) * (box.w / 60);
      const pts = [[x0, y0], [x0 + 6, y0 + 4], [x0 + 3, y0 + 8], [x0 + 11, y0 + 12], [x0 + 9, y0 + 16]];
      D.path(g, pts);
      g.lineJoin = 'round';
      g.strokeStyle = K.INK; g.lineWidth = 4; g.stroke();
      g.strokeStyle = '#ffe9b0'; g.lineWidth = 2; g.stroke();
    }
  },
});

// 5단계: a steel-white edge on the blade while the next swings are empowered
BD.render.decor.register({
  id: 'armor_edge', target: 'hero_front',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'armor_break');
    if (!c || h.dead || !(c.state.empower > 0)) return;
    K.draw.bladeGlow(g, v, h, '#c9ccd6', 0.8 + 0.2 * Math.sin(t * 14), 6);
  },
});

BD.render.vfx.register({
  id: 'armor_shards',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k;
    for (let i = 0; i < 7; i++) {
      const an = ev.dir + (D.hash(ev.x * 7 + i, ev.y) - 0.5) * 2.2, sp = 0.5 + D.hash(i, ev.x) * 0.9;
      const d = sp * k * 1.4, z = 40 + 60 * k * (1 - k) * 2 - 30 * k * k;
      const c = v.proj(ev.x + Math.cos(an) * d, ev.y + Math.sin(an) * d, Math.max(4, z));
      const s = 6 + (i % 3) * 2.5, rot = k * 9 + i;
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

// 3단계 파편 폭발: steel plates thrown out in a ring
BD.render.vfx.register({
  id: 'armor_burst',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k;
    D.burst(g, v, ev.x, ev.y, ev.r, k, '#c9ccd6', 0.4);
    for (let i = 0; i < 10; i++) {
      const an = (i / 10) * Math.PI * 2 + 0.2, d = ev.r * (0.3 + 0.8 * k);
      const c = v.proj(ev.x + Math.cos(an) * d, ev.y + Math.sin(an) * d, 20 + 30 * k * (1 - k));
      g.save(); g.translate(c[0], c[1]); g.rotate(k * 7 + i); g.globalAlpha = a;
      D.path(g, [[-7, -3], [6, -5], [3, 5], [-5, 4]], true);
      g.fillStyle = i % 2 ? '#8b8f9e' : '#e6e8ef'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = K.INK; g.stroke();
      g.restore();
    }
  },
});

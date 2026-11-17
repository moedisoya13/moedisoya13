// 불의 순례 (quest: interaction) — GDD §5.4, GDD-V2 §4.4. Unlock: any quest card awakened once.
// Before: every Nth swing that hit something ignites every enemy that swing hit (the same burn as
// 화염 1단계, or 화염's own numbers when 화염 is equipped; swings that hit nothing do not count; echo,
// riposte and wave are not swings). Quest: 150 kills of burning enemies — whatever lit them.
// Awakened (permanent): every swing ignites what it hits; a burning enemy that dies bursts on every
// other enemy whose edge is within the radius and sets them alight; fire zones do not hurt the hero
// (`stats.mods.zoneImmune`, read by the engine's hurtHero).
// Levels (cumulative, ctx.lv):
//   1 before every 4th swing; after: burst 6 in 1.0u   2 before every 3rd swing
//   3 fire-zone immunity before awakening too; after: burst radius 1.3u   4 burst 10
//   (GDD-V2: 12 in 1.5u, 2.0u, 18 — tuned down, the awakened burst ignited whole packs; v2-cards.md §5)
//   5 after: the hero leaves a trail of fire where he walks (0.8u wide, 1.5 s, 5 every 0.5 s to
//     enemies only)
// Altar: offered while at least one floor remains above this one (GDD-V2 §4.4: no rule given;
// a horde floor holds hundreds of kills, see docs/requests/v2-cards.md).
// On screen: ember pips on the slot; on the lighting swing a burst of flame off the blade (vfx
// 'pilgrim_flare'); once awakened the blade burns all the time (decor 'pilgrim_blade'), burning
// deaths explode (vfx 'pilgrim_burst') and at level 5 the trail burns on the floor (zone 'pilgrim_trail').
// Slot: "37/150" + pips, then "각성".
const K = BD.cardKit;
const M = BD.math;
const T = { goal: 150, trailStep: 0.4, trailR: 0.4, trailLife: 1.5 };

// the burn this card lights: 화염's numbers when it is equipped (a lower direct burn would replace a
// stronger one, status.apply), else 화염 1단계's (the engine defaults)
function burnOpts(w) {
  const f = K.lvOf(w, 'flame');
  return f ? { direct: true, dmg: f.dmg, dur: f.dur, spread: f.spread } : { direct: true };
}

BD.cards.register({
  id: 'fire_pilgrimage', name: '불의 순례', family: 'quest', goal: T.goal, icon: 'fire_pilgrimage',
  unlock: (save) => save.counters.questAwakened >= 1, unlockText: '퀘스트 카드를 1회 각성',
  desc: '베기 4번째마다 맞은 적 점화(화염과 같은 화상). 퀘스트: 불탄 상태의 적 150 처치(불의 출처는 무엇이든). 각성: 모든 베기가 점화. 불탄 적이 죽으면 반경 1.0u 폭발 6 + 점화. 용사는 불 장판 피해를 받지 않는다.',
  T,
  levels: [null,
    // tuned (docs/requests/v2-cards.md §5): burst 12 → 6 and 1.5u → 1.0u, 3단계 2.0u → 1.3u, 4단계 18 → 10
    { text: '각성 전: 베기 4번째마다 점화. 퀘스트: 불탄 적 150 처치. 각성 후: 모든 베기 점화, 불탄 적이 죽으면 반경 1.0u 폭발 6 + 점화, 불 장판 면역', every: 4, r: 1.0, dmg: 6, immune: false, trail: 0 },
    { text: '각성 전 3번째마다', every: 3 },
    { text: '각성 전에도 불 장판 면역. 각성 후 폭발 반경 1.3u', immune: true, r: 1.3 },
    { text: '폭발 피해 10', dmg: 10 },
    { text: '각성 후 용사가 지나간 자리에 불길(폭 0.8u, 1.5초, 0.5초마다 5, 적만)', trail: 5 },
  ],
  offerable: (info) => K.floorsLeft(info) >= 1,
  init(ctx) { ctx.state.embers = 0; ctx.state.swingId = null; ctx.state.lit = false; ctx.state.walk = 0; },
  stats(ctx, s) { if (ctx.state.awakened || ctx.lv.immune) s.mods.zoneImmune = true; },
  onHit(ctx, e) {
    const sw = ctx.swing, st = ctx.state;
    if (!sw.isSwing) return;
    if (st.swingId !== sw.id) { // first hit of a new swing that hit something: count it
      st.swingId = sw.id;
      if (st.awakened) st.lit = true;
      else { st.embers++; st.lit = st.embers >= ctx.lv.every; if (st.lit) st.embers = 0; }
      if (st.lit && !st.awakened) K.vfx(ctx, 'pilgrim_flare', { x: K.r3(sw.x), y: K.r3(sw.y), aim: K.r3(sw.aim), reach: sw.reach, life: 0.45 });
    }
    if (st.lit) ctx.status(e, 'burn', burnOpts(ctx.w));
  },
  on: {
    kill(ev, ctx) {
      if (!ev.burning) return;
      const lv = ctx.lv;
      if (ctx.state.awakened) {
        const opts = burnOpts(ctx.w);
        K.burst(ctx, ev.x, ev.y, lv.r, lv.dmg, ev.enemyId, (e) => ctx.status(e, 'burn', opts));
        K.vfx(ctx, 'pilgrim_burst', { x: ev.x, y: ev.y, r: lv.r, life: 0.45 });
        return;
      }
      ctx.addProgress(1);
      K.vfx(ctx, 'quest_mote', { x: ev.x, y: ev.y, slot: ctx.card.slot, life: 0.7 });
      K.questToast(ctx);
    },
    // 5단계: a patch of fire every 0.4u walked (dashes included) while awakened
    tick(ev, ctx) {
      const st = ctx.state, lv = ctx.lv;
      if (!lv.trail || !st.awakened || ctx.hero.dead) { st.walk = 0; return; }
      st.walk += ev.moved;
      if (st.walk < T.trailStep) return;
      st.walk = 0;
      const h = ctx.hero;
      BD.hazards.zone(ctx.w, { kind: 'pilgrim_trail', x: K.r3(h.x), y: K.r3(h.y), r: T.trailR, life: T.trailLife, tick: 0.5, dmg: 0, enemyDmg: lv.trail, ownerKind: null });
    },
    quest_awaken(ev, ctx) { if (ev.cardId === ctx.card.id) ctx.toast('각성: ' + ctx.def.name); },
  },
  hud(state) {
    if (state.awakened) return { text: '각성', glow: true };
    return { text: state.progress + '/' + state.goal, pips: state.embers };
  },
});

BD.render.vfx.register({
  id: 'pilgrim_flare',
  draw(g, v, ev, k) {
    const a = 1 - k;
    for (let i = 0; i < 9; i++) {
      const an = ev.aim + (i - 4) * 0.2, d = ev.reach * (0.45 + 0.55 * Math.min(1, k * 2.5));
      const c = v.proj(ev.x + Math.cos(an) * d, ev.y + Math.sin(an) * d, 18);
      const L = (14 + (i % 3) * 6) * (1 - k * 0.5);
      K.draw.path(g, [[c[0] - 4, c[1]], [c[0], c[1] - L], [c[0] + 4, c[1]]], true);
      g.fillStyle = K.draw.rgba(i % 2 ? '#ffd24a' : '#ff5a2a', a); g.fill();
      g.lineWidth = 1.2; g.strokeStyle = 'rgba(10,10,12,' + a + ')'; g.stroke();
    }
  },
});

BD.render.vfx.register({
  id: 'pilgrim_burst',
  draw(g, v, ev, k) { K.draw.burst(g, v, ev.x, ev.y, ev.r, k, '#ff5a2a', 0.5); },
});

BD.render.decor.register({
  id: 'pilgrim_blade', target: 'hero_front',
  draw(g, v, h, w, box, t) {
    if (h.dead || !K.awakened(w, 'fire_pilgrimage')) return;
    const [p0, p1] = K.draw.bladePts(v, h);
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.5) / 5, x = p0[0] + (p1[0] - p0[0]) * u, y = p0[1] + (p1[1] - p0[1]) * u;
      const L = 9 + 5 * Math.sin(t * 22 + i * 1.9);
      K.draw.path(g, [[x - 3.5, y], [x + Math.sin(t * 9 + i) * 2, y - L], [x + 3.5, y]], true);
      g.fillStyle = i % 2 ? '#ffd24a' : '#ff5a2a'; g.fill();
      g.lineWidth = 1; g.strokeStyle = K.INK; g.stroke();
    }
  },
});

// 5단계 불길: low flames on a scorched patch, fading with the zone's life
BD.render.zones.register({
  id: 'pilgrim_trail',
  draw(g, v, z, w, t) {
    const a = Math.min(1, z.life / 0.5), D = K.draw;
    D.ellipse(g, v, z.x, z.y, z.r, D.rgba('#ff5a2a', 0.3 * a), 'rgba(10,10,12,' + 0.35 * a + ')', 1.5);
    for (let i = 0; i < 3; i++) {
      const an = (i / 3) * M.TAU + z.id, c = v.proj(z.x + Math.cos(an) * z.r * 0.45, z.y + Math.sin(an) * z.r * 0.45, 4);
      const L = (8 + 5 * Math.sin(t * 13 + i + z.id)) * a;
      D.path(g, [[c[0] - 3.5, c[1]], [c[0], c[1] - L], [c[0] + 3.5, c[1]]], true);
      g.fillStyle = D.rgba(i % 2 ? '#ffd24a' : '#ff5a2a', a); g.fill();
    }
  },
});

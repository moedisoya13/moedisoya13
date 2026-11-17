// 불의 순례 (quest: interaction) — GDD §5.4. Unlock: any quest card awakened once.
// Before: every 4th swing that hit something ignites every enemy that swing's blade hit (the
// same burn as 화염; swings that hit nothing do not count; echo, riposte and wave are not
// swings). Quest: 12 kills of burning enemies — whatever lit them (화염, the spread, a mage's
// fire zone).
// Awakened (permanent): every swing ignites what it hits; a burning enemy that dies bursts for
// 12 on every other enemy whose edge is within 1.5u and sets them alight; the hero takes no
// damage from fire zones (`stats.mods.zoneImmune`, read by the engine's hurtHero).
// Altar: offered while the floors above still hold ≥ 12 enemies (always true on 1F–3F).
// On screen: ember pips 0–3 on the slot; on the 4th swing a burst of flame off the blade (vfx
// 'pilgrim_flare'); once awakened the blade burns all the time (decor 'pilgrim_blade') and
// burning deaths explode (vfx 'pilgrim_burst'). Slot: "5/12" + pips, then "각성".
const K = BD.cardKit;
const M = BD.math;
const T = { goal: 12, every: 4, burstR: 1.5, burstDmg: 12 };

BD.cards.register({
  id: 'fire_pilgrimage', name: '불의 순례', family: 'quest', goal: T.goal, icon: 'fire_pilgrimage',
  unlock: (save) => save.counters.questAwakened >= 1,
  desc: '베기 4번째마다 맞은 적 점화(화염과 같은 화상). 퀘스트: 불타는 상태의 적 12 처치(불의 출처는 무엇이든). 각성: 모든 베기가 점화. 불타는 적이 죽으면 반경 1.5u 폭발 12 + 점화. 용사는 불 장판 피해를 받지 않는다.',
  T,
  offerable: (info) => info.byType.beast + info.byType.undead + info.byType.magic + info.byType.heavy >= T.goal,
  init(ctx) { ctx.state.embers = 0; ctx.state.swingId = null; ctx.state.lit = false; },
  stats(ctx, s) { if (ctx.state.awakened) s.mods.zoneImmune = true; },
  onHit(ctx, e) {
    const sw = ctx.swing, st = ctx.state;
    if (!sw.isSwing) return;
    if (st.swingId !== sw.id) { // first hit of a new swing that hit something: count it
      st.swingId = sw.id;
      if (st.awakened) st.lit = true;
      else { st.embers++; st.lit = st.embers >= T.every; if (st.lit) st.embers = 0; }
      if (st.lit && !st.awakened) K.vfx(ctx, 'pilgrim_flare', { x: K.r3(sw.x), y: K.r3(sw.y), aim: K.r3(sw.aim), reach: sw.reach, life: 0.45 });
    }
    if (st.lit) ctx.status(e, 'burn', { direct: true });
  },
  on: {
    kill(ev, ctx) {
      if (!ev.burning) return;
      if (ctx.state.awakened) {
        K.burst(ctx, ev.x, ev.y, T.burstR, T.burstDmg, ev.enemyId, (e) => ctx.status(e, 'burn', { direct: true }));
        K.vfx(ctx, 'pilgrim_burst', { x: ev.x, y: ev.y, r: T.burstR, life: 0.45 });
        return;
      }
      ctx.addProgress(1);
      K.vfx(ctx, 'quest_mote', { x: ev.x, y: ev.y, slot: ctx.card.slot, life: 0.7 });
      K.questToast(ctx);
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

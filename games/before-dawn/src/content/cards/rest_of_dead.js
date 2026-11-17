// 망자의 안식 (quest: collection) — GDD §5.4, §4, GDD-V2 §4.4.
// Before: extra damage to undead. Quest: undead kills (any source) while equipped.
// Awakened (permanent): extra damage to every enemy and more to undead (the undead bonus replaces
// the all-enemy one, it does not add — docs/requests/cards.md "Interpretations"); an undead kill
// bursts on every other enemy whose edge is within the radius; ghouls no longer rise (as 성광).
// Levels (cumulative, ctx.lv):
//   1 before +4 undead, quest 150; after +3 all / +10 undead, undead kill bursts 20 in 1.8u
//   2 before +6 undead, quest 120 (a card already past 120 awakens at once)
//   3 after: burst radius 2.4u   4 after: +5 all / +14 undead
//   5 after: every 8th kill of any type bursts as well (one burst per kill at most)
// Altar: offered only while a floor above this one (up to 5F) is an undead floor (GDD-V2 §4.4).
// On screen: before — a pale white glow on undead the blade hits (vfx 'rod_glow') and a gold mote
// flying from each counted kill to the slot (vfx 'quest_mote'); after — a white rim on every trail
// (the card trail drawers check it; vfx 'rod_rim' rims the engine-drawn base fan) and a white
// explosion where they die (vfx 'rod_burst'). Slot: "37/150", then "각성" (+ pips toward the 8th kill).
const K = BD.cardKit;
const T = { goal: 150 };

BD.cards.register({
  id: 'rest_of_dead', name: '망자의 안식', family: 'quest', goal: T.goal, unlock: 'base', icon: 'rest_of_dead',
  desc: '언데드에게 피해 +4. 퀘스트: 언데드 150 처치. 각성: 모든 적에게 +3, 언데드에게 +10. 언데드를 처치하면 반경 1.8u 폭발 20. 구울 부활 없음.',
  T,
  levels: [null,
    { text: '각성 전: 언데드 +4. 퀘스트: 언데드 150 처치. 각성 후: 모든 적 +3, 언데드 +10, 언데드 처치 시 반경 1.8u 폭발 20, 구울 부활 없음', goal: 150, before: 4, all: 3, undead: 10, r: 1.8, dmg: 20, every: 0 },
    { text: '각성 전 언데드 +6, 목표 120', before: 6, goal: 120 },
    { text: '각성 후 폭발 반경 2.4u', r: 2.4 },
    { text: '각성 후 모든 적 +5, 언데드 +14', all: 5, undead: 14 },
    { text: '각성 후 유형과 상관없이 처치 8번째마다 폭발', every: 8 },
  ],
  offerable: (info) => K.typesLeft(info).includes('undead'),
  init(ctx) { ctx.state.goal = ctx.lv.goal; ctx.state.kills = 0; },
  onLevel(ctx) {
    const st = ctx.state;
    st.goal = ctx.lv.goal;
    if (!st.awakened && st.progress >= st.goal) { st.progress = st.goal; ctx.awaken(); }
  },
  flat(ctx, e) {
    const a = ctx.state.awakened, lv = ctx.lv;
    if (e.type === 'undead') return a ? lv.undead : lv.before;
    return a ? lv.all : 0;
  },
  onHit(ctx, e) {
    if (e.type === 'undead' && !ctx.state.awakened) K.vfx(ctx, 'rod_glow', { x: K.r3(e.x), y: K.r3(e.y), life: 0.35 });
  },
  on: {
    kill(ev, ctx) {
      const st = ctx.state, lv = ctx.lv, undead = K.etype(ev) === 'undead';
      if (st.awakened) {
        let go = undead;
        if (lv.every) { st.kills++; if (st.kills >= lv.every) { st.kills = 0; go = true; } }
        if (!go) return;
        K.burst(ctx, ev.x, ev.y, lv.r, lv.dmg, ev.enemyId);
        K.vfx(ctx, 'rod_burst', { x: ev.x, y: ev.y, r: lv.r, life: 0.45 });
        return;
      }
      if (!undead) return;
      ctx.addProgress(1);
      K.vfx(ctx, 'quest_mote', { x: ev.x, y: ev.y, slot: ctx.card.slot, life: 0.7 });
      K.questToast(ctx);
    },
    hit(ev, ctx) {
      if (!ctx.state.awakened || K.etype(ev) !== 'undead') return;
      const e = BD.W.enemyById(ctx.w, ev.enemyId);
      if (e) e.flags.noRevive = true;
    },
    quest_awaken(ev, ctx) { if (ev.cardId === ctx.card.id) ctx.toast('각성: ' + ctx.def.name); },
    strike(ev, ctx) {
      if (!ctx.state.awakened) return;
      const shapes = ev.shapes.filter((s) => !s.card).map((s) => ({ kind: s.kind, x: s.x, y: s.y, dir: s.dir, r: s.r, half: s.half, len: s.len, width: s.width, r0: s.r0, r1: s.r1 }));
      if (shapes.length) K.vfx(ctx, 'rod_rim', { shapes, elements: ev.elements.slice(), life: 0.2 });
    },
  },
  hud(state, ctx) {
    if (!state.awakened) return { text: state.progress + '/' + state.goal, glow: false };
    const o = { text: '각성', glow: true };
    if (ctx && ctx.lv.every) o.pips = Math.floor(state.kills / 2);
    return o;
  },
});

BD.render.vfx.register({
  id: 'rod_glow',
  draw(g, v, ev, k) {
    const c = v.proj(ev.x, ev.y, 34), r = 16 + 14 * k;
    const gr = g.createRadialGradient(c[0], c[1], 1, c[0], c[1], r);
    gr.addColorStop(0, 'rgba(255,255,255,' + 0.7 * (1 - k) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(c[0], c[1], r, 0, Math.PI * 2); g.fill();
  },
});
BD.render.vfx.register({
  id: 'rod_rim',
  draw(g, v, ev, k) { for (const s of ev.shapes) K.draw.shapeTrail(g, v, s, k, ev.elements, { rim: true }); },
});
BD.render.vfx.register({
  id: 'rod_burst',
  draw(g, v, ev, k) { K.draw.burst(g, v, ev.x, ev.y, ev.r, k, '#ffffff', 0.5); },
});
// gold mote from the kill to the quest card's slot (shared by the three quest cards)
BD.render.vfx.register({
  id: 'quest_mote',
  draw(g, v, ev, k) {
    const a = v.proj(ev.x, ev.y, 30), b = K.slotCenter(ev.slot), u = k * k * (3 - 2 * k);
    const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 60;
    for (let i = 0; i < 4; i++) {
      const uu = Math.max(0, u - i * 0.04), xx = a[0] + (b[0] - a[0]) * uu, yy = a[1] + (b[1] - a[1]) * uu - Math.sin(uu * Math.PI) * 60;
      g.beginPath(); g.arc(xx, yy, 5 - i, 0, Math.PI * 2); g.fillStyle = 'rgba(255,210,74,' + (0.9 - i * 0.2) + ')'; g.fill();
    }
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fillStyle = K.GOLD; g.fill();
    g.lineWidth = 2; g.strokeStyle = K.INK; g.stroke();
  },
});

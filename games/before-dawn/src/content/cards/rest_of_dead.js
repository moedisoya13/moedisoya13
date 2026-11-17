// 망자의 안식 (quest: collection) — GDD §5.4, §4.
// Before: +4 damage to undead. Quest: 12 undead kills (any source) while equipped.
// Awakened (permanent): +3 to every enemy and +10 to undead (the undead bonus replaces the +3,
// it is not +13 — see docs/requests/cards.md "Interpretations"). An undead kill bursts for 20
// on every other enemy whose edge is within 1.8u. Ghouls no longer rise (as 성광).
// Altar: offered only when the floors after this one still hold ≥ 12 undead (§5.6 ①).
// On screen: before — a pale white glow on undead the blade hits (vfx 'rod_glow') and a gold
// mote flying from each counted kill to the slot (vfx 'quest_mote'); after — a white rim on
// every trail (the card trail drawers check it; vfx 'rod_rim' rims the engine-drawn base fan)
// and a white explosion where undead die (vfx 'rod_burst'). Slot: "7/12", then "각성".
const K = BD.cardKit;
const T = { goal: 12, flat: 4, awakeAll: 3, awakeUndead: 10, burstR: 1.8, burstDmg: 20 };

BD.cards.register({
  id: 'rest_of_dead', name: '망자의 안식', family: 'quest', goal: T.goal, unlock: 'base', icon: 'rest_of_dead',
  desc: '언데드에게 피해 +4. 퀘스트: 언데드 12 처치. 각성: 모든 적에게 +3, 언데드에게 +10. 언데드를 처치하면 반경 1.8u 폭발 20. 구울 부활 없음.',
  T,
  offerable: (info) => info.byType.undead >= T.goal,
  flat(ctx, e) {
    const a = ctx.state.awakened;
    if (e.type === 'undead') return a ? T.awakeUndead : T.flat;
    return a ? T.awakeAll : 0;
  },
  onHit(ctx, e) {
    if (e.type === 'undead' && !ctx.state.awakened) K.vfx(ctx, 'rod_glow', { x: K.r3(e.x), y: K.r3(e.y), life: 0.35 });
  },
  on: {
    kill(ev, ctx) {
      if (K.etype(ev) !== 'undead') return;
      if (ctx.state.awakened) {
        K.burst(ctx, ev.x, ev.y, T.burstR, T.burstDmg, ev.enemyId);
        K.vfx(ctx, 'rod_burst', { x: ev.x, y: ev.y, r: T.burstR, life: 0.45 });
        return;
      }
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
  hud(state) { return { text: state.awakened ? '각성' : state.progress + '/' + state.goal, glow: !!state.awakened }; },
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

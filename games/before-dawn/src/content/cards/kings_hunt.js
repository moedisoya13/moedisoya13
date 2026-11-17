// 왕의 사냥 (quest: challenge) — GDD §5.4, §4.
// Before: +3 damage to guardians, elites and the demon king. Quest: kill 3 floor guardians
// while equipped (`guardian_kill`; the rooftop boss is not a floor guardian).
// Awakened (permanent): ×1.6 instead of +3 against the same targets; a guardian kill heals
// the hero fully, an elite kill heals 15 (heal source 'kings_hunt').
// Altar: offered only while ≥ 3 guardians remain above (floors 1–2, §5.6 ①).
// On screen: a gold target sigil over every guardian / elite / the boss while equipped, a gold
// crown once awakened (decor 'kings_hunt_mark'); a gold "+N" when it heals (vfx 'royal_heal');
// a gold mote to the slot for each counted guardian. Slot: "1/3", then "각성".
const K = BD.cardKit;
const M = BD.math;
const T = { goal: 3, flat: 3, mult: 1.6, eliteHeal: 15 };
const royal = (e) => !!(e.guardian || e.elite || e.boss);

function heal(ctx, amount) {
  const got = ctx.heal(amount, 'kings_hunt');
  if (got > 0) { ctx.credit(got); K.vfx(ctx, 'royal_heal', { amount: got, life: 1.0 }); }
}

BD.cards.register({
  id: 'kings_hunt', name: '왕의 사냥', family: 'quest', goal: T.goal, unlock: 'base', icon: 'kings_hunt',
  desc: '수호자·정예·마왕에게 피해 +3. 퀘스트: 층 수호자 3 처치. 각성: 수호자·정예·마왕에게 피해 ×1.6. 수호자를 처치하면 HP 전부 회복, 정예는 HP +15.',
  T,
  offerable: (info) => info.guardians >= T.goal,
  flat(ctx, e) { return !ctx.state.awakened && royal(e) ? T.flat : 0; },
  mult(ctx, e) { return ctx.state.awakened && royal(e) ? T.mult : 1; },
  on: {
    guardian_kill(ev, ctx) {
      if (ctx.state.awakened) return;
      const st = ctx.state, h = ctx.w.hero;
      ctx.addProgress(1);
      K.vfx(ctx, 'quest_mote', { x: st.gx !== undefined ? st.gx : K.r3(h.x), y: st.gy !== undefined ? st.gy : K.r3(h.y), slot: ctx.card.slot, life: 0.7 });
      K.questToast(ctx);
    },
    kill(ev, ctx) {
      if (ev.guardian) { ctx.state.gx = ev.x; ctx.state.gy = ev.y; } // guardian_kill follows this event
      if (!ctx.state.awakened) return;
      if (ev.guardian) heal(ctx, ctx.hero.maxHp);
      else if (ev.elite) heal(ctx, T.eliteHeal);
    },
    quest_awaken(ev, ctx) { if (ev.cardId === ctx.card.id) ctx.toast('각성: ' + ctx.def.name); },
  },
  hud(state) { return { text: state.awakened ? '각성' : state.progress + '/' + state.goal, glow: !!state.awakened }; },
});

BD.render.decor.register({
  id: 'kings_hunt_mark', target: 'enemy',
  draw(g, v, e, w, box, t) {
    if (!royal(e) || e.down) return;
    const c = BD.cardRt.get(w, 'kings_hunt');
    if (!c) return;
    const x = box.x, y = box.top - (e.guardian ? 40 : 22) + Math.sin(t * 3 + e.id) * 2;
    g.save(); g.translate(x, y);
    g.lineWidth = 2;
    if (c.state.awakened) {
      K.draw.path(g, [[-11, 5], [-11, -6], [-5, -1], [0, -10], [5, -1], [11, -6], [11, 5]], true);
      g.fillStyle = K.GOLD; g.fill(); g.lineWidth = 2.5; g.strokeStyle = K.INK; g.stroke();
      g.fillStyle = '#e0392f'; g.beginPath(); g.arc(0, 1, 2.2, 0, M.TAU); g.fill();
    } else {
      const r = 9 + Math.sin(t * 6) * 0.8;
      g.beginPath(); g.arc(0, 0, r, 0, M.TAU); g.strokeStyle = K.INK; g.lineWidth = 5; g.stroke();
      g.strokeStyle = K.GOLD; g.lineWidth = 2.5; g.stroke();
      g.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(dx * (r - 4), dy * (r - 4)); g.lineTo(dx * (r + 5), dy * (r + 5)); }
      g.strokeStyle = K.INK; g.lineWidth = 4.5; g.stroke(); g.strokeStyle = K.GOLD; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(0, 0, 2.2, 0, M.TAU); g.fillStyle = K.GOLD; g.fill();
    }
    g.restore();
  },
});

BD.render.vfx.register({
  id: 'royal_heal',
  draw(g, v, ev, k, w) {
    const h = w.hero, c = v.proj(h.x, h.y, 108 + 28 * k);
    K.draw.text(g, '+' + ev.amount, c[0] - 18, c[1], 24, K.GOLD, 1 - k * k);
  },
});

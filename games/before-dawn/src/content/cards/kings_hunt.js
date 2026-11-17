// 왕의 사냥 (quest: challenge) — GDD §5.4, §4, GDD-V2 §4.4.
// Targets: elites, guardians and the demon king. Before: extra damage to them. Quest: 5 kills of
// elites or floor guardians while equipped (the demon king is not one).
// Awakened (permanent): × instead of + against the same targets; a guardian kill heals the hero
// fully, an elite kill heals 15 (heal source 'kings_hunt').
// Levels (cumulative, ctx.lv):
//   1 before +3; after ×1.6   2 before +6   3 a target kill drops one more big shard (25)
//   4 after ×1.9   5 the first blow on each target is ×3 (once per target)
// Altar: offered only while two or more floors remain above this one (GDD-V2 §4.4 "남은 층 ≥ 2").
// On screen: a gold target sigil over every target while equipped, a gold crown once awakened
// (decor 'kings_hunt_mark', a white flash around it while the ×3 first blow is still unspent); a
// gold "+N" when it heals (vfx 'royal_heal'); a gold mote to the slot for each counted kill; a gold
// spear-flash on the ×3 blow (vfx 'royal_first'). Slot: "1/5", then "각성".
const K = BD.cardKit;
const M = BD.math;
const T = { goal: 5, eliteHeal: 15, shard: 25, first: 3 };
const royal = (e) => !!(e.guardian || e.elite || e.boss);

function heal(ctx, amount) {
  const got = ctx.heal(amount, 'kings_hunt');
  if (got > 0) { ctx.credit(got); K.vfx(ctx, 'royal_heal', { amount: got, life: 1.0 }); }
}

BD.cards.register({
  id: 'kings_hunt', name: '왕의 사냥', family: 'quest', goal: T.goal, unlock: 'base', icon: 'kings_hunt',
  desc: '정예·수호자·마왕에게 피해 +3. 퀘스트: 정예·수호자 5 처치. 각성: 정예·수호자·마왕에게 피해 ×1.6. 수호자를 처치하면 HP 전부 회복, 정예는 HP +15.',
  T,
  levels: [null,
    { text: '각성 전: 정예·수호자·마왕 +3. 퀘스트: 정예·수호자 5 처치. 각성 후: × 1.6, 수호자 처치 시 HP 전부, 정예 처치 시 HP +15', flat: 3, mult: 1.6, shard: 0, first: 0 },
    { text: '각성 전 +6', flat: 6 },
    { text: '대상을 처치하면 큰 빛 조각(25) 하나를 더 떨군다', shard: T.shard },
    { text: '각성 후 × 1.9', mult: 1.9 },
    { text: '대상에게 넣는 첫 일격이 × 3(대상마다 한 번)', first: T.first },
  ],
  offerable: (info) => K.floorsLeft(info) >= 2,
  flat(ctx, e) { return !ctx.state.awakened && royal(e) ? ctx.lv.flat : 0; },
  mult(ctx, e) {
    if (!royal(e)) return 1;
    let m = ctx.state.awakened ? ctx.lv.mult : 1;
    if (ctx.lv.first && !e.flags.royalStruck) m *= ctx.lv.first;
    return m;
  },
  onHit(ctx, e) {
    if (!ctx.lv.first || !royal(e) || e.flags.royalStruck) return;
    e.flags.royalStruck = true;
    K.vfx(ctx, 'royal_first', { x: K.r3(e.x), y: K.r3(e.y), life: 0.5 });
  },
  on: {
    kill(ev, ctx) {
      const st = ctx.state;
      if (!(ev.guardian || ev.elite || ev.boss)) return;
      if (ctx.lv.shard && !ev.boss) BD.growth.drop(ctx.w, ev.x, ev.y, ctx.lv.shard);
      if (st.awakened) {
        if (ev.guardian) heal(ctx, ctx.hero.maxHp);
        else if (ev.elite) heal(ctx, T.eliteHeal);
        return;
      }
      if (ev.boss) return;
      ctx.addProgress(1);
      K.vfx(ctx, 'quest_mote', { x: ev.x, y: ev.y, slot: ctx.card.slot, life: 0.7 });
      K.questToast(ctx);
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
    if (BD.cardRt.lv(c.def, c.level || 1).first && !e.flags.royalStruck) { // the ×3 first blow waits
      g.beginPath(); g.arc(0, 0, 15 + 2 * Math.sin(t * 9), 0, M.TAU); g.strokeStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(t * 9)) + ')'; g.lineWidth = 2.5; g.stroke();
    }
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

// 5단계: the ×3 first blow — a gold star burst on the target and "×3"
BD.render.vfx.register({
  id: 'royal_first',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k, c = v.proj(ev.x, ev.y, 50);
    g.save(); g.translate(c[0], c[1]); g.globalAlpha = a;
    const s = 18 + 26 * k;
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * M.TAU + 0.2, L = i % 2 ? s * 0.55 : s;
      D.path(g, [[Math.cos(an + 0.2) * 5, Math.sin(an + 0.2) * 5], [Math.cos(an) * L, Math.sin(an) * L], [Math.cos(an - 0.2) * 5, Math.sin(an - 0.2) * 5]], true);
      g.fillStyle = i % 2 ? '#ffffff' : K.GOLD; g.fill(); g.lineWidth = 1.5; g.strokeStyle = K.INK; g.stroke();
    }
    g.restore();
    D.text(g, '×3', c[0], c[1] - 30 - 20 * k, 26, K.GOLD, a);
  },
});

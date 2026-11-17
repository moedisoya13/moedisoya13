// 무결 (combo: evasion) — GDD §5.5. +1 per kill while unhurt (a hurt resets to 0, so every
// kill counts). Max 6. Reset only by `hurt` (an enemy attack or zone that lands); the dawn
// drain (`drain`) does not break it. Taking the card out resets with `swap`.
// Stages: ≥ 2 swing interval ×0.85 (0.51 s) · ≥ 4 blade +0.4u · 6 echo: 0.2 s after each
// swing the same placed shapes strike again at half factor (source 'echo'); the echo emits no
// swing / swing_end (other combos ignore it) and carries the swing's primary for 뇌전.
// On screen: a stage label over the head when a stage is reached ("간격↑", "칼 길이↑", "잔영"),
// the echo as a pale afterimage of the swing (trail 'flawless'), the ×6 afterglow, the break
// toast "무결 깨짐: 구울의 달려들기". Slot: "×N" + the current stage as badge.
const K = BD.cardKit;
const T = { interval: 0.85, reach: 0.4, echoDelay: 0.2, echoScale: 0.5 };
const STAGES = [[2, '간격↑'], [4, '칼 길이↑'], [6, '잔영']];
const badge = (n) => { let b; for (const [at, text] of STAGES) if (n >= at) b = text; return b; };

BD.cards.register({
  id: 'flawless', name: '무결', family: 'combo', maxStack: 6, unlock: 'base', icon: 'flawless',
  desc: '피격 없이 적 처치 +1(최대 6). 피격하면 끊긴다(여명 침식은 깨지 않음). 2 이상: 베기 간격 −15% · 4 이상: 칼 길이 +0.4u · 6: 잔영(베기 0.2초 뒤 같은 모양을 배율 0.5로 한 번 더).',
  T,
  stats(ctx, s) {
    const n = ctx.state.stack;
    if (n >= 2) s.interval *= T.interval;
    if (n >= 4) s.reach += T.reach;
  },
  afterSwing(ctx) {
    if (ctx.state.stack < ctx.def.maxStack) return;
    const sw = ctx.swing, card = ctx.card, floor = ctx.w.floorN;
    const shapes = sw.shapes.map((s) => Object.assign({}, s, { source: 'echo', card: 'flawless', trail: { of: s.card || s.kind } }));
    ctx.after(T.echoDelay, (w) => {
      if (w.cards[card.slot] !== card || card.state.stack < card.def.maxStack || w.hero.dead || w.floorN !== floor) return;
      BD.combat.strike(w, { x: sw.x, y: sw.y, aim: sw.aim, primaryId: sw.primaryId, shapes, factorScale: T.echoScale, source: 'echo' });
    });
  },
  on: {
    kill(ev, ctx) {
      const from = ctx.state.stack;
      ctx.setStack(from + 1, 'gain');
      const to = ctx.state.stack;
      for (const [at, text] of STAGES) if (from < at && to >= at) K.label(ctx, text);
      if (from < ctx.def.maxStack && to === ctx.def.maxStack) ctx.toast(ctx.def.name + ' ×' + ctx.def.maxStack);
    },
    hurt(ev, ctx) {
      if (ctx.state.stack <= 0) return;
      ctx.setStack(0, 'hurt');
      ctx.toast('무결 깨짐: ' + K.attackName(ctx.w, ev));
    },
  },
  hud(state) { return { text: '×' + state.stack, badge: badge(state.stack) }; },
});

// The echo: a pale, slightly lagging copy of the swing's shapes (pierce keeps its thrust look).
BD.render.trails.register({
  id: 'flawless',
  draw(g, v, s, k, tr, w) {
    const of = s.trail && s.trail.of;
    const o = { core: '#f1e6ff', highlight: '#ffffff', rim: K.draw.rim(w), alpha: 0.75 };
    if (of === 'pierce' || of === 'one_flash') K.draw.thrust(g, v, s, k, tr.elements, w, o);
    else K.draw.shapeTrail(g, v, s, k, tr.elements, o);
  },
});

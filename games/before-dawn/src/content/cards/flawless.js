// 무결 (combo: evasion) — GDD §5.5, GDD-V2 §4.4. +1 stack for every N kills while unhurt (a hurt
// resets the stack and the count to 0). Reset only by `hurt` (an enemy attack or zone that lands);
// the dawn drain (`drain`) does not break it. Taking the card out resets with `swap`.
// Stages: ≥ 2 swing interval ×0.85 · ≥ 4 blade longer · 6 echo: 0.2 s after each swing the same
// placed shapes strike again at a lower factor (source 'echo'); the echo emits no swing / swing_end
// (other combos ignore it) and carries the swing's primary for 뇌전.
// Levels (cumulative, ctx.lv):
//   1 +1 per 25 kills, max 6; ≥ 4 blade +0.4u; echo ×0.5   2 +1 per 20 kills
//   3 at the top stack one blow is blocked: no damage, the stack goes to 0 (engine def.blockHurt)
//   4 echo ×0.75, ≥ 4 blade +0.6u   5 max 8; at 8 the echo comes twice (0.2 s and 0.4 s)
// On screen: a stage label over the head when a stage is reached ("간격↑", "칼 길이↑", "잔영",
// "잔영×2"), the echo as a pale afterimage of the swing (trail 'flawless'), the max-stack afterglow,
// at level 3 a pale shield shell round the hero while the block is ready (decor 'flawless_shell')
// and a shattering shell when it takes a blow (vfx 'flawless_block'), the break toast
// "무결 깨짐: 구울의 달려들기". Slot: "×N" + the current stage as badge, ring = kills toward the next.
const K = BD.cardKit;
const T = { interval: 0.85, echoDelay: 0.2, echoAt: 6, twiceAt: 8 };
const STAGES = [[2, '간격↑'], [4, '칼 길이↑'], [6, '잔영'], [8, '잔영×2']];
const badge = (n) => { let b; for (const [at, text] of STAGES) if (n >= at) b = text; return b; };
const lvOfCard = (c) => BD.cardRt.lv(c.def, c.level || 1);

function echo(w, card, sw, delay, scale) {
  const shapes = sw.shapes.map((s) => Object.assign({}, s, { source: 'echo', card: 'flawless', trail: { of: s.card || s.kind } }));
  const floor = w.floorN;
  BD.W.after(w, delay, (w2) => {
    if (w2.cards[card.slot] !== card || card.state.stack < T.echoAt || w2.hero.dead || w2.floorN !== floor) return;
    BD.combat.strike(w2, { x: sw.x, y: sw.y, aim: sw.aim, primaryId: sw.primaryId, shapes, factorScale: scale, source: 'echo' });
  });
}

BD.cards.register({
  id: 'flawless', name: '무결', family: 'combo', maxStack: 6, unlock: 'base', icon: 'flawless',
  desc: '피격 없이 처치 25회마다 +1(최대 6). 피격하면 끊긴다(여명 침식은 깨지 않음). 2 이상: 베기 간격 −15% · 4 이상: 칼 길이 +0.4u · 6: 잔영(베기 0.2초 뒤 같은 모양을 배율 0.5로 한 번 더).',
  T,
  levels: [null,
    { text: '피격 없이 처치 25마다 +1(최대 6). 피격 시 0. 2 이상 베기 간격 −15%, 4 이상 칼 길이 +0.4u, 6 잔영(배율 0.5)', per: 25, reach: 0.4, echo: 0.5, block: false },
    { text: '처치 20마다', per: 20 },
    { text: '최대 스택일 때 피격 한 번을 막는다(피해 없음, 스택은 0)', block: true },
    { text: '잔영 배율 0.75, 4 이상 칼 길이 +0.6u', echo: 0.75, reach: 0.6 },
    { text: '최대 8. 8에서 잔영이 두 번', maxStack: 8 },
  ],
  init(ctx) { ctx.state.kills = 0; },
  stats(ctx, s) {
    const n = ctx.state.stack;
    if (n >= 2) s.interval *= T.interval;
    if (n >= 4) s.reach += ctx.lv.reach;
  },
  afterSwing(ctx) {
    const n = ctx.state.stack;
    if (n < T.echoAt) return;
    echo(ctx.w, ctx.card, ctx.swing, T.echoDelay, ctx.lv.echo);
    if (n >= T.twiceAt) echo(ctx.w, ctx.card, ctx.swing, 2 * T.echoDelay, ctx.lv.echo);
  },
  // 3단계: at the top stack the blow lands on the shell (engine: no damage, the usual invulnerability)
  blockHurt(ctx, dmg, info) {
    const max = BD.cardRt.maxStack(ctx.card);
    if (!ctx.lv.block || ctx.state.stack < max) return false;
    ctx.state.kills = 0;
    ctx.setStack(0, 'hurt');
    ctx.toast('무결: 한 번을 막았다');
    K.vfx(ctx, 'flawless_block', { x: K.r3(ctx.hero.x), y: K.r3(ctx.hero.y), life: 0.5 });
    return true;
  },
  on: {
    kill(ev, ctx) {
      const st = ctx.state, max = BD.cardRt.maxStack(ctx.card);
      if (st.stack >= max) return;
      if (++st.kills < ctx.lv.per) return;
      st.kills = 0;
      const from = st.stack;
      ctx.setStack(from + 1, 'gain');
      const to = st.stack;
      for (const [at, text] of STAGES) if (from < at && to >= at && at <= max) K.label(ctx, text);
      if (from < max && to === max) ctx.toast(ctx.def.name + ' ×' + max);
    },
    hurt(ev, ctx) {
      ctx.state.kills = 0;
      if (ctx.state.stack <= 0) return;
      ctx.setStack(0, 'hurt');
      ctx.toast('무결 깨짐: ' + K.attackName(ctx.w, ev));
    },
  },
  hud(state, ctx) {
    const o = { text: '×' + state.stack, badge: badge(state.stack) };
    if (ctx) o.ring = Math.min(1, state.kills / ctx.lv.per);
    return o;
  },
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

// 3단계: the shell that takes one blow, round the hero while it is ready
BD.render.decor.register({
  id: 'flawless_shell', target: 'hero_front',
  draw(g, v, h, w, box, t) {
    const c = BD.cardRt.get(w, 'flawless');
    if (!c || h.dead || !lvOfCard(c).block || c.state.stack < BD.cardRt.maxStack(c)) return;
    const a = 0.55 + 0.2 * Math.sin(t * 4);
    const hgt = box.y - box.top, cx = box.x, cy = box.top + hgt * 0.52, rx = hgt * 0.46, ry = hgt * 0.6; // the hero's box has no width
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(231,210,255,' + 0.12 * a + ')'; g.fill();
    g.lineWidth = 6; g.strokeStyle = 'rgba(10,10,12,' + 0.5 * a + ')'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgba(231,210,255,' + a + ')'; g.stroke();
    g.beginPath(); g.ellipse(cx - rx * 0.3, cy - ry * 0.45, rx * 0.35, ry * 0.18, -0.5, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,' + 0.35 * a + ')'; g.fill();
    g.restore();
  },
});

BD.render.vfx.register({
  id: 'flawless_block',
  draw(g, v, ev, k, w) {
    const D = K.draw, a = 1 - k, h = w.hero, c = v.proj(h.x, h.y, 48);
    g.save(); g.translate(c[0], c[1]); g.globalAlpha = a;
    for (let i = 0; i < 9; i++) {
      const an = (i / 9) * Math.PI * 2 + 0.3, d = 30 + 40 * k;
      g.save(); g.translate(Math.cos(an) * d, Math.sin(an) * d * 0.7); g.rotate(an + k * 5);
      D.path(g, [[-8, -4], [7, -6], [4, 6], [-6, 4]], true);
      g.fillStyle = i % 2 ? '#e7d2ff' : '#ffffff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = K.INK; g.stroke();
      g.restore();
    }
    g.restore();
    D.text(g, '막았다', c[0], c[1] - 60 - 16 * k, 22, '#e7d2ff', a);
  },
});

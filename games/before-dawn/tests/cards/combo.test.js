// GDD §5.5 combo cards: 연참, 무결, 일섬 — what raises the stack, the one reset reason each
// (plus `swap`), stage effects and their numbers, toasts.
const { world, place, evs, hitsOn, swingOnce, until } = require('./_kit');

const kill = (BD, w) => { const e = place(BD, w, 'goblin', 3, 3); BD.combat.kill(w, e); };
const killN = (BD, w, n) => { for (let i = 0; i < n; i++) kill(BD, w); };
const reasons = (w, id) => w.bus.recent(4000).filter((x) => x.event === 'combo_change' && x.cardId === id).map((x) => [x.from, x.to, x.reason]);

module.exports = {
  // GDD-V2 §4.4 level 1 (v1: +1 per kill to 5, +2 per stack, 4 s without a direct hit)
  'chain_slash: +1 per 10 kills (any source) to 10; +1 swing damage per stack; toast at ×10'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash'] });
    const c = BD.cardRt.get(w, 'chain_slash');
    for (let i = 0; i < 9; i++) kill(BD, w);
    t.eq(c.state.stack, 0, 'nine kills: nothing yet');
    for (let i = 0; i < 101; i++) kill(BD, w);
    t.eq(c.state.stack, 10);
    t.eq(reasons(w, 'chain_slash').map((x) => x[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    t.assert(evs(w, 'toast').some((x) => x.text === '연참 ×10'));
    const e = place(BD, w, 'goblin', 1.2, 0, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(hitsOn(w, e).map((x) => x.dmg), [20]);
  },
  'chain_slash: kills refill the 2.0 s timer, hits do not; timeout resets with a toast'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash'] });
    const c = BD.cardRt.get(w, 'chain_slash');
    for (let i = 0; i < 10; i++) kill(BD, w);
    const far = place(BD, w, 'goblin', 4, 4, { hp: 999 });
    H.step(60);
    t.near(c.state.timer, 1.0, 1e-6);
    BD.combat.damage(w, far, 1, { source: 'dash', direct: true });
    t.near(c.state.timer, 1.0, 1e-6, 'a direct hit does not refill');
    kill(BD, w);
    t.eq(c.state.timer, 2.0);
    H.step(119);
    t.eq(c.state.stack, 1);
    H.step(2);
    t.eq(c.state.stack, 0);
    t.eq(reasons(w, 'chain_slash').slice(-1)[0], [1, 0, 'timeout']);
    t.assert(evs(w, 'toast').some((x) => x.text === '연참 끊김: 2초 동안 처치가 없었다'));
  },
  'chain_slash: the timer stands still while no enemy is on the screen'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash'] });
    const c = BD.cardRt.get(w, 'chain_slash');
    for (let i = 0; i < 10; i++) kill(BD, w);
    H.step(600);
    t.eq([c.state.stack, c.state.timer], [1, 2.0]);
    BD.W.spawnAt(w, 'goblin', w.hero.x + 3, w.hero.y + 3, {}); // still a rift: not on the floor yet
    H.step(30);
    t.eq(c.state.timer, 2.0);
    const off = place(BD, w, 'goblin', -20, -20, { hp: 999 }); // on the floor, off the screen
    t.assert(!BD.W.onScreen(w, off.x, off.y));
    w.rifts = [];
    H.step(30);
    t.eq(c.state.timer, 2.0);
  },
  // GDD-V2 §4.4 level 1 (v1: +1 per kill to 6)
  'flawless: +1 per 25 unhurt kills to 6; ≥ 2 interval 0.51 s, ≥ 4 blade +0.4u; labels; toast at ×6'(t) {
    const { BD, H, w } = world(t, { hand: ['flawless'] });
    const c = BD.cardRt.get(w, 'flawless'), st = () => BD.hero.computeStats(w);
    t.eq([st().interval, st().reach], [0.6, 1.9]);
    killN(BD, w, 24); t.eq(c.state.stack, 0, '24 kills: nothing yet');
    killN(BD, w, 26);
    t.near(st().interval, 0.51, 1e-9); t.eq(st().reach, 1.9);
    killN(BD, w, 50);
    t.near(st().reach, 2.3, 1e-9);
    killN(BD, w, 75);
    t.eq(c.state.stack, 6);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'combo_label').map((x) => x.text), ['간격↑', '칼 길이↑', '잔영']);
    t.assert(evs(w, 'toast').some((x) => x.text === '무결 ×6'));
    t.eq(c.def.hud(c.state, BD.cardRt.ctx(w, c)), { text: '×6', badge: '잔영', ring: 0 });
  },
  'flawless ×6: an echo 0.2 s after each swing, same shapes at half factor, no swing events'(t) {
    const { BD, H, w } = world(t, { hand: ['flawless', 'whirl'] });
    BD.cardRt.get(w, 'flawless').state.stack = 6;
    const front = place(BD, w, 'goblin', 1.2, 0, { hp: 999 }), back = place(BD, w, 'goblin', -1.3, 0, { hp: 999 });
    swingOnce(BD, H, w);
    const swings = w.bus.counts().swing, ends = w.bus.counts().swing_end;
    H.step(11);
    t.eq(hitsOn(w, front, 'echo').length, 0, 'not before 0.2 s');
    H.step(2);
    t.eq(hitsOn(w, front, 'echo').map((x) => [x.dmg, x.direct]), [[5, true]]);
    t.eq(hitsOn(w, back, 'echo').map((x) => x.dmg), [Math.round(10 * 0.7 * 0.5)]);
    t.eq([w.bus.counts().swing, w.bus.counts().swing_end], [swings, ends]);
  },
  'flawless: only a landed hurt resets it (reason hurt, toast names the attack); the dawn drain does not'(t) {
    const { BD, H, w } = world(t, { hand: ['flawless'] });
    const c = BD.cardRt.get(w, 'flawless');
    killN(BD, w, 75);
    w.t = w.mods.runSec + 0.5;
    H.step(150);
    t.assert(evs(w, 'drain').length >= 2, 'drained');
    t.eq(c.state.stack, 3);
    w.hero.dashInvuln = 0.25;
    BD.W.hurtHero(w, 6, { source: 'goblin', attack: 'stab', enemyId: null, attackId: 'a' });
    t.eq(c.state.stack, 3, 'a dodged attack is not a hurt');
    w.hero.dashInvuln = 0;
    BD.W.hurtHero(w, 6, { source: 'goblin', attack: 'stab', enemyId: null, attackId: 'b' });
    t.eq(c.state.stack, 0);
    t.eq(reasons(w, 'flawless').slice(-1)[0], [3, 0, 'hurt']);
    t.assert(evs(w, 'toast').some((x) => x.text === '무결 깨짐: 고블린의 찌르기'));
  },
  'one_flash: unlock after any combo maxed; tip zone +1, inside 0.7u resets (too_close), between and beyond reach nothing'(t) {
    const { BD, H, w } = world(t, { hand: ['one_flash', 'sword_wave'] });
    const d = BD.cards.get('one_flash'), s = BD.progress.fresh();
    t.eq(d.unlock(s), false); s.counters.comboMaxed = 1; t.eq(d.unlock(s), true);
    const c = BD.cardRt.get(w, 'one_flash');
    const e = place(BD, w, 'goblin', 1.85, 0, { hp: 999 });     // edge 1.5 ∈ [1.2, 1.9]
    swingOnce(BD, H, w); swingOnce(BD, H, w);
    t.eq(c.state.stack, 2);
    t.eq(hitsOn(w, e).map((x) => x.dmg), [11, 12], '+1 per stack, raised at ① of the same swing');
    e.x = w.hero.x + 1.35; swingOnce(BD, H, w);               // edge 1.0: between
    t.eq(c.state.stack, 2);
    e.x = w.hero.x + 4.5; swingOnce(BD, H, w);                // a wave target beyond the blade
    t.eq(c.state.stack, 2);
    e.x = w.hero.x + 0.95; swingOnce(BD, H, w);               // edge 0.6 < 0.7
    t.eq(c.state.stack, 0);
    t.eq(reasons(w, 'one_flash').map((x) => x[2]), ['gain', 'gain', 'too_close']);
    t.assert(evs(w, 'toast').some((x) => x.text === '일섬 흐트러짐: 품을 내줬다'));
  },
  'one_flash ≥ 4 adds a 4.2 × 0.9 pierce line (none if 관통 is equipped); at 8 the line is 6.0 × 1.4'(t) {
    const { BD, H, w } = world(t, { hand: ['one_flash'] });
    w.hero.x = 1.5;
    const c = BD.cardRt.get(w, 'one_flash');
    c.state.stack = 3;
    const e = place(BD, w, 'goblin', 1.85, 0, { hp: 999 });
    const behind = place(BD, w, 'goblin', 3.6, 0, { hp: 999 });
    const far = place(BD, w, 'goblin', 5.8, 0.65, { hp: 999 });
    swingOnce(BD, H, w);
    t.eq(c.state.stack, 4);
    const ln = w.lastSwing.shapes.filter((x) => x.kind === 'line');
    t.eq(ln.map((x) => [x.card, x.source, x.len, x.width]), [['one_flash', 'pierce', 4.2, 0.9]]);
    t.eq(hitsOn(w, behind).map((x) => x.source), ['pierce']);
    t.eq(evs(w, 'vfx', (x) => x.kind === 'combo_label').map((x) => x.text), ['관통']);
    c.state.stack = 7; swingOnce(BD, H, w);
    t.eq(w.lastSwing.shapes.filter((x) => x.kind === 'line').map((x) => [x.len, x.width]), [[6.0, 1.4]]);
    t.eq(hitsOn(w, far).map((x) => x.source), ['pierce']);
    const { BD: B2, H: H2, w: w2 } = world(t, { hand: ['one_flash', 'pierce'] });
    const c2 = B2.cardRt.get(w2, 'one_flash');
    c2.state.stack = 5;
    place(B2, w2, 'goblin', 1.85, 0, { hp: 999 });
    swingOnce(B2, H2, w2);
    t.eq(w2.lastSwing.shapes.filter((x) => x.kind === 'line').map((x) => [x.card, x.len]), [['pierce', 4.2]], 'no second line');
    c2.state.stack = 7; swingOnce(B2, H2, w2);
    t.eq(w2.lastSwing.shapes.filter((x) => x.kind === 'line').map((x) => [x.card, x.len, x.width]), [['pierce', 6.0, 1.4]], '관통 itself grows at ×8');
  },
  'every combo resets with swap when taken out at the altar'(t) {
    for (const id of ['chain_slash', 'flawless', 'one_flash']) {
      const { BD, H, w } = world(t, { hand: [id] });
      BD.cardRt.get(w, id).state.stack = 0;
      BD.cardRt.setStack(w, BD.cardRt.get(w, id), 3, 'gain');
      BD.cardRt.unequip(w, 0, 'swap');
      t.eq(reasons(w, id), [[0, 3, 'gain'], [3, 0, 'swap']]);
    }
  },
  'each combo ignores the other combos\' reset causes'(t) {
    const { BD, H, w } = world(t, { hand: ['chain_slash', 'flawless', 'one_flash'] });
    for (const id of ['chain_slash', 'flawless', 'one_flash']) BD.cardRt.setStack(w, BD.cardRt.get(w, id), 2, 'gain');
    BD.W.hurtHero(w, 5, { source: 'goblin', attack: 'stab', enemyId: null, attackId: 'h' });     // hurt: only 무결
    t.eq(['chain_slash', 'flawless', 'one_flash'].map((id) => BD.cardRt.get(w, id).state.stack), [2, 0, 2]);
    const e = place(BD, w, 'goblin', 0.95, 0, { hp: 999 });                                   // too close: only 일섬
    swingOnce(BD, H, w);
    t.eq(['chain_slash', 'one_flash'].map((id) => BD.cardRt.get(w, id).state.stack), [2, 0]);
    e.x += 6; w.hero.atkTimer = 99;
    H.step(4 * 60 + 2);                                                                       // timeout: only 연참
    t.eq(BD.cardRt.get(w, 'chain_slash').state.stack, 0);
    const bad = w.bus.recent(4000).filter((x) => x.event === 'combo_change' && x.to < x.from)
      .filter((x) => !({ chain_slash: 'timeout', flawless: 'hurt', one_flash: 'too_close' })[x.cardId].includes(x.reason));
    t.eq(bad, []);
  },
};

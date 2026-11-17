// Screen flow (GDD §9.1) in a real browser, once by keyboard and once by touch:
// title → prep → play → pause → help → pause → play → altar (pick, slot, engrave; pray) →
// give up → result → 같은 밤 다시 / 다시 오른다 → prep → title → codex → title → settings.
'use strict';
const H = require('./_harness');

// v2 floors have no altar yet (it returns as a site, GDD-V2 §4.6): the overlay is opened on a staged one
const openAltar = (T) => T.eval(() => {
  const w = window.__BD.world(), BD = window.BD;
  if (!w.altar) w.altar = { state: 'off', x: w.hero.x, y: w.hero.y, offers: [], offered: [], round: 0, step: 'choose', pick: null, needExit: false };
  w.scenario = true; // no horde and no growth choice in the way of the screen walk
  BD.flow.lightAltar(w); BD.flow.openAltar(w);
});
const has = (arr, s) => arr.some((x) => x === s);

module.exports = {
  async 'keyboard: title → prep → play → pause/help → altar → give up → result → same night'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1' });
    try {
      t.eq(await T.mode(), 'title');
      t.assert(has(await T.texts(), '여명 전야'), 'title lettering');
      await T.key('Enter');
      t.eq(await T.mode(), 'prep', 'Enter on 출정 opens the preparation screen');
      const prep = await T.texts();
      t.assert(has(prep, '이번 밤의 성인'));
      const seedText = prep.find((s) => /^시드 \d+$/.test(s));
      t.assert(seedText, 'seed shown');
      const seed = Number(seedText.slice(3));
      const shown = await T.eval((seed) => window.BD.cardRt.dealHand(seed, window.__BD.app.save.unlocked, 0).map((id) => window.BD.cards.get(id).name), seed);
      for (const n of shown) t.assert(has(prep, n), 'prep shows dealt card ' + n);
      await T.key('Enter');
      t.eq(await T.mode(), 'play', 'Enter on 오른다 starts the night');
      const st = await T.state();
      t.eq(st.seed, seed, 'run uses the seed shown');
      t.eq(st.cards.map((c) => c.id), await T.eval((seed) => window.BD.cardRt.dealHand(seed, window.__BD.app.save.unlocked, 0), seed), 'run uses the hand shown');
      // pause, help from pause, back to pause, resume
      await T.key('Escape');
      t.eq(await T.overlay(), 'pause');
      t.assert(has(await T.texts(), '일시정지'));
      await T.key('ArrowDown'); await T.key('Enter');
      t.eq(await T.overlay(), 'help', '도움말 from pause');
      t.assert(has(await T.texts(), '움직이면 용사가 알아서 벱니다.'));
      await T.key('Escape');
      t.eq(await T.overlay(), 'pause', 'help closes back to pause');
      await T.key('Escape');
      t.eq(await T.overlay(), null, 'Esc resumes');
      // altar: 1 picks the first card, 2 chooses the second slot, Enter engraves
      await openAltar(T); await T.wait();
      t.eq(await T.overlay(), 'altar');
      t.assert((await T.texts()).some((s) => s.indexOf('제단 — 다음 층: ') === 0), 'altar title with next floor type');
      const offer = await T.eval(() => window.__BD.world().altar.offers[0]);
      await T.key('Digit1');
      t.eq(await T.eval(() => window.__BD.world().altar.step), 'slot');
      t.assert(has(await T.texts(), '어느 홈을 비우겠습니까?'));
      await T.key('Digit2');
      await T.key('Enter');
      t.eq(await T.overlay(), null, 'engraving closes the altar');
      t.eq(await T.eval(() => window.__BD.world().cards[1] && window.__BD.world().cards[1].id), offer, 'offer engraved into slot 2');
      // altar again: pray (focus 3rd item after the two cards)
      await openAltar(T); await T.wait();
      await T.eval(() => window.__BD.setHp(40));
      const nOffers = await T.eval(() => window.__BD.world().altar.offers.length);
      await T.key('Digit' + (nOffers + 1));
      t.eq(await T.eval(() => window.__BD.world().hero.hp), 65, '기도한다 heals 25');
      // give up: last pause item, asked twice
      await T.key('Escape'); await T.key('ArrowUp'); await T.key('Enter');
      t.eq(await T.overlay(), 'pause', 'first press only arms the give-up');
      t.assert(has(await T.texts(), '정말 포기한다'));
      await T.key('Enter');
      t.assert(await T.waitMode('result', 4000), 'result after giving up');
      const res = await T.texts();
      t.assert(has(res, '쓰러졌다') && res.some((s) => /포기/.test(s)), 'death title and cause');
      t.assert(has(res, '다시 오른다') && has(res, '같은 밤 다시') && has(res, '타이틀로'));
      await T.key('ArrowRight'); await T.key('Enter');
      t.eq(await T.mode(), 'play', '같은 밤 다시 starts at once');
      t.eq((await T.state()).seed, seed, 'same seed');
      t.eq(T.errors, []);
      t.eq(T.requests, []);
    } finally { await T.close(); }
  },

  async 'touch: every screen and overlay by taps at phone size'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1', context: { viewport: { width: 667, height: 375 }, hasTouch: true } });
    try {
      await T.tap('sortie'); t.eq(await T.mode(), 'prep');
      await T.tap('back'); t.eq(await T.mode(), 'title', '돌아가기');
      await T.tap('codex'); t.eq(await T.mode(), 'codex');
      await T.tap('back'); t.eq(await T.mode(), 'title');
      await T.tap('settings'); t.eq(await T.overlay(), 'settings');
      await T.tap('close'); t.eq(await T.overlay(), null);
      await T.tap('help'); t.eq(await T.overlay(), 'help');
      await T.tap('close'); t.eq(await T.overlay(), null);
      await T.tap('sortie'); await T.tap('ascend');
      t.eq(await T.mode(), 'play');
      await T.wait(150);
      await T.tap('slot0'); t.eq(await T.overlay(), 'pause', 'a card slot pauses');
      await T.tap('resume'); t.eq(await T.overlay(), null);
      await T.tap('hud_pause'); t.eq(await T.overlay(), 'pause', 'Ⅱ pauses');
      await T.tap('help'); t.eq(await T.overlay(), 'help');
      await T.tap('close'); t.eq(await T.overlay(), 'pause');
      await T.tap('resume');
      await openAltar(T); await T.wait();
      await T.tap('offer0');
      t.eq(await T.eval(() => window.__BD.world().altar.step), 'slot');
      await T.tap('back');
      t.eq(await T.eval(() => window.__BD.world().altar.step), 'choose', '돌아가기 returns to the offers');
      await T.tap('offer0'); await T.tap('slot2');
      const engrave = await T.find('engrave');
      t.assert(engrave && !engrave.disabled, '새긴다 enabled after choosing a slot');
      await T.tap('engrave');
      t.eq(await T.overlay(), null);
      t.assert((await T.events(50)).some((e) => e.event === 'card_swap' && e.slot === 2));
      await openAltar(T); await T.wait();
      await T.tap('later');
      t.eq(await T.overlay(), null, '나중에 closes');
      t.eq(await T.eval(() => window.__BD.world().altar.state), 'lit', 'altar stays lit');
      await T.tap('hud_pause'); await T.tap('giveup'); await T.tap('giveup');
      t.assert(await T.waitMode('result', 4000));
      await T.tap('again');
      t.eq(await T.mode(), 'prep', '다시 오른다 opens a new preparation');
      await T.tap('back');
      t.eq(await T.mode(), 'title');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  // GDD-V2 §5.5 (v1: guardian → altar → stairs): the task done → the guardian waits at the stairs
  // zone → its fall clears the floor (the horde scatters, the shards fly in) → stairs → 2F
  async 'full loop by the v2 path: task → guardian at the stairs → floor clear → stairs → death → result → retry'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1' });
    const hero = (x, y) => T.eval(([x, y]) => { const h = window.__BD.world().hero; h.x = x; h.y = y; window.__BD.input({ mx: 0, my: 0 }); }, [x, y]);
    try {
      await T.key('Enter'); await T.key('Enter');
      t.eq(await T.mode(), 'play');
      await T.wait(1700); // the 1.5 s freeze on entering
      t.assert((await T.texts()).some((x) => /^소탕 \d+\/200$/.test(x)), 'the task count at the top');
      // the task is done: banner, the guardian appears at the stairs zone after its 2 s warning
      await T.eval(() => {
        const B = window.__BD, w = B.world(), BD = window.BD;
        w.hero.hp = w.hero.maxHp = 1e6; w.scenario = true; B.killAll();
        BD.taskRt.set(w, w.task.goal);
      });
      await T.wait(300);
      t.assert(has(await T.texts(), '수호자가 계단을 지킨다'), 'task banner');
      let g = null;
      for (let i = 0; i < 40 && !g; i++) { await T.wait(100); g = await T.eval(() => { const e = window.__BD.world().enemies.find((x) => x.guardian && !x.dead); return e ? { x: e.x, y: e.y } : null; }); }
      t.assert(g && Math.hypot(g.x - 8, g.y - 8) < 1.5, 'the guardian stands at the stairs zone centre');
      // its fall clears the floor
      await T.eval(() => {
        const w = window.__BD.world(), BD = window.BD;
        for (let i = 0; i < 6; i++) BD.W.makeEnemy(w, 'goblin', w.hero.x + 3 + i * 0.5, w.hero.y, {}).stunT = 99;
        BD.growth.drop(w, 20, 20, 1);
        BD.combat.kill(w, w.enemies.find((x) => x.guardian));
      });
      await T.wait(300);
      t.assert(has(await T.texts(), '계단이 열렸다'), 'stairs banner');
      t.eq(await T.eval(() => window.__BD.world().enemies.filter((e) => !e.dead).length), 0, 'the horde scattered');
      t.assert(await T.eval(() => window.__BD.world().shards.every((s) => s.pull)), 'every shard flies to the hero');
      // stairs ring for 1.0 s → next floor with its banner
      const st = await T.eval(() => { const s = window.__BD.world().stairs; return [s.ringX, s.ringY]; });
      await hero(st[0], st[1]);
      let up = false;
      for (let i = 0; i < 40 && !up; i++) { await T.wait(100); up = (await T.state()).floor === 2; }
      t.assert(up, 'stairs take the hero to 2F');
      await T.wait(200);
      // the floor's own task (the UI stand-ins add the other branches' tasks to 2F–5F)
      const task2 = await T.eval(() => window.__BD.world().task.name);
      t.assert((await T.texts()).some((x) => x.startsWith('2F — ') && x.endsWith(' · ' + task2)), 'floor banner with the task ' + task2);
      // death → result → 다시 오른다 (touch) → prep → 오른다 → a new night
      await T.eval(() => { const w = window.__BD.world(); w.hero.hp = w.hero.maxHp = 100; w.hero.invuln = 0; window.BD.W.hurtHero(w, 999, { source: 'goblin', attack: 'stab', x: w.hero.x + 1, y: w.hero.y }); });
      t.assert(await T.waitMode('result', 5000), 'result after death');
      t.assert(has(await T.texts(), '쓰러졌다'));
      const seed1 = (await T.state()).seed;
      await T.tap('again');
      t.eq(await T.mode(), 'prep');
      await T.tap('ascend');
      t.eq(await T.mode(), 'play');
      t.assert((await T.state()).seed !== seed1, 'a new night has a new seed');
      t.eq((await T.state()).floor, 1);
      t.eq(T.errors, []);
      t.eq(T.requests, []);
    } finally { await T.close(); }
  },

  async 'keyboard: the title menu reaches 기록, 설정, 도움말 and comes back; M mutes in play'(t) {
    const T = await H.open(H.variant(), { query: '?nosave=1' });
    try {
      await T.key('ArrowDown'); await T.key('Enter');
      t.eq(await T.mode(), 'codex', '↓ Enter → 기록');
      for (let i = 0; i < 3; i++) await T.key('ArrowRight');
      t.assert((await T.texts()).includes('속성  ·  사용 0판 · 승리 0회'), 'arrow keys walk the card grid to 화염 and describe it');
      await T.key('Escape');
      t.eq(await T.mode(), 'title', 'Esc → title');
      await T.key('Digit3');
      t.eq(await T.overlay(), 'settings', '3 → 설정');
      await T.key('ArrowLeft');
      t.eq(await T.eval(() => window.__BD.app.save.settings.sfx), 0.7, '← on the focused 소리 lowers the volume');
      await T.key('Escape');
      t.eq(await T.overlay(), null);
      await T.key('Digit4');
      t.eq(await T.overlay(), 'help', '4 → 도움말');
      await T.key('Enter');
      t.eq(await T.overlay(), null, 'Enter on 닫기');
      await T.key('Digit1'); await T.key('Escape');
      t.eq(await T.mode(), 'title', 'Esc leaves the preparation screen');
      await T.key('Enter'); await T.key('Enter');
      t.eq(await T.mode(), 'play');
      await T.key('KeyM');
      t.eq(await T.eval(() => window.__BD.app.save.settings.sfx), 0, 'M mutes');
      t.assert((await T.eval(() => window.BD.ui.S.toasts.map((x) => x.text))).includes('소리 꺼짐'));
      await T.key('KeyM');
      t.eq(await T.eval(() => window.__BD.app.save.settings.sfx), 0.7, 'M again restores the volume');
      await T.key('KeyP');
      t.eq(await T.overlay(), 'pause', 'P pauses');
      await T.key('KeyP');
      t.eq(await T.overlay(), null, 'P resumes');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'URL-defined runs skip the preparation screen (test hooks)'(t) {
    const T = await H.open(H.variant(), { query: '?seed=9&hand=pierce&mute=1&nosave=1' });
    try {
      await T.key('Enter');
      t.eq(await T.mode(), 'play');
      t.eq((await T.state()).seed, 9);
    } finally { await T.close(); }
  },
};

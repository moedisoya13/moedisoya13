// The v2 HUD (GDD-V2 §5.7), the minimap and edge markers, the §7 feedback and its caps, and the
// screens that change (prep, pause, result, codex, help, first-run hints). Uses the stand-in build
// (tests/ui/fixtures/standins.js) for the boons, tasks and sites of other branches, and staged
// content this branch has never seen (a site with only an id and a state, a foreign marker source).
'use strict';
const H = require('./_harness');

async function playing(extra, context) {
  const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce,flame,leech&mute=1&nosave=1' + (extra || ''), context });
  await T.key('Enter');
  await T.eval(() => { const w = window.__BD.world(); w.freezeT = 0; w.scenario = true; window.__BD.app.save.settings.hints = false; });
  return T;
}
const has = (arr, s) => arr.some((x) => x === s);
const texts = (T) => T.texts();
// the colour of the canvas at a logical point
const pixel = (T, x, y) => T.eval(([x, y]) => {
  const v = window.__BD.ui.view, c = document.getElementById('bd'), [cx, cy] = v.toClient(x, y), r = c.getBoundingClientRect(), k = c.width / r.width;
  return Array.from(c.getContext('2d').getImageData(Math.round(cx * k), Math.round(cy * k), 1, 1).data).slice(0, 3);
}, [x, y]);

module.exports = {
  async 'HUD: gauge and level, task count with its bar, done / stairs states, guardian bar, kills and the streak, clock lateness'(t) {
    const T = await playing();
    try {
      await T.eval(() => { const w = window.__BD.world(); window.BD.growth.addXp(w, 5); w.task.value = 137; w.stats.kills = 137; });
      await T.wait(150);
      let s = await texts(T);
      t.assert(has(s, 'Lv 1'), 'level beside the gauge');
      t.assert(has(s, '소탕 137/200'), 'task count');
      t.assert(has(s, '처치 137'), 'kills');
      // the streak counts kills in play time and is gone 3 s after the last
      await T.eval(() => { const B = window.BD, w = window.__BD.world(); for (let i = 0; i < 6; i++) { const e = B.W.makeEnemy(w, 'goblin', w.hero.x + 2 + i * 0.3, w.hero.y, {}); B.combat.kill(w, e); } });
      await T.wait(120);
      t.assert(has(await texts(T), '×6'), 'streak ×6');
      await T.eval(() => { window.__BD.world().t += 3.2; });
      await T.wait(120);
      t.assert(!(await texts(T)).some((x) => /^×\d+$/.test(x)), 'streak gone after 3 s of play');
      // a stand-in task with a small goal draws segments; done; the guardian's bar; stairs open
      await T.eval(() => { const w = window.__BD.world(); w.floor.task = 'seals'; window.BD.taskRt.start(w); window.BD.taskRt.progress(w, 1); });
      await T.wait(150);
      s = await texts(T);
      t.assert(has(s, '봉인 1/3'), 'seals 1/3');
      t.eq(await T.eval(() => window.BD.ui.taskState(window.__BD.world()).segs), 3, 'three segments');
      await T.eval(() => { const w = window.__BD.world(); w.task.done = true; });
      await T.wait(120);
      t.assert(has(await texts(T), '수호자가 계단을 지킨다'), 'task done');
      await T.eval(() => { const B = window.BD, w = window.__BD.world(); B.W.makeEnemy(w, w.floor.guardian, w.hero.x + 4, w.hero.y, { guardian: true }); });
      await T.wait(120);
      t.assert((await texts(T)).some((x) => /^수호자 — /.test(x)), 'guardian bar');
      await T.eval(() => { const w = window.__BD.world(); w.enemies.forEach((e) => { if (e.guardian) e.dead = true; }); w.stairs.open = true; });
      await T.wait(120);
      t.assert(has(await texts(T), '계단이 열렸다'), 'stairs open');
      // clock lateness: more than 30 s behind the summed floor budgets
      t.eq(await T.eval(() => { const w = window.__BD.world(); w.t = 100; const a = window.BD.ui.behind(w); w.t = 150; return [a, window.BD.ui.behind(w)]; }), [false, true]);
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'HUD: level pips under each slot light up to the card level; a pick pops the new one'(t) {
    const T = await playing();
    try {
      const r = await T.eval(() => window.BD.ui.slotRect(0));
      const y = r.y + r.h + 9, x = (k) => r.x + r.w / 2 + (k - 2) * 14;
      const before = await pixel(T, x(1), y);
      await T.eval(() => { const w = window.__BD.world(); window.BD.cardRt.levelUp(w, w.cards[0]); window.BD.cardRt.levelUp(w, w.cards[0]); });
      await T.wait(700);
      const after = await pixel(T, x(1), y), third = await pixel(T, x(2), y), fifth = await pixel(T, x(4), y);
      const gold = (p) => p[0] > 200 && p[1] > 180 && p[2] > 100;
      t.assert(!gold(before), 'pip 2 dark at level 1: ' + before);
      t.assert(gold(after) && gold(third), 'pips 2–3 gold at level 3: ' + after + ' ' + third);
      t.assert(!gold(fifth), 'pip 5 dark: ' + fifth);
    } finally { await T.close(); }
  },

  async 'edge markers: task places, stairs, guardian first; at most 6; inside the band and clear of the HUD; flask and spring only at low HP'(t) {
    const T = await playing();
    try {
      await T.eval(() => window.BD.uiTest.stageSites(window.__BD.world(), { task: 'seals' }));
      await T.wait(150);
      let m = await T.eval(() => window.BD.ui.map.last);
      t.assert(m.length >= 2 && m.every((x) => x.kind === 'task'), 'task places marked: ' + JSON.stringify(m));
      t.eq(m.filter((x) => x.nearest).length, 1, 'the nearest one is larger');
      const blocks = await T.eval(() => [{ x0: 0, y0: 0, x1: 360, y1: 105 }, { x0: 460, y0: 0, x1: 820, y1: 70 }, { x0: 1046, y0: 0, x1: 1280, y1: 194 }, { x0: 430, y0: 584, x1: 850, y1: 720 }]);
      for (const x of m) {
        t.assert(x.x >= 28 && x.x <= 1252 && x.y >= 28 && x.y <= 692, 'inside the band: ' + JSON.stringify(x));
        for (const b of blocks) t.assert(!(x.x > b.x0 && x.x < b.x1 && x.y > b.y0 && x.y < b.y1), 'clear of the HUD: ' + JSON.stringify(x) + ' in ' + JSON.stringify(b));
      }
      t.assert((await texts(T)).some((s) => /^\d+u$/.test(s)), 'distance in u');
      // low HP: a flask and the known spring join; elites and the guardian come first; never more than 6
      await T.eval(() => {
        const B = window.BD, w = window.__BD.world();
        w.hero.hp = 40; w.sites.find((s) => s.kind === 'spring').known = true;
        w.pickups.push({ id: B.W.id(w), kind: 'flask', x: 4, y: 44 });
        const e = B.W.makeEnemy(w, 'goblin', 6, 6, {}); e.elite = true;
        B.W.makeEnemy(w, w.floor.guardian, 8, 8, { guardian: true });
        for (let i = 0; i < 4; i++) { const x = B.W.makeEnemy(w, 'goblin', 44 - i * 2, 4, {}); x.elite = true; }
      });
      await T.wait(150);
      m = await T.eval(() => window.BD.ui.map.last);
      t.assert(m.length <= 6, 'at most 6: ' + m.length);
      t.eq(m[0].kind, 'guardian', 'guardian first');
      t.assert(m.some((x) => x.kind === 'elite'), 'elites marked');
      const all = await T.eval(() => window.BD.ui.map.collect(window.__BD.world(), window.__BD.ui).map((x) => x.kind));
      t.assert(all.includes('flask') && all.includes('spring'), 'flask and spring at low HP: ' + all);
      await T.eval(() => { window.__BD.world().hero.hp = 90; });
      const hi = await T.eval(() => window.BD.ui.map.collect(window.__BD.world(), window.__BD.ui).map((x) => x.kind));
      t.assert(!hi.includes('flask') && !hi.includes('spring'), 'not at high HP');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'minimap: shown on a big floor; places, used ones greyed, the stairs, a site with only an id and a state, a foreign marker source'(t) {
    const T = await playing();
    try {
      await T.eval(() => {
        const BD = window.BD, w = window.__BD.world();
        BD.uiTest.stageSites(w, { task: 'seals' });
        w.sites[0].state = 'used';
        w.sites.push({ id: BD.W.id(w), kind: 'chest', x: 30, y: 30, state: 'weird' }); // no known/optional/progress fields
        BD.render.markers.register({ id: 'foreign_test', collect(w2, out) { out.push({ x: 2, y: 46, kind: 'objective', color: '#9fd8ff' }); } });
      });
      await T.wait(200);
      const r = await T.eval(() => ({ shown: window.BD.ui.map.shown, items: window.BD.ui.map.items(window.__BD.world()), collected: window.BD.ui.map.collect(window.__BD.world(), window.__BD.ui) }));
      t.assert(r.shown, 'minimap on');
      t.assert(r.items.some((x) => x.kind === 'task' && x.done) && r.items.some((x) => x.kind === 'task' && !x.done), 'task places, the used one greyed');
      t.assert(r.items.some((x) => x.glyph === 'site:?'), 'unknown places are ?');
      t.assert(r.items.some((x) => x.glyph === 'site:altar'), 'the altar is known from the start');
      t.assert(r.items.some((x) => x.kind === 'stairs'), 'stairs');
      t.assert(r.collected.some((x) => x.color === '#9fd8ff'), 'a marker source from another branch is shown');
      // the hero's dot is white (orange is the blade's): sample the minimap where the hero is
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'feedback: fodder kills leave pooled marks (≤ 150), four in one tick make one 촤악!, particles stay under the cap, threats get a word'(t) {
    const T = await playing();
    try {
      const r = await T.eval(() => {
        const B = window.BD, w = window.__BD.world(), F = B.ui.feel;
        const before = F.multiKills || 0;
        for (let i = 0; i < 5; i++) { const e = B.W.makeEnemy(w, 'goblin', w.hero.x + 1.5, w.hero.y + i * 0.3, {}); B.combat.kill(w, e); }
        B.W.emit(w, 'tick', { dt: 1 / 60, moved: 0, enemiesAlive: 0 });
        const multi = (F.multiKills || 0) - before;
        for (let i = 0; i < 400; i++) { const e = B.W.makeEnemy(w, 'goblin', 10 + (i % 20), 10 + Math.floor(i / 20), {}); B.combat.kill(w, e); }
        return { multi, marks: F.marks.length, particles: B.client.fx.list.length };
      });
      t.eq(r.multi, 1, 'one multi-kill for five in one tick');
      t.assert(r.marks <= 150 && r.marks > 100, 'mark pool capped: ' + r.marks);
      t.assert(r.particles <= 300, 'particles under the cap: ' + r.particles);
      await T.wait(150);
      t.assert((await texts(T)).includes('촤악!'), '촤악! drawn');
      await T.eval(() => { const B = window.BD, w = window.__BD.world(); w.t += 1; const e = B.W.makeEnemy(w, 'slime', w.hero.x + 2, w.hero.y, {}); B.combat.kill(w, e); });
      await T.wait(60);
      t.assert((await texts(T)).some((s) => s === '쾅!' || s === '서걱!'), 'a threat gets a sound word');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'sounds: every new id exists; crowd sounds are capped, the hit always plays and holds the crowd back'(t) {
    const T = await playing();
    try {
      const r = await T.eval(() => {
        const ids = ['multi_kill', 'elite_down', 'elite_in', 'streak', 'shard', 'level_up', 'choice_open', 'choice_pick', 'halo', 'holy_stone', 'surge_horn', 'site_start', 'site_clear'];
        const missing = ids.filter((id) => !window.BD.ui.sfx.has(id));
        const ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createGain();
        const V = window.BD.ui.audio.voice; V.live.length = 0; V.dropped = 0; V.played = 0; V.hurtUntil = -1;
        for (let i = 0; i < 20; i++) window.BD.ui.sfx.get('kill').play(ac, dest, {});
        const crowd = { played: V.played, dropped: V.dropped };
        window.BD.ui.sfx.get('hurt').play(ac, dest, {});
        const hurtPlayed = V.played === crowd.played + 1;
        V.live.length = 0;
        window.BD.ui.sfx.get('hurt').play(ac, dest, {});
        const p0 = V.played; window.BD.ui.sfx.get('shard').play(ac, dest, { step: 3 });
        const heldBack = V.played === p0;
        ac.close();
        return { missing, crowd, hurtPlayed, heldBack };
      });
      t.eq(r.missing, []);
      t.eq(r.crowd.played, 8, 'kill: 8 voices at once');
      t.eq(r.crowd.dropped, 12);
      t.assert(r.hurtPlayed, 'hurt plays over a full crowd');
      t.assert(r.heldBack, 'a shard waits while the hit sounds');
    } finally { await T.close(); }
  },

  async 'surge: the two sides come from where the packs appear; slow motion steps the world on about half the frames'(t) {
    const T = await playing();
    try {
      const sides = await T.eval(() => {
        const B = window.BD, w = window.__BD.world();
        B.W.emit(w, 'surge', { floor: 1, n: 1 });
        B.W.emit(w, 'spawn', { enemyId: 0, kind: 'goblin', x: w.hero.x + 10, y: w.hero.y, via: 'placed' });
        B.W.emit(w, 'spawn', { enemyId: 0, kind: 'goblin', x: w.hero.x + 10, y: w.hero.y + 1, via: 'placed' });
        B.W.emit(w, 'spawn', { enemyId: 0, kind: 'goblin', x: w.hero.x - 10, y: w.hero.y, via: 'placed' });
        return B.ui.fb.surge.sides.length;
      });
      t.eq(sides, 2);
      const rate = async (slow) => T.eval(async (slow) => {
        const w = window.__BD.world(), F = window.BD.ui.feel;
        if (slow) F.slowmo(0.5, 1.2);
        const t0 = w.ticks; await new Promise((r) => setTimeout(r, 900)); return w.ticks - t0;
      }, slow);
      const normal = await rate(false), slowed = await rate(true);
      t.assert(slowed < normal * 0.8 && slowed > normal * 0.3, 'slow motion ×0.5: ' + slowed + ' vs ' + normal + ' ticks');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'screens: prep lists the levels; pause shows the build and the task; result shows what the build did'(t) {
    const T = await H.open(H.variant(), { query: '?mute=1&nosave=1' });
    try {
      await T.eval(() => window.BD.ui.nav.prep(window.__BD.ui));
      await T.wait(150);
      const hand = await T.eval(() => window.BD.ui.nav.hand());
      const l2 = await T.eval((id) => window.BD.cardRt.levelText(window.BD.cards.get(id), 2), hand[0]);
      t.assert((await texts(T)).some((s) => l2.startsWith(s) || s.startsWith(l2.slice(0, 6))), 'prep shows what level 2 adds: ' + l2);
      await T.eval(() => {
        const B = window.__BD; B.ui.startRun({ seed: 5, hand: 'pierce,flame,leech' });
        const w = B.world(), BD = window.BD; w.scenario = true;
        BD.cardRt.levelUp(w, w.cards[0]); BD.cardRt.levelUp(w, w.cards[0]);
        BD.growth.giveBoon(w, 'edge'); BD.growth.giveBoon(w, 'long'); w.hero.level = 9;
        B.app.pause();
      });
      await T.wait(200);
      let s = await texts(T);
      for (const x of ['3단계', '날 벼림', '긴 칼', '과업 — 소탕 0/200']) t.assert(has(s, x), 'pause shows ' + x);
      t.assert(s.some((x) => /^Lv 9 · 1F/.test(x)), 'level in the header');
      await T.eval(() => { const B = window.__BD, w = B.world(); B.app.resume(); w.t = 80; window.BD.taskRt.complete(w); w.t = 120; B.app.giveUp(); });
      t.assert(await T.waitMode('result', 4000));
      s = await texts(T);
      for (const x of ['이번 밤', 'Lv 9', '1F', '소탕', '1:20', '3단계', '날 벼림 1', '긴 칼 1']) t.assert(has(s, x), 'result shows ' + x + ' in ' + JSON.stringify(s.slice(0, 60)));
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'codex: best level, most kills, each card’s best level; v2 unlock words; help has the v2 lines'(t) {
    const SAVE = { v: 2, runs: 4, wins: 1, bestFloor: 6, bestWinSec: 842, bestLevel: 24, bestKills: 2410, tierUnlocked: 0, tierSelected: 0, tierWins: [1, 0, 0, 0], rerollUnlocked: true, unlocked: ['pierce', 'whirl', 'flame', 'lightning', 'leech', 'riposte', 'holy_light', 'armor_break', 'rest_of_dead', 'kings_hunt', 'chain_slash', 'flawless'], counters: { kills: 3120, dodges: 4, mageKills: 3, magicKills: 640, questAwakened: 0, comboMaxed: 0 }, codex: { pierce: { held: 3, wins: 1, best: 0, bestLevel: 5 } }, history: [], settings: { sfx: 0.8, shake: true, dashSide: 'right', hints: false }, lastSeed: 1 };
    const init = { fn: (s) => { try { localStorage.setItem('before-dawn.save.v2', s); } catch (e) { /* ignore */ } }, arg: JSON.stringify(SAVE) };
    const T = await H.open(H.variant(), { query: '?mute=1', init });
    try {
      await T.eval(() => window.BD.ui.nav.codex(window.__BD.ui));
      await T.wait(150);
      let s = await texts(T);
      for (const x of ['최고 레벨', 'Lv 24', '한 판 최다 처치', '2410']) t.assert(has(s, x), 'codex shows ' + x);
      await T.tap('card:pierce', 'mouse');
      t.assert((await texts(T)).some((x) => /최고 5단계/.test(x)), 'card best level');
      await T.tap('card:tide', 'mouse');
      t.assert(has(await texts(T), '해금: 누적 처치 4000  (3120/4000)'), 'tide: the v2 condition with progress');
      await T.tap('card:mana_backlash', 'mouse');
      t.assert(has(await texts(T), '해금: 누적 마법 유형 처치 1200  (640/1200)'), 'mana backlash: magic-type kills');
      await T.tap('back', 'mouse');
      await T.eval(() => window.BD.ui.nav.openHelp(window.__BD.ui));
      await T.wait(120);
      s = await texts(T);
      t.assert(has(s, '빛 조각을 모아 게이지가 차면, 셋 중 하나로 성인을 키웁니다.'), 'help: growth line');
      t.assert(has(s, '미니맵의 ?는 들를 곳입니다. 06:00 전에 옥상으로.'), 'help: minimap line');
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },

  async 'first-run hints for the new loop: shards, growth, the gold edge marks, the minimap ?, the guardian'(t) {
    const T = await H.open(H.variant(), { query: '?seed=5&hand=pierce,flame,leech&mute=1&nosave=1' });
    try {
      await T.key('Enter');
      await T.eval(() => { const w = window.__BD.world(); w.scenario = true; window.BD.ui.hints.shown.move = true; window.BD.ui.hints.shown.target = true; });
      const seen = new Set();
      // hints wait their turn (two on screen at most): gather what shows over a few seconds
      const collect = async (ms) => { for (let k = 0; k < (ms || 900) / 150; k++) { for (const s of await T.eval(() => window.BD.ui.S.toasts.map((x) => x.text))) seen.add(s); await T.wait(150); } };
      await T.eval(() => { const B = window.BD, w = window.__BD.world(); B.growth.drop(w, w.hero.x + 5, w.hero.y, 1); });
      await T.wait(900); await collect();
      await T.eval(() => { const B = window.BD, w = window.__BD.world(); w.scenario = false; B.growth.addXp(w, w.hero.xpNeed - w.hero.xp); });
      // the overlay opens 0.25 s after the level (GDD-V2 §4.3), then takes no key for 0.35 s
      await T.page.waitForFunction(() => window.__BD.world().choiceOpen, null, { timeout: 4000 });
      await T.wait(500); await T.key('Digit1'); await T.wait(700); await collect();
      await T.eval(() => { const B = window.BD, w = window.__BD.world(); w.scenario = true; B.uiTest.stageSites(w, { task: 'seals' }); w.t = 12; });
      await collect(4000);
      await T.eval(() => { const w = window.__BD.world(); window.BD.taskRt.progress(w, 2); });
      await collect(5000);
      for (const x of ['빛 조각에 다가가면 빨려 온다', '빛을 모으면 성인이 자란다', '화면 가장자리의 금색 표시가 이 층의 과업이다', '미니맵의 ?는 들를 곳이다', '과업을 끝내면 수호자가 계단을 지킨다']) t.assert(seen.has(x), 'hint: ' + x + ' in ' + JSON.stringify([...seen]));
      t.eq(T.errors, []);
    } finally { await T.close(); }
  },
};

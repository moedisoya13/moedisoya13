#!/usr/bin/env node
// Screenshots of every screen and overlay at 1280×720 and at 667×375 (a phone in landscape,
// device scale 2), plus play on each of the five floor colours. Writes docs/screens/ui/.
// Portrait (375×667 and 720×1280): the rotate prompt at launch and mid-run, and forced
// landscape (the picture a quarter turn round after a touch on the prompt).
// States that need content of other branches are staged with tests/ui/fixtures/standins.js
// and window.__BD. Usage: node tests/ui/shoot.js [scene-filter]
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');

const OUT = path.join(H.ROOT, 'docs/screens/ui');
const filter = process.argv[2] || '';
const SIZES = [
  { tag: '1280x720', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { tag: '667x375', viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true },
];

const SAVE = {
  v: 1, runs: 7, wins: 1, bestFloor: 6, bestWinSec: 802.4, tierUnlocked: 2, tierSelected: 1, tierWins: [1, 0, 0, 0], rerollUnlocked: true,
  unlocked: ['pierce', 'whirl', 'flame', 'lightning', 'leech', 'riposte', 'holy_light', 'armor_break', 'rest_of_dead', 'kings_hunt', 'chain_slash', 'flawless', 'sword_wave', 'fire_pilgrimage'],
  counters: { kills: 412, dodges: 9, mageKills: 13, questAwakened: 1, comboMaxed: 0 },
  codex: { pierce: { held: 3, wins: 1, best: 0 }, chain_slash: { held: 4, wins: 1, best: 5 }, flame: { held: 2, wins: 0, best: 0 }, rest_of_dead: { held: 2, wins: 0, best: 1 } },
  history: [
    { seed: 88123, tier: 1, result: 'death', cause: 'ghoul:lunge', floor: 4, sec: 512.3, cards: ['whirl', 'flame', 'rest_of_dead'] },
    { seed: 4511, tier: 0, result: 'win', cause: '', floor: 6, sec: 802.4, cards: ['pierce', 'lightning', 'chain_slash'] },
    { seed: 99, tier: 0, result: 'death', cause: 'goblin:stab', floor: 3, sec: 330, cards: ['pierce', 'leech', 'flawless'] },
    { seed: 120, tier: 0, result: 'death', cause: 'drain', floor: 6, sec: 960, cards: ['whirl', 'holy_light', 'kings_hunt'] },
    { seed: 7, tier: 0, result: 'death', cause: 'slime:pounce', floor: 2, sec: 170, cards: ['flame', 'riposte', 'chain_slash'] },
    { seed: 31, tier: 0, result: 'death', cause: 'giveup', floor: 1, sec: 40, cards: ['pierce', 'flame', 'leech'] },
    { seed: 32, tier: 0, result: 'death', cause: 'goblin:stab', floor: 2, sec: 150, cards: ['whirl', 'lightning', 'armor_break'] },
  ],
  settings: { sfx: 0.8, shake: true, dashSide: 'right', hints: false }, lastSeed: 88123,
};
const withSave = (save) => ({ fn: (s) => { try { localStorage.setItem('before-dawn.save.v1', s); } catch (e) { /* ignore */ } }, arg: JSON.stringify(save) });

// play staging: floor colour, enemies, hand and card states
async function stagePlay(T, o) {
  await T.eval((o) => {
    const B = window.__BD, w = B.world(), BD = window.BD;
    if (o.dom) { w.floor.domType = o.dom; w.floor.nextDomType = o.next || w.floor.nextDomType; BD.client.render.floorKey = null; }
    B.killAll(); w.wave.n = o.wave || 2;
    o.hand.forEach((id, i) => B.give(id, i));
    for (let i = o.hand.length; i < 3; i++) if (w.cards[i]) BD.cardRt.unequip(w, i, 'swap');
    const cx = w.grid.w / 2, cy = w.grid.h / 2;
    w.hero.x = cx + 0.5; w.hero.y = cy + 1.2;
    (o.enemies || []).forEach(([k, dx, dy, opt]) => BD.W.makeEnemy(w, k, cx + dx, cy + dy, opt || {}));
    w.freezeT = 0;
  }, o);
  await T.wait(60);
  await T.eval((o) => {
    const w = window.__BD.world(), BD = window.BD;
    (o.states || []).forEach(([i, st]) => {
      const c = w.cards[i];
      if (st.stack !== undefined) BD.cardRt.setStack(w, c, st.stack, 'gain');
      if (st.progress !== undefined) BD.cardRt.addProgress(w, c, st.progress);
      if (st.awaken) BD.cardRt.awaken(w, c);
      if (st.timer !== undefined) c.state.timer = st.timer;
      Object.assign(c.state, st.raw || {});
    });
    if (o.hp !== undefined) window.__BD.setHp(o.hp);
    if (o.t !== undefined) w.t = o.t;
    if (o.radiance !== undefined) w.hero.radiance = o.radiance;
    if (o.bot) window.__BD.bot(true);
  }, o);
}

// the device turned to portrait and back (the rotate prompt, then the tap state)
async function turnAround(T) {
  const vp = T.page.viewportSize();
  await T.page.setViewportSize({ width: vp.height, height: vp.width }); await T.wait(250);
  await T.page.setViewportSize(vp); await T.wait(300);
}

const PLAY_URL = '?seed=11&hand=pierce,chain_slash&mute=1&nosave=1';
const SCENES = {
  'tap-start': { query: '?mute=1&nosave=1', run: async (T) => { await turnAround(T); } },
  'tap-continue': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1200);
      await stagePlay(T, { hand: ['whirl', 'leech', 'chain_slash'], enemies: [['goblin', -2, -1], ['goblin', 1.2, -1.5], ['slime', -1, 1]], states: [[2, { stack: 2 }]], hp: 72 });
      await turnAround(T);
    },
  },
  title: { query: '?mute=1&nosave=1', run: async () => {} },
  'title-records': { init: withSave(SAVE), query: '?mute=1', run: async () => {} },
  prep: { query: '?mute=1&nosave=1', run: async (T) => { await T.key('Enter'); } },
  'prep-unlocked': { init: withSave(SAVE), query: '?mute=1', run: async (T) => { await T.key('Enter'); } },
  codex: { init: withSave(SAVE), query: '?mute=1', run: async (T) => { await T.tap('codex', 'mouse'); await T.tapAt(368 + 2 * 149 + 70, 92 + 60, 'mouse'); } },
  'codex-locked': { init: withSave(SAVE), query: '?mute=1', run: async (T) => { await T.tap('codex', 'mouse'); await T.tap('card:tide', 'mouse'); } },
  settings: { query: '?mute=1&nosave=1', run: async (T) => { await T.tap('settings', 'mouse'); } },
  help: { query: '?mute=1&nosave=1', run: async (T) => { await T.tap('help', 'mouse'); } },
  'play-beast': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1700);
      await stagePlay(T, { hand: ['whirl', 'leech', 'chain_slash'], enemies: [['goblin', -2, -1], ['goblin', 1.2, -1.5], ['slime', -1, 1], ['goblin', 2, 0.5], ['goblin', 0.5, -2.6]], states: [[1, { raw: { kills: 2 } }], [2, { stack: 3 }]], radiance: 2, hp: 72, bot: true });
      await T.wait(1400);
    },
  },
  'play-undead': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1700);
      await stagePlay(T, { dom: 'undead', next: 'magic', hand: ['holy_light', 'rest_of_dead', 'flawless'], enemies: [['skel_archer', -3, -2], ['ghoul', 1.5, -1.6], ['skel_archer', 3, -1], ['ghoul', -1, 1.4], ['goblin', 2.2, 1]], states: [[1, { progress: 7 }], [2, { stack: 4 }]], radiance: 1, hp: 58, bot: true });
      await T.wait(1400);
    },
  },
  'play-magic': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1700);
      await stagePlay(T, { dom: 'magic', next: 'heavy', hand: ['mana_backlash', 'fire_pilgrimage', 'one_flash'], enemies: [['mage', -2.5, -2], ['mage', 2, -2.5], ['mage', 1.6, 1.2], ['slime', -1.5, 0.8]], states: [[1, { awaken: true }], [2, { stack: 8 }]], radiance: 3, hp: 41, t: 640, bot: true });
      await T.wait(1400);
    },
  },
  'play-heavy': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1700);
      await stagePlay(T, { dom: 'heavy', next: 'undead', hand: ['armor_break', 'riposte', 'kings_hunt'], enemies: [['dark_knight', -2, -2.2, { guardian: true }], ['dark_knight', 2.4, -1], ['goblin', 0, 1.6]], states: [[1, { raw: { readyAt: 794.4 } }], [2, { progress: 2 }]], radiance: 4, hp: 27, t: 792, wave: 3 });
      await T.wait(900);
    },
  },
  'play-rooftop': {
    query: '?seed=11&floor=6&hand=pierce,chain_slash&mute=1&nosave=1', run: async (T) => {
      await T.key('Enter'); await T.wait(1700);
      await T.eval(() => { const B = window.__BD, w = B.world(), BD = window.BD; B.give('chain_slash', 2); B.give('sword_wave', 0); B.give('lightning', 1); w.hero.radiance = 5; w.t = 905; const boss = w.enemies.find((e) => e.boss); boss.hp = Math.round(boss.maxHp * 0.55); boss.mem.phase = 2; BD.cardRt.setStack(w, w.cards[2], 5, 'gain'); w.cards[2].state.timer = 0.6; });
      await T.eval(() => window.__BD.bot(true));
      await T.wait(1500);
    },
  },
  pause: {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1200);
      await stagePlay(T, { hand: ['flame', 'rest_of_dead', 'chain_slash'], states: [[1, { progress: 5 }], [2, { stack: 2 }]] });
      await T.key('Escape');
    },
  },
  'altar-choose': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1200);
      await stagePlay(T, { hand: ['pierce', 'rest_of_dead', 'chain_slash'], states: [[1, { progress: 4 }], [2, { stack: 2 }]], hp: 64 });
      await T.eval(() => { const w = window.__BD.world(), BD = window.BD; BD.flow.lightAltar(w); BD.flow.openAltar(w); });
      await T.wait(150);
    },
  },
  'altar-slot': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1200);
      await stagePlay(T, { hand: ['pierce', 'rest_of_dead', 'chain_slash'], states: [[1, { progress: 4 }], [2, { stack: 2 }]], hp: 64 });
      await T.eval(() => { const w = window.__BD.world(), BD = window.BD; BD.flow.lightAltar(w); BD.flow.openAltar(w); });
      await T.wait(120);
      await T.tap('offer0', 'mouse');
      await T.tap('slot1', 'mouse');
    },
  },
  'result-death': {
    init: withSave(SAVE), query: '?seed=11&hand=whirl,flame,rest_of_dead&mute=1', run: async (T) => {
      await T.key('Enter'); await T.wait(1200);
      await T.eval(() => { const w = window.__BD.world(), BD = window.BD; w.t = 410; BD.cardRt.addProgress(w, w.cards[2], 7); w.stats.dmgTaken = { 'ghoul:lunge': 42, 'goblin:stab': 30, 'zone:fire': 9 }; w.stats.kills = 61; w.stats.trials = 1; w.stats.trialSec = 24.6; w.stats.cards.whirl.contrib = 312; w.stats.cards.flame.contrib = 188; BD.flow.heroDies(w, 'ghoul:lunge'); });
      await T.waitMode('result', 5000);
    },
  },
  'result-win': {
    init: withSave(Object.assign({}, SAVE, { tierUnlocked: 0, runs: 2, rerollUnlocked: false, bestFloor: 2 })), query: '?seed=11&floor=6&hand=pierce,chain_slash,flawless&mute=1', run: async (T) => {
      await T.key('Enter'); await T.wait(1200);
      await T.eval(() => { const w = window.__BD.world(), BD = window.BD; w.t = 790; BD.cardRt.setStack(w, w.cards[1], 5, 'gain'); BD.cardRt.setStack(w, w.cards[2], 4, 'gain'); w.stats.kills = 214; w.stats.cards.pierce.contrib = 1240; const b = w.enemies.find((e) => e.boss); BD.combat.kill(w, b); });
      await T.waitMode('result', 6000);
    },
  },
  'play-touch': {
    init: withSave(Object.assign({}, SAVE, { settings: { sfx: 0.8, shake: true, dashSide: 'left', hints: false } })), query: '?seed=11&hand=whirl,riposte,flawless&mute=1', run: async (T) => {
      await T.key('Enter'); await T.wait(1700);
      await stagePlay(T, { hand: ['whirl', 'riposte', 'flawless'], enemies: [['goblin', -2, -1.5], ['slime', 2.2, -0.5]], states: [[2, { stack: 2 }]] });
      const [x0, y0] = await T.client(900, 420), [x1, y1] = await T.client(950, 390);
      await T.pointer('pointerdown', x0, y0, 31, 'touch'); await T.wait(60);
      await T.pointer('pointermove', x1, y1, 31, 'touch'); await T.wait(260);
    },
  },
  'hud-dawn-hurt': {
    query: PLAY_URL, run: async (T) => {
      await T.key('Enter'); await T.wait(1200);
      await stagePlay(T, { hand: ['lightning', 'drawcut', 'chain_slash'], enemies: [['goblin', -1.2, -0.6], ['slime', 1.6, -1.2]], states: [[1, { raw: { dist: 3, ready: true } }], [2, { stack: 2, timer: 0.5 }]], hp: 18, t: 940 });
      await T.eval(() => { const w = window.__BD.world(); window.BD.W.hurtHero(w, 6, { source: 'goblin', attack: 'stab', enemyId: 1, x: w.hero.x - 1, y: w.hero.y }); });
      await T.wait(90);
    },
  },
};

const ROTATE = { tag: 'portrait', sizes: [{ tag: '375x667', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, hasTouch: true }, { tag: '720x1280', viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 }] };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const url = H.variant({ standins: true });
  const problems = [];
  for (const [name, sc] of Object.entries(SCENES)) {
    if (!name.includes(filter)) continue;
    for (const sz of SIZES) {
      const T = await H.open(url, { query: sc.query, init: sc.init, context: { viewport: sz.viewport, deviceScaleFactor: sz.deviceScaleFactor, hasTouch: !!sz.hasTouch } });
      try {
        await sc.run(T);
        await T.wait(120);
        await T.shot(path.join(OUT, name + '-' + sz.tag + '.png'));
      } catch (err) { problems.push(name + ' ' + sz.tag + ': ' + err.message); }
      if (T.errors.length) problems.push(name + ' ' + sz.tag + ': ' + T.errors.join(' | '));
      await T.close();
    }
    console.log('shot', name);
  }
  if ('rotate'.includes(filter) || 'forced'.includes(filter) || !filter) {
    for (const sz of ROTATE.sizes) {
      const ctx = { viewport: sz.viewport, deviceScaleFactor: sz.deviceScaleFactor, hasTouch: !!sz.hasTouch };
      const shots = [
        // at launch: the prompt says a touch starts
        ['rotate-' + sz.tag, '?mute=1&nosave=1', async () => {}],
        // mid-run: a touch continues
        ['rotate-continue-' + sz.tag, PLAY_URL, async (T) => {
          const vp = T.page.viewportSize();
          await T.page.setViewportSize({ width: vp.height, height: vp.width }); await T.wait(200);
          await T.key('Enter'); await T.wait(900);
          await T.page.setViewportSize(vp); await T.wait(300);
        }],
        // forced landscape: one touch on the prompt, play drawn a quarter turn round
        ['forced-' + sz.tag, PLAY_URL, async (T) => {
          await T.tapAt(640, 360); await T.wait(1500);
          await stagePlay(T, { hand: ['whirl', 'leech', 'chain_slash'], enemies: [['goblin', -2, -1], ['goblin', 1.2, -1.5], ['slime', -1, 1], ['goblin', 2, 0.5]], states: [[2, { stack: 3 }]], radiance: 2, hp: 72, bot: true });
          await T.wait(1200);
        }],
      ];
      for (const [name, query, run] of shots) {
        const T = await H.open(url, { query, context: ctx });
        try {
          await T.wait(300);
          await run(T);
          await T.shot(path.join(OUT, name + '.png'));
        } catch (err) { problems.push(name + ': ' + err.message); }
        if (T.errors.length) problems.push(name + ': ' + T.errors.join(' | '));
        await T.close();
      }
    }
    console.log('shot rotate, rotate-continue, forced');
  }
  if ('card-icons'.includes(filter) || !filter) {
    // the 18 card icons on one sheet, each in its own socket with the card id under it
    const T = await H.open(url, { query: '?mute=1&nosave=1', context: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } });
    const data = await T.eval(() => {
      const BD = window.BD, IC = BD.ui.icons, K = BD.ui.K, CI = BD.ui.cards;
      const ids = CI.ORDER.filter((id) => BD.cards.has(id));
      const cols = 6, cw = 180, ch = 196, pad = 24, rows = Math.ceil(ids.length / cols);
      const c = document.createElement('canvas');
      c.width = cols * cw + pad * 2; c.height = rows * ch + pad * 2;
      const g = c.getContext('2d');
      g.fillStyle = '#16151b'; g.fillRect(0, 0, c.width, c.height);
      ids.forEach((id, i) => {
        const def = BD.cards.get(id), x = pad + (i % cols) * cw, y = pad + Math.floor(i / cols) * ch;
        const s = 120, sx = x + (cw - s) / 2, sy = y + 12;
        K.poly(g, [[sx - 5, sy - 5], [sx + s + 5, sy - 5], [sx + s + 5, sy + s + 5], [sx - 5, sy + s + 5]]); g.fillStyle = '#b08a3a'; g.fill(); K.ink(g, 3);
        K.poly(g, [[sx, sy], [sx + s, sy], [sx + s, sy + s], [sx, sy + s]]); g.fillStyle = '#121117'; g.fill();
        g.fillStyle = '#1c1b22'; g.fillRect(sx, sy, s, s * 0.4);
        K.poly(g, [[sx + 2, sy + 2], [sx + s - 2, sy + 2], [sx + s - 2, sy + s - 2], [sx + 2, sy + s - 2]]); g.lineWidth = 3; g.strokeStyle = K.famColor(def.family); g.stroke();
        IC.card(g, def, sx + s / 2, sy + s / 2, 84);
        g.font = '700 20px ' + BD.ui.FONT; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#f3ead8';
        g.fillText(id, x + cw / 2, sy + s + 34);
        g.font = '600 16px ' + BD.ui.FONT; g.fillStyle = K.famColor(def.family);
        g.fillText(def.name, x + cw / 2, sy + s + 56);
      });
      return c.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(OUT, 'card-icons.png'), Buffer.from(data.split(',')[1], 'base64'));
    if (T.errors.length) problems.push('card-icons: ' + T.errors.join(' | '));
    await T.close();
    console.log('shot card-icons');
  }
  if (problems.length) { console.log('PROBLEMS\n' + problems.join('\n')); process.exitCode = 1; }
})();

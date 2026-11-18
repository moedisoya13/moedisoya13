// Animation clip choice, fallback chain and timing (src/core/07_anim.js), the build's strip checks
// (tools/layers.js animMeta) and the real manifest.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../../tools/layers');

const clip = (o) => Object.assign({ file: 'x.webp', frames: 16, fw: 100, fh: 100, fps: 16, loop: true, anchor: [50, 98], charH: 90 }, o || {});

module.exports = {
  'fallback chain: exact → side → hero pose → locomotion stand-in → static code motion': (t) => {
    const BD = t.load(), A = BD.anim;
    const full = { hero: { attack_up: clip(), attack_side: clip(), move_side: clip(), idle_side: clip(), hurt: clip(), dash_side: clip() } };
    t.eq(A.resolve(full, 'hero', 'attack', 'up', false).name, 'attack_up', '1 exact');
    const side = { hero: { attack_side: clip({ strike: 4 }), move_side: clip(), move_down: clip() } };
    t.eq(A.resolve(side, 'hero', 'attack', 'up', false).name, 'attack_side', '2 side');
    t.eq(A.resolve(side, 'hero', 'move', 'down', true).name, 'move_down', 'own direction first');
    t.eq(A.resolve(side, 'hero', 'move', 'up', true).name, 'move_side', 'side when the direction is missing');
    const dash = A.resolve(side, 'hero', 'dash', 'side', true);
    t.eq([dash.name, dash.pose], [null, 'hero_dash'], '3 dash keeps the v1 shoulder-charge pose');
    const hurt = A.resolve(side, 'hero', 'hurt', 'down', false);
    t.eq([hurt.name, hurt.pose, hurt.code], [null, 'hero_hurt', 'shake']);
    t.eq(A.resolve(side, 'hero', 'die', 'side', false).pose, 'hero_hurt', 'the hero falls in his hurt pose');
    t.eq(A.resolve(full, 'hero', 'hurt', 'side', false).name, 'hurt', 'a hurt clip wins over the pose');
    // enemies
    const mv = { goblin: { move: clip() } };
    const a1 = A.resolve(mv, 'goblin', 'attack', null, true);
    t.eq([a1.name, a1.shows, a1.code], ['move', 'move', 'lunge'], '4 attacking while walking: move clip + lunge');
    const a2 = A.resolve(mv, 'goblin', 'attack', null, false);
    t.eq([a2.name, a2.code], [null, 'lunge'], '5 standing attack without idle: static + lunge');
    const i1 = A.resolve(mv, 'goblin', 'idle', null, false);
    t.eq([i1.name, i1.code], [null, 'breathe'], 'idle without idle clip: static breathing (move frame 0 is mid-stride)');
    A.IDLE_HOLDS_MOVE = true;
    const i2 = A.resolve(mv, 'goblin', 'idle', null, false);
    t.eq([i2.name, i2.hold, i2.code], ['move', true, 'breathe'], 'option: move frame 0 held');
    A.IDLE_HOLDS_MOVE = false;
    const idleOnly = { slime: { idle: clip() } };
    t.eq(A.resolve(idleOnly, 'slime', 'move', null, true).code, 'bounce', 'walking on an idle stand-in still bounces');
    t.eq(A.resolve(idleOnly, 'slime', 'idle', null, false).code, null, 'its own idle clip: no extra motion');
    const d = A.resolve(mv, 'goblin', 'die', null, false);
    t.eq([d.name, d.code], [null, 'dissolve']);
    t.eq(A.resolve({ goblin: { die: clip({ loop: false }) } }, 'goblin', 'die', null, false).name, 'die');
    for (const act of ['idle', 'move', 'attack', 'hurt', 'die']) {
      const r = A.resolve({}, 'mage', act, null, act === 'move');
      t.eq(r.name, null, 'no clips at all: static');
      t.eq(r.code, { idle: 'breathe', move: 'bounce', attack: 'lunge', hurt: 'shake', die: 'dissolve' }[act]);
    }
  },

  'frames: loop, once, hold, attack wind-up to strike and follow-through to the end': (t) => {
    const A = t.load().anim;
    const c = clip({ frames: 10, fps: 10 });
    t.eq(A.frame(c, { t: 0 }), 0); t.eq(A.frame(c, { t: 0.95 }), 9); t.eq(A.frame(c, { t: 1.05 }), 0, 'loops');
    t.eq(A.frame(clip({ frames: 10, fps: 10, loop: false }), { t: 5 }), 9, 'once: holds the last');
    t.eq(A.frame(c, { hold: true, t: 3 }), 0);
    const at = clip({ frames: 14, fps: 12, loop: false, strike: 4 });
    t.eq(A.frame(at, { p: 0 }), 0); t.eq(A.frame(at, { p: 1 }), 4, 'wind-up ends on the strike frame');
    t.eq(A.frame(at, { q: 0 }), 4); t.eq(A.frame(at, { q: 1 }), 13);
    let prev = -1;
    for (let i = 0; i <= 20; i++) { const f = A.frame(at, { p: i / 20 }); t.assert(f >= prev); prev = f; }
    for (let i = 0; i <= 20; i++) { const f = A.frame(at, { q: i / 20 }); t.assert(f >= prev); prev = f; }
    t.eq(A.strikeOf(clip({ frames: 10 })), 4, 'default strike frame without a strike field');
  },

  'hero attack: the strike frame lands on the tick of the swing, the clip fits the 0.6 s interval': (t) => {
    const BD = t.load(), A = BD.anim, H = BD.harness();
    const meta = BD.animMeta;
    t.assert(meta.hero && meta.hero.attack_side, 'the real hero attack clip is in the manifest');
    const T = A.heroAttackTiming(meta.hero.attack_side, BD.C.HERO.interval);
    t.assert(T.wind + T.follow <= BD.C.HERO.interval + 1e-9 && T.wind > 0 && T.follow > 0, JSON.stringify(T));
    H.start({ seed: 4, hand: [] }); H.killAll(); const w = H.world(); w.wave.n = 3; w.freezeT = 0;
    const e = BD.W.makeEnemy(w, 'ghoul', w.hero.x - 1.5, w.hero.y, {}); e.hp = e.maxHp = 1e6; e.def = Object.assign({}, e.def, { update() {} });
    let swings = 0, prevSwing = 0;
    const frames = [];
    w.bus.on('swing', () => swings++);
    for (let i = 0; i < 200; i++) {
      H.step(1);
      const d = A.dirOf(w.hero.face), act = A.heroAction(w.hero, meta, d.dir, false);
      const r = A.resolve(meta, 'hero', act.action, d.dir, false);
      const f = act.action === 'attack' && r.name ? A.frame(meta.hero[r.name], act.phase) : null;
      if (swings !== prevSwing) { t.eq(f, A.strikeOf(meta.hero.attack_side), 'strike frame on the swing tick ' + i); prevSwing = swings; }
      frames.push(f);
    }
    t.assert(swings >= 4, 'several swings: ' + swings);
    t.assert(frames.filter((f) => f !== null && f > A.strikeOf(meta.hero.attack_side)).length > 20, 'follow-through frames play');
  },

  'enemy attack: wind-up follows the telegraph fill, follow-through after it fires': (t) => {
    const BD = t.load(), A = BD.anim, meta = BD.animMeta, c = meta.demon_king.attack;
    const e = { kind: 'demon_king', state: 'windup', dead: false, down: null };
    const at = (tg, fire, moving) => A.frame(c, A.enemyAction(e, meta, tg, fire, moving, Infinity).phase);
    t.eq(at({ remain: 1.2, total: 1.2 }, Infinity, false), 0);
    t.eq(at({ remain: 0.6, total: 1.2 }, Infinity, false), Math.floor(0.5 * (c.strike + 1)));
    t.eq(at({ remain: 0, total: 1.2 }, Infinity, false), c.strike, 'strike frame when the warning is full');
    const F = A.enemyFollow(c);
    t.eq(at(null, 0, false), c.strike);
    t.eq(at(null, F * 0.999, false), c.frames - 1);
    t.eq(A.enemyAction(Object.assign({}, e, { state: 'idle' }), meta, null, F + 0.01, true, Infinity).action, 'move', 'then back to walking');
    t.eq(A.enemyAction(Object.assign({}, e, { state: 'idle' }), meta, null, Infinity, false, 0.1).action, 'hurt');
    t.eq(A.enemyAction(Object.assign({}, e, { down: { t: 1 } }), meta, null, Infinity, false, Infinity).action, 'die', 'a downed ghoul lies on its die frames');
  },

  'manifest: every clip passes the build checks; placeholders only on request; bad strips are refused': (t) => {
    const BD = t.load(), real = L.animMeta();
    t.eq(BD.animMeta, real.meta, 'Node sees the same clips as the build');
    for (const [char, clips] of Object.entries(real.meta)) {
      t.assert(char === 'hero' || BD.enemies.has(char), 'character ' + char + ' exists');
      for (const name of Object.keys(clips)) t.assert(BD.anim.clipNames(char).includes(name));
    }
    // a scratch anim folder: a placeholder entry and a strip whose size disagrees with frames × fw
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-anim-'));
    fs.mkdirSync(path.join(dir, '_placeholder')); fs.mkdirSync(path.join(dir, 'goblin'));
    const src = path.join(L.ROOT, 'assets/anim', real.meta.goblin.move.file);
    fs.copyFileSync(src, path.join(dir, '_placeholder/g.webp')); fs.copyFileSync(src, path.join(dir, 'goblin/move.webp'));
    const g = real.meta.goblin.move;
    const write = (m) => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
    write({ goblin: { move: Object.assign({}, g, { file: '_placeholder/g.webp' }) } });
    t.eq(Object.keys(L.animMeta({ dir }).meta), [], 'placeholder skipped by default');
    t.eq(L.animMeta({ dir, placeholders: true }).files, ['_placeholder/g.webp'], '--placeholders embeds it');
    write({ goblin: { move: Object.assign({}, g, { file: 'goblin/move.webp', fw: g.fw + 1 }) } });
    t.assert.throws(() => L.animMeta({ dir }), /strip is .* expected/);
    write({ goblin: { walk: Object.assign({}, g, { file: 'goblin/move.webp' }) } });
    t.assert.throws(() => L.animMeta({ dir }), /unknown clip name/);
    write({ goblin: { attack: Object.assign({}, g, { file: 'goblin/move.webp', strike: 99 }) } });
    t.assert.throws(() => L.animMeta({ dir }), /strike must be a frame index/);
  },
};

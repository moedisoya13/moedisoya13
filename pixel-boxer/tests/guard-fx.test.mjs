/* What a defence is drawn as (render/guard.mjs), checked on the bout's own events as the catalogue fights them:
     today's style (the switch as it is, DEFENCE) draws exactly what the game draws today, row for row: a block's and a
     parry's sparks (render/blow.mjs met), the screen's white 0.25 at a parry, and nothing at all for a miss, a graze or a
     brilliant defence; and drawing it changes nothing of the bout;
     'keep-no-white' is today's sparks, the same dice, the same number, where they were, with no white in them and no
     screen white;
     'lines-sparks' and 'lines': no white anywhere and no light, no screen white; a block 0 to 2 sparks by its impulse, a
     parry 3 or 4, a rolled shoulder 3 (and 'lines' none at all); a small ripple held to what met it, never stronger than a
     jab's hit's, and never as many motes, as thick or as long-lived as a jab's hit throws;
     'wind-line': a line only for a punch that missed by 6 cm or less (or grazed), longer for a closer miss, and none past
     6 cm;
     the brilliant defence's slow motion: 0.1 s of the bout at 0.3 of the speed, eased in and out; its line, the miss's
     line made clearer;
     and the switch: its words, and the defaults as the game is today. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFENCE, STYLES, LOOK, styleOf, whiteOf, sizeOf, noWhite, createGuard, createSlow, warpOf } from '../src/render/guard.mjs';
import { met, blow, rippleOf, FX } from '../src/render/blow.mjs';
import { createFx } from '../src/render/fx.mjs';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { SCRIPTS } from '../src/audit.mjs';
import { CLIPS_MADE, LOAD } from '../src/clips/index.mjs';

const DT = 1 / 60;
const dice = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const DEFENDING = ['block', 'parry', 'whiff', 'graze', 'brilliant'];
// (the scripts: a block on the glove, three on the guard, an elbow's and a forearm's, a parry, a rolled shoulder, misses near
// and far, a brilliant defence)
const IDS = ['block@3', 'guard@3', 'parry@3', 'parry@5m', 'block-elbow@2', 'rollCounter@4m', 'crossArm@5m', 'slip@5m', 'slip@4a', 'slip@3', 'duck@2', 'duck@5a', 'roll@3', 'counter@4m'];

/* A script fought as the catalogue fights it, its defences drawn: today's way (the game's react before render/guard.mjs:
   met at a block and a parry, the screen's white at a parry) or by a guard in a style. -> every step's rows of the ring's fx
   and of each man's, the events, what each defence asked for, the items as they were thrown */
function fight(id, how, o = {}) {
  const entry = SCRIPTS.find(e => e.id === id),
    bout = freshBout(entry),
    rnd = dice(7),
    ring = createFx(rnd),
    motes = [createFx(rnd), createFx(rnd)],
    g = how === 'today' ? null : createGuard(styleOf(how)),
    out = { rows: [], events: [], asked: [], thrown: [], g, ring, motes };
  const seen = new Set();
  for (let i = 0; i < Math.round(entry.loop / DT); i++) {
    step(bout, drive(entry, bout, i * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = 1000;
    if (g) g.see(bout.fighters);
    for (const e of bout.events) {
      if (!DEFENDING.includes(e.type)) continue;
      const before = JSON.stringify([e, bout.fighters.map(f => f.points)]);
      let d;
      if (!g) {
        if (e.type === 'block' || e.type === 'parry') met(ring, e);
        d = { white: e.type === 'parry' ? 0.25 : 0, ripple: null, slow: false };
      } else d = g.meet(e, bout.fighters, ring, motes);
      // (nothing of the bout is changed by drawing it)
      assert.equal(JSON.stringify([e, bout.fighters.map(f => f.points)]), before, `${id}: ${e.type} changed by drawing it`);
      out.events.push(JSON.parse(JSON.stringify(e)));
      out.asked.push({ type: e.type, white: d.white, ripple: d.ripple && d.ripple.ripple, slow: d.slow });
    }
    for (const f of [ring, ...motes])
      for (const it of f.items)
        if (!seen.has(it)) (seen.add(it), out.thrown.push({ it, step: i, spark: !!it.v, fx: f === ring ? 'ring' : 'motes' }));
    if (o.age !== false) out.rows.push([ring, ...motes].map(f => Array.from(f.rows.slice(0, f.update(DT) * 12))));
  }
  return out;
}
const colours = it => (Array.isArray(it.pal) ? it.pal : [it.pal]);
const length = items => items.filter(x => !x.spark).reduce((s, { it }) => s + Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1], it.b[2] - it.a[2]), 0);
// (a jab's hit, as render/blow.mjs draws it: how many motes, how thick, the ripple's strength and sway)
const JAB = (() => {
  const entry = SCRIPTS.find(e => e.id === 'hit-jab'),
    bout = freshBout(entry);
  for (let i = 0; i < Math.round(entry.loop / DT); i++) {
    step(bout, drive(entry, bout, i * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    const e = bout.events.find(x => x.type === 'hit');
    if (e) {
      const fx = createFx(dice(7)),
        n = blow(fx, e, bout.fighters[e.on]),
        r = rippleOf(e, bout.fighters[e.on]);
      return { J: e.J, n, width: Math.max(...fx.items.map(it => it.width)), life: Math.max(...fx.items.map(it => it.life)), strength: r.strength, sway: r.strength * r.sway, last: r.last };
    }
  }
  throw new Error('hit-jab: no hit');
})();

test('the switch: today\'s by default, its words alone or as item:word, and nothing it does not know', () => {
  assert.deepEqual(DEFENCE, { amount: 'now', evade: 'none', parryWhite: 'keep', brilliant: 'none' });
  for (const k of Object.keys(STYLES)) assert.equal(STYLES[k][0], DEFENCE[k], `${k}: the first style is today's`);
  assert.deepEqual(styleOf(), DEFENCE);
  assert.deepEqual(styleOf(''), DEFENCE);
  assert.deepEqual(styleOf('lines-sparks,wind-line,slow,remove'), { amount: 'lines-sparks', evade: 'wind-line', parryWhite: 'remove', brilliant: 'slow' });
  assert.deepEqual(styleOf('evade:none,brilliant:line'), Object.assign({}, DEFENCE, { brilliant: 'line' }));
  assert.deepEqual(styleOf({ amount: 'lines' }), Object.assign({}, DEFENCE, { amount: 'lines' }));
  assert.throws(() => styleOf('none'), /say which/);
  assert.throws(() => styleOf('sparkles'), /no such style/);
  assert.throws(() => styleOf({ amount: 'loud' }), /none of/);
  assert.equal(whiteOf(DEFENCE), 0.25);
  assert.equal(whiteOf(styleOf('remove')), 0);
  for (const a of ['keep-no-white', 'lines-sparks', 'lines']) assert.equal(whiteOf(styleOf(a)), 0, a);
  assert.deepEqual(noWhite([38, 25, 24]), [25, 25, 24]);
  assert.deepEqual(noWhite([38, 38, 39, 40]), [39, 39, 39, 40]);
});

test('today\'s style draws exactly what the game draws today: the same rows, step by step, and the white at a parry', () => {
  let events = 0;
  for (const id of IDS) {
    const now = fight(id, 'today'),
      guard = fight(id, '');
    assert.deepEqual(guard.events, now.events, `${id}: the events`);
    assert.deepEqual(guard.asked, now.asked, `${id}: what each defence asked for`);
    assert.equal(guard.rows.length, now.rows.length);
    guard.rows.forEach((r, i) => assert.deepEqual(r, now.rows[i], `${id}: the rows at step ${i}`));
    events += now.events.length;
  }
  assert.ok(events >= 20, `${events} defences`);
});

test('drawing a defence in any style changes nothing of the bout: the same events, step by step', () => {
  for (const id of ['parry@3', 'rollCounter@4m', 'counter@4m', 'duck@2', 'block-elbow@2']) {
    const now = fight(id, 'today', { age: false });
    for (const how of ['keep-no-white', 'lines-sparks,wind-line,slow', 'lines,wind-line,line']) assert.deepEqual(fight(id, how, { age: false }).events, now.events, `${id} ${how}`);
  }
});

test('keep-no-white: today\'s sparks, as many, where they were, with no white in them and no screen white', () => {
  for (const id of ['block@3', 'guard@3', 'parry@3', 'rollCounter@4m']) {
    const now = fight(id, 'today'),
      kept = fight(id, 'keep-no-white');
    assert.equal(kept.thrown.length, now.thrown.length, id);
    kept.thrown.forEach((x, i) => {
      assert.deepEqual([x.it.a, x.it.v, x.it.life, x.it.width], [now.thrown[i].it.a, now.thrown[i].it.v, now.thrown[i].it.life, now.thrown[i].it.width], `${id}: spark ${i} where today's is`);
      assert.ok(!colours(x.it).includes(38), `${id}: no white`);
      assert.deepEqual(colours(x.it), noWhite(colours(now.thrown[i].it)), `${id}: today's colours less the white`);
    });
    assert.ok(now.thrown.some(x => colours(x.it).includes(38)), `${id}: today's have white`);
    for (const a of kept.asked) assert.equal(a.white, 0, `${id}: no screen white`);
  }
});

test('lines-sparks and lines: lines and small ripples, a few sparks or none, no white, no light, never bigger than a jab\'s hit', () => {
  assert.ok(JAB.J > 30 && JAB.J < 50 && JAB.n >= 10, `a jab's hit: ${JAB.J} N s, ${JAB.n} motes`);
  for (const amount of ['lines-sparks', 'lines'])
    for (const id of ['block@3', 'guard@3', 'parry@3', 'parry@5m', 'block-elbow@2', 'rollCounter@4m', 'crossArm@5m']) {
      const r = fight(id, amount),
        sparks = r.thrown.filter(x => x.spark),
        lines = r.thrown.filter(x => !x.spark);
      assert.ok(r.events.length, `${id}: a defence`);
      for (const a of r.asked) {
        assert.equal(a.white, 0, `${id} ${amount}: no screen white`);
        if (a.ripple) assert.ok(a.ripple.strength <= JAB.strength + 1e-9 && a.ripple.strength * a.ripple.sway <= JAB.sway + 1e-9 && a.ripple.last < JAB.last, `${id}: a ripple no stronger, swaying no further and lasting no longer than a jab's hit's`);
      }
      for (const { it } of r.thrown) {
        assert.ok(!colours(it).includes(38) && !colours(it).includes(14), `${id} ${amount}: no white`);
        assert.ok(it.width <= JAB.width + 1e-9, `${id}: no thicker than a jab's motes (${it.width})`);
      }
      // (no light: every row it wrote is an ordinary splat, or one pulled nearer the eye, never a speck of light)
      for (const rows of r.rows) for (const fx of rows) for (let o = 0; o < fx.length; o += 12) assert.ok(fx[o + 10] <= 0, `${id}: a speck of light`);
      if (amount === 'lines') assert.equal(sparks.length, 0, `${id}: lines alone throw no sparks`);
      else assert.ok(sparks.length < JAB.n, `${id}: ${sparks.length} sparks`);
      // (a parry's or a block's line is there; the shoulder's is its own)
      assert.ok(lines.length > 0, `${id} ${amount}: a line`);
      // (and nothing of it is drawn over the man defending, but a rolled shoulder's line, which lies on him)
      for (const x of lines) if (id !== 'rollCounter@4m') assert.equal(x.fx, 'motes', `${id}: a line off his silhouette`);
    }
});

test('lines-sparks: a block throws 0 to 2 sparks by its impulse, a parry 3 or 4, a rolled shoulder 3; the ripple by the impulse too', () => {
  const count = (id, type) => {
    const r = fight(id, 'lines-sparks');
    return r.thrown.filter(x => x.spark).length;
  };
  // (block@3: a cross on the glove, 23.4 N s; guard@3: two jabs and a cross, 38, 1.5 and 23.3; a parry of a jab, 39)
  assert.equal(count('block@3'), 1);
  assert.equal(count('guard@3'), 2 + 0 + 1);
  assert.equal(count('parry@3'), 4);
  assert.equal(count('rollCounter@4m'), 3);
  // (by the impulse, on the same block: none for a touch, one, two from a jab's up, and never more)
  const e0 = fight('block@3', 'today', { age: false }).events.find(e => e.type === 'block');
  const at = J => {
    const entry = SCRIPTS.find(e => e.id === 'block@3'),
      bout = freshBout(entry),
      g = createGuard(styleOf('lines-sparks')),
      ring = createFx(dice(1)),
      motes = [createFx(dice(1)), createFx(dice(1))];
    for (let i = 0; i < 55; i++) step(bout, drive(entry, bout, i * DT, DT), DT), g.see(bout.fighters);
    const d = g.meet(Object.assign({}, e0, { J }), bout.fighters, ring, motes);
    return { sparks: [ring, ...motes].reduce((n, f) => n + f.items.filter(it => it.v).length, 0), strength: d.ripple.ripple.strength, lines: motes[0].items.length };
  };
  const s = [5, 23.4, 40, 120].map(at);
  assert.deepEqual(s.map(x => x.sparks), [0, 1, 2, 2]);
  assert.ok(s[0].strength < s[2].strength && s[1].strength < s[2].strength && s[3].strength === s[2].strength && s[2].strength <= JAB.strength, s.map(x => x.strength).join(' '));
  assert.equal(sizeOf({ J: LOOK.jab / 2 }), 0.5);
  assert.equal(sizeOf({ J: 400 }), 1);
});

test('wind-line: a line along a punch that missed by 6 cm or less, longer the closer; none past 6 cm; none by default', () => {
  const linesOf = (id, how) => fight(id, how).thrown.filter(x => !x.spark);
  const near = {};
  // (slip@4a 0.73 cm, slip@5m 2.84, duck@2 2.34, roll@3 1.45: drawn; slip@3 6.06, duck@5a 17.41: not)
  for (const id of ['slip@4a', 'slip@5m', 'duck@2', 'roll@3']) {
    const r = fight(id, 'wind-line'),
      miss = r.events.find(e => e.type === 'whiff');
    assert.ok(miss.margin <= LOOK.wind.within, `${id}: ${miss.margin}`);
    const lines = r.thrown.filter(x => !x.spark);
    assert.ok(lines.length > 0, `${id}: a line for a miss of ${(miss.margin * 100).toFixed(1)} cm`);
    assert.ok(lines.every(x => x.fx === 'motes' && x.step === lines[0].step), `${id}: drawn at once, off his silhouette: ${lines.map(x => x.fx + x.step).join(' ')}`);
    near[id] = { margin: miss.margin, long: length(lines) };
  }
  for (const id of ['slip@3', 'duck@5a']) {
    const r = fight(id, 'wind-line');
    assert.ok(r.events.find(e => e.type === 'whiff').margin > LOOK.wind.within, id);
    // (the cross duck@5a blocks first throws today's sparks: no line of any kind)
    assert.equal(r.thrown.filter(x => !x.spark).length, 0, `${id}: no line past 6 cm`);
  }
  for (const id of ['slip@4a', 'duck@2']) assert.equal(linesOf(id, '').length, 0, `${id}: nothing by default`);
  // (the closer, the longer: as long as the path near his head allows)
  assert.ok(near['slip@4a'].long > near['slip@5m'].long, JSON.stringify(near));
  for (const { margin, long } of Object.values(near)) assert.ok(long <= LOOK.wind.length[1] + 0.02 && long >= LOOK.wind.length[0] * 0.8 * (1 - margin / LOOK.wind.within) - 1e-9, `${long}`);
});

test('a brilliant defence: the slow motion (0.1 s of the bout at 0.3 of the speed, eased), its clearer line, or nothing', () => {
  // (the slow motion on its own: down to 0.3 in 0.04 s, held while the bout goes 0.1 s, back to full in 0.08 s)
  const slow = createSlow(1);
  let s = slow,
    t = 1,
    real = 0,
    least = 1;
  const paces = [];
  while (s && real < 2) {
    const p = s.pace();
    paces.push(p);
    least = Math.min(least, p);
    real += 1 / 240;
    t += p / 240;
    s = s.on(1 / 240, t);
  }
  assert.equal(paces[0], 1);
  assert.ok(Math.abs(least - LOOK.slow.rate) < 1e-9 && LOOK.slow.rate === 0.3, `${least}`);
  // (held slow until the bout is 0.1 s on, and a little more of it as it eases back)
  assert.ok(t - 1 >= LOOK.slow.span && t - 1 < LOOK.slow.span + 0.07, `bout seconds in it: ${t - 1}`);
  assert.ok(real > 0.3 && real < 0.5, `real seconds: ${real}`);
  // (eased: never more than a seventh of the way from full speed to its slowest in a 240th of a second)
  for (let i = 1; i < paces.length; i++) assert.ok(Math.abs(paces[i] - paces[i - 1]) < 0.15, 'eased');
  // (in the game: the brilliant defence of counter@4m starts it; 'line' makes the miss's line clearer; 'none' does nothing)
  const slowed = fight('counter@4m', 'wind-line,slow');
  assert.ok(slowed.asked.some(a => a.type === 'brilliant' && a.slow) && slowed.g.slow, 'the slow started');
  const lined = fight('counter@4m', 'wind-line,line'),
    plain = fight('counter@4m', 'wind-line');
  assert.ok(lined.thrown.filter(x => !x.spark).some(x => colours(x.it).includes(LOOK.clear.colours[0])), 'the clearer line');
  assert.ok(!plain.thrown.some(x => colours(x.it).includes(LOOK.clear.colours[0])) && !plain.g.slow, 'none: as the miss is drawn');
  // (and drawn clear from where the punch went, if no line was drawn at the miss)
  assert.ok(fight('counter@4m', 'evade:none,brilliant:line').thrown.some(x => !x.spark && colours(x.it).includes(LOOK.clear.colours[0])), 'a line for a brilliant defence with no wind line');
  assert.equal(fight('counter@4m', 'evade:none,brilliant:none').thrown.length, 0);
});

test('a recorded clip played with the brilliant slow: at true speed but for 0.1 s of it at 0.3, eased', async () => {
  const mod = await LOAD['dg-brilliant'](),
    frames = Array.from({ length: mod.FRAMES }, () => ({ events: [] }));
  for (const [k, e] of mod.EVENTS) frames[k].events.push(e);
  const k0 = frames.findIndex(f => f.events.some(e => e.type === 'brilliant'));
  assert.ok(k0 > 0 && CLIPS_MADE['dg-brilliant'].measured.brilliant, 'the clip keeps the brilliant defence');
  assert.equal(warpOf(styleOf('line'), frames), null);
  const w = warpOf(styleOf('slow'), frames),
    plain = (frames.length - 1) / 60;
  assert.ok(w.span > plain + 0.15 && w.span < plain + 0.3, `${w.span} for ${plain}`);
  assert.equal(w.pace(0.05), 1);
  assert.ok(Math.abs(w.at(k0 / 60 - 0.01) - (k0 - 0.6)) < 0.15, 'true speed before it');
  assert.ok(Math.abs(w.pace(k0 / 60 + 0.1) - LOOK.slow.rate) < 1e-9, 'slow in it');
  assert.ok(Math.abs(w.at(w.span) - (frames.length - 1)) < 0.05 && w.pace(w.span) === 1, 'all of it, at full speed again by the end');
});

test('the jab whose hit no defence is drawn bigger than is the effect lab\'s light blow, and its numbers are blow.mjs\'s', () => {
  assert.ok(Math.abs(JAB.J - LOOK.jab) < 1, `${JAB.J}`);
  assert.ok(Math.abs(LOOK.ripple.strength - JAB.strength) < 0.01 && LOOK.ripple.strength <= JAB.strength, 'the ripple: a jab\'s hit\'s strength');
  assert.equal(LOOK.ripple.sway, FX.ripple.sway);
});

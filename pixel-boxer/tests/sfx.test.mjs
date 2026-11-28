/* The sounds (game/audio.mjs): the bout's events mapped to sounds in one place that the game and the sparring both use, the
   breath of every punch, impacts that grow with the impulse, a cap on the voices, and nothing thrown where there is no audio.
   Under node there is no AudioContext: a fake one records what is made and scheduled, and refuses what a real one refuses. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAudio, createEars, cuesOf, panOf, punchOf, tiredOf, COUNTER_GAIN, QUIET, LIMIT, NAMES, STRIDE, SPOT, KO_WAIT, CLEAN } from '../src/game/audio.mjs';
import { FALL } from '../src/replay.mjs';
import { createBout, step, RULES } from '../src/game/bout.mjs';
import { createRival, think } from '../src/game/ai.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

// ---- a fake AudioContext: nodes that connect, params that keep their automation, and a clock moved by hand
function fakeContext() {
  const made = { sources: 0, nodes: 0, ramps: [], params: [] };
  const param = v => made.params[made.params.push({
    value: v,
    events: [],
    inputs: 0,
    setValueAtTime(x, t) {
      assert.ok(Number.isFinite(x) && Number.isFinite(t), 'a finite value and time');
      this.events.push(['set', x, t]);
    },
    linearRampToValueAtTime(x, t) {
      assert.ok(Number.isFinite(x) && Number.isFinite(t));
      this.events.push(['lin', x, t]);
    },
    exponentialRampToValueAtTime(x, t) {
      // (as a real one: an exponential ramp to zero or below is a RangeError)
      if (!(x > 0)) throw new RangeError('exponential ramp to ' + x);
      this.events.push(['exp', x, t]);
      made.ramps.push(x);
    },
    setTargetAtTime(x, t, k) {
      assert.ok(k > 0);
      this.events.push(['target', x, t]);
    },
    cancelScheduledValues() {
      this.events.push(['cancel']);
    }
  }) - 1];
  const node = more => {
    made.nodes++;
    // (a node connected to a param: counted on the param, so a test can see what swings it)
    return Object.assign({ connect: n => (n && n.events && (n.inputs += 1), n), disconnect() {} }, more);
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: node(),
    made,
    resume() {},
    createBuffer: (ch, n, sr) => ({ getChannelData: () => new Float32Array(n), sampleRate: sr }),
    createGain: () => node({ gain: param(1) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1) }),
    createDynamicsCompressor: () => node({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createOscillator: () => {
      made.sources++;
      return node({
        type: 'sine',
        frequency: param(440),
        start(t) {
          assert.ok(t >= 0);
        },
        stop(t) {
          assert.ok(t >= 0);
        }
      });
    },
    createBufferSource: () => {
      made.sources++;
      return node({
        buffer: null,
        loop: false,
        start(t, off) {
          assert.ok(t >= 0 && (off === undefined || off >= 0));
        },
        stop() {}
      });
    }
  };
  return ctx;
}
const fresh = () => {
  const context = fakeContext(),
    audio = createAudio({ context, random: () => 0.5 });
  audio.unlock();
  return { audio, context };
};

// (every kind of event the bout puts out: its literal types, and those it pushes by the name of what was pressed, an evasion
// (EVADE) or a duck in or a hop out)
function eventTypes() {
  const src = read('src/game/bout.mjs'),
    literal = [...src.matchAll(/type: '(\w+)'/g)].map(m => m[1]);
  assert.match(src, /const EVADE = \['slip', 'duck', 'roll', 'pull'\];/);
  assert.match(src, /what === 'duckIn' \|\| what === 'hopPivot' \|\| what === 'hopCircle'\) \{\n.*\n\s*bout\.events\.push\(\{ type: what, who \}\);/);
  return [...new Set([...literal, 'slip', 'duck', 'roll', 'pull', 'duckIn', 'hopPivot', 'hopCircle'])].sort();
}
// (an event of each type, as the bout makes it)
const sample = type =>
  ({
    punch: { type, who: 0, name: 'cross' },
    hit: { type, who: 0, on: 1, J: 85, name: 'cross', kind: 'straight', hand: 'R', part: 'glove', counter: false, down: false },
    block: { type, who: 0, on: 1, J: 60, name: 'hook', part: 'glove' },
    parry: { type, who: 1, on: 0, J: 50, name: 'jab' },
    graze: { type, who: 0, on: 1, J: 4 },
    whiff: { type, who: 0, name: 'jab', margin: 0.05 },
    foul: { type, name: 'stomp', who: 0, on: 1, J: 20 },
    paw: { type, name: 'pawDown', who: 0, on: 1 },
    collar: { type, who: 0, on: 1 },
    taunt: { type, name: 'shimmy', who: 0 }
  })[type] || { type, who: 0, on: 1 };

test('every event the bout puts out is mapped: to its sounds, or quiet by design', () => {
  const types = eventTypes();
  assert.ok(types.length >= 25, types.join(' '));
  for (const type of types) {
    const cues = cuesOf(sample(type), { men: [] });
    if (QUIET.includes(type)) assert.deepEqual(cues, [], type);
    else assert.ok(cues.length > 0 && cues.every(q => NAMES.includes(q.name)), `${type} -> ${JSON.stringify(cues)}`);
  }
  // (and the quiet ones are all the bout's)
  for (const q of QUIET) assert.ok(types.includes(q), q);
  // (the page's own: a man coming down on the canvas)
  assert.deepEqual(cuesOf({ type: 'floor', who: 1 }, { pit: true }).map(q => q.name), ['floor']);
  assert.deepEqual(cuesOf({ type: 'nothing' }), []);
});

test('a punch is breathed at its launch: a jab short and high, a hook longer sweeping down, a power blow voiced; only big arcs swing', () => {
  const names = e => cuesOf(e, {}).map(q => q.name);
  assert.deepEqual(names({ type: 'punch', who: 0, name: 'jab' }), ['breath']);
  assert.deepEqual(names({ type: 'punch', who: 0, name: 'cross' }), ['breath']);
  assert.deepEqual(names({ type: 'punch', who: 0, name: 'hook' }), ['breath', 'swing']);
  assert.deepEqual(names({ type: 'punch', who: 1, name: 'hookR' }), ['breath', 'swing']);
  assert.equal(punchOf('jab').breath, 'jab');
  assert.equal(punchOf('cross').breath, 'straight');
  assert.equal(punchOf('upper').power, true);
  assert.equal(punchOf('hook').power, false);
  const { audio } = fresh(),
    jab = audio.play('breath', { who: 0, kind: 'jab' }),
    hook = audio.play('breath', { who: 1, kind: 'hook' });
  assert.ok(jab.dur < hook.dur, `${jab.dur} ${hook.dur}`);
  assert.ok(jab.dur >= 0.05 && hook.dur <= 0.16, `${jab.dur} ${hook.dur}`);
  // (a tired man's: longer; a taunt's: soft)
  const tired = cuesOf({ type: 'punch', who: 0, name: 'cross' }, { men: [{ stamina: 0, k: { staminaMax: 10 } }] })[0];
  assert.equal(tired.o.tired, 1);
  const a = fresh().audio.play('breath', { who: 0, kind: 'straight' }),
    b = fresh().audio.play('breath', { who: 0, kind: 'straight', tired: 1 });
  assert.ok(b.dur > a.dur * 1.4, `${a.dur} ${b.dur}`);
  assert.ok(cuesOf({ type: 'taunt', who: 0, name: 'x' })[0].o.soft < 0.5);
  assert.equal(tiredOf({ stamina: 10, k: { staminaMax: 10 } }), 0);
});

test('an impact grows smoothly with the impulse: level and length rise with J, a counter lands harder, the struck man voices it', () => {
  const at = J => fresh().audio.play('impact', { J, where: 'head' });
  let was = null;
  for (let J = 20; J <= 140; J += 10) {
    const now = at(J);
    if (was) assert.ok(now.level > was.level && now.dur > was.dur, `J ${J}: ${was.level}->${now.level}, ${was.dur}->${now.dur}`);
    was = now;
  }
  // (no two-step switch: the step between neighbours is never more than a fifth of the level)
  for (let J = 20; J < 140; J += 2) assert.ok(at(J + 2).level - at(J).level < 0.2 * at(J).level);
  // (a body blow longer than a head's of the same J)
  assert.ok(fresh().audio.play('impact', { J: 85, where: 'body' }).dur > at(85).dur);
  // (a counter: its J by the bout's own gain, and a crack)
  assert.equal(COUNTER_GAIN, RULES.counterGain);
  const c = cuesOf({ type: 'hit', who: 0, on: 1, J: 50, part: 'glove', counter: true }, {});
  assert.equal(c[0].o.J, 50 * RULES.counterGain);
  assert.equal(c[0].o.counter, true);
  // (no hurt voice from the struck man, light or heavy, head or body: dropped, the user's answer of 2026-11-28, sound-hurt;
  // a knockdown's long breath out stays, and its bell, held for after the replay)
  const voice = e => cuesOf(Object.assign({ type: 'hit', who: 0, on: 1, part: 'glove' }, e), {}).map(q => q.name);
  assert.deepEqual(voice({ J: 30 }), ['impact']);
  assert.deepEqual(voice({ J: 90 }), ['impact']);
  assert.deepEqual(voice({ J: 140 }), ['impact']);
  assert.deepEqual(voice({ J: 60, part: 'body' }), ['impact']);
  assert.deepEqual(voice({ J: 140, part: 'body' }), ['impact']);
  assert.deepEqual(voice({ J: 120, down: true }), ['impact', 'exhale', 'bell']);
  assert.equal(cuesOf({ type: 'hit', who: 0, on: 1, J: 120, part: 'glove', down: true }, {}).find(q => q.name === 'bell').o.ko, true);
  for (const gone of ['grunt', 'gasp', 'pant']) assert.ok(!NAMES.includes(gone), gone);
  assert.deepEqual(cuesOf({ type: 'buckle', who: 1 }, {}), []);
  // (the pit's crowd as before: a cheer at a power blow or a counter, a roar at a knockdown; no crowd and no bell in a replay)
  assert.deepEqual(cuesOf({ type: 'hit', who: 0, on: 1, J: 70, part: 'glove' }, { pit: true }).map(q => q.name), ['impact', 'cheer']);
  assert.deepEqual(cuesOf({ type: 'hit', who: 0, on: 1, J: 120, part: 'glove', down: true }, { pit: true, replay: true }).map(q => q.name), ['impact', 'exhale']);
});

test('block, parry and graze: slaps and a brush, no bells; a parry by the player opens his counter', () => {
  const { audio, context } = fresh();
  const before = context.made.ramps.length;
  assert.ok(audio.play('block', { J: 60, part: 'glove' }));
  assert.ok(audio.play('parry', { who: 1 }));
  assert.ok(audio.play('graze', { who: 0 }));
  assert.ok(context.made.ramps.length > before);
  // (the old sword game's names still play, as what they are now)
  for (const n of ['hit', 'heavy', 'deflect', 'dodge', 'swing', 'whiff', 'step', 'cheer', 'roar', 'win', 'lose', 'chance']) assert.ok(fresh().audio.play(n), n);
  assert.deepEqual(cuesOf({ type: 'parry', who: 0, on: 1 }, { you: 0 }).map(q => q.name), ['parry', 'chance']);
  assert.deepEqual(cuesOf({ type: 'parry', who: 0, on: 1 }, { you: null }).map(q => q.name), ['parry']);
});

test('the voices are capped, louder ones take the quietest places, and the same sound for the same man waits its gap', () => {
  const { audio, context } = fresh();
  // (two dozen quiet steps at once, all different men's keys apart by delay: no more than the cap sound together)
  for (let i = 0; i < 30; i++) audio.play('step', { who: i, delay: 0 });
  assert.equal(audio.voices, LIMIT.voices);
  // (an impact still gets in, in a step's place; a step does not, over the impact's)
  assert.ok(audio.play('impact', { J: 90, who: 0 }));
  assert.equal(audio.voices, LIMIT.voices);
  for (let i = 0; i < LIMIT.voices; i++) audio.play('impact', { J: 90, who: 100 + i });
  assert.equal(audio.play('step', { who: 999 }), null);
  // (the same one, the same man, too soon: not again; the other man: yes; later: yes)
  const b = fresh();
  assert.ok(b.audio.play('breath', { who: 0, kind: 'jab' }));
  assert.equal(b.audio.play('breath', { who: 0, kind: 'jab' }), null);
  assert.ok(b.audio.play('breath', { who: 1, kind: 'jab' }));
  b.context.currentTime = 0.05;
  assert.ok(b.audio.play('breath', { who: 0, kind: 'jab' }));
  assert.ok(context.made.sources > 0);
});

test('nothing is thrown or played where there is no audio, before the first touch, or muted', () => {
  const saved = [globalThis.AudioContext, globalThis.webkitAudioContext];
  try {
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
    const audio = createAudio();
    assert.equal(audio.play('impact', { J: 80 }), null);
    audio.unlock();
    assert.equal(audio.play('impact', { J: 80 }), null);
    assert.deepEqual(audio.hear({ type: 'punch', who: 0, name: 'jab' }, {}), []);
    assert.deepEqual(audio.watch([{ x: 0, z: 0 }], 1 / 60, {}), []);
    audio.ambience('pit');
    audio.mute(true);
    audio.reset();
    // (an AudioContext that cannot be made: still silent, still no throw)
    globalThis.AudioContext = function () {
      throw new Error('not allowed');
    };
    const refused = createAudio();
    refused.unlock();
    assert.equal(refused.play('bell'), null);
  } finally {
    [globalThis.AudioContext, globalThis.webkitAudioContext] = saved;
  }
  // (locked: made, never unlocked)
  assert.equal(createAudio({ context: fakeContext() }).play('breath', { kind: 'jab' }), null);
  // (muted)
  const { audio } = fresh();
  audio.mute(true);
  assert.equal(audio.play('impact', { J: 80 }), null);
  audio.mute(false);
  assert.ok(audio.play('impact', { J: 80 }));
  assert.equal(createAudio({ context: fakeContext() }).play('no such sound'), null);
});

test('every sound can be made at the true speed and in the slowed replay, lower and longer there', () => {
  for (const name of NAMES)
    for (const rate of [1, 0.25]) {
      const made = fresh().audio.play(name, { who: 1, J: 100, kind: 'hook', power: true, tired: 0.8, strikes: 3, pit: rate < 1, counter: true, down: true, rate });
      assert.ok(made && made.dur > 0 && made.level > 0, name);
    }
  const live = fresh().audio.play('breath', { who: 0, kind: 'jab' }),
    slow = fresh().audio.play('breath', { who: 0, kind: 'jab', rate: 0.25 });
  assert.ok(slow.dur > live.dur * 1.8, `${live.dur} ${slow.dur}`);
  // (and the replay's events come with their rate: cast through hear)
  const { audio } = fresh(),
    [played] = audio.hear({ type: 'punch', who: 0, name: 'jab' }, { rate: 0.25, replay: true });
  assert.ok(played.dur > live.dur * 1.8);
});

test('a man is heard where he is in the picture: right of the camera on the right, never past ±0.4', () => {
  const c = { men: [{ x: -3, z: 0 }, { x: 3, z: 0 }], yaw: 0, target: [0, 0, 0] };
  assert.ok(panOf(c, 0) < 0 && panOf(c, 1) > 0);
  assert.equal(Math.abs(panOf(c, 1)), LIMIT.pan);
  // (the camera round the other side: the sides swap)
  assert.ok(panOf(Object.assign({}, c, { yaw: Math.PI }), 1) < 0);
  assert.equal(panOf(c, 5), 0);
  const [made] = fresh().audio.hear({ type: 'punch', who: 1, name: 'jab' }, c);
  assert.equal(made.pan, LIMIT.pan);
});

test('the state between events: a step for every stride walked, the ropes taking a man, and no panting (the hurt voice dropped)', () => {
  const ears = createEars(),
    man = { x: 0, z: 0, k: { staminaMax: 10 }, stamina: 10, action: null },
    heard = [];
  for (let i = 0; i < 120; i++) {
    man.x += 1.2 / 60;
    heard.push(...ears.watch([man], 1 / 60, {}));
  }
  const steps = heard.filter(q => q.name === 'step').length;
  assert.equal(steps, Math.floor((1.2 * 119) / 60 / STRIDE + 1e-9));
  man.rope = { press: 0.6 };
  assert.deepEqual(ears.watch([man], 1 / 60, {}).map(q => q.name), ['rope']);
  assert.deepEqual(ears.watch([man], 1 / 60, {}), []);
  // (in the pit there are no ropes)
  man.rope = null;
  ears.watch([man], 1 / 60, { pit: true });
  man.rope = { press: 0.6 };
  assert.deepEqual(ears.watch([man], 1 / 60, { pit: true }), []);
  man.rope = null;
  man.stamina = 0;
  // (a spent man standing still: nothing at all, his panting dropped with the struck man's voice, sound-hurt)
  const still = [];
  for (let i = 0; i < 240; i++) still.push(...ears.watch([man], 1 / 60, {}));
  assert.deepEqual(still, []);
});

test('a real bout heard through the mapping: every punch breathed, every blow sized, nothing thrown', () => {
  const bout = createBout(7),
    rival = createRival(3),
    { audio } = fresh(),
    ears = createEars(),
    seen = new Map();
  for (let i = 0; i < 60 * 40 && bout.over === null; i++) {
    step(bout, [i % 50 < 3 ? { jab: i % 100 < 3, power: i % 100 >= 50 && i % 100 < 53 } : {}, think(rival, bout, 1 / 60)], 1 / 60);
    for (const e of bout.events) {
      const cues = cuesOf(e, { men: bout.fighters });
      seen.set(e.type, (seen.get(e.type) || 0) + 1);
      if (e.type === 'punch') assert.equal(cues[0].name, 'breath');
      if (e.type === 'hit') assert.equal(cues[0].name, 'impact');
      if (!QUIET.includes(e.type)) assert.ok(cues.length, e.type);
      audio.hear(e, { men: bout.fighters, yaw: 0.3, target: [0, 0.8, 0] });
    }
    ears.watch(bout.fighters, 1 / 60, {});
    audio.watch(bout.fighters, 1 / 60, {});
  }
  assert.ok(seen.get('punch') > 5, JSON.stringify([...seen]));
  assert.ok((seen.get('hit') || 0) + (seen.get('block') || 0) + (seen.get('whiff') || 0) > 0, JSON.stringify([...seen]));
});

test('the game and the sparring hear the bout through the one mapping, the same way', () => {
  for (const page of ['src/main.mjs', 'src/spar.mjs']) {
    const src = read(page),
      react = src.slice(src.indexOf('function react(e)'), src.indexOf('\n  }\n', src.indexOf('function react(e)')));
    assert.match(react, /audio\.hear\(e, heard\(\)\)/, page);
    // (no sound named for an event of the bout in the page itself)
    assert.doesNotMatch(src, /play\('(swing|hit|heavy|deflect|dodge|whiff|cheer|roar|chance|impact|breath|block|parry)'/, page);
    assert.match(src, /audio\.watch\(bout\.fighters, DT, heard\(\)\)/, page);
    assert.match(src, /audio\.hear\(\{ type: 'floor', who: i \}, heard\(\)\)/, page);
    // (and the knockdown's replay heard again, slowed)
    assert.match(src, /audio\.hear\(e, heard\((k|st)\.men, slow\)\)/, page);
    assert.match(src, /audio\.play\('bell', \{ strikes: 1 \}\)/, page);
  }
  // (the audition page plays through the same mapping; it replays nothing, so its knockout bell is not held; and it plays
  // none of the dropped voices)
  assert.match(read('src/sfx.mjs'), /audio\.hear\(/);
  assert.match(read('src/sfx.mjs'), /replays: false/);
  assert.doesNotMatch(read('src/sfx.mjs'), /play\('(grunt|gasp|pant)'/);
});

test('the audition page builds with its modules alone, and the committed page is left as it is', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
    out = path.join(mkdtempSync(path.join(tmpdir(), 'sfx-')), 'sfx.out.html'),
    files = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools/artifact.mjs'), 'sfx.html', 'src/sfx.mjs', out], { cwd: root, encoding: 'utf8' })),
    page = readFileSync(out, 'utf8');
  assert.match(page, /^<title>타격음 오디션<\/title>/);
  assert.deepEqual(Object.keys(files).sort(), ['src/anim/moves.mjs', 'src/game/audio.mjs', 'src/mute.mjs', 'src/sfx.mjs']);
  assert.match(page, /<html lang|<main id="sounds"/);
  assert.doesNotMatch(read('sfx.html'), /name="build"/);
});

// ---- the fix round of 2026-11-28 (package C): the bounce's steps, the knockout's thud and bell, the replay heard from its
// start, the murmur's fade, the page hidden, and the mute

test('bouncing on the spot is heard: a soft step on every beat a foot comes down, none while he walks a stride, acts, or is down', () => {
  const ears = createEars(),
    rhythm = { halves: 0, stopped: false },
    man = { x: 0, z: 0, k: { staminaMax: 10 }, stamina: 10, action: null, animator: { rhythm } },
    beats = (n, move) => {
      const heard = [];
      for (let i = 0; i < n; i++) {
        if (move) man.x += move;
        if (i % 20 === 19) rhythm.halves++;
        heard.push(...ears.watch([man], 1 / 60, {}).filter(q => q.name === 'step'));
      }
      return heard;
    };
  ears.watch([man], 1 / 60, {});
  // (on the spot: one soft step a beat)
  const spot = beats(120);
  assert.equal(spot.length, 6);
  assert.ok(spot.every(q => q.o.bounce && q.o.v < 1), JSON.stringify(spot[0]));
  // (walking a stride a beat: the stride's steps, not the bounce's)
  const walk = beats(120, 1.2 / 60);
  assert.ok(walk.length > 0 && walk.every(q => !q.o.bounce), JSON.stringify(walk));
  // (punching, down, or held still by the beat: none)
  man.action = { name: 'jab' };
  assert.deepEqual(beats(60), []);
  man.action = null;
  man.down = true;
  assert.deepEqual(beats(60), []);
  man.down = false;
  rhythm.stopped = true;
  assert.deepEqual(beats(60), []);
  rhythm.stopped = false;
  assert.ok(SPOT < STRIDE);
  // (and a bounce's step is quieter than a stride's)
  const a = fresh().audio.play('step', { v: 1.2 }),
    b = fresh().audio.play('step', { v: 0.5, bounce: true });
  assert.ok(b.level < a.level, `${a.level} ${b.level}`);
  // (in a real bout: the bounce heard on its beats, a man in his guard at rest)
  const bout = createBout(7),
    still = createEars(),
    got = [];
  for (let i = 0; i < 180; i++) {
    step(bout, [{}, {}], 1 / 60);
    got.push(...still.watch(bout.fighters, 1 / 60, {}).filter(q => q.name === 'step' && q.o.bounce));
  }
  assert.ok(got.length >= 4, `${got.length} bounce steps in 3 s at rest`);
});

test('a knockdown blow sounds at least as heavy as a heavy blow, however light the punch that did it', () => {
  const at = o => fresh().audio.play('impact', Object.assign({ where: 'head' }, o)),
    heavy = at({ J: 110 });
  let was = null;
  for (let J = 10; J <= 140; J += 5) {
    const d = at({ J, down: true });
    assert.ok(d.level >= heavy.level && d.dur >= heavy.dur, `down J ${J}: ${d.level.toFixed(3)} ${d.dur.toFixed(3)} vs heavy ${heavy.level.toFixed(3)} ${heavy.dur.toFixed(3)}`);
    // (and no step in it: never quieter or shorter for a harder punch)
    if (was) assert.ok(d.level >= was.level - 1e-9 && d.dur >= was.dur - 1e-9, `down J ${J}`);
    was = d;
  }
  // (louder and longer than every ordinary blow up to a heavy one)
  for (let J = 10; J < 110; J += 5) assert.ok(at({ J, down: true }).level > at({ J }).level);
  assert.ok(110 / CLEAN > 1.25);
});

// (a page as the game and the sparring are: the live bout's events heard and its steps watched, a replay's events heard with
// c.replay, nothing stepped while it plays)
function knockout(replayAt, replayFor) {
  const { audio, context } = fresh(),
    log = [],
    keep = (rows, tag) => rows.forEach(r => log.push(Object.assign({ tag }, r))),
    live = n => {
      for (let i = 0; i < n; i++) (context.currentTime += 1 / 60), keep(audio.watch([{ x: 0, z: 0 }, { x: 1, z: 0 }], 1 / 60, {}), 'live');
    };
  keep(audio.hear({ type: 'hit', who: 0, on: 1, J: 30, part: 'glove', down: true }, { men: [] }), 'live');
  let from = null,
    to = null;
  if (replayAt !== null) {
    live(Math.round(replayAt * 60));
    from = context.currentTime;
    keep(audio.hear({ type: 'punch', who: 0, name: 'cross' }, { replay: true, rate: 0.5 }), 'replay');
    for (let i = 0; i < Math.round(replayFor * 60); i++) context.currentTime += 1 / 60;
    keep(audio.hear({ type: 'hit', who: 0, on: 1, J: 30, part: 'glove', down: true }, { replay: true, rate: 0.25 }), 'replay');
    to = context.currentTime;
  }
  live(60 * 4);
  return { audio, context, log, from, to, bells: log.filter(r => r.name === 'bell') };
}

test('the knockout bell waits for the knockdown to be shown: after the replay, never over it; at KO_WAIT if none comes; at once on a page with none', () => {
  // (the replay starting before the bell's old 1.1 s, as on the sparring's rounds #1 and #6, and one starting late)
  for (const [at, span] of [[0.87, 1.93], [0.87, 2.13], [2.4, 2]]) {
    const { bells, from, to, audio } = knockout(at, span);
    assert.equal(bells.length, 1, `replay at +${at}`);
    assert.ok(bells[0].at >= to - 1e-9 && bells[0].at < to + 0.05, `replay at +${at}: the bell at ${bells[0].at.toFixed(2)}, the replay ${from.toFixed(2)}..${to.toFixed(2)}`);
    assert.equal(bells[0].tag, 'live');
    assert.deepEqual(audio.held, []);
  }
  // (no replay: KO_WAIT seconds of live steps after the blow, past the longest a replay waits to start)
  assert.ok(KO_WAIT > FALL.most);
  const none = knockout(null);
  assert.equal(none.bells.length, 1);
  assert.ok(Math.abs(none.bells[0].at - KO_WAIT) < 1 / 30, `${none.bells[0].at}`);
  // (a bell already ringing when a replay starts is cut short there)
  const { audio, context } = fresh();
  const [rung] = audio.hear({ type: 'hit', who: 0, on: 1, J: 30, part: 'glove', down: true }, { men: [], replays: false }).filter(r => r.name === 'bell');
  assert.ok(rung && Math.abs(rung.at - 1.1) < 1e-9, 'a page that replays nothing: at its delay');
  context.currentTime = 1.5;
  audio.hear({ type: 'punch', who: 0, name: 'cross' }, { replay: true, rate: 0.5 });
  context.currentTime = 1.9;
  assert.equal(audio.voices, 0, 'the bell cut at the replay (it rang to 3.3 s)');
  // (and reset lets it go)
  const r = fresh();
  r.audio.hear({ type: 'hit', who: 0, on: 1, J: 30, part: 'glove', down: true }, { men: [] });
  assert.deepEqual(r.audio.held, ['bell']);
  r.audio.reset();
  assert.deepEqual(r.audio.held, []);
});

test('the pit murmur fades out on its own gain (nothing swinging it), and the knockout bell lets it go', () => {
  const { audio, context } = fresh();
  audio.ambience('pit');
  assert.equal(audio.ambient, 'pit');
  context.currentTime = 3;
  const before = context.made.params.map(p => p.events.length);
  audio.ambience(null);
  assert.equal(audio.ambient, null);
  // (the gain the fade is on: ramped to nearly nothing, and no oscillator connected to it)
  const faded = context.made.params.filter((p, i) => p.events.slice(before[i] || 0).some(e => e[0] === 'exp' && e[1] <= 0.0001));
  assert.equal(faded.length, 1);
  assert.equal(faded[0].inputs, 0, 'nothing swings the fade');
  // (the knockout's bell, once rung, lets the crowd's murmur go: the result does not murmur on)
  const k = fresh();
  k.audio.ambience('pit');
  k.audio.hear({ type: 'hit', who: 0, on: 1, J: 80, part: 'glove', down: true }, { men: [], pit: true });
  for (let i = 0; i < 60 * 3; i++) (k.context.currentTime += 1 / 60), k.audio.watch([], 1 / 60, { pit: true });
  assert.equal(k.audio.ambient, null);
});

test('mute: everything off at once, what was already scheduled and what was held too; on again for what comes next', () => {
  const { audio, context } = fresh();
  const played = audio.hear({ type: 'hit', who: 0, on: 1, J: 60, part: 'glove', down: true }, { men: [], pit: true, replays: false });
  assert.ok(played.some(r => r.name === 'bell' && r.at > 1) && played.some(r => r.name === 'roar'));
  context.currentTime = 0.1;
  audio.mute(true);
  assert.equal(audio.muted, true);
  assert.equal(audio.voices, 0, 'the bell to come and the roar let go');
  context.currentTime = 1.2;
  audio.mute(false);
  assert.equal(audio.voices, 0, 'and they do not come back');
  assert.ok(audio.play('impact', { J: 80 }));
  // (the held bell is let go too)
  const h = fresh();
  h.audio.hear({ type: 'hit', who: 0, on: 1, J: 60, part: 'glove', down: true }, { men: [] });
  h.audio.mute(true);
  assert.deepEqual(h.audio.held, []);
});

test('a page hidden suspends the sound and shown again resumes it; an offline render is left alone', () => {
  const saved = globalThis.document,
    listeners = {},
    doc = { hidden: false, addEventListener: (k, f) => ((listeners[k] = listeners[k] || []).push(f)) };
  globalThis.document = doc;
  try {
    const context = fakeContext(),
      calls = [];
    context.suspend = () => (calls.push('suspend'), (context.state = 'suspended'));
    context.resume = () => (calls.push('resume'), (context.state = 'running'));
    const audio = createAudio({ context });
    audio.unlock();
    doc.hidden = true;
    listeners.visibilitychange.forEach(f => f());
    assert.deepEqual(calls, ['suspend']);
    doc.hidden = false;
    listeners.visibilitychange.forEach(f => f());
    assert.deepEqual(calls, ['suspend', 'resume']);
    // (one suspended by the page itself is not resumed by being shown)
    context.state = 'suspended';
    listeners.visibilitychange.forEach(f => f());
    assert.deepEqual(calls, ['suspend', 'resume']);
    const offline = fakeContext();
    offline.startRendering = () => {};
    offline.suspend = () => calls.push('offline');
    createAudio({ context: offline }).unlock();
    doc.hidden = true;
    listeners.visibilitychange.forEach(f => f());
    assert.ok(!calls.includes('offline'));
  } finally {
    if (saved === undefined) delete globalThis.document;
    else globalThis.document = saved;
  }
});

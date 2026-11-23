/* The combinations (docs/combos-plan.md §3): each a list of named beats, the one list the head (game/combos.mjs, stage C4),
   the catalogue (src/combos.mjs) and the scripted sparring all read. The numbers of the source's article (expertboxing.com,
   "7 basic boxing combinations") are the orthodox stance's, the lead hand the left: 1 the jab, 2 the cross, 3 the lead hook,
   4 the rear hook, 5 the lead uppercut, 6 the rear uppercut.

   A beat:
     do     what is pressed: a punch by its id (anim/moves.mjs MOVES), or one still to come (LATER), or a control that is not
            a punch (CONTROLS: a defence or a step of a script's)
     to     'body': the body form of that punch (moves.mjs TO_BODY). Left out, the head
     w      'light' | 'hard' | 'full': how much of the body goes behind it (§4). Left out, 'hard'. Nothing reads it before
            stage C2
     fake   true: started and taken back (§4.4, stage C2)
     step   'in' (left out: he closes to the punch's own range as he throws, as he does now) | 'hold' (the feet planted) |
            'long' (no walking in: the rear foot's ball pushed back to lengthen the stance, the cross after a hook or an
            uppercut, stage C2)
     gap    seconds from the beat before landing to this one landing. Left out, his grade's (TEMPO, by gapOf)
     link   how it follows the beat before: 'coil' (the other hand: the body winds back), 'double' (the same hand again),
            'lean' (the same hand, the lean its wind-up), 'loaded' (the hand a defence has wound up). A label the tests
            check against the hands; the bout picks its own way from the hands and the direction
     side   a defence's side, as the control takes it
   A combination: name, the bands it is started from (`from`: 0 right up close 0.62-0.74 m, 1 hook range 0.74-0.90, 2 jab
   range 0.90-1.15, 3 the threshold 1.15-1.55: BANDS), the readings that call for it and that rule it out (`when`, `unless`:
   SITUATIONS, read by the head), and its beats; or, for one of the article's four examples of a variation, the combination it
   is a variation of (`of`) and the variation (`vary`): its beats are made as it is read (beatsOf). A script's own (`script`:
   a beat of the other man's goes with it) is not the head's to pick.
   The hand, the kind and the target of a punch are the move's: they are read from MOVES (or LATER), not written again here.

   Reading it (the few functions at the end, which only read these tables): about(name), beatsOf(id), vary(beats, id, o),
   gapOf(before, beat, grade), and problems(), what is wrong with the tables (tests/combos.test.mjs holds it to nothing). */
import { MOVES, TO_BODY } from '../anim/moves.mjs';

// the article's numbers, as punches
export const NUM = { 1: 'jab', 2: 'cross', 3: 'hook', 4: 'hookR', 5: 'upperL', 6: 'upper' };

// what a beat may press that is not a punch: the defences and the steps of a script's (the sources' sequences, A and C)
export const CONTROLS = ['cover', 'slip', 'roll', 'pull', 'catch', 'step', 'pivot'];

/* The punches a combination names that are not in the game yet, and the stage that brings each (§5): what they will be,
   so that the tables can be read now. Once a stage has put one in MOVES, its line here goes (the tests say so). */
export const LATER = {
  upperL: { stage: 'C1', hand: 'L', kind: 'upper' }, // the lead uppercut, number 5 (§5.1)
  upperBodyL: { stage: 'C1', hand: 'L', kind: 'upper', zone: 'solar', of: 'upperL' } // and to the body (§5.2)
};

// the edges of the bands of distance, centre to centre (docs/bearing-system-plan.md §1.4; its bandOf, once stage O is in)
export const BANDS = [0.74, 0.9, 1.15, 1.55];

export const COMBOS = {
  '1-2': { name: '원투', from: [2, 3], beats: [{ do: 'jab', w: 'light' }, { do: 'cross', link: 'coil' }] },
  '1-1-2': { name: '잽 잽 스트레이트', from: [2, 3], when: ['crossRead'],
    beats: [{ do: 'jab', w: 'light' }, { do: 'jab', w: 'light', link: 'double' }, { do: 'cross', link: 'coil' }] },
  '1-2-3': { name: '원투 훅', from: [2, 3],
    beats: [{ do: 'jab', w: 'light' }, { do: 'cross', link: 'coil' }, { do: 'hook', link: 'coil' }] },
  '1-2-3-2': { name: '원투 훅 스트레이트', from: [2, 3],
    beats: [{ do: 'jab', w: 'light' }, { do: 'cross', link: 'coil' }, { do: 'hook', link: 'coil' }, { do: 'cross', link: 'coil', step: 'long' }] },
  '1-2-5-2': { name: '원투 어퍼 스트레이트', from: [2, 3], when: ['guarded', 'crouched', 'rush'],
    beats: [{ do: 'jab', w: 'light' }, { do: 'cross', link: 'coil' }, { do: 'upperL', link: 'coil' }, { do: 'cross', link: 'coil', step: 'long' }] },
  '1-6-3-2': { name: '잽 어퍼 훅 스트레이트', from: [2], when: ['oneTwoRead'], unless: ['jabbed'],
    beats: [{ do: 'jab', w: 'light' }, { do: 'upper' }, { do: 'hook', link: 'coil' }, { do: 'cross', link: 'coil', step: 'long' }] },
  '2-3-2': { name: '스트레이트 훅 스트레이트', from: [1, 2], when: ['inside', 'rush'],
    beats: [{ do: 'cross' }, { do: 'hook', link: 'coil', step: 'hold' }, { do: 'cross', link: 'coil', step: 'long' }] },
  // (the power button pressed again and again: the order the bout chains them in, bout.mjs RULES.chain)
  chain: { name: '체인', from: [2], beats: [{ do: 'cross' }, { do: 'hook', link: 'coil' }, { do: 'upper', link: 'coil' }] },
  // the full lead hook, and the same hand's uppercut to the body out of the lean after it (§8)
  'hook-under': { name: '훅 언더', from: [1, 2], when: ['guarded', 'hookBlocked', 'hisRopes'], unless: ['jabbed'],
    beats: [{ do: 'hook', w: 'full' }, { do: 'upperL', to: 'body', link: 'lean' }] },
  // the article's four examples of a variation: another combination varied, but each its own name and row
  'feint-cross': { name: '페이크 잽 스트레이트', of: '1-2', vary: 'fakeFirst' }, // 1 (feinted) - 2
  'feint-hook': { name: '잽 시늉 훅', of: '1-2-3', vary: 'fakeSecond' }, // 1 - 2 (feinted) - 3
  'double-hook': { name: '더블 훅', of: '1-2-3-2', vary: 'doubleLeft' }, // 1-2-3-3-2: left, right, left, left, right
  'up-down': { name: '위아래', of: '1-2-3-2', vary: 'upDown' }, // 1 - 2b - 3 - 2b
  // source C's six beats (docs/source-cd-proposal.md P4): a defence among them, the other man's cross coming on the second.
  // A script's, for a card of two men, not the head's to pick
  '1-S-5-2-3-2': { name: '잽 슬립 어퍼', from: [2], script: true, beats: [
    { do: 'jab' }, { do: 'slip', side: 1, gap: 0.31 },
    { do: 'upperL', gap: 0.22, link: 'loaded' }, { do: 'cross', gap: 0.21, link: 'coil' },
    { do: 'hook', gap: 0.25, link: 'coil' }, { do: 'cross', gap: 0.27, link: 'coil', step: 'long' }] }
};

/* The variations (§1.3, §7.5): which beats (where: hand, i (an index, or 'odd'), kind, last: false (all but the last), pick:
   so many of those, the head's dice choosing which) and what is done to them (set; or repeat: each once more, the same hand
   again, `first` set on the first of the two; `last` set on the last beat of all; or `then`: a beat put on the end, after
   `set` has been done to the last). vary() does it. */
export const VARIATIONS = {
  lightLeft: { where: { hand: 'L' }, set: { w: 'light' } }, // the lead hand light
  fakeFirst: { where: { i: 0 }, set: { fake: true } }, // the first punch feinted
  fakeSecond: { where: { i: 1 }, set: { fake: true } }, // the second
  doubleLeft: { where: { hand: 'L', kind: ['hook', 'upper'] }, repeat: 1, first: { w: 'light' } }, // left, right, left, left, right
  fastHard: { where: { last: false }, set: { w: 'light' }, last: { w: 'hard' } }, // quick, and only the last hard
  bodyOne: { where: { kind: ['straight', 'hook', 'upper'], pick: 1 }, set: { to: 'body' } }, // one of them to the body
  upDown: { where: { i: 'odd' }, set: { to: 'body' } }, // up, down, up, down
  allHard: { where: {}, set: { w: 'hard' } }, // the other man hurt: all of them hard
  // (the hook-under as a tail, §8.9: the last hook full, and the lead uppercut to the body after it: 1-2-3 is 1-2-3-5b)
  under: { where: { kind: ['hook'], hand: 'L', last: true }, set: { w: 'full' }, then: { do: 'upperL', to: 'body', link: 'lean' } }
};

/* What each grade knows (§7.1, §7.5, §8.9): what the head may start (combos), how he throws by default (weight: 'all' a
   beginner's every punch thrown all out with no body behind it, 'hard' all of them hard, 'jab' the jab light, 'left' the lead
   hand light, 'beat' beat by beat as written), what he does beat by beat (reads: 'never', 'hit' only when he is hit, 'miss'
   he stops when one misses, 'beat' every beat, 'change' every beat, and the beats left may be changed), how he picks one
   (picks: null, 'inside' (close: only 2-3-2), 'all'), the variations his dice may put on one and how often (vary: their
   weights, `as` for none), the feints he has (fakes: the beats that may be feinted), and how much more a dirty grade picks
   the close ones (close). Every grade's, not a technique's: it takes no slot of the loadout.
   The chain is every grade's: it is the power button pressed again (§2.1); the catalogue's row of it has seven cards. */
const BASIC = ['1-2', '1-1-2', '1-2-3', '1-2-3-2', '2-3-2', '1-2-5-2', '1-6-3-2', 'hook-under', 'chain'];
export const KNOWS = {
  1: { combos: ['1-2', 'chain'], weight: 'all', reads: 'never', picks: null, vary: {}, fakes: [] },
  2: { combos: ['1-2', '1-1-2', '1-2-3', 'chain'], weight: 'hard', reads: 'hit', picks: null, vary: {}, fakes: [] },
  3: { combos: BASIC, weight: 'jab', reads: 'miss', picks: 'inside', vary: {}, fakes: [] },
  '4m': { combos: BASIC, weight: 'left', reads: 'beat', picks: 'all', vary: { as: 5, lightLeft: 3, bodyOne: 2, doubleLeft: 1, fakeFirst: 1 }, fakes: [0] },
  // (§7.5 gives upDown no weight at grade 4: 1, as at grade 5)
  '4a': { combos: BASIC, weight: 'left', reads: 'beat', picks: 'all', vary: { as: 5, bodyOne: 2, upDown: 1, doubleLeft: 1, fakeFirst: 1 }, fakes: [0], close: 1.5 },
  '5m': { combos: BASIC, weight: 'beat', reads: 'change', picks: 'all', vary: { as: 3, fastHard: 3, bodyOne: 2, upDown: 1, doubleLeft: 1, fakeFirst: 1.5, fakeSecond: 1, under: 1 }, fakes: [0, 1] },
  '5a': { combos: BASIC, weight: 'beat', reads: 'change', picks: 'all', vary: { as: 3, fastHard: 3, bodyOne: 2, upDown: 1, doubleLeft: 1, fakeFirst: 1.5, fakeSecond: 1, under: 1 }, fakes: [0, 1], close: 1.5 }
};

/* From one beat landing to the next landing, by grade (§7.4), seconds: after a light punch (a jab), from one hard punch to
   another, to an uppercut (he has to go down into it first), from one light punch to another made light by fastHard, and
   from a feint to the real one. null: that grade has no such beat. The head presses so that the punch lands then (the
   moment it presses: the last landing, and this, less how long the punch takes to get there, animator.mjs arrival), or as
   soon after as the chain will take it. */
export const TEMPO = {
  light: { 1: 0.45, 2: 0.3, 3: 0.233, '4m': 0.2, '4a': 0.2, '5m': 0.183, '5a': 0.167 },
  hard: { 1: 0.5, 2: 0.333, 3: 0.267, '4m': 0.233, '4a': 0.233, '5m': 0.217, '5a': 0.2 },
  upper: { 1: 0.55, 2: 0.367, 3: 0.283, '4m': 0.25, '4a': 0.25, '5m': 0.233, '5a': 0.217 },
  lightLight: { 1: null, 2: null, 3: null, '4m': 0.167, '4a': 0.167, '5m': 0.15, '5a': 0.15 },
  fake: { 1: null, 2: null, 3: null, '4m': 0.15, '4a': 0.15, '5m': 0.133, '5a': 0.133 }
};

/* The readings the head picks by (§7.2, §8.9), by name: what each means. game/combos.mjs (C4) reads them (READS); these
   tables only say which call for which combination. */
export const SITUATIONS = {
  rocked: '상대가 방금 57 N·s 이상에 맞았다',
  inside: '띠 0 · 1 (0.90 m 안)',
  rush: '상대가 0.4 s 사이에 0.25 m 넘게 좁혀 왔다 (더킹 대시, 대시 인 포함)',
  crossRead: '지난 6 s 안에 내 스트레이트가 슬립 · 롤 · 패리되었고 0.6 s 안에 상대의 주먹이 닿았다',
  guarded: '상대가 가드를 0.3 s 넘게 들고 있다',
  crouched: '상대가 셸이나 더킹으로 숙이고 있다',
  oneTwoRead: '내 지난 두 콤비네이션이 1-2로 시작했고 두 스트레이트가 모두 닿지 않았다',
  jabbed: '상대의 잽이 지난 3 s에 둘 이상',
  hookBlocked: '내 지난 훅이 1 s 안에 막혔다',
  hisRopes: '상대 뒤의 로프가 1.2 m 안이다'
};

// too close for the punch a beat names: the short punch of that hand instead (§7.3; grades 4 and 5)
export const SWAP = { jab: 'hookIn', cross: 'upperIn', hook: 'hookIn', upper: 'upperIn', upperL: 'hookIn' };

/* ---- reading it */

// a punch's hand and kind (and its zone, for one to the body): the move's, or the one still to come; or a control's
export function about(name) {
  const m = MOVES[name] && MOVES[name].punch ? MOVES[name] : LATER[name];
  if (m) return { punch: true, hand: m.hand, kind: m.kind, zone: m.zone || null, later: !MOVES[name] };
  return CONTROLS.includes(name) ? { punch: false } : null;
}

/* A variation done to a list of beats: a new list, the beats copied. Done twice it is what it was done once (the list keeps
   the variations done to it: varied). o.pick(n, k): which k of the n beats that fit a `pick` (the head's dice); the first k
   if left out. */
export function vary(beats, id, o) {
  const v = VARIATIONS[id],
    done = beats.varied || [];
  if (!v || done.includes(id)) return beats;
  const w = v.where || {},
    fits = (b, i, n) => {
      const a = about(b.do);
      if (w.hand && !(a && a.punch && a.hand === w.hand)) return false;
      if (w.kind && !(a && a.punch && w.kind.includes(a.kind))) return false;
      if (w.i === 'odd' ? i % 2 !== 1 : w.i !== undefined && i !== w.i) return false;
      if (w.last === false && i === n - 1) return false;
      if (w.last === true && i !== n - 1) return false;
      return true;
    };
  let out = beats.map(b => Object.assign({}, b));
  let chosen = out.map((b, i) => fits(b, i, out.length));
  if (w.pick) {
    const at = chosen.flatMap((c, i) => (c ? [i] : [])),
      keep = o && o.pick ? o.pick(at.length, w.pick) : at.slice(0, w.pick).map((_, k) => k);
    chosen = out.map((_, i) => keep.some(k => at[k] === i));
  }
  if (v.set) out = out.map((b, i) => (chosen[i] ? Object.assign(b, v.set) : b));
  if (v.repeat) out = out.flatMap((b, i) => (chosen[i] ? [Object.assign({}, b, v.first), ...Array.from({ length: v.repeat }, () => Object.assign({}, b, { link: 'double' }))] : [b]));
  if (v.last && out.length) Object.assign(out[out.length - 1], v.last);
  if (v.then && chosen[chosen.length - 1]) out.push(Object.assign({}, v.then));
  out.varied = [...done, id];
  return out;
}

// a combination's beats: its own, or those of the one it is a variation of, varied
export function beatsOf(id, o) {
  const c = COMBOS[id];
  if (!c) return null;
  if (c.beats) return c.beats.map(b => Object.assign({}, b));
  return vary(beatsOf(c.of, o), c.vary, o);
}

// how long from the beat before landing to this one landing, at this grade: the beat's own gap, or TEMPO's (§7.4)
export function gapOf(before, beat, grade) {
  if (beat.gap !== undefined) return beat.gap;
  const a = about(beat.do),
    light = b => (b.w || 'hard') === 'light',
    kind = before.fake && TEMPO.fake[grade] !== null ? 'fake' : a && a.kind === 'upper' ? 'upper' : light(before) ? (light(beat) && beat.do !== 'jab' && TEMPO.lightLight[grade] !== null ? 'lightLight' : 'light') : 'hard';
  return TEMPO[kind][grade];
}

/* What is wrong with the tables, as a list of lines (none, as they should be): every beat presses something there is or will
   be; a 'coil' follows the other hand and a 'double' or a 'lean' the same one; a body beat has a body form; every weight,
   step, band, reading and variation named is one there is; a variation's combination is there; every grade knows only what
   there is, and a higher grade of the same side knows all a lower one does; the tempo has a value for every grade. */
export function problems() {
  const out = [],
    grades = Object.keys(KNOWS);
  for (const [id, c] of Object.entries(COMBOS)) {
    if (!c.name) out.push(`${id}: no name`);
    if (c.of && !(COMBOS[c.of] && COMBOS[c.of].beats)) out.push(`${id}: a variation of ${c.of}, which is not a combination of beats`);
    if (c.of && !VARIATIONS[c.vary]) out.push(`${id}: no variation ${c.vary}`);
    if (!c.of && !(Array.isArray(c.beats) && c.beats.length)) out.push(`${id}: no beats`);
    if (!c.of && !(Array.isArray(c.from) && c.from.length && c.from.every(b => Number.isInteger(b) && b >= 0 && b <= BANDS.length - 1))) out.push(`${id}: bands ${JSON.stringify(c.from)}`);
    for (const r of [...(c.when || []), ...(c.unless || [])]) if (!SITUATIONS[r]) out.push(`${id}: no reading ${r}`);
    const beats = beatsOf(id) || [];
    beats.forEach((b, i) => {
      const a = about(b.do),
        before = i > 0 ? about(beats[i - 1].do) : null;
      if (!a) return void out.push(`${id} beat ${i}: ${b.do} is neither a punch nor a control`);
      if (b.to === 'body' && a.punch && !a.zone && !TO_BODY[b.do] && !Object.values(LATER).some(l => l.of === b.do)) out.push(`${id} beat ${i}: ${b.do} has no body form`);
      if (b.to !== undefined && b.to !== 'body') out.push(`${id} beat ${i}: to ${b.to}`);
      if (b.w !== undefined && !['light', 'hard', 'full'].includes(b.w)) out.push(`${id} beat ${i}: weight ${b.w}`);
      if (b.step !== undefined && !['in', 'hold', 'long', 'back'].includes(b.step) && !Array.isArray(b.step) && typeof b.step !== 'object') out.push(`${id} beat ${i}: step ${b.step}`);
      if (b.gap !== undefined && !(b.gap > 0 && b.gap < 1)) out.push(`${id} beat ${i}: gap ${b.gap}`);
      if (b.link !== undefined && i === 0) out.push(`${id} beat 0: a link to nothing`);
      if (b.link !== undefined && !['coil', 'double', 'lean', 'loaded'].includes(b.link)) out.push(`${id} beat ${i}: link ${b.link}`);
      if (b.link === 'coil' && before && before.punch && a.hand === before.hand) out.push(`${id} beat ${i}: a coil on the same hand (${beats[i - 1].do}, ${b.do})`);
      if ((b.link === 'double' || b.link === 'lean') && before && before.punch && a.hand !== before.hand) out.push(`${id} beat ${i}: ${b.link} on the other hand (${beats[i - 1].do}, ${b.do})`);
      if (b.link === 'loaded' && !(before && !before.punch)) out.push(`${id} beat ${i}: loaded, but not out of a defence`);
    });
  }
  for (const [id, v] of Object.entries(VARIATIONS)) if (!v.set && !v.repeat && !v.last && !v.then) out.push(`variation ${id} does nothing`);
  const order = ['1', '2', '3', '4', '5'],
    below = g => {
      const n = order.indexOf(String(g)[0]),
        side = String(g)[1];
      return grades.filter(h => order.indexOf(String(h)[0]) < n && (!String(h)[1] || String(h)[1] === side));
    };
  for (const g of grades) {
    const k = KNOWS[g];
    for (const id of k.combos) if (!COMBOS[id] || COMBOS[id].script || COMBOS[id].of) out.push(`grade ${g} knows ${id}, which is not a combination the head may start`);
    for (const id of Object.keys(k.vary)) if (id !== 'as' && !VARIATIONS[id]) out.push(`grade ${g}: no variation ${id}`);
    for (const h of below(g)) for (const id of KNOWS[h].combos) if (!k.combos.includes(id)) out.push(`grade ${g} does not know ${id}, which grade ${h} does`);
    for (const [kind, by] of Object.entries(TEMPO)) if (!(g in by)) out.push(`tempo ${kind}: no grade ${g}`);
  }
  for (const [name, l] of Object.entries(LATER)) if (MOVES[name]) out.push(`${name} is in MOVES now (stage ${l.stage}): its line in LATER goes`);
  for (const [from, to] of Object.entries(SWAP)) if (!about(from) || !MOVES[to]) out.push(`swap ${from} -> ${to}`);
  return out;
}

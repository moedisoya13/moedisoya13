#!/usr/bin/env node
/* The evasion windows, measured: for every way of getting the head out of the way and every punch, the frames after the
   press that throws the punch on which starting the evasion makes the punch miss. Each is fought the way the catalogue
   fights it (src/defense.mjs): the boxer at home, the other man at the punch's range, the punch thrown at the same moment
   of a fresh bout (a hook or an uppercut as the second or third of his power chain, the punches before it taken on a held
   guard), so that what is measured here is what the drills run, the boxer's own head movement and all.
     node tools/windows.mjs            the table (a pro defending)
     node tools/windows.mjs --grades   each grade (anim/skill.mjs) against the punch of its card: the window, how much the
                                       punch misses by from the middle of it, how long the head takes to get clear and how
                                       long he is tied up; and the parry's window (the frame the guard goes up), the down
                                       parry's (4명, 5명) and the shoulder roll's (4명, 4암, 5명, 5암; the margin is the
                                       room between the glove and his head as it is rolled off), and the pull counter's
                                       rear hook's sway back (the pull's, from 0.9 m), and the peek-a-boo shell's (4명, 5명:
                                       how late he can crouch into it and still meet the jab)
     node tools/windows.mjs --write    the same, written to src/windows.data.mjs, where the catalogue's scripts read it
     node tools/windows.mjs --json
   A frame before the press (negative) is a guess: the evasion started before the punch did. */
import { writeFileSync } from 'node:fs';
import { step } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW, counterCue } from '../src/defense.mjs';
import { audit } from '../src/audit.mjs';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import { timeline } from '../src/anim/evade.mjs';

const F = 1 / 60;
export const MOVES = [
  ['slip', -1, '슬립 (오른쪽)'],
  ['slip', 1, '슬립 (왼쪽)'],
  ['duck', true, '더킹'],
  ['roll', 1, '위빙 (왼쪽으로 올라옴)'],
  ['pull', true, '스웨이 백']
];
export const PUNCHES = ['jab', 'cross', 'hook', 'upper'];
// when in a drill the last punch is thrown (as the catalogue throws it: a hook and an uppercut after the power punches before)
export const AT = { jab: 0.8, cross: 0.8, hook: 1.1, upper: 1.3 };
// the earliest frame tried: this many before the press (a guess)
const EARLY = 14;

/* A drill: the punch, and the boxer's answer `k` frames after it is pressed (or none). skills: the boxer's sheet. guard: the
   answer is the guard put up on that frame and held (a parry), not an evasion. tech: the guard put up meant as a technique
   he carries ({ id, carry: his loadout, hold: how long after the punch it is kept up }: the down parry, the shoulder roll;
   game/techniques.mjs), pressed with it on that frame as the catalogue's cards press it. */
export function drill(punch, move, value, k, skills, guard, counter, tech, gap) {
  const at = AT[punch];
  return {
    // (and a punch back out of it, as soon as he may: the counter card)
    cue: counter && k !== null ? counterCue(at + k * F) : undefined,
    loop: counter ? 2.4 : at + 0.9,
    id: `${move}@${punch}+${k}`,
    me: () => HOME,
    him: () => [HOME[0] + (gap || RANGE[punch]), HOME[1]],
    against: THROW[punch].map(([dt, button]) => [at + dt, button]),
    setup: skills || tech ? b => ((b.fighters[0].skills = skills || {}), tech && (b.fighters[0].techniques = tech.carry)) : undefined,
    // (the punches before the last are taken on a guard, put down just before it; a parry is the guard put up on frame k)
    cover: guard ? t => k !== null && t >= at + k * F - 1e-9 && t < at + (tech ? tech.hold : 0.4) : punch === 'hook' || punch === 'upper' ? t => t > 0.2 && t < Math.min(at - 0.05, k === null ? at - 0.05 : at + k * F - 1e-9) : undefined,
    press: k === null ? [] : tech ? [[at + k * F, 'tech', tech.id]] : guard ? [] : [[at + k * F, move, value]]
  };
}
// what became of the last punch the other man threw: 'whiff', 'hit', ...; the frame (after its press) it got there; and by
// how much it missed
export function outcome(entry) {
  const bout = freshBout(entry);
  let last = null;
  for (let tick = 0; tick < Math.round(entry.loop / F); tick++) {
    step(bout, drive(entry, bout, tick * F, F), F);
    bout.fighters[0].hp = Math.max(bout.fighters[0].hp, 50);
    for (const e of bout.events) {
      const by = e.type === 'parry' ? e.on : e.who;
      if (by === 1 && ['hit', 'block', 'parry', 'whiff', 'graze'].includes(e.type)) last = { type: e.type, tick, margin: e.margin ?? null, part: e.part, down: !!e.down, roll: !!e.roll };
    }
  }
  return last;
}
/* the frames after the press on which the evasion works, for one move against one punch (and a sheet of skills); a technique's
   guard works where its own outcome comes of it (tech.works) */
export function window(punch, move, value, skills, guard, tech, gap) {
  const base = outcome(drill(punch, move, value, null, skills, false, false, undefined, gap)),
    lands = base ? base.tick + 1 - Math.round(AT[punch] / F) : 20,
    want = guard ? 'parry' : 'whiff',
    works = [],
    margins = {};
  for (let k = -EARLY; k <= lands; k++) {
    const o = outcome(drill(punch, move, value, k, skills, guard, false, tech, gap));
    if (o && (tech ? tech.works(o) : o.type === want)) works.push(k), (margins[k] = o.margin);
  }
  return { lands, works, margins };
}
// a run of frames as the table writes it: 3–5, or 0–2, 7–9, or – for none
export const span = list => {
  if (!list.length) return '–';
  const runs = [];
  for (const k of list) if (runs.length && k === runs[runs.length - 1][1] + 1) runs[runs.length - 1][1] = k;
  else runs.push([k, k]);
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
};
// the longest run, and the frame in the middle of it (the earlier of two middles: a press on the last frame of a window is
// what makes a defence brilliant, and a card in the middle of its window should not be one by construction)
export function middle(list) {
  if (!list.length) return null;
  let best = [list[0], list[0]],
    run = [list[0], list[0]];
  for (const k of list.slice(1)) {
    run = k === run[1] + 1 ? [run[0], k] : [k, k];
    if (run[1] - run[0] > best[1] - best[0]) best = run;
  }
  return { from: best[0], to: best[1], at: Math.floor((best[0] + best[1]) / 2) };
}

/* The cards of the catalogue: each way of meeting a punch against the punch its card throws. (The slip against the cross is
   to his right, as the jab's is: a slip to his left gets no window against a pro's cross since the drop speed was limited.) */
export const CARDS = [
  { id: 'slip', move: 'slip', value: -1, punch: 'jab' },
  { id: 'slip-cross', move: 'slip', value: -1, punch: 'cross' },
  { id: 'pull', move: 'pull', value: true, punch: 'jab' },
  { id: 'duck', move: 'duck', value: true, punch: 'hook' },
  { id: 'roll', move: 'roll', value: 1, punch: 'hook' },
  { id: 'parry', move: 'cover', value: true, punch: 'jab', guard: true },
  { id: 'counter', move: 'slip', value: -1, punch: 'jab', counter: true },
  /* the techniques' (docs/moves-plan-5.md §4.2, §4A.4), at the grades that open them: the down parry, the guard put up meant
     as it pressing the jab down (src/defense.mjs PARRY_DOWN); the shoulder roll, the guard put up meant as it rolling the
     cross off the lead shoulder (src/defense.mjs ROLLING; tests/show.test.mjs) */
  { id: 'parryDown', move: 'cover', value: true, punch: 'jab', guard: true, levels: ['4m', '5m'], tech: { id: 'parryDown', carry: ['parryDown'], hold: 0.4, works: o => o.type === 'parry' && o.down } },
  { id: 'rollCounter', move: 'cover', value: true, punch: 'cross', guard: true, levels: ['4m', '4a', '5m', '5a'], tech: { id: 'rollCounter', carry: ['crossArm', 'rollCounter'], hold: 0.5, works: o => o.type === 'block' && o.part === 'shoulder' && o.roll } },
  /* the pull counter's rear hook (docs/moves-plan-5.md §3.8, src/defense.mjs PULL_COUNTER): the same sway back from the same
     jab thrown from closer, 0.9 m, where the head picks the rear hook (the other two ways are fought from the pull card's 1 m,
     and sway back in its window) */
  { id: 'pullHook', move: 'pull', value: true, punch: 'jab', gap: 0.9 },
  /* the peek-a-boo shell (docs/moves-plan-5.md §4.5, src/defense.mjs SHELL): crouched into meant as it on that frame and held,
     against the jab; it works where the jab meets his gloves or goes over him (it never goes over: the crouch is too slow for a
     jab that has set its aim, so this is how late he can go into it and still have it in the way) */
  { id: 'shell', move: 'cover', value: true, punch: 'jab', guard: true, levels: ['4m', '5m'], tech: { id: 'shell', carry: ['shell'], hold: 0.6, works: o => o.type === 'block' || o.type === 'whiff' } }
];
/* The frame a card presses on: the middle of the longest run of its window, or, where the exchange from there is not clean
   (the bout scores a glove on a head and nothing else, so an arm can pass through a glove that is in its way: tools/audit.mjs
   holds every card to that not happening), the frame nearest the middle that is. */
function pick(card, lv, works) {
  const mid = middle(works);
  if (!mid) return null;
  const run = [];
  for (let k = mid.from; k <= mid.to; k++) run.push(k);
  run.sort((a, b) => Math.abs(a - mid.at) - Math.abs(b - mid.at) || a - b);
  const unclean = [];
  for (const k of run) {
    const d = drill(card.punch, card.move, card.value, k, { all: lv }, card.guard, card.counter, card.tech, card.gap);
    const { found } = audit([Object.assign(d, { id: `${card.id}@${lv}+${k}` })]);
    if (!Object.values(found).some(c => c.bad)) return Object.assign({}, mid, { at: k, unclean });
    unclean.push(k);
  }
  return Object.assign({}, mid, { unclean });
}
/* The cross counter's window (docs/cross-counter-plan.md §7.2; stage Y): the frames after the jab's press on which a power press
   meant as it works, in the cross counter's own card (src/defense.mjs CROSS_COUNTER: the boxer carrying it, the pro's jab from
   1.0 m): the jab does not land (it misses, only touches him, or is cut short by his punch), the cross counter lands on his
   head, and as hard as 0.85 of what it does from the middle of the run (a press on the edge that lands, but off the end of
   his arm, is not counted). `hit`: the frame after the jab's press his punch got there, from the middle. */
const OVER_GAP = 1.0;
export function overDrill(k, lv) {
  const at = AT.jab;
  return {
    id: `crossCounter@${lv}+${k}`,
    loop: at + 0.9,
    me: () => HOME,
    him: t => (t > at + 0.3 ? null : [HOME[0] + OVER_GAP, HOME[1]]),
    against: [[at, 'jab']],
    press: k === null ? [] : [[at + k * F, 'power'], [at + k * F, 'tech', 'crossCounter']],
    setup: b => ((b.fighters[0].skills = { all: lv }), (b.fighters[0].techniques = ['crossCounter']), (b.fighters[1].stands = true))
  };
}
export function overOutcome(entry) {
  const bout = freshBout(entry),
    P0 = Math.round(AT.jab / F) - 1;
  let jab = null,
    mine = null;
  for (let tick = 0; tick < Math.round(entry.loop / F); tick++) {
    step(bout, drive(entry, bout, tick * F, F), F);
    bout.fighters[0].hp = Math.max(bout.fighters[0].hp, 50);
    bout.fighters[1].hp = 1000;
    for (const e of bout.events) {
      if (e.who === 1 && !jab && ['hit', 'block', 'parry', 'whiff', 'graze'].includes(e.type)) jab = { type: e.type, margin: e.margin ?? null };
      if (e.who === 0 && !mine && ['hit', 'block', 'whiff', 'graze'].includes(e.type)) mine = { type: e.type, name: e.name, J: e.J, n: tick - P0, part: e.part };
    }
  }
  return { jab, mine };
}
export function overGrade(lv) {
  const base = overOutcome(overDrill(null, lv)),
    lands = 20,
    seen = {};
  for (let k = -4; k <= 10; k++) seen[k] = overOutcome(overDrill(k, lv));
  const lands0 = o => o.mine && o.mine.type === 'hit' && o.mine.name === 'crossOver' && o.mine.part !== 'body' && (!o.jab || o.jab.type !== 'hit');
  let works = Object.keys(seen).map(Number).filter(k => lands0(seen[k]));
  const mid0 = middle(works),
    J0 = mid0 ? seen[mid0.at].mine.J : 0;
  works = works.filter(k => seen[k].mine.J >= 0.85 * J0 - 1e-9);
  const mid = middle(works);
  // (and the frame nearest the middle whose exchange is clean, as the other cards' are: pick)
  let at = null;
  const unclean = [];
  if (mid) {
    const run = [];
    for (let k = mid.from; k <= mid.to; k++) run.push(k);
    run.sort((a, b) => Math.abs(a - mid.at) - Math.abs(b - mid.at) || a - b);
    for (const k of run) {
      const { found } = audit([Object.assign(overDrill(k, lv), { loop: 2.4 })]);
      if (!Object.values(found).some(c => c.bad)) {
        at = k;
        break;
      }
      unclean.push(k);
    }
  }
  const m = at !== null ? seen[at] : null;
  return { works, lands: base.jab ? lands : lands, from: mid ? mid.from : null, to: mid ? mid.to : null, at, margin: m && m.jab && m.jab.margin !== null ? +(m.jab.margin * 100).toFixed(1) : null, unclean, hit: m ? m.mine.n : null, J: m ? m.mine.J : null, clear: null, tied: null };
}
export const OVER_LEVELS = ['3', '4m', '4a', '5m', '5a'];
export function grades() {
  const out = {};
  for (const card of CARDS) {
    out[card.id] = {};
    for (const lv of card.levels || LEVELS) {
      const w = window(card.punch, card.move, card.value, { all: lv }, card.guard, card.tech, card.gap),
        mid = pick(card, lv, w.works),
        T = card.guard ? null : timeline(card.move, LEVEL[lv]);
      out[card.id][lv] = {
        works: w.works,
        lands: w.lands,
        from: mid ? mid.from : null,
        to: mid ? mid.to : null,
        at: mid ? mid.at : null,
        margin: mid && w.margins[mid.at] !== null && w.margins[mid.at] !== undefined ? +(w.margins[mid.at] * 100).toFixed(1) : null,
        unclean: mid ? mid.unclean : [],
        clear: T ? Math.round(T.clear * 1000) : null,
        tied: T ? Math.round(T.end * 1000) : null
      };
    }
  }
  // (the cross counter's, stage Y: its own drill and its own measure of what works, above)
  out.crossCounter = Object.fromEntries(OVER_LEVELS.map(lv => [lv, overGrade(lv)]));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--grades') || process.argv.includes('--write')) {
    const g = grades();
    if (process.argv.includes('--json')) console.log(JSON.stringify(g, null, 2));
    else {
      console.log('card         ' + LEVELS.map(lv => lv.padEnd(16)).join(''));
      for (const [id, row] of Object.entries(g)) {
        console.log(id.padEnd(13) + LEVELS.map(lv => (row[lv] ? `${span(row[lv].works)} @${row[lv].at}` : '').padEnd(16)).join(''));
        if (id !== 'parry' && id !== 'parryDown') console.log(''.padEnd(13) + LEVELS.map(lv => (row[lv] ? `${row[lv].margin ?? '-'}cm ${row[lv].clear}/${row[lv].tied}` : '').padEnd(16)).join(''));
      }
      console.log('(frames after the press that throws the punch: the window, and @ the frame the card presses on; under it the margin at that frame, cm, and the head clear / tied up, ms)');
    }
    if (process.argv.includes('--write')) {
      // (and, of the cross counter's row only, the frame his punch got there from the middle: stage X reads it)
      const slim = Object.fromEntries(Object.entries(g).map(([id, row]) => [id, Object.fromEntries(Object.entries(row).map(([lv, r]) => [lv, Object.assign({ from: r.from, to: r.to, at: r.at, margin: r.margin, unclean: r.unclean }, r.hit !== undefined ? { hit: r.hit } : {})]))]));
      writeFileSync(
        new URL('../src/windows.data.mjs', import.meta.url),
        `/* Written by node tools/windows.mjs --write: for each card of the catalogue's defence (src/defense.mjs) and each grade of the
   boxer defending, the window (frames after the press that throws the punch on which the answer works: from, to), the frame
   in the middle of it that the card presses on (at), and how far the punch misses by from there (margin, cm); unclean: the
   frames of the window nearer the middle that were passed over because an arm went through a glove from there. Measured,
   not written by hand: run the tool again after changing anything that moves the head. */
export const WINDOWS = ${JSON.stringify(slim)};\n`
      );
      console.log('wrote src/windows.data.mjs');
    }
  } else {
    const table = MOVES.map(([move, value, name]) => ({ move, value, name, punches: Object.fromEntries(PUNCHES.map(p => [p, window(p, move, value)])) }));
    if (process.argv.includes('--json')) console.log(JSON.stringify(table, null, 2));
    else {
      console.log('move                        ' + PUNCHES.map(p => p.padEnd(12)).join(''));
      for (const row of table) console.log(row.name.padEnd(24) + PUNCHES.map(p => span(row.punches[p].works.filter(k => k >= 0)).padEnd(12)).join(''));
      console.log('(frames after the press that throws the punch; it lands on ' + PUNCHES.map(p => `${p} ${table[0].punches[p].lands}`).join(', ') + ' if nothing is done)');
    }
  }
}

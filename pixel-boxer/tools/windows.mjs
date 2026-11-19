#!/usr/bin/env node
/* The evasion windows, measured: for every way of getting the head out of the way and every punch, the frames after the
   press that throws the punch on which starting the evasion makes the punch miss. Each is fought the way the catalogue
   fights it (src/defense.mjs): the boxer at home, the other man at the punch's range, the punch thrown at the same moment
   of a fresh bout (a hook or an uppercut as the second or third of his power chain, the punches before it taken on a held
   guard), so that what is measured here is what the drills run, the boxer's own head movement and all.
     node tools/windows.mjs            the table
     node tools/windows.mjs --json */
import { step } from '../src/game/bout.mjs';
import { freshBout, drive, HOME } from '../src/footwork.mjs';
import { RANGE, THROW } from '../src/defense.mjs';

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

// a drill: the punch, and the boxer's answer `k` frames after it is pressed (or none)
export function drill(punch, move, value, k) {
  const at = AT[punch];
  return {
    id: `${move}@${punch}+${k}`,
    loop: at + 0.9,
    me: () => HOME,
    him: () => [HOME[0] + RANGE[punch], HOME[1]],
    against: THROW[punch].map(([dt, button]) => [at + dt, button]),
    // (the punches before the last are taken on a guard, put down just before it)
    cover: punch === 'hook' || punch === 'upper' ? t => t > 0.2 && t < at - 0.05 : undefined,
    press: k === null ? [] : [[at + k * F, move, value]]
  };
}
// what became of the last punch the other man threw: 'whiff', 'hit', ...; and the frame (after its press) it got there
export function outcome(entry) {
  const bout = freshBout(entry);
  let last = null;
  for (let tick = 0; tick < Math.round(entry.loop / F); tick++) {
    step(bout, drive(entry, bout, tick * F, F), F);
    bout.fighters[0].hp = Math.max(bout.fighters[0].hp, 50);
    for (const e of bout.events) if (e.who === 1 && ['hit', 'block', 'parry', 'whiff', 'graze'].includes(e.type)) last = { type: e.type, tick };
  }
  return last;
}
// the frames after the press on which the evasion works, for one move against one punch
export function window(punch, move, value) {
  const base = outcome(drill(punch, move, value, null)),
    lands = base ? base.tick + 1 - Math.round(AT[punch] / F) : 20,
    works = [];
  for (let k = 0; k <= lands; k++) if (outcome(drill(punch, move, value, k)).type === 'whiff') works.push(k);
  return { lands, works };
}
// a run of frames as the table writes it: 3–5, or 0–2, 7–9, or – for none
export const span = list => {
  if (!list.length) return '–';
  const runs = [];
  for (const k of list) if (runs.length && k === runs[runs.length - 1][1] + 1) runs[runs.length - 1][1] = k;
  else runs.push([k, k]);
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const table = MOVES.map(([move, value, name]) => ({ move, value, name, punches: Object.fromEntries(PUNCHES.map(p => [p, window(p, move, value)])) }));
  if (process.argv.includes('--json')) console.log(JSON.stringify(table, null, 2));
  else {
    console.log('move                        ' + PUNCHES.map(p => p.padEnd(12)).join(''));
    for (const row of table) console.log(row.name.padEnd(24) + PUNCHES.map(p => span(row.punches[p].works).padEnd(12)).join(''));
    console.log('(frames after the press that throws the punch; it lands on ' + PUNCHES.map(p => `${p} ${table[0].punches[p].lands}`).join(', ') + ' if nothing is done)');
  }
}

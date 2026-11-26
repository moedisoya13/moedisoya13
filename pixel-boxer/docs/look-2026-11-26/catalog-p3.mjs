// catalog-p3 (evidence): how long, at 1×, the moments the user's notes asked to see last in their cards (press → landing,
// neck taken → uppercut, down parry, the whip), against the loop they sit in. Cards stepped as the page steps them.
//   node catalog-p3.mjs <pixel-boxer root>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2]);
const src = f => import(pathToFileURL(path.join(root, 'src', f)).href);
const [foot, defense, ladder, { step }, { ACTIONS }, body] = await Promise.all(['footwork.mjs', 'defense.mjs', 'ladder.mjs', 'game/bout.mjs', 'memo.actions.mjs', 'bodyshots.mjs'].map(src));
const all = [...ladder.REAR_LADDER, ...ladder.DIRTY, ...ladder.STANCES, ...defense.DEFENSE, ...defense.PARRY_DOWN, ...defense.ROLLING, ...ladder.LADDER, ...ladder.SHOWOFF, ...ladder.TAUNTING];
const DT = 1 / 60;
const run = e => { const bout = foot.freshBout(e), out = []; for (let k = 0; k < Math.round(e.loop / DT); k++) { step(bout, foot.drive(e, bout, k * DT, DT), DT); bout.fighters[1].hp = 1000; bout.fighters[0].hp = 1000; for (const ev of bout.events) out.push(Object.assign({ f: k + 1 }, ev)); } return out; };
// (row, card, the note's words, from which event to which)
const LOOK = [
  ['hookIn', '5m', 'punch', 'hit'], ['upperIn', '5m', 'punch', 'hit'], ['hookR', '5m', 'punch', 'hit'], ['flicker', '5a', 'punch', 'hit'],
  ['collar', '4a', 'collar', 'hit'], ['collar', '5a', 'collar', 'hit'], ['rollCounter', '5m', 'roll', 'hit']
];
const ms = [];
for (const [row, lv, from, to] of LOOK) {
  const e = all.find(x => x.id === `${row}@${lv}`), ev = run(e), a = ev.find(x => x.type === from), b = ev.find(x => x.type === to && x.f >= a.f);
  const d = (b.f - a.f) * DT * 1000;
  ms.push(d);
  console.log(`${(row + '@' + lv).padEnd(16)} ${from} → ${to}: ${b.f - a.f} frames = ${d.toFixed(0)} ms of a ${e.loop} s loop (${((d / 1000 / e.loop) * 100).toFixed(1)}%)  — note: ${ACTIONS[row] ? ACTIONS[row].state : '-'}`);
}
ms.sort((a, b) => a - b);
console.log(`EVIDENCE: the moments the notes asked about last ${ms[0].toFixed(0)}–${ms[ms.length - 1].toFixed(0)} ms at 1× (median ${ms[ms.length >> 1].toFixed(0)} ms); the page's only slower speeds are the page-wide ½×/¼× buttons in the header`);

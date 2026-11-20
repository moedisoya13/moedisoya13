#!/usr/bin/env node
/* The skill ladder, measured: every rung of the catalogue (src/ladder.mjs) fought as the page fights it, and the numbers the
   plan asks of each grade taken off the bout, sixty times a second (src/measure.mjs).
     node tools/ladder.mjs            the punch table and the footwork table
     node tools/ladder.mjs --json
   For a punch: the impulse, when it landed after the press, how far the head was off the line of the punch at that moment
   (from where his head is in his own guard), the most the hips turned and the most the shoulders were held back behind them
   (both from his guard), and how far the hips had gone up or down by the contact, from where they were at the press and from
   his guard; and the glove's speed and the mass behind it.
   For the footwork: how far the hips go up and down standing, how far the head goes across and up and down, how far a foot
   is ever off the canvas, how many feet a minute are lifted and come down (and how many landings his beat has), the beat
   (how even the landings are, how strong against weak, how swung), and the flourishes seen. */
import { LEVELS } from '../src/anim/skill.mjs';
import { rung, stance } from '../src/measure.mjs';
export * from '../src/measure.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  const punches = ['jab', 'cross', 'hook', 'upper', 'hookIn', 'upperIn'].map(p => LEVELS.map(lv => rung(`${p}@${lv}`))),
    stances = LEVELS.map(lv => stance(lv, 20));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ punches: punches.map(r => r.map(({ frames, ...x }) => x)), stances: stances.map(({ frames, ...x }) => x) }, null, 2));
  else {
    console.log('punch  grade  outcome   J      ms   head off cm  hips turn deg  separation deg  hips at contact cm');
    for (const row of punches)
      for (const r of row) console.log(`${r.punch.padEnd(7)}${r.level.padEnd(7)}${r.type.padEnd(8)}${String(r.J).padStart(6)}  ${String(r.ms).padStart(4)}   ${String(r.off).padStart(6)}        ${String(r.hipTurn).padStart(6)}         ${String(r.sep).padStart(6)}          ${String(r.rise).padStart(5)} ${String(r.sunk).padStart(5)}   ${r.speed} m/s ${r.mass} kg`);
    console.log('\ngrade  hips cm  head across cm  head up-down cm  foot off cm  feet/min (lifted, landed)  beat cv  strong/weak  swing  flourishes in 20 s');
    for (const s of stances) console.log(`${s.level.padEnd(7)}${String(s.hips).padStart(6)}   ${String(s.head).padStart(8)}         ${String(s.headY).padStart(8)}       ${String(s.lifted).padStart(6)}       ${String(s.steps).padStart(5)} ${String(s.landings).padStart(5)}          ${String(s.beat.cv).padStart(6)}   ${String(s.beat.strong).padStart(6)}   ${String(s.beat.swing).padStart(6)}  ${s.flourishes.join(', ')}`);
  }
}

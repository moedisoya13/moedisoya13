#!/usr/bin/env node
/* The physics audit (src/audit.mjs), printed: for each check, how often it is broken and the worst case (which script, when,
   who, doing what), how deep a man's own glove went into his other arm in each action, broken or not, and, under "watched",
   what is measured and not yet held (src/audit.mjs: a glove jumping, script group by script group).
   tests/audit.test.mjs runs the same audit and holds it to nothing broken.
     node tools/audit.mjs                       the summary
     node tools/audit.mjs --all                 every action a check was broken in, not just the five it was broken in most
     node tools/audit.mjs --script a,b          only these scripts (by id)
     node tools/audit.mjs --only ko,slump       only frames in these actions
     node tools/audit.mjs --falls               the knockdowns frame by frame
     node tools/audit.mjs --turning             how fast and how far the pelvis, the waist and the chest turn in each punch
     node tools/audit.mjs --json out.json       everything, for another tool */
import { audit, SCRIPTS } from '../src/audit.mjs';

const args = process.argv.slice(2),
  flag = n => args.includes('--' + n),
  opt = n => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null);

const pick = opt('script') ? opt('script').split(',') : null,
  scripts = pick ? SCRIPTS.filter(e => pick.includes(e.id)) : SCRIPTS,
  { found, watched, seen, falls, turning } = audit(scripts, { only: opt('only') ? opt('only').split(',') : null });

if (opt('json')) (await import('node:fs')).writeFileSync(opt('json'), JSON.stringify({ found, watched, falls: Object.fromEntries(Object.entries(falls).map(([k, v]) => [k, v.map(f => ({ t: f.t, doing: f.doing, com: f.com, head: f.head, hips: f.hips, angles: f.angles }))])), turning }));
const rows = Object.entries(found)
  .filter(([, c]) => c.bad)
  .sort((x, y) => y[1].bad - x[1].bad);
console.log(`${scripts.length} scripts, ${seen} frames of a man checked\n`);
console.log('check'.padEnd(70) + 'frames'.padStart(7) + '  worst'.padEnd(10) + '  where (script @ s, who, doing)   | most often while');
for (const [check, c] of rows) {
  const w = c.worst,
    by = Object.entries(c.by).sort((x, y) => y[1] - x[1]).slice(0, flag('all') ? 99 : 5).map(([k, n]) => `${k} ${n} (${c.most[k]})`).join(', ');
  console.log(check.padEnd(70) + String(c.bad).padStart(7) + ('  ' + (+w.value.toFixed(1))).padEnd(10) + `  ${w.script} @ ${w.t}, ${w.who}${w.part ? ' (' + w.part + ')' : ''}, ${w.doing}`.padEnd(48) + ' | ' + by);
}
/* (his own glove in his other arm, broken or not: the deepest it went in each action, past touching with the padding's give
   taken off, as the check is held to 2; and where it is broken, script by script) */
{
  const check = 'his own glove in his other arm',
    c = found[check];
  if (c) {
    const deep = Object.entries(c.largestBy).filter(([, v]) => v > 0.05).sort((x, y) => y[1] - x[1]);
    console.log(`\n${check}, the deepest it went (cm, held to 2): ` + (deep.length ? deep.slice(0, flag('all') ? 99 : 8).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ') : 'nowhere'));
    if (c.bad) {
      const each = {};
      for (const k of c.cases) (each[k.script] = each[k.script] || { n: 0, most: 0 }), each[k.script].n++, (each[k.script].most = Math.max(each[k.script].most, k.value));
      console.log(`${check}, script by script (${c.bad} in all): ` + Object.entries(each).sort((x, y) => y[1].n - x[1].n).map(([s, e]) => `${s} ${e.n} (${e.most.toFixed(1)})`).join(', '));
    }
  }
}
/* (watched, not held: a glove jumping, its hand not punching, parrying or pawing. How many frames break it and the worst, and
   script group by script group, frames and the worst m/s: what is to be mended, and what a stage's audit is compared by) */
for (const [check, c] of Object.entries(watched)) {
  if (!c.bad) {
    console.log(`\nwatched, not held: ${check}: nowhere`);
    continue;
  }
  const w = c.worst,
    by = {};
  for (const [script, k] of Object.entries(c.scripts)) {
    const g = (by[script.split('@')[0]] = by[script.split('@')[0]] || { n: 0, most: 0 });
    (g.n += k.frames), (g.most = Math.max(g.most, k.most));
  }
  console.log(`\nwatched, not held: ${check}: ${c.bad} frames in ${Object.keys(by).length} groups of scripts, the worst ${+w.value.toFixed(1)} at ${w.script} @ ${w.t}, ${w.who}${w.part ? ' (' + w.part + ')' : ''}, ${w.doing}`);
  console.log(Object.entries(by).sort((x, y) => y[1].most - x[1].most || (x[0] < y[0] ? -1 : 1)).map(([g, e]) => `${g} ${e.n} (${e.most.toFixed(1)})`).join(', '));
}
/* (a landing on the canvas is held to so many frames a script, not in all: tests/audit.test.mjs allows a knockdown's fall at
   most 4 frames thrown upward in any one script, none past 14 g; the total is the table's) */
for (const check of ['thrown upward (g)', 'falling faster than gravity (g)']) {
  const c = found[check];
  if (!c || !c.bad) continue;
  const each = {};
  for (const k of c.cases) (each[k.script] = each[k.script] || { n: 0, most: 0 }), each[k.script].n++, (each[k.script].most = Math.max(each[k.script].most, Math.abs(k.value)));
  console.log(`\n${check}, script by script (${c.bad} in all): ` + Object.entries(each).sort((x, y) => y[1].n - x[1].n).map(([s, e]) => `${s} ${e.n} (${e.most.toFixed(1)})`).join(', '));
}
console.log('\nclean: ' + Object.entries(found).filter(([, c]) => !c.bad).map(([k]) => k).join('; '));
if (!rows.length) console.log('\nnothing broken');

if (flag('falls'))
  for (const [id, frames] of Object.entries(falls)) {
    console.log(`\n== ${id}: t, doing | head, hips, centre of mass height (cm) | COM speed down (m/s) | elbows L/R, knees L/R (interior) | knee round L/R | ankle L/R | lowest point`);
    let last = null;
    for (const f of frames) {
      if (f.doing === 'guard' || f.held) continue;
      const v = last ? (last.com[1] - f.com[1]) / (f.t - last.t) : 0,
        low = Object.entries(f.at).reduce((b, [k, q]) => (q[1] < b[1] ? [k, q[1]] : b), ['', 9]),
        r = x => String(x === null ? '-' : x.toFixed(0));
      if (Math.round(f.t * 60) % 4 === 0) console.log(`${f.t.toFixed(2)} ${f.doing.padEnd(9)} | ${(f.head[1] * 100).toFixed(0).padStart(4)} ${(f.hips[1] * 100).toFixed(0).padStart(4)} ${(f.com[1] * 100).toFixed(0).padStart(4)} | ${v.toFixed(2).padStart(6)} | ${f.angles.LeftElbow.toFixed(0).padStart(4)} ${f.angles.RightElbow.toFixed(0).padStart(4)} ${f.angles.LeftKnee.toFixed(0).padStart(4)} ${f.angles.RightKnee.toFixed(0).padStart(4)} | ${r(f.angles.LeftKneeRound).padStart(5)} ${r(f.angles.RightKneeRound).padStart(5)} | ${f.angles.LeftAnkle.toFixed(0).padStart(4)} ${f.angles.RightAnkle.toFixed(0).padStart(4)} | ${low[0]} ${(low[1] * 100).toFixed(0)}`);
      last = f;
    }
  }
if (flag('turning')) {
  console.log('\nfastest each joint turned while a punch was thrown (degrees a second: the pelvis and the chest on the canvas, the waist and the chest on the pelvis, the chest on the waist, the elbow; the glove in m/s)');
  for (const [punch, grades] of Object.entries(turning)) for (const [lv, r] of Object.entries(grades)) console.log(`${punch.padEnd(6)} ${lv.padEnd(3)} pelvis ${r.hips.toFixed(0).padStart(5)}  chest ${r.chest.toFixed(0).padStart(5)}  waist on pelvis ${r.waist.toFixed(0).padStart(5)}  chest on pelvis ${r.trunk.toFixed(0).padStart(5)}  chest on waist ${r.own.toFixed(0).padStart(5)}  elbow ${r.elbow.toFixed(0).padStart(5)}  glove ${r.glove.toFixed(1).padStart(5)}`);
}

// 4-4: in matches the stagger (reel, stage V) breaks the held "falling faster than gravity" check (1.5 g) by more than the one
// known exception (out-log, 1 frame, 1.6 g): seed 2 reaches 2.6 g. Matches: seed 2 (3 v 1, pressure / breathe) to 54.1 s and
// seed 23 (3 v 1, pressure / breathe) to 11.5 s.   usage: node 4-4.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch } = await import(root + '/src/game/match.mjs');
const { PLANS } = await import(root + '/src/game/brain.mjs');
const { auditor, measure } = await import(root + '/src/audit.mjs');
const a = auditor();
for (const [seed, until] of [[2, 54.1], [23, 11.5]]) {
  const match = createMatch({ seed, skills: [{ all: '3' }, { all: '1' }], plans: [PLANS.pressure, PLANS.breathe], rounds: 1, roundTime: 60 });
  a.begin({ id: 'seed ' + seed });
  const ys = [];
  for (let tick = 0; tick < until * 60; tick++) {
    stepMatch(match, 1 / 60);
    if (match.phase !== 'fight' && match.phase !== 'count') break;
    a.frame(match.bout, tick);
    if (seed === 2 && tick / 60 > 53.84) ys.push(`${(tick / 60).toFixed(3)} ${match.bout.fighters[0].action ? match.bout.fighters[0].action.name : 'guard'} stop=${match.bout.stop > 0 ? 1 : 0} com y ${(measure(match.bout.fighters[0]).com[1] * 100).toFixed(2)} cm`);
  }
  if (ys.length) console.log('seed 2, red (grade 3), centre of mass height:\n  ' + ys.join('\n  '));
}
const c = a.result().found['falling faster than gravity (g)'];
console.log(`falling faster than gravity: ${c.bad} frames: ${c.cases.map(k => `${k.script} @ ${k.t} s ${k.who ? 'blue' : 'red'} ${k.doing} ${k.value} g`).join('; ')}`);
const reel = c.cases.filter(k => k.doing === 'reel');
const most = Math.max(0, ...reel.map(k => k.value));
console.log(most > 1.6 ? `REPRO: yes reel (stagger) breaks "falling faster than gravity" at ${most} g (known exception: out-log 1.6 g), ${reel.length} reel frames` : 'REPRO: no');

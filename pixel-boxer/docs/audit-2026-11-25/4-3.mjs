// 4-3: a 5명 (5L) in a match stands on one foot with his centre of mass far outside it for more than 0.3 s, again and again
// (held audit check "standing where he would topple", clean in the catalogue). Match: seed 5, 5m v 3, breathe / allin, first 40 s.
// usage: node 4-3.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch } = await import(root + '/src/game/match.mjs');
const { PLANS } = await import(root + '/src/game/brain.mjs');
const { auditor } = await import(root + '/src/audit.mjs');
const match = createMatch({ seed: 5, skills: [{ all: '5m' }, { all: '3' }], plans: [PLANS.breathe, PLANS.allin], rounds: 1, roundTime: 60 });
const a = auditor();
a.begin({ id: 'seed 5: 5m v 3' });
const pos = {};
for (let tick = 0; tick < 40 * 60; tick++) {
  stepMatch(match, 1 / 60);
  if (match.phase !== 'fight' && match.phase !== 'count') break;
  a.frame(match.bout, tick);
  pos[tick] = match.bout.fighters.map(f => [+f.x.toFixed(2), +f.z.toFixed(2)]);
}
const c = a.result().found['standing where he would topple (cm outside his feet, held over 0.3 s)'];
const by = [0, 0], mid = [0, 0];
for (const k of c.cases) { by[k.who]++; const p = pos[Math.round(k.t * 60)][k.who]; if (Math.max(Math.abs(p[0]), Math.abs(p[1])) < 2.3) mid[k.who]++; }
const runs = [];
for (const k of c.cases) { const l = runs[runs.length - 1]; if (l && l.who === k.who && k.t - l.to < 0.05) (l.to = k.t), (l.most = Math.max(l.most, k.value)); else runs.push({ who: k.who, from: k.t, to: k.t, most: k.value }); }
console.log(`frames broken: red (5m) ${by[0]}, blue (3) ${by[1]}; of them away from the ropes (|x|,|z| < 2.3 m): red ${mid[0]}, blue ${mid[1]}`);
console.log('stretches (each is already 0.3 s past the start of the lean):', runs.map(r => `${r.who ? 'blue' : 'red'} ${r.from}-${r.to}s ${r.most.toFixed(1)}cm`).join('; '));
console.log(`worst ${c.worst.value.toFixed(1)} cm at ${c.worst.t} s, ${c.worst.who ? 'blue' : 'red'}, ${c.worst.doing}`);
console.log(by[0] > 20 ? `REPRO: yes held check "standing where he would topple" broken ${c.bad} frames (${runs.length} stretches) in 40 s, worst ${c.worst.value.toFixed(1)} cm, mostly the 5m` : `REPRO: no (${c.bad})`);

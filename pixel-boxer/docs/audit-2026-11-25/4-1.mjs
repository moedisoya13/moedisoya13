// 4-1: in a seeded match a cross thrown out of a high parrying cover swings the upper arm far past the shoulder's turn range
// (a HELD audit check, clean in all catalogue scripts). Match: seed 2, grades 3 vs 1, plans pressure / breathe, one 60 s round.
// usage: node 4-1.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch } = await import(root + '/src/game/match.mjs');
const { PLANS } = await import(root + '/src/game/brain.mjs');
const { auditor, measure } = await import(root + '/src/audit.mjs');
const seed = 2;
const match = createMatch({ seed, skills: [{ all: '3' }, { all: '1' }], plans: [PLANS.pressure, PLANS.breathe], rounds: 1, roundTime: 60 });
const a = auditor();
a.begin({ id: 'seed 2: 3 v 1' });
const rows = [];
for (let tick = 0; tick < 16 * 60; tick++) {
  stepMatch(match, 1 / 60);
  if (match.phase !== 'fight' && match.phase !== 'count') break;
  a.frame(match.bout, tick);
  const t = tick / 60, f = match.bout.fighters[1];
  if (t > 14.34 && t < 14.54) {
    const m = measure(f);
    rows.push(`  t=${t.toFixed(3)} ${f.action ? f.action.name + '/' + (f.action.chain ? f.action.chain.phase : '') : f.cover ? 'cover' : 'guard'} right shoulder twist ${m.angles.RightShoulderTwist === null ? '-' : m.angles.RightShoulderTwist.toFixed(1)}, past range ${m.angles.RightShoulderTurned.toFixed(1)}, elevation ${m.angles.RightShoulderElev.toFixed(1)}`);
  }
}
const c = a.result().found['upper arm turned past its range (degrees past)'];
console.log('blue (grade 1) parries a hook from his cover at 14.23 s, then presses a cross out of it:');
console.log(rows.join('\n'));
console.log(`held check "upper arm turned past its range": ${c.bad} frames broken, worst ${c.worst ? c.worst.value.toFixed(1) + ' deg past at ' + c.worst.t + ' s, ' + c.worst.doing : '-'}`);
console.log(c.bad > 0 && c.worst.value > 20 ? `REPRO: yes held audit check broken in a match: upper arm turned ${c.worst.value.toFixed(1)} deg past its range (${c.bad} frames) on a cross out of cover` : `REPRO: no (${c.bad} frames)`);

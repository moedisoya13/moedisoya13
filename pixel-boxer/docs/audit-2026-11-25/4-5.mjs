// 4-5: more held audit checks (each clean in all catalogue scripts) broken by seeded matches: his own glove deep in his other
// arm (held to 2 cm), a thigh behind the pelvis, his own glove in his head, the two men inside each other.
// Matches (grades and plans as in eye 4's sweep): seed 29 (2 v 4a, jab / steady) to 42 s; seed 13 (5a v 5m, allin / defend)
// to 49.5 s; seed 26 (5m v 3, breathe / allin) to 28 s; seed 5 (5m v 3, breathe / allin) to 19 s.  usage: node 4-5.mjs <root>
const root = process.argv[2];
const { createMatch, stepMatch } = await import(root + '/src/game/match.mjs');
const { PLANS } = await import(root + '/src/game/brain.mjs');
const { auditor } = await import(root + '/src/audit.mjs');
const { LEVELS } = await import(root + '/src/anim/skill.mjs');
const PL = Object.keys(PLANS);
const a = auditor();
for (const [seed, until] of [[29, 42], [13, 49.5], [26, 28], [5, 19]]) {
  const g = [LEVELS[seed % 7], LEVELS[(seed * 3 + 1) % 7]], plans = [PLANS[PL[seed % PL.length]], PLANS[PL[(seed * 5 + 2) % PL.length]]];
  const match = createMatch({ seed, skills: g.map(x => ({ all: x })), plans, rounds: 1, roundTime: 60 });
  a.begin({ id: `seed ${seed} (${g.join(' v ')})` });
  for (let tick = 0; tick < until * 60; tick++) {
    stepMatch(match, 1 / 60);
    if (match.phase !== 'fight' && match.phase !== 'count') break;
    a.frame(match.bout, tick);
  }
}
const found = a.result().found, hits = [];
for (const [check, limit] of [['his own glove in his other arm', 2], ['thigh behind the pelvis', 0], ['his own glove in head', 2], ['the two men inside each other', 5]]) {
  const c = found[check];
  const w = c && c.worst;
  console.log(`${check}: ${c ? c.bad : 0} frames broken${w ? `, worst ${w.value.toFixed(1)} at ${w.script} @ ${w.t} s, ${w.who}${w.part ? ' ' + w.part : ''}, ${w.doing}` : ''}`);
  if (c && c.bad) hits.push(`${check} ${w.value.toFixed(1)}`);
}
console.log(hits.length >= 3 ? `REPRO: yes ${hits.length} more held checks broken in matches: ${hits.join('; ')}` : `REPRO: no (${hits.join('; ')})`);

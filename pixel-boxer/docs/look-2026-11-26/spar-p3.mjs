// spar-p3 (evidence): the rounds open alike. Arranges only the first 3 s of seeds A..B and lists each man's first actions:
// a man not a show-off almost always puts his guard up and then jabs (the other man's first punch, in hand, is "promised",
// so he waits for it under his guard: src/spar/plan.mjs think, the threat branch). Usage: node spar-p3.mjs <root> [A] [B]
const root = process.argv[2], A = +(process.argv[3] || 1), B = +(process.argv[4] || 40);
const { planner } = await import(root + '/src/spar/plan.mjs');
const { LEVEL } = await import(root + '/src/anim/skill.mjs');
const ACT = ['attack', 'evade', 'guard', 'show'];
let men = 0, plain = 0, guardThenJab = 0, guardFirst = 0, firstPunchJab = 0, feet = new Map(), shows = 0, showTaunt = 0;
const shapes = new Map();
for (let s = A; s <= B; s++) {
  const p = planner(s);
  while (!p.done && p.plan.inputs.length < 180) p.run(20);
  for (const i of [0, 1]) {
    men++;
    const show = /암/.test(LEVEL[p.plan.men[i].grade].label);
    const acts = p.plan.rails[i].filter(b => ACT.includes(b.kind)).map(b => b.name);
    const atk = p.plan.rails[i].find(b => b.kind === 'attack');
    if (show) { shows++; if (['beckon', 'chinOut', 'wind'].includes(acts[0])) showTaunt++; continue; }
    plain++;
    if (acts[0] === 'guard') guardFirst++;
    if (atk && atk.name === 'jab') firstPunchJab++;
    if (acts[0] === 'guard' && acts.slice(1, 3).includes('jab')) guardThenJab++;
    const k = acts.slice(0, 3).join('-'); shapes.set(k, (shapes.get(k) || 0) + 1);
    const f = p.plan.feet[i][0]; f && feet.set(f.name, (feet.get(f.name) || 0) + 1);
  }
}
console.log(`seeds ${A}-${B}: ${men} men, ${plain} not show-offs`);
console.log(`not show-offs: first action the guard ${guardFirst}/${plain}; first punch a jab ${firstPunchJab}/${plain}; guard then a jab within the next two ${guardThenJab}/${plain}`);
console.log('their first three actions:', [...shapes].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('their first step:', [...feet].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`show-offs: first action a taunt ${showTaunt}/${shows} (and a taunt plays for 1 frame: spar-1)`);
console.log(`EVIDENCE: ${guardFirst}/${plain} plain men open with the guard and ${firstPunchJab}/${plain} throw a jab first; ${showTaunt}/${shows} show-offs open with a taunt`);

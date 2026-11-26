// spar-1: a show-off's taunts (4암 · 5암: 손짓 · 턱 내밀기 · 풍차) never play in the sparring. The planner presses one
// (src/spar/plan.mjs:619) but its footwork stream walks him on the same steps (feet(): c.move, usually > 0.3), and the engine
// ends a taunt "the moment he does anything: a button, his guard, setting off" (src/game/bout.mjs:822-823). The rails still
// count each as an action (rails.mjs ACTS has 'show'; docs/spar.md "도발 370"). Measures, per taunt the bout starts, how many
// frames he is in it against the move's own length, and what cut it. Usage: node spar-5.mjs <pixel-boxer root> [seeds, comma]
const root = process.argv[2], seeds = (process.argv[3] || '13,16').split(',').map(Number);
const { planOf, replayOf } = await import(root + '/src/spar/plan.mjs');
const { MOVES } = await import(root + '/src/anim/moves.mjs');
const { LEVEL } = await import(root + '/src/anim/skill.mjs');
let n = 0, short = 0, frames = [], why = {}, full = [];
for (const s of seeds) {
  const plan = planOf(s), on = [null, null];
  replayOf(plan, (bout, k) => {
    if (k >= plan.ko.step) return;
    bout.fighters.forEach((f, i) => {
      const t = f.action && MOVES[f.action.name] && MOVES[f.action.name].taunt ? f.action : null;
      if (t && (!on[i] || on[i].a !== t)) (on[i] = { a: t, n: 0, name: t.name, from: k }), n++, full.push(MOVES[t.name].dur);
      if (t) on[i].n++;
      else if (on[i]) {
        const inp = plan.inputs[k][i] || {}, mv = Math.hypot(...(inp.move || [0, 0]));
        const c = inp.cover ? 'cover' : inp.jab || inp.power || inp.slip || inp.duck || inp.roll || inp.pull || inp.dash || inp.away ? 'button' : mv > 0.3 ? 'walking (stick ' + (mv > 0.75 ? '>0.75' : '0.3-0.75') + ')' : 'other';
        why[c] = (why[c] || 0) + 1; frames.push(on[i].n); if (on[i].n <= 2) short++; on[i] = null;
      }
    });
  });
  console.log(`#${s} ${plan.men.map(m => LEVEL[m.grade].label).join('/')}: taunt blocks on the rails ${plan.rails.flat().filter(b => b.kind === 'show' && b.from < plan.ko.step).length}`);
}
frames.sort((a, b) => a - b);
const dur = full.reduce((a, b) => a + b, 0) / full.length;
console.log(`taunts started ${n}; frames in them: median ${frames[frames.length >> 1]}, longest ${frames.at(-1)}; the moves' own length ${dur.toFixed(2)} s (${Math.round(dur * 60)} frames) on average; ended by: ${Object.entries(why).map(([k, v]) => k + ' ' + v).join(', ')}`);
console.log(`REPRO: ${short / n > 0.5 ? 'yes' : 'no'} ${short} of ${n} taunts end within 2 frames (median ${frames[frames.length >> 1]} frame of ~${Math.round(dur * 60)}): the show-off never visibly taunts, yet each counts as an action`);

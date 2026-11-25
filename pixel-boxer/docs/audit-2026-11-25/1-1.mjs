// 1-1: the "keeps his hands up" guard of the defend / breathe / counter plans is a coin flipped every frame
// (src/game/brain.mjs:180 `random(bout) < 0.5` per step), so his guard goes up and down ~18 times a second and is almost
// always "fresh" (coverAge reset to 0 on every off frame, bout.mjs:988): a punch into it is parried far more often than a
// held guard with the same share of time up would parry it.
// usage: node 1-1.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch } = await import(root + '/src/game/match.mjs');
const { think, PLANS } = await import(root + '/src/game/brain.mjs');
const { RULES } = await import(root + '/src/game/bout.mjs');
const SEEDS = [11, 22];
function lcg(s) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function run(mode) {
  const tot = { frames: 0, coverOn: 0, toggles: 0, freshCovered: 0, thrown: 0, hit: 0, block: 0, parry: 0, whiff: 0 };
  for (const seed of SEEDS) {
    const m = createMatch({ seed, plans: [PLANS.defend, PLANS.steady], rounds: 1, roundTime: 60 }), rnd = lcg(seed);
    let prev = false, held = false, until = 0;
    while (m.phase === 'fight' || m.phase === 'count') {
      let inputs = null;
      if (m.phase === 'fight') {
        const c = think(m.brains[0], m.bout, 0, 1 / 60), b = m.brains[0];
        if (mode === 'held') {
          // control: the same share of time up, but held 0.4 s at a time (decided by its own dice, not the bout's)
          if (m.bout.t >= until) (held = rnd() < 0.5), (until = m.bout.t + 0.4);
          if (!b.answer && b.hold <= 0 && !b.burst.length && !c.power && !c.jab && !(m.bout.fighters[0].counter > 0)) c.cover = held;
        }
        inputs = [c, null];
      }
      stepMatch(m, 1 / 60, inputs);
      const f = m.bout.fighters[0];
      tot.frames++;
      if (f.cover) tot.coverOn++;
      if (f.cover !== prev) tot.toggles++;
      prev = f.cover;
      if (f.cover && f.coverAge <= f.k.parry * 0.7) tot.freshCovered++;
      for (const e of m.bout.events) {
        if (e.type === 'punch' && e.who === 1) tot.thrown++;
        if ((e.type === 'hit' || e.type === 'block') && e.who === 1) tot[e.type]++;
        if (e.type === 'whiff' && e.who === 1) tot.whiff++;
        if (e.type === 'parry' && e.who === 0) tot.parry++;
      }
    }
  }
  return tot;
}
const out = {};
for (const mode of ['as-is', 'held']) {
  const t = (out[mode] = run(mode));
  console.log(`${mode.padEnd(6)} guard up ${(t.coverOn / t.frames * 100).toFixed(0)}% of frames, toggles ${(t.toggles / (t.frames / 60)).toFixed(1)}/s, up-and-fresh ${(t.freshCovered / Math.max(1, t.coverOn) * 100).toFixed(0)}% of up frames; his punches at him: thrown ${t.thrown}, hit ${t.hit}, blocked ${t.block}, parried ${t.parry}, whiffed ${t.whiff}; parry share of guard contacts ${(t.parry / (t.parry + t.block) * 100).toFixed(0)}%`);
}
const a = out['as-is'], h = out.held, ps = t => t.parry / (t.parry + t.block);
const yes = a.toggles / (a.frames / 60) > 8 && ps(a) > ps(h) + 0.15;
console.log(`REPRO: ${yes ? 'yes' : 'no'} defend-plan guard flips ${(a.toggles / (a.frames / 60)).toFixed(1)} times/s; parries ${(ps(a) * 100).toFixed(0)}% of guard contacts vs ${(ps(h) * 100).toFixed(0)}% with the same guard share held (seeds ${SEEDS.join(',')}, 1 round each)`);

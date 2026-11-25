// 4-2: near the ring's corners the drawn rope gives only a fraction of what the body presses into it (ropes.mjs bend():
// min(1, (END - |u|) / 0.4)), and nothing else stops the body (centre clamp RULES.half 2.55, push back ROPE.k), so the trunk and
// head sit inside the drawn ropes there. The ropes are driven exactly as the page drives them (createRopes().update(points, dt)).
// Match: seed 2, grades 3 v 1, pressure / breathe, the first 30 s.   usage: node 4-2.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch } = await import(root + '/src/game/match.mjs');
const { PLANS } = await import(root + '/src/game/brain.mjs');
const { createRopes, contacts, bend, BODY } = await import(root + '/src/world/ropes.mjs');
const match = createMatch({ seed: 2, skills: [{ all: '3' }, { all: '1' }], plans: [PLANS.pressure, PLANS.breathe], rounds: 1, roundTime: 60 });
const ropes = createRopes([], 0);
let frames = 0, pressing = 0, through = 0, corner = 0, worst = null;
for (let tick = 0; tick < 30 * 60; tick++) {
  stepMatch(match, 1 / 60);
  if (match.phase !== 'fight' && match.phase !== 'count') break;
  const b = match.bout;
  ropes.update(b.fighters.map(f => f.points), b.stop > 0 ? 0 : 1 / 60);
  b.fighters.forEach((f, i) => {
    frames++;
    let w = 0, at = null;
    contacts(f.points).forEach((c, k) => {
      if (!(c.d > 0)) return;
      const s = ropes.state[k], drawn = bend(c.u, s.u, s.d), d = c.d - drawn;
      if (d > w) (w = d), (at = { rope: k, u: +c.u.toFixed(2), pressed: +(c.d * 100).toFixed(1), drawnOut: +(drawn * 100).toFixed(1) });
    });
    if (at || w) pressing++;
    if (w > 0.02) { through++; if (Math.abs(at.u) > 2.22) corner++; if (!worst || w > worst.cm / 100) worst = { cm: +(w * 100).toFixed(1), t: +(tick / 60).toFixed(2), who: i, x: +f.x.toFixed(2), z: +f.z.toFixed(2), ...at }; }
  });
}
console.log(`${frames} man-frames, ${pressing} pressing a rope, ${through} with a body ball (hips..head, ropes.mjs BODY) more than 2 cm past the rope as drawn (${corner} of them within 0.4 m of a corner)`);
console.log('worst:', JSON.stringify(worst), '(pressed: how far past the rope face the body is; drawnOut: how far the drawn rope is bent out there)');
console.log(worst && worst.cm > 5 ? `REPRO: yes body inside the drawn rope by up to ${worst.cm} cm near a corner (u=${worst.u}), ${through} of ${frames} man-frames > 2 cm` : 'REPRO: no');

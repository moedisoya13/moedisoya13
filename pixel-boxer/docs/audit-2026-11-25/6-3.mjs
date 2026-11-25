// 6-3: the ring corner: a man standing in a corner is half inside the corner pad, and his back is out through the ropes there
// (they are tied at the corner and drawn bent there by almost nothing).
// node 6-3.mjs <pixel-boxer root>
const root = process.argv[2];
const { createBout, step, RULES } = await import(root + '/src/game/bout.mjs');
const { RING } = await import(root + '/src/world/ring.mjs');
const { BODY, contacts, bend, ROPE } = await import(root + '/src/world/ropes.mjs');
const DT = 1 / 60;
// world/ring.mjs sculptRing: the pad, a box centred (rope + 0.12 - 0.1) out on both axes, half sizes 0.11, 0.55, 0.11, at 0.8 high
const PC = RING.rope + 0.12 - 0.1, PH = [0.11, 0.55, 0.11];
console.log(`the corner pad spans ${(PC - PH[0]).toFixed(2)}..${(PC + PH[0]).toFixed(2)} m out on both axes, ${(0.8 - PH[1]).toFixed(2)}..${(0.8 + PH[1]).toFixed(2)} m up; a man's centre is let go to ${RULES.half} m on each axis`);
function corner(name, ctl, setup) {
  const b = createBout(7);
  setup(b);
  let frames = 0, inPad = 0, depth = {}, through = 0;
  for (let i = 0; i < 240; i++) {
    step(b, ctl(i), DT);
    if (i < 90) continue;
    frames++;
    const f = b.fighters[0], sx = f.x < 0 ? -1 : 1, sz = f.z < 0 ? -1 : 1;
    let any = false;
    for (const [n, r] of BODY) {
      const p = f.points[n], c = [sx * PC, 0.8, sz * PC];
      const d = Math.min(PH[0] - Math.abs(p[0] - c[0]), PH[1] - Math.abs(p[1] - c[1]), PH[2] - Math.abs(p[2] - c[2]));
      if (d > 0) any = true;
      depth[n] = Math.max(depth[n] ?? -1, d);
    }
    if (any) inPad++;
    // (how far his body is out past each rope as it is drawn: pressed c.d, drawn out bend() of it)
    for (const c of contacts(f.points)) if (c.d > 0) through = Math.max(through, c.d - bend(c.u, c.u, Math.min(ROPE.drawn.most, c.d)));
  }
  const f = b.fighters[0];
  console.log(`${name}: centre (${f.x.toFixed(3)}, ${f.z.toFixed(3)}); body balls with their centre inside the pad in ${inPad} of ${frames} frames; deepest centre inside it (cm): ${JSON.stringify(Object.fromEntries(Object.entries(depth).filter(([, v]) => v > 0).map(([k, v]) => [k, +(v * 100).toFixed(1)])))}; body out past the ropes as drawn ${(through * 100).toFixed(1)} cm`);
  return { inPad, frames, through };
}
const r1 = corner('backed into the -x,-z corner', i => [{ move: [-0.7, -0.7] }, { move: i < 90 ? [-0.35, -0.35] : [0, 0] }], b => { b.fighters[0].x = 0; b.fighters[0].z = 0; b.fighters[1].x = 0.6; b.fighters[1].z = 0.6; });
const r2 = corner('pinned in the -x,-z corner by the other man', i => [{ move: i < 60 ? [-0.7, -0.7] : [0, 0] }, { move: [-0.7, -0.7] }], b => { b.fighters[0].x = -1.6; b.fighters[0].z = -1.6; b.fighters[1].x = 0; b.fighters[1].z = 0; });
const r3 = corner('(control) backed onto the -x ropes mid-side', i => [{ move: [-1, 0] }, { move: i < 90 ? [-0.5, 0] : [0, 0] }], b => { b.fighters[0].x = 0; b.fighters[1].x = 1.2; });
const yes = r1.inPad > 0 && r2.inPad > r2.frames / 2 && r3.inPad === 0;
console.log(yes ? `REPRO: yes in a corner his hips, waist, belly and chest stand inside the corner pad (${r2.inPad}/${r2.frames} frames pinned) and his body is ${(r2.through * 100).toFixed(0)} cm out through the ropes as drawn (mid-side: ${(r3.through * 100).toFixed(0)} cm)` : 'REPRO: no');

// 6-4: underground pit: a man backed to the edge (as far as he is let go, RULES.half 2.55 m) puts his rear foot into the low
// brick wall (its inner face PIT.edge 2.76 m out, 0.46 m high).
// node 6-4.mjs <pixel-boxer root>
const root = process.argv[2];
const { createBout, step, RULES } = await import(root + '/src/game/bout.mjs');
const { PIT } = await import(root + '/src/world/pit.mjs');
const { NAMES } = await import(root + '/src/rig/skeleton.mjs');
const { toWorld } = await import(root + '/src/anim/pose.mjs');
const DT = 1 / 60;
const joints = f => Object.fromEntries(NAMES.map(n => [n, toWorld(f.place, f.pose.at[n], f.pose.stretch)]));
let worstAll = 0;
for (const [dx, dz, name] of [[-1, 0, '-x side'], [0, 1, '+z side'], [-0.7071, -0.7071, '-x,-z corner']]) {
  const b = createBout(3, { arena: 'underground' });
  b.fighters[0].x = 0; b.fighters[0].z = 0; b.fighters[1].x = -dx * 1.2; b.fighters[1].z = -dz * 1.2;
  b.fighters[0].yaw = Math.atan2(-dx, -dz); b.fighters[1].yaw = Math.atan2(dx, dz);
  let frames = 0, inWall = 0, worst = { d: 0 };
  for (let i = 0; i < 240; i++) {
    step(b, [{ move: [dx, dz] }, { move: i < 90 ? [dx * 0.5, dz * 0.5] : [0, 0] }], DT);
    let any = false;
    for (const [n, p] of Object.entries(joints(b.fighters[0]))) {
      const d = Math.max(Math.abs(p[0]), Math.abs(p[2])) - PIT.edge;
      if (d > 0 && p[1] < PIT.wall.high) { any = true; if (d > worst.d) worst = { d, n, y: p[1], i }; }
    }
    if (i < 120) continue;
    frames++;
    if (any) inWall++;
  }
  worstAll = Math.max(worstAll, worst.d);
  const f = b.fighters[0];
  console.log(`backed to the ${name}: centre (${f.x.toFixed(2)}, ${f.z.toFixed(2)}); a joint inside the wall in ${inWall} of the last ${frames} frames (standing there); deepest over the whole walk back (frame ${worst.i}) ${worst.n} at ${worst.y && worst.y.toFixed(2)} m up, ${(worst.d * 100).toFixed(1)} cm past the wall's face (${PIT.edge} m)`);
}
console.log(worstAll > 0.02 ? `REPRO: yes backed to the pit edge his rear foot goes up to ${(worstAll * 100).toFixed(1)} cm into the brick wall` : 'REPRO: no');

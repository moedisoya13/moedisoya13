// 6-1: underground pit: a man knocked down near the edge falls into and through the brick wall / paint drums.
// node 6-1.mjs <pixel-boxer root>
const root = process.argv[2];
const { createBout, step } = await import(root + '/src/game/bout.mjs');
const { PIT, layout } = await import(root + '/src/world/pit.mjs');
const { NAMES } = await import(root + '/src/rig/skeleton.mjs');
const { toWorld } = await import(root + '/src/anim/pose.mjs');
const DT = 1 / 60;
const joints = f => Object.fromEntries(NAMES.map(n => [n, toWorld(f.place, f.pose.at[n], f.pose.stretch)]));
// the pit's solids as sculpted (world/pit.mjs sculptPit): walls (boxes) and drums (cylinders)
const e = PIT.edge, W = PIT.wall, solids = [];
const sidePlace = (side, out, u) => [[out, u], [-u, out], [-out, -u], [u, -out]][side];
layout().forEach((list, side) => {
  for (const p of list) {
    if (p.corner) solids.push({ kind: 'drum', c: [p.corner[0] * (e + PIT.drum.r), p.corner[1] * (e + PIT.drum.r)] });
    else if (p.kind === 'wall') {
      const [x, z] = sidePlace(side, e + W.deep / 2, (p.a + p.b) / 2), long = (p.b - p.a) / 2;
      solids.push({ kind: 'wall', c: [x, z], h: side % 2 ? [long, W.deep / 2] : [W.deep / 2, long] });
    } else solids.push({ kind: 'drum', c: sidePlace(side, e + PIT.drum.r, p.at) });
  }
});
// how deep a point is inside a solid (metres, > 0 inside), and which
function inside(p) {
  let best = { d: 0, kind: null };
  for (const s of solids) {
    let d;
    if (s.kind === 'wall') d = p[1] < W.high ? Math.min(s.h[0] - Math.abs(p[0] - s.c[0]), s.h[1] - Math.abs(p[2] - s.c[1]), W.high - p[1]) : -1;
    else d = p[1] < PIT.drum.high ? PIT.drum.r - Math.hypot(p[0] - s.c[0], p[2] - s.c[1]) : -1;
    if (d > best.d) best = { d, kind: s.kind };
  }
  return best;
}
let any = 0;
for (const [x0, z0, label] of [[-2.0, 0, 'toward the -x wall, from 0.55 m off the edge'], [-1.4, 0, 'from 1.15 m off the edge'], [-2.0, -1.3, 'toward the -x side near a drum'], [-1.75, -1.75, 'toward a corner']]) {
  const b = createBout(7, { arena: 'underground', knockdowns: true }), A = b.fighters[0], B = b.fighters[1];
  const len = Math.hypot(x0, z0), ux = x0 / len, uz = z0 / len;
  A.x = x0; A.z = z0; B.x = x0 - ux * 0.95; B.z = z0 - uz * 0.95;
  A.yaw = Math.atan2(B.x - A.x, B.z - A.z); B.yaw = Math.atan2(A.x - B.x, A.z - B.z);
  for (let i = 0; i < 30; i++) step(b, [{}, {}], DT);
  A.hp = 1; // (the next cross puts him down)
  let hit = null, worst = {}, frames = 0;
  for (let i = 0; i < 300; i++) {
    step(b, [{}, i === 2 ? { power: true } : {}], DT);
    for (const ev of b.events) if (ev.type === 'hit' && ev.on === 0) hit = ev;
    if (!A.down) continue;
    let inAny = false;
    for (const [n, p] of Object.entries(joints(A))) { const q = inside(p); if (q.d > 0) { inAny = true; if (!worst[n] || q.d > worst[n].d) worst[n] = { d: +q.d.toFixed(3), in: q.kind, out: +Math.max(Math.abs(p[0]), Math.abs(p[2])).toFixed(2), y: +p[1].toFixed(2) }; } }
    if (inAny) frames++;
  }
  const J = joints(A), head = J.Head;
  const names = Object.keys(worst);
  if (names.length) any++;
  console.log(`${label}: down by ${hit && hit.name} ${hit && hit.J} N·s; lying centre (${A.x.toFixed(2)}, ${A.z.toFixed(2)}), head at (${head[0].toFixed(2)}, ${head[1].toFixed(2)}, ${head[2].toFixed(2)}); the wall's inner face is ${e} m out, its outer face ${e + W.deep} m, its top ${W.high} m`);
  console.log(`   joints inside a wall or drum: ${names.length} (${frames} of 270 frames down): ${JSON.stringify(worst)}`);
}
console.log(any ? `REPRO: yes ${any} of 4 knockdowns near the pit edge leave the fallen man's joints inside the brick wall / drums (head lies ~3.1 m out, past the wall's outer face at ${e + W.deep} m)` : 'REPRO: no fallen body stays clear of the pit walls');

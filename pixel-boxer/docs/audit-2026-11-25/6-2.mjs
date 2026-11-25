// 6-2: the ring: a man knocked down at the ropes falls straight through the top and middle ropes (nothing holds a man who
// is down: game/bout.mjs ropes() returns for f.down), lies with his head and shoulders half a metre outside them; knocked
// into a corner, his trunk goes through the corner post.
// node 6-2.mjs <pixel-boxer root>
const root = process.argv[2];
const { createBout, step } = await import(root + '/src/game/bout.mjs');
const { RING } = await import(root + '/src/world/ring.mjs');
const { BODY, contacts, ROPE } = await import(root + '/src/world/ropes.mjs');
const { NAMES } = await import(root + '/src/rig/skeleton.mjs');
const { toWorld } = await import(root + '/src/anim/pose.mjs');
const DT = 1 / 60;
const joints = f => Object.fromEntries(NAMES.map(n => [n, toWorld(f.place, f.pose.at[n], f.pose.stretch)]));
const POST = RING.rope + 0.12; // world/ring.mjs sculptRing: the posts, radius 0.07, 1.42 high
function fall(x0, z0) {
  const b = createBout(7, { knockdowns: true }), A = b.fighters[0], B = b.fighters[1];
  const len = Math.hypot(x0, z0), ux = x0 / len, uz = z0 / len;
  A.x = x0; A.z = z0; B.x = x0 - ux * 0.95; B.z = z0 - uz * 0.95;
  A.yaw = Math.atan2(B.x - A.x, B.z - A.z); B.yaw = Math.atan2(A.x - B.x, A.z - B.z);
  for (let i = 0; i < 30; i++) step(b, [{}, {}], DT);
  A.hp = 1;
  let prev = null, crossings = [], deepest = 0, post = 0, postBall = '', postR = 0;
  for (let i = 0; i < 300; i++) {
    step(b, [{}, i === 2 ? { power: true } : {}], DT);
    if (!A.down) continue;
    const J = joints(A);
    // (the chest crossing the rope line of the side he falls toward, and at what height)
    const out = p => Math.max(Math.abs(p[0]), Math.abs(p[2]));
    for (const n of ['Head', 'Chest', 'Spine2']) if (prev && out(prev[n]) < RING.rope && out(J[n]) >= RING.rope) crossings.push(`${n} at ${J[n][1].toFixed(2)} m`);
    for (const c of contacts(A.points)) deepest = Math.max(deepest, c.d);
    const sx = Math.sign(A.x), sz = Math.sign(A.z);
    for (const [n, r] of BODY) { const p = A.points[n]; if (p[1] < 1.42) { const q = 0.07 + r - Math.hypot(p[0] - sx * POST, p[2] - sz * POST); if (q > post) (post = q), (postBall = n), (postR = r); } }
    prev = J;
  }
  const J = joints(A);
  return { A, J, crossings, deepest, post, postBall, postR };
}
const side = fall(-2.0, 0);
console.log(`at the -x ropes (from 0.55 m off them): body crosses the rope line (${RING.rope} m; ropes at ${RING.heights.join(', ')} m): ${side.crossings.join(', ')}`);
console.log(`   lying: head (${side.J.Head.map(v => v.toFixed(2))}), i.e. ${(-side.J.Head[0] - RING.rope).toFixed(2)} m outside the ropes; the deepest any rope is pressed by him while down ${(side.deepest * 100).toFixed(0)} cm (a drawn rope bends ${ROPE.drawn.most * 100} cm at most)`);
const corner = fall(-1.73, -1.73);
console.log(`into the -x,-z corner: lying centre (${corner.A.x.toFixed(2)}, ${corner.A.z.toFixed(2)}); his ${corner.postBall} ball (radius ${corner.postR}) overlaps the steel corner post (radius 0.07) by ${(corner.post * 100).toFixed(1)} cm: its centre ${((0.07 + corner.postR - corner.post) * 100).toFixed(1)} cm from the post's axis`);
const bad = side.deepest > ROPE.drawn.most && -side.J.Head[0] - RING.rope > 0.3;
console.log(bad ? `REPRO: yes a man knocked down at the ropes falls through them: chest crosses the rope line at ${side.crossings[1] || side.crossings[0]}, head lies ${(-side.J.Head[0] - RING.rope).toFixed(2)} m outside; in the corner his ${corner.postBall} goes ${(corner.post * 100).toFixed(0)} cm into the post` : 'REPRO: no');

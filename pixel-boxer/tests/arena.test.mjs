/* The fighting ground (the user, 2026-11-25): the ring's ropes give and a man can lean back on them (world/ropes.mjs, game/
   bout.mjs ropes, anim/animator.mjs), its canvas is one plain colour (world/ring.mjs, render/floor.mjs), and a second arena,
   the underground pit walled round with bricks and paint drums, a crowd packed round it reacting (world/pit.mjs), chosen
   on the game page (?arena=), the sparring page (beside the outfit, remembered) and the review sheet (?arena=). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBout, step, RULES, arenaOf } from '../src/game/bout.mjs';
import { RING } from '../src/world/ring.mjs';
import { ROPE, contacts, pressOf, bend, createRopes } from '../src/world/ropes.mjs';
import { ARENAS, PIT, CROWD, BUDGET, PER, REACT, crowdOf, createCrowd, sectorOf, floorOf } from '../src/world/pit.mjs';
import { planOf, startOf } from '../src/spar/plan.mjs';
import { floor } from '../src/render/floor.mjs';
import { unpack, fromBase64 } from '../src/render/splats.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const manifest = JSON.parse(read('assets/manifest.json'));
const rows = part => unpack(fromBase64(read('assets/' + part.file)), part);
const DT = 1 / 60;

/* A man backed into the ropes behind him (fighter 0, facing the other man along +x, walking back along -x for `walk` seconds,
   the other man following at half his pace for the first second and a half), then left standing `after` seconds: each step, where he is, how far his body
   presses the ropes behind him (the -x side), how far he is laid back on them, his head and his spine */
function backed(arena, walk, after) {
  const b = createBout(3, { arena }),
    out = [];
  for (let i = 0; i < Math.round((walk + after) / DT); i++) {
    const on = i * DT < walk;
    step(b, [{ move: on ? [-1, 0] : [0, 0] }, { move: i * DT < 1.5 ? [-0.5, 0] : [0, 0] }], DT);
    const f = b.fighters[0],
      p = f.points,
      up = [p.chest[0] - p.hips[0], p.chest[1] - p.hips[1]];
    out.push({ t: (i + 1) * DT, on, x: f.x, press: pressOf(p)[1], lean: f.rope ? f.rope.press : 0, head: p.head[0], back: (Math.atan2(-up[0], up[1]) * 180) / Math.PI, kx: f.kx });
  }
  return out;
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

test('the arenas: the ring unless the pit is named, for a bout and for a round of sparring', () => {
  assert.deepEqual(ARENAS, ['ring', 'underground']);
  assert.equal(arenaOf('underground'), 'underground');
  for (const other of [undefined, null, '', 'ring', 'pit', 'Underground']) assert.equal(arenaOf(other), 'ring', String(other));
  assert.equal(createBout(1).arena, 'ring');
  assert.equal(createBout(1, { arena: 'underground' }).arena, 'underground');
  // (a round of sparring is arranged in its arena and played back in it)
  const plan = planOf(101, { arena: 'underground', neutral: 2 });
  assert.equal(plan.arena, 'underground');
  assert.equal(startOf(plan).arena, 'underground');
  assert.equal(planOf(101, { neutral: 1 }).arena, 'ring');
});

test('the ropes give: a man backed onto them presses them, and they push him back in softly once he stops; the pit edge only stops him', () => {
  const ring = backed('ring', 3, 1.5),
    pit = backed('underground', 3, 1.5),
    pressing = ring.filter(s => s.on && s.t > 1.5),
    after = ring.filter(s => s.t > 4);
  // (on them, walking into them: they are pressed, by centimetres, and he is held a little inside where he would stop)
  assert.ok(Math.max(...pressing.map(s => s.press)) > 0.06, `pressed ${Math.max(...pressing.map(s => s.press)).toFixed(3)} m at most`);
  assert.ok(mean(pressing.map(s => s.press)) > 0.03, `pressed ${mean(pressing.map(s => s.press)).toFixed(3)} m on average`);
  assert.ok(pressing.every(s => s.x >= -RULES.half - 1e-9), 'and never past where a man must stop');
  // (let go of, they push him off them, a centimetre or more, no faster than a slow step)
  const off = Math.max(...after.map(s => s.x)) - Math.min(...pressing.map(s => s.x)),
    fastest = Math.max(...ring.slice(1).map((s, i) => (s.t > 3 ? Math.abs(s.x - ring[i].x) / DT : 0)));
  assert.ok(off > 0.01, `pushed ${(off * 100).toFixed(1)} cm off them`);
  assert.ok(fastest < 0.6, `at ${fastest.toFixed(2)} m/s at most`);
  // (the pit's edge: he stands where he stopped, at the edge, nothing pushes him)
  const still = pit.filter(s => s.t > 4);
  assert.ok(still.every(s => Math.abs(s.x + RULES.half) < 1e-6), `the pit: ${Math.max(...still.map(s => Math.abs(s.x + RULES.half))).toFixed(3)} m off the edge`);
});

test('the ropes give back a blow that carries a man into them: the knockback turned round, where the pit edge only stops it', () => {
  const run = arena => {
    const b = createBout(3, { arena });
    b.fighters[0].x = -2.45;
    step(b, [{}, {}], DT);
    step(b, [{}, {}], DT);
    b.fighters[0].kx = -2.5;
    const xs = [];
    for (let i = 0; i < 40; i++) step(b, [{}, {}], DT), xs.push([b.fighters[0].x, b.fighters[0].kx]);
    return xs;
  };
  const ring = run('ring'),
    pit = run('underground');
  assert.ok(ring.some(([, kx]) => kx > 0.3), `the ropes: the knockback turned inward (${Math.max(...ring.map(([, k]) => k)).toFixed(2)} m/s)`);
  assert.ok(ring[ring.length - 1][0] > -RULES.half + 0.08, `and he comes back off them (${ring[ring.length - 1][0].toFixed(3)})`);
  assert.ok(pit.every(([, kx]) => kx <= 0), 'the pit: no knockback turned round');
  assert.ok(Math.abs(pit[pit.length - 1][0] + RULES.half) < 0.02, `and he stays at its edge (${pit[pit.length - 1][0].toFixed(3)})`);
});

test('he leans back on the ropes: his trunk laid back and his head back over the top rope while he is pressed onto them, and up again off them', () => {
  const ring = backed('ring', 3, 1.5),
    pit = backed('underground', 3, 1.5),
    on = s => s.on && s.t > 1.8 && s.t < 3;
  assert.ok(mean(ring.filter(on).map(s => s.lean)) > 0.8, `laid back ${mean(ring.filter(on).map(s => s.lean)).toFixed(2)} of the way`);
  const back = mean(ring.filter(on).map(s => s.back)) - mean(pit.filter(on).map(s => s.back)),
    head = mean(pit.filter(on).map(s => s.head)) - mean(ring.filter(on).map(s => s.head));
  assert.ok(back > 6, `his trunk ${back.toFixed(1)} degrees further back than at the pit's edge`);
  assert.ok(head > 0.05, `his head ${(head * 100).toFixed(1)} cm further back`);
  // (the man facing him away from the ropes, in the middle, is not leaning)
  const b = createBout(3);
  for (let i = 0; i < 120; i++) step(b, [{ move: [-1, 0] }, { move: [-0.5, 0] }], DT);
  assert.equal(b.fighters[1].rope, null);
  // (let go of: off them again within a second, the lean gone with it)
  const later = ring.filter(s => s.t > 4.2);
  assert.ok(later.every(s => s.lean < 0.6), `still laid back ${Math.max(...later.map(s => s.lean)).toFixed(2)}`);
  assert.ok(mean(later.map(s => s.back)) < mean(ring.filter(on).map(s => s.back)) - 4, 'and his trunk up off them');
});

test('a rope at his side, not behind him: it pushes him back but he does not lean on it', () => {
  const b = createBout(3);
  b.fighters[0].x = 0;
  b.fighters[1].x = 1.2;
  let lean = 0,
    press = 0;
  for (let i = 0; i < 180; i++) {
    step(b, [{ move: [0, -1] }, { move: [0, -1] }], DT);
    lean = Math.max(lean, b.fighters[0].rope ? b.fighters[0].rope.press * Math.max(0, -b.fighters[0].rope.way[1]) : 0);
    press = Math.max(press, ...pressOf(b.fighters[0].points));
  }
  assert.ok(lean < 0.2, `leaned ${lean.toFixed(2)} on a rope at his side`);
});

test('a drawn rope bends out where it is pressed, only that rope, and springs back past where it lies when let go', () => {
  // (a short row of splats along each rope: the -x side's, at each height, and the +z side's top rope)
  const list = [];
  for (const h of RING.heights) for (let u = -2.5; u <= 2.5; u += 0.1) list.push([-RING.rope, h, u]);
  for (let u = -2.5; u <= 2.5; u += 0.1) list.push([u, RING.heights[2], RING.rope]);
  const data = new Float32Array(list.length * 12);
  list.forEach((p, i) => data.set([...p, 1e-4, 0, 0, 1e-4, 0, 1e-4, 13, 0, 3], i * 12));
  const ropes = createRopes(data, list.length),
    rest = data.slice(),
    // (his chest against the -x top rope, 9 cm into it, at z = 0.4)
    chest = { chest: [-(RING.rope - RING.thick - 0.13 + 0.09), RING.heights[2], 0.4] };
  assert.equal(contacts(chest).filter(c => c.d > 0).length, 1, 'only the rope at its height');
  ropes.update([chest, null], DT);
  const at = u => list.findIndex(p => p[0] === -RING.rope && p[1] === RING.heights[2] && Math.abs(p[2] - u) < 1e-6),
    out = u => rest[at(u) * 12] - data[at(u) * 12];
  assert.ok(Math.abs(out(0.4) - 0.09) < 0.01, `out ${out(0.4).toFixed(3)} m where he presses`);
  assert.ok(out(0.9) > 0.02 && out(0.9) < out(0.4), 'less further along');
  assert.ok(Math.abs(out(-1.5)) < 1e-6 && Math.abs(out(2.4)) < 1e-6, `nothing ${ROPE.drawn.wide} m or more from him`);
  for (let i = 0; i < list.length; i++) if (list[i][1] !== RING.heights[2] || list[i][0] !== -RING.rope) assert.equal(data[i * 12], rest[i * 12], 'the other ropes lie as they were');
  // (let go of: it swings back through where it lies, and settles)
  let least = Infinity;
  for (let k = 0; k < 60; k++) ropes.update([null, null], DT), (least = Math.min(least, out(0.4)));
  assert.ok(least < -0.005, `springs back past where it lies, ${(least * 100).toFixed(1)} cm`);
  for (let k = 0; k < 240; k++) ropes.update([null, null], DT);
  assert.ok(Math.abs(out(0.4)) < 1e-6, 'and lies where it was');
  assert.equal(bend(0, 0, 0), 0);
});

test('the canvas is one plain colour: the ring baked with no tiles, the catalogues\' square of it plain', () => {
  const ring = rows(manifest.ring),
    top = {};
  for (let i = 0; i < manifest.ring.count; i++) {
    const o = i * 12;
    if (Math.abs(ring[o + 1]) < 0.03 && Math.abs(ring[o]) < RING.half && Math.abs(ring[o + 2]) < RING.half) top[ring[o + 9]] = (top[ring[o + 9]] || 0) + 1;
  }
  const n = Object.values(top).reduce((a, b) => a + b, 0);
  // (the lit canvas a step below its lightest, so that a ring through it can light it a step: renderer.mjs)
  assert.ok(top[24] / n > 0.98, JSON.stringify(top));
  const square = floor(3.2, [0.6, 0]);
  for (let i = 0; i < square.count; i++) assert.equal(square.rows[i * 12 + 9], 24);
  // (and the ropes are baked apart, for the page to bend: three a side)
  assert.ok(manifest.ropes && manifest.ropes.count > 1000);
  const r = rows(manifest.ropes);
  for (let i = 0; i < manifest.ropes.count; i++) assert.ok(RING.heights.some(h => Math.abs(r[i * 12 + 1] - h) < RING.thick + 0.02), 'a splat of a rope');
});

test('the pit: inside its budget, its crowd packed all round in twelfths, a figure of a few splats on its group\'s bones', () => {
  const crowd = crowdOf();
  assert.equal(manifest.crowd.count, crowd.count, 'the baked crowd is the crowd');
  assert.ok(manifest.pit.count + manifest.crowd.count <= BUDGET, `${manifest.pit.count} + ${manifest.crowd.count} splats`);
  assert.ok(crowd.count <= CROWD.budget && crowd.figures.length >= 200, `${crowd.figures.length} figures, ${crowd.count} splats`);
  assert.equal(crowd.count, crowd.figures.length * PER);
  // (all round it, every twelfth with its share, none inside the edge)
  const per = Array(CROWD.sectors).fill(0);
  for (const f of crowd.figures) per[f.sector]++, assert.ok(Math.max(Math.abs(f.x), Math.abs(f.z)) > PIT.edge + 0.5);
  assert.ok(Math.min(...per) >= 12, per.join(' '));
  // (each splat on a bone of its group: 1 + group * 3 + part)
  for (let i = 0; i < crowd.count; i++) {
    const bone = crowd.rows[i * 12 + 10];
    assert.ok(bone >= 1 && bone <= CROWD.groups.length * 3 && bone < 24, String(bone));
  }
  // (the floor: concrete in the canvas's ramp, the fighting area lit, darker out under the crowd)
  const fl = floorOf();
  for (let i = 0; i < fl.count; i++) {
    const x = fl.rows[i * 12],
      z = fl.rows[i * 12 + 2];
    if (Math.max(Math.abs(x), Math.abs(z)) < RING.half + 0.2) assert.equal(fl.rows[i * 12 + 9], 24);
  }
  assert.equal(sectorOf(0, 5), 0);
  assert.equal(sectorOf(5, 0), CROWD.sectors / 4);
});

test('the crowd reacts: shifting while it waits, arms up and a jump at a power blow, a roar of seconds at a knockdown; the camera\'s side not drawn', () => {
  const c = createCrowd(),
    G = CROWD.groups.length,
    arms = () => {
      let up = 0,
        jump = 0;
      for (let s = 0; s < CROWD.sectors; s++)
        for (let g = 0; g < G; g++) {
          const p = c.pose(s, g);
          up += (p.L + p.R) / 2;
          jump = Math.max(jump, p.body[1]);
        }
      return { up: up / (CROWD.sectors * G), jump };
    };
  // (waiting: mostly arms down, a little bob)
  let waiting = 0;
  for (let i = 0; i < 300; i++) c.update(DT), (waiting = Math.max(waiting, arms().up));
  assert.ok(waiting < 0.3, `waiting: ${waiting.toFixed(2)} of their arms up`);
  // (a power blow: up they go within half a second)
  c.hear({ type: 'hit', J: REACT.power + 20 });
  let most = 0,
    jumped = 0;
  for (let i = 0; i < 30; i++) c.update(DT), (most = Math.max(most, arms().up)), (jumped = Math.max(jumped, arms().jump));
  assert.ok(most > 0.8 && jumped > 0.08, `a power blow: ${most.toFixed(2)} of their arms up, jumping ${jumped.toFixed(2)} m`);
  for (let i = 0; i < 120; i++) c.update(DT);
  assert.ok(arms().up < 0.35, 'and down again');
  // (a light one: hardly)
  c.hear({ type: 'hit', J: 20 });
  for (let i = 0; i < 20; i++) c.update(DT);
  assert.ok(arms().up < 0.35, 'a light blow is not cheered');
  // (a knockdown: the roar, still going two seconds on)
  c.hear({ type: 'hit', J: 90, down: true });
  for (let i = 0; i < 120; i++) c.update(DT);
  assert.ok(arms().up > 0.6, `the roar two seconds on: ${arms().up.toFixed(2)}`);
  for (let i = 0; i < 180; i++) c.update(DT);
  assert.ok(arms().up < 0.35, 'and over');
  // (its bones: a move for each group's body; each arm moved with it and mirrored up through the shoulders when raised)
  const B = c.bones(0);
  assert.equal(B[0], 1);
  for (let g = 0; g < G; g++) for (const part of [1, 2]) assert.ok(Math.abs(Math.abs(B[(1 + g * 3 + part) * 12 + 5]) - 1) < 1e-9 || Math.abs(B[(1 + g * 3 + part) * 12 + 5]) < 1, 'an arm squeezed only up and down');
  // (the camera's side: from yaw 0 the twelfths about +z are not drawn, those across the pit are)
  const seen = c.facing(0);
  assert.ok(!seen.includes(0) && seen.includes(CROWD.sectors / 2) && seen.length >= CROWD.sectors / 2, seen.join(' '));
});

test('the pages choose the arena: the game and the review sheet by ?arena=, the sparring page beside the outfit, remembered', () => {
  const main = read('src/main.mjs'),
    spar = read('src/spar.mjs'),
    html = read('spar.html'),
    review = read('src/review.mjs');
  assert.match(main, /arenaOf\(query\.get\('arena'\)\)/);
  // (the game's bout is its match's, fought where the page says: game/card.mjs matchOf -> game/match.mjs createMatch -> createBout)
  assert.match(main, /matchOf\(seed, \{ rounds: ROUNDS, roundTime: ROUND, arena: ARENA \}\)/);
  assert.match(read('src/game/card.mjs'), /createMatch\(\{ seed, .*arena: o\.arena \}\)/);
  assert.match(read('src/game/match.mjs'), /createBout\(o\.seed \|\| 1, \{ .*vary: true, arena: o\.arena \}\)/);
  assert.match(review, /arenaOf\(q\.get\('arena'\)\)/);
  assert.match(html, /<select id="wear"[^]*?<\/select>\s*<select id="arena" aria-label="경기장"><option value="ring">링<\/option><option value="underground">지하<\/option><\/select>/);
  assert.match(spar, /store\.get\('spar\.arena'\)/);
  assert.match(spar, /store\.set\('spar\.arena', name\)/);
  assert.match(spar, /planner\(seed, \{ arena: arena\.name \}\)/);
  assert.match(spar, /postMessage\(\{ id: job, seed, arena: arena\.name \}\)/);
});

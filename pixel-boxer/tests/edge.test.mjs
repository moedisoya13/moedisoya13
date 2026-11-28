/* The fighting ground's edge and what is drawn round it (the user, 2026-11-28, the fixing round after the open-questions
   catalogue v4): a man down or getting up kept inside the ropes, the posts and the pit's walls (a-fall-edge), a man in a
   corner kept off its pad and inside the ropes as they are drawn (a-corner), the pit's walls out past the rear foot of a man
   at its edge (a-pit-foot), the lean on the ropes greater and the ropes let go of springing back once (ring-lean), the knees
   on the bottom rope (ring-rope-legs), a lean in the pit too (pit-lean), the pit's walls, drums and crowd on the camera's
   side thinned (pit-near-wall, pit-crowd-pop, a-pit-hud), the crowd with faces (pit-crowd-face), its outline (a-pit-outline),
   a block's sparks blue in the pit (a-pit-spark), the hood's face (a-hood-face) and the forearms drawn in front of the
   chest (arm-way). Each was measured by its repro in docs/audit-2026-11-25/ (the numbers in the report of the round). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBout, step, RULES } from '../src/game/bout.mjs';
import { RING } from '../src/world/ring.mjs';
import { ROPE, BODY, contacts, bend, createRopes, pressOf } from '../src/world/ropes.mjs';
import { PIT, CROWD, PER, layout, crowdOf, createCrowd, sectorOf, pitPalette, crowdPalette } from '../src/world/pit.mjs';
import { PAD, push } from '../src/world/edge.mjs';
import { NEAR, cutOf } from '../src/world/stage.mjs';
import { NAMES } from '../src/rig/skeleton.mjs';
import { dress, MAT } from '../src/rig/boxer.mjs';
import { toWorld } from '../src/anim/pose.mjs';
import { paletteArray, LOOSE, ARM_PULL } from '../src/render/renderer.mjs';
import { met, BLOCK_SPARKS } from '../src/render/blow.mjs';
import { createFx } from '../src/render/fx.mjs';
import { unpack, fromBase64 } from '../src/render/splats.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const manifest = JSON.parse(read('assets/manifest.json'));
const DT = 1 / 60;
const joints = f => Object.fromEntries(NAMES.map(n => [n, toWorld(f.place, f.pose.at[n], f.pose.stretch)]));
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// (a man put down by a cross from `at`, the other man 0.95 m further in; every step after, until `steps`)
function knocked(arena, at, steps, each) {
  const b = createBout(7, { arena, knockdowns: true }),
    A = b.fighters[0],
    B = b.fighters[1],
    len = Math.hypot(at[0], at[1]);
  A.x = at[0];
  A.z = at[1];
  B.x = at[0] - (at[0] / len) * 0.95;
  B.z = at[1] - (at[1] / len) * 0.95;
  A.yaw = Math.atan2(B.x - A.x, B.z - A.z);
  B.yaw = Math.atan2(A.x - B.x, A.z - B.z);
  for (let i = 0; i < 30; i++) step(b, [{}, {}], DT);
  A.hp = 1;
  for (let i = 0; i < steps; i++) {
    const x = A.x,
      z = A.z;
    step(b, [{}, i === 2 ? { power: true } : {}], DT);
    each(A, Math.hypot(A.x - x, A.z - z));
  }
  return A;
}

test('a man knocked down at the pit\'s edge lies inside its walls and drums, slid in under his fall, never snapped', () => {
  // (the pit's walls and drums as sculpted, world/pit.mjs sculptPit: how deep a point is in one)
  const e = PIT.edge,
    W = PIT.wall,
    place = (side, out, u) => [[out, u], [-u, out], [-out, -u], [u, -out]][side],
    solids = [];
  layout().forEach((list, side) => {
    for (const p of list) {
      if (p.corner) solids.push({ drum: [p.corner[0] * (e + PIT.drum.r), p.corner[1] * (e + PIT.drum.r)] });
      else if (p.kind === 'wall') {
        const [x, z] = place(side, e + W.deep / 2, (p.a + p.b) / 2),
          long = (p.b - p.a) / 2;
        solids.push({ wall: [x, z], h: side % 2 ? [long, W.deep / 2] : [W.deep / 2, long] });
      } else solids.push({ drum: place(side, e + PIT.drum.r, p.at) });
    }
  });
  const inside = p =>
    Math.max(
      0,
      ...solids.map(s =>
        s.wall ? (p[1] < W.high ? Math.min(s.h[0] - Math.abs(p[0] - s.wall[0]), s.h[1] - Math.abs(p[2] - s.wall[1]), W.high - p[1]) : 0) : p[1] < PIT.drum.high ? PIT.drum.r - Math.hypot(p[0] - s.drum[0], p[2] - s.drum[1]) : 0
      )
    );
  for (const at of [[-2.0, 0], [-1.4, 0], [-2.0, -1.3], [-1.75, -1.75]]) {
    let deepest = 0,
      down = 0,
      jump = 0;
    knocked('underground', at, 300, (A, moved) => {
      if (!A.down) return;
      down++;
      jump = Math.max(jump, moved);
      for (const p of Object.values(joints(A))) deepest = Math.max(deepest, inside(p));
    });
    assert.ok(down > 200, `${at}: down ${down} steps`);
    assert.equal(deepest, 0, `${at}: a joint ${(deepest * 100).toFixed(1)} cm into a wall or drum`);
    assert.ok(jump < 0.1, `${at}: moved ${(jump * 100).toFixed(1)} cm in a step`);
  }
});

test('a man knocked down at the ropes lies inside them and off the corner post', () => {
  const POST = RING.rope + 0.12;
  for (const at of [[-2.0, 0], [-1.73, -1.73]]) {
    let pressed = 0,
      post = 0,
      out = -Infinity;
    knocked('ring', at, 300, A => {
      if (!A.down) return;
      for (const c of contacts(A.points)) pressed = Math.max(pressed, c.d);
      for (const [n, r] of BODY) {
        const p = A.points[n];
        post = Math.max(post, 0.07 + r - Math.hypot(p[0] - Math.sign(A.x) * POST, p[2] - Math.sign(A.z) * POST));
      }
      for (const p of Object.values(joints(A))) out = Math.max(out, Math.max(Math.abs(p[0]), Math.abs(p[2])) - (RING.rope - RING.thick));
    });
    assert.ok(pressed <= 0.01, `${at}: a rope pressed ${(pressed * 100).toFixed(1)} cm by him down`);
    assert.ok(post <= 0, `${at}: ${(post * 100).toFixed(1)} cm into the post`);
    // (each joint's middle at least the thickness of what is round it inside: 6 cm for the thinnest, a forearm)
    assert.ok(out < -0.05, `${at}: a joint ${(out * 100).toFixed(1)} cm past the ropes`);
  }
});

test('in a corner his body is off the pad and inside the ropes as they are drawn; along a side he presses them as before', () => {
  const run = (setup, ctl) => {
    const b = createBout(7);
    setup(b);
    let inPad = 0,
      through = 0,
      frames = 0;
    for (let i = 0; i < 240; i++) {
      step(b, ctl(i), DT);
      if (i < 90) continue;
      frames++;
      const f = b.fighters[0],
        sx = Math.sign(f.x),
        sz = Math.sign(f.z);
      if (BODY.some(([n]) => {
        const p = f.points[n];
        return Math.abs(p[0] - sx * PAD.out) < PAD.half && Math.abs(p[2] - sz * PAD.out) < PAD.half && Math.abs(p[1] - PAD.y) < PAD.high;
      }))
        inPad++;
      for (const c of contacts(f.points)) if (c.d > 0) through = Math.max(through, c.d - bend(c.u, c.u, Math.min(ROPE.drawn.most, c.d)));
    }
    return { inPad, through, frames };
  };
  const pinned = run(b => ((b.fighters[0].x = -1.6), (b.fighters[0].z = -1.6), (b.fighters[1].x = 0), (b.fighters[1].z = 0)), i => [{ move: i < 60 ? [-0.7, -0.7] : [0, 0] }, { move: [-0.7, -0.7] }]),
    backed = run(b => ((b.fighters[0].x = 0), (b.fighters[0].z = 0), (b.fighters[1].x = 0.6), (b.fighters[1].z = 0.6)), i => [{ move: [-0.7, -0.7] }, { move: i < 90 ? [-0.35, -0.35] : [0, 0] }]);
  for (const [name, r] of [['pinned', pinned], ['backed', backed]]) {
    assert.equal(r.inPad, 0, `${name}: a ball's middle in the pad in ${r.inPad} of ${r.frames} steps`);
    assert.ok(r.through < 0.03, `${name}: ${(r.through * 100).toFixed(1)} cm through the ropes as drawn`);
  }
  // (the pad and the ropes push a ball out of the corner straight in along its diagonal)
  const [dx, dz] = push('ring', [[[-2.5, 0.8, -2.5], 0.13]], true, ROPE.drawn.most);
  assert.ok(dx > 0 && dz > 0 && Math.abs(dx - dz) < 1e-9, `${dx} ${dz}`);
  assert.deepEqual(push('ring', [[[0, 1, 0], 0.13]], true, ROPE.drawn.most), [0, 0]);
});

test('the pit\'s walls stand out past the rear foot of a man backed to its edge, along a side and in a corner', () => {
  assert.equal(manifest.pit.edge, PIT.edge, 'the pit is baked where its edge is');
  for (const [dx, dz] of [[-1, 0], [0, 1], [-Math.SQRT1_2, -Math.SQRT1_2]]) {
    const b = createBout(3, { arena: 'underground' });
    b.fighters[0].x = b.fighters[0].z = 0;
    b.fighters[1].x = -dx * 1.2;
    b.fighters[1].z = -dz * 1.2;
    b.fighters[0].yaw = Math.atan2(-dx, -dz);
    b.fighters[1].yaw = Math.atan2(dx, dz);
    let worst = -1;
    for (let i = 0; i < 240; i++) {
      step(b, [{ move: [dx, dz] }, { move: i < 90 ? [dx * 0.5, dz * 0.5] : [0, 0] }], DT);
      for (const p of Object.values(joints(b.fighters[0]))) if (p[1] < PIT.wall.high) worst = Math.max(worst, Math.max(Math.abs(p[0]), Math.abs(p[2])) - PIT.edge);
    }
    assert.ok(worst < 0, `${dx},${dz}: a joint ${(worst * 100).toFixed(1)} cm past the walls' face`);
    assert.ok(Math.abs(Math.max(Math.abs(b.fighters[0].x), Math.abs(b.fighters[0].z)) - RULES.half) < 1e-6, 'stopped where a man stops');
  }
  // (the crowd stands behind the drums)
  for (const f of crowdOf().figures) assert.ok(Math.max(Math.abs(f.x), Math.abs(f.z)) > PIT.edge + 2 * PIT.drum.r, `${f.x}, ${f.z}`);
});

/* A man walked back into the edge behind him 3 s, then let stand: his spine's lean back from upright, the ropes pressed */
function backed(arena) {
  const b = createBout(3, { arena }),
    ropes = createRopes([], 0),
    out = [];
  for (let i = 0; i < Math.round(4.5 / DT); i++) {
    const t = (i + 1) * DT;
    step(b, [{ move: t <= 3 ? [-1, 0] : [0, 0] }, { move: t < 1.5 ? [-0.5, 0] : [0, 0] }], DT);
    ropes.update(b.fighters.map(m => m.points), DT);
    const p = b.fighters[0].points,
      up = [p.chest[0] - p.hips[0], p.chest[1] - p.hips[1]];
    out.push({ t, back: (Math.atan2(-up[0], up[1]) * 180) / Math.PI, drawn: [3, 4, 5].map(k => ropes.state[k].d), rope: b.fighters[0].rope, x: b.fighters[0].x });
  }
  return out;
}

test('he leans back on the ropes about twice as far as before, his knees press the bottom rope, and in the pit he leans too', () => {
  const ring = backed('ring'),
    pit = backed('underground'),
    held = s => s.t > 1.8 && s.t < 3,
    guard = s => s.t < 0.5,
    laid = run => mean(run.filter(held).map(s => s.back)) - mean(run.filter(guard).map(s => s.back));
  // (16 asked, before: 6.6 from his guard; 34 asked: about 13)
  assert.equal(ROPE.lean.most, 34);
  assert.ok(laid(ring) > 11, `on the ropes: laid back ${laid(ring).toFixed(1)} degrees from his guard`);
  // (the bottom rope bent out by his knees, as the others are by his trunk)
  assert.ok(Math.max(...ring.map(s => s.drawn[0])) > 0.03, `the bottom rope out ${(Math.max(...ring.map(s => s.drawn[0])) * 100).toFixed(1)} cm`);
  const knees = { kneeL: [-(RING.rope - RING.thick - 0.08 + 0.05), RING.heights[0], 0], kneeR: null };
  assert.ok(Math.abs(contacts(knees)[3].d - 0.05) < 1e-9, 'a knee 5 cm into the bottom rope presses it 5 cm');
  assert.equal(pressOf(knees)[1], 0, 'and does not push him: his trunk and head do, as before');
  // (the pit: he leans back toward its walls, less than onto the ropes, and nothing pushes him off)
  assert.ok(pit.filter(held).every(s => s.rope && s.rope.press > 0.3), 'leaning in the pit');
  assert.ok(laid(pit) > 4 && laid(pit) < laid(ring) - 6, `in the pit: ${laid(pit).toFixed(1)} degrees`);
  assert.ok(pit.filter(s => s.t > 3.5).every(s => Math.abs(s.x + RULES.half) < 1e-6), 'stays at the edge');
});

test('a rope let go of springs back past where it lies once, about a third of how far it was pressed, and is still within a second', () => {
  const ropes = createRopes([], 0),
    chest = { chest: [-(RING.rope - RING.thick - 0.13 + 0.09), RING.heights[2], 0.4] };
  for (let i = 0; i < 30; i++) ropes.update([chest, null], DT);
  const s = ropes.state[5],
    d = [];
  for (let i = 0; i < 120; i++) ropes.update([null, null], DT), d.push(s.d);
  const least = Math.min(...d),
    after = Math.max(...d.slice(d.indexOf(least))),
    still = d.findIndex((v, i) => d.slice(i).every(q => Math.abs(q) < 0.002));
  assert.ok(-least > 0.15 * 0.09 && -least < 0.45 * 0.09, `back past ${(-least * 100).toFixed(1)} cm of 9`);
  assert.ok(after < 0.015, `out again ${(after * 100).toFixed(1)} cm`);
  assert.ok(still >= 0 && still * DT < 1, `still after ${(still * DT).toFixed(2)} s`);
});

test('the pit\'s walls, drums and crowd on the camera\'s side are thinned, a twelfth left out only once all of it is hidden', () => {
  const figures = crowdOf().figures,
    crowd = createCrowd(),
    angle = (x, z, yaw) => (Math.acos(Math.max(-1, Math.min(1, (x * Math.sin(yaw) + z * Math.cos(yaw)) / Math.hypot(x, z)))) * 180) / Math.PI;
  for (let yaw = -Math.PI; yaw < Math.PI; yaw += 0.05) {
    const drawn = new Set(crowd.facing(yaw, NEAR.wide));
    for (const f of figures) if (!drawn.has(f.sector)) assert.ok(angle(f.x, f.z, yaw) < NEAR.crowd[0] + 1e-9, `yaw ${yaw.toFixed(2)}: a figure ${angle(f.x, f.z, yaw).toFixed(1)}° round left out while it would show`);
    // (and a twelfth across the pit is drawn)
    assert.ok(drawn.has(sectorOf(-Math.sin(yaw), -Math.cos(yaw))));
  }
  // (the layer's cut: the camera's way out, and the cosines of the bands)
  const c = cutOf(0.3, NEAR.edge, 0.012);
  assert.ok(Math.abs(c[0] - Math.sin(0.3)) < 1e-12 && Math.abs(c[1] - Math.cos(0.3)) < 1e-12 && c[2] > c[3] && c[4] === 0.012);
  // (none of the crowd on the camera's half of the pit is drawn, where they stood beside the lens: docs/audit-2026-11-25/5-1)
  assert.ok(NEAR.crowd[0] > 90 && NEAR.crowd[1] > NEAR.crowd[0] && NEAR.edge[1] > NEAR.edge[0]);
});

test('the crowd has faces: a dark line of eyes and a mouth on the front of each head', () => {
  const { rows, count, figures } = crowdOf();
  assert.equal(PER, 19);
  assert.equal(manifest.crowd.count, count, 'the baked crowd is the crowd');
  assert.equal(count, figures.length * PER);
  // (a figure's eyes: its 12th splat, of the hair's darkest; the mouth the skin's darkest; both further forward than the head,
  // its 10th)
  for (let f = 0; f < figures.length; f += 37) {
    const o = k => (f * PER + k) * 12,
      ahead = k => {
        const g = figures[f],
          way = [-g.x, -g.z],
          l = Math.hypot(way[0], way[1]);
        return ((rows[o(k)] - g.x) * way[0] + (rows[o(k) + 2] - g.z) * way[1]) / l;
      };
    assert.equal(rows[o(11) + 9], MAT.hair.r[0]);
    assert.ok([MAT.skin.r[0], MAT.trim.r[0]].includes(rows[o(12) + 9]));
    assert.ok(ahead(11) > ahead(9) + 0.06 && ahead(12) > ahead(9) + 0.06, `${ahead(11)} ${ahead(12)} ${ahead(9)}`);
  }
});

test('the crowd is inked round a man like the rest of the arena, and thinned under the lettering; a block\'s sparks stay blue in the pit', () => {
  const src = read('src/render/renderer.mjs');
  // (a speck of light only in a layer with no bones: the crowd's splats name their bones there)
  assert.match(src, /v_light = u_mask < 0\.9 && u_loose > 0\.5 && a_misc\.y > 0\.5/);
  assert.match(src, /gl\.uniform1f\(splat\.u\.u_loose, layer\.bones \? 0 : 1\)/);
  const stage = read('src/world/stage.mjs');
  assert.match(stage, /bones: crowd\.bones\(s, bones\[s\]\), cut, top \}/);
  assert.ok(NEAR.top[0] >= 50, 'none of it under the names, the round and the impulse');
  // (the sparks' blue: its own entries, the same in the ring's palette and the pit floor's, and the canvas's blue)
  const ring = paletteArray(dress(manifest.palette, 0)),
    pit = paletteArray(pitPalette(dress(manifest.palette, 0))),
    crowd = paletteArray(crowdPalette(manifest.palette)),
    rgb = (a, i) => [...a.slice(i * 3, i * 3 + 3)];
  let seed = 7;
  const fx = createFx(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  met(fx, { type: 'block', at: [0, 1.4, 0], dir: [0, 0, 1] });
  const used = new Set();
  for (let k = 0; k < 24; k++) {
    const live = fx.update(DT, [], 22);
    for (let i = 0; i < live; i++) used.add(Math.round(fx.rows[i * 12 + 9]));
  }
  assert.deepEqual([...used].sort(), [...new Set(BLOCK_SPARKS)].sort());
  for (const i of used) {
    assert.deepEqual(rgb(pit, i), rgb(ring, i), `entry ${i}`);
    assert.deepEqual(rgb(crowd, i), rgb(ring, i), `entry ${i}`);
  }
  assert.deepEqual(rgb(ring, LOOSE.at), rgb(ring, 24));
  assert.deepEqual(rgb(ring, LOOSE.at + 1), rgb(ring, 25));
  assert.throws(() => paletteArray(new Array(LOOSE.at + 1).fill(0)));
});

test('the hood up shows his face from the side, as the game\'s camera mostly sees him; his forearms are drawn in front of his chest', () => {
  const part = manifest.wear['training-up'],
    rows = unpack(fromBase64(read('assets/' + part.file)), part),
    head = NAMES.indexOf('Head') + 1;
  for (const side of [1, -1]) {
    const best = new Map();
    for (let i = 0; i < rows.length / 12; i++) {
      const o = i * 12;
      if (Math.round(rows[o + 10]) !== head) continue;
      const r = Math.sqrt(Math.max(rows[o + 3], rows[o + 6], rows[o + 8])),
        skin = rows[o + 9] >= 1 && rows[o + 9] <= 4;
      for (let dy = -r; dy <= r; dy += 0.01)
        for (let dz = -r; dz <= r; dz += 0.01) {
          if (dy * dy + dz * dz > r * r) continue;
          const k = Math.round((rows[o + 1] + dy) * 100) + ',' + Math.round((rows[o + 2] + dz) * 100),
            out = side * rows[o] + Math.sqrt(Math.max(0, r * r - dy * dy - dz * dz));
          if (!best.has(k) || out > best.get(k).out) best.set(k, { out, skin });
        }
    }
    const cells = [...best.values()],
      share = cells.filter(c => c.skin).length / cells.length;
    // (before 2026-11-28: a tenth of it, his face's edge within the hood's; now about a fifth)
    assert.ok(share > 0.16, `from his ${side > 0 ? 'left' : 'right'}: ${(share * 100).toFixed(1)}% of his head is skin`);
  }
  // (the forearms and gloves, bones 11 to 14, taken as ARM_PULL nearer the eye for the depth test alone)
  assert.equal(ARM_PULL, 0.04);
  assert.deepEqual([11, 12, 13, 14].map(b => NAMES[b - 1]), ['LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand']);
  assert.match(read('src/render/renderer.mjs'), /if \(u_mask > 0\.9 && a_misc\.y > 10\.5 && a_misc\.y < 14\.5\) pull = \$\{ARM_PULL\.toFixed\(3\)\};/);
});

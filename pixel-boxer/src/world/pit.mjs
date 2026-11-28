/* The second arena, 지하 격투장 (the user, 2026-11-25: "지하 격투장, 벽돌이나 페인트 통들로 주변을 둘러 쌓고 관중들이 잔뜩
   에워싸고 호응하며 서있습니다"): an underground pit with no posts and no ropes. The fighting area is the ring's (a man stands
   at most RING.half from the centre: game/bout.mjs, which in the pit stops him as the ropes did before they gave, with no
   lean); its edge, `edge` metres out, is a ring of low brick walls and paint drums; a lamp hangs over the middle and the rest
   is dim; and a crowd stands packed all round behind the edge, reacting to the fight (createCrowd).
     ARENAS, ARENA_SAID            the arenas there are ('ring' first: the catalogues' and every page's unless one is asked
                                   for), and what the pages call them
     PIT, CROWD                    the pit's numbers, the crowd's
     sculptPit(S)                  the edge, the drums and the lamp, sculpted (tools/bake.mjs; the floor is made apart: floorOf)
     brickOf(x, y, z)              -> true where the brick wall's mortar is, for marking it after the bake
     floorOf()                     -> { rows, count }: the floor, concrete, a splat every 10 cm in the fighting area and every
                                   16 cm out under the crowd, lighter under the lamp (MAT.canvas's ramp, drawn as concrete)
     crowdOf()                     -> { rows, count, figures }: the crowd, a figure a handful of splats on three bones of its
                                   group (CROWD.groups): its body, its left arm and its right arm
     sectorOf(x, z)                which of CROWD.sectors (twelfths round the pit) a place lies in
     pitPalette(p), crowdPalette(p)  the colours they are drawn in: the palette with ramps put in place of others (as the suit
                                   is: rig/boxer.mjs dress), so they take no slot of it
     createCrowd()                 their reactions: hear(e) for each event of the bout, update(dt), bones(sector, out) the
                                   bone rows (renderer.mjs u_bones) for one twelfth of them; facing(yaw) which twelfths a camera
                                   at that yaw sees past (the twelfths between it and the fight are not drawn)
   The crowd is cheap: no solver, no figure of its own moving; each group's three bones are a move and, for an arm, a mirror
   about the group's shoulders (the arm hanging, the arm raised straight up, or anything between, squeezed through the
   shoulder), the same for every figure of that group in an twelfth. Waiting they shift their weight and bob, a few at a time
   an arm up; at a power blow they jump and throw both arms up, a group at a time; at a knockdown they roar, jumping and
   pumping their fists for seconds, all of them. */
import { MAT } from '../rig/boxer.mjs';
import { RING } from './ring.mjs';

export const ARENAS = ['ring', 'underground'];
export const ARENA_SAID = { ring: '링', underground: '지하 격투장' };
// (a page's ?arena=, a bout's o.arena: one of ARENAS, or the ring)
export const arenaOf = name => (ARENAS.includes(name) ? name : 'ring');

export const PIT = {
  // the inner face of the walls and the drums: a man stopped at RING.half has his back to them, and the rear foot of his stance
  // short of them (2.76 before 2026-11-28, card a-pit-foot: the foot went 6.5 cm into the bricks, 10.4 cm in a corner)
  edge: 2.9,
  wall: { high: 0.46, deep: 0.24, course: 0.077, brick: 0.235 },
  drum: { r: 0.29, high: 0.88 },
  lamp: [0, 4.3, 0],
  floor: { half: 5.8, inner: 3.1, fine: 0.1, coarse: 0.16 },
  hall: [0x1a1513, 0x120f0e, 0x0c0a0a, 0x070606]
};
/* The crowd: rows of figures standing on the floor round the edge, the first `first` metres out, each next row `row`
   further, `gap` metres apart along it (jittered); each figure in one of the groups (its height, so that its arms mirror
   about its own shoulders: they all stand on the floor for it), sectors twelfths round the pit, each drawn as its own layer;
   `budget` splats at most. */
export const CROWD = {
  first: 3.56, // (3.42 before the edge went out to 2.9: behind the drums, 0.58 m deep)
  rows: 4,
  row: 0.5,
  gap: 0.47,
  sectors: 12,
  groups: [1.62, 1.7, 1.78, 1.66, 1.74, 1.82, 1.68],
  budget: 6000
};
export const BUDGET = 30000; // splats for the whole arena: the floor, the edge and the crowd (the ring's, with its ropes: about 24,000)

// a little dice of its own, so that the pit is the same every bake
function dice(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* What stands along each side between the corners, the same pieces each side, every other side the other way along it,
   and a drum in each corner. -> per side [{ kind: 'wall', a, b } | { kind: 'drum', at, mat }], a and b a wall's ends and
   `at` a drum's middle along the side (and the corners' drums as a fifth list, each { kind: 'drum', corner: [sx, sz], mat }) */
const DRUMS = ['red', 'blue', 'trim', 'steel', 'red', 'blue', 'trim'];
export function layout() {
  const e = PIT.edge,
    D = PIT.drum.r * 2,
    out = [],
    pieces = [['wall', 1.0], ['drum'], ['drum'], ['wall', 1.25], ['drum'], ['wall', 0.95]];
  let k = 0;
  for (let side = 0; side < 4; side++) {
    let u = 0;
    const list = [];
    for (const [kind, long] of side % 2 ? [...pieces].reverse() : pieces) {
      if (kind === 'drum') list.push({ kind, at: u + PIT.drum.r, mat: DRUMS[k++ % DRUMS.length] }), (u += D + 0.03);
      else list.push({ kind, a: u, b: u + long }), (u += long + 0.03);
    }
    // (stretched to reach from corner to corner: -e to e)
    const s = (2 * e) / (u - 0.03),
      at = v => -e + v * s;
    for (const p of list) p.kind === 'drum' ? (p.at = at(p.at)) : ((p.a = at(p.a)), (p.b = at(p.b)));
    out.push(list);
  }
  out.push([[1, 1], [-1, 1], [-1, -1], [1, -1]].map(corner => ({ kind: 'drum', corner, mat: DRUMS[k++ % DRUMS.length] })));
  return out;
}
// a place along side `side` (0: +x, 1: +z, 2: -x, 3: -z), `out` metres from the centre, `u` along it -> [x, z]
const sidePlace = (side, out, u) => [[out, u], [-u, out], [-out, -u], [u, -out]][side];

// (a drum's radius up it, 0..1: two ribs round it, the rim at the top)
const drumR = t => PIT.drum.r * (1 + 0.035 * (Math.exp(-(((t - 0.33) / 0.03) ** 2)) + Math.exp(-(((t - 0.67) / 0.03) ** 2))) - 0.03 * Math.max(0, (t - 0.96) / 0.04));
export function sculptPit(S) {
  const W = PIT.wall,
    e = PIT.edge;
  layout().forEach((list, side) => {
    for (const p of list) {
      if (p.corner) {
        const c = e + PIT.drum.r;
        S.lathe([p.corner[0] * c, 0, p.corner[1] * c], PIT.drum.high, drumR, MAT[p.mat], { res: 0.075 });
      } else if (p.kind === 'wall') {
        const mid = (p.a + p.b) / 2,
          [x, z] = sidePlace(side, e + W.deep / 2, mid),
          long = (p.b - p.a) / 2,
          h = side % 2 ? [long, W.high / 2, W.deep / 2] : [W.deep / 2, W.high / 2, long];
        S.box([x, W.high / 2, z], h, MAT.apron, { res: 0.065, rd: 0.01 });
      } else {
        const [x, z] = sidePlace(side, e + PIT.drum.r, p.at);
        S.lathe([x, 0, z], PIT.drum.high, drumR, MAT[p.mat], { res: 0.075 });
      }
    }
  });
  // the lamp over the middle: its shade, and the bulb in it
  const [lx, ly, lz] = PIT.lamp;
  S.tube([[lx, ly + 0.25, lz], [lx, ly + 1.6, lz]], 0.012, 0.012, MAT.steel, { res: 0.04 });
  S.lathe([lx, ly, lz], 0.22, t => 0.07 + 0.2 * (1 - t), MAT.steel, { res: 0.04 });
  S.ball([lx, ly - 0.02, lz], 0.06, { r: [39], em: true }, { res: 0.03 });
  S.lights.push({ p: [lx, ly - 0.3, lz], r: 8.2, s: 1.15 });
}
// the mortar between the bricks of a wall: rows `course` high, bricks `brick` long, every other row half a brick along
export function brickOf(x, y, z) {
  const W = PIT.wall,
    row = Math.floor(y / W.course),
    along = Math.abs(x) > Math.abs(z) ? z : x,
    off = row % 2 ? W.brick / 2 : 0,
    fy = y - row * W.course,
    fu = (((along + off) % W.brick) + W.brick) % W.brick;
  return y > 0.01 && y < W.high - 0.012 && (fy < 0.012 || fu < 0.014);
}

/* The floor: flat at the canvas's height, no bones; lighter under the lamp, darker out under the crowd, the steps between
   dithered by place (MAT.canvas: 24 the fighting area, 23 and 22 further out). */
export function floorOf() {
  const F = PIT.floor,
    rows = [],
    bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
    put = (x, z, gap, i, j) => {
      const r = Math.max(Math.abs(x), Math.abs(z)),
        d = (bayer[(i & 3) * 4 + (j & 3)] + 0.5) / 16,
        f = (r - PIT.edge - 0.25) / 1.6 + (d - 0.5) * 0.3,
        pal = f < 0 ? 24 : f < 1 ? 23 : 22,
        s = (gap * 0.5) ** 2;
      rows.push(x, 0, z, s, 0, 0, 1e-6, 0, s, pal, 0, 3);
    };
  for (let n = Math.round((2 * F.inner) / F.fine), i = 0; i < n; i++)
    for (let j = 0; j < n; j++) put(-F.inner + (i + 0.5) * F.fine, -F.inner + (j + 0.5) * F.fine, F.fine, i, j);
  for (let n = Math.round((2 * F.half) / F.coarse), i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = -F.half + (i + 0.5) * F.coarse,
        z = -F.half + (j + 0.5) * F.coarse;
      if (Math.max(Math.abs(x), Math.abs(z)) > F.inner + F.coarse * 0.3) put(x, z, F.coarse, i, j);
    }
  return { rows: new Float32Array(rows), count: rows.length / 12 };
}

/* The colours: of the pit (its concrete in the canvas's ramp; the bricks in the apron's; the drums red, blue, yellow (the
   trim's) and grey (the steel's)), and of the crowd (shirts in the trunks', the gloves', the apron's and the steel's ramps,
   trousers in the boots' and the canvas's, a darker skin in the trim's), every one dim, as far as they are from the lamp. */
const PIT_COLOURS = {
  22: 0x1b1918, 23: 0x282523, 24: 0x37322f, 25: 0x4a4440,
  26: 0x2e1410, 27: 0x4d2318, 28: 0x6e3726,
  12: 0x5a4612, 13: 0x8a6b1c, 14: 0xb8912c,
  29: 0x25282d, 30: 0x41464e, 31: 0x6a717b,
  32: 0x4c1410, 33: 0x7a2418, 34: 0xa53c26,
  35: 0x112a46, 36: 0x1f466c, 37: 0x346a94
};
const CROWD_COLOURS = {
  8: 0x241c20, 9: 0x382b31, 10: 0x4e3d44, 11: 0x66525a,
  15: 0x16231f, 16: 0x223631, 17: 0x2f4a43, 18: 0x40645a,
  26: 0x2e2614, 27: 0x483b1e, 28: 0x66552b,
  29: 0x2a2b2e, 30: 0x45474c, 31: 0x6a6d73,
  22: 0x151a26, 23: 0x1f2738, 24: 0x2c374d, 25: 0x3c4a63,
  12: 0x3a2418, 13: 0x5a3824, 14: 0x7c5034
};
export const pitPalette = palette => palette.map((hex, i) => PIT_COLOURS[i] ?? hex);
export const crowdPalette = palette => palette.map((hex, i) => CROWD_COLOURS[i] ?? hex);

export const sectorOf = (x, z) => ((Math.floor(((Math.atan2(x, z) / (2 * Math.PI)) * CROWD.sectors + CROWD.sectors) + 0.5) % CROWD.sectors) + CROWD.sectors) % CROWD.sectors;

/* The figures: each turned to face the middle, of a group (its height), in a shirt and trousers of its own; built of
   ellipsoids, lit a step lighter on the side toward the lamp. A figure's splat: [part (0 body, 1 left arm, 2 right arm),
   [left, up, ahead] of its middle in his own terms over his height 1.7, radii, ramp, step] */
const SHIRTS = [MAT.trunks.r, MAT.glove.r, MAT.apron.r, MAT.steel.r],
  TROUSERS = [MAT.boot.r, MAT.canvas.r],
  SKINS = [MAT.skin.r, MAT.trim.r];
function figure(h, shirt, trousers, skin, hair, bulk) {
  const k = h / 1.7,
    w = bulk;
  return [
    // legs, the trousers
    ...[-1, 1].flatMap(s => [
      [0, [0.085 * s * w, 0.22, 0], [0.07 * w, 0.23, 0.075], trousers, 0],
      [0, [0.09 * s * w, 0.62, 0], [0.085 * w, 0.22, 0.09], trousers, 1]
    ]),
    // the trunk: the hips, the belly, the chest, the shoulders
    [0, [0, 0.9, 0], [0.17 * w, 0.12, 0.11], trousers, 1],
    [0, [0, 1.08, 0.005], [0.175 * w, 0.14, 0.115], shirt, 1],
    [0, [0, 1.27, 0.01], [0.19 * w, 0.13, 0.12], shirt, 2],
    [0, [0, 1.4, 0], [0.2 * w, 0.06, 0.1], shirt, 2],
    // the neck and the head, the hair over it
    [0, [0, 1.47, 0.01], [0.045, 0.05, 0.045], skin, 1],
    [0, [0, 1.58, 0.015], [0.09, 0.11, 0.095], skin, 2],
    [0, [0, 1.64, -0.01], [0.093, 0.065, 0.095], hair, 1],
    // a face (the user, 2026-11-28, card pit-crowd-face): the eyes a dark line across it, a mouth under them, a pixel or two
    // each at the distance it is watched from, on the front of the head (from behind it, the head is nearer and hides them)
    [0, [0, 1.6, 0.098], [0.056, 0.012, 0.012], hair, 0],
    [0, [0, 1.532, 0.094], [0.03, 0.009, 0.012], skin, 0],
    // each arm: the sleeve, the forearm and the hand, hanging from the shoulder (1.4)
    ...[-1, 1].flatMap(s => {
      const part = s > 0 ? 1 : 2,
        x = 0.235 * s * w;
      return [
        [part, [x, 1.24, 0], [0.058, 0.15, 0.06], shirt, 1],
        [part, [x * 1.02, 0.98, 0.02], [0.048, 0.13, 0.05], shirt, 0],
        [part, [x * 1.03, 0.8, 0.03], [0.045, 0.055, 0.045], skin, 1]
      ];
    })
  ].map(([part, at, r, ramp, step]) => ({ part, at: [at[0], at[1] * k, at[2]], r: [r[0], r[1] * k, r[2]], ramp, step }));
}
export const PER = figure(1.7, [0], [0], [0], [0], 1).length; // splats a figure
export const SHOULDER = 1.4 / 1.7; // of a figure's height: where his arms hang from, and are mirrored about

export function crowdOf() {
  const C = CROWD,
    roll = dice(2026),
    rows = [],
    figures = [];
  for (let r = 0; r < C.rows; r++) {
    const out = C.first + r * C.row,
      long = 2 * out,
      n = Math.round((4 * long) / C.gap);
    for (let i = 0; i < n; i++) {
      // round the square, a side at a time, each row half a place on from the one before
      const t = ((i + (r % 2) * 0.5 + (roll() - 0.5) * 0.5) / n) * 4,
        side = ((Math.floor(t) % 4) + 4) % 4,
        u = -out + (t - Math.floor(t)) * long,
        jitter = (roll() - 0.5) * 0.14,
        [x, z] = sidePlace(side, out + jitter, u);
      if (Math.max(Math.abs(x), Math.abs(z)) < C.first - 0.1) continue;
      const g = Math.floor(roll() * C.groups.length),
        h = C.groups[g],
        yaw = Math.atan2(-x, -z) + (roll() - 0.5) * 0.5,
        parts = figure(h, SHIRTS[Math.floor(roll() * SHIRTS.length)], TROUSERS[Math.floor(roll() * TROUSERS.length)], SKINS[roll() < 0.3 ? 1 : 0], MAT.hair.r, 0.9 + roll() * 0.25),
        c = Math.cos(yaw),
        s = Math.sin(yaw);
      figures.push({ x, z, group: g, sector: sectorOf(x, z) });
      for (const p of parts) {
        // (his own [left, up, ahead] in the world: ahead is [sin yaw, cos yaw], left [cos yaw, -sin yaw])
        const [a, b, d] = p.at,
          px = x + a * c + d * s,
          pz = z - a * s + d * c,
          py = b,
          // the covariance of an ellipsoid turned by yaw about up: R diag(r^2) R^T
          [rx, ry, rz] = p.r.map(v => v * v),
          c00 = rx * c * c + rz * s * s,
          c02 = -rx * c * s + rz * s * c,
          c22 = rx * s * s + rz * c * c,
          // (a step lighter toward the lamp: the parts of him facing the middle, and the higher)
          step = Math.max(0, Math.min(p.ramp.length - 1, p.step - (r >= 2 ? 1 : 0)));
        rows.push(px, py, pz, c00, 0, c02, ry, 0, c22, p.ramp[step], 1 + g * 3 + p.part, 3);
      }
    }
  }
  return { rows: new Float32Array(rows), count: rows.length / 12, figures };
}

/* ---- their reactions. The bout's events: a hit (e.J, e.down), and its end. A power blow (85 N·s, a clean cross, or more, or
   a counter) lifts them: each group jumps and throws its arms up a moment after the last (`delay`), for `hold` seconds; a
   knockdown is a roar, `roar` seconds of it, every group jumping again and again and pumping its fists; and their being
   worked up (`up`, 0..1, let go of at `calm` a second) makes them bob the more while they wait. */
export const REACT = { power: 60, delay: [0.04, 0.3], hold: 0.9, jump: 0.14, roar: 3.2, calm: 0.25 };
export function createCrowd() {
  const G = CROWD.groups.length,
    S = CROWD.sectors,
    roll = dice(77),
    // (each group in each twelfth: its own pace and phase, how long it takes to react)
    beat = Array.from({ length: S * G }, () => ({ f: 0.55 + roll() * 0.5, p: roll() * Math.PI * 2, d: REACT.delay[0] + roll() * (REACT.delay[1] - REACT.delay[0]), arm: roll(), side: roll() < 0.5 ? 1 : 2 })),
    me = { t: 0, up: 0, blow: -Infinity, big: 0, roar: -Infinity };
  return {
    state: me,
    hear(e) {
      if (e.type === 'hit') {
        if (e.down || e.out) (me.roar = me.t), (me.up = 1);
        else if (e.J >= REACT.power || e.counter) (me.blow = me.t), (me.big = Math.min(1, e.J / 110)), (me.up = Math.min(1, me.up + 0.35));
        else me.up = Math.min(1, me.up + 0.08);
      }
    },
    update(dt) {
      me.t += dt;
      me.up = Math.max(0, me.up - REACT.calm * dt);
    },
    /* one group of one twelfth now: its body's move [x, y, z] and each arm's raise, 0 hanging .. 1 straight up */
    pose(sector, g) {
      const b = beat[sector * G + g],
        t = me.t,
        wait = 0.012 + 0.02 * me.up,
        body = [0.018 * Math.sin(t * b.f * 1.3 + b.p), wait * Math.abs(Math.sin(t * b.f * Math.PI + b.p)), 0.018 * Math.cos(t * b.f * 0.9 + b.p * 1.7)];
      let L = 0,
        R = 0;
      // (waiting: now and then one arm up, held, and let down)
      const idle = Math.sin(t * 0.21 * (1 + b.arm) + b.p * 3);
      if (idle > 0.93 - 0.25 * me.up) b.side === 1 ? (L = 1) : (R = 1);
      // a power blow: up they go, a group after another
      const since = t - me.blow - b.d;
      if (since > 0 && since < REACT.hold) {
        const k = Math.sin((Math.PI * Math.min(1, since / 0.35)) / 2) * (since > REACT.hold - 0.2 ? (REACT.hold - since) / 0.2 : 1);
        L = Math.max(L, k);
        R = Math.max(R, k);
        if (since < 0.4) body[1] += REACT.jump * (0.6 + 0.4 * me.big) * Math.sin((Math.PI * since) / 0.4);
      }
      // a knockdown: the roar, jumping and pumping their fists
      const roar = t - me.roar - b.d * 0.5;
      if (roar > 0 && roar < REACT.roar) {
        const fade = roar > REACT.roar - 0.6 ? (REACT.roar - roar) / 0.6 : 1,
          pump = 0.8 + 0.2 * Math.sin(roar * 9 + b.p);
        L = Math.max(L, fade * pump);
        R = Math.max(R, fade * (0.8 + 0.2 * Math.sin(roar * 9 + b.p + 1.4)));
        body[1] += REACT.jump * fade * Math.abs(Math.sin(roar * (3.2 + b.f) + b.p));
      }
      return { body, L, R };
    },
    /* the bone rows for one twelfth (renderer.mjs u_bones: three vec4 a bone, a 3x3 by rows and the move in w; bone 0 still):
       a group's body moved, its arms moved with it and mirrored up through its shoulders by their raise */
    bones(sector, out) {
      out = out || new Float32Array(24 * 12);
      out.fill(0);
      out[0] = out[5] = out[10] = 1;
      for (let g = 0; g < G; g++) {
        const { body, L, R } = this.pose(sector, g),
          y0 = CROWD.groups[g] * SHOULDER;
        [1, L, R].forEach((raise, part) => {
          const o = (1 + g * 3 + part) * 12,
            sy = part ? Math.cos(Math.PI * raise) : 1; // (1 hanging; -1 mirrored up through the shoulders)
          out[o] = 1;
          out[o + 5] = sy;
          out[o + 10] = 1;
          out[o + 3] = body[0];
          out[o + 7] = body[1] + (part ? y0 * (1 - sy) : 0);
          out[o + 11] = body[2];
        });
      }
      return out;
    },
    /* which twelfths to draw for a camera at `yaw` (renderer.mjs viewOf: its eye is out along [sin yaw, cos yaw]): not those
       between it and the fight, within `wide` radians either side of the way to it */
    facing(yaw, wide) {
      // (1.3 before 2026-11-28; a twelfth within 1.45 of the camera is all of it within world/stage.mjs NEAR.crowd, not drawn)
      wide = wide ?? 1.45;
      const out = [];
      for (let s = 0; s < S; s++) {
        const a = (s / S) * Math.PI * 2,
          d = Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw));
        if (Math.abs(d) > wide) out.push(s);
      }
      return out;
    }
  };
}

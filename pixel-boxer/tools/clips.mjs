#!/usr/bin/env node
/* The recorded clips of the pending catalogue (src/clips.data.mjs): motion that is not in this checkout yet (a stage not
   merged, a checker's variant), fought in the checkout that has it and kept frame by frame, so that the page can play it
   beside the motion as it is now. Each clip is one script of one checkout (a catalogue script, or one changed as the
   manifest says: the other man stood at another distance, a press at another time), fought the way the page fights a card
   (src/pending.mjs: tick), from its start, and kept over its window: for each frame, both men's poses as the renderer wants
   them (each joint's turn, the root, the stretch, where he is on the canvas and which way he faces) and the blows of the
   frame (what the page draws the effects from), with what it was measured to show (tools/clips.mjs: MEASURES) and where it
   came from (the checkout's commit or folder, and a digest of the engine's own files).
     node tools/clips.mjs --root m=<dir> ...             what each clip of those roots would hold, printed (nothing written)
     node tools/clips.mjs --write --root m=<dir> ...      recorded and written to src/clips/ (src/clips/index.mjs: what the
                                                          page knows before it loads one; src/clips/<id>.mjs: the frames)
     node tools/clips.mjs --events <clip id> --root ...   the events of a clip's whole run, frame by frame (to choose a window),
                                                          and what it measured; or of a clip written out: --events '{"root":
                                                          "m", "script": "block-elbow@2", "window": [0, 2], "measure": "block"}'
   `now` is this checkout unless given. A clip whose root is not given is left as it is (and said so). Each root is a
   pixel-boxer folder: its own src is what is imported, as tools/events.mjs --root does.
   The frames, as written: a base64 string of little-endian int16, FIELDS numbers a man and two men a frame: each joint's turn
   as a quaternion (x, y, z, w times 32767, in skeleton order), the root and where he stands (millimetres), the stretch
   (times 10000), the turn of where he stands (a quaternion), and x, z (millimetres) and yaw (radians times 10000). */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { ROOTS, CLIPS } from '../src/clips.data.mjs';

const DT = 1 / 60;
const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const JOINTS = 22; // (rig/skeleton.mjs NAMES: the same twenty-two in every checkout this has been used on; checked as it records)
export const FIELDS = JOINTS * 4 + 3 + 1 + 4 + 3 + 3;
// what of an event the page needs: to draw what the blow throws off, to say what it was, and to count it
const KEEP = ['type', 'who', 'on', 'name', 'part', 'zone', 'J', 'damage', 'down', 'out', 'roll', 'hammer', 'counter', 'at', 'vec', 'dir', 'trunk'];
const TYPES = ['hit', 'block', 'parry', 'graze', 'whiff', 'taunt'];
const r4 = x => Math.round(x * 1e4) / 1e4;
const round = v => (typeof v === 'number' ? r4(v) : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);

// ---- a checkout's modules
async function engine(root) {
  const src = f => import(pathToFileURL(path.resolve(root, 'src', f)).href);
  const [{ step }, foot, { SCRIPTS, measure }, { NAMES, fk }, defense, body, M, { RADIUS }] = await Promise.all(['game/bout.mjs', 'footwork.mjs', 'audit.mjs', 'rig/skeleton.mjs', 'defense.mjs', 'bodyshots.mjs', 'rig/m3.mjs', 'rig/body.mjs'].map(src));
  const { MOVES } = await src('anim/moves.mjs');
  // (the scripts the page starts afresh each loop though the boxer throws nothing: src/pending.mjs byId)
  const fresh = new Set([...(body.LIVER_BLOCK || []), ...(defense.CROSS_BODY || []), ...(defense.BLOCK_FIRE || []), ...(defense.SHELL || [])].map(e => e.id));
  if (NAMES.length !== JOINTS) throw new Error(`${root}: ${NAMES.length} joints, not ${JOINTS}`);
  return { step, freshBout: foot.freshBout, drive: foot.drive, HOME: foot.HOME, SCRIPTS, measure, NAMES, fk, fresh, M, MOVES, defense, body, RADIUS };
}
// where a checkout came from: its commit (and whether the engine's files differ from it), or its folder; and a digest of them
function origin(root) {
  const files = [];
  const walk = d => {
    for (const n of readdirSync(d).sort()) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.mjs')) files.push(p);
    }
  };
  // (the engine and the scripts: what decides the motion, and nothing of the pages)
  for (const d of ['game', 'anim', 'phys', 'rig']) existsSync(path.join(root, 'src', d)) && walk(path.join(root, 'src', d));
  for (const f of ['footwork.mjs', 'defense.mjs', 'ladder.mjs', 'bodyshots.mjs', 'combos.mjs']) existsSync(path.join(root, 'src', f)) && files.push(path.join(root, 'src', f));
  const hash = createHash('sha256');
  for (const f of files) hash.update(path.relative(root, f) + '\n').update(readFileSync(f));
  let commit = null;
  try {
    commit = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src/game', 'src/anim', 'src/phys', 'src/rig', 'src/footwork.mjs', 'src/defense.mjs', 'src/ladder.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (dirty) commit += '+';
  } catch {
    // (not a git checkout: a copy, known by its folder)
  }
  return { commit, folder: path.basename(root) === 'pixel-boxer' ? path.basename(path.dirname(root)) : path.basename(root), digest: hash.digest('hex').slice(0, 12) };
}

/* A clip's script: the checkout's own, changed as the manifest says.
     him: metres       the other man stood that far in front of the boxer's place (centre to centre), all through
     against: [...]    the other man's presses, [seconds, button, value] (in place of the script's)
     also: [...]       presses of the other man's added to the script's
     press: [...]      the boxer's presses (in place of the script's)
     loop: seconds     a longer or shorter loop
   Or a script that is no catalogue card, built here from the checkout's own parts: script { scene, ... } (SCENES). */
function scriptOf(clip, E) {
  const base = typeof clip.script === 'object' ? SCENES[clip.script.scene](clip.script, E) : E.SCRIPTS.find(e => e.id === clip.script);
  if (!base) throw new Error(`${clip.id}: no script ${clip.script} in ${clip.root}`);
  const c = clip.change || {},
    entry = Object.assign({}, base);
  if (c.him !== undefined) entry.him = () => [E.HOME[0] + c.him, E.HOME[1]];
  if (c.against) entry.against = c.against;
  if (c.also) entry.against = [...(base.against || []), ...c.also];
  if (c.press) entry.press = c.press;
  if (c.loop) entry.loop = c.loop;
  if (E.fresh.has(base.id)) entry.fresh = true;
  return entry;
}
/* The scripts built here. aimed: a rear punch thrown at a cross-arm guard held up from early on, or put up `roll` frames after
   the punch is pressed meant as a shoulder roll, aimed at a place on him ([height, degrees round him]: bodyshots.mjs aimAt),
   from 0.85 m: the scene of tests/show.test.mjs's "cross-arm guard: its weak places" (stage N's: aimed(level, punch, { aim,
   roll })), with what his grade gives him and the cross-arm guard and the roll counter carried. */
export const SCENES = {
  aimed: ({ level, punch, aim, roll }, E) => {
    const at = 0.8,
      press = roll !== undefined ? at + roll * DT : null;
    return {
      id: `aimed-${punch}@${level}${roll !== undefined ? ' roll ' + roll : ''}`,
      level,
      loop: 1.8,
      punch: ['cross', at],
      me: () => E.HOME,
      him: () => [E.HOME[0] + 0.85, E.HOME[1]],
      against: [[at, 'power', punch]],
      press: press !== null ? [[press, 'tech', 'rollCounter']] : [],
      cover: press !== null ? t => (t > 0.2 && t < press - 0.15) || (t >= press - 1e-9 && t < 1.3) : t => t > 0.2 && t < 1.4,
      keep: aim ? E.body.aimAt(aim, punch) : undefined,
      setup: b => {
        b.fighters[0].skills = { all: level };
        b.fighters[0].techniques = ['crossArm', 'rollCounter'];
      }
    };
  }
};

/* ---- what a clip is measured to show (the line under it on the page: src/pending.mjs CLIP_SAY). Each is handed the run: the
   frames (k: the step it was, men: { f (the fighter as he stands after it), m (the checkout's audit measure of him) }), the
   events with their frames, the window's first and last frame, the checkout, the script and the clip's own `of`. */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const blowsOn = (run, on) => run.events.filter(([, e]) => ['hit', 'block', 'graze', 'whiff', 'parry'].includes(e.type) && (e.type === 'parry' ? e.who === on : e.on === on && e.who === 1 - on));
const said = ([k, e], run) => ({ type: e.type, part: e.part || null, name: e.name || null, J: e.J !== undefined ? r4(e.J) : null, frame: k, t: r4(k * DT), down: !!e.down, out: !!e.out, inWindow: k >= run.first && k <= run.last });
export const MEASURES = {
  // the blows thrown at the boxer (the other man's), as they ended: what met them, how hard, on which frame
  taken: run => ({ blows: blowsOn(run, 0).map(b => said(b, run)) }),
  // the boxer's own blows on the other man
  thrown: run => ({ blows: blowsOn(run, 1).map(b => said(b, run)) }),
  /* the grade-2 two-arm block: the blows as taken, and how far his gloves crossed as the guard came down: the lead glove past
     the rear one, across his chest as it sees them (centimetres; nothing if they never crossed) */
  block: run => {
    let most = 0,
      at = null;
    for (const fr of run.window) {
      const g = fr.men[0].g,
        d = g.Right[0] - g.Left[0];
      if (d > most) (most = d), (at = fr.k);
    }
    return { blows: blowsOn(run, 0).map(b => said(b, run)), crossed: r4(most * 100), frame: at };
  },
  /* a glove reaching for the other man's head (the beckon): how close it came, the glove's padding to his head's (centre to
     centre less the two radii, rig/body.mjs RADIUS: under 0 it is in his head), on which frame, and how far apart they stood */
  reach: run => {
    let near = Infinity,
      at = null;
    for (const fr of run.window) {
      const [a, b] = fr.men.map(x => x.f);
      for (const S of ['L', 'R']) {
        const d = dist(a.points[S], b.points.head) - run.E.RADIUS.glove - run.E.RADIUS.head;
        if (d < near) (near = d), (at = fr.k);
      }
    }
    const [a, b] = run.window[0].men.map(x => x.f);
    return { head: r4(near * 100), frame: at, gap: r4(Math.hypot(a.x - b.x, a.z - b.z)) };
  },
  // the waist in a punch: the boxer's blow, and how fast his chest turned on his pelvis while he threw it (the audit's
  // --turning "chest on pelvis": SpineTwist a second, in the punch's throw), the fastest frame of it in this script
  turning: run => {
    let fastest = 0,
      at = null;
    for (let i = 1; i < run.window.length; i++) {
      const fr = run.window[i],
        was = run.window[i - 1],
        f = fr.men[0].f;
      if (fr.held || !f.action || !run.of.move || f.action.name !== run.of.move || f.action.phase !== 'throw') continue;
      const r = Math.abs(fr.men[0].m.angles.SpineTwist - was.men[0].m.angles.SpineTwist) / DT;
      if (r > fastest) (fastest = r), (at = fr.k);
    }
    return { blows: blowsOn(run, 1).map(b => said(b, run)), chest: Math.round(fastest), frame: at };
  },
  // a knockdown: the blow, his neck's turn and his chin 0.06 s into the fall (as tests/faint.test.mjs reads them), and how
  // long after the blow his head is down on the canvas (its middle under 0.16 m)
  fall: run => {
    const hit = run.events.find(([, e]) => e.type === 'hit' && e.on === 0 && e.down);
    if (!hit) return { blows: [] };
    let neck = null,
      down = null;
    for (const fr of run.all) {
      if (fr.k <= hit[0] || fr.held) continue;
      const f = fr.men[0].f,
        m = fr.men[0].m;
      if (!neck && f.animator && f.animator.fallen && f.animator.fallen.t >= 0.06 - 1e-9) neck = { turn: r4(m.angles.NeckTwist), chin: r4(m.angles.NeckForward), frame: fr.k };
      if (down === null && m.at.head[1] < 0.16) down = fr.k;
    }
    // (on the step clock, the frames held at the blow counted as the test counts them: tick − tick)
    return { blows: [said(hit, run)], neck, head: down === null ? null : r4((down - hit[0]) * DT), frame: down };
  },
  // a show of the arms (the shrug): how far apart his gloves are at the most, and his shoulders' rise above where they stood
  spread: run => {
    let most = 0,
      at = null,
      rise = 0;
    const s0 = run.window[0].men[0].m.at;
    const sh = m => (m.at.LeftArm[1] + m.at.RightArm[1]) / 2;
    for (const fr of run.window) {
      const m = fr.men[0].m,
        d = dist(m.at.gloveLeft, m.at.gloveRight);
      if (d > most) (most = d), (at = fr.k);
      rise = Math.max(rise, sh(m) - (s0.LeftArm[1] + s0.RightArm[1]) / 2);
    }
    return { gloves: r4(most * 100), frame: at, rise: r4(rise * 100) };
  },
  /* a glove jumping (stage M's watched check, src/audit.mjs JUMP there: 3.6 m/s): each glove as his chest sees it, the change
     in its velocity in a frame, for a hand not throwing, not reaching for the other man and not putting a guard up fresh, in
     none of the three frames, standing, not in a held frame nor the three after a blow. The worst in the window, of the man
     `of.who` (the boxer unless said) */
  jump: run => {
    const REACHING = ['pawDown', 'pawUp', 'collar'];
    let worst = 0,
      at = null,
      part = null;
    const seen = [];
    const who = run.of.who || 0;
    for (const fr of run.all) {
      const f = fr.men[who].f,
        E = run.E,
        move = f.action ? E.MOVES[f.action.name] : null,
        busy = { Left: false, Right: false };
      if (move && move.punch) busy[move.hand === 'L' ? 'Left' : 'Right'] = true;
      if (move && move.punch && REACHING.includes(f.action.variant)) busy.Left = busy.Right = true;
      if (f.cover && f.coverAge <= f.k.parry) busy.Left = busy.Right = true;
      const now = { gloves: fr.men[who].g, busy, ok: !fr.held && fr.since[who] > 3 && !(move && move.floor) && !f.down };
      if (now.ok && seen.length >= 2 && seen[seen.length - 1] && seen[seen.length - 2] && fr.k >= run.first && fr.k <= run.last) {
        const [b1, b2] = [seen[seen.length - 1], seen[seen.length - 2]];
        for (const S of ['Left', 'Right']) {
          if (busy[S] || b1.busy[S] || b2.busy[S]) continue;
          const v = E.M.add(E.M.sub(now.gloves[S], E.M.scale(b1.gloves[S], 2)), b2.gloves[S]),
            j = Math.hypot(...v) / DT;
          if (j > worst) (worst = j), (at = fr.k), (part = S === 'Left' ? 'L' : 'R');
        }
      }
      seen.push(fr.held ? null : now);
    }
    return { jump: r4(worst), frame: at, glove: part, who, over: worst > 3.6 };
  },
  // a fall onto the front (stage V's legs): his thighs' angle between them and his ankles apart, lying (at `of.at` seconds)
  legs: run => {
    const fr = run.all.find(x => x.k === Math.round(run.of.at / DT)) || run.window[run.window.length - 1],
      p = fr.men[0].m.at,
      v = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      l = v(p.LeftLeg, p.LeftShin),
      r = v(p.RightLeg, p.RightShin),
      ang = (Math.acos(Math.max(-1, Math.min(1, (l[0] * r[0] + l[1] * r[1] + l[2] * r[2]) / Math.hypot(...l) / Math.hypot(...r)))) * 180) / Math.PI;
    return { blows: blowsOn(run, 0).map(b => said(b, run)), thighs: r4(ang), ankles: r4(dist(p.LeftFoot, p.RightFoot) * 100), frame: fr.k };
  },
  // the collar tie: the boxer's blow, and how far the other man's head was pulled from where it stood, before the blow lands
  pull: run => {
    const h0 = run.window[0].men[1].f.points.head,
      blows = blowsOn(run, 1),
      until = blows.length ? blows[0][0] : Infinity;
    let most = 0,
      at = null;
    for (const fr of run.window.filter(x => x.k < until)) {
      const h = fr.men[1].f.points.head,
        d = Math.hypot(h[0] - h0[0], h[1] - h0[1], h[2] - h0[2]);
      if (d > most) (most = d), (at = fr.k);
    }
    return { blows: blowsOn(run, 1).map(b => said(b, run)), head: r4(most * 100), frame: at };
  }
};
// each glove as his chest sees it: from the chest, along the chest's own axes (stage M's audit: gloves)
function chestGloves(f, E) {
  const { R, p } = E.fk(f.pose),
    glove = S => {
      const h = p[S + 'Hand'],
        d = E.M.sub(h, p[S + 'ForeArm']),
        l = Math.hypot(...d) || 1;
      return E.M.app(E.M.tr(R.Chest), E.M.sub(E.M.add(h, E.M.scale(d, 0.075 / l)), p.Chest));
    };
  return { Left: glove('Left'), Right: glove('Right') };
}
// the distance from a point to a segment
function segment(q, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    t = Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1] + (q[2] - a[2]) * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1)));
  return dist(q, [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]);
}

// ---- a man as the clip keeps him
function quat(R) {
  const t = R[0] + R[4] + R[8];
  let q;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = [(R[7] - R[5]) / s, (R[2] - R[6]) / s, (R[3] - R[1]) / s, s / 4];
  } else if (R[0] > R[4] && R[0] > R[8]) {
    const s = Math.sqrt(1 + R[0] - R[4] - R[8]) * 2;
    q = [s / 4, (R[1] + R[3]) / s, (R[2] + R[6]) / s, (R[7] - R[5]) / s];
  } else if (R[4] > R[8]) {
    const s = Math.sqrt(1 + R[4] - R[0] - R[8]) * 2;
    q = [(R[1] + R[3]) / s, s / 4, (R[5] + R[7]) / s, (R[2] - R[6]) / s];
  } else {
    const s = Math.sqrt(1 + R[8] - R[0] - R[4]) * 2;
    q = [(R[2] + R[6]) / s, (R[5] + R[7]) / s, s / 4, (R[3] - R[1]) / s];
  }
  const l = Math.hypot(...q) || 1;
  return q.map(x => x / l);
}
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const clamp16 = x => Math.max(-32767, Math.min(32767, Math.round(x)));
function pack(f, NAMES, out, k) {
  const put = x => (out[k++] = clamp16(x));
  const rot = f.pose.rot || {};
  for (const n of NAMES) for (const x of quat(rot[n] || ID)) put(x * 32767);
  for (const x of f.pose.root || [0, 0, 0]) put(x * 1000);
  put((f.pose.stretch || 1) * 10000);
  for (const x of quat(f.place.R)) put(x * 32767);
  for (const x of f.place.p) put(x * 1000);
  put(f.x * 1000);
  put(f.z * 1000);
  put(Math.atan2(Math.sin(f.yaw), Math.cos(f.yaw)) * 10000);
  return k;
}

/* One clip fought: the run from its start to the end of its window, the page's way (src/pending.mjs tick). */
export async function record(clip, root, E) {
  E = E || (await engine(root));
  const entry = scriptOf(clip, E),
    bout = E.freshBout(entry),
    [a, b] = bout.fighters,
    exchange = entry.punch !== undefined || !!entry.fresh,
    first = Math.round(clip.window[0] / DT) + 1,
    last = Math.round(clip.window[1] / DT),
    n = last - first + 1,
    data = new Int16Array(n * 2 * FIELDS),
    events = [],
    all = [],
    since = [99, 99];
  let t = 0,
    w = 0;
  for (let k = 1; k <= last; k++) {
    const over = exchange && t >= entry.loop - 1e-9,
      controls = over ? [{}, {}] : E.drive(entry, bout, t, DT);
    t += DT;
    E.step(bout, controls, DT);
    b.hp = 1000;
    if (!entry.hurt) a.hp = 1000;
    for (const e of bout.events) {
      if (['hit', 'block', 'parry'].includes(e.type)) (since[e.on] = 0), (since[e.who] = 0);
      if (!TYPES.includes(e.type)) continue;
      const x = {};
      for (const key of KEEP) if (e[key] !== undefined && e[key] !== null && e[key] !== false) x[key] = round(e[key]);
      events.push([k, x]);
    }
    // (what the measures read: copied, since the bout goes on changing the very objects)
    const men = bout.fighters.map(f => ({ g: chestGloves(f, E), f: { x: f.x, z: f.z, yaw: f.yaw, pose: f.pose, place: f.place, points: f.points && JSON.parse(JSON.stringify(f.points)), action: f.action && { name: f.action.name, variant: f.action.variant, phase: f.action.chain && f.action.chain.phase }, cover: f.cover, coverAge: f.coverAge, k: f.k, down: f.down, animator: f.animator && { fallen: f.animator.fallen && { t: f.animator.fallen.t } } }, m: E.measure(f) }));
    all.push({ k, men, held: bout.stop > 0, since: since.slice() });
    since[0]++, since[1]++;
    if (k >= first) {
      let o = w * 2 * FIELDS;
      for (const f of bout.fighters) o = pack(f, E.NAMES, data, o);
      w++;
    }
  }
  const run = { all, window: all.filter(fr => fr.k >= first), events, first, last, E, of: clip.of || {} },
    measured = clip.measure ? MEASURES[clip.measure](run) : null;
  return {
    frames: n,
    data,
    events: events.filter(([k]) => k >= first).map(([k, e]) => [k - first, e]),
    measured,
    exchange,
    loop: entry.loop,
    all: events
  };
}

const b64 = data => Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
export const encode = data => b64(data);

// ---- the command line
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2),
    roots = { now: here };
  for (let i = 0; i < args.length; i++) if (args[i] === '--root') {
    const [k, ...v] = args[++i].split('=');
    roots[k] = path.resolve(v.join('='));
  }
  const write = args.includes('--write'),
    only = args.includes('--events') ? args[args.indexOf('--events') + 1] : null,
    engines = {},
    origins = {};
  const engineOf = async key => (engines[key] = engines[key] || (await engine(roots[key])));
  if (only) {
    // (a clip of the manifest by its id, or one written out as JSON: { root, script, change, window, measure })
    const clip = only.startsWith('{') ? Object.assign({ id: 'try', root: 'now', window: [0, 2] }, JSON.parse(only)) : CLIPS.find(c => c.id === only) || { id: only, root: 'now', script: only, window: [0, 2] };
    const r = await record(clip, roots[clip.root], await engineOf(clip.root));
    for (const [k, e] of r.all) console.log(k, (k * DT).toFixed(3), e.type, e.who, e.name || '', e.part || '', e.J !== undefined ? e.J.toFixed(1) : '', e.down ? 'down' : '', e.out ? 'out' : '');
    console.log(JSON.stringify(r.measured));
    process.exit(0);
  }
  const dir = path.join(here, 'src', 'clips');
  if (write && !existsSync(dir)) mkdirSync(dir);
  const index = {};
  // (a clip whose root is not given is kept as it was written, if it was)
  let old = {};
  try {
    old = (await import(pathToFileURL(path.join(dir, 'index.mjs')).href)).CLIPS_MADE || {};
  } catch {
    // (none written yet)
  }
  let bytes = 0;
  for (const clip of CLIPS) {
    if (!roots[clip.root]) {
      if (old[clip.id]) index[clip.id] = old[clip.id];
      console.error(`${clip.id}: no --root ${clip.root}; ${old[clip.id] ? 'kept as it was' : 'NOT RECORDED'}`);
      continue;
    }
    const E = await engineOf(clip.root),
      from = (origins[clip.root] = origins[clip.root] || origin(roots[clip.root])),
      r = await record(clip, roots[clip.root], E),
      text = b64(r.data);
    index[clip.id] = { root: clip.root, script: clip.script, window: clip.window, frames: r.frames, from, measured: r.measured };
    const file = `/* Recorded by tools/clips.mjs: do not edit. ${clip.id}: ${clip.script} of ${clip.root} (${from.commit || from.folder}, engine ${from.digest}), ${clip.window[0]}-${clip.window[1]} s. */\nexport const FRAMES = ${r.frames};\nexport const MEN = '${text}';\nexport const EVENTS = ${JSON.stringify(r.events)};\n`;
    bytes += file.length;
    console.log(`${clip.id.padEnd(22)} ${clip.root.padEnd(6)} ${String(r.frames).padStart(4)} frames ${String(Math.round(file.length / 1024)).padStart(4)} KB  ${JSON.stringify(r.measured)}`);
    if (write) writeFileSync(path.join(dir, `${clip.id}.mjs`), file);
  }
  console.log(`${Object.keys(index).length} clips, ${Math.round(bytes / 1024)} KB recorded this time`);
  if (write) {
    // (clips no longer in the manifest are taken away)
    for (const f of readdirSync(dir)) if (f !== 'index.mjs' && !index[f.replace(/\.mjs$/, '')]) unlinkSync(path.join(dir, f));
    const load = Object.keys(index).map(id => `  '${id}': () => import('./${id}.mjs')`).join(',\n');
    writeFileSync(
      path.join(dir, 'index.mjs'),
      `/* Recorded by tools/clips.mjs from src/clips.data.mjs: do not edit. What the page knows of each clip before it loads its frames:\n   where it came from and what it was measured to show (tools/clips.mjs MEASURES); LOAD: its frames, as a module. */\nexport const CLIPS_MADE = {\n${Object.entries(index).map(([id, v]) => `  '${id}': ${JSON.stringify(v)}`).join(',\n')}\n};\nexport const LOAD = {\n${load}\n};\n`
    );
  }
}

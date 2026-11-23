/* Where one man stands round the other (docs/bearing-system-plan.md §1): the eight bearings of the other man's front, and how
   far apart they are. Nothing here moves anyone or changes the bout; it only reads where they are, so the tools, the tests, the
   catalogue and the review sheet all count the same way.

   The frame is the other man's facing, f.yaw: the one direction the bout turns to face his man (bout.mjs face) and the line
   both his hands are aimed down. Not his chest, which is turned 38 degrees to his right in his guard and turns again with every
   punch: that lean shows in what each bearing is worth (§5), not in where the bearings are.
     bearingOf(a, b)        degrees: where a is in b's frame, 0 straight ahead of b, + round to b's lead hand (his left), - round
                            to his rear hand, 180 behind him. It is b's own facing error (measure.mjs: face): how far round b
                            would have to turn to face a
     cellOf(deg, was)       the bearing as one of eight cells (CELLS: 0 in front, +1 +2 +3 round his lead-hand side, 4 behind him,
                            -1 -2 -3 round his rear-hand side), each 45 degrees wide; given the cell it was in, it changes only
                            once the bearing is HOLD degrees past that cell's edge, so that a bearing on an edge does not flicker
                            (cellName(k), cellSaid(k): its name, and its number as it is written)
     bandOf(d, was)         metres between their centres as one of six bands (BANDS: up close, hook, jab, the doorstep, out,
                            far), changing only RANGE metres past an edge in the same way
     positionOf(bout, who)  where that man is in the other's frame, and the other in his: { beta, cell, band, d, his: { beta,
                            cell } } (no memory: the cells as they read without the margin)
     createTracker()        both men's places step by step, with the margins: track(tr, bout) every step, -> tr.men[who]:
     track(tr, bout)          { beta, cell, band, d, cellAt, bandAt (bout time each last changed), move }; and begin(tr, bout,
     begin(tr, bout, who)     who) at the step a move of his starts: the other man's front line is frozen there, and from then
                            on tr.men[who].move holds what the move has done: turned (degrees round him from that line: the
                            cells turned are this over 45; where he goes round him, counted on round past 180, the other man
                            carried along if he is pushed), peak (the bearing furthest round, signed: the cell held), window
                            (seconds the bearing was more than a cell round: past 22.5 degrees), side (past 67.5), error (the
                            most his own facing was off the other man), from (the band and distance it started at)
     turnOf(f, other, s)    how fast he turns to face the other man this step: { turn (radians a second, + to his left), faceTo,
                            pivoting (what the bout keeps of how he follows: his grade's footwork) }, for s.dt; the same as the
                            bout's own (bout.mjs face) and changing nothing on him. The bout does not call it yet: the rules for
                            taking his line back after a move of the other man's (§4) are the next stage's
   A cell is something read off where they are, not a place: the men always stand somewhere continuous, and the cells are a
   scale laid over it. No step of a bout reads any of this. */
import { RULES } from './bout.mjs';
import { MOVES } from '../anim/moves.mjs';
import { levelOf } from '../anim/skill.mjs';
import { waveTurn } from '../anim/clean.mjs';

export const HOLD = 4; // degrees past the edge of a cell before the cell changes
export const RANGE = 0.03; // metres past the edge of a band before the band changes
export const WIDTH = 45; // degrees a cell
// the eight cells, each by its sign: name, which side of him it is, and its middle
export const CELLS = [
  { k: 0, name: '정면', en: 'In front', at: 0 },
  { k: 1, name: '앞손 사선', en: 'Lead-hand diagonal', at: 45, side: '바깥' },
  { k: 2, name: '앞손 옆', en: 'Lead-hand side', at: 90, side: '바깥' },
  { k: 3, name: '앞손 뒤', en: 'Behind the lead hand', at: 135, side: '바깥' },
  { k: 4, name: '등 뒤', en: 'Behind him', at: 180 },
  { k: -3, name: '뒷손 뒤', en: 'Behind the rear hand', at: -135, side: '안' },
  { k: -2, name: '뒷손 옆', en: 'Rear-hand side', at: -90, side: '안' },
  { k: -1, name: '뒷손 사선', en: 'Rear-hand diagonal', at: -45, side: '안' }
];
export const cellName = k => (CELLS.find(c => c.k === k) || CELLS[0]).name;
// (a cell's number as it is written: +1, −2, and 0 and 4 with no sign)
export const cellSaid = k => (k === 0 || k === 4 ? String(k) : (k > 0 ? '+' : '−') + Math.abs(k));
// the six bands, centre to centre (metres): what the engine's ranges put at each edge is in the plan's §1.4
export const BANDS = [
  { k: 0, name: '붙음', en: 'Up close', from: 0, to: 0.74 },
  { k: 1, name: '훅', en: 'Hook', from: 0.74, to: 0.9 },
  { k: 2, name: '잽', en: 'Jab', from: 0.9, to: 1.15 },
  { k: 3, name: '문턱', en: 'The doorstep', from: 1.15, to: 1.55 },
  { k: 4, name: '밖', en: 'Out', from: 1.55, to: 1.95 },
  { k: 5, name: '먼', en: 'Far', from: 1.95, to: Infinity }
];

const DEG = 180 / Math.PI;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// (degrees, -180 to 180)
const wrapDeg = d => ((((d + 180) % 360) + 360) % 360) - 180;

export const bearingOf = (a, b) => wrap(Math.atan2(a.x - b.x, a.z - b.z) - b.yaw) * DEG;

/* The cell a bearing is in: the nearest middle, an edge going to the cell further round (so that the two sides are the same:
   22.5 is +1 and -22.5 is -1), behind him 4 whichever way round. Given the cell it was in, it stays there while the bearing is
   less than HOLD degrees past that cell's edges. */
export function cellOf(deg, was) {
  const d = wrapDeg(deg),
    n = Math.round(Math.abs(d) / WIDTH),
    raw = n >= 4 ? 4 : Math.sign(d) * n || 0;
  if (was === undefined || was === null || was === raw) return raw;
  return Math.abs(wrapDeg(d - was * WIDTH)) < WIDTH / 2 + HOLD ? was : raw;
}

/* The band a distance is in (metres, centre to centre); given the band it was in, it stays there while the distance is less
   than RANGE past that band's edges. */
export function bandOf(d, was) {
  const raw = BANDS.findIndex(b => d < b.to);
  if (was === undefined || was === null || was === raw) return raw;
  const b = BANDS[was];
  return d >= b.from - RANGE && d < b.to + RANGE ? was : raw;
}

export function positionOf(bout, who) {
  const a = bout.fighters[who],
    b = bout.fighters[1 - who],
    beta = bearingOf(a, b),
    his = bearingOf(b, a),
    d = Math.hypot(a.x - b.x, a.z - b.z);
  return { beta, cell: cellOf(beta), band: bandOf(d), d, his: { beta: his, cell: cellOf(his) } };
}

// ---- both men's places, step by step
const place = () => ({ beta: 0, cell: undefined, band: undefined, d: 0, cellAt: 0, bandAt: 0, move: null });
export const createTracker = () => ({ t: null, men: [place(), place()] });

export function track(tr, bout) {
  const dt = tr.t === null ? 0 : Math.max(0, bout.t - tr.t);
  tr.t = bout.t;
  tr.men.forEach((m, who) => {
    const a = bout.fighters[who],
      b = bout.fighters[1 - who],
      beta = bearingOf(a, b),
      d = Math.hypot(a.x - b.x, a.z - b.z),
      cell = cellOf(beta, m.cell),
      band = bandOf(d, m.band);
    if (cell !== m.cell) m.cellAt = bout.t;
    if (band !== m.band) m.bandAt = bout.t;
    Object.assign(m, { beta, cell, band, d });
    const mv = m.move;
    if (!mv) return;
    // (round him from the line he faced when it started, counted on past 180; from where he is now, if he has been pushed)
    const th = Math.atan2(a.x - b.x, a.z - b.z) * DEG;
    mv.turned += wrapDeg(th - mv.th);
    mv.th = th;
    if (Math.abs(beta) > Math.abs(mv.peak)) mv.peak = beta;
    mv.error = Math.max(mv.error, Math.abs(bearingOf(b, a)));
    if (Math.abs(beta) > 22.5) mv.window += dt;
    if (Math.abs(beta) > 67.5) mv.side += dt;
    mv.t = bout.t - mv.at;
    mv.to = { d, band: bandOf(d) };
  });
  return tr;
}

/* A move of this man's starts now: the other man's front line is frozen as it is, and what the move does is counted from it.
   (Called after track() for this step, so that the cells are up to date.) */
export function begin(tr, bout, who) {
  const a = bout.fighters[who],
    b = bout.fighters[1 - who],
    d = Math.hypot(a.x - b.x, a.z - b.z),
    th = Math.atan2(a.x - b.x, a.z - b.z) * DEG,
    beta = wrapDeg(th - b.yaw * DEG);
  tr.men[who].move = { at: bout.t, t: 0, line: b.yaw, th, turned: beta, peak: beta, error: Math.abs(bearingOf(b, a)), window: 0, side: 0, from: { d, band: bandOf(d) }, to: { d, band: bandOf(d) } };
  return tr.men[who].move;
}

/* How fast he turns to face the other man this step, as the bout turns him (bout.mjs face), from what is on him now and
   without changing it: a man down, or getting up, does not turn; his grade's footwork (anim/skill.mjs stance.travel) follows
   late (face: seconds) or lets him get so far round and turns all at once (pivot: degrees); a man who has thrown his weight
   into a punch turns at 0.35 of the rate, one stunned at 0.2; going round in the wave, his facing is carried round with the
   line to him (anim/clean.mjs waveTurn). s: { dt }. */
export function turnOf(f, other, s) {
  const dt = s.dt;
  if (f.down || (f.action && MOVES[f.action.name].floor)) return { turn: 0, faceTo: f.faceTo, pivoting: f.pivoting };
  let want = Math.atan2(other.x - f.x, other.z - f.z),
    faceTo = f.faceTo,
    pivoting = f.pivoting;
  const tr = levelOf(f.skills, 'stance').stance.travel;
  if (tr.face) {
    faceTo = faceTo === undefined ? want : wrap(faceTo + wrap(want - faceTo) * (1 - Math.exp(-dt / tr.face)));
    want = faceTo;
  }
  if (tr.pivot) {
    const off = Math.abs(wrap(want - f.yaw)) * 57.3;
    if (off > tr.pivot) pivoting = true;
    else if (off < 1.5) pivoting = false;
    if (!pivoting) want = f.yaw;
  }
  const punching = !!f.action && !!MOVES[f.action.name].punch,
    rate = RULES.turnRate * (punching ? 0.35 : f.stun > 0 ? 0.2 : 1),
    round = f.wave && dt > 0 ? waveTurn(f, other, dt) : 0;
  return { turn: Math.max(-rate, Math.min(rate, round + wrap(want - f.yaw) * 14)), faceTo, pivoting };
}

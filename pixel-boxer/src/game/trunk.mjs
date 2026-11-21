/* A man's trunk as a target (docs/moves-plan-5.md §3.1): what a punch to the body lands on, and where on it.
   The trunk is so many balls on the line of his spine, from his waist (Spine1) up through his belly (Spine2) to his chest
   (Chest), a little thicker at the top; a glove meets it the way it meets a head (game/bout.mjs: meets, the first thing in its
   way this step). Where it met it is read in the trunk's own terms, which way his chest faces and how far up the spine between
   its joints (so a man bent over or turned is read the same way), as one of four places:
     liver   his right side, waist to belly: 20 to 110 degrees round to his right from the front of his chest
     solar   the pit of the stomach, belly to chest: within 25 degrees of the front
     ribs    his left side, as the liver on the other side
     body    anything else on him: the middle of the belly, the back, the top of the chest (high)
   Nothing below his hip joints is a target: a glove that meets him there is stopped, and nothing has happened.
     trunk(at)              his trunk's points this step from a joint's place on the canvas: { hips, waist, belly, chest
                            (points of his spine), left (the way to his left across his shoulders, unit) }
     balls(p)               the balls a glove can meet: [[centre, radius], ...] from the waist up
     where(p, at)           where a point on him is: { zone, k (how far up the spine: 0 the hips, 1 the waist, 2 the belly,
                            3 the chest), a (degrees round to his right from the front of his chest), high, out (metres off
                            the spine) }, or null below the hips
     aimed(p, at)           the place a point aimed at is on his trunk, or null if it is not on his trunk (his head, say)
     middle(p, zone, out)   the middle of a place on him (or a spot, [k, a]), out from its surface by so much (metres, world)
     aimFor(f, p, zone, arm)   where boxer f sends his wrist to put the glove there: in his own terms, as a punch's aim is
                            (game/bout.mjs: viewOf), for an arm thrown straight, swung or lifted
     spray(p)               the part of him a blow there throws sweat off (render/fx.mjs: spray): { at, to, r } */
import * as M from '../rig/m3.mjs';

export const TRUNK = { balls: 5, r: [0.12, 0.13], spray: 0.13 };
/* What a blow on each place does to his breath (times a plain blow's: game/bout.mjs RULES.body, and the top of the chest
   half as much again), and how much more it folds him (anim/body.mjs). */
export const ZONES = { liver: { breath: 1.6, fold: 1 }, solar: { breath: 1.3, fold: 1.3 }, ribs: { breath: 1.2, fold: 1 }, body: { breath: 1, fold: 1, high: 0.5 } };
// the middle of each place: how far up the spine, and degrees round to his right
const MIDDLE = { liver: [1.5, 65], solar: [2.5, 0], ribs: [1.5, -65], body: [1.5, 0] };
const SPINE = ['hips', 'waist', 'belly', 'chest'];
const DEG = 180 / Math.PI;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.sqrt(dot(a, a));
const unit = a => M.scale(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function trunk(at) {
  return { hips: at('Hips'), waist: at('Spine1'), belly: at('Spine2'), chest: at('Chest'), left: unit(M.sub(at('LeftShoulder'), at('RightShoulder'))) };
}
// the point of his spine so far up it (0 the hips .. 3 the chest), and how thick he is there
export function along(p, k) {
  const i = Math.max(0, Math.min(2, Math.floor(k)));
  return M.lerp(p[SPINE[i]], p[SPINE[i + 1]], k - i);
}
const radius = k => TRUNK.r[0] + ((TRUNK.r[1] - TRUNK.r[0]) * Math.max(0, Math.min(2, k - 1))) / 2;
export function balls(p) {
  const out = [];
  for (let i = 0; i < TRUNK.balls; i++) {
    const k = 1 + (2 * i) / (TRUNK.balls - 1);
    out.push([along(p, k), radius(k)]);
  }
  return out;
}
// the front of his chest and his right, square to his spine
function frame(p) {
  const up = unit(M.sub(p.chest, p.waist)),
    left = unit(M.sub(p.left, M.scale(up, dot(p.left, up))));
  return { up, front: cross(left, up), right: M.scale(left, -1) };
}
export function where(p, at) {
  // (the nearest point of the spine, on past the hips below and the chest above)
  let best = null;
  for (let i = 0; i < 3; i++) {
    const a = p[SPINE[i]],
      d = M.sub(p[SPINE[i + 1]], a),
      t = dot(M.sub(at, a), d) / (dot(d, d) || 1),
      s = i === 0 ? Math.min(1, t) : i === 2 ? Math.max(0, t) : Math.max(0, Math.min(1, t)),
      q = M.add(a, M.scale(d, s)),
      far = len(M.sub(at, q));
    if (!best || far < best.out - 1e-9) best = { k: i + s, out: far, q };
  }
  if (best.k < 0) return null;
  const f = frame(p),
    r = M.sub(at, best.q),
    a = Math.atan2(dot(r, f.right), dot(r, f.front)) * DEG,
    high = best.k > 3,
    zone = high ? 'body' : best.k >= 2 ? (Math.abs(a) <= 25 ? 'solar' : 'body') : a >= 20 && a <= 110 ? 'liver' : a <= -20 && a >= -110 ? 'ribs' : 'body';
  return { zone, k: +best.k.toFixed(3), a: +a.toFixed(1), high, out: best.out };
}
/* (a point aimed at is on his trunk if it is between his hips and the top of his chest and no further off his spine than a
   glove's width past its surface) */
export function aimed(p, at) {
  const w = where(p, at);
  return w && w.k <= 3.25 && w.out <= radius(w.k) + 0.21 ? w.zone : null;
}
export function middle(p, zone, out) {
  // (or a place given as [how far up the spine, degrees round to his right])
  const [k, a] = Array.isArray(zone) ? zone : MIDDLE[zone] || MIDDLE.body,
    f = frame(p),
    r = (a * Math.PI) / 180,
    way = M.add(M.scale(f.front, Math.cos(r)), M.scale(f.right, Math.sin(r)));
  return M.add(along(p, k), M.scale(way, radius(k) + (out || 0)));
}
/* (as a punch at the head is aimed: the glove's middle onto the place, the wrist a little short of it toward him for a straight
   arm, to the side it comes from for a swung one, under it for a lifted one) */
export function aimFor(f, p, zone, arm, hand) {
  const m = middle(p, zone),
    x = m[0] - f.x,
    z = m[2] - f.z,
    side = x * Math.cos(f.yaw) - z * Math.sin(f.yaw),
    front = x * Math.sin(f.yaw) + z * Math.cos(f.yaw);
  return arm === 'swing' ? [side + (hand === 'L' ? 1 : -1) * 0.05, m[1], front - 0.1] : arm === 'lift' ? [side, m[1] - 0.1, front - 0.07] : [side, m[1], front - 0.075];
}
export const spray = p => ({ at: p.waist.slice(), to: p.chest.slice(), r: TRUNK.spray });

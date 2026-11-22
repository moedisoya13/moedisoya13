/* A scoped override: a card of the pending catalogue (docs/pending-catalog.md §2) that shows what the same engine does with
   one or two values of the game's own tables changed (MOVES.hookBody.land, CROSS['4a'].R, ...). Nothing in the game reads a
   value of its own for it: the table's field is set to the card's value for as long as the card's own code runs (making its
   bout, a step of it, measuring it) and put back the moment it returns or throws, so the card beside it, stepped between
   two of these, runs on the defaults.
     withTune(patches, fn)       patches: [[object, key, value], ...]; fn run with them in force, its value returned
     patchesOf(tune, tables)     a card's tune as written in the data, [['MOVES', 'hookBody', 'land', 0.76], ...] (a path
                                 from a table to a field, then the value), as patches on the tables named { MOVES, CROSS, ... }
     guardAt(base, frames, gap)  the down parry card (src/defense.mjs PARRY_DOWN) with the guard put up `frames` sixtieths of
                                 a second after the jab is pressed, as the head would put it up (and the other man stood
                                 `gap` metres off, if given): the other variant a card can be, a moment of its script
     rearTilt(f)                 what the cross-arm cards are told by: his rear forearm's lean off the vertical, degrees
   A value is always replaced whole, never changed inside: CROSS's grades share some of their objects (Object.assign's
   shallow copy), and an array changed in place would change every grade holding it. */
import { HOME } from './footwork.mjs';
import { fk } from './rig/skeleton.mjs';

export function withTune(patches, fn) {
  if (!patches || !patches.length) return fn();
  const kept = patches.map(([o, k]) => [o, k, Object.prototype.hasOwnProperty.call(o, k), o[k]]);
  for (const [o, k, v] of patches) o[k] = v;
  try {
    return fn();
  } finally {
    for (const [o, k, had, v] of kept.reverse()) had ? (o[k] = v) : delete o[k];
  }
}

// the field a path names: the table, then the keys down to the object holding it (the last key is the field itself)
export function patchesOf(tune, tables) {
  return (tune || []).map(path => {
    const keys = path.slice(0, -1),
      value = path[path.length - 1];
    let o = tables[keys[0]];
    if (!o) throw new Error(`no table ${keys[0]}`);
    for (const k of keys.slice(1, -1)) {
      o = o[k];
      if (!o || typeof o !== 'object') throw new Error(`no field ${keys.join('.')}`);
    }
    if (!(keys[keys.length - 1] in o)) throw new Error(`no field ${keys.join('.')}`);
    return [o, keys[keys.length - 1], value];
  });
}

/* The down parry card with the guard put up on another frame: what the head's timing does to it, shown as the head would
   have done it (the catalogue's scripts name the technique and never go through the head's dice). The same as the base
   card in everything else: the guard meant as the down parry from that frame until 0.4 s after the press, and the counter
   once, as soon as the glove has been pressed down. */
export function guardAt(base, frames, gap) {
  const press = base.punch[1],
    at = press + frames / 60,
    up = t => t >= at - 1e-9 && t < press + 0.4;
  return Object.assign({}, base, {
    id: `${base.id}+${frames}${gap ? '@' + gap : ''}`,
    guard: frames,
    him: gap ? () => [HOME[0] + gap, HOME[1]] : base.him,
    cover: up,
    cue: (bout, t) => {
      const f = bout.fighters[0],
        own = (f.cues = f.cues || {});
      if (!own.countered && f.parried && f.parried.down && f.counter > 0) return (own.countered = true), 'power';
      return up(t) ? ['tech', 'parryDown'] : null;
    }
  });
}

/* The rear forearm off the vertical (docs/pending-catalog.md §6.6, the frame tests/show.test.mjs shape() measures in): from
   the elbow to the middle of the glove, 7.5 cm on from the hand along the forearm, in his own space. Degrees. */
export function rearTilt(f) {
  const { p } = fk(f.pose),
    e = p.RightForeArm,
    h = p.RightHand,
    d = [h[0] - e[0], h[1] - e[1], h[2] - e[2]],
    l = Math.hypot(...d) || 1,
    g = [d[0] * (1 + 0.075 / l), d[1] * (1 + 0.075 / l), d[2] * (1 + 0.075 / l)];
  return (Math.atan2(Math.hypot(g[0], g[2]), g[1]) * 180) / Math.PI;
}

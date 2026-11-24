/* What is drawn when a punch is defended (docs/pending.md "논의 중: 미니멀한 방어 이펙트"): a block, a parry, a shoulder roll, a
   punch that misses (a slip, a duck, a weave, a pull) or only grazes him, and a defence the bout finds brilliant. The pending
   catalogue's items `fx-defence-amount`, `fx-defence-evade`, `fx-parry-white` and `fx-brilliant-game` choose among the
   styles here; until they are chosen the switch (DEFENCE) is what the game draws today, which is render/blow.mjs met() and the
   screen's white at a parry, and nothing at all for the rest. Nothing of the bout is read but its events and where the men
   are; nothing here knows the renderer: it puts motes and lines into an fx (render/fx.mjs) and hands back the ripple, the
   screen's white and the slow motion for the caller to draw.
     DEFENCE      the switch: { amount, evade, parryWhite, brilliant }, each one of STYLES (the first of each is today's)
     STYLES       amount: 'now' (today's sparks: a block 4, white and blue; a parry 14, white, yellow and amber; and the
                    screen's white at a parry if parryWhite keeps it), 'keep-no-white' (the same sparks, the same dice, with
                    the white left out of their colours, and no screen white), 'lines-sparks' (a block: the punch's own line
                    stopped dead where it met him, a small ripple held to the glove, forearm or elbow that met it and 0 to 2
                    sparks thrown back off it; a parry: the bent path of the glove it knocked aside, back along the way it
                    came and on as the glove goes, a thin line over the glove's path, and 3 or 4 sparks thrown up off where
                    the gloves met; a shoulder roll: the line of the place the glove met on his shoulder as he rolls away
                    under it, a small ripple there and 3 sparks along that way; all of it by the impulse it met, none of it
                    white, no light, no screen white, and none of it seen over the man defending but the shoulder's line),
                    'lines' (the same without the sparks);
                  evade: 'none' (today), 'wind-line' (a thin line along the stretch of a punch's path that passed his head,
                    if it missed by 6 cm or less, or grazed him: the closer, the longer, the lighter and the longer it stays;
                    nothing beyond 6 cm);
                  parryWhite: 'keep' (today: the screen white 0.25 at a parry, while amount is 'now'), 'remove';
                  brilliant: 'none' (today), 'line' (the defence's line drawn again clearer: the wind line, or the parry's, a
                    step lighter, thicker, staying longer, a miss's longer too; drawn from where the punch went if no line
                    was), 'slow' (a very short slow
                    motion: 0.1 s of the bout at 0.3 of the speed, eased in and out, as a knockdown's used to be)
     LOOK         the numbers of all of it
     styleOf(x)   a style: DEFENCE with what x says over it (x: an object of some of its keys, or the text of a page's
                  ?defence=, words of STYLES joined by commas, each its item's as `item:word` or, where only one item has
                  that word, the word alone: ?defence=lines-sparks,wind-line,slow)
     whiteOf(style)   the screen's white at a parry in that style (0.25 or 0)
     sizeOf(e)    how big a defence's effect is drawn: its impulse over a jab's (LOOK.jab), to 1: never bigger than a jab's hit
     createGuard(style) -> one view's defences (a game's, a card's, a sheet's):
       g.see(men)          after every step of the bout (or every frame of a clip), the two men as the bout keeps them
                           ({ points: { L, R, head, LE, RE, LS, RS } }): what it remembers of where their gloves have been,
                           and the lines that follow a glove go on with it; call it before meet() for the step's events
       g.meet(e, men, fx, motes)   an event of that step: today's sparks go into fx (the ring's, as render/blow.mjs met
                           puts them), the lines and the new styles' sparks into motes[i] of the man defending (an fx
                           drawn only off his silhouette, as a hit's motes are: what is drawn of a defence is never seen
                           over the man defending; fx if there is none) -> { white (the screen's, to start
                           now; 0 for none), ripple: { on, ripple } (one for render/blow.mjs rippleRow, held to the part of him
                           that met it: put in that man's ripple, as a hit's is) or null, slow (true when it starts one) }.
                           The screen's shake stays the caller's, as it is today.
       g.slow              the brilliant defence's slow motion while it lasts (createSlow), else null
       g.pace(real, t)     the speed to play the picture at now (1 but in a slow motion), its slow moved on by `real`
                           seconds of real time, the bout now at time t (for a page that plays a live bout slowed; the
                           game does not yet: tests/fx.test.mjs holds its picture at the true speed. The pending
                           catalogue's cards play a recorded one slowed by warpOf)
     createSlow(t)  a brilliant defence's slow motion starting at bout time t: { pace(), on(real, t) -> the slow or null }
     warpOf(style, frames)   a clip's frames ({ events } each, 60 a second) played at true speed with the brilliant slow in
                           it: { span (real seconds), at(u) (the frame at u real seconds), pace(u) }, or null if it has none */
import * as M from '../rig/m3.mjs';
import { met } from './blow.mjs';
import { MOVES } from '../anim/moves.mjs';

export const STYLES = {
  amount: ['now', 'keep-no-white', 'lines-sparks', 'lines'],
  evade: ['none', 'wind-line'],
  parryWhite: ['keep', 'remove'],
  brilliant: ['none', 'line', 'slow']
};
export const DEFENCE = { amount: 'now', evade: 'none', parryWhite: 'keep', brilliant: 'none' };

/* jab: newton-seconds of the jab whose hit no defence is drawn bigger than (a pro's jab, the effect lab's light blow, lands
   at 37.9; render/blow.mjs draws its hit as 12 motes 1.04 cm thick and a ripple of 0.433 (1.5 cm of sway) through him for
   0.4 s): a defence of that impulse or more is drawn at the most; ripple: the jab's hit's own strength and sway, no less
   than `least` of it (any less is under a pixel), for under a third of its time, narrower, on the part that met it; sparks: how many a block throws at the most, a parry's 3 or 4 (4 from `four` of a jab's), a roll's,
   how thick (the thinnest that shows), how fast, times the sparks' own life; their colours, none of them white: a block's
   cool slate, a parry's amber going orange. line: a parry's or a roll's, the path of the glove it turned
   aside: how thick (metres, from a touch to a jab's), how far back along the way it came (metres), how many steps it follows
   the glove on (that move), how long each piece stays (seconds, from a touch to a jab's) and the slate it fades through;
   how far its middle is taken up off the glove's (edge: over the glove, where the eye sees it pass), a rolled shoulder's
   off his shoulder (lift); a block's: how far back along the way the punch came (stop, times 0.6 to 1 by the impulse) and
   how long it stays (held), drawn on the glove's own path; how many steps a shoulder's is followed (roll); and how far a
   line goes on after where it met him (out: from a touch to a jab's, metres).
   wind: within (metres: no line past it), how long a stretch of the path it draws (metres, from 6 cm off to a graze), how
   long it stays, how thick, its colours near (3 cm and less) and far, and how far up off the glove's path (over the glove
   and the arm, where it is seen as the arm goes home). clear: a brilliant defence's line (brilliant: 'line'). slow: a
   brilliant defence's slow motion (as render/blow.mjs's knockdown one was): the speed, the real seconds it eases down in,
   the bout seconds it lasts, the real seconds it eases back in. white: the screen's white at a parry (today's). */
export const LOOK = {
  jab: 38,
  ripple: { strength: 0.43, least: 0.6, sway: 0.034, last: 0.12, width: 0.05, thin: 0.03 },
  sparks: { block: 2, parry: [3, 4], four: 0.75, roll: 3, width: 0.01, speed: 3, life: 0.85, cool: [31, 31, 30], warm: [40, 40, 18] },
  line: { width: [0.005, 0.01], back: 0.2, follow: 6, life: [0.18, 0.32], colours: [31, 31, 30, 29], edge: 0.085, lift: 0.04, stop: 0.18, held: [0.25, 0.4], roll: 8, out: [0.12, 0.3] },
  wind: { within: 0.06, length: [0.12, 0.3], life: [0.22, 0.4], width: [0.005, 0.009], near: [31, 31, 30, 29], far: [30, 29, 29], edge: 0.12 },
  clear: { length: 0.36, life: 0.45, width: 0.009, colours: [13, 13, 31, 30] },
  slow: { rate: 0.3, ease: 0.04, span: 0.1, back: 0.08 },
  white: 0.25
};

const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => (len(a) > 1e-9 ? M.scale(a, 1 / len(a)) : [0, 0, 0]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = x => ((x = Math.max(0, Math.min(1, x))), x * x * (3 - 2 * x));
const mix = (r, k) => r[0] + (r[1] - r[0]) * k;
const PARTS = ['L', 'R', 'LE', 'RE', 'LS', 'RS'];
// (up, square to the way from a to b: up itself less what of it is along the way; for a way that is itself up, across it)
function upOff(a, b) {
  const d = unit(M.sub(b, a)),
    o = [-d[1] * d[0], 1 - d[1] * d[1], -d[1] * d[2]];
  return len(o) > 0.3 ? unit(o) : unit([-d[2], 0, d[0]]);
}
// (the hand that threw it: the event's, or, where it was not kept (a clip recorded before it was), his glove nearest where it met)
const handOf = (e, man) => e.hand || (man && man.points ? (len(M.sub(man.points.L, e.at)) <= len(M.sub(man.points.R, e.at)) ? 'L' : 'R') : 'L');

export function styleOf(x) {
  const out = Object.assign({}, DEFENCE);
  if (!x) return out;
  if (typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (!STYLES[k] || !STYLES[k].includes(v)) throw new Error(`defence: ${k}: ${v} is none of ${STYLES[k] ? STYLES[k].join(', ') : 'its styles'}`);
      out[k] = v;
    }
    return out;
  }
  for (const word of String(x).split(',').map(w => w.trim()).filter(Boolean)) {
    const [k, v] = word.includes(':') ? word.split(':') : [null, word],
      items = k ? [k] : Object.keys(STYLES).filter(i => STYLES[i].includes(v));
    if (items.length !== 1 || !STYLES[items[0]] || !STYLES[items[0]].includes(v)) throw new Error(`defence: ${word}: ${items.length > 1 ? `say which, ${items.map(i => i + ':' + v).join(' or ')}` : 'no such style'}`);
    out[items[0]] = v;
  }
  return out;
}
export const whiteOf = style => (style.amount === 'now' && style.parryWhite === 'keep' ? LOOK.white : 0);
export const sizeOf = e => Math.min(1, Math.max(0, (e.J || 0) / LOOK.jab));
// (today's colours with the white taken out: each white the colour that comes after it, so that they change when they did)
export const noWhite = colours => colours.map((c, i) => (c === 38 ? colours.slice(i).find(x => x !== 38) ?? 40 : c));

/* The slow motion: from full speed down to LOOK.slow.rate, eased, in its first `ease` real seconds; at that until the bout is
   `span` seconds past where it started; then back up, eased, in `back` real seconds. */
export function createSlow(t0) {
  const S = LOOK.slow;
  let u = 0,
    back = -1;
  return {
    t0,
    pace: () => (back < 0 ? 1 + (S.rate - 1) * smooth(u / S.ease) : S.rate + (1 - S.rate) * smooth((u - back) / S.back)),
    on(real, t) {
      u += real;
      if (back < 0 && t - t0 >= S.span - 1e-9) back = u;
      return back >= 0 && u - back >= S.back ? null : this;
    }
  };
}
export function warpOf(style, frames) {
  if (style.brilliant !== 'slow') return null;
  const k0 = frames.findIndex(f => f.events.some(e => e.type === 'brilliant'));
  if (k0 < 0) return null;
  // (the clip's own time against real time, worked out a little at a time: its frame k is at k / 60 of its own seconds)
  const dt = 1 / 600,
    table = [[0, 0, 1]];
  let clip = 0,
    real = 0,
    slow = null,
    done = false;
  const end = (frames.length - 1) / 60;
  while (clip < end - 1e-9) {
    if (!slow && !done && clip >= k0 / 60 - 1e-9) slow = createSlow(k0 / 60);
    const p = slow ? slow.pace() : 1;
    clip = Math.min(end, clip + dt * p);
    real += dt;
    if (slow && !(slow = slow.on(dt, clip))) done = true;
    table.push([real, clip * 60, slow ? slow.pace() : 1]);
  }
  const find = u => {
    let lo = 0,
      hi = table.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      table[m][0] <= u ? (lo = m) : (hi = m);
    }
    return table[lo];
  };
  return { span: real, at: u => find(u)[1], pace: u => find(u)[2] };
}

export function createGuard(style) {
  style = style || DEFENCE;
  const S = LOOK.sparks,
    L = LOOK.line,
    W = LOOK.wind,
    kept = [], // (the men's gloves and heads, the last steps of them: [{ L, R, head }, { ... }])
    follow = [], // (a line following a glove: { man, hand, last, left, fx, width, life, colours, sparks, path })
    wind = [null, null]; // (each man's last punch that missed: { path, pieces } for a brilliant defence's line)
  const g = {
    style,
    slow: null,
    see(men) {
      if (!men || !men[0] || !men[0].points || !men[1].points) return;
      kept.push(men.map(m => ({ L: m.points.L.slice(), R: m.points.R.slice(), head: m.points.head.slice() })));
      if (kept.length > 30) kept.shift();
      for (let i = follow.length - 1; i >= 0; i--) {
        const f = follow[i];
        if (!men[f.man].points[f.hand]) {
          follow.splice(i, 1);
          continue;
        }
        let p = M.add(men[f.man].points[f.hand], f.off),
          d = M.sub(p, f.last);
        // (a step in which it did not move is a held moment of the bout: the line waits for it)
        if (len(d) < 1e-3) continue;
        // (and it goes on only so far: as far as the impulse says, never as far as a jab's hit throws its motes)
        if (len(d) >= f.room) (p = M.add(f.last, M.scale(d, f.room / len(d)))), (d = M.sub(p, f.last)), (f.left = 1);
        f.room -= len(d);
        line(f.fx, [f.last, p], f.width, f.colours, f.life, f.pieces, false, f.edge);
        // (sparks it was asked to throw as it goes, once it has gone a few centimetres: from where it started, the way it has
        // gone, slow, none of them white)
        const went = M.sub(p, f.from || f.last);
        if (f.sparks && len(went) > 0.03) f.fx.sparks(f.from, f.sparks.n, f.sparks.colours, S.speed, [went[0] / len(went), went[2] / len(went), went[1] / len(went)], S.width, { life: S.life }), (f.sparks = null);
        f.path.push(p.slice());
        f.last = p.slice();
        if (--f.left <= 0) follow.splice(i, 1);
      }
    },
    meet(e, men, fx, motes) {
      const out = { white: 0, ripple: null, slow: false },
        A = style.amount,
        // (the man defending, and the fx of what is drawn off his silhouette, if the caller has one for each man)
        him = e.type === 'block' ? e.on : e.type === 'whiff' || e.type === 'graze' ? 1 - e.who : e.who,
        own = (motes && motes[him]) || fx;
      if (e.type === 'block' || e.type === 'parry') {
        if (A === 'now') {
          met(fx, e);
          if (e.type === 'parry') out.white = whiteOf(style);
        } else if (A === 'keep-no-white') {
          // (today's call, the same dice in the same order, the colours without their white)
          if (e.type === 'block') fx.sparks(e.at, 4, noWhite([38, 25, 24]), 2.5, e.dir);
          else fx.sparks(e.at, 14, noWhite([38, 38, 39, 40]), 5);
        } else if (e.type === 'block') block(e, men, own, A === 'lines-sparks', out, fx);
        else parry(e, men, own, A === 'lines-sparks');
      } else if ((e.type === 'whiff' || e.type === 'graze') && men && men[0].points) {
        const who = e.who,
          margin = e.type === 'graze' ? 0 : e.margin,
          hand = MOVES[e.name] && MOVES[e.name].hand;
        if (margin === null || margin === undefined || !hand) return out;
        const path = passed(who, hand, margin);
        wind[who] = path && { path, pieces: [], margin };
        if (path && style.evade === 'wind-line' && margin <= W.within + 1e-9) {
          const c = 1 - margin / W.within;
          line(own, cut(path, mix(W.length, c)), mix(W.width, c), c >= 0.5 ? W.near : W.far, mix(W.life, c), wind[who].pieces, true, W.edge);
        }
      } else if (e.type === 'brilliant') {
        if (style.brilliant === 'slow') (g.slow = createSlow(e.at ?? 0)), (out.slow = true);
        else if (style.brilliant === 'line') clear(e, own);
      }
      return out;
    },
    pace(real, t) {
      if (!g.slow) return 1;
      const p = g.slow.pace();
      g.slow = g.slow.on(real, t);
      return p;
    }
  };

  /* A thin line through the points, as pieces of a glove's streak (render/fx.mjs trail): none longer than 3 cm, so that it is
     as thick all along as at its middle; fade: the end it was drawn from goes first, the far end last. pieces: where each is
     kept, for a brilliant defence to make it clearer. edge: the points taken that far up off the path (metres, square to it:
     a glove's middle is inside the glove and, on its way in, inside the arm behind it; its top edge is where the eye sees
     it pass). */
  function line(fx, points, width, colours, life, pieces, fade, edge) {
    const bits = [];
    if (edge) points = points.map((p, i) => M.add(p, M.scale(upOff(points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]), edge)));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        n = Math.max(1, Math.ceil(len(M.sub(b, a)) / 0.03));
      for (let k = 0; k < n; k++) bits.push([M.lerp(a, b, k / n), M.lerp(a, b, (k + 1) / n)]);
    }
    bits.forEach(([a, b], i) => {
      const was = fx.items.length;
      fx.trail(a, b, width, colours, life * (fade ? 0.55 + (0.45 * (i + 1)) / bits.length : 1));
      if (pieces && fx.items.length > was) pieces.push(fx.items[fx.items.length - 1]);
    });
  }
  /* The stretch of a missed punch's path that passed his head: the glove's middle step by step over the punch (as it was
     kept), from where it came nearest his head back along the way it came and on to where it is now. -> points, the
     nearest first marked (path.near: its index) */
  function passed(who, hand, margin) {
    if (kept.length < 2) return null;
    let best = -1,
      near = Infinity;
    kept.forEach((k, i) => {
      const d = len(M.sub(k[who][hand], k[1 - who].head));
      if (d < near) (near = d), (best = i);
    });
    // (the punch's own steps: back from the nearest, past the steps it was held out at the end of its reach, until the glove
    // was barely moving again, the wind-up)
    const moved = i => len(M.sub(kept[i][who][hand], kept[i - 1][who][hand])) > 0.02;
    let from = best,
      held = 0;
    while (from > 0 && !moved(from) && held++ < 8) from--;
    while (from > 0 && moved(from)) from--;
    const path = kept.slice(from).map(k => k[who][hand]);
    path.near = best - from;
    return path.length >= 2 ? path : null;
  }
  // (of such a path, the stretch `long` metres long round its nearest point: a third of it after, as much of that as there is,
  // and the rest before)
  function cut(path, long) {
    const at = path.near,
      out = [path[at]];
    let after = 0;
    for (let i = at + 1; i < path.length; i++) after += len(M.sub(path[i], path[i - 1]));
    let left = long - Math.min(after, long / 3);
    for (let i = at - 1; i >= 0 && left > 0; i--) {
      const d = len(M.sub(path[i], path[i + 1]));
      out.unshift(d <= left ? path[i] : M.lerp(path[i + 1], path[i], left / d));
      left -= d;
    }
    left = Math.min(after, long / 3);
    for (let i = at + 1; i < path.length && left > 0; i++) {
      const d = len(M.sub(path[i], path[i - 1]));
      out.push(d <= left ? path[i] : M.lerp(path[i - 1], path[i], left / d));
      left -= d;
    }
    return out;
  }
  /* a brilliant defence's line: the defence's own line drawn again clearer (a step lighter, thicker, staying longer, and a
     miss's longer, back along the way the punch came), in place of what is left of it; or drawn clear from where the punch
     went, if no line was drawn at the defence */
  function clear(e, fx) {
    const C = LOOK.clear,
      f = e.of === 'parry' ? g.parried && g.parried[e.on] : null,
      w = e.of === 'parry' ? null : wind[e.on];
    if (!f && !w) return;
    for (const it of (f || w).pieces) it.life = Math.min(it.life, it.age);
    // (a parry's: what it still follows of the glove drawn clear too)
    if (f) line(fx, f.path, C.width, C.colours, C.life, null, false, L.edge), Object.assign(f, { colours: C.colours, width: C.width, life: C.life });
    else line(fx, cut(w.path, C.length), C.width, C.colours, C.life, null, true, W.edge);
  }
  // a block: a small ripple on the part of him that met it, and 0 to 2 sparks (a shoulder rolled out from under it: its own)
  function block(e, men, fx, sparks, out, ring) {
    const k = sizeOf(e),
      him = men[e.on],
      R = LOOK.ripple;
    if (him && him.points) {
      let joint = null,
        near = Infinity;
      for (const j of PARTS)
        if (him.points[j]) {
          const d = len(M.sub(him.points[j], e.at));
          if (d < near) (near = d), (joint = j);
        }
      if (e.part === 'shoulder') joint = 'LS';
      // (as strong as a jab's hit's from a jab's impulse up, and no weaker than `least` of it: any less is under a pixel)
      if (joint) out.ripple = { on: e.on, ripple: { joint, off: M.sub(e.at, him.points[joint]), age: 0, strength: R.strength * Math.max(R.least, k), width: Math.max(R.thin, R.width * k), last: R.last, sway: R.sway } };
    }
    if (e.part === 'shoulder' && e.roll && him && him.points && him.points.LS) {
      /* (rolled off it: the glove stays where the shoulder stopped it and the shoulder turns away under it, so the line is the
         way the place it met on his shoulder goes as he rolls, a little off its face, followed as it goes; and 3 sparks
         thrown off along that way as it starts) */
      const off = M.sub(e.at, him.points.LS),
        far = len(off) + L.lift;
      follow.push({ man: e.on, hand: 'LS', off: M.scale(unit(off), far), edge: 0, last: M.add(him.points.LS, M.scale(unit(off), far)), from: M.add(him.points.LS, M.scale(unit(off), far)), left: L.roll, room: mix(L.out, k), fx: ring || fx, width: mix(L.width, k), life: mix(L.life, k), colours: L.colours, path: [], pieces: [], sparks: sparks ? { n: S.roll, colours: S.cool } : null });
      return;
    }
    // (the punch's own line, stopped dead where it met him: the way it came, no bend; and 0 to 2 sparks)
    start(e.who, handOf(e, men && men[e.who]), e.at, fx, k, men, false);
    const n = sparks ? Math.round(S.block * k) : 0;
    if (n) fx.sparks(e.at, n, S.cool, S.speed, [-e.vec[0], -e.vec[2], -e.vec[1]], S.width, { life: S.life });
  }
  /* a parry: the bent path of the glove it turned aside, as it goes, and 3 or 4 sparks thrown at once from where the gloves
     met, up and round as today's are (the way the glove will go is not known yet: the bout's turned glove is held a moment
     and then thrown back; thrown back the way the punch came they went behind the man who threw it): off him, never over him */
  function parry(e, men, fx, sparks) {
    const k = sizeOf(e),
      f = start(e.on, handOf(e, men && men[e.on]), e.at, fx, k, men);
    g.parried = g.parried || [null, null];
    g.parried[e.on] = f;
    if (sparks) fx.sparks(e.at, k >= S.four ? S.parry[1] : S.parry[0], S.warm, S.speed, null, S.width, { life: S.life });
  }
  /* (a line that follows a man's glove from where it met the other man's guard: drawn back along the way it came first, from
     what is kept of it, and then on as it goes) */
  function start(man, hand, at, fx, k, men, on = true) {
    const width = mix(L.width, k),
      life = mix(L.life, k),
      f = { man, hand, off: [0, 0, 0], edge: L.edge, room: mix(L.out, k), last: men && men[man] && men[man].points ? men[man].points[hand].slice() : at.slice(), left: L.follow, fx, width, life, colours: L.colours, path: [], pieces: [] };
    // (the way in: the glove as it was kept, back from where it met the guard, `back` metres of it)
    const before = [];
    let left = on ? L.back : L.stop * (0.6 + 0.4 * k);
    for (let i = kept.length - 1; i >= 0 && left > 0; i--) {
      const p = kept[i][man][hand];
      if (!before.length) {
        before.push(p);
        continue;
      }
      const d = len(M.sub(before[0], p));
      if (d < 1e-3) continue;
      before.unshift(d <= left ? p : M.lerp(before[0], p, left / d));
      left -= d;
    }
    if (before.length >= 2) line(fx, before, width, L.colours, on ? life : mix(L.held, k), f.pieces, false, on ? L.edge : 0);
    f.path = before.slice();
    f.last = before.length ? before[before.length - 1].slice() : f.last;
    if (on) follow.push(f);
    return f;
  }
  return g;
}

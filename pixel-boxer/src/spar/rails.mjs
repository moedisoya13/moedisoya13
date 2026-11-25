/* The sparring's rails: what each man does, read off the bout as it is stepped. Each man has two lanes, which run at the same
   time: his techniques (attack and defence: punches, evasions, the guard, a show-off's taunt, and his hit reactions) and his
   footwork (the distance: in, out, pressing, giving ground; and the axis: side steps, pivots, cutting off the ring, the
   engine's own dash, duck in, pivot out, circle out and wave). The planner (plan.mjs) keeps the lanes of the round it
   arranges, and anything that plays the round's controls again (the page, the tests, tools/spar.mjs) reads the same lanes
   off its own bout with the same watcher: they are the same blocks, step for step, because the same controls give the
   same bout. Nothing here draws.
     const w = watcher()
     w.see(bout, inputs)     after each step of the bout (inputs: that step's controls, for the walks they name)
     w.rails                 [red's techniques, blue's techniques], in the order they started
     w.feet                  [red's footwork, blue's footwork]
     w.end()                 the round is over: the blocks still open are closed
   A block: { who, kind, name, from, to (steps of the round: sixtieths of a second as it is watched, a held moment of a blow
   counted), tech (the technique it was meant as), out (what came of it), J, worth (newton-seconds, a counter's gain in
   it), at (the step it landed, was blocked or went by), counter, down, cut (hit in the middle of it: { name, J, worth,
   power, at }), cuts (what a blow that landed cut: the other man's block's kind, or 'early' for a punch of his that had
   not got there yet), by (a hit reaction's blow), n (blows a guard took) }
     kind     'attack'   a punch: name its id (anim/moves.mjs), out 'hit' | 'block' | 'parry' | 'whiff' | 'graze' | null (cut
                         before it got there)
              'evade'    slip, duck, roll (the weave), pull (the sway back): out 'clear' once a punch has gone by him in it
              'guard'    the guard held up (name 'guard', or 'shell', 'shoulder', 'pat' meant as a technique): out 'block' |
                         'parry' once it has met a punch
              'show'     a show-off's taunt
              'hurt'     the hit reaction: from a blow landing on him until he can do anything again (name 'hurt'), or his
                         arm thrown aside by a parry (name 'thrown'); by: the blow
              'down'     the knockdown
              'step'     footwork, on his other lane. A walk the planner names in its controls (walk: 'in', 'out', 'press',
                         'back': the distance; 'side', 'pivot', 'cut': the axis), for as long as his feet can go where the
                         stick says (not while he is stunned or in a move that is not a punch); and the engine's own moves:
                         dash, duckIn, hopPivot, hopCircle, wave. way: 'distance' | 'axis'; out 'clear' once a punch has
                         gone by him in it
   The engine's own rule is shown as it is (game/bout.mjs strike): a blow that lands ends whatever the other man was doing
   at that moment; the blocks he was in, on both lanes, are cut there (cut) and his hit reaction starts. A power blow's cut
   is marked (power: POWER newton-seconds or more with the counter's gain, and not the lead hand's straight). */
import { MOVES } from '../anim/moves.mjs';
import { RULES } from '../game/bout.mjs';

export const POWER = 45;
const EVADE = ['slip', 'duck', 'roll', 'pull'],
  GOING = ['dash', 'duckIn', 'hopPivot', 'hopCircle', 'wave'],
  THROWN = ['reel', 'hammered', 'patted', 'rolled'],
  OUTCOME = ['hit', 'block', 'graze', 'whiff', 'parry'];
// (the kinds of the technique lane that are an action a man starts: what its density counts)
export const ACTS = ['attack', 'evade', 'guard', 'show'];
// which of the two things footwork does a step is: the distance between them, or the axis they stand on
export const WAY = { in: 'distance', out: 'distance', press: 'distance', back: 'distance', duckIn: 'distance', side: 'axis', pivot: 'axis', cut: 'axis', dash: 'axis', hopPivot: 'axis', hopCircle: 'axis', wave: 'axis' };
export const worthOf = e => e.J * (e.counter ? RULES.counterGain : 1);
// a power blow: the power button's punch (not the lead hand's straight), with POWER newton-seconds or more in it
export const isPower = e => {
  const m = MOVES[e.name];
  return !!m && !(m.kind === 'straight' && m.hand === 'L') && worthOf(e) >= POWER;
};

export function watcher() {
  const rails = [[], []],
    feet = [[], []],
    open = [null, null],
    going = [null, null],
    hits = [0, 0],
    // (the standing between two motions: for each man, the runs of steps in which the bout would have let him start
    // something and he was doing nothing, on each lane; the run still going, and whether anything of his has started yet)
    gaps = { tech: [[], []], feet: [[], []] },
    run = { tech: [0, 0], feet: [0, 0] },
    begun = { tech: [false, false], feet: [false, false] };
  let k = 0;
  // (a block is closed at the step it was last seen in; one that lasted no step at all is not kept)
  const close = (lanes, held, i) => {
    const b = held[i];
    if (!b) return;
    b.to = k - 1;
    if (b.to <= b.from && lanes[i][lanes[i].length - 1] === b) lanes[i].pop();
    held[i] = null;
  };
  // what he is doing now, as a key (the same for as long as it is the same action) and a kind: his technique
  function doing(f, i) {
    const a = f.action,
      m = a && MOVES[a.name];
    if (f.down) return ['down', 'down', 'down'];
    if (a && m.punch) return [a.id, 'attack', a.name];
    if (a && EVADE.includes(a.name)) return [a.id, 'evade', a.name];
    if (a && m.taunt) return [a.id, 'show', a.name];
    if (a && THROWN.includes(a.name)) return [a.id, 'hurt', 'thrown'];
    if (a) return [null];
    if (f.stun > 0) return ['hurt' + hits[i], 'hurt', 'hurt'];
    if (f.cover) return ['guard', 'guard', f.shell ? 'shell' : f.roll ? 'shoulder' : f.pat ? 'pat' : 'guard'];
    return [null];
  }
  // and his feet: a move of the engine's that goes somewhere, or a walk the controls name, while his feet can walk it
  function stepping(f, input) {
    const a = f.action;
    if (f.down) return [null];
    if (a && GOING.includes(a.name)) return [a.id, a.name];
    if (input && input.walk && f.stun <= 0 && !f.shift && (!a || MOVES[a.name].punch)) return ['walk' + input.walk, String(input.walk).replace(/\d+$/, '')];
    return [null];
  }
  return {
    rails,
    feet,
    gaps,
    get k() {
      return k;
    },
    see(bout, inputs) {
      k++;
      const F = bout.fighters,
        now = k - 1, // (the step this is the end of, counted from nothing)
        fresh = [false, false],
        // his technique's block, opened if what he is doing is not the one that is open
        tech = (f, i) => {
          const [key, kind, name] = doing(f, i);
          if (open[i] && open[i].key === key) return;
          close(rails, open, i);
          if (!key) return;
          const b = { who: i, kind, name, from: now, to: null };
          if (f.action && f.action.asked && f.action.asked.tech) b.tech = f.action.asked.tech;
          if (f.action && f.action.variant) b.trick = f.action.variant;
          if (f.action && f.action.counter && kind === 'attack') b.answer = true;
          b.key = key;
          rails[i].push((open[i] = b));
          fresh[i] = ACTS.includes(kind);
        };
      // (a punch started this step is on his lane before the step's events are read: right up close it may land at once)
      F.forEach((f, i) => f.action && MOVES[f.action.name].punch && tech(f, i));
      for (const e of bout.events) {
        if (!OUTCOME.includes(e.type)) continue;
        const p = e.type === 'parry' ? e.on : e.who,
          d = 1 - p,
          mine = rails[p];
        // (the punch it is the outcome of: his last block of that punch with none yet)
        let thrown = null;
        for (let j = mine.length - 1; j >= 0 && j >= mine.length - 4 && !thrown; j--) if (mine[j].kind === 'attack' && mine[j].name === e.name && !mine[j].out) thrown = mine[j];
        if (thrown) {
          thrown.out = e.type;
          thrown.at = now;
          thrown.J = e.J;
          if (e.type === 'hit') Object.assign(thrown, { worth: +worthOf(e).toFixed(1), counter: !!e.counter || undefined, down: !!e.down || undefined, body: e.part === 'body' || undefined, power: isPower(e) || undefined });
        }
        const his = open[d] || rails[d][rails[d].length - 1],
          step = going[d] || feet[d][feet[d].length - 1];
        if (e.type === 'hit') {
          // (the engine's rule: whatever he was doing is over; shown as a cut on both his lanes, and his hit reaction after it)
          const was = open[d],
            cut = { name: e.name, J: e.J, worth: +worthOf(e).toFixed(1), power: isPower(e) || undefined, at: now };
          if (was && ACTS.includes(was.kind)) {
            was.cut = cut;
            // (and on the blow's own block: what it cut, 'early' a punch that had not got there yet)
            if (thrown) thrown.cuts = was.kind === 'attack' && !was.out ? 'early' : was.kind;
          }
          if (going[d]) (going[d].cut = cut), thrown && !thrown.cuts && (thrown.cuts = 'step');
          hits[d]++;
          close(rails, open, d);
          close(feet, going, d);
          if (!e.down) {
            rails[d].push((open[d] = { who: d, kind: 'hurt', name: 'hurt', from: now, to: null, by: { name: e.name, J: e.J, worth: +worthOf(e).toFixed(1), power: isPower(e) || undefined } }));
            open[d].key = 'hurt' + hits[d];
          }
        } else if (e.type === 'whiff' || e.type === 'graze') {
          if (his && his.kind === 'evade' && (his.to === null || now - his.to <= 6)) his.out = 'clear';
          // (gone by a man stepping back or off the line, with no evasion of his head's)
          else if (step && (step.to === null || now - step.to <= 3) && ['back', 'out', 'dash', 'side', 'pivot', 'hopPivot', 'hopCircle', 'wave'].includes(step.name)) step.out = 'clear';
        } else if (his && his.kind === 'guard' && (his.to === null || now - his.to <= 3)) (his.out = e.type), (his.n = (his.n || 0) + 1);
      }
      F.forEach((f, i) => {
        tech(f, i);
        const started = { tech: fresh[i], feet: false };
        const [fkey, fname] = stepping(f, inputs && inputs[i]);
        if (!(going[i] && going[i].key === fkey)) {
          close(feet, going, i);
          if (fkey) feet[i].push((going[i] = { who: i, kind: 'step', name: fname, way: WAY[fname] || 'axis', from: now, to: null, key: fkey })), (started.feet = true);
          // (a move of the engine's that goes somewhere takes all of him: it is a start for his techniques' lane too)
          if (fkey && f.action && GOING.includes(f.action.name)) started.tech = true;
        }
        /* (the gaps: a step of the bout, not a held moment of a blow, in which he could have started something and nothing
           of his was going on: for his techniques, on his feet, free, not stunned, his guard down; for his feet, able to
           walk and not walking. A run of them is kept when it ends: with the start of something of his, which may be at
           once (a run of none), or with something done to him) */
        if (bout.over !== null || f.down || bout.stop > 0) return;
        const idle = { tech: !f.action && f.stun <= 0 && !f.cover, feet: f.stun <= 0 && !f.shift && (!f.action || !!MOVES[f.action.name].punch) && !fkey };
        for (const lane of ['tech', 'feet']) {
          if (idle[lane]) run[lane][i]++;
          else {
            if (begun[lane][i] && (started[lane] || run[lane][i] > 0)) gaps[lane][i].push(run[lane][i]);
            begun[lane][i] = begun[lane][i] || started[lane];
            run[lane][i] = 0;
          }
        }
      });
    },
    end() {
      k++;
      for (const i of [0, 1]) close(rails, open, i), close(feet, going, i);
      k--;
      for (const r of [...rails, ...feet]) for (const b of r) delete b.key;
    }
  };
}

/* ---- the rails' numbers (tests, tools/spar.mjs, docs/spar.md): from the first action to the knockdown.
   -> { seconds, starts: [red, blue] (techniques started), rate: [red, blue] (a second), empty (the longest stretch, seconds,
   in which neither man started anything, a technique or a step), lull (the longest in which neither started a technique),
   idle: [red, blue] (the longest in which that man started no technique), cuts (technique blocks
   cut by a blow), power (of them, by a power blow), early (of those, a punch cut before it got there, or an evasion or a
   guard), steps: [red, blue] (footwork started), pace: [red, blue] (a second), kinds: [red, blue] (how many kinds of
   footwork each did), still: [red, blue] (the longest stretch, seconds, with no footwork of his), ways: { distance, axis }
   (footwork blocks of each) } */
export function measure(rails, feet, end) {
  const acts = i => rails[i].filter(b => ACTS.includes(b.kind) && b.from < end),
    steps = i => feet[i].filter(b => b.from < end),
    first = Math.min(...[0, 1].map(i => (acts(i)[0] ? acts(i)[0].from : end)), ...[0, 1].map(i => (steps(i)[0] ? steps(i)[0].from : end))),
    seconds = (end - first) / 60,
    gap = list => {
      let worst = 0,
        at = first;
      for (const b of list) (worst = Math.max(worst, b.from - at)), (at = b.from);
      return Math.max(worst, end - at) / 60;
    },
    all = [...acts(0), ...acts(1)].sort((a, b) => a.from - b.from),
    cut = all.filter(b => b.cut),
    walked = [...steps(0), ...steps(1)];
  return {
    seconds,
    starts: [0, 1].map(i => acts(i).length),
    rate: [0, 1].map(i => acts(i).length / seconds),
    empty: gap([...all, ...steps(0), ...steps(1)].sort((a, b) => a.from - b.from)),
    lull: gap(all),
    idle: [0, 1].map(i => gap(acts(i))),
    cuts: cut.length,
    power: cut.filter(b => b.cut.power).length,
    early: cut.filter(b => b.cut.power && (b.kind !== 'attack' || !b.out)).length,
    steps: [0, 1].map(i => steps(i).length),
    pace: [0, 1].map(i => steps(i).length / seconds),
    kinds: [0, 1].map(i => new Set(steps(i).map(b => b.name)).size),
    still: [0, 1].map(i => gap(steps(i))),
    ways: { distance: walked.filter(b => b.way === 'distance').length, axis: walked.filter(b => b.way === 'axis').length }
  };
}
/* The standing between two motions (watcher().gaps), in frames: for each lane and man, { n, mean, p90, most } of the runs
   in which the bout would have let him start something and he did nothing; a motion that started on the first frame it
   could counts as 0. */
export function gapsOf(gaps) {
  const of = list => {
    const sorted = list.slice().sort((a, b) => a - b),
      n = sorted.length;
    return { n, mean: n ? +(sorted.reduce((a, b) => a + b, 0) / n).toFixed(2) : 0, p90: n ? sorted[Math.min(n - 1, Math.floor(n * 0.9))] : 0, most: n ? sorted[n - 1] : 0 };
  };
  return { tech: gaps.tech.map(of), feet: gaps.feet.map(of) };
}

/* ---- the camera's views (src/spar.mjs): the picture is one fixed angle that follows the two men, and on top of it, where
   what happens calls for it, a bird's-eye view or a zoom in, read off the lanes (so they are known before the round plays,
   and the same every time it is played). -> [{ kind: 'bird' | 'zoom', from, to (steps), why }], in order, never two at once.
     zoom   a power blow that lands as a counter ('counter'), that cuts a punch of the other man's before it gets there
            ('cut'), that is thrown right up close ('inside'), or that puts him down ('down'): from a little before it lands
     bird   footwork that moves the axis: the pivot out, the circle out, the wave, a man cutting off the ring for a while
            (their names), and both men stepping round at once, one of them pivoting ('round'): from as it starts until a
            moment after
   Each is held VIEW.hold seconds at the least, one that comes within VIEW.join of the last of its kind goes on with it, and
   one that would start within VIEW.rest seconds of the last one ending is left out (the knockdown's is always kept). */
export const VIEW = { hold: 1.8, join: 0.8, rest: 3.4, lead: 0.45, after: 1.2, most: 4.5, round: 0.45 };
export function viewsOf(rails, feet, end) {
  const S = s => Math.round(s * 60),
    cues = [];
  for (const r of rails)
    for (const b of r) {
      if (b.from >= end || !(b.kind === 'attack' && b.out === 'hit' && (b.power || b.down))) continue;
      const why = b.down ? 'down' : b.counter ? 'counter' : b.cuts === 'early' ? 'cut' : ['hookIn', 'upperIn', 'upperBody'].includes(b.name) ? 'inside' : null;
      if (why) cues.push({ kind: 'zoom', from: b.at - S(VIEW.lead), to: b.at + S(VIEW.after), why });
    }
  for (const r of feet)
    for (const b of r) {
      if (b.from >= end || b.cut || b.to === null) continue;
      if (['hopPivot', 'hopCircle', 'wave'].includes(b.name) ? b.to - b.from >= S(0.45) : b.name === 'cut' && b.to - b.from >= S(0.6)) cues.push({ kind: 'bird', from: b.from - 6, to: b.to + S(0.7), why: b.name });
      // (both stepping round at once: the axis is turning)
      else if (b.who === 0 && b.name === 'pivot') {
        const other = feet[1].find(o => (o.name === 'pivot' || o.name === 'side') && o.to !== null && Math.min(o.to, b.to) - Math.max(o.from, b.from) >= S(VIEW.round));
        if (other) cues.push({ kind: 'bird', from: Math.max(b.from, other.from) - 6, to: Math.max(b.to, other.to) + S(0.7), why: 'round' });
      }
    }
  cues.sort((a, b) => a.from - b.from);
  const out = [];
  for (const c of cues) {
    const last = out[out.length - 1];
    c.to = Math.max(c.to, c.from + S(VIEW.hold));
    if (last && c.kind === last.kind && c.from <= last.to + S(VIEW.join)) {
      if (c.to - last.from <= S(VIEW.most) || c.why === 'down') (last.to = Math.max(last.to, c.to)), (last.why = last.why.includes(c.why) ? last.why : last.why + '+' + c.why);
    } else if (last && c.from < last.to + S(VIEW.rest)) {
      // (too soon after the last one; but the knockdown is seen close: the last one ends for it)
      if (c.why === 'down') (last.to = Math.min(last.to, c.from - S(0.5))), last.to - last.from < S(1) && out.pop(), out.push(c);
    } else out.push(c);
  }
  for (const c of out) c.from = Math.max(0, c.from);
  return out;
}

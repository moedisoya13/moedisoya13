/* 한 라운드 스파링: one round of promised sparring (약속 대련, docs/moves-plan-6.md §8; docs/spar.md), arranged from a seed and
   rehearsed in the real bout. Nothing here draws, and the same code makes the round in the page and under node.
     planOf(seed, o)   -> the round: { seed, men, hp, winner, beats (the timeline), inputs (both men's controls, step by step),
                          ko, steps, time, stats }. Played back by startOf(plan) and stepping it with plan.inputs, it is the same
                          bout to the step, events and all (tests/spar.test.mjs).
     planner(seed, o)  -> the same made a piece at a time, for a page that must keep drawing: .run(ms) works on for about that
                          long and says how far it has got ({ done, beats, rebuilt }); .plan once done
     startOf(plan)     -> a bout set up as the round starts: the two men, their grades and loadouts, the health both start with
   How a round is made (docs/spar.md has it in Korean):
   - Two men, red (0) and blue (1), each at one of the seven grades, as likely as each other (1 in 7); each carries the
     techniques his grade gives him (profile.mjs loadout) and fills his other slots from those his grade opens, the round's
     dice choosing (game/techniques.mjs: a technique added there comes in here). Who wins is the round's dice too, the better
     grade the likelier; both start with the same health (hpOf: lower the weaker the winner, whose clean blows take less of
     it), on the HUD from the first frame.
   - A round is a sequence of beats, each one exchange of the catalogue's (cards.mjs library: the cards the catalogue fights,
     at the grade each man is, with the techniques he carries), played between them where they stand: first a walk to the
     distance the card is fought at (the rest between exchanges), then the card's own presses, guards and places.
   - A grammar, not a shuffle: an opening of footwork, jabs and guards; a middle of combinations against guards,
     defences and their counters, body work, a show-off's trick or taunt, techniques, in and out; and a finish: the blow that
     puts the loser down, his first knockdown. Who leads each exchange goes by their grades, and by who is winning.
   - Rehearsed: a bout cannot be copied (its men's bodies and dice are closures: structuredClone refuses it). So each card
     drawn is first screened on a bout of its own, the two men set at the card's places as they are now (grades, loadouts,
     health, breath): does it come out as the card does (the slip slips, the guard blocks, the counter lands), at what
     timing of B's press (a card timed to the frame is searched round a guess from how much sooner or later his punch gets
     there than a pro's, and kept only if three neighbouring frames or more work: its middle is used), what it does to each
     man's health, and whether anyone goes down. The first that fits is then played on the round's own bout, from where it
     stands: a walk to the card's distance and a rest, then the card. If it does not come out there as it did in its
     screen, the round's bout is played again from the start (the same controls give the same bout) and the next timing or
     card is tried. What it costs is in plan.stats (stepped, screened, rebuilt, replayed).
   - The knockdown: the round's health is set once (both men alike, shown) and steered by the beats chosen, from their
     screens: each takes about what the loser still has to lose, over the beats left (at most 2.2 times that), and the
     winner stays the stronger. Once the loser's health is under SPAR.zone, the finish: a card whose screen puts him down
     with the winner's power blow is tried first; one that only hurts him is kept as a beat, if there is room for it; at the
     last beats with his health still high, the liver the likelier (a liver blow puts a man down whatever his health). The beat whose
     blow is his first knockdown ends the round; one with a knockdown before it is refused. */
import { createBout, step, settle, RULES } from '../game/bout.mjs';
import { TECHNIQUES, opens } from '../game/techniques.mjs';
import { loadout } from '../game/profile.mjs';
import { LEVEL, LEVELS } from '../anim/skill.mjs';
import { MOVES } from '../anim/moves.mjs';
import { dice } from '../anim/stance.mjs';
import { arrival } from '../anim/animator.mjs';
import { createChain } from '../phys/chain.mjs';
import { RING } from '../world/ring.mjs';
import { library, runCard, frameOf, punchName, trickName, SAID, DT } from './cards.mjs';
import { auditor } from '../audit.mjs';
// (the audit's checks between the two men: a contact off the cards' distances is a known limit of the engine, not his body's)
export const BETWEEN = ['a glove inside the other man', 'the two men inside each other'];

/* The numbers of a round (tune here):
     beats      how many beats, at the least and the most (the finish is the last)
     open       beats of the opening (feeling out)
     hp         the health both men start with, least and most (the round's dice), for a winner of grade 5; less by `hpBy`
                for each grade the winner is below 5 (a weaker man's clean blows take less of it: hpOf)
     zone       the loser's health under which the finish is tried (a counter takes up to about 9)
     walk       the walk between beats: the most seconds, how near his place a man has to be (m), how still (m/s), the
                rest after it (seconds, least and most), how hard the stick is pushed (a walk, not a run), and the most
                seconds spent first waiting for both to have their feet again after the last blow
     margin     metres a punch an evasion made miss may have missed by at most (one that fell short was not evaded)
     power      newton-seconds the knockdown's blow has at least (no light blow puts him down)
     tries      the timings of B's press tried round the screened one (frames), the most cards drawn for one beat, how far
                from the guess a screen searches (frames), and the fewest neighbouring frames a timing must work for
     tail       seconds the bout goes on after the knockdown (his fall)
     audit      true: a beat whose rehearsal breaks a held check of either man's own body (src/audit.mjs: joints, his own
                gloves, balance, the centre of mass) is refused like one that did not come out (costs about as much again
                as the round's own steps) */
export const SPAR = {
  beats: [10, 18],
  open: 3,
  hp: [28, 38],
  hpBy: 2.5,
  zone: 7,
  walk: { most: 3, near: 0.035, still: 0.15, rest: [0.7, 1.7], pace: 0.7, settle: 0.8 },
  audit: false,
  margin: 0.12,
  power: 45,
  tries: { timing: [0, -1, 1], cards: 10, screen: [-4, 4], width: 3 },
  tail: 4
};

const OUTCOME = ['hit', 'block', 'graze', 'whiff', 'parry'];
const puncher = e => (e.type === 'parry' ? e.on : e.who);
const clampRing = (p, m) => [Math.max(-RING.half + m, Math.min(RING.half - m, p[0])), Math.max(-RING.half + m, Math.min(RING.half - m, p[1]))];

// (the health both start with, least and most, when the winner is of this grade)
export const hpOf = grade => SPAR.hp.map(h => h - SPAR.hpBy * (5 - LEVEL[grade].grade));

/* ---- the two men */
// (a grade's place in the order, for who is the likelier to lead and to win: 1 to 5)
const rank = lv => LEVEL[lv].grade;
function menOf(rng) {
  return [0, 1].map(() => {
    const grade = LEVELS[Math.floor(rng() * LEVELS.length)],
      skills = { all: grade },
      standard = loadout(skills),
      // (the rest of his slots from what his grade opens, in an order the dice choose)
      more = Object.keys(TECHNIQUES).filter(id => !standard.includes(id) && opens(skills, id)),
      order = more.map(id => [rng(), id]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    return { grade, skills, techniques: loadout(skills, [...standard, ...order]) };
  });
}

/* A bout as the round starts: the two men as the plan has them, both with the round's health. */
export function startOf(plan) {
  const bout = createBout(plan.seed, { skills: plan.men.map(m => m.skills), techniques: plan.men.map(m => m.techniques) });
  bout.fighters.forEach(f => (f.hp = plan.hp));
  return bout;
}

/* ---- what came of a beat, from its events */
// the punches each man threw and what became of each, in order: { name, type, J, counter, down, out, margin, part, zone, at }
function outcomes(events, who) {
  return events.filter(x => OUTCOME.includes(x.e.type) && puncher(x.e) === who).map(x => ({ name: x.e.name, type: x.e.type, J: x.e.J, counter: !!x.e.counter, down: !!x.e.down, out: x.e.out || null, liver: !!x.e.liver, margin: x.e.margin ?? null, part: x.e.part, zone: x.e.zone || null, at: x.t, variant: x.e.variant }));
}

/* Did the exchange come out as the card does? A the card's boxer, B the other man (the round's indices). -> null if it did,
   else what went wrong (for the stats). */
function judged(lib, run, A, B, o) {
  if (run.bad) return 'no place';
  const ev = run.events,
    mine = outcomes(ev, A),
    his = outcomes(ev, B),
    card = lib.card,
    by = (who, type) => ev.some(x => x.e.type === type && x.e.who === who),
    downs = ev.filter(x => x.e.type === 'hit' && x.e.down);
  // (nobody down but by the finish's blow; no foul but the card's own)
  if (o.downOk) {
    // (screening a timing: a knockdown in it is no fault of the timing's)
  } else if (o.finish) {
    if (downs.length !== 1 || downs[0].e.who !== o.finish.by) return 'no knockdown';
    const last = outcomes(ev, o.finish.by).pop();
    if (!last || !last.down || last.J < SPAR.power || MOVES[last.name].kind === 'straight' && MOVES[last.name].hand === 'L') return 'not the last power blow';
  } else if (downs.length) return 'down';
  if (ev.some(x => x.e.type === 'foul') && !card.foul) return 'foul';
  if (lib.kind === 'defence') {
    if (!his.length) return 'nothing thrown';
    const key = his[his.length - 1],
      want = card.outcome;
    if (want && key.type !== want) return `${key.type} for ${want}`;
    if (card.before && his.slice(0, -1).some(x => x.type !== card.before)) return 'before';
    if (key.type === 'whiff' && card.move && !(key.margin !== null && key.margin <= SPAR.margin)) return 'fell short';
    if (card.move && !ev.some(x => x.e.type === card.move[0] && x.e.who === A)) return 'no evasion';
    if (lib.counter && !(mine.length && mine[0].type === 'hit') && !o.finish) return 'counter';
    if (lib.counter && o.finish && !mine.length) return 'counter';
  } else if (lib.kind === 'punch' || lib.kind === 'combo') {
    if (!mine.length) return 'nothing thrown';
    if (mine[0].type !== (o.cover ? 'block' : 'hit')) return `${mine[0].type} first`;
  } else if (lib.kind === 'trick') {
    const t = card.trick || card.foul;
    if (!ev.some(x => x.e.who === A && (x.e.type === 'paw' || x.e.type === 'collar' || (x.e.type === 'foul' && x.e.name === t) || x.e.variant === t || x.e.name === t))) return 'no trick';
    if (!mine.length) return 'nothing thrown';
  } else if (lib.kind === 'taunt') {
    if (!ev.some(x => x.e.type === 'taunt' && x.e.who === A && x.e.name === card.taunt)) return 'no taunt';
  } else if (lib.kind === 'tech') {
    if (!ev.some(x => x.e.who === A && (x.e.type === 'wave' || x.e.type === 'shift'))) return 'no technique';
  } else if (lib.kind === 'entry') {
    if (!by(A, card.move)) return 'no move';
  }
  return null;
}

/* ---- the beat, line by line in the timeline: who leads, what is thrown, the answer, what came of it (as rehearsed) */
const result = x => (x.down ? (x.out ? '실신' : '다운') : x.type === 'hit' ? `${x.counter ? '카운터 ' : ''}${SAID.hit} ${Math.round(x.J * (x.counter ? RULES.counterGain : 1))} N·s` : SAID[x.type]);
function lineOf(lib, A, B, run, o) {
  const ev = run.events,
    mine = outcomes(ev, A),
    his = outcomes(ev, B),
    names = list => list.map(x => punchName(x.name)).join(' '),
    card = lib.card;
  let lead = A,
    what,
    answer,
    said;
  if (lib.kind === 'defence') {
    lead = B;
    what = names(his) || punchName((card.punch || ['jab'])[0]);
    // (the card's name says the answer and what it answers: "크로스암 · 바디 잽"; the answer is the part before the dot)
    answer = lib.group === '맞기' ? '맞음' : lib.item === 'slick' ? lib.name : lib.name.split(' · ')[0];
    said = [...his.map(result), ...mine.map(result)];
  } else if (lib.kind === 'punch' || lib.kind === 'combo') {
    what = lib.kind === 'combo' ? lib.group : punchName(card.punch);
    answer = o.cover ? '가드' : '맞음';
    said = mine.map(result);
  } else if (lib.kind === 'trick') {
    what = trickName(card.trick || card.foul);
    answer = o.cover ? '가드' : '맞음';
    said = mine.map(result);
  } else if (lib.kind === 'taunt') {
    // (a taunt on its own; or the other man's punch, and the taunt after it, the answer)
    what = his.length ? names(his) : trickName(card.taunt);
    answer = his.length ? trickName(card.taunt) : '—';
    said = [...his.map(result), '도발'];
    if (his.length) lead = B;
  } else {
    what = lib.kind === 'tech' || lib.kind === 'entry' ? lib.group === '명의 기술' || lib.group === '진입 · 이탈' ? lib.name : lib.name : lib.name;
    answer = his.length ? names(his) : '—';
    said = [...mine.map(result), ...his.map(result)];
    if (!said.length) said = [lib.kind === 'step' ? '거리' : '—'];
  }
  return { lead, what, answer, said: said.join(' · ') };
}

/* ---- the rehearsal: the round's own bout, and every control given it so far (to play it again from the start) */
function rehearsal(plan) {
  const r = {
    log: [],
    bout: startOf(plan),
    rebuilt: 0, // how many times it has been played again from the start
    replayed: 0, // and the steps that took
    stepped: 0, // steps of the round's bout in all, tries and replays together
    screened: 0, // steps of the screens' bouts
    *rebuild() {
      r.bout = startOf(plan);
      let n = 0;
      for (const inp of r.log) if ((step(r.bout, inp, DT), ++n % (4 * CHUNK) === 0)) yield;
      r.rebuilt++;
      r.replayed += r.log.length;
      r.stepped += r.log.length;
    }
  };
  return r;
}

const sink = () => new Proxy({ x: 0, z: 0 }, { set: (t, k, v) => (k !== 'x' && k !== 'z' && (t[k] = v), true) });
const STUB = new Proxy({ fighters: [sink(), sink()] }, { set: () => true });
/* The frame a card is played in, from where the two men stand: the card's line along theirs, the middle of it drawn in
   toward the middle of the ring, and kept far enough inside the ropes for everything the card does. */
function frameFor(bout, lib, A) {
  const a = bout.fighters[A],
    b = bout.fighters[1 - A],
    line = Math.atan2(b.z - a.z, b.x - a.x),
    cardLine = Math.atan2(lib.him[1] - lib.me[1], lib.him[0] - lib.me[0]),
    angle = line - cardLine,
    mid = clampRing([((a.x + b.x) / 2) * 0.55, ((a.z + b.z) / 2) * 0.55], 0.9),
    turn = frameOf([0, 0], angle).turn,
    c = turn([(lib.me[0] + lib.him[0]) / 2, (lib.me[1] + lib.him[1]) / 2]);
  let o = [mid[0] - c[0], mid[1] - c[1]];
  // (everywhere the card puts either man, inside the ropes by 0.45 m; a card that reads where a man is, from the bout its setup
  // was given, is given two men standing at its origin for this: nothing of another bout is read)
  const card = lib.card,
    pts = [];
  if (card.setup) card.setup(STUB);
  for (let t = 0; t <= card.loop; t += 0.1)
    for (const f of [card.me, card.him]) {
      let p = null;
      try {
        p = f ? f(t) : null;
      } catch {
        p = null;
      }
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push(turn(p));
    }
  const room = RING.half - 0.45;
  for (const k of [0, 1]) {
    const lo = Math.min(...pts.map(p => p[k] + o[k]), o[k]),
      hi = Math.max(...pts.map(p => p[k] + o[k]), o[k]);
    if (hi > room) o[k] -= hi - room;
    if (lo < -room) o[k] += -room - lo;
  }
  return frameOf(o, angle);
}

// (walk a man to a place on the canvas: full stick when far, easing off as he arrives: footwork.mjs walkTo)
const walkTo = (f, to) => {
  const dx = to[0] - f.x,
    dz = to[1] - f.z,
    d = Math.hypot(dx, dz);
  return d < 0.025 ? [0, 0] : [(dx / d) * Math.min(SPAR.walk.pace, d * 4.5), (dz / d) * Math.min(SPAR.walk.pace, d * 4.5)];
};
const idle = f => !f.action && f.stun <= 0 && !f.down;

/* One beat on a bout: the walk to the card's places and a rest there (rest seconds: the round's dice, drawn before), then
   the card, until the exchange is over. -> { inputs, events: [{ t, k (step of the beat), e }] (the card's only), from (bout
   time the card started), walked (steps of the walk) }. place: false to start the card where the men stand (a screen's). */
function* playBeat(bout, lib, A, o, count) {
  const frame = o.frame || frameFor(bout, lib, A),
    run = runCard(lib, A, frame, { db: o.db, cover: o.cover, from: o.from ?? startOf_(lib) }),
    inputs = [],
    events = [],
    W = SPAR.walk,
    go = inp => {
      step(bout, inp, DT);
      inputs.push(inp);
      count.n++;
      for (const e of bout.events) events.push({ t: bout.t, k: inputs.length, e });
      // (the held checks of each man's own body, frame by frame, until anyone is down: src/audit.mjs auditor)
      if (o.audit && bout.over === null) o.audit.frame(bout, inputs.length);
    };
  // (first, until both have their feet again: nobody walks off while still being knocked back by the last blow)
  let walked = 0;
  for (let k = 0; o.place !== false && k < W.settle / DT && bout.fighters.some(f => !idle(f) || Math.hypot(f.kx, f.kz) > 0.15 || bout.stop > 0); k++) {
    go([{}, {}]);
    walked++;
    if (count.n % CHUNK === 0) yield;
  }
  // (a card that gave no real place to walk to is not played)
  if (!run.place.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return { inputs, events: [], from: bout.t, walked, bad: true };
  // the walk, and a rest once there
  let still = 0;
  for (let k = 0; o.place !== false && k < W.most / DT; k++) {
    const fs = [A, 1 - A].map(i => bout.fighters[i]),
      there = fs.every((f, i) => Math.hypot(f.x - run.place[i][0], f.z - run.place[i][1]) < W.near && Math.hypot(f.vx, f.vz) < W.still && idle(f));
    if (there) still += DT;
    if (there && still >= o.rest) break;
    const inp = [{}, {}];
    fs.forEach((f, i) => (inp[i === 0 ? A : 1 - A] = { move: walkTo(f, run.place[i]) }));
    go(inp);
    walked++;
    if (count.n % CHUNK === 0) yield;
  }
  const from = bout.t,
    // (the card's static presses: the exchange is not over before the last of them has had its time)
    last = Math.max(0, ...[...(run.entry.press || []), ...(run.entry.against || [])].map(p => p[0])),
    end = run.entry.loop;
  let quiet = 0;
  for (let k = 0; run.from + k * DT < end - 1e-9; k++) {
    go(run.step(bout, k));
    if (count.n % CHUNK === 0) yield;
    const t = run.from + k * DT,
      busy = bout.fighters.some(f => !idle(f)) || bout.stop > 0;
    quiet = busy ? 0 : quiet + DT;
    if (bout.over !== null && !o.finish) break;
    // (over: footwork once it has had its time; anything else past its last press, both men idle a quarter of a second, and
    // something of the card's done in it)
    if (lib.kind === 'step' ? t >= run.from + STEP_FOR - 1e-9 : t > last + 0.3 && quiet >= 0.25 && events.some(x => x.k > walked && DOING.includes(x.e.type))) break;
    if (bout.over !== null && bout.t - bout.overAt > 0.05) break;
  }
  return { inputs, events: events.filter(x => x.k > walked), from, walked };
}
// (what counts as a card having done something; and how long a beat of footwork goes on)
const DOING = ['punch', 'taunt', 'wave', 'shift', 'duckIn', 'hopPivot', 'hopCircle', 'slip', 'duck', 'roll', 'pull', 'dash', 'hit', 'block', 'parry', 'whiff', 'graze'];
const STEP_FOR = 3.2;
// (steps of a bout between two pauses of the arranging, for a page arranging it while it draws)
const CHUNK = 12;
// (where in its loop a card's beat starts: a moment before the first thing it does)
const startOf_ = lib => lib.from;
// (footwork, and a taunt nobody throws at: nothing in them can come out otherwise, and they are not screened)
const trivial = lib => lib.kind === 'step' || (lib.kind === 'taunt' && !(lib.card.against && lib.card.against.length));
// does the card's answer have to be timed to the frame (an evasion, a parry, a counter out of one: a window of the catalogue's)?
const critical = lib => lib.kind === 'defence' && (!!lib.card.card || !!(lib.card.press && lib.card.press.length));

/* ---- screening a timing on a bout of its own: the two men at the card's places as they are now (grades, loadouts, health,
   breath), standing in their guards; B's press moved by db frames. -> { db, width, dmg (the health each man lost in it),
   down ({ by, on } if a man went down in it) }: the middle of the run of neighbouring timings that came out as the card
   does, searched outward from the guess, or null. */
// (kept for the round only: the key buckets health and breath, so a screen kept from another round, or the same round's
// arranging begun again, would make the round depend on what was arranged before it)
function* screen(plan, r, lib, A, o, SCREENS) {
  const fa0 = r.bout.fighters[A],
    fb0 = r.bout.fighters[1 - A],
    // (what can change how it comes out: who they are, how hurt each looks (health under 45 shows), how tired (breath under a
    // third slows him))
    fresh = f => Math.round(4 * Math.min(1, f.stamina / (0.35 * f.k.staminaMax))),
    hurt = f => (f.hp >= 45 ? 'ok' : Math.round(f.hp / 5)),
    key = [lib.id, o.timed, plan.men[A].grade, plan.men[1 - A].grade, plan.men[A].techniques.join(), plan.men[1 - A].techniques.join(), o.cover, hurt(fa0), hurt(fb0), fresh(fa0), fresh(fb0)].join('|');
  if (SCREENS.has(key)) return SCREENS.get(key);
  const seen = new Map(),
    probe = function* (db) {
      if (seen.has(db)) return seen.get(db);
      const b = startOf(plan);
      for (const i of [0, 1]) (b.fighters[i].hp = r.bout.fighters[i].hp), (b.fighters[i].stamina = r.bout.fighters[i].stamina);
      const fa = b.fighters[A],
        fb = b.fighters[1 - A],
        frame = frameOf([0, 0], 0),
        run0 = runCard(lib, A, frame, { from: startOf_(lib) });
      [[fa.x, fa.z], [fb.x, fb.z]] = run0.place;
      fa.yaw = Math.atan2(fb.x - fa.x, fb.z - fa.z);
      fb.yaw = Math.atan2(fa.x - fb.x, fa.z - fb.z);
      settle(b);
      const hp = b.fighters.map(f => f.hp),
        count = { n: 0 },
        run = yield* playBeat(b, lib, A, { db, cover: o.cover, frame, place: false }, count),
        blow = run.events.find(x => x.e.type === 'hit' && x.e.down);
      r.screened += count.n;
      const ok = !judged(lib, run, A, 1 - A, { cover: o.cover, downOk: true }) && { db, dmg: b.fighters.map((f, i) => hp[i] - f.hp), down: blow ? { by: blow.e.who, on: blow.e.on, ok: !judged(lib, run, A, 1 - A, { cover: o.cover, finish: { by: blow.e.who } }) } : null };
      seen.set(db, ok);
      return ok;
    };
  if (!o.timed) {
    const p0 = yield* probe(0),
      out = p0 ? Object.assign({ width: null }, p0) : null;
    SCREENS.set(key, out);
    return out;
  }
  const [lo, hi] = SPAR.tries.screen;
  let hit = null;
  for (let d = 0; d <= Math.max(-lo, hi) && hit === null; d++) for (const s of d ? [-d, d] : [0]) if (hit === null && s >= lo && s <= hi && (yield* probe(o.est + s))) hit = o.est + s;
  let out = null;
  if (hit !== null) {
    // (a frame either side of it, and one more on the side that held if the other did not: three in a row, or too fine)
    const l = yield* probe(hit - 1),
      r2 = yield* probe(hit + 1);
    let a = hit - (l ? 1 : 0),
      b = hit + (r2 ? 1 : 0);
    if (b - a < 2) {
      if (l && (yield* probe(hit - 2))) a = hit - 2;
      else if (r2 && (yield* probe(hit + 2))) b = hit + 2;
    }
    out = Object.assign({}, yield* probe(Math.round((a + b) / 2)), { width: b - a + 1 });
  }
  SCREENS.set(key, out);
  return out;
}

/* How many frames B's punch would get there sooner or later than a pro's (the windows of the catalogue's defence are
   measured against a pro's: src/windows.data.mjs), as a first guess at where to put his press: anim/animator.mjs arrival. */
function estimate(plan, r, lib, A) {
  const B = 1 - A,
    f = r.bout.fighters[B],
    key = (lib.card.against || []).slice(-1)[0];
  if (!key) return 0;
  const name = typeof key[2] === 'string' && MOVES[key[2]] && MOVES[key[2]].punch ? key[2] : key[1] === 'jab' ? 'jab' : (lib.card.punch || ['cross'])[0];
  const move = MOVES[name] || MOVES.cross,
    rate = k => f.k.rate * (0.75 + 0.25 * Math.max(0, Math.min(1, f.stamina / (0.35 * f.k.staminaMax)))) * k,
    his = arrival(createChain(move, rate(1), LEVEL[plan.men[B].grade]), move),
    pro = arrival(createChain(move, 1, LEVEL[3]), move);
  return -Math.round((his - pro) / DT);
}

/* ---- the grammar: what may come next, by the phase of the round and who is winning */
const rest = (rng, k) => SPAR.walk.rest[0] + (SPAR.walk.rest[1] - SPAR.walk.rest[0]) * rng() * (k ?? 1);
const fits = (lib, man) => (!lib.grade || lib.grade === man.grade) && lib.needs.every(id => man.techniques.includes(id));
const showOff = man => !!LEVEL[man.grade].stance.show;
const tricky = (lib, man) => {
  const t = lib.card.trick || lib.card.foul,
    v = LEVEL[man.grade].vary;
  return !!v && [...(v.jab || []), ...(v.power || [])].some(([id]) => id === t);
};
// what a card is, for the grammar's purposes: its kind and a few things about it
function tagsOf(lib) {
  const c = lib.card,
    p = c.punch,
    name = typeof p === 'string' ? p : Array.isArray(p) ? p[0] : null,
    body = !!name && !!MOVES[name] && !!MOVES[name].zone,
    jab = name === 'jab' || name === 'jabBody',
    inside = lib.gap < 0.74;
  return { name, body, jab, inside, power: !!name && !jab };
}

/* The candidates for the next beat: [{ lib, A (the round's man in part A), cover, weight }], weighted. phase: 'open' |
   'middle' | 'finish'. W the winner, L the loser. need: how much the loser is to be hurt by it (-1 spare him, 0 either way,
   1 hurt him, 2 he must be hurt now). Each sort of exchange has its share (SHARES), split among the cards of that sort
   either man can fight (so that a sort with many cards does not crowd out one with few); an attack goes by how likely its
   man is to lead (his grade against the other's, and who is winning), a defence by how likely the other is to lead. */
const SHARES = {
  open: { step: 3, jab: 3, 'defence-jab': 2.5, guard: 1.2 },
  middle: { combo: 3, punch: 1.6, 'punch-body': 1.6, defence: 2.4, 'defence-counter': 2.6, takes: 0.5, trick: 1, taunt: 0.8, tech: 1.8, entry: 1, step: 0.7 },
  finish: { 'defence-counter': 5, punch: 3, 'punch-body': 1.5, combo: 2.5, trick: 1.5, tech: 2 }
};
const leadOf = (men, A, W) => Math.max(0.25, Math.min(0.75, 0.5 + 0.08 * (rank(men[A].grade) - rank(men[1 - A].grade)))) + (A === W ? 0.06 : -0.06);
function candidates(plan, phase, W, L, need, used, rng, last, bad) {
  const men = plan.men,
    groups = new Map(),
    shown = new Set(plan.beats.map(b => b.kind)),
    // (pressure and escapes: in under his punches, his short punches from there, and out again after them; a show-off's
    // or a great one's own at least once)
    follow = (lib, A) => {
      const t = tagsOf(lib);
      if (last && last.kind === 'entry' && last.item === 'duckIn' && last.A === A) return t.inside && lib.kind === 'punch' ? 8 : 0.3;
      if (last && last.kind === 'punch' && last.inside) return lib.kind === 'entry' && lib.item !== 'duckIn' ? 4 : 1;
      if ((lib.kind === 'trick' || lib.kind === 'taunt') && !shown.has('trick') && !shown.has('taunt')) return 1.8;
      // (a show-off shows off, but not all round)
      if ((lib.kind === 'trick' || lib.kind === 'taunt') && plan.beats.filter(b => b.kind === 'trick' || b.kind === 'taunt').length >= 3) return 0.15;
      if (lib.kind === 'tech' && !shown.has('tech')) return 1.8;
      return 1;
    },
    take = A => (A === W ? (need >= 2 ? 0.75 : need === 1 ? 0.45 : need === 0 ? 0.3 : 0.1) : 0.15),
    put = (sort, lib, A, cover, w) => {
      const share = SHARES[phase][sort];
      if (!share || w <= 0 || (last && last.item === lib.item)) return;
      const key = sort + '|' + A;
      if (!groups.has(key)) groups.set(key, []);
      // (and a card that has not come out for this pair in its screens, the less often the more it has not)
      groups.get(key).push({ lib, A, cover, weight: (share * w * follow(lib, A)) / (1 + 2.5 * (used.get(lib.item) || 0)) / (1 + 4 * ((bad && bad.get(lib.id + '|' + A)) || 0)) });
    };
  for (const lib of library()) {
    const t = tagsOf(lib);
    for (const A of [0, 1]) {
      const man = men[A];
      if (!fits(lib, man)) continue;
      if ((lib.kind === 'trick' && !tricky(lib, man)) || (lib.kind === 'taunt' && !showOff(man))) continue;
      const winner = A === W,
        mine = leadOf(men, A, W),
        his = leadOf(men, 1 - A, W),
        attack = ['combo', 'punch', 'trick', 'tech'].includes(lib.kind),
        hurts = (winner && attack) || (winner && lib.kind === 'defence' && lib.counter),
        steer = need >= 2 ? (hurts ? 3 : 0.4) : need === 1 ? (hurts ? 1.5 : 0.8) : need < 0 ? (hurts ? 0.3 : 1.5) : 1,
        cover = lib.covered ? undefined : rng() >= take(A);
      if (phase === 'open') {
        if (lib.kind === 'step') lib.moves && put('step', lib, A, undefined, mine);
        else if (lib.kind === 'punch' && t.jab) put('jab', lib, A, cover, mine);
        else if (lib.kind === 'defence' && t.jab && !lib.counter) put('defence-jab', lib, A, undefined, his);
        else if (lib.item === 'guard' || lib.item === 'block') put('guard', lib, A, undefined, his);
        continue;
      }
      if (phase === 'finish') {
        // (the winner's blow: a counter off a defence of his, a power punch, a combination, a show-off's trick, the shift)
        if (!winner) continue;
        // (still strong: the liver puts him down whatever his health, game/bout.mjs RULES.body.liver; anything else hurts him
        // on toward it)
        const liver = lib.card.punch === 'hookBody' || lib.card.way === 'pullBody' || (lib.kind === 'defence' && /liver|Body/.test(lib.item) && lib.counter),
          k = need > 1 && liver ? 3 : 1;
        if (lib.kind === 'defence' && lib.counter) put('defence-counter', lib, A, undefined, k);
        else if (lib.kind === 'punch' && t.power) put(t.body ? 'punch-body' : 'punch', lib, A, false, (lib.card.punch === 'hookBody' ? 1.4 : 1) * k);
        else if (lib.kind === 'combo') put('combo', lib, A, false, 1);
        else if (lib.kind === 'trick' && /elbow|collar|pawDown/.test(lib.card.trick || '')) put('trick', lib, A, false, 1);
        else if (lib.kind === 'tech' && /shift/.test(lib.item)) put('tech', lib, A, undefined, 1);
        continue;
      }
      // the middle
      if (lib.kind === 'combo') put('combo', lib, A, cover, mine * steer);
      else if (lib.kind === 'punch') put(t.body ? 'punch-body' : 'punch', lib, A, cover, mine * steer);
      // (a drill of being hit is the other man's punch landing: a sort of its own, rarer)
      else if (lib.kind === 'defence') put(lib.counter ? 'defence-counter' : lib.card.outcome === 'hit' && !lib.card.move && lib.group === '맞기' ? 'takes' : 'defence', lib, A, undefined, his * steer);
      else if (lib.kind === 'trick') put('trick', lib, A, lib.covered ? undefined : cover, steer);
      else if (lib.kind === 'taunt') put('taunt', lib, A, undefined, 1);
      else if (lib.kind === 'tech') put('tech', lib, A, undefined, steer);
      else if (lib.kind === 'entry') put('entry', lib, A, undefined, mine);
      else if (lib.kind === 'step') lib.moves && put('step', lib, A, undefined, need >= 2 ? 0.3 : 1);
    }
  }
  // (each sort's share split among its cards)
  const out = [];
  for (const list of groups.values()) for (const c of list) out.push(Object.assign(c, { weight: c.weight / list.length }));
  return out;
}
// (k of them drawn without putting back, each by its weight)
function draw(list, k, rng) {
  const out = [],
    pool = list.slice();
  while (out.length < k && pool.length) {
    const sum = pool.reduce((s, c) => s + c.weight, 0);
    let u = rng() * sum,
      i = 0;
    while (i < pool.length - 1 && (u -= pool[i].weight) > 0) i++;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/* ---- the round, a piece at a time. A round that cannot be arranged (no beat comes out, try after try) is arranged again
   from the start with the next of the seed's own streams of dice (plan.attempt): still the same round for the same seed. */
export function planner(seed, o) {
  seed = Math.max(1, Math.floor(Number(seed) || 1));
  let attempt = 0,
    cur = round(seed, attempt, o);
  return {
    get plan() {
      return cur.plan;
    },
    get log() {
      return cur.log;
    },
    get done() {
      return cur.done;
    },
    run(ms) {
      const until = Date.now() + (ms ?? Infinity);
      for (;;) {
        try {
          return cur.run(until - Date.now());
        } catch (err) {
          if (!/could not be arranged/.test(String(err && err.message)) || attempt >= 4) throw err;
          cur = round(seed, ++attempt, o);
          if (Date.now() >= until) return { done: false, beats: 0, rebuilt: 0, attempt };
        }
      }
    }
  };
}
function round(seed, attempt, o) {
  o = Object.assign({ screen: true }, o);
  const rng = dice(seed * 7919 + 17 + attempt * 104729),
    men = menOf(rng),
    edge = rank(men[0].grade) - rank(men[1].grade),
    W = rng() < Math.max(0.15, Math.min(0.85, 0.5 + 0.12 * edge)) ? 0 : 1,
    L = 1 - W,
    span = hpOf(men[W].grade),
    hp = Math.round(span[0] + (span[1] - span[0]) * rng()),
    // (how many beats this round means to have, within SPAR.beats: the finish is tried from about there)
    aim = SPAR.beats[0] + 2 + Math.floor(rng() * (SPAR.beats[1] - SPAR.beats[0] - 4)),
    plan = { seed, attempt, men, hp, winner: W, beats: [], inputs: null, ko: null, stats: null },
    r = rehearsal(plan),
    used = new Map(),
    bad = new Map(), // (cards whose screens did not come out for this pair, how many times)
    screens = new Map(), // (what each screen found, this round)
    t0 = Date.now(),
    stats = { tries: 0, failed: {}, screens: 0, kept: 0, ms: 0, cards: {} },
    // (what became of each card this round: drawn, screened out, over the budget, too fine, tried and failed, kept)
    tally = (lib, what) => {
      const c = (stats.cards[lib.item] = stats.cards[lib.item] || {});
      c[what] = (c[what] || 0) + 1;
    };
  let phase = 'open',
    misses = 0,
    done = false,
    going = null; // (the beat being arranged: a generator, worked on a few dozen steps at a time)

  function commit(c, run, line, o2) {
    r.log.push(...run.inputs);
    used.set(c.lib.item, (used.get(c.lib.item) || 0) + 1);
    const steps = r.log.length;
    plan.beats.push(Object.assign({ i: plan.beats.length, id: c.lib.id, item: c.lib.item, kind: c.lib.kind, inside: tagsOf(c.lib).inside, body: tagsOf(c.lib).body, A: c.A, t: +run.from.toFixed(2), step: steps - run.inputs.length + run.walked, from: steps - run.inputs.length, to: steps, cover: !!c.cover, db: o2.db || 0, hp: r.bout.fighters.map(f => +f.hp.toFixed(1)) }, line));
  }

  /* one beat: the candidates, each screened (does it come out as its card does, at what timing, what does it do to each man)
     and the first that fits tried on the round's bout, at its timings, until one comes out as its card does */
  function* beat() {
    const n = plan.beats.length,
      hpNow = r.bout.fighters.map(f => f.hp),
      Lhp = hpNow[L],
      left = Math.max(1, aim - n - 1),
      // (what the loser has still to lose before the finish, and so about what each beat should take: at most a little over
      // twice that, the winner at most so much that he stays the stronger)
      owed = Math.max(0, Lhp - SPAR.zone),
      capL = owed <= 0 ? 1 : n >= aim ? Infinity : Math.max(1.5, (2.2 * owed) / left),
      capW = Math.max(1, (hpNow[W] - Lhp) / 3 + 1),
      need = owed <= 0 ? -1 : n >= aim || owed > 1.5 * left * 2.2 ? 2 : owed > 0.8 * left ? 1 : 0,
      last = plan.beats[n - 1],
      most = SPAR.beats[1] + Math.min(4, Math.floor(misses / 3));
    phase = n < SPAR.open ? 'open' : (owed <= 0 && n >= SPAR.beats[0] - 1) || n >= most - 1 ? 'finish' : 'middle';
    const list = draw(candidates(plan, phase, W, L, need, used, rng, last, bad), SPAR.tries.cards, rng);
    if (o.trace) o.trace(`beat ${n} ${phase} need ${need} L ${Lhp.toFixed(1)} caps ${capL.toFixed(1)}/${capW.toFixed(1)} stepped ${r.stepped} screened ${r.screened} rebuilt ${r.rebuilt}: ${list.map(c => c.lib.id).join(' ')}`);
    // (screened in the order drawn; in the finish, one that puts him down in its screen first, else the one that hurts him most)
    const ready = [];
    for (const c of list) tally(c.lib, 'drawn');
    for (const c of list) {
      const timed = critical(c.lib),
        est = timed ? estimate(plan, r, c.lib, c.A) : 0,
        s = o.screen && !trivial(c.lib) ? yield* screen(plan, r, c.lib, c.A, { cover: c.cover, est, timed }, screens) : { db: est, width: null, dmg: [0, 0], down: null };
      stats.screens++;
      if (!s) {
        stats.failed.screen = (stats.failed.screen || 0) + 1;
        tally(c.lib, 'screen');
        bad.set(c.lib.id + '|' + c.A, (bad.get(c.lib.id + '|' + c.A) || 0) + 1);
        continue;
      }
      if (s.down && !(phase === 'finish' && s.down.by === W && s.down.ok)) {
        stats.failed['down in screen'] = (stats.failed['down in screen'] || 0) + 1;
        continue;
      }
      // (a timing that works for one frame or two only is too fine to trust: the round's bout is not the screen's to the frame)
      if (timed && s.width < SPAR.tries.width) {
        stats.failed.narrow = (stats.failed.narrow || 0) + 1;
        tally(c.lib, 'narrow');
        continue;
      }
      if (phase !== 'finish' && (s.dmg[L] > capL || s.dmg[W] > capW || (need >= 2 && s.dmg[L] < 1 && rng() < 0.8))) {
        stats.failed.budget = (stats.failed.budget || 0) + 1;
        tally(c.lib, 'budget');
        continue;
      }
      ready.push({ c, s, timed, est });
      if (phase !== 'finish' || s.down) break;
    }
    if (phase === 'finish') ready.sort((x, y) => !!y.s.down - !!x.s.down || y.s.dmg[L] - x.s.dmg[L]);
    for (const { c, s, timed, est } of ready) {
      const finish = phase === 'finish' && s.down ? { by: W } : null,
        base = { cover: c.cover, finish, rest: rest(rng, phase === 'open' ? 1.5 : 1) },
        order = timed ? SPAR.tries.timing.map(d => s.db + d) : [s.db];
      // (a finisher that did not put him down in its screen is a beat that hurt him, if there is room for one)
      if (phase === 'finish' && !s.down && n >= most - 1) continue;
      for (const db of order) {
        stats.tries++;
        const count = { n: 0 },
          watch = SPAR.audit ? auditor() : null;
        if (watch) watch.begin({ id: c.lib.id });
        const run = yield* playBeat(r.bout, c.lib, c.A, Object.assign({}, base, { db, audit: watch }), count);
        r.stepped += count.n;
        const downed = run.events.some(x => x.e.type === 'hit' && x.e.down);
        let why = finish ? (downed ? judged(c.lib, run, c.A, 1 - c.A, base) || (r.bout.over === W ? null : 'wrong man down') : 'no knockdown') : judged(c.lib, run, c.A, 1 - c.A, Object.assign({}, base, { finish: null }));
        if (!why && !finish && r.bout.fighters.some(f => f.hp <= 0)) why = 'down';
        if (!why && watch) {
          const broke = Object.entries(watch.result().found).find(([name, x]) => x.bad > 0 && !BETWEEN.includes(name));
          if (broke) why = 'audit: ' + broke[0];
        }
        if (!why) {
          const line = lineOf(c.lib, c.A, 1 - c.A, run, base);
          tally(c.lib, 'kept');
          commit(c, run, line, { db });
          if (finish) {
            const blow = run.events.find(x => x.e.type === 'hit' && x.e.down).e;
            plan.ko = { t: +r.bout.overAt.toFixed(2), by: W, on: L, name: blow.name, J: blow.J, counter: !!blow.counter, out: blow.out || null, liver: !!blow.liver, beat: plan.beats.length - 1 };
            done = true;
          }
          return true;
        }
        stats.failed[why] = (stats.failed[why] || 0) + 1;
        tally(c.lib, 'tried');
        if (o.log) o.log.push({ beat: n, id: c.lib.id, A: c.A, db, est, width: s.width, why });
        yield* r.rebuild();
        if (!timed) break;
      }
    }
    return false;
  }

  function finishUp() {
    // (his fall: the bout goes on a while with nobody pressing anything)
    for (let k = 0; k < SPAR.tail / DT; k++) {
      step(r.bout, [{}, {}], DT);
      r.log.push([{}, {}]);
    }
    plan.inputs = r.log;
    plan.steps = r.log.length;
    plan.time = +plan.ko.t.toFixed(2);
    stats.ms = Date.now() - t0;
    stats.kept = plan.beats.length;
    plan.stats = Object.assign(stats, { rebuilt: r.rebuilt, replayed: r.replayed, stepped: r.stepped + r.log.length, screened: r.screened });
  }

  return {
    plan,
    // (the controls of the beats committed so far: final, whatever is tried after them)
    get log() {
      return r.log;
    },
    get done() {
      return done && !!plan.inputs;
    },
    // work on for about `ms` milliseconds (a few dozen steps of a bout at the least); -> where it has got to
    run(ms) {
      const until = Date.now() + (ms ?? Infinity);
      while (!this.done) {
        if (done) finishUp();
        else {
          const at = (going = going || beat()).next();
          if (at.done) {
            going = null;
            // (nothing came out: try again with new draws; the round may run a few beats longer for it)
            if (!at.value && ++misses > 24) throw new Error(`spar: round ${seed} could not be arranged`);
          }
        }
        if (Date.now() >= until) break;
      }
      return { done: this.done, beats: plan.beats.length, rebuilt: r.rebuilt };
    }
  };
}

export function planOf(seed, o) {
  const p = planner(seed, o);
  p.run();
  return p.plan;
}

/* ---- playing a round back: the plan's controls into a bout of its own, step by step (each(bout, k) after each step) -> the
   bout, and every event with the step it came on: [{ k, t, e }] */
export function replayOf(plan, each) {
  const bout = startOf(plan),
    events = [];
  plan.inputs.forEach((inp, k) => {
    step(bout, inp, DT);
    for (const e of bout.events) events.push({ k: k + 1, t: bout.t, e });
    /* (a weave and a shoulder roll both say { type: 'roll' }: the shoulder roll is the one that leaves him in f.roll, the
       technique's: kept apart as { type: 'shoulderRoll' } for gradedOf) */
    bout.fighters.forEach((f, who) => f.roll && f.roll.t === 0 && f.roll.at === bout.t && events.push({ k: k + 1, t: bout.t, e: { type: 'shoulderRoll', who } }));
    if (each) each(bout, k);
  });
  return { bout, events };
}
/* Does the round as played come out as its timeline says? Each beat's line made again from the events of its steps, the
   knockdown the plan's (the first and only one, on the finishing beat), and nothing done that the man's grade or loadout does
   not have. -> { lines: beats whose line differs, downs, ko (true if the knockdown is the plan's), graded: what a man did
   that he does not have } */
export function checkOf(plan, played) {
  const { events } = played || replayOf(plan),
    byId = new Map(library().map(l => [l.id, l])),
    lines = [];
  for (const b of plan.beats) {
    const lib = byId.get(b.id),
      run = { events: events.filter(x => x.k > b.step && x.k <= b.to) },
      again = lineOf(lib, b.A, 1 - b.A, run, { cover: b.cover });
    if (again.said !== b.said || again.what !== b.what || again.lead !== b.lead) lines.push({ i: b.i, plan: b.said, played: again.said });
  }
  const downs = events.filter(x => x.e.type === 'hit' && x.e.down),
    ko = !!plan.ko && downs.length === 1 && downs[0].e.who === plan.ko.by && Math.abs(downs[0].t - plan.ko.t) < 0.02 && downs[0].k > plan.beats[plan.ko.beat].step && downs[0].k <= plan.beats[plan.ko.beat].to;
  return { lines, downs: downs.length, ko, graded: gradedOf(plan, events) };
}
/* What each man did that his grade or his loadout does not have (none, as it should be): a technique's own event (the shell,
   the shift, the wave, the shoulder roll, the down parry), a technique a press was meant as, a show-off's trick or taunt, a foul. */
export function gradedOf(plan, events) {
  const out = [],
    man = i => plan.men[i],
    carries = (i, id) => man(i).techniques.includes(id) && opens(man(i).skills, id),
    tricks = i => {
      const v = LEVEL[man(i).grade].vary;
      return new Set(v ? [...(v.jab || []), ...(v.power || [])].map(x => x[0]) : []);
    },
    own = { shell: 'shell', shift: 'shift', wave: 'wave', shoulderRoll: 'rollCounter' };
  for (const { e, t } of events) {
    const who = e.type === 'parry' ? e.who : e.who;
    if (own[e.type] && !carries(who, own[e.type])) out.push({ t, who, what: e.type });
    if (e.type === 'parry' && e.down && !carries(e.who, 'parryDown')) out.push({ t, who: e.who, what: 'parryDown' });
    if (e.type === 'taunt' && !LEVEL[man(e.who).grade].stance.show) out.push({ t, who: e.who, what: 'taunt ' + e.name });
    if ((e.type === 'paw' || e.type === 'collar') && !tricks(e.who).has(e.type === 'paw' ? e.name : 'collar')) out.push({ t, who: e.who, what: e.type });
    if (e.type === 'foul' && !LEVEL[man(e.who).grade].form.dirty) out.push({ t, who: e.who, what: 'foul ' + e.name });
    if (['hit', 'block', 'whiff', 'graze'].includes(e.type) && e.variant && !tricks(e.who).has(e.variant)) out.push({ t, who: e.who, what: e.variant });
    if (e.type === 'punch' && e.name === 'flicker' && !tricks(e.who).has('flicker')) out.push({ t, who: e.who, what: 'flicker' });
  }
  return out;
}
export { library };

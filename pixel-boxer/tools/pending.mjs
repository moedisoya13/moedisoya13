#!/usr/bin/env node
/* The numbers the pending catalogue's comparison cards are told by (docs/pending-catalog.md §3.4): each variant card fought
   with its override in force (src/tune.mjs), and the same card without it, as the page fights them.
     node tools/pending.mjs                 printed
     node tools/pending.mjs --write         and written to src/pending.numbers.mjs (the rates of the matches below are kept
                                            from the file as they were unless they are measured again)
     node tools/pending.mjs --matches       the down parry in matches as well (slow: minutes, on every core there is)
     node tools/pending.mjs --matches --n 108   ... with 108 seeds as well as 36, to see whether a difference is noise
   What is measured:
     the liver hook   every grade's (src/measure.mjs rung: the blow, when it landed after the press, how fast the glove was going),
                      with MOVES.hookBody.land as it is and at the card's value; and the audit of the two cards with it
     the cross-arm    the guard of 4암 held up a second (the plan's way, tests/show.test.mjs shape()), as it is and as each
                      variant; the card fought as it is and as the plan's shape (variant 나): what became of the cross, how hard
                      and what met it, the rear forearm's lean as the page measures it, and the audit of the card
     the down parry   the guard put up on each frame from −2 to +5 against a jab from 1.0, 0.9 and 0.8 m (what became of it);
                      the four cards; and with --matches, how often in a match he presses a jab down: seeds 1000 + i × 7919,
                      3 rounds of 60 s, both men 50 at everything, he at { all: grade } carrying the down parry, the other man a
                      pro with his own loadout, the two sides swapped every other match, the jabs thrown at him counted against
                      the jabs he pressed down (a parry event: e.who parried it, e.on threw it), with the guard put up as the head
                      puts it now (the trunk's joint fired, on[2]), a joint sooner (on[1]) or two (the leg's, on[0]) */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { rung } from '../src/measure.mjs';
import { audit, SCRIPTS } from '../src/audit.mjs';
import { step, RULES } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { createMatch, stepMatch, nextRound } from '../src/game/match.mjs';
import { MOVES } from '../src/anim/moves.mjs';
import { CROSS, LEVEL } from '../src/anim/skill.mjs';
import { TECHNIQUES, gradeOf } from '../src/game/techniques.mjs';
import { fk } from '../src/rig/skeleton.mjs';
import * as M from '../src/rig/m3.mjs';
import { measure } from '../src/audit.mjs';
import { withTune, patchesOf, guardAt, rearTilt } from '../src/tune.mjs';
import { ITEMS, TUNES } from '../src/pending.data.mjs';
import { NUMBERS as WAS } from '../src/pending.numbers.mjs';

const DT = 1 / 60,
  root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  TABLES = { MOVES, CROSS, LEVEL, RULES, TECHNIQUES },
  args = process.argv.slice(2),
  flag = n => args.includes('--' + n),
  opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d),
  byId = Object.fromEntries(SCRIPTS.map(e => [e.id, e])),
  r1 = x => +(+x).toFixed(1);

// the script a card fights: the catalogue's, or the down parry's with the guard on another frame
const scriptOf = card => (card.guard !== undefined ? guardAt(byId[card.entry], card.guard, card.gap) : byId[card.entry]);
const cards = ITEMS.flatMap(i => (i.groups || []).flatMap(g => g.rows.flat())).filter(c => c.key);
const said = e => (e.type === 'parry' ? (e.down ? '눌러 내림' : '패리') : { hit: '명중', block: '막음', whiff: '빗나감', graze: '스침' }[e.type]);

/* One loop of a card, its override in force throughout (making the bout, every step): what became of the other man's punch
   (the last of his punches the boxer met), the boxer's first blow that landed, the guard's rear forearm while it is held. */
function fight(card) {
  return withTune(patchesOf(card.tune, TABLES), () => {
    const entry = scriptOf(card),
      bout = freshBout(entry),
      [a, b] = bout.fighters,
      out = { met: null, part: null, J: null, counter: null, tilt: [], events: [] };
    let held = 0;
    for (let i = 0; i < Math.round(entry.loop / DT); i++) {
      step(bout, drive(entry, bout, i * DT, DT), DT);
      b.hp = 1000;
      if (!entry.hurt) a.hp = 1000;
      for (const e of bout.events) {
        out.events.push({ ...e });
        const by = e.type === 'parry' ? e.on : e.who;
        if (by === 1 && said(e)) (out.met = e.type === 'parry' ? (e.down ? 'down' : 'parry') : e.type), (out.said = said(e)), (out.J = e.J === undefined ? null : r1(e.J)), (out.part = e.part || null);
        if (e.who === 0 && e.type === 'hit' && out.counter === null) out.counter = r1(e.J);
      }
      held = a.cover ? held + DT : 0;
      if (held >= 0.3 - 1e-9) out.tilt.push(rearTilt(a));
    }
    out.tilt = out.tilt.length ? r1(out.tilt.reduce((s, x) => s + x, 0) / out.tilt.length) : null;
    return out;
  });
}

// the audit of a card's script with its override in force: frames broken, by check
function audited(card) {
  return withTune(patchesOf(card.tune, TABLES), () => {
    const { found } = audit([scriptOf(card)]),
      bad = Object.entries(found).filter(([, c]) => c.bad);
    return { bad: bad.reduce((s, [, c]) => s + c.bad, 0), checks: bad.map(([k, c]) => `${k} ${c.bad} (${+c.worst.value.toFixed(1)})`) };
  });
}

/* The cross-arm guard held up a second, standing 1.0 m from the other man (tests/show.test.mjs shape(), docs/pending-catalog.md
   §6.6): averaged over the last half second of it. cm and degrees. */
function shape(tune) {
  return withTune(patchesOf(tune, TABLES), () => {
    const bout = freshBout({ me: () => [0, 0], him: () => [1.0, 0], setup: b => (b.fighters[0].skills = { all: '4a' }) }),
      a = bout.fighters[0],
      seen = [];
    for (let i = 0; i < 90; i++) {
      step(bout, [{ cover: i > 10 }, {}], DT);
      if (i < 60) continue;
      const { R, p } = fk(a.pose),
        head = M.add(p.Head, M.app(R.Head, [0, 0.1, 0.02])),
        glove = S => M.add(p[S + 'Hand'], M.scale(M.sub(p[S + 'Hand'], p[S + 'ForeArm']), 0.075 / Math.hypot(...M.sub(p[S + 'Hand'], p[S + 'ForeArm'])))),
        L = glove('Left'),
        Rg = glove('Right'),
        fore = M.sub(L, p.LeftForeArm),
        angles = measure(a).angles;
      seen.push({
        tilt: rearTilt(a),
        rearDist: Math.hypot(...M.sub(Rg, head)) * 100,
        rearUnder: (head[1] - Rg[1]) * 100,
        rearGloveY: Rg[1] * 100,
        rearElbowY: p.RightForeArm[1] * 100,
        level: (Math.atan2(fore[1], Math.hypot(fore[0], fore[2])) * 180) / Math.PI,
        leadY: L[1] * 100,
        zone: Math.max(0, ...['Left', 'Right'].map(S => angles[S + 'ShoulderZone'] + angles[S + 'ShoulderTurned']))
      });
    }
    return Object.fromEntries(Object.keys(seen[0]).map(k => [k, r1(seen.reduce((t, f) => t + f[k], 0) / seen.length)]));
  });
}

/* ---- the down parry in matches */
const CONTROL = {
  now: null,
  on1: s => ({ cover: !!s.coming && !!s.coming.chain.on[1], tech: 'parryDown' }),
  on0: s => ({ cover: !!s.coming && !!s.coming.chain.on[0], tech: 'parryDown' }),
  // (the plan's: a legend reads it off the leg, everyone else as now; for a 5명 it is on0 exactly)
  legend: s => ({ cover: gradeOf(s.me.skills, 'parryDown').grade === 5 ? !!s.coming && !!s.coming.chain.on[0] : s.soon, tech: 'parryDown' })
};
function rate(lv, mode, n) {
  const tune = CONTROL[mode] ? [[TECHNIQUES.parryDown.answer, 'control', CONTROL[mode]]] : [];
  return withTune(tune, () => {
    const out = { lv, mode, n, jabs: 0, chosen: 0, downs: 0, parries: 0, up: {}, res: {} };
    for (let i = 0; i < n; i++) {
      const me = i % 2,
        skills = [{}, {}],
        techniques = [undefined, undefined];
      skills[me] = { all: lv };
      techniques[me] = ['parryDown'];
      const m = createMatch({ seed: 1000 + i * 7919, skills, techniques, rounds: 3, roundTime: 60 });
      let cur = null,
        guard = 0;
      while (m.phase !== 'over' && guard++ < 60 * 60 * 10) {
        if (m.phase === 'break') {
          nextRound(m);
          continue;
        }
        const f = m.bout.fighters[me],
          brain = m.brains[me],
          wasCover = f.cover;
        stepMatch(m, DT);
        for (const e of m.bout.events) {
          if (e.type === 'punch' && e.who === 1 - me && e.name === 'jab') (out.jabs++, (cur = { t: 0, chosen: false, up: null }));
          if (e.type === 'parry' && e.who === me) {
            e.down ? out.downs++ : out.parries++;
            if (cur && cur.chosen) cur.res = e.down ? 'down' : 'parry';
          }
          if (cur && cur.chosen && !cur.res && e.who === 1 - me && ['hit', 'block', 'whiff'].includes(e.type)) cur.res = e.type;
        }
        if (cur) {
          // (the head chose the down parry for it; the frame its guard went up meant as it, counted from the jab's press)
          if (brain.answer === 'parryDown' && !cur.chosen) (cur.chosen = true), out.chosen++, (cur.coverBefore = wasCover);
          if (cur.chosen && cur.up === null && f.pat) cur.up = cur.t;
          cur.t++;
          if (cur.t > 30) {
            if (cur.chosen) {
              const k = cur.up === null ? (cur.coverBefore ? 'already' : 'never') : String(cur.up);
              out.up[k] = (out.up[k] || 0) + 1;
              out.res[cur.res || 'none'] = (out.res[cur.res || 'none'] || 0) + 1;
            }
            cur = null;
          }
        }
      }
    }
    out.per100 = r1((100 * out.downs) / out.jabs);
    return out;
  });
}
// every (grade, timing, seeds) fought in a process of its own, as many at once as there are cores
function rates(jobs) {
  const cores = Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length)),
    results = [];
  let next = 0;
  return new Promise((resolve, reject) => {
    let running = 0;
    const launch = () => {
      if (next >= jobs.length && !running) return resolve(results);
      while (running < cores && next < jobs.length) {
        const [lv, mode, n] = jobs[next++];
        running++;
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--rate', lv, mode, String(n)], { stdio: ['ignore', 'pipe', 'inherit'] });
        let text = '';
        child.stdout.on('data', d => (text += d));
        child.on('exit', code => {
          running--;
          if (code) return reject(new Error(`rate ${lv} ${mode} ${n} exited ${code}`));
          results.push(JSON.parse(text));
          process.stderr.write(`  ${lv} ${mode} ×${n}: ${results[results.length - 1].per100} per 100 jabs\n`);
          launch();
        });
      }
    };
    launch();
  });
}

if (flag('rate')) {
  const i = args.indexOf('--rate');
  process.stdout.write(JSON.stringify(rate(args[i + 1], args[i + 2], Number(args[i + 3]))));
  process.exit(0);
}

/* ---- measure */
const t0 = performance.now(),
  out = { cards: {}, audit: {} };

// the liver hook, every grade, as it is and at the card's land
out.liver = { land: TUNES.land[0][3], ladder: {} };
for (const lv of ['1', '2', '3', '4m', '4a', '5m', '5a']) {
  const take = r => ({ J: r1(r.J), ms: r.ms, speed: r1(r.speed), type: r.type });
  out.liver.ladder[lv] = { now: take(rung(`hookBody@${lv}`)), tuned: withTune(patchesOf(TUNES.land, TABLES), () => take(rung(`hookBody@${lv}`))) };
}
// the cross-arm guard's shape, as it is and as each variant
out.cross = { shape: { now: shape(null), glove: shape(TUNES.glove), upright: shape(TUNES.upright) } };
// the down parry: the guard on each frame, from each distance
out.parryDown = Object.assign({}, WAS.parryDown || {}, { frames: {} });
for (const lv of ['4m', '5m']) {
  out.parryDown.frames[lv] = {};
  for (const gap of ['1.0', '0.9', '0.8'])
    out.parryDown.frames[lv][gap] = [-2, 0, 1, 2, 3, 4, 5].map(fr => fight({ entry: `parryDown@${lv}`, guard: fr, gap: Number(gap) }).met || 'none');
}
// every card that has a key: fought one loop, as the page fights it
for (const card of cards) {
  const f = fight(card),
    o = { met: f.met, said: f.said || null, J: f.J, part: f.part, counter: f.counter };
  if (card.kind === 'liver') {
    const r = withTune(patchesOf(card.tune, TABLES), () => rung(card.entry));
    Object.assign(o, { J: r1(r.J), ms: r.ms, speed: r1(r.speed), type: r.type });
  }
  if (card.kind === 'cross') o.tilt = f.tilt;
  if (card.kind === 'pd') o.guard = card.guard;
  out.cards[card.key] = o;
  if (card.kind === 'cross' || card.kind === 'liver') out.audit[card.key] = audited(card);
}

if (flag('matches')) {
  const n = Number(opt('n', 36)),
    jobs = [];
  for (const lv of ['4m', '5m']) for (const mode of ['now', 'on1', 'on0']) jobs.push([lv, mode, 36]);
  if (n !== 36) for (const lv of ['4m', '5m']) for (const mode of ['now', 'on0']) jobs.push([lv, mode, n]);
  console.error(`fighting ${jobs.reduce((s, j) => s + j[2], 0)} matches...`);
  const done = await rates(jobs);
  out.parryDown.n = 36;
  out.parryDown.per100 = {};
  out.parryDown.detail = {};
  for (const r of done) {
    const at = r.n === 36 ? 'per100' : 'n' + r.n;
    (out.parryDown[at] = out.parryDown[at] || {})[r.lv] = Object.assign((out.parryDown[at] || {})[r.lv] || {}, { [r.mode]: r.per100 });
    if (r.n === 36) out.parryDown.detail[`${r.lv}.${r.mode}`] = { jabs: r.jabs, chosen: r.chosen, downs: r.downs, up: r.up, res: r.res };
  }
}

/* ---- print */
const pad = (s, n) => String(s).padEnd(n);
console.log(`liver hook (MOVES.hookBody.land ${MOVES.hookBody.land} -> ${out.liver.land}): N s · ms after the press · m/s`);
for (const [lv, r] of Object.entries(out.liver.ladder)) console.log(`  ${pad(lv, 3)} ${pad(`${r.now.J} · ${r.now.ms} · ${r.now.speed}`, 22)} -> ${r.tuned.J} · ${r.tuned.ms} · ${r.tuned.speed}`);
console.log('cross-arm 4암, the guard held up a second (tilt °, rear glove to head cm, under it cm, rear glove y, rear elbow y, lead forearm °, lead glove y, shoulder zone):');
for (const [k, s] of Object.entries(out.cross.shape)) console.log(`  ${pad(k, 8)} ${Object.values(s).join(' · ')}`);
console.log('down parry, the guard on frame −2 / 0 / +1 / +2 / +3 / +4 / +5:');
for (const [lv, g] of Object.entries(out.parryDown.frames)) for (const [gap, r] of Object.entries(g)) console.log(`  ${lv} ${gap} m  ${r.join(' / ')}`);
console.log('cards:');
for (const [k, o] of Object.entries(out.cards)) console.log(`  ${pad(k, 18)} ${JSON.stringify(o)}${out.audit[k] ? `  audit: ${out.audit[k].bad} broken${out.audit[k].checks.length ? ' ' + out.audit[k].checks.join('; ') : ''}` : ''}`);
if (out.parryDown.per100) console.log('down parry in matches, per 100 jabs:', JSON.stringify({ n36: out.parryDown.per100, n108: out.parryDown.n108 }));
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);

if (flag('write')) {
  const file = path.join(root, 'src/pending.numbers.mjs');
  writeFileSync(
    file,
    `/* Written by node tools/pending.mjs --write (with --matches for the down parry's rates in matches): what the pending
   catalogue's comparison cards measure, each variant fought with its override in force (src/tune.mjs) and without it. The
   page writes these as each card's expected numbers, beside what the card it is fighting shows. Measured, not written by
   hand: run the tool again after changing anything in the game that the cards fight with. */
export const NUMBERS = ${JSON.stringify(out)};
`
  );
  console.log('written', path.relative(root, file));
}

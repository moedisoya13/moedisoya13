#!/usr/bin/env node
/* The combinations, measured (docs/combos-plan.md §2, §9.2): what each combination of the catalogue (src/combos.mjs) does at
   every grade that knows it, and what the head throws in seeded bouts. Nothing here changes the game.
     node tools/combos.mjs [--rows]             each combination and grade, pressed by name the step after the beat before
                                                landed (as soon as the chain takes it: the fastest the engine allows), at a
                                                pro who stands with his guard down and is held where he stands (no blow moves
                                                him), from 0.985 m: for each beat, from the one before landing to it landing
                                                (ms, the held moment of a blow counted), the impulse (N·s), what became of it
                                                (and what met it), and metres apart then; under each combination, from the
                                                first press to the last landing, and metres apart once it is all home
       --free                                   the other man not held: knocked back, he walks back to his spot
       --guard                                  his guard up
       --clock                                  pressed as the head presses now: 0.2 s after a jab was pressed, 0.3 s after
                                                anything else, landed or not (and the other man not held, as in §2.3)
       --cards                                  the catalogue's own cards, as the page fights them (src/combos.mjs: pressed at
                                                the grade's tempo, his guard up, not held, from each row's own distance)
       --cards --arrival                        and pressed by the plan's rule (§7.4: less how long the punch takes to reach
                                                all the way out), not by how long it took to land
       --from m                                 started this far apart (centre to centre) instead
       --only id,id                             only these combinations
       --every                                  at all seven grades, whether the grade knows the combination or not
     The times are on the clock of the steps, sixty a second, the held moment of a blow counted, and in brackets on the
     bout's own clock, which stands still in it (the plan's tables of now, §2.2, are on the bout's clock; --wall leaves the
     brackets out).
     node tools/combos.mjs --census [--n 6]     seeded bouts, n a grade (both corners that grade at everything, every
                                                attribute 50, the corner's plan `steady` all through, the loadout their grades
                                                give them, seeds 1000 + 7919 k, three rounds of a minute): each man's punches
                                                strung together (each pressed within 0.6 s of the one before), counted by the
                                                article's numbers (1 jab, 2 cross, 3 lead hook, 4 rear hook, 6 rear uppercut;
                                                b to the body, 1f a show-off's flicker), what became of them (none: cut short
                                                by a blow), the knockdowns and how each bout ended
       --root dir                               the scripts and the game of the checkout at dir (to compare with an older one)
     node tools/combos.mjs --write              the cards' flights (frames from each beat's press to it landing, as the card
                                                throws it) into src/combos.numbers.mjs, for the cards to press by
     --json                                     everything, for another tool */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2),
  flag = n => args.includes('--' + n),
  opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const DT = 1 / 60;
const root = resolve(opt('root', new URL('..', import.meta.url).pathname)),
  src = f => import(pathToFileURL(resolve(root, 'src', f)).href);

// the article's numbers: the short punches are the 3 and the 6 too, and a punch to the body is its number and b
const NUMBER = { jab: '1', flicker: '1f', cross: '2', hook: '3', hookIn: '3', shiftHook: '3b', hookR: '4', upperL: '5', upper: '6', upperIn: '6', jabBody: '1b', crossBody: '2b', hookBody: '3b', upperBody: '6b', upperBodyL: '5b' };
const SAID = { hit: 'hit', block: 'block', graze: 'graze', whiff: 'whiff', parry: 'parry' };
const ms = s => Math.round(s * 1000);

/* ---- one combination, fought once as its script says: its beats (combos.mjs tally) and where the two stood */
async function fighter() {
  const { tally } = await src('combos.mjs'),
    { freshBout, drive } = await src('footwork.mjs'),
    { step } = await src('game/bout.mjs');
  return e => {
    const bout = freshBout(e),
      m = { want: e.beats.length };
    for (let tick = 0; tick < Math.round(e.loop / DT); tick++) {
      step(bout, drive(e, bout, tick * DT, DT), DT);
      bout.fighters[1].hp = 1000;
      bout.fighters[0].hp = 1000;
      tally(m, bout, (tick + 1) * DT);
    }
    return m;
  };
}
async function rows() {
  const { COMBO_ROWS, COMBO_LEVELS, comboScript } = await src('combos.mjs'),
    fight = await fighter();
  const only = opt('only') ? opt('only').split(',') : null,
    from = opt('from') ? Number(opt('from')) : undefined,
    cards = flag('cards'),
    o = cards ? { arrival: flag('arrival') } : { press: flag('clock') ? 'clock' : 'fast', guard: flag('guard'), pinned: !flag('free') && !flag('clock'), from: from ?? 0.985, named: true },
    out = [];
  if (cards && from !== undefined) o.from = from;
  for (const row of COMBO_ROWS) {
    if (only && !only.includes(row.id)) continue;
    const r = { id: row.id, grades: {} };
    for (const lv of flag('every') ? COMBO_LEVELS : row.levels) {
      const m = fight(comboScript(row, lv, Object.assign({ loop: (cards ? 0 : 1) + comboScript(row, lv).loop }, o)));
      r.grades[lv] = {
        beats: m.beats.map((x, i) => ({ name: x.name, gap: i && x.t !== undefined && m.beats[i - 1].t !== undefined ? ms(x.t - m.beats[i - 1].t) : null, bgap: i && x.t !== undefined && m.beats[i - 1].t !== undefined ? ms(x.bt - m.beats[i - 1].bt) : null, flight: x.t !== undefined ? ms(x.t - x.at) : null, bflight: x.t !== undefined ? ms(x.bt - x.bat) : null, J: x.J === undefined ? null : +x.J.toFixed(1), type: x.type || null, part: x.part, zone: x.zone, apart: x.apart === undefined ? null : +x.apart.toFixed(3) })),
        whole: m.beats.length && m.beats[m.beats.length - 1].t !== undefined ? +(m.beats[m.beats.length - 1].t - m.beats[0].at).toFixed(3) : null,
        breath: m.breath === undefined ? null : Math.round(m.breath * 100),
        apart: m.apart === undefined ? null : +m.apart.toFixed(2)
      };
    }
    out.push(r);
  }
  return { how: cards ? `cards${o.arrival ? ', pressed by how long each punch takes to reach all the way out' : ''}` : o.press + (o.pinned ? ', held' : ', free') + (o.guard ? ', guard up' : ', guard down') + `, from ${o.from}`, rows: out };
}

/* ---- the cards' flights: each card fought with the plan's rule first (how long the punch takes to reach all the way out),
   then again with how long each beat did take to land, and again, until they come round to what they were (it lands sooner
   on a guard than all the way out, and a beat pressed later meets the guard somewhere else); of those it went round, the
   ones that land each beat nearest its tempo are kept. Or, where the exchange from there is not clean (the bout scores a glove
   on a head and nothing else, so an arm can pass through the other man's, and a cross pressed into the end of a hook can
   put the shoulder past where it goes: src/audit.mjs holds every card to neither happening), the nearest that is: a beat
   pressed a frame sooner or later, one beat and then two (as tools/windows.mjs passes over a defence's frames). Those passed
   over are written down (unclean), and a card none of whose near ones is clean keeps its own and says so. */
async function write() {
  const { COMBO_ROWS, comboScript } = await src('combos.mjs'),
    { gapOf } = await src('game/combos.data.mjs'),
    { audit } = await src('audit.mjs'),
    fight = await fighter(),
    flights = {},
    unclean = {},
    round = [],
    dirty = [];
  // (how far off its tempo each beat landed, frames, all told)
  const offOf = (e, m, lv) => m.beats.reduce((s, x, k) => s + (k && x.t !== undefined && m.beats[k - 1].t !== undefined ? Math.abs(x.t - m.beats[k - 1].t - gapOf(e.beats[k - 1], e.beats[k], lv)) / DT : k ? 99 : 0), 0),
    clean = e => !Object.values(audit([e]).found).some(c => c.bad);
  for (const row of COMBO_ROWS)
    for (const lv of row.levels) {
      const tried = [];
      let f = null;
      for (let i = 0; i < 8; i++) {
        const e = comboScript(row, lv, f ? { flights: f } : { arrival: true }),
          m = fight(e),
          next = m.beats.map((x, k) => (k === 0 || x.bt === undefined ? null : Math.round((x.bt - x.bat) / DT)));
        if (f) tried.push({ f, off: offOf(e, m, lv) });
        if (tried.some(x => JSON.stringify(x.f) === JSON.stringify(next))) break;
        f = next;
      }
      let best = tried.reduce((a, b) => (b.off < a.off - 1e-9 ? b : a));
      if (tried.length > 1) round.push(`${row.id}@${lv}`);
      if (!clean(comboScript(row, lv, { flights: best.f }))) {
        // (a frame either way on one beat, and then on two)
        const n = best.f.length,
          one = [],
          two = [];
        for (let k = 1; k < n; k++) for (const d of [-1, 1]) one.push(best.f.map((x, j) => (j === k ? x + d : x)));
        for (let k = 1; k < n; k++) for (let j = k + 1; j < n; j++) for (const d of [-1, 1]) for (const g of [-1, 1]) two.push(best.f.map((x, i) => (i === k ? x + d : i === j ? x + g : x)));
        const passed = [best.f];
        let found = null;
        for (const set of [one, two]) {
          const ok = set
            .map(c => {
              const e = comboScript(row, lv, { flights: c });
              return { f: c, off: offOf(e, fight(e), lv), e };
            })
            .sort((a, b) => a.off - b.off)
            .filter(c => (clean(c.e) ? true : (passed.push(c.f), false)));
          if (ok.length) {
            found = ok[0];
            break;
          }
        }
        if (found) (unclean[`${row.id}@${lv}`] = passed.filter(p => JSON.stringify(p) !== JSON.stringify(found.f))), (best = found);
        else dirty.push(`${row.id}@${lv}`);
      }
      flights[`${row.id}@${lv}`] = best.f;
    }
  const fs = await import('node:fs'),
    file = resolve(root, 'src', 'combos.numbers.mjs');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/export const FLIGHTS = [^\n]*\n/, `export const FLIGHTS = ${JSON.stringify(flights)};\n`).replace(/export const UNCLEAN = [^\n]*\n/, `export const UNCLEAN = ${JSON.stringify(unclean)};\n`));
  console.log(`wrote ${Object.keys(flights).length} cards' flights to ${file}${round.length ? `; took more than one round: ${round.join(', ')}` : ''}${Object.keys(unclean).length ? `; passed over as not clean: ${JSON.stringify(unclean)}` : ''}${dirty.length ? `; NOT CLEAN, no near flights that are: ${dirty.join(', ')}` : ''}`);
}

/* ---- seeded bouts: what the head strings together, grade by grade */
async function census() {
  const { createMatch, stepMatch, nextRound } = await src('game/match.mjs'),
    { PLANS } = await src('game/brain.mjs'),
    { blank } = await src('game/profile.mjs'),
    { LEVELS } = await src('anim/skill.mjs'),
    n = Number(opt('n', 6)),
    out = {};
  for (const lv of LEVELS) {
    const g = (out[lv] = { bouts: n, strings: 0, counts: {}, results: {}, downs: 0, ends: {}, lengths: {} });
    for (let k = 0; k < n; k++) {
      const match = createMatch({ seed: 1000 + 7919 * k, sheets: [blank(), blank()], skills: [{ all: lv }, { all: lv }], rounds: 3, roundTime: 60 }),
        // (each man's string so far: [{ name, at, type }], and the punch of his still to land: a punch cut short, by a blow
        // that stops him, says nothing, and the next one he starts is the one the next outcome is of)
        open = [[], []],
        waiting = [null, null];
      const close = who => {
        const s = open[who];
        if (!s.length) return;
        const code = s.map(p => NUMBER[p.name] || p.name).join('-');
        g.strings++;
        g.counts[code] = (g.counts[code] || 0) + 1;
        g.lengths[s.length] = (g.lengths[s.length] || 0) + 1;
        const res = (g.results[code] = g.results[code] || {});
        for (const p of s) res[p.type || 'none'] = (res[p.type || 'none'] || 0) + 1;
        open[who] = [];
      };
      let guard = 0;
      while (match.phase !== 'over' && guard++ < 60 * 60 * 60) {
        if (match.phase === 'break') {
          [0, 1].forEach(close);
          nextRound(match, [PLANS.steady, PLANS.steady]);
          continue;
        }
        stepMatch(match, DT);
        const t = match.bout.t;
        for (const e of match.events) {
          if (e.type === 'punch') {
            const s = open[e.who];
            if (s.length && t - s[s.length - 1].at > 0.6 + 1e-9) close(e.who);
            const p = { name: e.name, at: t, type: null };
            open[e.who].push(p);
            waiting[e.who] = p;
          } else if (['hit', 'block', 'graze', 'whiff', 'parry'].includes(e.type)) {
            const who = e.type === 'parry' ? e.on : e.who,
              p = waiting[who];
            if (p) (p.type = e.type), (waiting[who] = null);
          } else if (e.type === 'down') g.downs++;
        }
      }
      [0, 1].forEach(close);
      const r = match.result;
      g.ends[r.how] = (g.ends[r.how] || 0) + 1;
    }
  }
  return out;
}

/* ---- printed */
function printRows(r) {
  const clock = flag('wall');
  console.log(`${r.how}. Each beat: from the one before landing to this one (ms; in brackets, on the bout's clock, which stands still in the held moment of a blow) / impulse (N·s) / what became of it / metres apart then.`);
  for (const row of r.rows) {
    const lvs = Object.keys(row.grades),
      n = Math.max(...lvs.map(lv => row.grades[lv].beats.length));
    console.log(`\n${row.id}`.padEnd(18) + lvs.map(lv => lv.padStart(26)).join(''));
    for (let i = 0; i < n; i++) {
      const cell = lv => {
        const x = row.grades[lv].beats[i];
        if (!x) return '–';
        const what = x.type ? SAID[x.type] + (x.type === 'block' && x.part && x.part !== 'glove' ? '/' + x.part : '') : '–';
        return `${x.gap ?? x.flight ?? '–'}${clock ? '' : `(${x.bgap ?? x.bflight ?? '–'})`} ${x.J === null ? '–' : Math.round(x.J)} ${what} ${x.apart === null ? '–' : x.apart.toFixed(2)}`;
      };
      const name = row.grades[lvs[lvs.length - 1]].beats[i] ? row.grades[lvs[lvs.length - 1]].beats[i].name : '';
      console.log(`  ${String(i + 1)} ${name}`.padEnd(18) + lvs.map(lv => cell(lv).padStart(26)).join(''));
    }
    console.log('  all, s / end m'.padEnd(18) + lvs.map(lv => `${row.grades[lv].whole ?? '–'} / ${row.grades[lv].apart ?? '–'}`.padStart(26)).join(''));
    console.log('  breath %'.padEnd(18) + lvs.map(lv => String(row.grades[lv].breath ?? '–').padStart(26)).join(''));
  }
  console.log('\n(the first beat: from the press to it landing, ms)');
}
function printCensus(c) {
  const lvs = Object.keys(c),
    watch = ['1', '1-1', '2', '1-2', '1-1-2', '1-2-3', '2-3', '2-3-6', '1-2-3-2', '1-6-3-2', '2-3-2'],
    col = v => String(v).padStart(8);
  console.log(`seeded bouts, ${c[lvs[0]].bouts} a grade: strings of punches (each pressed within 0.6 s of the one before), by the article's numbers`);
  console.log(''.padEnd(26) + lvs.map(col).join(''));
  console.log('strings'.padEnd(26) + lvs.map(lv => col(c[lv].strings)).join(''));
  console.log('one punch alone'.padEnd(26) + lvs.map(lv => col(Math.round((100 * (c[lv].lengths[1] || 0)) / c[lv].strings) + '%')).join(''));
  console.log('three or more'.padEnd(26) + lvs.map(lv => col(Math.round((100 * Object.entries(c[lv].lengths).filter(([k]) => +k >= 3).reduce((s, [, v]) => s + v, 0)) / c[lv].strings) + '%')).join(''));
  console.log('four or more'.padEnd(26) + lvs.map(lv => col(Math.round((100 * Object.entries(c[lv].lengths).filter(([k]) => +k >= 4).reduce((s, [, v]) => s + v, 0)) / c[lv].strings) + '%')).join(''));
  for (const code of watch) console.log(code.padEnd(26) + lvs.map(lv => col(c[lv].counts[code] || 0)).join(''));
  const body = lv => Object.entries(c[lv].counts).filter(([k]) => k.includes('b')).reduce((s, [, v]) => s + v, 0);
  console.log('with a body punch'.padEnd(26) + lvs.map(lv => col(body(lv))).join(''));
  console.log('knockdowns'.padEnd(26) + lvs.map(lv => col(c[lv].downs)).join(''));
  console.log('ends'.padEnd(26) + lvs.map(lv => col(Object.entries(c[lv].ends).map(([k, v]) => `${k}${v}`).join(' '))).join(''));
  console.log('\nwhat became of the punches of each (hit / block / graze / whiff / parry / cut short):');
  for (const code of ['1-2', '1-1-2', '2-3', '2-3-6', '1-2-3'])
    console.log(code.padEnd(26) + lvs.map(lv => ((r) => (r ? ['hit', 'block', 'graze', 'whiff', 'parry', 'none'].map(k => r[k] || 0).join('/') : '–'))(c[lv].results[code]).padStart(16)).join(''));
  console.log('\nthe most frequent, grade by grade:');
  for (const lv of lvs) console.log(`  ${lv.padEnd(3)} ` + Object.entries(c[lv].counts).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', '));
}

if (flag('write')) await write();
else if (flag('census')) {
  const c = await census();
  if (flag('json')) console.log(JSON.stringify(c));
  else printCensus(c);
} else {
  const r = await rows();
  if (flag('json')) console.log(JSON.stringify(r));
  else printRows(r);
}

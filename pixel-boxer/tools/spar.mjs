#!/usr/bin/env node
/* 한 라운드 스파링, from the command line (src/spar/plan.mjs; docs/spar.md):
     node tools/spar.mjs --seed 7          one round: the men, the timeline as arranged, the round played back (its events), the
                                           knockdown, whether every beat came out as its line says, and the audit of it
     node tools/spar.mjs --seeds 1-100     a summary over many rounds: length, beats, kept promises, variety, what never comes
                                           and why, how long arranging takes, and the held audit checks the played rounds break
       --no-audit                          leave the audit out (it doubles the time); the audit runs up to the knockdown
       --refuse | --refuse=no              the rehearsal refuses a beat that breaks a held check of a man's own body, or not
                                           (SPAR.audit)
       --json <file>                       and every round's numbers written there */
import { writeFileSync } from 'node:fs';
import { planOf, replayOf, checkOf, library, SPAR } from '../src/spar/plan.mjs';
import { leftOut, punchName } from '../src/spar/cards.mjs';
import { auditor } from '../src/audit.mjs';
import { LEVEL } from '../src/anim/skill.mjs';
import { TECHNIQUES } from '../src/game/techniques.mjs';
import { COMBOS } from '../src/game/combos.data.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const audit = !process.argv.includes('--no-audit');
// (--refuse: the rehearsal refuses a beat that breaks a held check of a man's own body, SPAR.audit; --refuse=no: it does not)
if (process.argv.includes('--refuse')) SPAR.audit = true;
if (process.argv.includes('--refuse=no')) SPAR.audit = false;
const CORNER = ['빨강', '파랑'];
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// (the checks of a man's own body, and those between the two men: a contact off the cards' distances is a known limit)
import { BETWEEN } from '../src/spar/plan.mjs';

function one(seed) {
  const t0 = Date.now(),
    plan = planOf(seed),
    ms = Date.now() - t0,
    a = audit ? auditor() : null;
  if (a) a.begin({ id: `spar#${seed}` });
  // (the audit up to the knockdown: what his fall does after it is the fall's, phys/fall.mjs, held by the catalogue's own cards)
  const played = replayOf(plan, a ? (bout, k) => bout.over === null && a.frame(bout, k) : null),
    check = checkOf(plan, played),
    found = a ? a.result().found : {},
    broken = Object.entries(found).filter(([, c]) => c.bad > 0).map(([name, c]) => ({ name, bad: c.bad, worst: c.worst && +c.worst.value.toFixed(2), between: BETWEEN.includes(name) }));
  return { seed, plan, ms, played, check, broken };
}

function show(r) {
  const { plan, check } = r;
  console.log(`대련 #${plan.seed}${plan.attempt ? ` (짠 차례 ${plan.attempt + 1})` : ''}: ${CORNER[0]} ${LEVEL[plan.men[0].grade].label} [${plan.men[0].techniques.join(', ')}] 대 ${CORNER[1]} ${LEVEL[plan.men[1].grade].label} [${plan.men[1].techniques.join(', ')}]`);
  console.log(`  시작 체력 둘 다 ${plan.hp} · 이기는 쪽 ${CORNER[plan.winner]} · 공방 ${plan.beats.length} · KO ${clock(plan.ko.t)} (${plan.ko.t} s) · 짜는 데 ${r.ms} ms`);
  console.log('  타임라인 (리허설에서 나온 그대로):');
  for (const b of plan.beats) console.log(`   ${clock(b.t).padStart(5)} ${CORNER[b.lead]} ${b.what} → ${b.answer} · ${b.said}   [${b.id}${b.cover ? ', 가드' : ''}${b.db ? `, ${b.db > 0 ? '+' : ''}${b.db}f` : ''}] 체력 ${b.hp.join('/')}`);
  const ko = plan.ko;
  console.log(`  KO: ${CORNER[ko.by]} ${punchName(ko.name)} ${ko.J} N·s${ko.counter ? ' (카운터)' : ''}${ko.out ? ` · 실신 ${ko.out}` : ko.liver ? ' · 리버' : ''} · ${ko.beat + 1}번째 공방`);
  if (process.argv.includes('--events')) {
    console.log('  사건 (다시 돌린 시합):');
    for (const { t, e } of r.played.events) if (['hit', 'block', 'parry', 'whiff', 'graze', 'punch', 'slip', 'duck', 'roll', 'pull', 'dash', 'taunt', 'shift', 'wave', 'shell', 'foul'].includes(e.type)) console.log(`   ${t.toFixed(2).padStart(6)} ${CORNER[e.who] || ''} ${e.type} ${e.name || ''}${e.J !== undefined ? ' ' + e.J : ''}${e.down ? ' DOWN' : ''}`);
  }
  console.log(`  다시 돌려 본 결과: 줄이 다른 공방 ${check.lines.length} · 다운 ${check.downs} · KO가 약속대로 ${check.ko ? '예' : '아니오'} · 등급에 없는 동작 ${check.graded.length}`);
  for (const l of check.lines) console.log(`   ! ${l.i}: ${l.plan} | ${l.played}`);
  if (audit) console.log(`  점검(audit): ${r.broken.length ? r.broken.map(b => `${b.name} ${b.bad}프레임 (최악 ${b.worst})${b.between ? ' [두 사람 사이]' : ''}`).join('; ') : '깨진 것 없음'}`);
}

const seeds = arg('--seeds');
if (!seeds) {
  show(one(Number(arg('--seed', '1'))));
} else {
  const [lo, hi] = seeds.split('-').map(Number),
    all = [];
  for (let s = lo; s <= (hi || lo); s++) {
    let r;
    try {
      r = one(s);
    } catch (err) {
      console.log(`#${s} FAILED ${err.message}`);
      continue;
    }
    all.push(r);
    const p = r.plan;
    console.log(`#${s} ${LEVEL[p.men[0].grade].label}/${LEVEL[p.men[1].grade].label} hp ${p.hp} beats ${p.beats.length} KO ${p.ko.t}s ${punchName(p.ko.name)}${p.ko.out ? ' 실신' : ''} | ${r.ms} ms, replays ${p.stats.rebuilt}${p.attempt ? `, attempt ${p.attempt + 1}` : ''} | lines ${r.check.lines.length} ko ${r.check.ko} graded ${r.check.graded.length}${audit ? ` | audit ${r.broken.filter(b => !b.between).map(b => b.name + ':' + b.bad).join(',') || '-'} / between ${r.broken.filter(b => b.between).map(b => b.bad).join(',') || '-'}` : ''}`);
  }
  const n = all.length,
    stat = xs => (xs.length ? `${Math.min(...xs).toFixed(1)} / ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} / ${Math.max(...xs).toFixed(1)}` : '-'),
    used = new Map(),
    techs = new Map(),
    combos = new Map();
  for (const r of all) {
    for (const b of r.plan.beats) used.set(b.item, (used.get(b.item) || 0) + 1);
    for (const { e } of r.played.events) {
      for (const id of ['shell', 'shift', 'wave']) if (e.type === id) techs.set(id, (techs.get(id) || 0) + 1);
      if (e.type === 'shoulderRoll') techs.set('rollCounter', (techs.get('rollCounter') || 0) + 1);
      if (e.type === 'parry' && e.down) techs.set('parryDown', (techs.get('parryDown') || 0) + 1);
    }
    for (const b of r.plan.beats) {
      if (/^pull/.test(b.item)) techs.set('pullCounter', (techs.get('pullCounter') || 0) + 1);
      if (/^crossArm|^crossBody/.test(b.item) || (b.kind === 'defence' && r.plan.men[b.A].techniques.includes('crossArm'))) techs.set('crossArm', (techs.get('crossArm') || 0) + 1);
      if (b.item === 'blockFire') techs.set('blockFire', (techs.get('blockFire') || 0) + 1);
      if (b.kind === 'combo') combos.set(b.item, (combos.get(b.item) || 0) + 1);
    }
  }
  const lib = library(),
    items = [...new Set(lib.map(l => l.item))],
    never = items.filter(i => !used.has(i)),
    why = item => {
      const c = all.reduce((acc, r) => {
        const x = r.plan.stats.cards[item] || {};
        for (const k in x) acc[k] = (acc[k] || 0) + x[k];
        return acc;
      }, {});
      return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ') || 'never drawn';
    },
    sequences = new Set(all.map(r => r.plan.beats.map(b => b.id).join(' ')));
  console.log(`\n${n} rounds`);
  console.log(`  bout time (s) min/mean/max: ${stat(all.map(r => r.plan.ko.t))}`);
  console.log(`  beats: ${stat(all.map(r => r.plan.beats.length))}`);
  console.log(`  starting health: ${stat(all.map(r => r.plan.hp))}`);
  console.log(`  arranging (ms): ${stat(all.map(r => r.ms))}; replays from the start a round: ${stat(all.map(r => r.plan.stats.rebuilt))}; bout steps a round (round's bout / screens): ${stat(all.map(r => r.plan.stats.stepped))} / ${stat(all.map(r => r.plan.stats.screened))}`);
  console.log(`  second attempts: ${all.filter(r => r.plan.attempt).length}`);
  const sum = k => all.reduce((s, r) => s + (r.plan.stats[k] || 0), 0),
    fails = all.reduce((m, r) => {
      for (const [k, v] of Object.entries(r.plan.stats.failed)) m[k] = (m[k] || 0) + v;
      return m;
    }, {});
  console.log(`  tries on the round's bout: ${sum('kept')} kept of ${sum('tries')} (the rest played again from the start); candidates screened ${sum('screens')}; turned away: ${Object.entries(fails).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  kept promises: ${all.reduce((s, r) => s + r.plan.beats.length - r.check.lines.length, 0)} of ${all.reduce((s, r) => s + r.plan.beats.length, 0)} beats as their lines say; knockdown as arranged in ${all.filter(r => r.check.ko).length} of ${n}; things done a grade does not have: ${all.reduce((s, r) => s + r.check.graded.length, 0)}`);
  console.log(`  knockdowns: ${[...all.reduce((m, r) => m.set(punchName(r.plan.ko.name) + (r.plan.ko.out ? ' 실신' : r.plan.ko.liver ? ' 리버' : ''), (m.get(punchName(r.plan.ko.name) + (r.plan.ko.out ? ' 실신' : r.plan.ko.liver ? ' 리버' : '')) || 0) + 1), new Map())].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  distinct beat sequences: ${sequences.size} of ${n}; distinct cards used: ${used.size} of ${items.length} items`);
  console.log(`  techniques seen: ${Object.keys(TECHNIQUES).map(id => `${id} ${techs.get(id) || 0}`).join(', ')}`);
  console.log(`  combinations: ${Object.keys(COMBOS).map(id => `${id} ${combos.get(id) || 0}`).join(', ')}`);
  console.log(`  never in a round (what became of it): ${never.map(i => `${i} (${why(i)})`).join('; ') || 'none'}`);
  const left = leftOut().reduce((m, x) => m.set(x.why, [...(m.get(x.why) || []), x.id]), new Map());
  console.log(`  left out of the library: ${[...left].map(([w, ids]) => `${w}: ${ids.length} (${ids.slice(0, 8).join(' ')}${ids.length > 8 ? ' ...' : ''})`).join('; ')}`);
  if (audit) {
    const sum = new Map();
    for (const r of all) for (const b of r.broken) sum.set(b.name, [(sum.get(b.name) || [0])[0] + b.bad, Math.max((sum.get(b.name) || [0, 0])[1], b.worst), ((sum.get(b.name) || [0, 0, 0])[2] || 0) + 1]);
    console.log(`  audit, held checks broken in the played rounds (frames, worst, rounds): ${[...sum].map(([k, v]) => `${k}: ${v[0]} / ${v[1]} / ${v[2]}${BETWEEN.includes(k) ? ' [between the two men]' : ''}`).join('; ') || 'none'}`);
  }
  const json = arg('--json');
  if (json) writeFileSync(json, JSON.stringify(all.map(r => ({ seed: r.seed, men: r.plan.men, hp: r.plan.hp, beats: r.plan.beats, ko: r.plan.ko, ms: r.ms, stats: r.plan.stats, check: r.check, broken: r.broken })), null, 1));
}

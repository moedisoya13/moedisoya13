#!/usr/bin/env node
/* 한 라운드 스파링, from the command line (src/spar/plan.mjs, src/spar/rails.mjs; docs/spar.md):
     node tools/spar.mjs --seed 7          one round: the men, the two rails as arranged (every action and what came of it), the
                                           knockdown, the round played again from its controls (the same rails, block for
                                           block?), and the audit of it
     node tools/spar.mjs --seeds 1-50      a summary over many rounds: length, actions a second each side, the longest empty
                                           stretch, the cuts, the knockdowns, the camera's views, what never comes, how long
                                           arranging takes, and the held audit checks the played rounds break
       --no-audit                          leave the audit out (it doubles the time); the audit runs up to the knockdown
       --json <file>                       and every round's numbers written there
     node tools/spar.mjs --rates           with nothing steered and full health: the health a man of each grade takes off a man
                                           of each grade a second (what SPAR.hp.rate is set from) */
import { writeFileSync } from 'node:fs';
import { planOf, replayOf, checkOf, SPAR } from '../src/spar/plan.mjs';
import { measure, viewsOf, ACTS } from '../src/spar/rails.mjs';
import { punchName, trickName, MOVED, labelOf, saidOf } from '../src/spar/names.mjs';
import { auditor } from '../src/audit.mjs';
import { LEVEL, LEVELS } from '../src/anim/skill.mjs';
import { TECHNIQUES } from '../src/game/techniques.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const audit = !process.argv.includes('--no-audit');
const CORNER = ['빨강', '파랑'];
// (the audit's checks between the two men: a contact between men who are not standing at a card's distance is a known limit
// of the engine, not his own body's)
const BETWEEN = ['a glove inside the other man', 'the two men inside each other'];
const clock = k => `${Math.floor(k / 3600)}:${(Math.floor(k / 60) % 60).toString().padStart(2, '0')}.${Math.floor((k % 60) / 6)}`;
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
  return { seed, plan, ms, played, check, broken, views: viewsOf(plan.rails, plan.feet, plan.steps) };
}

function show(r) {
  const { plan, check } = r,
    st = plan.stats,
    ko = plan.ko;
  console.log(`대련 #${plan.seed}${plan.attempt ? ` (짠 차례 ${plan.attempt + 1})` : ''}: ${CORNER[0]} ${LEVEL[plan.men[0].grade].label} [${plan.men[0].techniques.join(', ')}] 대 ${CORNER[1]} ${LEVEL[plan.men[1].grade].label} [${plan.men[1].techniques.join(', ')}]`);
  console.log(`  시작 체력 둘 다 ${plan.hp} · 밀어 주는 쪽 ${CORNER[plan.favoured]} · 목표 ${plan.target} s · 짜는 데 ${r.ms} ms`);
  console.log('  네 줄 (짠 그대로; 발: 풋워크 줄):');
  const all = [...plan.rails[0], ...plan.rails[1], ...plan.feet[0], ...plan.feet[1]].sort((a, b) => a.from - b.from || a.who - b.who);
  for (const b of all) console.log(`   ${clock(b.from).padStart(7)} ${b.who ? '                    ' : ''}${CORNER[b.who]} ${b.kind === 'step' ? '  발 ' : b.kind === 'hurt' ? '· ' : ''}${labelOf(b)} ${saidOf(b)}  [${((b.to - b.from) / 60).toFixed(2)} s]`);
  console.log(`  KO: ${clock(ko.step)} (시합 시계 ${ko.t} s) ${CORNER[ko.by]} ${punchName(ko.name)} ${ko.J} N·s${ko.counter ? ' (카운터)' : ''}${ko.out ? ` · 실신 ${ko.out}` : ko.liver ? ' · 리버' : ''}${ko.power ? '' : ' · 강타 아님'}`);
  console.log(`  초당 기술: ${CORNER[0]} ${st.rate[0].toFixed(2)} · ${CORNER[1]} ${st.rate[1].toFixed(2)} · 아무도 아무것도 시작하지 않은 가장 긴 틈 ${st.empty.toFixed(2)} s (기술만: ${st.lull.toFixed(2)} s) · 끊긴 기술 ${st.cuts} (강타 ${st.power}, 닿기 전에 ${st.early})`);
  console.log(`  초당 풋워크: ${CORNER[0]} ${st.pace[0].toFixed(2)} · ${CORNER[1]} ${st.pace[1].toFixed(2)} · 종류 ${st.kinds.join(' / ')} · 거리 ${st.ways.distance} · 축 ${st.ways.axis} · 발이 쉰 가장 긴 틈 ${st.still.map(x => x.toFixed(2)).join(' / ')} s`);
  const g = st.gaps;
  console.log(`  모션 사이에 서 있은 프레임 (평균 / 90% / 최장): 기술 ${g.tech.map(x => `${x.mean}/${x.p90}/${x.most}`).join(' · ')} · 발 ${g.feet.map(x => `${x.mean}/${x.p90}/${x.most}`).join(' · ')}`);
  console.log(`  카메라: ${r.views.map(v => `${v.kind === 'bird' ? '조감' : '줌'} ${clock(v.from)}~${clock(v.to)} (${v.why})`).join(', ') || '고정만'}`);
  console.log(`  다시 돌려 본 결과: 레일이 그대로 ${check.rails ? '예' : '아니오'} · 다운 ${check.downs} · KO가 짠 대로 ${check.ko ? '예' : '아니오'} · 등급에 없는 동작 ${check.graded.length}${check.graded.length ? ' ' + JSON.stringify(check.graded.slice(0, 4)) : ''}`);
  if (audit) console.log(`  점검(audit): ${r.broken.length ? r.broken.map(b => `${b.name} ${b.bad}프레임 (최악 ${b.worst})${b.between ? ' [두 사람 사이]' : ''}`).join('; ') : '깨진 것 없음'}`);
}

if (process.argv.includes('--rates')) {
  console.log('rows: the man hitting; columns: the man hit; health a second (30 s, nothing steered), and the hitter\'s actions a second');
  for (const a of LEVELS) {
    const row = LEVELS.map(b => planOf(11 + LEVELS.indexOf(a) * 7 + LEVELS.indexOf(b), { grades: [a, b], neutral: 30 }));
    console.log(a.padEnd(3), row.map(p => p.lost[1].toFixed(2)).join(' '), ' | ', row.map(p => p.stats.rate[0].toFixed(2)).join(' '));
  }
} else if (!arg('--seeds')) {
  show(one(Number(arg('--seed', '1'))));
} else {
  const [lo, hi] = arg('--seeds').split('-').map(Number),
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
    const p = r.plan,
      st = p.stats;
    console.log(`#${s} ${LEVEL[p.men[0].grade].label}/${LEVEL[p.men[1].grade].label} hp ${p.hp} 목표 ${p.target} KO ${p.ko.at}s ${CORNER[p.ko.by]}${p.ko.by === p.favoured ? '' : '(이변)'} ${punchName(p.ko.name)} ${p.ko.worth}${p.ko.out ? ' 실신' : p.ko.liver ? ' 리버' : ''}${p.ko.power ? '' : ' 강타 아님'} | 기술 ${st.rate.map(x => x.toFixed(2)).join('/')} 틈 ${st.empty.toFixed(2)}/${st.lull.toFixed(2)} 끊김 ${st.cuts}/${st.power}/${st.early} 발 ${st.pace.map(x => x.toFixed(2)).join('/')} 종류 ${st.kinds.join('/')} 조감 ${r.views.filter(v => v.kind === 'bird').length} 줌 ${r.views.filter(v => v.kind === 'zoom').length} | ${r.ms} ms${p.attempt ? `, 짠 차례 ${p.attempt + 1}` : ''}${r.check.rails && r.check.ko && r.check.downs === 1 && !r.check.graded.length ? '' : ' !! ' + JSON.stringify({ rails: r.check.rails, ko: r.check.ko, downs: r.check.downs, graded: r.check.graded.length })}`);
  }
  const n = all.length,
    stat = (xs, d = 2) => (xs.length ? `${Math.min(...xs).toFixed(d)} / ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(d)} / ${Math.max(...xs).toFixed(d)}` : '-'),
    count = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by),
    list = m => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '),
    names = new Map(),
    walks = new Map(),
    kinds = new Map(),
    outs = new Map(),
    techs = new Map(),
    kos = new Map();
  for (const r of all) {
    for (const b of [...r.plan.rails[0], ...r.plan.rails[1]]) {
      if (b.from >= r.plan.steps) continue;
      count(kinds, b.kind);
      if (ACTS.includes(b.kind)) count(names, b.trick ? trickName(b.trick) : b.kind === 'attack' ? punchName(b.name) : b.kind === 'show' ? trickName(b.name) : MOVED[b.name] || b.name);
      if (b.kind === 'attack') count(outs, b.out || (b.cut ? 'cut before it got there' : 'nothing'));
      if (b.tech) count(techs, b.tech);
      if (b.name === 'shell') count(techs, 'shell');
      if (b.name === 'shoulder') count(techs, 'rollCounter');
      if (b.name === 'pat') count(techs, 'parryDown');
    }
    for (const b of [...r.plan.feet[0], ...r.plan.feet[1]]) if (b.from < r.plan.steps) count(walks, MOVED[b.name] || b.name), b.name === 'wave' && count(techs, 'wave');
    for (const { e } of r.played.events) if (e.type === 'shift') count(techs, 'shift');
    const ko = r.plan.ko;
    count(kos, punchName(ko.name) + (ko.out ? ' 실신' : ko.liver ? ' 리버' : ''));
  }
  console.log(`\n${n} rounds`);
  console.log(`  round to the knockdown, as watched (s) min/mean/max: ${stat(all.map(r => r.plan.ko.at), 1)}; within 40-70 s: ${all.filter(r => r.plan.ko.at >= 40 && r.plan.ko.at <= 70).length}`);
  console.log(`  footwork a second, each man: ${stat(all.flatMap(r => r.plan.stats.pace))}; the lower man of a round: ${stat(all.map(r => Math.min(...r.plan.stats.pace)))}; kinds of footwork a man a round: ${stat(all.flatMap(r => r.plan.stats.kinds), 1)}; longest stretch a man's feet do nothing (s): ${stat(all.flatMap(r => r.plan.stats.still))}; distance / axis steps a round: ${stat(all.map(r => r.plan.stats.ways.distance), 0)} | ${stat(all.map(r => r.plan.stats.ways.axis), 0)}`);
  console.log(`  footwork: ${list(walks)}`);
  // (the standing between two motions, every run of every man of every round together, a lane each: frames)
  const runs = lane => {
    const xs = all.flatMap(r => r.plan.stats.runs[lane].flat()).sort((a, b) => a - b),
      n = xs.length;
    return `${n} starts, mean ${(xs.reduce((a, b) => a + b, 0) / n).toFixed(2)}, 90th percentile ${xs[Math.floor(n * 0.9)]}, longest ${xs[n - 1]}; none at all in ${((100 * xs.filter(x => x === 0).length) / n).toFixed(0)}%, one frame in ${((100 * xs.filter(x => x === 1).length) / n).toFixed(0)}%, over 6 frames in ${xs.filter(x => x > 6).length}`;
  };
  console.log(`  frames standing between two motions, techniques' lane: ${runs('tech')}; a man's worst mean ${Math.max(...all.flatMap(r => r.plan.stats.gaps.tech.map(g => g.mean)))}, worst 90th percentile ${Math.max(...all.flatMap(r => r.plan.stats.gaps.tech.map(g => g.p90)))}`);
  console.log(`  frames standing between two motions, footwork's lane: ${runs('feet')}; a man's worst mean ${Math.max(...all.flatMap(r => r.plan.stats.gaps.feet.map(g => g.mean)))}, worst 90th percentile ${Math.max(...all.flatMap(r => r.plan.stats.gaps.feet.map(g => g.p90)))}`);
  console.log(`  techniques a second, each side (${2 * n} sides): ${stat(all.flatMap(r => r.plan.stats.rate))}; the lower side of a round: ${stat(all.map(r => Math.min(...r.plan.stats.rate)))}; sides under 1 a second: ${all.flatMap(r => r.plan.stats.rate).filter(x => x < 1).length}, over 2: ${all.flatMap(r => r.plan.stats.rate).filter(x => x > 2).length}`);
  console.log(`  longest stretch nobody starts anything, technique or step (s): ${stat(all.map(r => r.plan.stats.empty))}; rounds with one over 1 s: ${all.filter(r => r.plan.stats.empty > 1).length}; longest stretch nobody starts a technique (s): ${stat(all.map(r => r.plan.stats.lull))}; rounds with one over 1.5 s: ${all.filter(r => r.plan.stats.lull > 1.5).length}; longest stretch one man starts no technique (s): ${stat(all.flatMap(r => r.plan.stats.idle))}`);
  console.log(`  actions cut by a blow, a round: ${stat(all.map(r => r.plan.stats.cuts), 1)}; by a power blow: ${stat(all.map(r => r.plan.stats.power), 1)}; of those, before the cut punch got there or in an evasion, a step or a guard: ${stat(all.map(r => r.plan.stats.early), 1)}; rounds with none by a power blow: ${all.filter(r => !r.plan.stats.power).length}`);
  console.log(`  starting health: ${stat(all.map(r => r.plan.hp), 0)}; won by the favoured man: ${all.filter(r => r.plan.ko.by === r.plan.favoured).length}; knockdown by a power punch: ${all.filter(r => r.plan.ko.power).length} (its blow under ${SPAR.power} N·s: ${all.filter(r => r.plan.ko.worth < SPAR.power).map(r => `#${r.seed} ${r.plan.ko.name} ${r.plan.ko.worth}`).join(', ') || 'none'})`);
  console.log(`  knockdowns: ${list(kos)}`);
  console.log(`  arranging (ms): ${stat(all.map(r => r.ms), 0)}; arranged again: ${all.filter(r => r.plan.attempt).length}`);
  console.log(`  played again from the controls: the same rails in ${all.filter(r => r.check.rails).length} of ${n}; the knockdown as arranged in ${all.filter(r => r.check.ko).length}; one knockdown in ${all.filter(r => r.check.downs === 1).length}; things a man's grade or loadout does not have: ${all.reduce((s, r) => s + r.check.graded.length, 0)}`);
  console.log(`  blocks by kind: ${list(kinds)}`);
  console.log(`  what became of the punches: ${list(outs)}`);
  const ev = all.flatMap(r => [...r.plan.rails[0], ...r.plan.rails[1]].filter(b => b.kind === 'evade' && b.from < r.plan.steps));
  console.log(`  evasions: ${ev.length}, a punch gone by in ${ev.filter(b => b.out === 'clear').length}, cut by a blow ${ev.filter(b => b.cut).length}`);
  console.log(`  techniques done: ${list(names)}`);
  console.log(`  techniques: ${Object.keys(TECHNIQUES).map(id => `${id} ${techs.get(id) || 0}`).join(', ')}`);
  console.log(`  camera, a round: bird's-eye ${stat(all.map(r => r.views.filter(v => v.kind === 'bird').length), 1)}, zoom ${stat(all.map(r => r.views.filter(v => v.kind === 'zoom').length), 1)}; share of the round in them: ${stat(all.map(r => r.views.reduce((s, v) => s + v.to - v.from, 0) / r.plan.steps))}`);
  if (audit) {
    const sum = new Map();
    for (const r of all) for (const b of r.broken) sum.set(b.name, [(sum.get(b.name) || [0])[0] + b.bad, Math.max((sum.get(b.name) || [0, 0])[1], b.worst), ((sum.get(b.name) || [0, 0, 0])[2] || 0) + 1]);
    console.log(`  audit, held checks broken in the played rounds (frames, worst, rounds): ${[...sum].map(([k, v]) => `${k}: ${v[0]} / ${v[1]} / ${v[2]}${BETWEEN.includes(k) ? ' [between the two men]' : ''}`).join('; ') || 'none'}`);
  }
  const json = arg('--json');
  if (json) writeFileSync(json, JSON.stringify(all.map(r => ({ seed: r.seed, men: r.plan.men, hp: r.plan.hp, favoured: r.plan.favoured, target: r.plan.target, ko: r.plan.ko, ms: r.ms, stats: Object.assign({}, r.plan.stats, { runs: undefined }), views: r.views, check: { rails: r.check.rails, ko: r.check.ko, downs: r.check.downs, graded: r.check.graded }, broken: r.broken })), null, 1));
}

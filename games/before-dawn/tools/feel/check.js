#!/usr/bin/env node
// Acceptance checks of docs/CONTROLS-REVIEW.md §4. One line per check: PASS / FAIL.
//   node tools/feel/check.js                 sim + browser checks (about 1 minute)
//   node tools/feel/check.js --bots          also the two pilots over seeds 1–100 (about 3 minutes)
//   node tools/feel/check.js --skip-browser
// On the build this review measured (f04bc93) most lines FAIL: that is the baseline.
// The measuring scripts are run with --json and their numbers are asserted here, so the
// method is the same before and after the change.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const K = require('./_kit');
const o = K.args();
const run = (file, args) => execFileSync(process.execPath, [path.join(__dirname, file)].concat(args), { encoding: 'utf8', maxBuffer: 64 << 20 });
const json = (txt) => JSON.parse(txt.split('\n').find((l) => l.startsWith('JSON ')).slice(5));
let fails = 0;
function check(id, name, ok, got) { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}  [${got}]`); }
// a tuning target (GDD-V2 §10.4 "튜닝 목표"): reported, never a FAIL
function target(id, name, ok, got) { console.log(`${ok ? 'PASS' : 'TARGET'}  ${id}  ${name}  [${got}]`); }

// ---- sim --------------------------------------------------------------------------------------
const S = json(run('sim_feel.js', ['--only', 'move,dash,target', '--seeds', '4', '--json']));
const BD = K.load();
{
  const m = S.move, d = S.dash, t = S.target;
  check('M1', 'movement stays instant: full speed and full stop within 1 tick', m.ticksToFullSpeed === 1 && m.ticksToStop === 1, `${m.ticksToFullSpeed}/${m.ticksToStop} ticks`);
  check('M2', 'a frozen ring of 8 ghouls no longer traps the hero: best escape in 2 s ≥ 2.0u (free walk: 8.4u)', m.ring[8].bestEscapeIn2s >= 2, m.ring[8].bestEscapeIn2s + 'u');
  check('M3', 'ring of 5 and 6: escape ≥ 2.0u in 2 s', m.ring[5].bestEscapeIn2s >= 2 && m.ring[6].bestEscapeIn2s >= 2, `${m.ring[5].bestEscapeIn2s}u / ${m.ring[6].bestEscapeIn2s}u`);
  check('M4', 'walking dead-centre into one standing enemy gets past it within 1.5 s', m.headOn[0].passed, 'x=' + m.headOn[0].x);
  check('M5', 'guardians are not shoved by walking into them', m.guardianShoved < 0.01, m.guardianShoved + 'u');
  check('M6', 'corner assist: 0.1u short of a pillar corner slides round (offset 0.4), a flat hit still stops (offset 0, 0.1)', m.pillar['0.4'].passed && !m.pillar['0'].passed && !m.pillar['0.1'].passed, `0.4:${m.pillar['0.4'].passed} 0:${m.pillar['0'].passed} 0.1:${m.pillar['0.1'].passed}`);
  check('M7', 'wall slide unchanged: 45° into a wall keeps 2.9–3.1 u/s along it', m.wallSlide[45] >= 2.9 && m.wallSlide[45] <= 3.1, m.wallSlide[45]);
  check('D1', 'dash pressed 0.10 s and 0.17 s before the cooldown ends fires when it ends', d.buffer['6 ticks early'] === 'dashes' && d.buffer['10 ticks early'] === 'dashes', `${d.buffer['6 ticks early']}/${d.buffer['10 ticks early']}`);
  check('D2', 'dash pressed 0.30 s before the cooldown ends is not remembered', d.buffer['18 ticks early'] === 'DROPPED', d.buffer['18 ticks early']);
  check('D3', 'idle dash goes in the last movement direction (core rule), not into the target', d.idleDashNextToTarget.dy > 2.5 && Math.abs(d.idleDashNextToTarget.dx) < 0.5, JSON.stringify([d.idleDashNextToTarget.dx, d.idleDashNextToTarget.dy]));
  check('D4', 'dash distance 3.2u, cooldown 2.5 s unchanged', Math.abs(d.dashDist - 3.2) < 0.01 && d.cooldown === 2.5, `${d.dashDist}u ${d.cooldown}s`);
  check('A1', 'kiting a ghoul for 6 s: the body flips left/right at most 2 times', t.kiteGhoul.leftRightFlips <= 2, t.kiteGhoul.leftRightFlips + ' flips');
  check('A2', 'while a target exists the hero faces it ≥ 95 % of the time', t.kiteGhoul.shareFacingTarget >= 0.95, t.kiteGhoul.shareFacingTarget);
  const hp = (id) => BD.enemies.get(id).hp;
  const got = { goblin: hp('goblin'), slime: hp('slime'), skel_archer: hp('skel_archer'), ghoul: hp('ghoul'), mage: hp('mage'), dark_knight: hp('dark_knight') };
  // GDD-V2 §3.2 replaces the review's §3.1 HP row (v1: goblin 40, slime 60, archer 40, ghoul 120, mage 54, knight 240)
  const wantHp = { goblin: 10, slime: 30, skel_archer: 20, ghoul: 45, mage: 30, dark_knight: 120 };
  check('T1', 'enemy HP (GDD-V2 §3.2) = ' + JSON.stringify(wantHp), Object.keys(wantHp).every((k) => got[k] === wantHp[k]), JSON.stringify(got));
  const boss = BD.enemies.has('demon_king') ? hp('demon_king') : (BD.bosses && BD.bosses.get ? BD.bosses.get('demon_king').hp : null);
  check('T2', 'boss HP 6000 (GDD-V2 §3.6; v1 3000), post-hit invulnerability 1.0 s, fire circle warning 1.1 s', boss === 6000 && BD.C.HERO.hurtInvuln === 1.0 && BD.enemies.get('mage').T.tgTime === 1.1, `${boss} / ${BD.C.HERO.hurtInvuln} / ${BD.enemies.get('mage').T.tgTime}`);
  // guardian HP as spawned on each floor
  const gh = [];
  for (let fl = 1; fl <= 5; fl++) { const A = K.arena({ BD, floor: fl }); gh.push(K.spawn(BD, A.w, 'goblin', 3, 3, { guardian: true }).maxHp); }
  check('T3', 'guardian HP 1F–5F = 400 / 700 / 1000 / 1300 / 1600 (GDD-V2 §3.6; v1 385 … 960)', JSON.stringify(gh) === '[400,700,1000,1300,1600]', JSON.stringify(gh));
}

// ---- pilots -------------------------------------------------------------------------------------
if (o.bots) {
  const txt = run('human_bot.js', ['--seeds', '1-100']);
  const m = (name) => { const b = txt.split('-- ' + name)[1] || ''; const w = /wins (\d+)/.exec(b), d = /deaths by floor: (\{.*\})/.exec(b); return { wins: w ? +w[1] : -1, by: d ? JSON.parse(d[1]) : {} }; };
  const h = m('human'), p = m('perfect');
  const early = (h.by['1F'] || 0) + (h.by['2F'] || 0);
  // GDD-V2 §9.2 replaces the review's 8–28 wins / ≤ 22 early deaths / perfect ≥ 60 with 20–35 wins,
  // ≤ 15 runs ending on 1F–2F, perfect ≥ 70 — and makes them tuning targets (§10.4 V12), not gates
  target('H1', 'human-like pilot, seeds 1–100: 20–35 wins (GDD-V2 §9.2)', h.wins >= 20 && h.wins <= 35, h.wins + ' wins');
  target('H2', 'human-like pilot: at most 15 of 100 runs end on 1F–2F (GDD-V2 §9.2)', early <= 15, early + ' runs');
  target('H3', 'perfect pilot, seeds 1–100: at least 70 wins (GDD-V2 §9.2)', p.wins >= 70, p.wins + ' wins');
}

// ---- browser ------------------------------------------------------------------------------------
if (!o['skip-browser']) {
  const B = json(run('browser_feel.js', ['--only', 'latency,stick,touch,hud,warn', '--json', '--out', path.join(require('os').tmpdir(), 'bd-feel-check')]));
  check('L1', 'input to motion: median ≤ 2 frames for key, touch and dash', B.latency.keyMove.framesMedian <= 2 && B.latency.touchMove.framesMedian <= 2 && B.latency.keyDash.framesMedian <= 2, `${B.latency.keyMove.framesMedian}/${B.latency.touchMove.framesMedian}/${B.latency.keyDash.framesMedian}`);
  for (const vp of ['667x375', '1024x768']) {
    const rows = new Map(B.stick[vp].dragCssPx_to_speedShare);
    check('S1', `stick at ${vp} is sized in CSS px: 7 px → 0, 9 px → moving, 30 px → 0.45–0.65, 48 px → full`, rows.get(7) === 0 && rows.get(9) > 0 && rows.get(30) >= 0.45 && rows.get(30) <= 0.65 && rows.get(48) >= 0.99 && rows.get(40) < 0.99, JSON.stringify([rows.get(7), rows.get(9), rows.get(30), rows.get(40), rows.get(48)]));
  }
  const t = B.touch;
  check('S2', 'double tap in place: 120 ms and 230 ms dash, 280 ms does not', t.doubleTap['120 ms'] === 'dash' && t.doubleTap['230 ms'] === 'dash' && t.doubleTap['280 ms'] === 'no dash', JSON.stringify(t.doubleTap));
  const rg = Object.keys(t.regrip).filter((k) => / (150|300) css px away/.test(k)).map((k) => t.regrip[k]);
  check('S3', 're-gripping 150 / 300 CSS px away within 200 ms does not dash', rg.every((v) => v === 'no dash'), JSON.stringify(rg));
  check('S4', 'dash button and second finger: dashes while the stick is held; lifting a second finger keeps the stick', t.dashButtonWhileStickHeld === 'dashes' && /stick kept/.test(t.secondFinger), t.dashButtonWhileStickHeld);
  check('S5', 'dash request 0.1 s before ready (button/Space path) fires when ready', t.dashDuringCooldown['0.1 s before ready'] === 'dashes when ready', JSON.stringify(t.dashDuringCooldown));
  const btn = (vp, id) => B.hud[vp].buttons.find((b) => b.id === id);
  const pd = btn('667x375', 'hud_dash'), pp = btn('667x375', 'hud_pause');
  check('U1', 'phone 667×375: dash hit area ≥ 72 CSS px, pause ≥ 44 CSS px', Math.min(pd.cssW, pd.cssH) >= 72 && Math.min(pp.cssW, pp.cssH) >= 44, `dash ${pd.cssW}×${pd.cssH}, pause ${pp.cssW}×${pp.cssH}`);
  check('U2', 'no floor cell is drawn under a HUD rectangle (3 viewports)', Object.values(B.hud).every((h) => h.floorCellsUnderHud === 0), Object.values(B.hud).map((h) => h.floorCellsUnderHud).join('/'));
  const dists = Object.keys(B.warn).map((k) => `${k} ${B.warn[k].at0_1s.rgbDist}`);
  check('W1', 'a warning 0.1 s old differs from the floor by mean RGB distance ≥ 60 on all five floors', Object.values(B.warn).every((w) => w.at0_1s.rgbDist >= 60), dists.join(', '));
}

console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);

// Fun measurements — shared pilot and metric collector (docs/GDD-V2.md §10).
//
// Both functions are self-contained (they only use their arguments) so that play_browser.js can
// send their source text into the page and run the very same code against window.BD, while
// measure.js runs them in Node. Nothing here edits a game file.
//
// v1/v2 compatibility: the collector uses what the build offers and falls back otherwise.
//   - BD.W.onScreen(w, x, y)  (v2, the sim's own view rectangle) → else every enemy counts as on screen
//   - events choice_open / choice_pick / xp_gain / level_up / site_clear (v2) → else altar events only
//   - BD.bot.choose(w, opts) → [cmd, a, b] for any open choice overlay (v2) → else BD.bot.altar
'use strict';

// ---- pilot -----------------------------------------------------------------------------------
// The human-like pilot of tools/feel/human_bot.js (reaction 0.25–0.40 s, re-decides every
// 0.13–0.20 s, 15 % wrong-way reactions, ±12° aim noise, 75 % panic dash below 0.35 s), plus what
// a run needs besides steering: choices at the altar (and any v2 choice overlay) and trials.
// opts: { altar: 'card' | 'pray' | 'mixed', trial: bool }
//   card  – always takes the first offered card (into the leftmost non-conditional slot)
//   pray  – always prays
//   mixed – prays below 60 HP, else takes the card (the shipped bot's rule)
function makePilot(BD, seed, opts) {
  opts = opts || {};
  const M = BD.math;
  let a = (seed * 7919 + 13) >>> 0;
  const rnd = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const seenAt = new Map(), noticed = new Set(), dashRoll = new Map();
  let held = { mx: 0, my: 0 }, nextDecide = 0, wrongUntil = 0, wrongRot = 0;
  function projShapes(w) {
    const out = [];
    for (const p of w.projectiles) {
      if (!p.hostile) continue;
      const len = Math.min((p.range || 20) - (p.travelled || 0), p.speed * 0.6);
      if (len <= 0) continue;
      const t = (w.hero.x - p.x) * Math.cos(p.dir) + (w.hero.y - p.y) * Math.sin(p.dir);
      out.push({ id: 'p' + p.id, shape: 'line', x: p.x, y: p.y, dir: p.dir, len, width: 2 * p.r + 0.1, remain: Math.max(0, t / p.speed), danger: true, fake: true });
    }
    return out;
  }
  const P = {};
  P.think = function (w) {
    const real = w.telegraphs;
    const all = real.concat(projShapes(w));
    const vis = [];
    let fresh = false;
    for (const t of all) {
      if (!seenAt.has(t.id)) seenAt.set(t.id, w.t + (t.fake ? 0.18 + rnd() * 0.12 : 0.25 + rnd() * 0.15));
      if (w.t >= seenAt.get(t.id)) {
        vis.push(t);
        if (!noticed.has(t.id)) {
          noticed.add(t.id);
          if (t.danger && M.shapeHits(t, w.hero.x, w.hero.y, w.hero.r + 0.05)) fresh = true;
        }
      }
    }
    if (seenAt.size > 4000) { seenAt.clear(); noticed.clear(); dashRoll.clear(); }
    let dash = false, urgent = Infinity, uid = null;
    for (const t of vis) if (t.danger && M.shapeHits(t, w.hero.x, w.hero.y, w.hero.r + 0.05) && t.remain < urgent) { urgent = t.remain; uid = t.id; }
    if (urgent < 0.35 && w.hero.dashCd <= 0) {
      if (!dashRoll.has(uid)) dashRoll.set(uid, rnd() < 0.75);
      dash = dashRoll.get(uid);
    }
    if (fresh || w.t >= nextDecide) {
      w.telegraphs = vis;
      let d;
      try { d = BD.bot.think(w, { trial: !!opts.trial }); } finally { w.telegraphs = real; }
      let ang = Math.atan2(d.my, d.mx);
      const l = Math.hypot(d.mx, d.my);
      if (fresh && rnd() < 0.15) { wrongUntil = w.t + 0.25; wrongRot = (rnd() < 0.5 ? -1 : 1) * (45 + rnd() * 45) * M.DEG; }
      if (l > 0.01) {
        ang += (rnd() * 2 - 1) * 12 * M.DEG;
        if (w.t < wrongUntil) ang += wrongRot;
        held = { mx: Math.cos(ang), my: Math.sin(ang) };
      } else held = { mx: 0, my: 0 };
      nextDecide = w.t + 0.13 + rnd() * 0.07;
    }
    return { mx: held.mx, my: held.my, dash };
  };
  // A choice overlay is open: returns [cmd, a, b] for app.cmd(...)
  P.choose = function (w) {
    if (BD.bot.choose) return BD.bot.choose(w, { policy: opts.altar || 'mixed', trial: !!opts.trial });
    const al = w.altar;
    if (al.step === 'slot') return ['altar'].concat(BD.bot.altar(w, {}));
    const mode = opts.altar || 'mixed';
    if (!al.offers.length || mode === 'pray' || (mode === 'mixed' && w.hero.hp < 60)) return ['altar', 'pray'];
    return ['altar', 'pick', 0];
  };
  P.choiceOpen = function (w) { return !!(w.altarOpen || w.choiceOpen); };
  return P;
}

// ---- metrics ---------------------------------------------------------------------------------
// attach(w) once per world (before the first tick), tick(w) after every simulated tick,
// summary() at the end. All times are game seconds (w.t), which stand still in overlays.
function makeMetrics(BD) {
  const has = (name) => !!BD.events.decl[name];
  const NEAR = 3; // "fewer than three enemies on screen"
  const CROWD = 10;
  const blank = () => ({
    ticks: 0, kills: 0, hurts: 0, dmgTaken: 0, moved: 0, attackTicks: 0, emptyTicks: 0, sparseTicks: 0, crowdTicks: 0,
    onScreenSum: 0, onScreenMax: 0, chaseTicks: 0, lastChaseTicks: 0, noEnemyTicks: 0, choices: 0, gains: 0, pickups: 0,
    swings: 0, multiSwings: 0, hitSum: 0, kinds: {}, sites: {},
  });
  const R = {
    total: blank(), minutes: [], floors: {}, floorOrder: [],
    choiceT: [], gainT: [], killT: [], hurtT: [], pickupT: [], levelT: [],
    hitsBySource: {}, dmgBySource: {}, hurtBy: {}, ttk: {}, // kind → {n, directHits, sec}
    cardEvents: 0, cardEventKinds: {}, first: {}, timeline: [], result: null, endT: 0, floor: 0,
    reachAtSwing: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // enemies inside the blade's reach at a swing, 0..10+
    chaseDistSum: 0, chaseDistN: 0, hand: [], seed: null,
  };
  let w = null, lastX = 0, lastY = 0, floorKey = null;
  const seen = new Map(); // enemy id → {t0, direct}
  const bucket = () => {
    const m = Math.floor(w.t / 60);
    while (R.minutes.length <= m) R.minutes.push(blank());
    return R.minutes[m];
  };
  const fl = () => R.floors[floorKey] || (R.floors[floorKey] = blank());
  const each = (fn) => { fn(R.total); fn(bucket()); if (floorKey !== null) fn(fl()); };
  const mark = (k) => { if (R.first[k] === undefined) R.first[k] = +w.t.toFixed(2); };
  const note = (text) => { if (R.timeline.length < 400) R.timeline.push([+w.t.toFixed(1), text]); };
  const choice = (label) => { R.choiceT.push(+w.t.toFixed(2)); each((b) => b.choices++); mark('choice'); note('choice: ' + label); };
  const gain = (label) => { R.gainT.push(+w.t.toFixed(2)); each((b) => b.gains++); mark('gain'); note('gain: ' + label); };
  const cardEv = (k) => { R.cardEvents++; R.cardEventKinds[k] = (R.cardEventKinds[k] || 0) + 1; };
  const CARD_SOURCES = { pierce: 1, whirl: 1, wave: 1, echo: 1, riposte: 1, chain: 1, burn: 1, steam: 1, burst: 1, slam: 1 };

  const M = {};
  M.attach = function (world) {
    w = world; lastX = w.hero.x; lastY = w.hero.y;
    R.seed = w.seed;
    const on = (name, fn) => { if (has(name)) w.bus.on(name, fn, M); };
    on('run_start', (e) => { R.hand = e.hand.slice(); });
    on('floor_enter', (e) => { floorKey = e.floor; if (!R.floorOrder.includes(e.floor)) R.floorOrder.push(e.floor); fl().dom = e.domType; lastX = w.hero.x; lastY = w.hero.y; note('floor ' + e.floor + ' ' + e.domType); });
    on('spawn', (e) => { each((b) => { b.kinds[e.kind] = (b.kinds[e.kind] || 0) + 1; }); });
    on('swing', (e) => {
      let n = 0;
      for (const en of w.enemies) if (!en.dead && !en.down && Math.hypot(en.x - w.hero.x, en.y - w.hero.y) - en.r <= e.reach) n++;
      R.reachAtSwing[Math.min(10, n)]++;
      mark('swing');
    });
    on('swing_end', (e) => { each((b) => { b.swings++; b.hitSum += e.hitCount; if (e.hitCount >= 2) b.multiSwings++; }); });
    on('hit', (e) => {
      R.hitsBySource[e.source] = (R.hitsBySource[e.source] || 0) + 1;
      R.dmgBySource[e.source] = (R.dmgBySource[e.source] || 0) + e.dmg;
      let s = seen.get(e.enemyId);
      if (!s) { s = { t0: w.t, direct: 0 }; seen.set(e.enemyId, s); }
      if (e.direct) s.direct++;
      if (CARD_SOURCES[e.source]) cardEv('hit:' + e.source);
    });
    on('kill', (e) => {
      each((b) => b.kills++); R.killT.push(+w.t.toFixed(2)); mark('kill');
      const s = seen.get(e.enemyId);
      if (s && !e.elite && !e.guardian && !e.boss) {
        const k = R.ttk[e.kind] || (R.ttk[e.kind] = { n: 0, directHits: 0, sec: 0 });
        k.n++; k.directHits += s.direct; k.sec += w.t - s.t0;
      }
      seen.delete(e.enemyId);
    });
    on('hurt', (e) => {
      each((b) => { b.hurts++; b.dmgTaken += e.dmg; }); R.hurtT.push(+w.t.toFixed(2)); mark('hurt');
      const k = e.source + ':' + e.attack; R.hurtBy[k] = (R.hurtBy[k] || 0) + e.dmg;
    });
    on('pickup', (e) => { each((b) => b.pickups++); R.pickupT.push(+w.t.toFixed(2)); mark('pickup'); if (e.kind !== 'shard') note('pickup: ' + e.kind); });
    // v1 choices: the altar (card or prayer; "later" is not a choice) and opening a trial
    on('altar_close', (e) => { if (e.choice !== 'later' && !has('choice_pick')) choice('altar ' + e.choice); });
    on('trial_start', () => { if (!has('choice_pick')) choice('trial'); });
    // v2 choices: every pick in a choice overlay, and stepping into an optional site
    on('choice_pick', (e) => choice((e.kind || '') + ' ' + (e.pick || '')));
    on('site_start', (e) => { if (e.optional) choice('site ' + e.kind); });
    on('task_clear', (e) => { if (floorKey !== null) fl().task = e.task; note('task clear: ' + e.task); });
    on('site_clear', (e) => { each((b) => { b.sites[e.kind] = (b.sites[e.kind] || 0) + 1; }); gain('site ' + e.kind); });
    // gains: something the hero keeps
    on('card_swap', (e) => gain('card ' + e.inId));
    on('guardian_kill', () => gain('guardian'));
    on('quest_awaken', (e) => { gain('awaken ' + e.cardId); cardEv('awaken'); });
    on('level_up', (e) => { R.levelT.push(+w.t.toFixed(2)); gain('level ' + (e.level || '')); });
    on('heal', (e) => { if (e.source === 'flask') gain('flask'); else if (e.source !== 'altar') cardEv('heal:' + e.source); });
    on('combo_change', (e) => cardEv('combo:' + e.reason));
    on('quest_progress', () => cardEv('quest'));
    on('altar_open', () => note('altar open'));
    on('death', (e) => { R.result = 'death'; note('death: ' + e.cause); });
    on('win', () => { R.result = 'win'; note('win'); });
  };
  M.tick = function (world) {
    if (world !== w) return;
    const h = w.hero;
    const d = Math.hypot(h.x - lastX, h.y - lastY);
    lastX = h.x; lastY = h.y;
    let live = 0, shown = 0, nearest = Infinity;
    const vis = BD.W.onScreen;
    for (const e of w.enemies) {
      if (e.dead || e.down) continue;
      live++;
      if (!vis || vis(w, e.x, e.y)) shown++;
      const ed = Math.hypot(e.x - h.x, e.y - h.y) - e.r;
      if (ed < nearest) nearest = ed;
    }
    const attacking = h.targetId !== null && h.targetId !== undefined;
    each((b) => {
      b.ticks++; b.moved += d < 2 ? d : 0; b.onScreenSum += shown; if (shown > b.onScreenMax) b.onScreenMax = shown;
      if (shown === 0) b.emptyTicks++;
      if (shown < NEAR) b.sparseTicks++;
      if (shown >= CROWD) b.crowdTicks++;
      if (attacking) b.attackTicks++;
      if (live === 0) b.noEnemyTicks++;
      if (live > 0 && !attacking) { b.chaseTicks++; if (live <= 2) b.lastChaseTicks++; }
    });
    if (live > 0 && !attacking) { R.chaseDistSum += nearest; R.chaseDistN++; }
    R.endT = w.t; R.floor = w.floorN;
  };
  M.raw = () => R;
  M.summary = function () {
    const sec = (b) => b.ticks / 60;
    const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
    const r1 = (v) => Math.round(v * 10) / 10;
    const view = (b) => ({
      sec: r1(sec(b)), kills: b.kills, killsPerMin: r1(b.kills / Math.max(1e-9, sec(b) / 60)),
      onScreenMean: r1(b.onScreenSum / Math.max(1, b.ticks)), onScreenMax: b.onScreenMax,
      emptyPct: pct(b.emptyTicks, b.ticks), sparsePct: pct(b.sparseTicks, b.ticks), crowdPct: pct(b.crowdTicks, b.ticks),
      attackPct: pct(b.attackTicks, b.ticks), chasePct: pct(b.chaseTicks, b.ticks), lastChasePct: pct(b.lastChaseTicks, b.ticks),
      noEnemyPct: pct(b.noEnemyTicks, b.ticks), choices: b.choices, gains: b.gains, pickups: b.pickups,
      hurtsPerMin: r1(b.hurts / Math.max(1e-9, sec(b) / 60)), dmgTaken: b.dmgTaken, moved: r1(b.moved),
      hitsPerSwing: r1(b.hitSum / Math.max(1, b.swings)), multiSwingPct: pct(b.multiSwings, b.swings), swings: b.swings,
      kinds: b.kinds, sites: b.sites, dom: b.dom, task: b.task,
    });
    const gaps = (ts, end) => {
      const g = []; let p = 0;
      for (const t of ts) { g.push(t - p); p = t; }
      g.push(end - p);
      g.sort((x, y) => x - y);
      return { n: ts.length, median: r1(g[Math.floor(g.length / 2)]), max: r1(g[g.length - 1]), mean: r1(end / Math.max(1, ts.length)) };
    };
    const t = R.total;
    const ttk = {};
    let fodderN = 0, fodderHits = 0;
    for (const k of Object.keys(R.ttk)) {
      const x = R.ttk[k];
      ttk[k] = { n: x.n, swingsToKill: r1(x.directHits / x.n), secToKill: r1(x.sec / x.n) };
      fodderN += x.n; fodderHits += x.directHits;
    }
    const cardDmg = Object.keys(R.dmgBySource).filter((k) => k !== 'slash' && k !== 'dash').reduce((s, k) => s + R.dmgBySource[k], 0);
    const allDmg = Object.keys(R.dmgBySource).reduce((s, k) => s + R.dmgBySource[k], 0);
    const first60 = (ts) => ts.filter((x) => x <= 60).length;
    const m0 = R.minutes[0] ? view(R.minutes[0]) : null;
    const events = t.kills + t.pickups + t.choices;
    const sw = R.reachAtSwing, swN = sw.reduce((s, v) => s + v, 0);
    return {
      seed: R.seed, hand: R.hand, result: R.result || 'running', floor: R.floor, sec: r1(R.endT),
      level: w && w.hero.level !== undefined ? w.hero.level : null,
      unseenHits: w && w.stats.unseenHits !== undefined ? w.stats.unseenHits : null,
      killsPerHurt: r1(t.kills / Math.max(1, t.hurts)),
      tasks: R.floorOrder.map((n) => R.floors[n].task).filter(Boolean),
      total: view(t),
      choiceGap: gaps(R.choiceT, R.endT), gainGap: gaps(R.gainT, R.endT),
      choicesPerMin: r1(t.choices / Math.max(1e-9, R.endT / 60)),
      movedPerEvent: r1(t.moved / Math.max(1, events)),
      chaseMeanDist: r1(R.chaseDistSum / Math.max(1, R.chaseDistN)),
      swingsToKillAll: r1(fodderHits / Math.max(1, fodderN)), ttk,
      inReachAtSwing: { one: pct(sw[1], swN), two: pct(sw[2], swN), threePlus: pct(swN - sw[0] - sw[1] - sw[2], swN) },
      cardDamagePct: pct(cardDmg, allDmg), dmgBySource: R.dmgBySource,
      cardEventsPerMin: r1(R.cardEvents / Math.max(1e-9, R.endT / 60)), cardEventKinds: R.cardEventKinds,
      first: R.first,
      first60: { kills: first60(R.killT), choices: first60(R.choiceT), gains: first60(R.gainT), pickups: first60(R.pickupT), hurts: first60(R.hurtT), minute: m0 },
      minutes: R.minutes.map(view).map((v) => ({ sec: v.sec, kills: v.kills, onScreenMean: v.onScreenMean, sparsePct: v.sparsePct, attackPct: v.attackPct, choices: v.choices, gains: v.gains, pickups: v.pickups, hurts: Math.round(v.hurtsPerMin * v.sec / 60) })),
      floors: R.floorOrder.map((n) => Object.assign({ floor: n }, view(R.floors[n]))),
      hurtBy: R.hurtBy, timeline: R.timeline,
    };
  };
  return M;
}

// One whole run in Node with the pilot and the collector. o: {seed, hand, tier, altar, trial, maxSec}
function runNode(BD, o) {
  const app = BD.createApp({ storage: BD.progress.memoryStorage(), params: { nosave: true } });
  app.botOn = false;
  const met = makeMetrics(BD);
  app.onWorld((w) => met.attach(w));
  app.startRun({ seed: o.seed, tier: o.tier || 0, hand: o.hand });
  const w = app.world;
  const pilot = makePilot(BD, o.seed, o);
  const maxTicks = Math.round((o.maxSec || 1500) * 60);
  let guard = 0;
  while (app.mode === 'play' && w.ticks < maxTicks && guard++ < maxTicks * 3) {
    if (pilot.choiceOpen(w)) { const c = pilot.choose(w); app.cmd(c[0], c[1], c[2]); continue; }
    app.input = pilot.think(w);
    if (app.step()) met.tick(w);
  }
  return met.summary();
}

module.exports = { makePilot, makeMetrics, runNode };

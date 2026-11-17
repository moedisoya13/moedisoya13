// The test/automation surface of GDD §13.1. In the browser it is window.__BD (bound to the
// live app); in Node, BD.harness() returns the same shape around a headless app.

const M = BD.math;
const r4 = (v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);

function tgDump(t) {
  const o = { shape: t.shape, x: r4(t.x), y: r4(t.y), remain: r4(t.remain), attack: t.attack || null, dmg: t.dmg || 0, danger: !!t.danger };
  for (const k of ['r', 'dir', 'half', 'len', 'width', 'r0', 'r1']) if (t[k] !== undefined) o[k] = r4(t[k]);
  return o;
}

BD.dump = function (app) {
  const w = app.world;
  const base = { v: 1, seed: w ? w.seed : null, tier: w ? w.tier : null, mode: app.mode, overlay: app.overlay() };
  if (!w) return base;
  const h = w.hero;
  return Object.assign(base, {
    t: r4(w.t), clock: BD.flow.clockStr(w), floor: w.floorN, domType: w.floor.domType, nextDomType: w.floor.nextDomType,
    wave: w.trial && w.trial.state === 'active' ? 'trial' : w.wave ? w.wave.n : null,
    grid: { w: w.grid.w, h: w.grid.h, cells: w.grid.toString() },
    hero: {
      x: r4(h.x), y: r4(h.y), hp: h.hp, maxHp: h.maxHp, facing: r4(h.face), dashCd: r4(h.dashCd),
      invuln: r4(Math.max(h.invuln, h.dashInvuln)), radiance: h.radiance, targetId: h.targetId,
    },
    cards: w.cards.filter(Boolean).map((c) => ({
      id: c.id, slot: c.slot, awakened: !!c.state.awakened, progress: c.state.progress, goal: c.state.goal,
      stack: c.state.stack, timer: c.state.timer === null || c.state.timer === undefined ? null : r4(c.state.timer),
    })),
    enemies: w.enemies.filter((e) => !e.dead).map((e) => ({
      id: e.id, kind: e.kind, type: e.type, x: r4(e.x), y: r4(e.y), hp: e.hp, elite: e.elite, guardian: e.guardian,
      state: e.down ? 'down' : e.state, statuses: Object.keys(e.statuses).sort(),
    })),
    telegraphs: w.telegraphs.map(tgDump),
    projectiles: w.projectiles.length,
    particles: w.particleCount || 0,
    pickups: w.pickups.map((p) => ({ kind: p.kind, x: r4(p.x), y: r4(p.y) })),
    stairs: { open: !!(w.stairs && w.stairs.open) },
    altar: { state: w.altar ? w.altar.state : 'none', offers: w.altar ? w.altar.offers.slice() : [] },
    trial: { state: w.trial ? w.trial.state : 'none' },
    counts: { kills: w.stats.kills, hurts: w.stats.hurts, dodges: w.stats.dodges, trials: w.stats.trials },
    rifts: w.rifts.length + w.queue.length,
  });
};

// Hash of the dump. `particles` is presentation-only (browser effect layer) and excluded.
BD.dumpHash = function (app) {
  const d = BD.dump(app);
  delete d.particles;
  return BD.hashStr(JSON.stringify(d));
};

// Run one whole game headless. o: {seed, tier, hand, maxSec, bot (default true), trial, floor, hashAt: [sec]}
BD.simRun = function (o) {
  o = o || {};
  const app = BD.createApp({ storage: BD.progress.memoryStorage(), params: { nosave: true } });
  if (o.unlocked) app.save.unlocked = o.unlocked.slice();
  app.botOn = o.bot !== false;
  app.botOpts = { trial: !!o.trial };
  app.startRun({ seed: o.seed, tier: o.tier, hand: o.hand, floor: o.floor });
  const w = app.world;
  const maxTicks = Math.round((o.maxSec || 1500) / BD.C.TICK);
  const hashes = {};
  const hashAt = (o.hashAt || [60]).map((s) => Math.round(s / BD.C.TICK));
  let guard = 0;
  while (app.mode === 'play' && w.ticks < maxTicks && guard < maxTicks * 3) {
    guard++;
    const before = w.ticks;
    app.step();
    if (w.ticks !== before && hashAt.includes(w.ticks)) hashes[r4(w.ticks * BD.C.TICK)] = BD.dumpHash(app);
    if (o.onTick) o.onTick(app);
  }
  const s = app.lastResult;
  return {
    result: s ? s.result : 'timeout', floor: w.floorN, sec: r4(w.t), kills: w.stats.kills,
    cards: w.cards.filter(Boolean).map((c) => c.id), events: w.bus.count(), hashes, cause: s ? s.cause : null,
    summary: s, app,
  };
};

// Stage floor n of the running world at any size with `enemies` live enemies (tests, profiling,
// screenshots; never used by the game). Waves stop (wave 3, no guardian), the entry freeze is
// skipped, enemies stand on random floor cells at least minDist from the hero (bottom corner).
// o: {size: [W, H] (default [48, 48]), enemies (150), kinds (every non-boss kind), floor (2), minDist (6)}
BD.stageFloor = function (w, o) {
  o = o || {};
  const n = o.floor || 2, old = w.run.floors[n];
  const f = BD.gen.floor(w.seed, w.tier, n, old.domType, old.nextDomType, { size: o.size || [48, 48], offscreen: o.offscreen });
  w.run.floors[n] = f;
  BD.flow.enterFloor(w, n);
  w.enemies = []; w.rifts = []; w.queue = []; w.wave.n = 3; w.freezeT = 0;
  const kinds = o.kinds || BD.enemies.all().filter((d) => d.type !== 'boss').map((d) => d.id);
  const rng = BD.sub(w.seed, 'stage', 'spawn' + n);
  let cells = [];
  for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) {
    if (w.grid.walkable(x, y) && M.dist(x + 0.5, y + 0.5, w.hero.x, w.hero.y) >= (o.minDist || 6)) cells.push([x + 0.5, y + 0.5]);
  }
  cells = rng.shuffle(cells);
  const count = o.enemies === undefined ? 150 : o.enemies;
  for (let i = 0; i < count && i < cells.length; i++) BD.W.makeEnemy(w, kinds[i % kinds.length], cells[i][0], cells[i][1], { via: 'placed' });
  return { floor: n, w: w.grid.w, h: w.grid.h, enemies: w.enemies.length };
};

BD.harness = function (app) {
  app = app || BD.createApp({ storage: BD.progress.memoryStorage(), params: { nosave: true } });
  const need = () => { if (!app.world) BD.fail('no run in progress'); return app.world; };
  const api = {
    app,
    state: () => JSON.parse(JSON.stringify(BD.dump(app))),
    hash: () => BD.dumpHash(app),
    step: (n) => { n = n === undefined ? 1 : n; for (let i = 0; i < n; i++) app.step(); return api.state().t; },
    input: (inp) => { app.input = { mx: +inp.mx || 0, my: +inp.my || 0, dash: !!inp.dash }; },
    bot: (on, o) => { app.botOn = !!on; app.botOpts = Object.assign({ trial: false }, o || {}); },
    gen: (seed, tier) => {
      const run = BD.gen.run(seed >>> 0, tier | 0);
      const hand = BD.cardRt.dealHand(seed >>> 0, app.save.unlocked, 0);
      for (let n = 1; n <= 5; n++) run.floors[n].altarPreview = BD.cardRt.offers(run, n, 0, hand, [], app.save.unlocked);
      run.hand = hand;
      return run;
    },
    sim: (o) => { const r = BD.simRun(o); delete r.app; return r; },
    start: (o) => { app.startRun(o); return api.state(); },
    give: (cardId, slot) => { const w = need(); BD.cardRt.equip(w, slot === undefined ? 0 : slot, cardId); },
    goto: (floor) => { const w = need(); BD.flow.enterFloor(w, floor); },
    stage: (o) => BD.stageFloor(need(), o),
    setHp: (n) => { need().hero.hp = Math.max(0, Math.min(need().hero.maxHp, n | 0)); },
    killAll: () => { const w = need(); for (const e of w.enemies.slice()) if (!e.dead) BD.combat.kill(w, e); w.rifts = []; w.queue = []; },
    events: (n) => need().bus.recent(n || 20).map((e) => JSON.parse(JSON.stringify(e, (k, v) => (k === 'shapes' ? undefined : v)))),
    cmd: (name, a, b) => app.cmd(name, a, b),
    world: () => app.world,
  };
  return api;
};

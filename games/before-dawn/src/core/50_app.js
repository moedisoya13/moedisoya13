// App: the DOM-free state machine around runs. mode ∈ title | prep | codex | play | result.
// Overlays: rotate (set by the client), pause | help | settings | tap (UI), altar (from the world).
// The world only advances in mode 'play' with no overlay. The browser shell and the Node
// harness drive the same app object.

const C = BD.C;
BD.MODES = ['title', 'prep', 'codex', 'play', 'result'];
BD.UI_OVERLAYS = ['pause', 'help', 'settings', 'tap'];

// opts: {storage, nowSeed(): number, params: {seed, tier, hand, floor, bot, speed, mute, nosave}}
BD.createApp = function (opts) {
  opts = opts || {};
  const params = Object.assign({}, opts.params || {});
  const app = {
    mode: 'title', uiOverlay: null, rotate: false, world: null, params,
    storage: opts.storage || null, nosave: !!params.nosave,
    save: BD.progress.load(opts.storage),
    input: { mx: 0, my: 0, dash: false },
    botOn: !!params.bot, botOpts: { trial: false },
    lastResult: null, lastRunOpts: null, listeners: [],
  };

  // A fresh seed (time-based in the browser) — the prep screen picks it before dealing.
  app.newSeed = () => (opts.nowSeed ? opts.nowSeed() : 1) >>> 0;

  app.overlay = function () {
    if (app.rotate) return 'rotate';
    if (app.uiOverlay) return app.uiOverlay;
    if (app.mode === 'play' && app.world && app.world.altarOpen) return 'altar';
    return null;
  };

  app.setMode = function (m) {
    if (!BD.MODES.includes(m)) BD.fail(`unknown mode '${m}'`);
    app.mode = m;
    app.uiOverlay = null;
  };
  app.openOverlay = function (o) {
    if (!BD.UI_OVERLAYS.includes(o)) BD.fail(`unknown overlay '${o}'`);
    app.uiOverlay = o;
  };
  app.closeOverlay = function () { app.uiOverlay = null; };
  app.setRotate = function (on) { app.rotate = !!on; };

  // Functions called with (world) right after a world is created, before run_start —
  // the UI uses this to subscribe to the new world's bus.
  app.onWorld = function (fn) { app.listeners.push(fn); };

  // Start a run. o: {seed, tier, hand: [ids] | 'a,b,c', floor, rerolls}
  app.startRun = function (o) {
    o = Object.assign({}, o || {});
    let seed = o.seed;
    if (seed === undefined || seed === null || seed === '') seed = app.newSeed();
    seed = Number(seed) >>> 0;
    const tier = Math.max(0, Math.min(C.TIERS.length - 1, Number(o.tier) || 0));
    const w = BD.createWorld({ seed, tier });
    w.unlocked = app.save.unlocked.slice();
    let hand = o.hand;
    if (typeof hand === 'string') hand = hand.trim() ? hand.split(',').map((s) => s.trim()).filter(Boolean) : null;
    if (Array.isArray(hand)) { // explicit hand (may be empty), bypasses the §5.6 dealing rules
      if (hand.length > 3) BD.fail('hand: at most 3 cards');
      for (const id of hand) BD.cards.get(id); // throws on unknown ids
      if (new Set(hand).size !== hand.length) BD.fail('hand: duplicate card ids');
    } else {
      hand = BD.cardRt.dealHand(seed, w.unlocked, o.rerolls || 0);
    }
    app.lastRunOpts = { seed, tier, hand: o.hand ? hand.slice() : null, floor: o.floor || 1 };
    app.world = w;
    app.lastResult = null;
    for (const fn of app.listeners) fn(w);
    hand.forEach((id, i) => BD.cardRt.equip(w, i, id));
    BD.W.emit(w, 'run_start', { seed, tier, hand: hand.slice() });
    const floor = Math.max(1, Math.min(6, Number(o.floor) || 1));
    w.hero.radiance = Math.min(C.RADIANCE_MAX, floor - 1);
    BD.flow.enterFloor(w, floor);
    app.setMode('play');
    return w;
  };

  app.retry = function (sameSeed) {
    const o = app.lastRunOpts || {};
    return app.startRun(sameSeed ? o : { tier: o.tier });
  };
  app.toTitle = function () { app.world = null; app.setMode('title'); };

  app.pause = function () { if (app.mode === 'play' && !app.overlay()) app.openOverlay('pause'); };
  app.resume = function () { if (app.uiOverlay === 'pause') app.closeOverlay(); };
  app.giveUp = function () {
    if (app.mode !== 'play' || !app.world) return;
    app.closeOverlay();
    BD.flow.heroDies(app.world, 'giveup');
    app.step();
  };

  // Commands from overlays or the bot: 'altar' with [cmd, arg].
  app.cmd = function (name, a, b) {
    if (name === 'altar') return BD.flow.altarCmd(app.world, a, b);
    BD.fail(`unknown app command '${name}'`);
  };

  app.finishRun = function () {
    const w = app.world;
    const sum = BD.progress.summary(w, w.over.result, w.over.cause);
    sum.unlocks = BD.progress.endRun(app.save, sum);
    if (!app.nosave) BD.progress.store(app.storage, app.save);
    app.lastResult = sum;
    app.setMode('result');
  };

  // One fixed tick. Returns true if the world advanced.
  app.step = function () {
    const w = app.world;
    if (app.mode !== 'play' || !w) return false;
    if (app.rotate || app.uiOverlay) return false;
    if (w.altarOpen) {
      if (app.botOn) { const c = BD.bot.altar(w, app.botOpts); app.cmd('altar', c[0], c[1]); }
      return false;
    }
    w.input = app.botOn ? BD.bot.think(w, app.botOpts) : app.input;
    BD.tick(w);
    if (w.over) { app.finishRun(); return true; }
    return true;
  };

  app.setSettings = function (patch) {
    Object.assign(app.save.settings, patch);
    if (!app.nosave) BD.progress.store(app.storage, app.save);
  };

  return app;
};

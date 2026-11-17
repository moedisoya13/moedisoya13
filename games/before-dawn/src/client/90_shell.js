// Browser shell: URL parameters (GDD §13.1), storage, the app, the ui context, window.__BD,
// the frame loop (fixed 1/60 ticks, ≤ 5 catch-up ticks per frame × speed), orientation and
// focus handling, and the draw order of screens, HUD and overlays.

const C = BD.C;
const SH = BD.client.shell = {};

SH.params = function (search) {
  const q = new URLSearchParams(search || '');
  const num = (k) => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : undefined);
  return {
    seed: num('seed'), tier: num('tier') || 0, hand: q.get('hand') || undefined, floor: num('floor'),
    bot: q.get('bot') === '1', speed: Math.max(1, Math.min(64, num('speed') || 1)),
    mute: q.get('mute') === '1', nosave: q.get('nosave') === '1',
  };
};

SH.storage = function () {
  // Every access guarded: the game must run when localStorage throws.
  let ls = null;
  try { ls = window.localStorage; } catch (err) { ls = null; }
  return {
    getItem(k) { try { return ls ? ls.getItem(k) : null; } catch (err) { return null; } },
    setItem(k, v) { try { if (ls) ls.setItem(k, v); } catch (err) { /* ignore */ } },
  };
};

function makeUi(app, view) {
  const ui = {
    app, view, g: view.g, time: 0, dt: 0, buttons: [], layer: 'hud', focus: 0, fx: BD.client.fx,
    assets: BD.client.assets, render: BD.client.render,
  };
  Object.defineProperty(ui, 'world', { get: () => app.world });
  ui.sfx = (id, opts) => BD.client.sfx(id, opts);
  ui.sfxSafe = (id, opts) => { if (BD.ui.sfx.has(id)) BD.client.sfx(id, opts); };
  ui.unlockAudio = () => { BD.client.audio.unlock(); BD.client.audio.setVolume(app.save.settings.sfx); };
  // Buttons are declared while drawing; hits use the last frame's list.
  // spec: {x, y, w, h, label, onTap, onPress, menu (keyboard focusable), style: 'primary'|'plain'|'none', size}
  ui.button = function (spec) {
    const b = Object.assign({ layer: ui.layer, style: 'plain' }, spec);
    ui.buttons.push(b);
    if (b.style === 'none') return b;
    const g = ui.g, menu = ui.buttons.filter((x) => x.menu && x.layer === b.layer);
    const focused = b.menu && ui.activeLayer() === b.layer && menu[ui.focus % Math.max(1, menu.length)] === b;
    g.fillStyle = b.style === 'primary' ? '#1d1a14' : '#0a0a0c';
    g.fillRect(b.x, b.y, b.w, b.h);
    g.lineWidth = focused ? 3 : 2;
    g.strokeStyle = focused ? BD.ui.ORANGE : b.style === 'primary' ? '#d9b45a' : '#6d6a64';
    g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    if (b.label) ui.text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, { size: b.size || 22, color: '#f3ead8', align: 'center', base: 'middle' });
    return b;
  };
  ui.activeLayer = () => (app.overlay() ? 'overlay' : app.mode === 'play' ? 'hud' : 'screen');
  ui.hitButton = function (x, y) {
    const L = ui.activeLayer();
    for (let i = ui.lastButtons.length - 1; i >= 0; i--) {
      const b = ui.lastButtons[i];
      if (b.layer !== L && !(L === 'hud' && b.layer === 'screen')) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  };
  ui.lastButtons = [];
  ui.key = function (ev) {
    const L = ui.activeLayer();
    const reg = L === 'overlay' ? BD.ui.overlays : BD.ui.screens;
    const id = L === 'overlay' ? app.overlay() : app.mode;
    if (reg.has(id) && reg.get(id).key && reg.get(id).key(ev, ui)) return true;
    const menu = ui.lastButtons.filter((b) => b.menu && b.layer === (L === 'hud' ? 'screen' : L));
    if (!menu.length || (L === 'hud')) return false;
    if (ev.code === 'ArrowDown' || ev.code === 'ArrowRight') { ui.focus = (ui.focus + 1) % menu.length; return true; }
    if (ev.code === 'ArrowUp' || ev.code === 'ArrowLeft') { ui.focus = (ui.focus + menu.length - 1) % menu.length; return true; }
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { const b = menu[ui.focus % menu.length]; if (b && b.onTap) { ui.sfxSafe('ui_ok'); b.onTap(); } return true; }
    const d = /^Digit([1-9])$/.exec(ev.code);
    if (d && menu[Number(d[1]) - 1]) { const b = menu[Number(d[1]) - 1]; if (b.onTap) { ui.sfxSafe('ui_ok'); b.onTap(); } return true; }
    return false;
  };
  // text helper: opts {size, color, align, base, weight, stroke (ink outline px), maxW}
  ui.text = function (s, x, y, o) {
    o = o || {};
    const g = ui.g;
    g.font = BD.ui.font(o.size || 18, o.weight || 700);
    g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.stroke; g.strokeStyle = BD.ui.INK; g.strokeText(s, x, y, o.maxW); }
    g.fillStyle = o.color || '#f3ead8';
    g.fillText(s, x, y, o.maxW);
  };
  ui.drawEffects = function (g, layer) {
    for (const ef of BD.ui.effects.all()) if (ef.draw) ef.draw(g, ui, layer);
    BD.client.fx.draw(g, view, layer);
  };
  // first run uses the URL parameters; later runs use app.retry
  ui.startRun = function (o) {
    const p = app.params;
    app.startRun(Object.assign({ seed: p.seed, tier: p.tier, hand: p.hand, floor: p.floor }, o || {}));
    ui.focus = 0;
  };
  return ui;
}

SH.start = function () {
  const canvas = document.getElementById('bd');
  const view = BD.client.createView(canvas);
  view.resize();
  const params = SH.params(window.location.search);
  const app = BD.createApp({
    storage: SH.storage(), params,
    nowSeed: () => ((Date.now() % 2147483647) ^ Math.floor(performance.now() * 1000)) >>> 0,
  });
  BD.client.audio.muted = params.mute;
  const ui = makeUi(app, view);
  SH.ui = ui; SH.app = app;
  app.onWorld((w) => {
    BD.client.render.onWorld(w);
    BD.client.fx.reset();
    for (const ef of BD.ui.effects.all()) {
      if (ef.reset) ef.reset(ui, w);
      if (ef.on) for (const name of Object.keys(ef.on)) w.bus.on(name, (ev) => ef.on[name](ev, ui), ef);
    }
  });
  window.__BD = Object.assign(BD.harness(app), { ui, params });
  BD.client.input.attach(canvas, ui);
  window.addEventListener('resize', () => view.resize());
  const autoPause = () => { if (!app.botOn) app.pause(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  window.addEventListener('blur', autoPause);

  let last = performance.now(), acc = 0, ready = false;
  BD.client.assets.load().then(() => { ready = true; }, (err) => { console.error(err); ready = true; });

  function frame(ts) {
    const dt = Math.min(0.25, Math.max(0, (ts - last) / 1000));
    last = ts;
    ui.time += dt; ui.dt = dt;
    app.setRotate(view.portrait);
    if (ready && app.mode === 'play' && !app.overlay()) {
      acc += dt * params.speed;
      let n = Math.floor(acc / C.TICK + 1e-6);
      const cap = C.MAX_CATCHUP * params.speed;
      if (n > cap) { n = cap; acc = 0; } else acc -= n * C.TICK;
      for (let i = 0; i < n && app.mode === 'play'; i++) {
        app.input = BD.client.input.current();
        app.step();
        if (app.input.dash) BD.client.input.consumeDash();
      }
    } else {
      acc = 0;
      if (app.mode === 'play' && app.botOn && app.world && app.world.altarOpen && !app.uiOverlay && !app.rotate) app.step();
    }
    BD.client.fx.update(dt);
    for (const ef of BD.ui.effects.all()) if (ef.update) ef.update(dt, ui);
    if (app.world) app.world.particleCount = BD.client.fx.list.length;
    draw(ui, dt, ready);
    requestAnimationFrame(frame);
  }

  function draw(ui, dt, ready) {
    ui.lastButtons = ui.buttons; ui.buttons = [];
    view.begin();
    const g = view.g;
    g.save();
    view.clipLogical();
    if (!ready) {
      g.fillStyle = '#05060d'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
      ui.text('불러오는 중…', C.VIEW_W / 2, C.VIEW_H / 2, { align: 'center', size: 24 });
    } else {
      if (app.mode === 'play' && app.world) {
        BD.client.render.drawWorld(g, ui, app.overlay() ? 0 : dt);
        ui.layer = 'hud';
        for (const h of BD.ui.hud.all().sort((a, b) => (a.order || 0) - (b.order || 0))) h.draw(g, ui);
      }
      ui.layer = 'screen';
      if (BD.ui.screens.has(app.mode)) BD.ui.screens.get(app.mode).draw(g, ui);
      else if (app.mode !== 'play') BD.ui.screens.get(app.mode); // throws: mode without a screen
      const ov = app.overlay();
      if (ov) { ui.layer = 'overlay'; BD.ui.overlays.get(ov).draw(g, ui); }
      ui.drawEffects(g, 'screen');
    }
    g.restore();
  }
  requestAnimationFrame(frame);
};

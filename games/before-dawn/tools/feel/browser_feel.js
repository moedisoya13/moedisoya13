#!/usr/bin/env node
// Feel measurements that need the built game in a browser (Playwright + Chromium).
//   node tools/feel/browser_feel.js                    all sections
//   node tools/feel/browser_feel.js --only latency,stick,touch,hud,hitstop,sound,warn,shots
// Screenshots go to docs/screens/feel/ (override with --out DIR).
'use strict';
const path = require('path');
const fs = require('fs');
const K = require('./_kit');
const UH = require(path.join(__dirname, '..', '..', 'tests', 'ui', '_harness'));
const o = K.args();
const only = o.only ? String(o.only).split(',') : null;
const want = (s) => !only || only.includes(s);
const OUT = path.resolve(o.out || path.join(__dirname, '..', '..', 'docs', 'screens', 'feel'));
fs.mkdirSync(OUT, { recursive: true });
const URL0 = UH.variant({ standins: false });
const PHONE = { width: 667, height: 375 }, TABLET = { width: 1024, height: 768 }, LAPTOP = { width: 1280, height: 720 };
const MM = { '667x375': 104.1 / 667, '1024x768': 197.1 / 1024 }; // mm per CSS px: 4.7" phone, 9.7" tablet

async function playing(vp, query, touch) {
  const T = await UH.open(URL0, { query: '?seed=5&hand=&mute=1&nosave=1' + (query || ''), context: { viewport: vp, hasTouch: !!touch, deviceScaleFactor: touch ? 2 : 1 } });
  await T.key('Enter');
  if ((await T.mode()) !== 'play') await T.key('Enter');
  if ((await T.mode()) !== 'play') throw new Error('not in play: ' + (await T.mode()));
  await T.eval(() => { const B = window.__BD, w = B.world(); B.killAll(); w.wave.n = 3; w.freezeT = 0; w.hero.x = w.grid.w / 2; w.hero.y = w.grid.h / 2; w.hero.atkTimer = 1e9; });
  return T;
}
const out = {};
const show = (obj) => Object.keys(obj).map((k) => '  ' + k + ': ' + JSON.stringify(obj[k])).join('\n');

(async () => {
  // -------------------------------------------------------------------------------------------
  if (want('latency')) {
    const T = await playing(LAPTOP);
    const r = await T.eval(async () => {
      const B = window.__BD, w = B.world(), h = w.hero, c = document.getElementById('bd');
      const raf = () => new Promise((res) => requestAnimationFrame(res));
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const dts = []; let last = performance.now();
      for (let i = 0; i < 60; i++) { const t = await raf(); dts.push(t - last); last = t; }
      async function sample(fire, undo, moved, rest) {
        const frames = [], ms = [];
        for (let i = 0; i < 30; i++) {
          await raf(); await sleep(Math.random() * 15);
          const x0 = h.x, y0 = h.y, t0 = performance.now(), d0 = B.events(50).filter((e) => e.type === 'dash').length;
          fire();
          let n = 0;
          while (n < 30) { await raf(); n++; if (moved(x0, y0, d0)) break; }
          frames.push(n); ms.push(performance.now() - t0);
          undo(); for (let k = 0; k < (rest || 3); k++) await raf(); h.dashCd = 0; await raf();
        }
        frames.sort((a, b) => a - b); ms.sort((a, b) => a - b);
        return { framesMin: frames[0], framesMedian: frames[15], framesMax: frames[29], msMedian: Math.round(ms[15]), msMax: Math.round(ms[29]) };
      }
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
      const ptr = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const posMoved = (x0, y0) => Math.hypot(h.x - x0, h.y - y0) > 1e-6;
      const res = { frameMsMedian: dts.sort((a, b) => a - b)[30] };
      res.keyMove = await sample(() => key('keydown', 'KeyD'), () => key('keyup', 'KeyD'), posMoved);
      res.keyStop = await (async () => { // frames from keyup to standing still
        const fr = [];
        for (let i = 0; i < 20; i++) {
          key('keydown', 'KeyD'); await raf(); await raf(); await raf(); await sleep(Math.random() * 15);
          key('keyup', 'KeyD');
          let n = 0, px = h.x;
          while (n < 30) { await raf(); n++; if (h.x === px) break; px = h.x; }
          fr.push(n);
        }
        fr.sort((a, b) => a - b); return { framesMedian: fr[10], framesMax: fr[19] };
      })();
      res.touchMove = await sample(() => { ptr('pointerdown', 300, 400); ptr('pointermove', 345, 400); }, () => { ptr('pointerup', 345, 400); window.BD.client.input.st.lastUp = -1; }, posMoved);
      res.keyDash = await sample(() => key('keydown', 'Space'), () => key('keyup', 'Space'), (x0, y0, d0) => B.events(50).filter((e) => e.type === 'dash').length > d0, 24);
      return res;
    });
    out.latency = r;
    console.log('== latency (frames of the page, 30 samples each, random phase) ==\n' + show(r));
    await T.close();
  }

  // -------------------------------------------------------------------------------------------
  if (want('stick')) {
    out.stick = {};
    for (const vp of [PHONE, TABLET]) {
      const T = await playing(vp, '', true);
      const name = vp.width + 'x' + vp.height;
      const scale = await T.eval(() => window.__BD.ui.view.scale);
      const rows = [];
      for (const d of [2, 4, 6, 7, 8, 10, 14, 18, 21, 25, 32, 40, 60]) {
        await T.pointer('pointerdown', 200, 200, 9); await T.pointer('pointermove', 200 + d, 200, 9);
        const mag = await T.eval(() => { const i = window.BD.client.input.current(); return Math.hypot(i.mx, i.my); });
        await T.pointer('pointerup', 200 + d, 200, 9);
        await T.eval(() => { window.BD.client.input.st.lastUp = -1; });
        rows.push([d, +mag.toFixed(2)]);
      }
      const dead = 12 * scale, full = 40 * scale, follow = 60 * scale;
      out.stick[name] = {
        scale: +scale.toFixed(3), deadZoneCssPx: +dead.toFixed(1), fullSpeedCssPx: +full.toFixed(1), followCssPx: +follow.toFixed(1),
        deadZoneMm: +(dead * MM[name]).toFixed(1), fullSpeedMm: +(full * MM[name]).toFixed(1), dragCssPx_to_speedShare: rows,
      };
      await T.close();
    }
    console.log('== stick (drag distance in CSS px → share of full speed) ==\n' + show(out.stick));
  }

  // -------------------------------------------------------------------------------------------
  if (want('touch')) {
    const r = out.touch = {};
    const T = await playing(PHONE, '', true);
    const st = () => T.eval(() => window.BD.client.input.stick());
    const dashes = () => T.eval(() => window.__BD.events(400).filter((e) => e.type === 'dash').length);
    const reset = () => T.eval(() => { const h = window.__BD.world().hero; h.dashCd = 0; window.BD.client.input.st.lastUp = -1; window.BD.client.input.st.dashReq = false; });
    const heroPos = () => T.eval(() => { const h = window.__BD.world().hero; return [h.x, h.y]; });
    // pointercancel (palm, OS gesture, finger off the glass edge on some browsers)
    await T.pointer('pointerdown', 200, 200, 1); await T.pointer('pointermove', 240, 200, 1);
    await T.pointer('pointercancel', 240, 200, 1);
    r.pointercancel = (await st()) === null ? 'stick released, hero stops' : 'stick kept';
    await reset();
    // finger slides past the window edge: moves keep arriving with coordinates outside
    await T.pointer('pointerdown', 20, 200, 1); await T.pointer('pointermove', -30, 200, 1);
    const p0 = await heroPos(); await T.wait(200); const p1 = await heroPos();
    r.dragPastLeftEdge = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.3 ? 'keeps moving (coordinates outside the window are used)' : 'stops';
    await T.pointer('pointerup', -30, 200, 1); await reset();
    // second finger elsewhere while the stick is held
    await T.pointer('pointerdown', 200, 200, 1); await T.pointer('pointermove', 240, 200, 1);
    await T.pointer('pointerdown', 400, 150, 2); await T.pointer('pointermove', 400, 100, 2);
    const s2 = await st();
    await T.pointer('pointerup', 400, 100, 2);
    const s3 = await st();
    r.secondFinger = `stick stays with finger ${s2 && s2.id}; second finger ignored; after it lifts stick ${s3 ? 'kept' : 'LOST'}; dash from second finger tap: ${(await dashes()) > 0 ? 'yes' : 'no'}`;
    // second finger on the dash button while the stick is held
    const b = await T.find('hud_dash');
    const [bx, by] = await T.client(b.x + b.w / 2, b.y + b.h / 2);
    const d0 = await dashes();
    await T.pointer('pointerdown', bx, by, 3); await T.wait(60); await T.pointer('pointerup', bx, by, 3); await T.wait(80);
    r.dashButtonWhileStickHeld = (await dashes()) > d0 ? 'dashes' : 'NO DASH';
    await T.pointer('pointerup', 240, 200, 1); await T.wait(400); await reset();
    // double tap: gap between release and next press
    r.doubleTap = {};
    for (const gap of [60, 120, 180, 230, 280, 350]) {
      await reset(); await T.wait(60);
      const n0 = await dashes();
      await T.eval(async (gap) => {
        const c = document.getElementById('bd');
        const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        ev('pointerdown', 250, 200); await sleep(50); ev('pointerup', 250, 200);
        await sleep(gap);
        ev('pointerdown', 250, 200); await sleep(50); ev('pointerup', 250, 200);
      }, gap);
      await T.wait(150);
      r.doubleTap[gap + ' ms'] = (await dashes()) > n0 ? 'dash' : 'no dash';
    }
    // re-grip: drag, lift, press again somewhere else 200 ms later and keep dragging (not a tap)
    r.regrip = {};
    for (const [gap, dx] of [[120, 0], [200, 0], [200, 150], [200, 300], [300, 300]]) {
      await reset(); await T.wait(60);
      const n0 = await dashes();
      await T.eval(async ([gap, dx]) => {
        const c = document.getElementById('bd');
        const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        ev('pointerdown', 150, 200); ev('pointermove', 180, 200); await sleep(300); ev('pointerup', 180, 200);
        await sleep(gap);
        ev('pointerdown', 150 + dx, 220); ev('pointermove', 150 + dx, 190); await sleep(300); ev('pointerup', 150 + dx, 190);
      }, [gap, dx]);
      await T.wait(100);
      r.regrip[`lift ${gap} ms, new press ${dx} css px away, then drag`] = (await dashes()) > n0 ? 'DASH (unintended)' : 'no dash';
    }
    // dash pressed while on cooldown: 0.10 s and 0.03 s before it is ready (button and Space)
    r.dashDuringCooldown = {};
    for (const early of [0.2, 0.1, 0.03]) {
      await reset(); await T.wait(50);
      const res = await T.eval(async (early) => {
        const B = window.__BD, h = B.world().hero;
        const n0 = B.events(400).filter((e) => e.type === 'dash').length;
        h.dashCd = early;
        window.BD.client.input.st.dashReq = true; // what the button's onPress and the Space key do
        await new Promise((res) => setTimeout(res, 500));
        return B.events(400).filter((e) => e.type === 'dash').length > n0;
      }, early);
      r.dashDuringCooldown[early + ' s before ready'] = res ? 'dashes when ready' : 'DROPPED';
    }
    // touch that starts on a card slot
    const slot = (await T.buttons()).find((x) => /slot|card/i.test(x.id || ''));
    if (slot) {
      const [sx, sy] = await T.client(slot.x + slot.w / 2, slot.y + slot.h / 2);
      await T.pointer('pointerdown', sx, sy, 5); await T.pointer('pointermove', sx + 30, sy, 5);
      const s = await st();
      await T.pointer('pointerup', sx + 30, sy, 5); await T.wait(100);
      r.touchStartsOnCardSlot = `stick ${s ? 'starts' : 'does not start'}; overlay after drag-release: ${await T.overlay()}`;
      if (await T.overlay()) await T.eval(() => window.__BD.app.resume());
    }
    await T.close();
    console.log('== touch ==\n' + show(r));
  }

  // -------------------------------------------------------------------------------------------
  if (want('hud')) {
    out.hud = {};
    for (const vp of [PHONE, TABLET, LAPTOP]) {
      const T = await playing(vp, '', vp !== LAPTOP);
      const name = vp.width + 'x' + vp.height;
      const r = await T.eval(() => {
        const B = window.__BD, v = B.ui.view, w = B.world();
        const bs = B.ui.debug.buttons().filter((b) => b.layer === 'hud');
        const rect = (b) => ({ id: b.id || b.label, cssW: +(b.w * v.scale).toFixed(0), cssH: +(b.h * v.scale).toFixed(0), cssCx: +(v.offX + (b.x + b.w / 2) * v.scale).toFixed(0), cssCy: +(v.offY + (b.y + b.h / 2) * v.scale).toFixed(0), fromRight: +(v.cw - (v.offX + (b.x + b.w / 2) * v.scale)).toFixed(0), fromBottom: +(v.ch - (v.offY + (b.y + b.h / 2) * v.scale)).toFixed(0) });
        // floor cells whose centre is drawn under a HUD rectangle
        let covered = 0, total = 0; const by = {};
        const hudRects = bs.map((b) => [b.id || b.label, b.x, b.y, b.w, b.h]).concat([['hp', 16, 16, 340, 64], ['clock', 1050, 16, 214, 80]]);
        for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) {
          if (!w.grid.walkable(x, y)) continue; total++;
          const [sx, sy] = v.proj(x + 0.5, y + 0.5);
          for (const [id, rx, ry, rw, rh] of hudRects) if (sx >= rx && sx <= rx + rw && sy >= ry && sy <= ry + rh) { covered++; by[id] = (by[id] || 0) + 1; break; }
        }
        return { scale: +v.scale.toFixed(3), letterbox: [Math.round(v.offX), Math.round(v.offY)], buttons: bs.map(rect), floorCells: total, floorCellsUnderHud: covered, underWhich: by, room: [w.grid.w, w.grid.h] };
      });
      out.hud[name] = r;
      await T.close();
    }
    console.log('== hud (button sizes in CSS px; floor cells drawn under HUD) ==\n' + show(out.hud));
  }

  // -------------------------------------------------------------------------------------------
  if (want('hitstop')) {
    // real-time play by the bot at speed 1: how much of the time is the world held by hit-stop?
    const T = await UH.open(URL0, { query: '?seed=3&mute=1&nosave=1&floor=2', context: { viewport: LAPTOP } });
    await T.key('Enter'); if ((await T.mode()) !== 'play') await T.key('Enter');
    const r = await T.eval(async () => {
      const B = window.__BD; B.bot(true);
      const raf = () => new Promise((res) => requestAnimationFrame(res));
      let frames = 0, held = 0, run = 0, longest = 0, runs = 0, last = performance.now(), slow = 0;
      const t0 = performance.now(), wt0 = B.world().t;
      while (performance.now() - t0 < 30000 && B.app.mode === 'play') {
        const t = await raf(); frames++;
        if (t - last > 25) slow++; last = t;
        if (B.app.overlay()) continue;
        if (B.params.speed === 0) { held++; run++; longest = Math.max(longest, run); } else { if (run) runs++; run = 0; }
      }
      const ev = B.events(4000);
      return { frames, heldFrames: held, heldShare: +(held / frames).toFixed(3), holdsPerMin: +(runs / ((performance.now() - t0) / 60000)).toFixed(0), longestHoldFrames: longest, slowFrames: slow, worldSecPerRealSec: +((B.world().t - wt0) / ((performance.now() - t0) / 1000)).toFixed(2), swings: ev.filter((e) => e.type === 'swing').length, kills: ev.filter((e) => e.type === 'kill').length, hurts: ev.filter((e) => e.type === 'hurt').length };
    });
    out.hitstop = r;
    console.log('== hitstop (bot, 30 s real time, speed 1) ==\n' + show(r));
    await T.close();
  }

  // -------------------------------------------------------------------------------------------
  if (want('sound')) {
    // which sounds are requested, and in which frame relative to the event that causes them
    const T = await UH.open(URL0, { query: '?seed=3&nosave=1&floor=2', context: { viewport: LAPTOP } });
    await T.eval(() => {
      const B = window.BD, log = window.__sfx = [];
      const reg = B.ui.sfx.get.bind(B.ui.sfx);
      const orig = B.client.sfx;
      B.client.sfx = function (id, opts) { const w = window.__BD.world(); log.push({ id, tick: w ? w.ticks : -1, audio: !!(B.client.audio.ac) && !B.client.audio.muted, state: B.client.audio.ac ? B.client.audio.ac.state : 'none' }); return orig(id, opts); };
      void reg;
    });
    await T.key('Enter'); if ((await T.mode()) !== 'play') await T.key('Enter');
    const r = await T.eval(async () => {
      const B = window.__BD, w = B.world(); B.bot(true);
      const marks = [];
      for (const name of ['swing', 'hit', 'kill', 'hurt', 'dash', 'telegraph', 'dodge']) w.bus.on(name, () => marks.push({ name, tick: w.ticks, at: window.__sfx.length }));
      await new Promise((res) => setTimeout(res, 20000));
      const want = { swing: 'slash', hit: 'hit', kill: 'kill', hurt: 'hurt', dash: 'dash', telegraph: ['telegraph', 'blink'], dodge: 'dodge' };
      const res = {};
      for (const m of marks) {
        const ids = [].concat(want[m.name]);
        const hit = window.__sfx.find((s, i) => i >= m.at - 3 && ids.includes(s.id) && s.tick === m.tick);
        const k = res[m.name] || (res[m.name] = { events: 0, soundSameTick: 0 });
        k.events++; if (hit) k.soundSameTick++;
      }
      const ids = {}; for (const s of window.__sfx) ids[s.id] = (ids[s.id] || 0) + 1;
      return { perEvent: res, requested: ids, audioContext: window.__sfx.length ? window.__sfx[window.__sfx.length - 1].state : 'none', registered: window.BD.ui.sfx.ids().length };
    });
    out.sound = r;
    console.log('== sound (bot, 20 s; a sound request in the same tick as its event) ==\n' + show(r));
    await T.close();
  }

  // -------------------------------------------------------------------------------------------
  if (want('warn')) {
    // contrast of a fresh warning against each floor colour: mean colour inside a fire circle
    // (between 45 % and 85 % of its radius) vs the floor just outside, 0.1 s after it appears
    // and at half fill. Uses node-side gen() to find a seed/floor of each dominant type.
    const BD = K.load(), H = BD.harness();
    const find = {};
    for (let s = 1; s < 80 && Object.keys(find).length < 5; s++) { const g = H.gen(s, 0); for (let n = 1; n <= 6; n++) { const d = g.floors[n].domType; if (!find[d] && g.floors[n].pattern === 'open') find[d] = [s, n]; } }
    for (let s = 1; s < 80 && Object.keys(find).length < 5; s++) { const g = H.gen(s, 0); for (let n = 1; n <= 6; n++) { const d = g.floors[n].domType; if (!find[d]) find[d] = [s, n]; } }
    out.warn = {};
    for (const type of Object.keys(find)) {
      const [seed, floor] = find[type];
      const T = await UH.open(URL0, { query: `?seed=${seed}&floor=${floor}&hand=&mute=1&nosave=1`, context: { viewport: LAPTOP } });
      await T.key('Enter'); if ((await T.mode()) !== 'play') await T.key('Enter');
      const row = { seed, floor };
      await T.eval(() => {
        const B = window.__BD, w = B.world(); B.params.speed = 0; // freeze the loop; step by hand
        if (w.floorN === 6) { for (const e of w.enemies) { e.stunT = 1e9; e.x = 1.5; e.y = 1.5; } w.rifts = []; } // killing the boss would end the run
        else { B.killAll(); w.wave.n = 3; }
        w.freezeT = 0; w.hero.atkTimer = 1e9;
        w.hero.x = w.grid.w / 2; w.hero.y = w.grid.h / 2;
        window.BD.hazards.telegraph(w, { shape: 'circle', x: w.hero.x + 2.6, y: w.hero.y - 0.2, r: 1.3, time: 0.9, dmg: 12, attack: 'fire_circle' });
        window.BD.hazards.telegraph(w, { shape: 'fan', x: w.hero.x - 1.2, y: w.hero.y + 1.6, dir: -2.2, half: 30, r: 1.3, time: 0.45, dmg: 7, attack: 'stab' });
        w.hero.invuln = 5;
      });
      const sample = () => T.eval(() => {
        const B = window.__BD, v = B.ui.view, w = B.world(), c = document.getElementById('bd'), g = c.getContext('2d');
        const tg = w.telegraphs.find((t) => t.shape === 'circle');
        const px = (wx, wy) => { const [lx, ly] = v.proj(wx, wy); const d = g.getImageData(Math.round((v.offX + lx * v.scale) * v.dpr) - 2, Math.round((v.offY + ly * v.scale) * v.dpr) - 2, 5, 5).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return [r / n, gg / n, b / n]; };
        const avg = (k0, k1) => { let s = [0, 0, 0], n = 0; for (let a = 0; a < 24; a++) for (const k of [k0, (k0 + k1) / 2, k1]) { const p = px(tg.x + Math.cos(a / 24 * 6.2832) * tg.r * k, tg.y + Math.sin(a / 24 * 6.2832) * tg.r * k); s = s.map((q, i) => q + p[i]); n++; } return s.map((q) => q / n); };
        const lum = (c3) => { const f = (u) => { u /= 255; return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c3[0]) + 0.7152 * f(c3[1]) + 0.0722 * f(c3[2]); };
        const inn = avg(0.45, 0.85), outc = avg(1.2, 1.4);
        const la = lum(inn), lb = lum(outc);
        return { inside: inn.map(Math.round), outside: outc.map(Math.round), rgbDist: Math.round(Math.hypot(inn[0] - outc[0], inn[1] - outc[1], inn[2] - outc[2])), contrast: +((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2) };
      });
      await T.eval(() => window.__BD.step(6)); await T.wait(120);
      row.at0_1s = await sample();
      await T.shot(path.join(OUT, `warn_${type}_0.1s.png`));
      await T.eval(() => window.__BD.step(21)); await T.wait(120);
      row.atHalf = await sample();
      await T.shot(path.join(OUT, `warn_${type}_0.45s.png`));
      out.warn[type] = row;
      await T.close();
    }
    console.log('== warn (fire circle vs floor; rgbDist 0–441, WCAG-style contrast ratio) ==');
    for (const k of Object.keys(out.warn)) console.log(k.padEnd(8), JSON.stringify(out.warn[k]));
  }

  // -------------------------------------------------------------------------------------------
  if (want('shots')) {
    for (const [vp, name] of [[PHONE, 'phone_667x375'], [TABLET, 'tablet_1024x768']]) {
      const T = await UH.open(URL0, { query: '?seed=3&mute=1&nosave=1&floor=2', context: { viewport: vp, hasTouch: true, deviceScaleFactor: 2 } });
      await T.key('Enter'); if ((await T.mode()) !== 'play') await T.key('Enter');
      await T.eval(() => { const B = window.__BD; B.bot(true); });
      await T.wait(6000);
      await T.eval(() => { const B = window.__BD; B.bot(false); B.params.speed = 0; });
      await T.pointer('pointerdown', vp.width * 0.2, vp.height * 0.7, 1); await T.pointer('pointermove', vp.width * 0.2 + 18, vp.height * 0.7 - 10, 1);
      await T.wait(150);
      await T.shot(path.join(OUT, `play_${name}_stick.png`));
      await T.close();
    }
    console.log('== shots == written to ' + OUT);
  }

  if (o.json) console.log('JSON ' + JSON.stringify(out));
})().catch((e) => { console.error(e); process.exit(1); });

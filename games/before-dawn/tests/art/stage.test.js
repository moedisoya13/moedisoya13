// The stage art in the built page (headless Chromium): every SOLID cell is drawn by exactly one
// prop whose footprint is SOLID (what is drawn is what collides) on the showcase floors of every
// layout, on engine-staged floors and on the v2 generator's floors of every layout (whose props are
// all named by the generator) and the rooftop; every catalogue prop, site state and wall item draws on
// every floor type; the sky is skipped where the stage covers the screen; a v1 room still paints
// its one screen cache; no console errors.
'use strict';

async function open(t) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(t.dist + '?seed=11&mute=1&nosave=1&hand=pierce,flame,leech');
  await page.waitForFunction(() => window.__BD && window.BD.client.assets.ready);
  await page.evaluate(() => { const B = window.__BD; if (!B.app.world) B.ui.startRun(); if (B.app.uiOverlay) B.app.closeOverlay(); });
  await page.waitForTimeout(200);
  await page.evaluate((src) => { window.__CHECK = src; }, CHECK);
  return { browser, page, errors, ev: (fn, a) => page.evaluate(fn, a), close: () => browser.close() };
}

// in the page: footprint check of the current floor's stage model
const CHECK = `(function () {
  const BD = window.BD, w = window.__BD.world(), m = BD.client.render.stage.of(w), g = w.grid, bad = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const i = m.cellProp[y * g.w + x], solid = g.get(x, y) === BD.CELL.SOLID;
    if (solid && i < 0) bad.push('solid without prop ' + x + ',' + y);
    if (!solid && i >= 0) bad.push('prop on free cell ' + x + ',' + y);
  }
  m.props.forEach((p, i) => {
    const d = BD.client.render.props.get(p.id);
    if (!BD.client.render.props.has(p.id)) bad.push('unknown id ' + p.id);
    if (!p.given && !d.fit(p.w, p.h)) bad.push(p.id + ' does not fit ' + p.w + 'x' + p.h);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (g.get(x, y) !== BD.CELL.SOLID) bad.push(p.id + ' footprint on a free cell ' + x + ',' + y);
      else if (m.cellProp[y * g.w + x] !== i) bad.push(p.id + ' cell owned by another prop ' + x + ',' + y);
    }
  });
  return { bad: bad.slice(0, 8), props: m.props.length, ids: [...new Set(m.props.map((p) => p.id))].sort(), layout: m.layout };
})()`;

module.exports = {
  'stage: one prop per rectangle of SOLID cells, footprints = collision, on every layout and on engine floors': async (t) => {
    const P = await open(t);
    try {
      const seen = new Set();
      for (const layout of ['showcase', 'plaza', 'office', 'atrium', 'hall', 'ruin']) {
        await P.ev((layout) => window.BD.client.artStage.stage(window.__BD.world(), { layout }), layout);
        const r = await P.ev(CHECK);
        t.eq(r.bad, [], layout + ': ' + r.bad.join('; '));
        t.assert(r.props > 10, layout + ' has props: ' + r.props);
        r.ids.forEach((i) => seen.add(i));
      }
      for (const seed of [3, 11, 29]) {
        await P.ev((seed) => { const B = window.__BD; B.app.startRun({ seed }); B.stage({ size: [48, 48], enemies: 0 }); }, seed);
        const r = await P.ev(CHECK);
        t.eq(r.bad, [], 'engine floor seed ' + seed + ': ' + r.bad.join('; '));
      }
      // the v2 generator's floors: each task's layout names every prop (floor.stage.props), so the
      // model infers nothing; the same footprint rule holds; the rooftop names its four pillars
      for (const [task, layout] of [['purge', 'plaza'], ['seals', 'office'], ['nests', 'atrium'], ['hold', 'hall'], ['hunt', 'ruin']]) {
        for (const seed of [5, 17]) {
          const r = await P.ev(([seed, task]) => { const B = window.__BD; B.app.startRun({ seed, task }); const w = B.world(); return Object.assign(eval(window.__CHECK), { given: window.BD.client.render.stage.of(w).props.filter((p) => p.given).length, named: w.floor.stage.props.length }); }, [seed, task]);
          t.eq(r.bad, [], task + ' seed ' + seed + ': ' + r.bad.join('; '));
          t.eq(r.layout, layout, task + ' layout');
          t.eq(r.given, r.props, task + ' seed ' + seed + ': every prop named by the generator');
          t.eq(r.given, r.named);
          r.ids.forEach((i) => seen.add(i));
        }
      }
      const roof = await P.ev(() => { const B = window.__BD; B.app.startRun({ seed: 5 }); B.goto(6); const w = B.world(); return Object.assign(eval(window.__CHECK), { theme: window.BD.client.render.stage.of(w).theme }); });
      t.eq(roof.bad, [], 'rooftop: ' + roof.bad.join('; '));
      t.eq([roof.theme, roof.ids, roof.props], ['rooftop', ['pillar_big'], 4]);
      for (const id of ['wall', 'fountain', 'reception', 'server_rack', 'crystal_mass']) t.assert(seen.has(id), 'generated floors use ' + id);
      for (const id of ['cubicle', 'desk_row', 'partition', 'pillar_big', 'planter', 'wall']) t.assert(seen.has(id), 'showcase floors use ' + id);
      t.eq(await P.ev(() => [...window.BD.client.render.props.unknown]), []);
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },

  'stage: every prop, site state, wall item and growth draws on every floor type; the sheet renders': async (t) => {
    const P = await open(t);
    try {
      const r = await P.ev(() => {
        const R = window.BD.client.render, KIT = R.kit, out = { empty: [], n: 0 };
        for (const theme of ['beast', 'undead', 'magic', 'heavy', 'rooftop']) {
          for (const d of R.props.all()) {
            const sp = R.props.whole({ id: d.id, x: 0, y: 0, w: d.layer === 'decor' ? 1 : (d.fit(2, 2) ? 2 : 1), h: d.layer === 'decor' ? 0.56 : (d.fit(2, 2) ? 2 : 1), v: 1 }, theme, 'office');
            const px = sp.cv.getContext('2d').getImageData(0, 0, sp.cv.width, sp.cv.height).data;
            let ink = 0; for (let i = 3; i < px.length; i += 16) if (px[i] > 200) ink++;
            if (ink < 20) out.empty.push(d.id + '/' + theme);
            out.n++;
          }
          for (const id of R.sites.ids()) for (const st of R.sites.get(id).states) { const c = document.createElement('canvas'); c.width = 200; c.height = 200; R.sites.get(id).draw(c.getContext('2d'), KIT.proj(100, 150), st, { theme }); out.n++; }
        }
        const sheet = window.BD.client.artStage.sheet({ theme: 'undead' });
        out.sheet = [sheet.width, sheet.height];
        return out;
      });
      t.eq(r.empty, [], 'props with no pixels: ' + r.empty.join(', '));
      t.assert(r.n > 150, 'drew ' + r.n);
      t.assert(r.sheet[0] > 1000 && r.sheet[1] > 1000, 'sheet ' + r.sheet);
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },

  'stage: the sky is skipped under a covering stage and drawn where it shows; a v1 room keeps its screen cache': async (t) => {
    const P = await open(t);
    try {
      // a run is v2 (48 × 48 floors) since the proof slice: stage a v1-sized room to see its one cache
      await P.ev(() => window.__BD.stage({ size: [12, 12], enemies: 0 }));
      await P.page.waitForTimeout(300);
      const v1 = await P.ev(() => { const R = window.BD.client.render; return { fits: window.BD.view.fits(window.__BD.world().grid), cache: !!R.cache && R.cache.width > 0 }; });
      t.assert(v1.fits && v1.cache, 'a v1 room paints its screen cache: ' + JSON.stringify(v1));
      await P.ev(() => { const B = window.__BD; window.BD.client.artStage.stage(B.world(), { layout: 'plaza' }); const w = B.world(); w.hero.x = 24.5; w.hero.y = 26.5; window.BD.client.camera.snap(); w.freezeT = 1e9; });
      await P.page.waitForTimeout(300);
      const mid = await P.ev(() => window.BD.client.render.sky.open(window.__BD.world(), window.__BD.ui.view));
      t.eq(mid, [], 'mid-floor: nothing of the sky is visible');
      await P.ev(() => { const w = window.__BD.world(); w.hero.x = 3.5; w.hero.y = 3.5; window.BD.client.camera.snap(); });
      await P.page.waitForTimeout(300);
      const back = await P.ev(() => window.BD.client.render.sky.open(window.__BD.world(), window.__BD.ui.view));
      t.assert(back.length >= 1, 'back corner: the sky above the walls is drawn');
      const st = await P.ev(() => window.BD.client.render.big.stats());
      t.assert(st.painted > 0, 'chunks painted');
      t.eq(P.errors, []);
    } finally { await P.close(); }
  },
};

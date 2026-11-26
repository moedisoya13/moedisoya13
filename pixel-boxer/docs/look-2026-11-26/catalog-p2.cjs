// catalog-p2 (evidence): on a phone (390 × 844) the page steps every card of a row while any card of it is on screen, and
// builds a bout for every one of its 498 cards at load, folded or not. Prints, over the open (default) part of the page
// scrolled a screen at a time: cards drawn vs cards stepped; the cost of one card's step and of making its bout in this
// Chromium; and how long the page took from its last file to ready. (Absolute times here are a shared desktop's: compare
// them with each other, not with a phone.)
//   node catalog-p2.cjs <pixel-boxer root>
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2]);
const T = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => e ? r.writeHead(404).end() : (r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }), r.end(d))); });
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const el = document.getElementById('loading'); new MutationObserver(() => { if (el.hidden && !window.__ready) window.__ready = performance.now(); }).observe(el, { attributes: true }); }));
  await p.goto(`http://127.0.0.1:${srv.address().port}/catalog.html`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const r = await p.evaluate(async () => {
    const lastFile = Math.max(...performance.getEntriesByType('resource').map(x => x.responseEnd));
    const cat = __catalog, on = el => { const b = el.getBoundingClientRect(); return b.width >= 8 && b.bottom > 0 && b.top < innerHeight; };
    const first = document.querySelector('#catalog .item:not(.folded)'), y0 = first.getBoundingClientRect().top + scrollY, H = document.documentElement.scrollHeight;
    const samples = [];
    for (let y = y0; y < H - innerHeight; y += innerHeight) {
      scrollTo(0, y);
      const drawn = cat.cells.filter(c => on(c.stage)).length, stepped = cat.rows.filter(r => r.cells.some(c => on(c.stage))).reduce((s, r) => s + r.cells.length, 0);
      if (drawn || stepped) samples.push({ drawn, stepped });
    }
    const m = await import('/src/footwork.mjs'), { step } = await import('/src/game/bout.mjs');
    const es = cat.cells.map(c => c.entry);
    let t = performance.now(); for (const e of es) m.freshBout(e); const make = (performance.now() - t) / es.length;
    const pick = cat.rows.find(r => r.item.id === 'cross').cells.map(c => c.entry), bouts = pick.map(e => m.freshBout(e));
    t = performance.now(); let n = 0; for (let k = 0; k < 120; k++) pick.forEach((e, i) => { step(bouts[i], m.drive(e, bouts[i], k / 60, 1 / 60), 1 / 60); n++; }); const per = (performance.now() - t) / n;
    const folded = cat.rows.filter(r => document.getElementById('row-' + r.item.id).classList.contains('folded')).reduce((s, r) => s + r.cells.length, 0);
    return { ready: Math.round(__ready - lastFile), cells: cat.cells.length, folded, make: make.toFixed(2), per: per.toFixed(3), samples };
  });
  const S = r.samples, sum = k => S.reduce((s, x) => s + x[k], 0);
  console.log(`screens sampled ${S.length}: cards drawn ${(sum('drawn') / S.length).toFixed(1)} on average, cards stepped ${(sum('stepped') / S.length).toFixed(1)} (most ${Math.max(...S.map(x => x.stepped))}); stepped ÷ drawn ${(sum('stepped') / sum('drawn')).toFixed(2)}`);
  console.log(`one card's step ${r.per} ms here → the average screen asks ${(sum('stepped') / S.length * 60 * r.per).toFixed(0)} ms of stepping per second at 1×, the busiest ${(Math.max(...S.map(x => x.stepped)) * 60 * r.per).toFixed(0)} ms`);
  console.log(`at load: ${r.cells} bouts made (${r.folded} of them on folded rows), ${r.make} ms each here = ${(r.cells * r.make).toFixed(0)} ms; page ready ${r.ready} ms after its last file`);
  console.log(`EVIDENCE: ${(sum('stepped') / sum('drawn')).toFixed(2)}× as many cards stepped as drawn on a 390×844 screen (avg ${(sum('stepped') / S.length).toFixed(1)}, most ${Math.max(...S.map(x => x.stepped))}); ${r.cells} bouts (${r.folded} folded) made at load, ${(r.cells * r.make).toFixed(0)} ms here`);
  await b.close(); srv.close();
});

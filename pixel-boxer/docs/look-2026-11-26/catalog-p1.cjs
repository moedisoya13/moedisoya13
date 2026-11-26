// catalog-p1 (evidence): what a phone (390 × 844) has to scroll through. Where the first card is, how tall the contents and
// the "이번에 볼 것" list are, how tall an open row is and how big its stage, where the speed buttons are (and whether they
// stay on screen), and how far one has to go between two open rows. Screenshots under shots/.
//   node catalog-p1.cjs <pixel-boxer root>
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2]), SH = '/tmp/pixel-boxer-look/look/shots/';
require('fs').mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => e ? r.writeHead(404).end() : (r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }), r.end(d))); });
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.goto(`http://127.0.0.1:${srv.address().port}/catalog.html`);
  await p.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 120000 });
  const r = await p.evaluate(() => {
    const top = el => Math.round(el.getBoundingClientRect().top + scrollY), h = el => Math.round(el.getBoundingClientRect().height);
    const open = [...document.querySelectorAll('#catalog .item:not(.folded), #catalog .card[id^="row-"]:not(.folded)')];
    const firstCard = document.querySelector('#catalog .item:not(.folded) .card .stage');
    const hs = open.map(h).sort((a, b) => a - b), gaps = open.slice(1).map((el, i) => top(el) - top(open[i]));
    const ctl = document.querySelector('.controls');
    return { page: document.documentElement.scrollHeight, firstCardAt: top(firstCard), toc: h(document.getElementById('toc')), changes: h(document.querySelector('.changes')), changesOpen: document.querySelector('.changes').open,
      openRows: open.length, rowMedian: hs[hs.length >> 1], rowMax: hs[hs.length - 1], openTotal: hs.reduce((a, b) => a + b, 0),
      stage: [Math.round(firstCard.getBoundingClientRect().width), h(firstCard)], controlsAt: top(ctl), controlsPos: getComputedStyle(ctl).position, headerPos: getComputedStyle(document.querySelector('header')).position,
      gapMedian: gaps.sort((a, b) => a - b)[gaps.length >> 1] };
  });
  const scr = n => (n / 844).toFixed(1);
  console.log(`page ${r.page} px (${scr(r.page)} screens); first card's stage at ${r.firstCardAt} px (${scr(r.firstCardAt)} screens down); contents ${r.toc} px, of it "이번에 볼 것" ${r.changes} px (open by default: ${r.changesOpen})`);
  console.log(`open rows ${r.openRows}: median ${r.rowMedian} px (${scr(r.rowMedian)} screens), tallest ${r.rowMax}, all together ${r.openTotal} px (${scr(r.openTotal)} screens); from one open row to the next, median ${r.gapMedian} px`);
  console.log(`a card's stage ${r.stage[0]} × ${r.stage[1]} px; the speed buttons (1× ½× ¼×) at ${r.controlsAt} px, position ${r.controlsPos} (header ${r.headerPos}): off screen once one scrolls ${scr(r.firstCardAt)} screens to the first card`);
  await p.evaluate(() => document.querySelector('#catalog .item:not(.folded)').scrollIntoView());
  await p.waitForTimeout(1500);
  await p.screenshot({ path: SH + 'catalog-p1-first-row-390.png' });
  console.log(`EVIDENCE: first card ${scr(r.firstCardAt)} screens down; open rows ${scr(r.openTotal)} screens; speed buttons ${r.controlsPos} at ${r.controlsAt} px; shot ${SH}catalog-p1-first-row-390.png`);
  await b.close(); srv.close();
});

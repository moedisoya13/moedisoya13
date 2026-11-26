// catalog-5: the page's summary "보이는 것 … N 단계에서 바뀐 4줄" counts a row only under its latest stage, so the
// N-changed rows the user asked for in their notes (hookIn 숏 훅, hookR 뒷손 훅, upperIn 숏 어퍼, flicker 플리커: memos
// answered by N, src/memo.actions.mjs) are counted as "V 단계에서 바뀐" (V's note there: the stagger), and the summary says
// 4 N rows where 13 rows carry an N mark. Reads the published page (catalog.html) in Chromium at 390 px.
//   node catalog-5.cjs <pixel-boxer root>
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2]);
const T = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => e ? r.writeHead(404).end() : (r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }), r.end(d))); });
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`http://127.0.0.1:${srv.address().port}/catalog.html`);
  await p.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 120000 });
  const r = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.item, .card[id^="row-"]')];
    const withStage = s => rows.filter(el => [...el.querySelectorAll(':scope > .item-head .since-note .stage, :scope .info > .since-note .stage')].some(b => b.textContent.startsWith(s + ' ·'))).map(el => el.id.slice(4));
    const memoRows = ['hookIn', 'hookR', 'upperIn', 'flicker'].map(id => { const el = document.getElementById('row-' + id); const n = [...el.querySelectorAll('.since-note')]; return `${id}: first mark "${n[0].querySelector('.stage').textContent}", N mark ${n.some(x => x.querySelector('.stage').textContent.startsWith('N ·')) ? 'below it' : 'none'}`; });
    return { shown: document.getElementById('shown').textContent, N: withStage('N'), V: withStage('V').length, U: withStage('U').length, memoRows };
  });
  console.log('page says:', r.shown.slice(0, 120));
  console.log(`rows carrying an N mark: ${r.N.length} (${r.N.join(', ')}); V: ${r.V}; U: ${r.U}`);
  console.log(r.memoRows.join('\n'));
  const said = +(r.shown.match(/N 단계에서 바뀐 (\d+)줄/) || [])[1];
  console.log(said < r.N.length ? `REPRO: yes the summary says N changed ${said} rows; ${r.N.length} rows carry an N mark, the four memo rows of N among those counted as V` : 'REPRO: no');
  await b.close(); srv.close();
});

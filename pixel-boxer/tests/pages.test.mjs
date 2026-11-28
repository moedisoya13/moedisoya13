/* The pages in a browser (headless Chromium, through Playwright where it can be found): what the fix round of 2026-11-28 put
   right on the game (index.html), the sparring (spar.html) and the motion catalogue (catalog.html), each held as the
   audit's and the look's checks found it (docs/audit-2026-11-25/8-1, 9-1, 9-2, 9-4, 10-1; docs/look-2026-11-26/spar-4):
     the sparring opened from a round's link, then 시작, then 다시 보기: the round started, not the link's;
     the arena or the outfit changed and changed back before the first has loaded: the page is in the one the select shows;
     the graphics context lost: a notice with a reload button covers the picture (the game and the sparring), not white;
     the game's frame-time readout is the time between pictures (the drawing in it), the JavaScript apart;
     the motion catalogue at 390 px: no sideways scroll;
     the sparring's clock stands at the knockdown once he is down.
   With no Playwright here, each is skipped, and says so. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  chromium = null;
}
const skip = !chromium && 'Playwright를 찾지 못함: 브라우저 시험은 건너뜀';
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm' };

// a server for the folder; `slow(path)`: how many ms late to answer it (a phone's network)
async function serve(slow = () => 0) {
  let busy = 0;
  const s = http.createServer(async (q, r) => {
    busy++;
    r.on('close', () => busy--);
    const u = decodeURIComponent(new URL(q.url, 'http://x').pathname),
      f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root)) return r.writeHead(403).end();
    const wait = slow(u);
    if (wait) await new Promise(res => setTimeout(res, wait));
    try {
      const body = await readFile(f);
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(body);
    } catch {
      r.writeHead(404).end();
    }
  });
  await new Promise(res => s.listen(0, '127.0.0.1', res));
  return { url: `http://127.0.0.1:${s.address().port}/`, close: () => s.close(), get busy() { return busy; } };
}
async function withPage(o, run) {
  const server = await serve(o.slow),
    browser = await chromium.launch(),
    page = await browser.newPage({ viewport: o.viewport || { width: 390, height: 780 } }),
    errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  if (o.init) await page.addInitScript(o.init);
  try {
    await page.goto(server.url + o.path);
    await page.waitForFunction(o.ready, null, { timeout: 120000 });
    await run(page, server);
    assert.deepEqual(errors, [], 'no errors on the page');
  } finally {
    await browser.close();
    server.close();
  }
}
const sparReady = () => globalThis.__spar && !document.getElementById('loading');
const gameReady = () => globalThis.__bout && !document.getElementById('loading');

test('the sparring opened from a link: 시작, then 다시 보기, is the round started, not the link\'s', { skip, timeout: 240000 }, async () => {
  await withPage({ path: 'spar.html#s-7', ready: sparReady, init: () => (crypto.getRandomValues = a => (a.fill(4), a)) }, async page => {
    assert.equal((await page.textContent('#againbtn')).trim(), '#7 보기');
    await page.click('#startbtn');
    assert.equal(await page.evaluate(() => __spar.plan.seed), 5, 'the new round (the dice fixed: #5)');
    assert.equal((await page.textContent('#againbtn')).trim(), '다시 보기');
    await page.click('#againbtn');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => __spar.plan.seed), 5, '다시 보기 keeps to #5');
    assert.equal(await page.evaluate(() => location.hash), '#s-5');
  });
  // (and the link's own round, if 다시 보기 is pressed first)
  await withPage({ path: 'spar.html#s-7', ready: sparReady }, async page => {
    await page.click('#againbtn');
    assert.equal(await page.evaluate(() => __spar.plan.seed), 7);
    assert.equal((await page.textContent('#againbtn')).trim(), '다시 보기');
  });
});

test('the sparring: the arena or the outfit changed and changed back before the first has loaded is the one the select shows', { skip, timeout: 240000 }, async () => {
  let late = false;
  // (once the page is up, what it asks for comes 1.5 s late)
  await withPage({ path: 'spar.html', ready: sparReady, viewport: { width: 1280, height: 720 }, slow: () => (late ? 1500 : 0) }, async (page, server) => {
    late = true;
    for (const [sel, first, second, key] of [['#arena', 'underground', 'ring', 'spar.arena'], ['#wear', 'training', '', 'spar.wear']]) {
      await page.evaluate(([sel, first, second]) => {
        const s = document.querySelector(sel);
        s.value = first;
        s.dispatchEvent(new Event('change'));
        s.value = second;
        s.dispatchEvent(new Event('change'));
      }, [sel, first, second]);
      // (both loads settled: the slow first one has come in, and a moment more)
      await page.waitForTimeout(500);
      for (let quiet = 0, t = Date.now(); quiet < 3 && Date.now() - t < 60000; ) await page.waitForTimeout(250), (quiet = server.busy ? 0 : quiet + 1);
      await page.waitForTimeout(500);
      const r = await page.evaluate(([sel, key]) => ({ shown: document.querySelector(sel).value, kept: localStorage.getItem(key) }), [sel, key]);
      assert.equal(r.shown, second, sel);
      assert.ok(r.kept === null || r.kept === second, `${sel}: the page remembers ${JSON.stringify(r.kept)}, the select shows ${JSON.stringify(second)}`);
    }
    late = false;
    await page.click('#startbtn');
    await page.waitForFunction(() => __spar.plan, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => __spar.plan.arena), 'ring', 'the round is arranged in the arena shown');
  });
});

// (the share of the canvas's box that is blank white, from a screenshot of it)
async function whiteOf(page) {
  const box = await page.locator('#view').boundingBox(),
    png = await page.screenshot({ clip: box });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height),
      g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) > 235) n++;
    return n / (d.length / 4);
  }, png.toString('base64'));
}
test('the graphics context lost: a notice and a reload button over the picture, the game and the sparring, not a white canvas', { skip, timeout: 240000 }, async () => {
  for (const [file, ready] of [['index.html?seed=3&auto=1', gameReady], ['spar.html', sparReady]])
    await withPage({ path: file, ready, viewport: { width: 800, height: 600 } }, async page => {
      assert.equal(await page.locator('#lost').count(), 0, `${file}: no notice before`);
      await page.evaluate(() => document.getElementById('view').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      await page.waitForSelector('#lost', { timeout: 10000 });
      const b = page.locator('#lost button');
      assert.equal((await b.textContent()).trim(), '다시 불러오기', file);
      assert.ok(await b.isVisible(), `${file}: the button is seen`);
      assert.ok((await whiteOf(page)) < 0.05, `${file}: the canvas is covered, not white`);
      // (the button loads the page again)
      await Promise.all([page.waitForEvent('load', { timeout: 60000 }), b.click()]);
      await page.waitForFunction(ready, null, { timeout: 120000 });
      assert.equal(await page.locator('#lost').count(), 0, `${file}: drawn again after reloading`);
    });
});

test('the game\'s frame-time readout is the time between pictures, the drawing in it; the JavaScript alone apart', { skip, timeout: 240000 }, async () => {
  await withPage(
    {
      path: 'index.html?seed=3&auto=1&fps=1',
      ready: gameReady,
      init: () => {
        window.__dt = [];
        let last = 0;
        const f = t => (last && window.__dt.push(t - last), (last = t), requestAnimationFrame(f));
        requestAnimationFrame(f);
      }
    },
    async page => {
      await page.waitForFunction(() => globalThis.__bout.stats.gaps.length >= 8, null, { timeout: 120000 });
      const r = await page.evaluate(() => {
        const s = globalThis.__bout.stats,
          dt = window.__dt.slice(-s.gaps.length).sort((a, b) => a - b);
        return { ms: s.ms, js: s.js, interval: dt[dt.length >> 1] };
      });
      assert.ok(r.ms >= r.interval / 1.5 && r.ms <= r.interval * 1.5, `readout ${r.ms.toFixed(1)} ms, the pictures ${r.interval.toFixed(1)} ms apart`);
      assert.ok(r.js > 0 && r.js <= r.ms * 1.05, `the JavaScript ${r.js.toFixed(1)} ms of ${r.ms.toFixed(1)}`);
    }
  );
});

test('the motion catalogue at 390 px does not scroll sideways', { skip, timeout: 300000 }, async () => {
  await withPage({ path: 'catalog.html', ready: () => !!document.querySelector('#row-out-counter'), viewport: { width: 390, height: 844 } }, async page => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '모두');
      if (b) b.click();
    });
    await page.waitForTimeout(800);
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
    assert.ok(w.scroll <= w.view, `${w.scroll} px wide at ${w.view}`);
  });
});

test('the sparring\'s clock stands at the knockdown once he is down, under the result', { skip, timeout: 300000 }, async () => {
  await withPage({ path: 'spar.html#s-5', ready: sparReady }, async page => {
    await page.click('#againbtn');
    await page.waitForFunction(() => __spar.phase === 'play' && __spar.bout.t > 1.2, null, { timeout: 240000 });
    // (as if he went down now, at the bout's time: the page goes over to 'over' and steps the bout on under it)
    const at = await page.evaluate(() => {
      const b = __spar.bout;
      b.over = 0;
      b.overAt = b.t;
      return b.t;
    });
    await page.waitForFunction(at => __spar.phase === 'over' && __spar.bout.t > at + 1.2, at, { timeout: 120000 });
    const shown = await page.textContent('#time');
    assert.equal(shown, `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`, `the clock ${shown} at a knockdown at ${at.toFixed(2)} s, the bout now at ${(await page.evaluate(() => __spar.bout.t)).toFixed(2)}`);
  });
});

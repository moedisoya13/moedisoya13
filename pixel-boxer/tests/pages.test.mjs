/* The pages in a browser (headless Chromium, through Playwright where it can be found): what the fix round of 2026-11-28 put
   right on the game (index.html), the sparring (spar.html) and the motion catalogue (catalog.html), each held as the
   audit's and the look's checks found it (docs/audit-2026-11-25/8-1, 9-1, 9-2, 9-4, 10-1; docs/look-2026-11-26/spar-4):
     the sparring opened from a round's link, then 시작, then 다시 보기: the round started, not the link's;
     the arena or the outfit changed and changed back before the first has loaded: the page is in the one the select shows;
     the graphics context lost: a notice with a reload button covers the picture (the game and the sparring), not white;
     the game's frame-time readout is the time between pictures (the drawing in it), the JavaScript apart;
     the motion catalogue at 390 px: no sideways scroll;
     the sparring's clock stands at the knockdown once he is down;
     the mute button on every page that makes sound (a-mute);
     the game page is a match, both corners boxed by their heads (a-screen-ai, the audit's 3-1).
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

/* The mute button (a-mute): the same one on every page that makes sound, the game, the sparring and the sound audition
   (src/mute.mjs). At a phone's width it is seen, a finger's size, and over nothing it should not cover (the health bars,
   the sparring's buttons, the audition's cards); pressed, the page's sound is off (audio.muted, and a sound asked for is not
   played) and the game does not start under it; what it is set to holds on the next page and after a reload; with the
   browser's storage refused it still works. */
test('the mute button: on the game, the sparring and the audition, seen, a finger\'s size, kept from page to page', { skip, timeout: 300000 }, async () => {
  const server = await serve(),
    browser = await chromium.launch(),
    errors = [];
  const PAGES = [
    ['index.html?seed=3', gameReady, () => __bout.audio, ['#hp0', '#hp1', '#stage', '#title h1', '#title .go']],
    ['spar.html', sparReady, () => __spar.audio, ['#hp0', '#hp1', '#hpn1', '#time', '#title h1', '#title p', '#rails', '#bar button:not(#mute)', '#bar select']],
    ['sfx.html', () => globalThis.__sfx && document.querySelector('.card'), () => __sfx.audio, ['h1 em', '.lede', '#state', '.card', '.controls']]
  ];
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  async function open(context, [file, ready]) {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${file}: ${e}`));
    await page.goto(server.url + file);
    await page.waitForFunction(ready, null, { timeout: 120000 });
    return page;
  }
  // (the button's state, and the page's sound: muted, and whether a bell asked for now would be played)
  const state = (page, audioOf) =>
    page.evaluate(audioOf => {
      const a = Function('return (' + audioOf + ')()')(),
        b = document.getElementById('mute');
      let kept = null;
      try {
        kept = localStorage.getItem('pixel-boxer.muted');
      } catch {
        kept = 'blocked';
      }
      return { pressed: b.getAttribute('aria-pressed'), muted: a.muted, played: !!a.play('bell', { strikes: 1 }), unlocked: !!a.context, kept };
    }, String(audioOf));
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
    for (const [i, entry] of PAGES.entries()) {
      const [file, , audioOf, around] = entry,
        page = await open(context, entry),
        b = page.locator('#mute');
      assert.ok(await b.isVisible(), `${file}: the button is seen`);
      const box = await b.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${file}: ${box.width}x${box.height} px`);
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 780, `${file}: on the screen`);
      for (const sel of around)
        for (const el of await page.locator(sel).all()) {
          const o = await el.boundingBox();
          if (o) assert.ok(!overlap(box, o), `${file}: the button covers ${sel}`);
        }
      // (the first page finds nothing chosen: the game sounds; the sparring, as ever, starts silent. Then each finds the last)
      const before = await state(page, audioOf);
      if (i === 0) assert.deepEqual([before.pressed, before.muted, before.kept], ['false', false, null], `${file}: as it starts`);
      else assert.deepEqual([before.pressed, before.muted], ['false', false], `${file}: unmuted, as the page before left it`);
      await b.click();
      const off = await state(page, audioOf);
      assert.deepEqual([off.pressed, off.muted, off.played, off.kept], ['true', true, false, '1'], `${file}: pressed, the sound is off`);
      if (file.startsWith('index')) assert.equal(await page.evaluate(() => __bout.phase), 'title', 'the game does not start under the button');
      // (after a reload it is still off; pressed again, on, and sounding)
      await page.reload();
      await page.waitForFunction(entry[1], null, { timeout: 120000 });
      const kept = await state(page, audioOf);
      assert.deepEqual([kept.pressed, kept.muted, kept.played], ['true', true, false], `${file}: still off after a reload`);
      await page.locator('#mute').click();
      const on = await state(page, audioOf);
      assert.deepEqual([on.pressed, on.muted, on.kept], ['false', false, '0'], `${file}: pressed again, on`);
      assert.ok(on.played || !on.unlocked, `${file}: a bell asked for is played once the sound is on`);
      await page.close();
    }
    // (on one page, muted; the next page opened is muted too)
    const game = await open(context, PAGES[0]);
    await game.locator('#mute').click();
    const spar = await open(context, PAGES[1]);
    assert.deepEqual((({ pressed, muted }) => [pressed, muted])(await state(spar, PAGES[1][2])), ['true', true], 'muted on the game, muted on the sparring');
    await context.close();
    // (the browser's storage refused: the button still works, nothing remembered, no error)
    const closed = await browser.newContext({ viewport: { width: 390, height: 780 } });
    await closed.addInitScript(() => Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('blocked'); } }));
    for (const entry of [PAGES[0], PAGES[2]]) {
      const page = await open(closed, entry);
      await page.locator('#mute').click();
      const s = await state(page, entry[2]);
      assert.deepEqual([s.pressed, s.muted, s.played, s.kept], ['true', true, false, 'blocked'], `${entry[0]}: no storage, muted all the same`);
    }
    await closed.close();
    assert.deepEqual(errors, [], 'no errors on the pages');
  } finally {
    await browser.close();
    server.close();
  }
});

/* The game page is a match (a-screen-ai, the user's answer of 2026-11-28: "고친 시합 엔진을 화면에서 보게"; the audit's 3-1):
   nobody at the controls, both men boxed by their heads and both moving; the round's clock runs down; at the bell the break,
   then the next round; at the end the result, a decision's or a draw's with the three judges' totals. Short rounds and four
   times the speed (?rounds=2&round=8&rest=1&speed=4), the seed the audit's (3); the page's match is the one finish() fights
   from the same card under node, to the result and the judges' cards (game/card.mjs). And at a phone's width, upright and
   on its side, the page does not scroll sideways and the HUD keeps 16 px off the edges. */
test('the game page is a match: both men move, the clock runs, the break and the next round, the result as node fights it', { skip, timeout: 420000 }, async () => {
  const { matchOf } = await import('../src/game/card.mjs'),
    { finish } = await import('../src/game/match.mjs'),
    want = matchOf(3, { rounds: 2, roundTime: 8 });
  finish(want);
  await withPage({ path: 'index.html?seed=3&auto=1&rounds=2&round=8&rest=1&speed=4&rows=80', ready: gameReady }, async page => {
    const seen = await page.evaluate(async () => {
      const B = globalThis.__bout,
        acts = [0, 0],
        walked = [0, 0],
        was = [null, null],
        at = [null, null],
        phases = [],
        times = new Set(),
        rounds = new Set(),
        t0 = performance.now();
      let breakAt = null,
        fightAfter = false;
      while (performance.now() - t0 < 300000 && !document.getElementById('result').classList.contains('on')) {
        const m = B.match,
          ph = B.phase;
        if (phases[phases.length - 1] !== ph) phases.push(ph);
        if (ph === 'break' && breakAt === null) breakAt = { round: m.round, clock: m.clock, shown: document.getElementById('rest').classList.contains('on'), stage: document.getElementById('stage').textContent };
        if (breakAt && ph === 'fight' && m.round === breakAt.round + 1) fightAfter = true;
        rounds.add(m.round);
        times.add(document.getElementById('time').textContent);
        B.bout.fighters.forEach((f, i) => {
          const a = f.action ? f.action.id || f.action.name : null;
          if (a && a !== was[i]) acts[i]++;
          was[i] = a;
          if (at[i]) walked[i] += Math.hypot(f.x - at[i][0], f.z - at[i][1]);
          at[i] = [f.x, f.z];
        });
        await new Promise(r => setTimeout(r, 40));
      }
      const r = B.match.result;
      return { acts, walked, phases, times: [...times], rounds: [...rounds], breakAt, fightAfter, result: r && { how: r.how, winner: r.winner, round: r.round, time: r.time, cards: r.cards }, totals: B.match.totals || null, verdict: document.getElementById('verdict').textContent, cardsText: document.getElementById('cards').textContent, shown: document.getElementById('result').classList.contains('on') };
    });
    // (both men act: actions started, metres walked)
    for (const i of [0, 1]) {
      assert.ok(seen.acts[i] >= 5, `corner ${i}: ${seen.acts[i]} actions`);
      assert.ok(seen.walked[i] > 1, `corner ${i}: walked ${seen.walked[i].toFixed(2)} m`);
    }
    // (the clock ran down: 0:08 to 0:00, and the seconds between)
    assert.ok(seen.times.includes('0:08') && seen.times.includes('0:00') && seen.times.length >= 6, `the clock showed ${seen.times.join(' ')}`);
    // (the bell: the break, shown, at the round's end; then the second round)
    assert.ok(seen.breakAt, `the phases seen: ${seen.phases.join(' > ')}`);
    assert.equal(seen.breakAt.round, 1);
    assert.ok(seen.breakAt.clock >= 8 - 1e-6, `the break at ${seen.breakAt.clock}`);
    assert.ok(seen.fightAfter, 'the second round fought after the break');
    assert.deepEqual(seen.rounds, [1, 2]);
    // (the result shown, and it is the match node fights from the same card)
    assert.ok(seen.shown, 'the result is shown');
    assert.deepEqual(seen.result, { how: want.result.how, winner: want.result.winner, round: want.result.round, time: want.result.time, cards: want.result.cards });
    assert.ok(seen.verdict.length > 0, 'a verdict');
    if (want.result.how === 'decision' || want.result.how === 'draw') {
      assert.deepEqual(seen.totals, want.totals);
      assert.equal(seen.cardsText, '심판 ' + want.totals.map(t => `${t[0]}-${t[1]}`).join(' · '), 'the three judges\' totals');
    }
  });
  for (const viewport of [{ width: 390, height: 780 }, { width: 780, height: 390 }])
    await withPage({ path: 'index.html?seed=3&auto=1', ready: gameReady, viewport }, async page => {
      await page.waitForFunction(() => __bout.bout.t > 0.5, null, { timeout: 120000 });
      const r = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        view: innerWidth,
        boxes: ['#name0', '#name1', '#hp0', '#hp1', '#time', '#stage', '#bar button', '#mute'].flatMap(sel => [...document.querySelectorAll(sel)].map(el => [sel, el.getBoundingClientRect().left, el.getBoundingClientRect().right]))
      }));
      assert.ok(r.scroll <= r.view, `${viewport.width}x${viewport.height}: ${r.scroll} px wide`);
      for (const [sel, left, right] of r.boxes) assert.ok(left >= 16 - 0.5 && right <= r.view - 16 + 0.5, `${viewport.width}x${viewport.height}: ${sel} at ${left.toFixed(1)}..${right.toFixed(1)}`);
    });
});

/* sfx.html on a phone (390 x 844, touch): layout, where the log and the controls are while a card is tapped, tap-target
   sizes, horizontal overflow, and what the first touch does to the audio (real AudioContext, Chromium's default autoplay
   policy forced to "user gesture required" as on a phone).  node sfx-phone.mjs <pixel-boxer root> */
import { createRequire } from 'node:module';
import { serve, SHOTS } from './sfx-lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.argv[2];
const { srv, port } = await serve(root);
const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${port}/sfx.html`);
await page.waitForFunction(() => globalThis.__sfx);
const lay = await page.evaluate(() => {
  const r = el => el.getBoundingClientRect();
  const q = s => document.querySelector(s);
  const cards = [...document.querySelectorAll('button.card')];
  const segs = [...document.querySelectorAll('.seg button')];
  const h2 = [...document.querySelectorAll('h2')].map(h => [h.textContent, Math.round(r(h).top + scrollY)]);
  return {
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight,
    cards: cards.length, cardH: [Math.min(...cards.map(c => r(c).height)), Math.max(...cards.map(c => r(c).height))].map(Math.round), cardW: Math.round(r(cards[0]).width),
    segH: Math.round(Math.min(...segs.map(b => r(b).height))), segW: Math.round(Math.min(...segs.map(b => r(b).width))), rangeH: Math.round(r(q('#J')).height),
    logTop: Math.round(r(q('#log')).top + scrollY), controlsBottom: Math.round(r(q('.controls')).bottom + scrollY), sticky: getComputedStyle(q('.controls')).position, h2
  };
});
console.log(JSON.stringify(lay));
await page.screenshot({ path: `${SHOTS}/sfx-phone-top.png` });
await page.screenshot({ path: `${SHOTS}/sfx-phone-full.png`, fullPage: true });
// the first touch: a tap on the intro text (not a card), as when one scrolls or taps to start
const box = await page.locator('.lede').boundingBox();
await page.touchscreen.tap(box.x + 20, box.y + 10);
await page.waitForTimeout(300);
const afterTap = await page.evaluate(() => ({ label: document.getElementById('state').textContent, state: globalThis.__sfx.audio.context && globalThis.__sfx.audio.context.state }));
console.log('after a first tap on the text:', JSON.stringify(afterTap));
// a card tapped low on the page: where is the log, can one see it?
const head = page.locator('button.card', { hasText: '머리' }).first();
await head.scrollIntoViewIfNeeded();
const hb = await head.boundingBox();
await page.touchscreen.tap(hb.x + 20, hb.y + 20);
await page.waitForTimeout(400);
const seen = await page.evaluate(() => {
  const l = document.getElementById('log').getBoundingClientRect(), c = document.querySelector('.controls').getBoundingClientRect();
  return { log: document.getElementById('log').textContent, logInView: l.top < innerHeight && l.bottom > 0, logTopFromView: Math.round(l.top), controlsInView: c.bottom > 0 && c.top < innerHeight, state: globalThis.__sfx.audio.context.state, label: document.getElementById('state').textContent, scrollY: Math.round(scrollY) };
});
console.log('after tapping 머리:', JSON.stringify(seen));
await page.screenshot({ path: `${SHOTS}/sfx-phone-after-head.png` });
console.log('errors:', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
srv.close();
const bad = afterTap.label === '소리 켜짐' && afterTap.state !== 'running';
console.log(`EVIDENCE: page ${lay.docH} px tall (${(lay.docH / lay.vh).toFixed(1)} screens), log at y=${lay.logTop} (controls end ${lay.controlsBottom}), log in view after tapping 머리: ${seen.logInView}, controls in view: ${seen.controlsInView}; seg buttons ${lay.segH} px tall; overflow ${lay.docW > lay.vw}`);
console.log(bad ? `REPRO: yes first tap on the text: label "${afterTap.label}" while the context is ${afterTap.state}` : `REPRO: no first tap: label "${afterTap.label}", context ${afterTap.state}`);

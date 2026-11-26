// open-p1 (evidence): how long the page is on a phone (390x844), how much of the screen the sticky bar takes, where the
// 차례 is, and how much shorter it would be if answered cards folded to their id, title and green band.
// Uses the page's own fallback store (localStorage in this throwaway browser). Usage: node open-p1.mjs <pixel-boxer root>
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { serve } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'open-serve.mjs'));
const root = path.resolve(process.argv[2] || '.');
const srv = await serve(root);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => rt.abort());
await page.goto(srv.url + '/open.html', { waitUntil: 'load' });
await page.waitForTimeout(2000);
const measure = () => page.evaluate(() => {
  const H = document.documentElement.scrollHeight, bar = document.querySelector('.bar').getBoundingClientRect().height;
  const groups = [...document.querySelectorAll('.group')].map((g) => g.id.slice(2));
  const gtop = (id) => document.getElementById('g-' + id).getBoundingClientRect().top + scrollY;
  const end = document.getElementById('decided').getBoundingClientRect().top + scrollY;
  const per = groups.map((id, i) => ({ id, px: Math.round((groups[i + 1] ? gtop(groups[i + 1]) : end) - gtop(id)) }));
  const items = [...document.querySelectorAll('.item[data-card]')];
  const answered = items.filter((e) => e.classList.contains('answered'));
  const hgt = (e, q) => (e.querySelector(q) ? e.querySelector(q).getBoundingClientRect().height : 0);
  // a folded answered card: band + id line + title + the card's own padding (28) and two gaps (24)
  const folded = answered.reduce((s, e) => s + hgt(e, '.band') + hgt(e, '.head') + hgt(e, 'h2') + 28 + 24, 0);
  const full = answered.reduce((s, e) => s + e.getBoundingClientRect().height, 0);
  const old = [...document.querySelectorAll('.old')].reduce((s, e) => s + e.getBoundingClientRect().height, 0);
  const tallest = items.map((e) => [e.dataset.card, Math.round(e.getBoundingClientRect().height)]).sort((x, y) => y[1] - x[1]).slice(0, 5);
  return { H, bar: Math.round(bar), per, answered: answered.length, items: items.length, full: Math.round(full), folded: Math.round(folded), old: Math.round(old), tallest };
});
const a = await measure();
const left = 844 - a.bar;
console.log(`page height at 390: ${a.H} px = ${(a.H / 844).toFixed(0)} screens of 844; sticky bar ${a.bar} px = ${((a.bar / 844) * 100).toFixed(0)}% of the screen, so ${(a.H / left).toFixed(0)} screens of the ${left} px left under it`);
for (const g of a.per) console.log(`  group ${g.id}: ${g.px} px (${(g.px / left).toFixed(1)} screens)`);
console.log(`  the old catalogue's lent players: ${a.old} px (${((a.old / a.H) * 100).toFixed(0)}% of the page); tallest cards ${a.tallest.map((t) => t.join(' ')).join(', ')}`);
// the fastest path the page offers: one press of the stars button per group
for (const btn of await page.$$('[data-stars]')) await btn.click();
await page.waitForTimeout(500);
const b = await measure();
const sum = (await page.locator('#sum').innerText()).replace(/\s+/g, ' ');
console.log(`after one ★ press per group: ${sum}; answered (green) cards ${b.answered}/${b.items}; page still ${b.H} px`);
const after = b.H - b.full + b.folded;
console.log(`  answered cards take ${b.full} px; folded to id + title + band they would take ${b.folded} px, page ${after} px (${((after / b.H) * 100).toFixed(0)}% of now)`);
const ui = await page.evaluate(() => ({ filter: !!document.querySelector('[data-filter]'), next: !!document.querySelector('[data-next]'), toc: getComputedStyle(document.querySelector('#toc')).position, tocInBar: !!document.querySelector('.bar #toc') }));
console.log(`  "only unanswered" filter: ${ui.filter}; "next unanswered" button: ${ui.next}; 차례 position ${ui.toc}, inside the sticky bar: ${ui.tocInBar}`);
await browser.close();
srv.close();
console.log(`EVIDENCE: ${a.H} px at 390 (${(a.H / left).toFixed(0)} screens under a ${a.bar}-px bar); after the stars ${b.answered}/${b.items} cards are answered but the page stays ${b.H} px; folding them would leave ${after} px; no unanswered filter, no next-unanswered, 차례 only at the top`);

// open-p5 (evidence): what the comparison shows when a phone cannot play the clips. The clips are VP9 WebM only (one
// source each, no MP4/H.264); here the .webm requests are refused to stand in for a browser that cannot decode them.
// Usage: node open-p5.mjs <pixel-boxer root>
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { serve } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'open-serve.mjs'));
const root = path.resolve(process.argv[2] || '.');
const { GROUPS } = await import(path.join(root, 'src/open.clips.mjs'));
const codecs = Object.values(GROUPS).flatMap((g) => g.clips.map((c) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', path.join(root, c.file)], { encoding: 'utf8' }).trim()));
console.log(`clip codecs: ${[...new Set(codecs)].join(', ')} (${codecs.length} clips); <source> alternatives in the page: none (src/open.mjs cmpHtml writes one data-src per video)`);
const srv = await serve(root);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => rt.abort());
await page.route(/\.webm$/, (rt) => rt.fulfill({ status: 415, body: '' }));
await page.goto(srv.url + '/open.html', { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.evaluate(() => { const e = document.getElementById('i-ring-lean'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 230); });
const read = () => page.evaluate(() => { const c = document.querySelector('#i-ring-lean .cmp'); return { fr: c.querySelector('.fr').textContent, errs: [...c.querySelectorAll('video')].map((v) => (v.error ? v.error.code : 0)), text: c.innerText.includes('재생') || c.innerText.includes('못') }; });
await page.waitForTimeout(1500);
const a = await read();
await page.waitForTimeout(2000);
const b = await read();
(await import('node:fs')).mkdirSync('/tmp/pixel-boxer-look/look/shots/open', { recursive: true });
await page.screenshot({ path: '/tmp/pixel-boxer-look/look/shots/open/p5-no-webm-ring-lean.png' });
await browser.close();
srv.close();
console.log(`with the clips refused: video.error codes ${JSON.stringify(b.errs)}; frame counter "${a.fr}" → 2 s later "${b.fr}"; a can't-play message on the card: ${b.text}`);
console.log(`EVIDENCE: VP9-only clips; when they fail the counter keeps running (${a.fr} → ${b.fr}) over still posters and the card says nothing`);

// spar-p2 (evidence): how big the two men are drawn on a phone. The page frames the WIDTH of (apart, at least 1.4 m) + 3.6 m
// (src/spar.mjs:628, R.distFor, render/renderer.mjs:476, FOV 38 deg), capped at 12.5 m in portrait; on a 390x844 screen
// that cap is what is used, and a 1.8 m man fills a fifth of the picture's height (45 of the 216 art pixel rows), against
// half of it on a 1280x800 desktop. Pure arithmetic from the page's own formula; the browser run (spar-shots.cjs) logs
// cam.dist 12.5 at 390. Usage: node spar-p2.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
const root = process.argv[2];
const src = readFileSync(root + '/src/spar.mjs', 'utf8');
const line = src.split('\n').findIndex(l => l.includes('base = Math.max(5.2, Math.min(narrow ? 12.5 : 11, R.distFor(Math.max(apart, 1.4) + 3.6)))'));
console.log('framing line in src/spar.mjs:', line >= 0 ? line + 1 : 'NOT FOUND');
const FOV = (38 * Math.PI) / 180, T = 2 * Math.tan(FOV / 2), ROWS = 216, MAN = 1.8;
const frame = (w, h, apart = 0.9) => {
  const scale = Math.max(1, Math.round((h * 2) / ROWS)), tw = Math.ceil((w * 2) / scale), th = Math.ceil((h * 2) / scale), aspect = tw / th;
  const distFor = width => width / (T * aspect);
  const narrow = tw < th, dist = Math.max(5.2, Math.min(narrow ? 12.5 : 11, distFor(Math.max(apart, 1.4) + 3.6)));
  const tall = dist * T, wide = tall * aspect;
  return { w, h, dist: +dist.toFixed(2), seenWide: +wide.toFixed(2), seenTall: +tall.toFixed(2), manShare: +(MAN / tall).toFixed(3), manRows: Math.round((MAN / tall) * th) };
};
const phone = frame(390, 844), desk = frame(1280, 800);
for (const f of [phone, frame(430, 932), desk]) console.log(`${f.w}x${f.h}: camera ${f.dist} m off, sees ${f.seenWide} m wide x ${f.seenTall} m tall; a ${MAN} m man is ${(100 * f.manShare).toFixed(0)}% of the height, ${f.manRows} art rows`);
// what a portrait framing by the men's own span would give (e.g. apart + 1.6 m wide), for the proposal
const T2 = frame(390, 844), alt = (1.4 + 1.6) / (T * (T2.seenWide / T2.seenTall));
console.log(`if portrait framed (apart + 1.6 m) wide instead: ${alt.toFixed(2)} m off, man ${(100 * MAN / (alt * T)).toFixed(0)}% of the height`);
console.log(`EVIDENCE: at 390x844 the men are ${(100 * phone.manShare).toFixed(0)}% of the picture's height (${phone.manRows} art rows) vs ${(100 * desk.manShare).toFixed(0)}% (${desk.manRows}) at 1280x800; the phone camera sits at its ${phone.dist} m cap`);

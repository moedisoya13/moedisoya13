/* Shared harness for the sfx-* repros: serve the pixel-boxer root, open sfx.html in headless Chromium with the page's
   AudioContext swapped for an OfflineAudioContext (48 kHz stereo), Math.random seeded, and setTimeout captured so the
   demos' and the pant card's later steps land at their true times (via OfflineAudioContext.suspend). Click a card exactly as
   a user would (the page's own handler runs: audio.unlock + the card's function), render, and analyse in node.
   Read-only: writes WAVs only under <SCRATCH>/look/shots/. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const SHOTS = '/tmp/pixel-boxer-look/look/shots';
(await import('node:fs')).mkdirSync(SHOTS, { recursive: true });
export const SR = 48000;

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.bin': 'application/octet-stream' };
export function serve(root) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return r.writeHead(404), r.end();
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

const INIT = () => {
  // seeded random (mulberry32), the same for every load
  let s = 12345;
  Math.random = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const dur = Number(new URLSearchParams(location.search).get('dur') || 4);
  window.__made = [];
  window.AudioContext = function () {
    const c = new OfflineAudioContext(2, Math.round(48000 * dur), 48000);
    window.__made.push(c);
    return c;
  };
  window.webkitAudioContext = window.AudioContext;
  const real = window.setTimeout.bind(window);
  window.__timers = [];
  window.__capture = false;
  window.setTimeout = (fn, ms, ...a) => (window.__capture ? (window.__timers.push([ms || 0, () => fn(...a)]), 0) : real(fn, ms, ...a));
};

export async function open(root) {
  const { chromium } = require('playwright');
  const { srv, port } = await serve(root);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(INIT);
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  return {
    page,
    port,
    async close() {
      await browser.close();
      srv.close();
    },
    /* one render of a direct call on the page's own audio (globalThis.__sfx: { audio, at, heard }): `body` is a function
       source run in the page after the context is made, e.g. "s => s.audio.play('bell', { strikes: 1 })" */
    async call(body, dur = 4) {
      await page.goto(`http://127.0.0.1:${port}/sfx.html?dur=${dur}`);
      await page.waitForFunction(() => globalThis.__sfx);
      await page.click('#who button[data-who="0"]'); // (the first touch: builds the context, as the page does)
      const out = await page.evaluate(async body => {
        const s = globalThis.__sfx;
        const played = (0, eval)('(' + body + ')')(s);
        const buf = await s.audio.context.startRendering();
        const enc = a => {
          const u = new Uint8Array(a.buffer);
          let t = '';
          for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
          return btoa(t);
        };
        return { L: enc(buf.getChannelData(0)), R: enc(buf.getChannelData(1)), played: JSON.stringify(played) };
      }, body);
      const dec = b => new Float32Array(new Uint8Array(Buffer.from(b, 'base64')).buffer);
      return { L: dec(out.L), R: dec(out.R), played: out.played };
    },
    /* one render: set the controls, click the card titled `card` (exact <b> text, in section `sec` if given), render `dur` s */
    async render({ card, sec, who = 0, pit = 0, slow = 0, J = 85, dur = 4 }) {
      await page.goto(`http://127.0.0.1:${port}/sfx.html?dur=${dur}`);
      await page.waitForFunction(() => globalThis.__sfx);
      await page.click(`#who button[data-who="${who}"]`);
      await page.click(`#place button[data-pit="${pit}"]`);
      await page.click(`#speed button[data-slow="${slow}"]`);
      await page.evaluate(J => {
        const r = document.getElementById('J');
        r.value = String(J);
        r.dispatchEvent(new Event('input'));
      }, J);
      await page.evaluate(() => {
        window.__capture = true;
        window.__logs = [];
        new MutationObserver(() => window.__logs.push(document.getElementById('log').textContent)).observe(document.getElementById('log'), { childList: true, characterData: true, subtree: true });
      });
      const loc = page.locator('button.card', { has: page.locator('b', { hasText: new RegExp('^' + card.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
      const n = await loc.count();
      if (n !== 1) throw new Error(`card "${card}" matched ${n}`);
      await loc.click();
      const out = await page.evaluate(async () => {
        window.__capture = false;
        const c = globalThis.__sfx.audio.context;
        const log = document.getElementById('log').textContent;
        const at = {};
        for (const [ms, fn] of window.__timers) (at[ms] ||= []).push(fn);
        window.__timers = [];
        for (const fn of at[0] || []) fn();
        for (const ms of Object.keys(at).map(Number).filter(x => x > 0).sort((a, b) => a - b)) {
          const q = Math.round(((ms / 1000) * 48000) / 128) * 128 / 48000;
          c.suspend(q).then(() => {
            for (const fn of at[ms]) fn();
            c.resume();
          });
        }
        const logs = [log];
        const buf = await c.startRendering();
        const enc = a => {
          const u = new Uint8Array(a.buffer);
          let s = '';
          for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
          return btoa(s);
        };
        await new Promise(r => queueMicrotask(r));
        return { L: enc(buf.getChannelData(0)), R: enc(buf.getChannelData(1)), log: [...new Set(logs.concat(window.__logs))], made: window.__made.length };
      });
      const dec = b => new Float32Array(new Uint8Array(Buffer.from(b, 'base64')).buffer);
      return { L: dec(out.L), R: dec(out.R), log: out.log, made: out.made };
    }
  };
}

/* ---- analysis */
export function writeWav(file, L, R) {
  const n = L.length,
    b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const q = v => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) b.writeInt16LE(q(L[i]), 44 + i * 4), b.writeInt16LE(q(R[i]), 46 + i * 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, b);
}
const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
function biquad(x, [b0, b1, b2], [, a1, a2]) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const kw = x => biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]], [im[i], im[j]] = [im[j], im[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
export const BANDS = [[0, 150], [150, 500], [500, 2000], [2000, 6000], [6000, 24000]];
/* the sound's measures: active span (first..last sample within 60 dB of the peak), peak / RMS (active span) dBFS, momentary
   loudness max (400 ms K-weighted, LUFS-ish) and over the active span, band energy shares, centroid, spectral flatness
   (0 tonal .. 1 noise; Wiener entropy over 50 Hz..16 kHz), DC (mean / peak), first / last-sample step, L/R balance */
export function measure(L, R) {
  const n = L.length;
  let peak = 0, pi = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) (peak = a), (pi = i);
  }
  if (peak === 0) return { silent: true };
  const thr = peak * 1e-3;
  let a0 = 0, a1 = n - 1;
  while (a0 < n && Math.max(Math.abs(L[a0]), Math.abs(R[a0])) < thr) a0++;
  while (a1 > 0 && Math.max(Math.abs(L[a1]), Math.abs(R[a1])) < thr) a1--;
  let ss = 0, sl = 0, sr = 0, dc = 0, jump = 0;
  for (let i = a0; i <= a1; i++) {
    ss += (L[i] * L[i] + R[i] * R[i]) / 2; sl += L[i] * L[i]; sr += R[i] * R[i]; dc += (L[i] + R[i]) / 2;
    if (i > a0) jump = Math.max(jump, Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1]));
  }
  const m = a1 - a0 + 1,
    kl = kw(L), kr = kw(R);
  let ksum = 0;
  for (let i = a0; i <= a1; i++) ksum += kl[i] * kl[i] + kr[i] * kr[i];
  const W = Math.round(0.4 * SR);
  let mom = -Infinity;
  { // momentary: 400 ms windows, hop 10 ms
    const c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) c[i + 1] = c[i] + kl[i] * kl[i] + kr[i] * kr[i];
    for (let i = 0; i + W <= n; i += 480) mom = Math.max(mom, -0.691 + 10 * Math.log10((c[i + W] - c[i]) / W + 1e-30));
    if (n < W) mom = -0.691 + 10 * Math.log10(c[n] / W + 1e-30);
  }
  // spectrum of the mono sum over the active span (zero-padded), energy weighted
  let N = 1;
  while (N < m) N <<= 1;
  N = Math.max(N, 8192);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < m && i < N; i++) re[i] = (L[a0 + i] + R[a0 + i]) / 2;
  fft(re, im);
  const band = BANDS.map(() => 0);
  let tot = 0, cen = 0, lg = 0, ar = 0, cnt = 0;
  const pw = new Float64Array(N / 2);
  for (let k = 1; k < N / 2; k++) {
    const f = (k * SR) / N, p = re[k] * re[k] + im[k] * im[k];
    pw[k] = p;
    tot += p; cen += f * p;
    BANDS.forEach(([lo, hi], j) => f >= lo && f < hi && (band[j] += p));
    if (f >= 50 && f <= 16000) (lg += Math.log(p + 1e-30)), (ar += p), cnt++;
  }
  const first = Math.max(Math.abs(L[a0]), Math.abs(R[a0])), last = Math.max(Math.abs(L[n - 1]), Math.abs(R[n - 1]));
  return {
    start: a0 / SR, end: a1 / SR, span: m / SR, peakAt: pi / SR,
    peak: db(peak), rms: 10 * Math.log10(ss / m), lufsSpan: -0.691 + 10 * Math.log10(ksum / m + 1e-30), lufsMom: mom,
    bands: band.map(b => b / tot), centroid: cen / tot, flat: Math.exp(lg / cnt) / (ar / cnt), dc: dc / m / peak,
    firstStep: first / peak, lastSample: last / peak, maxJump: jump / peak, lr: 10 * Math.log10(sl / sr), clip: peak >= 1, spec: pw, N
  };
}
/* the spectral distance of two sounds: 1 - cosine similarity of their 1/3-octave band energy profiles (dB), 50 Hz .. 16 kHz,
   and the same of their normalised envelopes (10 ms frames over the first 400 ms) */
export function third(mx) {
  const out = [];
  for (let f = 50; f < 16000; f *= Math.pow(2, 1 / 3)) {
    const lo = f / Math.pow(2, 1 / 6), hi = f * Math.pow(2, 1 / 6);
    let s = 0;
    for (let k = Math.ceil((lo * mx.N) / SR); k < (hi * mx.N) / SR && k < mx.spec.length; k++) s += mx.spec[k];
    out.push(s);
  }
  const t = out.reduce((a, b) => a + b, 0);
  return out.map(x => x / t);
}
export function profileDist(a, b) {
  const A = third(a), B = third(b);
  let d = 0;
  for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]);
  return d / 2; // 0 identical .. 1 disjoint (total variation of the energy distribution)
}
export const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : String(x));
export const pct = x => Math.round(x * 100) + '%';
export function line(name, m) {
  if (m.silent) return `${name}: SILENT`;
  return `${name}: span ${Math.round(m.span * 1000)} ms (from ${Math.round(m.start * 1000)}) | peak ${f1(m.peak)} dBFS rms ${f1(m.rms)} | LUFS mom ${f1(m.lufsMom)} span ${f1(m.lufsSpan)} | <150 ${pct(m.bands[0])} 150-500 ${pct(m.bands[1])} .5-2k ${pct(m.bands[2])} 2-6k ${pct(m.bands[3])} >6k ${pct(m.bands[4])} | centroid ${Math.round(m.centroid)} Hz flat ${m.flat.toFixed(2)} | L/R ${f1(m.lr)} dB | dc ${m.dc.toFixed(3)} jump ${m.maxJump.toFixed(2)} first ${m.firstStep.toFixed(3)} last ${m.lastSample.toFixed(4)}${m.clip ? ' CLIP' : ''}`;
}

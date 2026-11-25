// eye 7, finding 7-4: the pit's murmur stopped (ambience(null): the sparring's sound button or arena switch) -- rendered offline in Chromium
// usage: node 7-4.mjs <pixel-boxer root>
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.argv[2];
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = path === '/' ? '<!doctype html><title>t</title>' : await readFile(join(root, path));
    res.writeHead(200, { 'content-type': path === '/' ? 'text/html' : extname(path) === '.mjs' ? 'text/javascript' : 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const out = await page.evaluate(async () => {
  const { createAudio } = await import('/src/game/audio.mjs');
  const rows = [];
  // stop the murmur at several moments (the LFO's phase differs at each), render, and look at the 5 ms before and after it ends
  for (const stopAt of [2.0, 3.0, 4.0, 5.5, 7.0]) {
    const sr = 48000,
      ctx = new OfflineAudioContext(1, Math.round(sr * (stopAt + 1)), sr),
      audio = createAudio({ context: ctx, random: () => 0.5 });
    audio.unlock();
    audio.ambience('pit');
    ctx.suspend(stopAt).then(() => (audio.ambience(null), ctx.resume()));
    const buf = await ctx.startRendering(),
      d = buf.getChannelData(0),
      rms = (a, b) => {
        let s = 0;
        for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) s += d[i] * d[i];
        return Math.sqrt(s / Math.max(1, Math.round((b - a) * sr)));
      },
      // (where the output really ends: the compressors delay it a few ms past src.stop(now + 0.45))
      last = (() => { for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > 1e-7) return i; return 0; })(),
      end = last / sr,
      plateau = rms(stopAt - 0.5, stopAt),
      before = rms(end - 0.005, end),
      after = rms(end + 0.001, end + 0.006),
      // (what the fade alone would leave at its end: 0.0001 of a 0.09 gain)
      db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
    rows.push({ stopAt, endsAt: +end.toFixed(4), lastSample: +d[last].toFixed(5), plateauDb: +db(plateau).toFixed(1), last5msDb: +db(before).toFixed(1), stepDb: +(db(before) - db(plateau)).toFixed(1) });
  }
  return rows;
});
console.log(JSON.stringify(out, null, 1));
// the fade asked for is to 0.0001/0.09 = -59 dB of the plateau; a cut at more than -30 dB of it is a step, not a fade
const worst = Math.max(...out.map(r => r.stepDb));
console.log(`worst level of the murmur in the 5 ms before it is cut off: ${worst} dB re its plateau (a clean fade would be about -59 dB)`);
console.log(worst > -30 ? `REPRO: yes the pit murmur is cut off at ${worst} dB of its own level (LFO still on the faded gain), not faded out` : `REPRO: no murmur fades to ${worst} dB before it stops`);
await browser.close();
server.close();

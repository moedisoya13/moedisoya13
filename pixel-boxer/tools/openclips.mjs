#!/usr/bin/env node
/* The recorded comparisons of the open-questions catalogue (src/open.clips.mjs): every build of a group recorded over the
   same frames of the same scene, with the same crop, at the same size, into docs/ref/open/<clip id>.webm (VP9) and a poster
   docs/ref/open/<clip id>.jpg.
     node tools/openclips.mjs arm lean tempo           record those groups (every clip of each), and print what was measured
       --only <clip id>,<clip id>                      only those clips of the groups named (the others kept as they were)
       --measures <file>                               and what was measured, written there as JSON
       --frames <dir>                                  and every picture kept there, <dir>/<clip id>/0000.png ...
       --modules <dir>                                 node_modules with ink-studio in it, for a build baked again
                                                       (AFTER); the checkout's own if left out
       --probe <frame>,<frame>                         no recording: whole screenshots of this checkout at those frames of
                                                       each group's scene, into the --frames folder (to choose a crop)
   A clip is a build: this checkout (patch null), or this checkout with a patch of docs/ref/open/patches/ applied. Each is
   copied to a folder of the system's temporary space (the checkout's own files are never touched), its patch applied there
   with git apply, anything it needs done after it done there (AFTER), served from there, and driven in headless Chromium
   (Playwright) a sixtieth of a second at a time by hand: requestAnimationFrame is taken over and the dice of the picture
   (its shake) seeded, so that every build of a group plays the same frames. The picture is kept every 60 / fps frames, the
   group's crop of it, at one CSS pixel a pixel (deviceScaleFactor 1: the art grid is drawn by the page at a whole number of
   pixels an art pixel, and the catalogue scales the video up again by nearest neighbour).
   The scenes (SCENES):
     arm    the game (index.html?auto&seed=7&wear=training), the player driven as scratch measure of the forearm was: his guard
            held 7 s of every 10 and then let down, two jabs, a step each way. The stretch of the guard let down, a jab, a
            step, a jab, a step and the guard raised again. Measured on every kept frame: how much of the player's right
            forearm shows (its splats drawn alone in one marked colour: pixels of it in the picture / pixels of it drawn
            alone); and, for a build that changes no motion (arm-b), what was in front of each pixel of the forearm that the
            build shows and this checkout did not (this checkout's picture with every bone of the player in its own colour
            and the other man in another).
     lean   the game in the ring (index.html?auto&spar&seed=3: the other man only stands there), the player walked straight
            back into the ropes behind him and held there, then let go. Measured: how far his spine (hips to chest) leans
            back from upright, toward his back, degrees; how far the ropes are pressed, centimetres (world/ropes.mjs pressOf).
     tempo  the sparring page (spar.html?capture, seed SPAR_SEED) at 390 x 844, the first six seconds of the round from the
            bell. The round is arranged again in each build (src/spar/plan.mjs): after the first exchange it is another
            round. Measured: tools/spar.mjs --seed in the build (actions a second each man, the longest stretch nobody
            started anything, the knockdown). */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const arg = name => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const STEP = 1000 / 60;
const SPAR_SEED = 7;
// what a build needs done after its patch is applied, by patch: the outfits baked again in a guard the patch changed
const AFTER = { 'arm-a.patch': [['tools/bake.mjs', '--wear']] };

/* ---- the scenes. Each: the page and its size, the frames kept (from `from`, every 60 / fps, `frames` of them: the
   registry's fps and frames), the crop [x, y, w, h] in CSS pixels, and what the page is set up and driven with. */
const SCENES = {
  arm: { page: 'index.html?auto&seed=7&wear=training', viewport: [1280, 720], from: 1030, crop: [400, 140, 360, 400], game: true, keys: armKeys, measure: 'arm' },
  lean: { page: 'index.html?auto&spar&seed=3', viewport: [1280, 720], from: 45, crop: [160, 140, 380, 400], game: true, keys: leanKeys, measure: 'lean' },
  tempo: { page: 'spar.html?capture', viewport: [390, 844], from: 0, crop: [0, 170, 390, 620], game: false, measure: 'tempo', crf: 46 }
};
// the player, as the forearm was measured (the scratch measure of it): his guard held (L) the first 7 s of every 10, then let
// down; a jab, a step left, a jab, a step right
function armKeys(f) {
  const c = f % 600,
    out = [];
  if (c === 0) out.push(['keydown', 'KeyL']);
  if (c === 420) out.push(['keyup', 'KeyL']);
  if (c === 450 || c === 520) out.push(['keydown', 'KeyJ'], ['keyup', 'KeyJ']);
  if (c === 480) out.push(['keydown', 'KeyA']);
  if (c === 500) out.push(['keyup', 'KeyA']);
  if (c === 540) out.push(['keydown', 'KeyD']);
  if (c === 560) out.push(['keyup', 'KeyD']);
  return out;
}
// the player walked straight back (screen left: away from the other man, the camera side on) from 1 s for LEAN_WALK s, then let go
const LEAN_WALK = 3.2;
function leanKeys(f) {
  if (f === 60) return [['keydown', 'KeyA']];
  if (f === 60 + Math.round(LEAN_WALK * 60)) return [['keyup', 'KeyA']];
  return [];
}

/* ---- a build: this checkout copied, its patch applied, what it needs done after; -> its folder */
function build(clip, modules) {
  const dir = mkdtempSync(path.join(tmpdir(), 'openclip-' + clip.id + '-'));
  cpSync(here, dir, { recursive: true, filter: src => !/[/\\](\.git|node_modules)$/.test(src) && !src.startsWith(path.join(here, 'docs', 'ref')) });
  if (modules) symlinkSync(modules, path.join(dir, 'node_modules'), 'dir');
  if (clip.patch) {
    execFileSync('git', ['apply', '--whitespace=nowarn', path.join(here, clip.patch)], { cwd: dir, stdio: 'inherit' });
    for (const cmd of AFTER[path.basename(clip.patch)] || []) execFileSync(process.execPath, cmd, { cwd: dir, stdio: 'inherit' });
  }
  return dir;
}

// a folder served as it is, on a free port
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.woff2': 'font/woff2' };
function serve(dir) {
  const server = createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(dir) || !existsSync(file)) return res.writeHead(404).end();
    try {
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ port: server.address().port, close: () => server.close() })));
}

/* ---- in the page */
// the game page: frames stepped by hand, the shake's dice seeded, and a frame drawn only when asked (the bout is the same)
function gameInit() {
  const q = [];
  window.requestAnimationFrame = cb => (q.push(cb), q.length);
  window.__tick = t => {
    const cbs = q.splice(0);
    for (const cb of cbs) cb(t);
  };
  let s = 12345;
  Math.random = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s / 0x7fffffff);
}
// the frames from..to stepped, with the keys of each (and, on the last, drawn, measured if asked)
async function gameSteps(page, scene, from, to, measure) {
  const keys = [];
  for (let f = from; f <= to; f++) keys.push(scene.keys(f));
  return page.evaluate(
    ([from, keys, measure]) => {
      const R = __bout.renderer;
      if (!window.__realDraw) window.__realDraw = R.draw;
      let out = null;
      keys.forEach((list, i) => {
        const f = from + i,
          last = i === keys.length - 1;
        for (const [type, code] of list) dispatchEvent(new KeyboardEvent(type, { code }));
        window.__drawOn = last;
        window.__measureOn = last && measure;
        R.draw = frame => (window.__drawOn ? (window.__measured ? window.__measured(frame) : window.__realDraw(frame)) : 0);
        window.__tick(f * (1000 / 60));
        if (last && window.__after) out = window.__after();
      });
      return out;
    },
    [from, keys, measure]
  );
}

/* The arm's measure, set up in the page: the player's suit with his right forearm (bone 12 as the splats number them: rig/
   skeleton.mjs NAMES, behind bone 0) in a marked colour, alone, and with every bone in its own colour (and the other man in
   one colour): what is in front where. -> each kept frame { vis, alone, mask (the art pixels of the forearm that show), ids
   (when asked: the art grid's owner of each pixel, base64: 0 the world, 1..22 a bone of the player, 46 the other man) } */
async function armSetup(page, wear, keepIds) {
  await page.evaluate(
    async ([wear, keepIds]) => {
      const { unpack, fromBase64 } = await import('/src/render/splats.mjs');
      const manifest = await (await fetch('/assets/manifest.json')).json();
      const part = manifest.wear[wear],
        rows = unpack(fromBase64(await (await fetch('/assets/' + part.file)).text()), part);
      const R = __bout.renderer,
        gl = R.gl,
        FORE = 12,
        MARK = 47,
        FOE = 46,
        n = part.count;
      const marked = rows.slice(),
        ids = rows.slice(),
        foe = rows.slice(),
        only = [];
      for (let i = 0; i < n; i++) {
        const bone = Math.round(rows[i * 12 + 10]);
        ids[i * 12 + 9] = bone;
        foe[i * 12 + 9] = FOE;
        if (bone === FORE) {
          marked[i * 12 + 9] = MARK;
          for (let k = 0; k < 12; k++) only.push(marked[i * 12 + k]);
        }
      }
      const mMarked = R.mesh(marked, n),
        mOnly = R.mesh(new Float32Array(only), only.length / 12),
        mIds = R.mesh(ids, n),
        mFoe = R.mesh(foe, n);
      // (a palette of signatures: slot k is (k, 200, 77) as bytes)
      const idPal = new Float32Array(48 * 3);
      for (let k = 0; k < 48; k++) idPal.set([k / 255, 200 / 255, 77 / 255], k * 3);
      let px = null;
      const read = () => {
        const { w, h } = R.target;
        if (!px || px.length !== w * h * 4) px = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, R.target.fbo);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return px;
      };
      const magenta = () => {
        const p = read(),
          at = [];
        for (let i = 0, j = 0; i < p.length; i += 4, j++) if (p[i] === 255 && p[i + 1] === 0 && p[i + 2] === 255) at.push(j);
        return at;
      };
      let last = null;
      window.__measured = frame => {
        const draw = window.__realDraw;
        if (!window.__measureOn) return draw(frame);
        const man = frame.layers.find(l => l.silhouette === 1 && l.mask === 1),
          other = frame.layers.find(l => l.silhouette === 2 && l.mask === 1),
          pal = man.palette.slice();
        pal.set([1, 0, 1], MARK * 3);
        const mk = { ...man, mesh: mMarked, palette: pal };
        draw({ ...frame, layers: frame.layers.map(l => (l === man ? mk : l)) });
        const mask = magenta();
        draw({ ...frame, layers: [{ ...mk, mesh: mOnly }] });
        const alone = magenta().length;
        let idsOut = null;
        if (keepIds) {
          draw({ ...frame, layers: frame.layers.map(l => (l === man ? { ...man, mesh: mIds, palette: idPal } : l === other ? { ...other, mesh: mFoe, palette: idPal } : l)) });
          const p = read(),
            owner = new Uint8Array(p.length / 4);
          for (let i = 0, j = 0; i < p.length; i += 4, j++) owner[j] = p[i + 1] === 200 && p[i + 2] === 77 ? p[i] : 0;
          let s = '';
          for (let i = 0; i < owner.length; i += 8192) s += String.fromCharCode.apply(null, owner.subarray(i, i + 8192));
          idsOut = btoa(s);
        }
        last = { vis: mask.length, alone, mask, ids: idsOut, w: R.target.w, h: R.target.h };
        return draw(frame);
      };
      window.__after = () => {
        const b = __bout.bout,
          f = b.fighters[0];
        const out = { ...last, x: f.x, z: f.z, cover: f.cover, act: f.action ? f.action.name : null, phase: __bout.phase };
        last = null;
        return out;
      };
    },
    [wear, keepIds]
  );
}

// the lean's measure: his spine (hips to chest) from upright toward his back, degrees; the ropes' press, centimetres
async function leanSetup(page) {
  await page.evaluate(async () => {
    const { pressOf } = await import('/src/world/ropes.mjs');
    window.__measured = null;
    window.__after = () => {
      const f = __bout.bout.fighters[0],
        p = f.points,
        fwd = [Math.sin(f.yaw), Math.cos(f.yaw)],
        up = [p.chest[0] - p.hips[0], p.chest[1] - p.hips[1], p.chest[2] - p.hips[2]],
        ahead = up[0] * fwd[0] + up[2] * fwd[1];
      return { back: (Math.atan2(-ahead, up[1]) * 180) / Math.PI, press: 100 * Math.max(...pressOf(p)), x: f.x, z: f.z, rope: f.rope ? f.rope.press : 0, yaw: __bout.cam.yaw, phase: __bout.phase };
    };
  });
}

/* ---- one clip of a group: built, served, driven, kept; -> what was measured */
async function record(chromium, group, scene, clip, opts) {
  const dir = build(clip, opts.modules);
  const srv = await serve(dir);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const keep = opts.frames ? path.join(opts.frames, clip.id) : mkdtempSync(path.join(tmpdir(), 'openclip-frames-'));
  rmSync(keep, { recursive: true, force: true });
  mkdirSync(keep, { recursive: true });
  const measured = [];
  try {
    const page = await browser.newPage({ viewport: { width: scene.viewport[0], height: scene.viewport[1] }, deviceScaleFactor: 1 });
    page.on('pageerror', e => console.error(clip.id, 'page:', e.message));
    page.on('console', m => m.type() === 'error' && console.error(clip.id, 'console:', m.text()));
    const every = Math.round(60 / group.fps),
      kept = Array.from({ length: opts.probe ? opts.probe.length : group.frames }, (_, i) => (opts.probe ? opts.probe[i] : scene.from + i * every));
    const shot = async (i, f) => {
      const file = path.join(keep, String(i).padStart(4, '0') + '.png');
      if (opts.probe) await page.screenshot({ path: path.join(keep, `probe-f${f}.png`) });
      else await page.screenshot({ path: file, clip: { x: scene.crop[0], y: scene.crop[1], width: scene.crop[2], height: scene.crop[3] } });
    };
    if (scene.game) {
      await page.addInitScript(gameInit);
      await page.goto(`http://127.0.0.1:${srv.port}/${scene.page}`);
      await page.waitForFunction(() => globalThis.__bout && window.__tick, null, { polling: 100, timeout: 60000 });
      if (scene.measure === 'arm') await armSetup(page, 'training', !!opts.keepIds);
      if (scene.measure === 'lean') await leanSetup(page);
      let f = 0;
      for (let i = 0; i < kept.length; i++) {
        const m = await gameSteps(page, scene, f, kept[i], !opts.probe);
        f = kept[i] + 1;
        await shot(i, kept[i]);
        measured.push({ f: kept[i], ...m });
      }
    } else {
      // (a picture in between those kept is not drawn: the page is the same without it)
      await page.addInitScript(() => {
        const P = WebGL2RenderingContext.prototype;
        for (const name of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced']) {
          const was = P[name];
          P[name] = function (...a) {
            if (!window.__skip) return was.apply(this, a);
          };
        }
      });
      await page.goto(`http://127.0.0.1:${srv.port}/${scene.page}`);
      await page.waitForFunction(() => globalThis.__spar && !document.getElementById('loading'), null, { polling: 100, timeout: 60000 });
      await page.evaluate(seed => __spar.newRound(seed), SPAR_SEED);
      // (arranged in the page's worker, in its own time: the picture moved on a step at a time until the round starts)
      for (let i = 0; i < 2000; i++) {
        const phase = await page.evaluate(() => ((window.__skip = true), __spar.tick(1000 / 60), (window.__skip = false), __spar.phase));
        if (phase === 'play') break;
        await new Promise(ok => setTimeout(ok, 25));
      }
      let f = 0;
      for (let i = 0; i < kept.length; i++) {
        const m = await page.evaluate(
          n => {
            for (let k = 0; k < n; k++) (window.__skip = k < n - 1), __spar.tick(1000 / 60);
            window.__skip = false;
            return { k: __spar.k, phase: __spar.phase, t: __spar.bout.t };
          },
          kept[i] - f
        );
        f = kept[i];
        await shot(i, kept[i]);
        measured.push({ f: kept[i], ...m });
      }
    }
    if (!opts.probe) {
      const out = path.join(here, 'docs', 'ref', 'open');
      mkdirSync(out, { recursive: true });
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(group.fps), '-i', path.join(keep, '%04d.png'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(scene.crf || 36), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', '-an', path.join(out, clip.id + '.webm')]);
      const poster = String(Math.floor((group.poster ?? group.frames / 2) | 0)).padStart(4, '0');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(keep, poster + '.png'), '-q:v', '3', path.join(out, clip.id + '.jpg')]);
    }
  } finally {
    await browser.close();
    srv.close();
    if (!opts.frames) rmSync(keep, { recursive: true, force: true });
  }
  if (scene.measure === 'tempo' && !opts.probe) measured.spar = execFileSync(process.execPath, ['tools/spar.mjs', '--seed', String(SPAR_SEED), '--no-audit'], { cwd: dir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return measured;
}

/* ---- what is said of what was measured */
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const { NAMES } = await import(pathToFileURL(path.join(here, 'src', 'rig', 'skeleton.mjs')).href);
const TRUNK = ['Hips', 'Spine1', 'Spine2', 'Chest'];
function armSummary(runs) {
  const out = {};
  const now = runs['arm-now'];
  for (const [id, frames] of Object.entries(runs)) {
    const seen = frames.filter(r => r.alone >= 30),
      share = seen.map(r => r.vis / r.alone);
    out[id] = { frames: seen.length, mean: +mean(share).toFixed(3), min: +Math.min(...share).toFixed(3), down: +mean(seen.filter(r => !r.cover).map(r => r.vis / r.alone)).toFixed(3) };
    // (the player where he stood, against this checkout's: whether the bout went otherwise)
    if (now && id !== 'arm-now') out[id].apart = +Math.max(...frames.map((r, i) => (now[i] ? Math.hypot(r.x - now[i].x, r.z - now[i].z) : 0))).toFixed(3);
    // (a build that moves nothing: what was in front, in this checkout's picture, of each pixel of the forearm it shows that this checkout did not)
    if (now && id === 'arm-b') {
      const by = {},
        frames_ = {};
      frames.forEach((r, i) => {
        const was = now[i];
        if (!was || !was.ids) return;
        const owner = Buffer.from(was.ids, 'base64'),
          had = new Set(was.mask);
        for (const j of r.mask) {
          if (had.has(j)) continue;
          // (the splats number a bone one more than rig/skeleton.mjs NAMES does: bone 0 is the one that never moves)
          const o = owner[j],
            name = o === 46 ? 'the other man' : o === 0 ? 'the world' : NAMES[o - 1];
          by[name] = (by[name] || 0) + 1;
          // (his trunk is what it should come out of; his own upper arm meets it at the elbow; anything else is kept by frame)
          if (!TRUNK.includes(name) && name !== 'RightArm') (frames_[r.f] = frames_[r.f] || {})[name] = (frames_[r.f][name] || 0) + 1;
        }
      });
      out[id].over = by;
      out[id].oddFrames = frames_;
    }
  }
  return out;
}
function leanSummary(runs) {
  const out = {};
  for (const [id, frames] of Object.entries(runs)) {
    const before = frames.filter(r => r.press === 0 && r.rope === 0).slice(0, 15);
    const peak = frames.reduce((a, r) => (r.back > a.back ? r : a));
    out[id] = { peak: +peak.back.toFixed(1), at: peak.f, stance: +mean(before.map(r => r.back)).toFixed(1), press: +Math.max(...frames.map(r => r.press)).toFixed(1) };
    out[id].shows = +(out[id].peak - out[id].stance).toFixed(1);
  }
  return out;
}
function tempoSummary(runs) {
  const out = {};
  for (const [id, frames] of Object.entries(runs)) {
    const s = frames.spar || '',
      rate = /초당 기술: 빨강 ([\d.]+) · 파랑 ([\d.]+) · 아무도 아무것도 시작하지 않은 가장 긴 틈 ([\d.]+) s \(기술만: ([\d.]+) s\)/.exec(s),
      ko = /KO: (\S+) \(시합 시계 ([\d.]+) s\) (\S+) (.+?) ([\d.]+) N·s/.exec(s);
    out[id] = { red: rate && +rate[1], blue: rate && +rate[2], lull: rate && +rate[3], lullTech: rate && +rate[4], ko: ko ? { at: +ko[2], who: ko[3], what: ko[4] } : null, played: frames.length && frames[frames.length - 1].k };
  }
  return out;
}

/* ---- the command */
const names = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
if (!names.length) {
  console.error('node tools/openclips.mjs <group> ... [--only ids] [--measures file] [--frames dir] [--modules dir] [--probe frames]');
  process.exit(1);
}
const { GROUPS } = await import(pathToFileURL(path.join(here, 'src', 'open.clips.mjs')).href + '?' + Date.now());
const only = arg('--only') ? arg('--only').split(',') : null,
  probe = arg('--probe') ? arg('--probe').split(',').map(Number) : null,
  modules = arg('--modules') ? path.resolve(arg('--modules')) : existsSync(path.join(here, 'node_modules')) ? path.join(here, 'node_modules') : null,
  framesDir = arg('--frames') ? path.resolve(arg('--frames')) : null;
const { chromium } = require('playwright');
const all = {};
for (const name of names) {
  const group = GROUPS[name],
    scene = SCENES[name];
  if (!group || !scene) throw new Error('no group ' + name);
  const runs = {};
  for (const clip of probe ? [{ id: name + '-probe', patch: null }] : group.clips) {
    if (only && !only.includes(clip.id)) continue;
    console.error(`${name}: ${clip.id}${clip.patch ? ' (' + clip.patch + ')' : ''}`);
    runs[clip.id] = await record(chromium, group, scene, clip, { modules, frames: framesDir, probe, keepIds: clip.id === 'arm-now' });
  }
  if (probe) continue;
  all[name] = name === 'arm' ? armSummary(runs) : name === 'lean' ? leanSummary(runs) : tempoSummary(runs);
  if (name === 'lean' || name === 'arm') all[name].frames = Object.fromEntries(Object.entries(runs).map(([id, fr]) => [id, fr.map(({ ids, mask, ...r }) => r)]));
}
if (!probe) {
  const said = JSON.stringify(all, (k, v) => (k === 'frames' && typeof v === 'object' ? undefined : v), 1);
  console.log(said);
  if (arg('--measures')) writeFileSync(arg('--measures'), JSON.stringify(all, null, 1));
}

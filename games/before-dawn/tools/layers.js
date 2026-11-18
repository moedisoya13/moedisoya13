// Shared source discovery for build.js and the Node loader.
// Files are discovered by directory and sorted, so adding a file under a
// content directory never requires editing a shared file.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Load order. Sim layers run in Node and in the browser; client layers only in the browser.
const SIM_DIRS = ['src/core', 'src/content', 'src/bot'];
const CLIENT_DIRS = ['src/client', 'src/ui'];
const BOOT = 'src/boot.js';

function listFiles(dirRel) {
  const out = [];
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return out;
  (function walk(d, rel) {
    const entries = fs.readdirSync(d, { withFileTypes: true })
      .map((e) => e.name).sort();
    for (const name of entries) {
      const p = path.join(d, name);
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(p).isDirectory()) walk(p, r);
      else if (name.endsWith('.js')) out.push(dirRel + '/' + r);
    }
  })(abs, '');
  return out;
}

function simFiles() { return SIM_DIRS.flatMap(listFiles); }
function clientFiles() { return CLIENT_DIRS.flatMap(listFiles); }

function assetMeta() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sprites.json'), 'utf8'));
}

// Pixel size of a WebP file (VP8, VP8L, VP8X headers) — to check animation strips at build time.
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error('unknown WebP chunk ' + kind);
}

// Animation clips (assets/anim/README.md): the manifest, minus `_placeholder/` strips unless
// opts.placeholders (opts.dir: another anim folder, for tests), each entry checked (fields, clip name, file present, strip = frames × fw by fh).
// Returns {meta: {char: {clip: def}}, files: [rel file under assets/anim]}.
const ANIM_CLIPS = {
  hero: ['idle_side', 'idle_down', 'idle_up', 'move_side', 'move_down', 'move_up', 'attack_side', 'attack_down', 'attack_up', 'dash_side', 'hurt'],
  enemy: ['idle', 'move', 'attack', 'hurt', 'die'],
};
function animMeta(opts) {
  opts = opts || {};
  const dir = opts.dir || path.join(ROOT, 'assets/anim'), mf = path.join(dir, 'manifest.json');
  const meta = {}, files = [];
  if (!fs.existsSync(mf)) return { meta, files };
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  for (const char of Object.keys(m).sort()) for (const clip of Object.keys(m[char]).sort()) {
    const c = m[char][clip], where = `assets/anim/manifest.json ${char}.${clip}`;
    if (!opts.placeholders && c.file.startsWith('_placeholder/')) continue;
    const names = char === 'hero' ? ANIM_CLIPS.hero : ANIM_CLIPS.enemy;
    if (!names.includes(clip)) throw new Error(`${where}: unknown clip name (allowed: ${names.join(' ')})`);
    for (const k of ['frames', 'fw', 'fh', 'fps', 'charH']) if (!(typeof c[k] === 'number' && c[k] > 0)) throw new Error(`${where}: ${k} must be a positive number`);
    if (!Array.isArray(c.anchor) || c.anchor.length !== 2) throw new Error(`${where}: anchor must be [x, y]`);
    if (c.strike !== undefined && !(Number.isInteger(c.strike) && c.strike >= 0 && c.strike < c.frames)) throw new Error(`${where}: strike must be a frame index`);
    const abs = path.join(dir, c.file);
    if (!fs.existsSync(abs)) throw new Error(`${where}: file ${c.file} not found`);
    const [w, h] = webpSize(fs.readFileSync(abs));
    if (w !== c.frames * c.fw || h !== c.fh) throw new Error(`${where}: strip is ${w}×${h}, expected ${c.frames}×${c.fw} = ${c.frames * c.fw} × ${c.fh}`);
    (meta[char] = meta[char] || {})[clip] = Object.assign({ loop: false }, c);
    if (!files.includes(c.file)) files.push(c.file);
  }
  return { meta, files };
}

module.exports = { ROOT, SIM_DIRS, CLIENT_DIRS, BOOT, listFiles, simFiles, clientFiles, assetMeta, animMeta, webpSize, ANIM_CLIPS };

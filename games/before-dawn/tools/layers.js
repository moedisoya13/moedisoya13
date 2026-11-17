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

module.exports = { ROOT, SIM_DIRS, CLIENT_DIRS, BOOT, listFiles, simFiles, clientFiles, assetMeta };

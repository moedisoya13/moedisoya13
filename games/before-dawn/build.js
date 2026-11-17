#!/usr/bin/env node
// Builds dist/before-dawn.html: one file, all JS inline, sprites as base64.
// Sources are discovered by directory (tools/layers.js), so new content files need no edit here.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./tools/layers');

const FORBIDDEN = ['http://', 'https://', 'fetch(', 'XMLHttpRequest', '<script src', '<link '];

function build() {
  const meta = L.assetMeta();
  const data = {};
  for (const [id, m] of Object.entries(meta)) {
    const buf = fs.readFileSync(path.join(L.ROOT, 'assets', m.file));
    data[id] = 'data:image/webp;base64,' + buf.toString('base64');
  }
  const files = L.simFiles().concat(L.clientFiles(), [L.BOOT]);
  const chunks = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(L.ROOT, rel), 'utf8');
    if (/<\/script/i.test(src)) throw new Error(`${rel}: contains a closing script tag`);
    for (const f of FORBIDDEN) if (src.includes(f)) throw new Error(`${rel}: contains forbidden string "${f}"`);
    chunks.push(`// ---- ${rel}\n(function(BD){'use strict';\n${src}\n})(BD);`);
  }
  const head = [
    'var BD = {};',
    "BD.env = 'browser';",
    'BD.assetMeta = ' + JSON.stringify(meta) + ';',
    'BD.assetData = ' + JSON.stringify(data) + ';',
  ].join('\n');
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>여명 전야</title>
<style>
html,body{margin:0;height:100%;background:#050508;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
canvas{display:block;width:100vw;height:100vh;touch-action:none}
</style></head><body><canvas id="bd"></canvas>
<script>
${head}
${chunks.join('\n')}
</script></body></html>
`;
  for (const f of FORBIDDEN) if (html.includes(f)) throw new Error(`build output contains forbidden string "${f}"`);
  fs.mkdirSync(path.join(L.ROOT, 'dist'), { recursive: true });
  const out = path.join(L.ROOT, 'dist/before-dawn.html');
  fs.writeFileSync(out, html);
  return { out, bytes: html.length, files: files.length };
}

if (require.main === module) {
  const r = build();
  console.log(`built ${path.relative(process.cwd(), r.out)} (${(r.bytes / 1024).toFixed(0)} KB, ${r.files} source files)`);
}
module.exports = { build, FORBIDDEN };

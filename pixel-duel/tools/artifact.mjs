#!/usr/bin/env node
/* Makes the page a claude.ai Artifact wants out of index.html: the same content without the document wrapper (the host
   supplies it), and the list of files the page loads, with the media type the host cannot guess from `.mjs`.
     node tools/artifact.mjs <out.html>     prints the files map as JSON */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error('index.html has no ' + what);
  return m[0];
};
const page = [
  pick(/<title>[\s\S]*?<\/title>/, 'title'),
  '<meta name="claude:viewport-fit-sides" content="cover">',
  pick(/<style>[\s\S]*?<\/style>/, 'style'),
  pick(/<body>([\s\S]*)<\/body>/, 'body').replace(/^<body>|<\/body>$/g, '').trim()
].join('\n');
writeFileSync(process.argv[2], page + '\n');

// every module the page reaches from src/main.mjs, found by following its imports
const seen = new Set();
(function follow(file) {
  if (seen.has(file)) return;
  seen.add(file);
  for (const m of readFileSync(path.join(root, file), 'utf8').matchAll(/from '(\.[^']+)'/g)) follow(path.posix.join(path.posix.dirname(file), m[1]));
})('src/main.mjs');
const files = Object.fromEntries([...seen].sort().map(f => [f, { from: f, contentType: 'text/javascript' }]));
files['assets/manifest.json'] = 'assets/manifest.json';
for (const part of ['fighter', 'arena']) files[`assets/${part}.splats.txt`] = `assets/${part}.splats.txt`;
console.log(JSON.stringify(files, null, 1));

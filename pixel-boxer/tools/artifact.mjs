#!/usr/bin/env node
/* Makes the page a claude.ai Artifact wants out of index.html: the same content without the document wrapper (the host
   supplies it), and the list of files the page loads, with the media type the host cannot guess from `.mjs`.
     node tools/artifact.mjs <out.html>                                  the game
     node tools/artifact.mjs catalog.html src/catalog.mjs <out.html>     the footwork catalogue
     node tools/artifact.mjs pending.html src/pending.mjs <out.html>     the pending catalogue (or fxlab.html src/fxlab.mjs)
   Either way the files map is printed as JSON: the modules (those imported, and those loaded later by import('./...')), the
   assets (a page of boxers alone, without the ring: the catalogues and the effect study), and the reference sheets (docs/ref)
   the modules name. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [pageFile, entry, outFile] = process.argv.length > 4 ? process.argv.slice(2) : ['index.html', 'src/main.mjs', process.argv[2]];
const html = readFileSync(path.join(root, pageFile), 'utf8');
const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error('index.html has no ' + what);
  return m[0];
};
const page = [
  pick(/<title>[\s\S]*?<\/title>/, 'title'),
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...(html.match(/<link rel="stylesheet"[^>]*>/g) || []),
  pick(/<style>[\s\S]*?<\/style>/, 'style'),
  pick(/<body>([\s\S]*)<\/body>/, 'body').replace(/^<body>|<\/body>$/g, '').trim()
].join('\n');
writeFileSync(outFile, page + '\n');

// every module the page reaches from src/main.mjs, found by following its imports
const seen = new Set(),
  sheets = new Set();
(function follow(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const text = readFileSync(path.join(root, file), 'utf8');
  // (a reference sheet a module names is loaded by the page from the same path)
  for (const m of text.matchAll(/docs\/ref\/[\w-]+\.jpg/g)) sheets.add(m[0]);
  // (and a module it loads only when it is wanted, import('./...'): the pending catalogue's recorded clips, src/clips/index.mjs)
  for (const m of text.matchAll(/(?:from |import\()'(\.[^']+)'/g)) follow(path.posix.join(path.posix.dirname(file), m[1]));
})(entry);
const files = Object.fromEntries([...seen].sort().map(f => [f, { from: f, contentType: 'text/javascript' }]));
files['assets/manifest.json'] = 'assets/manifest.json';
for (const part of /catalog|pending|fxlab/.test(entry) ? ['boxer'] : ['boxer', 'ring']) files[`assets/${part}.splats.txt`] = `assets/${part}.splats.txt`;
for (const sheet of [...sheets].sort()) files[sheet] = sheet;
console.log(JSON.stringify(files, null, 1));

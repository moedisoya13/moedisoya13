#!/usr/bin/env node
/* Makes the page a claude.ai Artifact wants out of index.html: the same content without the document wrapper (the host
   supplies it), and the list of files the page loads, with the media type the host cannot guess from `.mjs`.
     node tools/artifact.mjs <out.html>                                  the game
     node tools/artifact.mjs catalog.html src/catalog.mjs <out.html>     the footwork catalogue
     node tools/artifact.mjs pending.html src/pending.mjs <out.html>     the pending catalogue (or fxlab.html src/fxlab.mjs)
     node tools/artifact.mjs spar.html src/spar.mjs <out.html>           the one-round sparring (its outfits' splats with it)
     ... --since <commit>                                                the same, and the files map printed holds only the
                                                                         files changed since that commit, and those gone
                                                                         since then as null (for publishing again)
   Either way the files map is printed as JSON: the modules (those imported, those loaded later by import('./...'), and a
   worker's, new URL('./...', import.meta.url)), the assets (a page of boxers alone, without the ring: the catalogues and the
   effect study; the game and the sparring with both places, the ring with its ropes and the pit with its crowd; the
   sparring's outfits besides), and the reference sheets (docs/ref) the modules name. The page made carries
   the commit it was made from and that commit's date (<meta name="build" content="7c4c057 2026-11-24">, a + after the
   commit if the working tree had changes): the committed .html files are not touched. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2),
  sinceAt = argv.indexOf('--since'),
  since = sinceAt >= 0 ? argv[sinceAt + 1] : null;
if (sinceAt >= 0) argv.splice(sinceAt, 2);
const [pageFile, entry, outFile] = argv.length > 2 ? argv : ['index.html', 'src/main.mjs', argv[0]];
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
// (the commit the page is made from, its date, and whether the working tree had changes; nothing if this is no checkout)
const stamp = (() => {
  try {
    const dirty = git('status', '--porcelain', '--untracked-files=no') !== '';
    return `${git('rev-parse', '--short=7', 'HEAD')}${dirty ? '+' : ''} ${git('log', '-1', '--format=%cs')}`;
  } catch {
    return null;
  }
})();
const html = readFileSync(path.join(root, pageFile), 'utf8');
const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error('index.html has no ' + what);
  return m[0];
};
const page = [
  pick(/<title>[\s\S]*?<\/title>/, 'title'),
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...(stamp ? [`<meta name="build" content="${stamp}">`] : []),
  ...(html.match(/<link rel="stylesheet"[^>]*>/g) || []),
  pick(/<style>[\s\S]*?<\/style>/, 'style'),
  pick(/<body>([\s\S]*)<\/body>/, 'body').replace(/^<body>|<\/body>$/g, '').trim()
].join('\n');
writeFileSync(outFile, page + '\n');

/* every module the page reaches from its entry, found by following its imports (read: how a file's text is had, the working
   tree's or a commit's) */
function filesOf(read) {
  const seen = new Set(),
    sheets = new Set(),
    wears = new Set(),
    manifest = JSON.parse(read('assets/manifest.json') || '{}'),
    outfits = Object.keys(manifest.wear || {});
  (function follow(file) {
    if (seen.has(file)) return;
    const text = read(file);
    if (text === null) return;
    seen.add(file);
    // (a reference sheet a module names is loaded by the page from the same path; and a recording, docs/ref/*.webm)
    for (const m of text.matchAll(/docs\/ref\/[\w-]+\.(?:jpg|webm)/g)) sheets.add(m[0]);
    // (and an outfit a module dresses a card in by name, its outfits' list: the motion catalogue's new samples, src/samples.data.mjs)
    if (/\bwear: /.test(text)) for (const w of outfits) if (text.includes(`'${w}'`)) wears.add(w);
    // (and a module it loads only when it is wanted, import('./...'): the pending catalogue's recorded clips, src/clips/index.mjs;
    // and a worker's, new URL('./...', import.meta.url): the sparring's planner)
    for (const m of text.matchAll(/(?:from |import\()'(\.[^']+)'/g)) follow(path.posix.join(path.posix.dirname(file), m[1]));
    for (const m of text.matchAll(/new URL\('(\.[^']+\.mjs)', import\.meta\.url\)/g)) follow(path.posix.join(path.posix.dirname(file), m[1]));
  })(entry);
  const files = Object.fromEntries([...seen].sort().map(f => [f, { from: f, contentType: 'text/javascript' }]));
  files['assets/manifest.json'] = 'assets/manifest.json';
  // (the sparring dresses its men as the viewer picks: every outfit)
  const wear = /spar/.test(entry) ? Object.values(manifest.wear || {}).map(w => w.file.replace(/\.splats\.txt$/, '')) : [];
  // (and the places a bout is fought in, the game's and the sparring's: the ring and its ropes, the pit and its crowd)
  const places = ['ring', 'ropes', 'pit', 'crowd'].filter(k => manifest[k]).map(k => manifest[k].file.replace(/\.splats\.txt$/, ''));
  for (const part of /catalog|pending|fxlab/.test(entry) ? ['boxer'] : ['boxer', ...places, ...wear]) files[`assets/${part}.splats.txt`] = `assets/${part}.splats.txt`;
  for (const w of [...wears].sort()) files[`assets/boxer-${w}.splats.txt`] = `assets/boxer-${w}.splats.txt`;
  for (const sheet of [...sheets].sort()) files[sheet] = sheet;
  return files;
}
const here = file => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : null);
let files = filesOf(here);
if (since) {
  // (only what is new or changed since that commit, and what the page loaded then and does not now, as null)
  const then = filesOf(file => {
      try {
        return git('show', `${since}:./${file}`);
      } catch {
        return null;
      }
    }),
    changed = new Set(git('diff', '--name-only', '--relative', since, '--', ...Object.keys(files)).split('\n').filter(Boolean)),
    out = {};
  for (const [k, v] of Object.entries(files)) if (changed.has(k) || !(k in then)) out[k] = v;
  for (const k of Object.keys(then)) if (!(k in files)) out[k] = null;
  files = out;
}
console.log(JSON.stringify(files, null, 1));

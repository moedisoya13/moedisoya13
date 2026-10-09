// Build: concatenate src/*.js (in name order) into one self-contained HTML file.
//   node game/build.mjs                 → game/slasher-x-slasher.html (standalone, full document)
//   node game/build.mjs --artifact out  → also writes an artifact body (no <html>/<head>/<body> skeleton)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'src');
const files = readdirSync(srcDir).filter((f) => /^\d\d_.*\.js$/.test(f)).sort();
const js = files.map((f) => `// ── ${f} ──\n` + readFileSync(join(srcDir, f), 'utf8')).join('\n');
const body = readFileSync(join(srcDir, 'template.html'), 'utf8').replace('/*__GAME_JS__*/', () => js);

const head = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Slasher X Slasher">
<meta name="theme-color" content="#07060a">
`;
// <title> and <style> go in <head>; the app markup and script in <body>
const doc = head + body.split('<div id="app">')[0] + '</head>\n<body>\n<div id="app">' + body.split('<div id="app">')[1] + '\n</body>\n</html>\n';

const out = join(here, 'slasher-x-slasher.html');
writeFileSync(out, doc);
console.log(`built ${out} (${(doc.length / 1024).toFixed(1)} KB, ${files.length} modules)`);

const ai = process.argv.indexOf('--artifact');
if (ai > 0 && process.argv[ai + 1]) {
  writeFileSync(process.argv[ai + 1], body);
  console.log(`artifact body → ${process.argv[ai + 1]}`);
}

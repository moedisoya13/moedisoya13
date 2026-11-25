// Eye 10, finding 10-3: `node tools/artifact.mjs <page>.html <entry> <out> --since <commit>` never looks at the page's own
// .html: a change to spar.html (or catalog.html ...) alone prints {}, which docs/handoff.md §3 reads as "nothing changed".
// Read-only for the checkout: a throwaway clone (git clone --shared) under this script's scratch is edited, never the
// checkout.   node 10-3.mjs <pixel-boxer root>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const SCRATCH = '/tmp/pixel-boxer-audit/audit/repro/10';
(await import('node:fs')).mkdirSync(SCRATCH, { recursive: true });
const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const sub = path.relative(top, root);
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tmp = mkdtempSync(path.join(SCRATCH, 'clone-'));
try {
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', top, tmp]);
  execFileSync('git', ['-C', tmp, 'checkout', '--quiet', head, '--', sub]);
  const pb = path.join(tmp, sub);
  const run = (page, entry) => JSON.parse(execFileSync('node', [path.join(pb, 'tools/artifact.mjs'), page, entry, path.join(tmp, 'out.html'), '--since', 'HEAD'], { encoding: 'utf8' }));
  const rows = [];
  for (const [page, entry] of [['spar.html', 'src/spar.mjs'], ['catalog.html', 'src/catalog.mjs'], ['open.html', 'src/open.mjs']]) {
    const before = run(page, entry);
    // (a visible change to the page alone: a word of its markup)
    const f = path.join(pb, page), html = readFileSync(f, 'utf8');
    writeFileSync(f, html.replace('</body>', '<p id="changed-page">the page itself changed</p>\n</body>'));
    const status = execFileSync('git', ['-C', tmp, 'status', '--porcelain', '--', sub + '/' + page], { encoding: 'utf8' }).trim();
    const after = run(page, entry);
    const outHas = readFileSync(path.join(tmp, 'out.html'), 'utf8').includes('changed-page');
    rows.push({ page, before: Object.keys(before).length, status, after: Object.keys(after).length, outHas });
    writeFileSync(f, html);
  }
  for (const r of rows) console.log(`${r.page}: files map before edit ${r.before} entries; after editing only the page (git: "${r.status}") ${r.after} entries; the made out.html carries the edit: ${r.outHas}`);
  const bad = rows.filter(r => r.after === 0 && r.status);
  console.log(bad.length ? `REPRO: yes --since prints {} ("nothing changed") for ${bad.length} of ${rows.length} pages whose .html alone was edited` : 'REPRO: no --since notices a changed page');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

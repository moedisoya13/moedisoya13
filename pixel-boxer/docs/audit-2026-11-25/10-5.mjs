// Eye 10, finding 10-5: the publishing record. docs/handoff.md §3 says the whole history is in docs/artifact-history.md;
// that file has no row for the open-questions catalogue (the page the user answers on), and the effect study's v9 names no
// commit, so `tools/artifact.mjs --since` cannot be pointed at it.   node 10-5.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const ho = readFileSync(path.join(root, 'docs/handoff.md'), 'utf8'), hist = readFileSync(path.join(root, 'docs/artifact-history.md'), 'utf8');
const rows = ho.split('\n').filter(l => /^\| .* \| https:\/\/claude\.ai\/artifact\//.test(l)).map(l => l.split('|').map(s => s.trim()));
let bad = 0;
for (const r of rows) {
  const url = r[2], id = url.split('/').pop();
  const line = hist.split('\n').find(l => l.includes(id));
  const commit = line ? (line.match(/현행 v\d+\([^)]*?([0-9a-f]{7})/) || line.match(/v\d+\(\d{4}-\d\d-\d\d, ([0-9a-f]{7})/) || [])[1] : null;
  const ok = !!line && !!commit;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'GAP  '} ${r[1].replace(/\*/g, '')} (${r[3]}, handoff's last commit "${r[5]}") — in artifact-history.md: ${line ? 'yes' : 'NO'}${line ? `, current version's commit: ${commit || 'none named'}` : ''}`);
}
console.log(`handoff §3: "${(ho.match(/게시 이력 전체는 [^.]+\./) || [''])[0]}"`);
console.log(bad ? `REPRO: yes ${bad} of ${rows.length} published artifacts have no row or no commit in docs/artifact-history.md` : 'REPRO: no');

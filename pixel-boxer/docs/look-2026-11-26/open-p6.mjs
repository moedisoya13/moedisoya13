// open-p6 (evidence): one tap of "이 묶음의 남은 것을 모두 ★로" picks a whole group; there is no undo, so taking a mis-tap
// back costs one tap per card, each found by scrolling. The page already logs which ids the press added (log k: 'stars').
// Usage: node open-p6.mjs <pixel-boxer root>
import path from 'node:path';
import { readFileSync } from 'node:fs';
const root = path.resolve(process.argv[2] || '.');
const { GROUPS, starRest } = await import(path.join(root, 'src/open.data.mjs'));
const src = readFileSync(path.join(root, 'src/open.mjs'), 'utf8');
const per = GROUPS.map((g) => [g.id, Object.keys(starRest(g.id, {})).length]).filter((x) => x[1]);
for (const [g, n] of per) console.log(`one press in ${g}: ${n} answers picked`);
const undo = /undo|되돌|취소/.test(src), confirm = /confirm\(/.test(src), logs = /k: 'stars', v: `\$\{s\.dataset\.stars\}: \$\{added\.join/.test(src);
console.log(`an undo in src/open.mjs: ${undo}; a confirm before the press: ${confirm}; the press logs the ids it added: ${logs}`);
const max = Math.max(...per.map((x) => x[1]));
console.log(`EVIDENCE: one tap picks up to ${max} answers (${per.map((x) => x.join(' ')).join(', ')}); undo ${undo}, confirm ${confirm}; the ids are already in the log`);

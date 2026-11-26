// catalog-4: the "조치" line under the user's twelve waiting notes (R 5, S 2, Q 5: src/memo.actions.mjs) still says the stage
// starts "after M·N·U·V are merged" — all four are merged, and the stage order since then puts N2 and P (and Q before R)
// first (docs/handoff.md §4); the note threads show this text on every one of those rows.
//   node catalog-4.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2]);
const { ACTIONS } = await import(pathToFileURL(path.join(root, 'src/memo.actions.mjs')).href);
const hand = readFileSync(path.join(root, 'docs/handoff.md'), 'utf8');
const merged = hand.slice(hand.indexOf('**끝나서 합친 단계**'), hand.indexOf('**남은 구현 단계**'));
const left = hand.slice(hand.indexOf('**남은 구현 단계**'), hand.indexOf('## 5.'));
const order = [...left.matchAll(/^\d+\. ([^\n]+)/gm)].map(m => m[1].slice(0, 28));
const done = { M: /\bM 자기 팔 점검/.test(merged), N: /\bN 주먹의 허리/.test(merged), U: /\bU 과시형 암/.test(merged), V: /\bV 맞기와 다운/.test(merged) };
console.log('docs/handoff.md §4, merged:', JSON.stringify(done));
console.log('docs/handoff.md §4, the stages left, in order:\n  ' + order.join('\n  '));
let stale = 0;
const seen = {};
for (const [row, a] of Object.entries(ACTIONS)) {
  if (a.state !== 'wait') continue;
  const says = /M·N·U·V를 합친 뒤/.test(a.text);
  if (says) stale++;
  (seen[a.stage] ||= []).push(row);
  if (!seen['_' + a.stage]) (seen['_' + a.stage] = 1), console.log(`stage ${a.stage} (${a.state}) text: "${a.text}"`);
}
console.log('rows waiting:', Object.entries(seen).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' | '));
const allDone = Object.values(done).every(Boolean);
console.log(stale && allDone ? `REPRO: yes ${stale} of the user's notes show "M·N·U·V를 합친 뒤 시작" though M, N, U and V are all merged and N2 · P come next (handoff §4)` : 'REPRO: no');

// Eye 10, finding 10-4: motion-catalogue text that describes an older motion than the one the cards play.
//   (a) the collar-and-uppercut row (src/catalog.mjs TRICK_NOTE.collar) vs anim/show.mjs COLLAR, the numbers the motion uses
//   (b) the page's lede (catalog.html) still calls this edition "6차 기획 J·K", while what it shows open is V/Y/N/U
//   (c) known (open card fix-taunt-text): the beckon and windmill row notes vs anim/moves.mjs
//   node 10-4.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const cat = readFileSync(path.join(root, 'src/catalog.mjs'), 'utf8');
const { COLLAR } = await import(root + '/src/anim/show.mjs');
const { MOVES } = await import(root + '/src/anim/moves.mjs');
let bad = 0;

// (a)
const collarNote = cat.match(/^\s+collar: '([^']+)'/m)[1];
const said = collarNote.match(/닿고 ([\d.]+)초\(5암 ([\d.]+)초\) 뒤 놓습니다/);
console.log('row note (collar):', collarNote);
console.log(`text: lets go ${said[1]} s (5암 ${said[2]} s) after it lands; code COLLAR.let = [${COLLAR.let}] s [4암, 5암] after the uppercut lands (+0.1 s ease, anim/animator.mjs), pull over ${COLLAR.time} s, uppercut waits ${COLLAR.wait} s, man pulling braces ${COLLAR.brace}°`);
let first = '';
try {
  const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const c = execFileSync('git', ['-C', root, 'log', '--format=%h', '--reverse', '-S', 'export const COLLAR', '--', 'src/anim/show.mjs'], { encoding: 'utf8' }).trim().split('\n')[0];
  first = execFileSync('git', ['-C', root, 'show', `${c}:${path.relative(top, root)}/src/anim/show.mjs`], { encoding: 'utf8' }).match(/export const COLLAR = .*/)[0];
  console.log(`when COLLAR was written (${c}): ${first}`);
} catch {}
if (+said[1] !== COLLAR.let[0] || +said[2] !== COLLAR.let[1]) bad++;
const mark = cat.match(/당기는 목에 몸을 뒤로 버티고[^']*/);
console.log('the same row\'s U mark says:', mark ? mark[0].slice(0, 90) : '(none)', '| row note mentions bracing:', /버티/.test(collarNote));

// (b)
const html = readFileSync(path.join(root, 'catalog.html'), 'utf8');
const lede = html.match(/이번 판\(([^)]+)\)에서는/);
const reviewed = cat.match(/const REVIEWED = \[([^\]]+)\]/)[1];
const stages = [...new Set([...cat.matchAll(/stage: '([^']+)'/g)].map(m => m[1]))];
console.log(`lede: "이번 판(${lede && lede[1]})에서는 …"; REVIEWED (folded away) = ${reviewed}; stages with marks = ${stages.join(', ')}`);
if (lede && /J·K/.test(lede[1])) bad++;

// (c) known
const beckonNote = cat.match(/^\s+beckon: '([^']+)'/m)[1].slice(0, 30);
const beckons = MOVES.beckon.keys.filter(k => k.lz === 0.3).length;
const windNote = cat.match(/^\s+wind: '([^']+)'/m)[1].slice(0, 40);
const c = MOVES.wind.circles;
console.log(`known fix-taunt-text: beckon note "${beckonNote}…" vs ${beckons} beckons in MOVES.beckon; wind note "${windNote}…" vs rear ${c.R.turns} turns and lead ${c.L.turns} turns`);

console.log(bad ? `REPRO: yes ${bad} catalogue texts describe an older motion (collar lets go ${said[1]}/${said[2]} s in the text, ${COLLAR.let.join('/')} s in the code; lede "${lede && lede[1]}")` : 'REPRO: no');

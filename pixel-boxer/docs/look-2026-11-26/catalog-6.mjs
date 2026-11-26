// catalog-6: README's paragraph on the catalogue's "새 · 바뀜" marks still describes the first marking (against 7302f18, "바뀐
// 줄은 일곱", and that footwork, the punch ladder, the show-off rows … are "프레임과 충격량까지 같습니다"), while the marks
// the page carries (src/catalog.mjs SINCE) are measured against 14594d1 (v22) and stage by stage since, on 85 rows.
//   node catalog-6.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const readme = readFileSync(path.join(root, 'README.md'), 'utf8'), cat = readFileSync(path.join(root, 'src/catalog.mjs'), 'utf8');
const base = (readme.match(/지난 게시본\(`(\w+)`\)의 체크아웃과 지금에서/) || [])[1], seven = (readme.match(/이번 비교에서 바뀐 줄은 (\S+)입니다/) || [])[1];
const same = (readme.match(/풋워크, 주먹 사다리, 과시형 암의 기술과 도발, 진입 · 이탈, 그 밖의 맞기와 다운 카드는 사건이 프레임과 충격량까지 같습니다/) || [''])[0];
const codeBase = (cat.match(/last published as the user reviewed it \(version (\d+), commit (\w+)\)/) || []).slice(1);
const start = cat.indexOf('const SINCE = {'), end = cat.indexOf('\n};', start), since = cat.slice(start, end);
const rows = new Set([...since.matchAll(/^  '?([\w-]+)'?: [[{]/gm)].map(m => m[1]));
const marked = ['stomp', 'onetwo', 'hook', 'cross', 'beckon', 'wind', 'tapChin', 'collar'].filter(r => rows.has(r));
console.log(`README: marks measured against ${base}, "바뀐 줄은 ${seven}", and "${same.slice(0, 60)}…"`);
console.log(`src/catalog.mjs: SINCE measured against v${codeBase[0]} ${codeBase[1]}; rows with a mark: ${rows.size}; of the rows README calls unchanged, marked now: ${marked.join(', ')}`);
console.log(base && base !== codeBase[1] ? `REPRO: yes README describes the marking against ${base} (7 rows); the page's marks are against ${codeBase[1]} on ${rows.size} rows` : 'REPRO: no');

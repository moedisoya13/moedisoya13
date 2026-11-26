// catalog-3: the catalogue's footer still describes the knockdown replay of stage 2.4B, not the one the cards play
// (stage 2.4D, src/replay.mjs FALL; README "보여 주는 순서"), and names the tag the down cards no longer show.
//   node catalog-3.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2]);
const html = readFileSync(path.join(root, 'catalog.html'), 'utf8'), cat = readFileSync(path.join(root, 'src/catalog.mjs'), 'utf8');
const { FALL } = await import(pathToFileURL(path.join(root, 'src/replay.mjs')).href);
const foot = html.slice(html.indexOf('<footer>'), html.indexOf('</footer>'));
const said = foot.match(/몸이 닿고 ([\d.]+)초 뒤에는 그 장면을 타격 ([\d.]+)초 전부터 닿은 뒤 ([\d.]+)초까지 1\/4 속도로, 맞은 선수의 머리와 골반 사이를 가운데로 ([\d.]+)배 당겨/);
const tag = /다운 카드의 "리플레이 ¼"는 위의 다운 리플레이/.test(foot);
const code = cat.match(/replayTag\.textContent = cell\.replay\.kind === 'fall' \? '([^']+)' : '([^']+)'/);
let bad = 0;
if (said) {
  console.log(`footer: the replay starts ${said[1]} s after he comes down; shows from ${said[2]} s before the blow to ${said[3]} s after he comes down; at 1/4; ${said[4]}× closer on his head and hips`);
  console.log(`code (src/replay.mjs FALL): starts once the effects are out + ${FALL.beat} s and he is still (≥ ${FALL.still.for} s under ${FALL.still.speed} m/s), at most ${FALL.most} s after the blow; shows from the press of the punch (at most ${FALL.windup} s before the blow) to ${FALL.end} s after the blow (ending before he comes down); pace ${FALL.pace.windup} → ${FALL.pace.blow}; camera from above or the side, ${FALL.view.closer}× closer than live, pushed in ${FALL.view.push * 100}%`);
  console.log(`(src/catalog.mjs DOWN_NOTE, the same page's marks, says it right: "${(cat.match(/쓰러짐은 제 속도로 끝까지[^']*/) || [''])[0]}")`);
  if (+said[1] !== FALL.beat) bad++;
  if (+said[3] && FALL.end) bad++;
  if (+said[4] !== FALL.view.closer) bad++;
}
console.log(`footer names the down cards' tag "리플레이 ¼": ${tag}; the cards write "${code && code[1]}" for a knockdown's replay and "${code && code[2]}" for a brilliant defence's`);
if (tag && code && code[1] !== '리플레이 ¼') bad++;
console.log(bad ? `REPRO: yes the footer's knockdown-replay paragraph is the old 2.4B one (${bad} statements differ from src/replay.mjs FALL and the tag the cards show)` : 'REPRO: no');

// open-3: three cards ask where the screen integration / final integration goes, and the ★ answers the page itself
// recommends (one press of "남은 것을 모두 ★로" per group) say two different things; stage-order also still offers
// "점검 먼저" (decide after the audit) although the audit's 38 results are the page's first group, and its order has no
// fix round that the audit cards' ★ (fix: "다음 수정 라운드에서") and a-screen-ai's ★ (soon: "수정 라운드 뒤 바로") assume.
// Usage: node open-3.mjs <pixel-boxer root>
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const { CARDS, GROUPS, starRest, answersText } = await import(path.join(root, 'src/open.data.mjs'));
let star = {}; for (const g of GROUPS) star = starRest(g.id, star);
const card = (id) => CARDS.find((c) => c.id === id), opt = (id, v) => card(id).opts.find((o) => o[0] === v);
for (const id of ['stage-order', 'a-screen-ai', 'impl-final-integration']) {
  const c = card(id), o = opt(id, star[id]);
  console.log(`${id} [${c.group}] ★ picked by the stars button: ${star[id]} = "${o[1]}" — ${o[2] || ''}`);
}
const so = card('stage-order');
console.log(`stage-order list: ${so.list.join(' → ')}`);
console.log(`stage-order option audit-first: "${opt('stage-order', 'audit-first').slice(1).join(' — ')}"; audit cards on the page: ${CARDS.filter((c) => c.group === 'audit' && c.kind !== 'note').length}`);
const fixRound = so.list.some((x) => /수정|점검|audit/.test(x));
const auditFix = CARDS.filter((c) => c.group === 'audit' && star[c.id] === 'fix').length;
console.log(`audit cards whose ★ is fix ("다음 수정 라운드에서"): ${auditFix}; a fix round in stage-order's list: ${fixRound}`);
const zLast = so.list[so.list.length - 1];
const text = answersText(star, {});
const lines = text.split('\n').filter((l) => /stage-order|a-screen-ai|impl-final-integration/.test(l));
console.log('the answers text 제출 would send:\n  ' + lines.join('\n  '));
const contradict = star['stage-order'] === 'asis' && star['a-screen-ai'] === 'soon' && /Z/.test(zLast);
console.log(contradict ? `REPRO: yes the ★ set sends stage-order "${opt('stage-order', 'asis')[1]}" (screen in "${zLast}", last of ${so.list.length}) and a-screen-ai "${opt('a-screen-ai', 'soon')[1]}" together, plus impl-final-integration "${opt('impl-final-integration', star['impl-final-integration'])[1]}"; stage-order's list has no fix round for ${auditFix} ★fix cards` : 'REPRO: no');

// open-5: two disposal cards recommend ★ 보류 "until X", while the card's own text and the page's own "정해진 것" list say
// X happened (the effect version was decided 11-22, effects attached to the game and catalogue 11-22).
// Usage: node open-5.mjs <pixel-boxer root>
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const { CARDS, DECIDED_LIST } = await import(path.join(root, 'src/open.data.mjs'));
const card = (id) => CARDS.find((c) => c.id === id), dec = (id) => DECIDED_LIST.find((d) => d.id === id);
let n = 0;
for (const [id, cond, decidedId] of [['cleanup-fx-versions', /정해진 뒤/, 'fx-version'], ['cleanup-fxlab-now', /본편에 붙인 뒤/, 'impl-fx-attach']]) {
  const c = card(id), d = dec(decidedId);
  const hit = c.star === 'hold' && cond.test(c.why) && !!d;
  if (hit) n++;
  console.log(`${id}: ★ ${c.star}, why "${c.why}"\n   card text: "${c.state}"\n   정해진 것 on the same page: ${decidedId} "${d && d.title}" → "${d && d.said}" (${d && d.at})`);
}
console.log(n ? `REPRO: yes ${n} of 2 disposal cards give ★ 보류 for a condition the page itself lists as decided on 11-22 (fx-version, impl-fx-attach)` : 'REPRO: no');

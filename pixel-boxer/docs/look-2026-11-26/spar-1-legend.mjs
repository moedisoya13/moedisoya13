// spar-1 (legend part): the show-off's taunts ('show' blocks: 손짓 · 턱 내밀기 · 풍차) are drawn on the technique lanes in their own colour
// (src/spar.mjs:89 KIND.show #e8e2cf, an off-white close to the white outline of the block being done now), but the legend
// over the lanes (spar.html #legend) names only 공격 · 회피 · 방어 · 피격 · 거리 · 축. Counts the taunt blocks of a round.
// Usage: node spar-4.mjs <pixel-boxer root> [seed]
import { readFileSync } from 'node:fs';
const root = process.argv[2], seed = +(process.argv[3] || 13);
const html = readFileSync(root + '/spar.html', 'utf8'), js = readFileSync(root + '/src/spar.mjs', 'utf8');
const legend = (/<div id="legend">([\s\S]*?)<\/div>/.exec(html) || [])[1] || '';
const named = [...legend.matchAll(/class="k (\w)">([^<]+)</g)].map(m => m[2]);
const kinds = Object.keys(eval('(' + /const KIND = (\{[^}]+\})/.exec(js)[1] + ')'));
console.log('legend names:', named.join(' · '), '| colours the lanes use:', kinds.join(', '));
const { planOf } = await import(root + '/src/spar/plan.mjs');
const { LEVEL } = await import(root + '/src/anim/skill.mjs');
const plan = planOf(seed), shows = plan.rails.flat().filter(b => b.kind === 'show' && b.from < plan.ko.step);
console.log(`#${seed} ${plan.men.map(m => LEVEL[m.grade].label).join('/')}: taunt blocks ${shows.length} (${[...new Set(shows.map(b => b.name))].join(', ')}), ${(shows.reduce((s, b) => s + b.to - b.from, 0) / 60).toFixed(1)} s of lane`);
const missing = !named.some(n => /도발|과시/.test(n)) && kinds.includes('show');
console.log(`REPRO: ${missing && shows.length ? 'yes' : 'no'} ${shows.length} taunt blocks in #${seed} drawn in a colour the legend does not name (legend: ${named.length} kinds, lanes: ${kinds.length - 1} colours with show)`);

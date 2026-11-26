// catalog-1: rows marked "바뀜 (V)" whose note says "맞은 사람이 휘청여 팔이 느리게 늘어지고 무릎이 꺾임" but in whose cards nobody is
// rocked at all (no blow reaches the animator's stagger: anim/animator.mjs strike, `more > 0.02`), and whose own mark says the
// most any joint moved was under a centimetre. Steps every card of every V-marked row the way the page does (src/catalog.mjs
// tick: freshBout, drive, step, the other man's hp held at 1000), wrapping each man's animator.strike to see the stun it gets.
//   node catalog-1.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2]);
const src = f => import(pathToFileURL(path.join(root, 'src', f)).href);
const [foot, defense, ladder, body, combos, { step }] = await Promise.all(['footwork.mjs', 'defense.mjs', 'ladder.mjs', 'bodyshots.mjs', 'combos.mjs', 'game/bout.mjs'].map(src));
const all = [foot.ENTRIES, ...['DEFENSE', 'PARRY_DOWN', 'CROSS_ARM', 'CROSS_BODY', 'ROLLING', 'PULL_COUNTER', 'BLOCK_FIRE', 'SHELL'].map(k => defense[k]),
  ...['STANCES', 'LADDER', 'DIRTY', 'FOOTWORK', 'ENTRY', 'SHOWOFF', 'TAUNTING', 'BODY_LADDER', 'REAR_LADDER', 'WAVING', 'SHIFTING', 'WALKING'].map(k => ladder[k]),
  body.BODYSHOTS, body.LIVER_BLOCK, combos.COMBINATIONS, defense.CROSS_COUNTER, [defense.OUT_COUNTER]].filter(Boolean).flat();
const byId = Object.fromEntries(all.map(e => [e.id, e]));
// the fresh-bout rows of the page (src/catalog.mjs byId: LIVER_BLOCK, CROSS_BODY, BLOCK_FIRE, SHELL get fresh: true)
for (const k of ['LIVER_BLOCK']) for (const e of body[k]) byId[e.id] = Object.assign({}, e, { fresh: true });
for (const k of ['CROSS_BODY', 'BLOCK_FIRE', 'SHELL']) for (const e of defense[k]) byId[e.id] = Object.assign({}, e, { fresh: true });

// the V marks of SINCE, read out of src/catalog.mjs (row id, the cards it lists, the cm it says)
const lines = readFileSync(path.join(root, 'src/catalog.mjs'), 'utf8').split('\n');
const start = lines.findIndex(l => l.startsWith('const SINCE = {')), end = lines.findIndex((l, i) => i > start && l.startsWith('};'));
let key = null; const marks = [];
for (const l of lines.slice(start + 1, end)) {
  const k = l.match(/^  '?([\w-]+)'?: [[{]/);
  if (k) key = k[1];
  const m = l.match(/stage: 'V'.*?(?:cards: \[([^\]]*)\])?, note: '([^']*)'/);
  if (m && /휘청/.test(m[2])) marks.push({ row: key, cards: m[1] ? m[1].split(',').map(s => s.trim().replace(/'/g, '')) : null, cm: +(m[2].match(/관절 최대 ([\d.]+) cm/) || [])[1], note: m[2] });
}
const DT = 1 / 60;
function run(e) {
  const bout = foot.freshBout(e), ex = e.punch !== undefined || !!e.fresh, n = Math.round((ex ? e.loop : 2 * e.loop) / DT);
  const got = [];
  bout.fighters.forEach((f, i) => {
    const s = f.animator.strike.bind(f.animator);
    f.animator.strike = h => { if (h.stun !== undefined) got.push({ on: i, J: h.J, stun: h.stun, more: Math.min(1, Math.max(0, (h.stun - 0.38) / 0.36)) + Math.min(1, Math.max(0, (45 - (h.hp ?? 100)) / 45)) * 0.35 }); return s(h); };
  });
  for (let t = 0; t < n; t++) { step(bout, foot.drive(e, bout, t * DT, DT), DT); bout.fighters[1].hp = 1000; if (!e.hurt) bout.fighters[0].hp = 1000; }
  return got;
}
let none = 0, small = 0, smallNone = 0;
const rows = [];
for (const mk of marks) {
  const ids = mk.cards ? mk.cards.map(c => `${mk.row}@${c}`) : [mk.row];
  const per = ids.map(id => { const e = byId[id]; if (!e) return { id, missing: true }; const g = run(e); return { id, rocked: g.some(x => x.more > 0.02), maxJ: Math.max(0, ...g.map(x => x.J)), hits: g.length }; });
  const rocked = per.filter(p => p.rocked).length;
  rows.push({ row: mk.row, cm: mk.cm, cards: per.length, rocked, maxJ: Math.max(...per.map(p => p.maxJ || 0)).toFixed(0), missing: per.filter(p => p.missing).length });
  if (!rocked) none++;
  if (mk.cm < 1) { small++; if (!rocked) smallNone++; }
}
rows.sort((a, b) => a.cm - b.cm);
for (const r of rows) console.log(`${r.row.padEnd(16)} mark says max ${String(r.cm).padStart(5)} cm  cards listed ${r.cards}  cards where someone is rocked ${r.rocked}  hardest blow ${r.maxJ} N·s${r.missing ? '  (missing ' + r.missing + ')' : ''}`);
console.log(`V marks with the stagger note: ${marks.length}; under 1 cm by their own number: ${small}; of those, no card where anyone is rocked: ${smallNone}; all V marks with nobody rocked: ${none}`);
console.log(none ? `REPRO: yes ${none} of ${marks.length} rows marked 바뀜 (V) "맞은 사람이 휘청여 …" have nobody rocked in any listed card (${smallNone} of the ${small} whose own mark says under 1 cm)` : 'REPRO: no');

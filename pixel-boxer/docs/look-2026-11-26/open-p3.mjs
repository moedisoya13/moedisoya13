// open-p3 (evidence): how big the answers text is (what 제출 and 답 복사 carry) as the page writes it, and as a compact form
// that writes each group's ★-agreeing answers on one line and spells out only what differs from ★, memos and follow-ups.
// Usage: node open-p3.mjs <pixel-boxer root>
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const { GROUPS, CARDS, QUESTIONS, starRest, answersText, live, question } = await import(path.join(root, 'src/open.data.mjs'));
const bytes = (s) => new TextEncoder().encode(s).length;
const groupOf = (q) => CARDS.find((c) => c.id === q.card).group;
// the proposed compact text: per group, "★대로: id id id", then one line per answer that is not its ★, a follow-up or a memo
function compact(picks, notes) {
  const out = [];
  for (const g of GROUPS) {
    const qs = QUESTIONS.filter((q) => groupOf(q) === g.id && live(q.id, picks) && (picks[q.id] || notes[q.id]));
    if (!qs.length) continue;
    out.push(`## ${g.title}`);
    const asStar = qs.filter((q) => !q.parent && q.star && picks[q.id] === q.star && !notes[q.id]);
    if (asStar.length) out.push(`★대로(${asStar.length}): ${asStar.map((q) => q.id).join(' ')}`);
    for (const q of qs.filter((x) => !asStar.includes(x))) {
      const o = picks[q.id] ? String(picks[q.id]).split(',').map((v) => `${v}(${(q.opts.find((p) => p[0] === v) || [, v])[1]})`).join(',') : '';
      out.push(`${q.parent ? '  - ' : '- '}${q.id}: ${o}${notes[q.id] ? `${o ? ' · ' : ''}메모: ${String(notes[q.id]).replace(/\s*\n\s*/g, ' / ')}` : ''}`);
    }
  }
  return out.join('\n');
}
let star = {};
for (const g of GROUPS) star = starRest(g.id, star);
// a realistic finish: every ★, the ten cards with no ★ answered by hand (first option; a sound card "fix" with its how),
// six ★ changed, five memos of 80 characters and a free memo of 300
const real = { ...star };
for (const q of QUESTIONS) if (!q.parent && q.opts.length && !real[q.id]) real[q.id] = q.opts[0][0];
for (const id of ['sound-hit', 'sound-breath']) (real[id] = 'fix'), (real[`${id}.how`] = 'louder,shorter');
for (const id of ['ring-lean', 'pit-near-wall', 'a-idle', 'loadout-default', 'del-session', 'cleanup-fx-versions']) real[id] = question(id).opts.find((o) => o[0] !== question(id).star)[0];
const memo = '가'.repeat(80), notes = { 'arm-way': memo, 'spar-tempo': memo, 'a-dark-line': memo, 'sound-hit': memo, 'stage-order': memo, free: '나'.repeat(300) };
for (const [name, p, n] of [['all ★ only', star, {}], ['realistic finish', real, notes]]) {
  const now = answersText(p, n), c = compact(p, n);
  console.log(`${name}: page's text ${bytes(now)} B (${now.split('\n').length} lines); compact ${bytes(c)} B (${c.split('\n').length} lines); the comment route keeps 3900 B including ~230 B of header and footer`);
}
console.log('compact sample:\n' + compact(real, notes).split('\n').slice(0, 9).join('\n'));
const r = compact(real, notes);
console.log(`EVIDENCE: realistic finish ${bytes(answersText(real, notes))} B as written now vs ${bytes(r)} B compact (limit 3900); all ★ ${bytes(answersText(star, {}))} B vs ${bytes(compact(star, {}))} B`);

// open-1: what 제출 sends to the watching session (the comment route) when the user has answered the cards.
// Uses the page's own answersText (src/open.data.mjs) and a copy of the page's fit() and comment wrapper (src/open.mjs:367-375, :457).
// Usage: node open-1.mjs <pixel-boxer root>
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const D = await import(path.join(root, 'src/open.data.mjs'));
const { GROUPS, QUESTIONS, CARDS, starRest, answersText, counts, STORE, SEND } = D;
const en = new TextEncoder(), bytes = (s) => en.encode(s).length;
// --- copied from src/open.mjs (DOCNOTE, fit, the comment text of viaHere)
const DOCNOTE = `db ${STORE.doc}`;
const fit = (t, n) => { const tail = `\n… (전체는 ${DOCNOTE})`; if (bytes(t) <= n) return t; let k = t.length; while (k > 0 && bytes(t.slice(0, k) + tail) > n) k -= 20; return t.slice(0, Math.max(0, k)) + tail; };
const comment = (text, at) => fit(`[${SEND.title} · 미결 카탈로그 — 답 제출 · ${at}]\n${text}\n\n(같은 답이 이 페이지의 ${DOCNOTE}에 있습니다. docs/handoff.md를 따라 이 답으로 이어 가 주세요. 답은 한국어로.)`, 3900);
const at = '2026-11-25T23:00:00.000Z';
function report(name, picks, notes) {
  const text = answersText(picks, notes), sent = comment(text, at), n = counts(picks, notes);
  const ids = QUESTIONS.filter((q) => picks[q.id] || notes[q.id]).map((q) => q.id).filter((id) => text.includes(`${id}:`));
  const lost = ids.filter((id) => !new RegExp(`(^|\\n)\\s*- ${id.replace(/\./g, '\\.')}: `).test(sent.replace(/\n… \(전체는[^)]*\)$/, '')) || sent.lastIndexOf(`${id}:`) > sent.length - 40);
  const g = (id) => CARDS.find((c) => c.id === QUESTIONS.find((q) => q.id === id).card).group;
  const byGroup = {}; for (const id of lost) byGroup[g(id)] = (byGroup[g(id)] || 0) + 1;
  console.log(`\n[${name}] picked ${n.picked}/${n.of}, follow ${n.follow}, memos ${n.memos}`);
  console.log(`  answers text ${bytes(text)} B; comment before fit ${bytes(text) + 200} B approx; sent ${bytes(sent)} B (limit used 3900)`);
  console.log(`  answers missing from the comment: ${lost.length} of ${ids.length}; by group ${JSON.stringify(byGroup)}`);
  console.log(`  instruction line "docs/handoff.md를 따라" kept: ${sent.includes('docs/handoff.md를 따라')}`);
  console.log(`  last 2 lines sent: ${JSON.stringify(sent.split('\n').slice(-2))}`);
  return { lost, sent };
}
// (1) the user presses every group's "남은 것을 모두 ★로" and nothing else
let star = {}; for (const g of GROUPS) star = starRest(g.id, star);
const r1 = report('all ★ (one press per group)', star, {});
// (2) the same plus a free memo of 300 Korean characters (the "그 밖에 하실 말씀" card)
const r2 = report('all ★ + a free memo', star, { free: '1. 링 화면에서 '.repeat(30) });
// (3) the smallest answer set that is cut: answer the audit group, the now group and the plan group with ★ only
let part = {}; for (const g of ['audit', 'now', 'plan']) part = starRest(g, part);
report('★ for groups 1-3 only', part, {});
const freeLost = r2.lost.includes('free'), disposeLost = r1.lost.filter((id) => /^(del-|cleanup-)/.test(id)).length;
console.log(`\nREPRO: ${r1.lost.length ? 'yes' : 'no'} the 제출 comment cuts ${r1.lost.length} of ${counts(star, {}).picked} ★ answers (all ${disposeLost} disposal answers${freeLost ? ' and the free memo' : ''}) and drops its own handoff instruction; sent ${bytes(r1.sent)} B of answers text ${bytes(answersText(star, {}))} B`);

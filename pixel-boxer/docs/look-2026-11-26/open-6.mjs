// open-6: del-session asks to archive "이 작업 세션(대화)", but the page is now answered while another session watches it
// (the handoff took over: docs/handoff.md names the old session's id for del-session); the card names no session, and the
// page's own "정해진 것" shows "이전 세션과 그 대화 — 승인" (cleanup-old-session), a different session in the same words.
// Usage: node open-6.mjs <pixel-boxer root>
import path from 'node:path';
import { readFileSync } from 'node:fs';
const root = path.resolve(process.argv[2] || '.');
const { CARDS, DECIDED_LIST } = await import(path.join(root, 'src/open.data.mjs'));
const c = CARDS.find((x) => x.id === 'del-session'), d = DECIDED_LIST.find((x) => x.id === 'cleanup-old-session');
const ho = readFileSync(path.join(root, 'docs/handoff.md'), 'utf8').split('\n').find((l) => l.includes('`del-session`'));
const ids = (s) => s.match(/session_[A-Za-z0-9]+/g) || [];
console.log(`card title: "${c.title}"\ncard text: "${c.state}"\nsession ids on the card: ${ids(c.title + c.state).length}`);
console.log(`docs/handoff.md: ${ho.trim()}`);
console.log(`정해진 것: ${d.id} "${d.title}" → ${d.said} (${d.at}, ${d.how})`);
const takeover = /takes over|이어받/.test(readFileSync(path.join(root, 'docs/handoff.md'), 'utf8'));
console.log(`REPRO: ${!ids(c.state).length && ids(ho).length ? 'yes' : 'no'} del-session says "이 작업 세션" with ${ids(c.state).length} session id, the handoff means ${ids(ho)[0]} (the session before the one now watching the page); the same page lists "이전 세션과 그 대화 — 승인" for another session`);

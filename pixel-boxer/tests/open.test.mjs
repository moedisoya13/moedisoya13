// The open-questions catalogue (open.html, src/open.mjs, src/open.data.mjs; docs/open-catalog.md): its data is well formed
// (ids unique, every follow-up opened by an answer its parent has, every comparison it names recorded or registered, ★ one of
// the options), every old item still open is carried and none decided is; the answers' text (what 제출 sends and 답 복사
// copies) holds every pick and every memo of an open question; nothing counts as picked until it is picked, and the stars
// button picks only when pressed; and the page is made as an artifact with every file it loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GROUPS, CARDS, QUESTIONS, DECIDED_LIST, STORE, SEND, MODELS, question, live, counts, starRest, answersText } from '../src/open.data.mjs';
import { GROUPS as CLIPS } from '../src/open.clips.mjs';
import { ITEMS } from '../src/pending.data.mjs';
import { CLIPS as OLD_CLIPS } from '../src/clips.data.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ids are unique and every card is in a group', () => {
  const ids = [...CARDS.map((c) => c.id), ...QUESTIONS.filter((q) => q.parent).map((q) => q.id)];
  assert.equal(new Set(ids).size, ids.length, 'a duplicate id');
  const groups = new Set(GROUPS.map((g) => g.id));
  for (const c of CARDS) assert.ok(groups.has(c.group), `${c.id}: group ${c.group}`);
  for (const g of GROUPS) assert.ok(CARDS.some((c) => c.group === g.id), `${g.id} is empty`);
  for (const q of QUESTIONS) {
    assert.match(q.id, /^[a-z0-9][a-z0-9.-]*$/, `${q.id}: an id fit to save under`);
    assert.ok(q.opts.length || q.memo, `${q.id}: neither choices nor a memo`);
    const vs = q.opts.map((o) => o[0]);
    assert.equal(new Set(vs).size, vs.length, `${q.id}: a duplicate option`);
    for (const o of q.opts) assert.ok(o[0] && o[1], `${q.id}: an option without a value or a label`);
  }
});

test('★ names an option, and a card with no ★ says why', () => {
  for (const q of QUESTIONS) if (q.star) assert.ok(q.opts.some((o) => o[0] === q.star), `${q.id}: ★ ${q.star} is not an option`);
  const tempo = CARDS.find((c) => c.id === 'spar-tempo');
  assert.equal(tempo.star, '', 'spar-tempo has no ★ until the clips are measured');
  assert.match(tempo.why, /★ 없음/);
});

test('every follow-up is reachable: opened by values its parent has, and opened only by them', () => {
  for (const q of QUESTIONS.filter((x) => x.parent)) {
    const parent = question(q.parent);
    assert.ok(parent, `${q.id}: no parent`);
    for (const v of q.when) assert.ok(parent.opts.some((o) => o[0] === v), `${q.id}: opened by ${v}, which ${parent.id} has not`);
    assert.equal(live(q.id, {}), false, `${q.id} is open with nothing picked`);
    assert.equal(live(q.id, { [parent.id]: q.when[0] }), true, `${q.id} does not open on ${q.when[0]}`);
    const other = parent.opts.find((o) => !q.when.includes(o[0]));
    if (other) assert.equal(live(q.id, { [parent.id]: other[0] }), false, `${q.id} opens on ${other[0]}`);
  }
  // (the brief's two of arm-way, and every sound layer's “how”)
  assert.deepEqual(question('arm-way.also').when, ['B']);
  assert.deepEqual(question('arm-way.when').when, ['A']);
  for (const c of CARDS.filter((x) => /^sound-(breath|hit|block|hurt|feet|bell|crowd|mix)$/.test(x.id))) assert.deepEqual(question(`${c.id}.how`).when, ['fix']);
});

test('every comparison a card names is recorded or registered', () => {
  const oldClips = new Set(OLD_CLIPS.map((c) => c.id));
  for (const c of CARDS) {
    if (c.clips) assert.ok(CLIPS[c.clips], `${c.id}: no group ${c.clips} in src/open.clips.mjs`);
    if (c.old) {
      const item = ITEMS.find((i) => i.id === c.id);
      assert.ok(item && (item.groups || item.card || item.banner), `${c.id}: no old cards`);
      const cards = [...(item.groups || []).flatMap((g) => g.rows.flat()), ...(item.card ? [item.card] : [])];
      for (const k of cards) {
        if (k.clip) assert.ok(oldClips.has(k.clip), `${c.id}: clip ${k.clip} is not in src/clips.data.mjs`);
        for (const f of [k.video, k.image]) if (f) assert.ok(existsSync(path.join(root, f)), `${c.id}: ${f}`);
      }
    }
  }
  for (const [key, g] of Object.entries(CLIPS))
    for (const c of g.clips) assert.ok(c.file && c.file.startsWith('docs/ref/open/'), `${key}/${c.id}: its file`);
});

test('every old item still open is carried, and none decided is', () => {
  const carried = new Set(CARDS.map((c) => c.id)),
    decided = new Set(DECIDED_LIST.map((d) => d.id));
  for (const i of ITEMS) assert.ok(carried.has(i.id) !== decided.has(i.id), `${i.id}: carried ${carried.has(i.id)}, decided ${decided.has(i.id)}`);
  for (const id of ['cleanup-old-artifacts', 'cleanup-old-session', 'cross-arm-shape']) assert.ok(decided.has(id), id);
  for (const i of ITEMS.filter((x) => carried.has(x.id))) {
    const q = question(i.id);
    assert.deepEqual(q.opts.map((o) => o[0]), i.options.map((o) => o.id), `${i.id}: its options`);
    assert.equal(q.star, i.recommend || '', `${i.id}: its ★`);
  }
});

test('nothing counts as picked until picked; the stars button picks only when pressed', () => {
  const n = counts({}, {});
  assert.equal(n.picked, 0);
  assert.equal(n.memos, 0);
  assert.ok(n.of > 80);
  assert.equal(answersText({}, {}), '');
  const starred = starRest('plan', {});
  assert.ok(Object.keys(starred).length > 30);
  for (const [k, v] of Object.entries(starred)) assert.equal(v, question(k).star, `${k}: picked ${v}, not its ★`);
  for (const k of Object.keys(starred)) assert.equal(CARDS.find((c) => c.id === question(k).card).group, 'plan');
  // (an answer already given stays; a question with no ★ is left alone; a follow-up opened by a ★ is picked if it has one)
  const kept = starRest('now', { 'arm-way': 'A', 'ring-lean': 'now' });
  assert.equal(kept['arm-way'], 'A');
  assert.equal(kept['ring-lean'], 'now');
  assert.equal(kept['spar-tempo'], undefined);
  assert.equal(kept['arm-way.when'], undefined, 'arm-way.when has no ★');
  assert.equal(kept['audit-10'], 'ok');
});

test('the answers as text hold every pick and memo of an open question', () => {
  const picks = { 'arm-way': 'B', 'arm-way.also': 'yes', 'sound-hit': 'fix', 'sound-hit.how': 'louder,shorter', 'fx-ground-shake': 'shake', 'cleanup-fx-sweat': 'approve', 'limit-u-45': 'retry' },
    notes = { 'arm-way': '팔뚝\n둘째 줄', 'audit-10.where': '닫힌 질문의 메모', free: '자유 메모', 'wave-speed': '파도 메모' };
  const text = answersText(picks, notes, '머리');
  assert.match(text, /^머리\n/);
  for (const [k, v] of Object.entries(picks)) for (const x of v.split(',')) assert.match(text, new RegExp(`${k.replace(/\./g, '\\.')}: .*${x}`), `${k} ${x}`);
  assert.match(text, /arm-way: B \(그릴 때만 앞으로\) · 메모: 팔뚝 \/ 둘째 줄/);
  assert.match(text, /free: 메모: 자유 메모/);
  assert.match(text, /wave-speed: 메모: 파도 메모/);
  assert.doesNotMatch(text, /닫힌 질문/, 'a memo on a follow-up that is not open');
  assert.ok(text.indexOf('## 지금 정할 것') < text.indexOf('## 기획의 기본값'));
  // (a follow-up whose parent changed is no longer sent)
  assert.doesNotMatch(answersText({ 'arm-way': 'A', 'arm-way.also': 'yes' }, {}), /arm-way\.also/);
  const n = counts(picks, notes);
  assert.equal(n.picked, 5);
  assert.equal(n.follow, 2);
  assert.equal(n.memos, 3);
});

test('where the answers are kept and sent', () => {
  assert.equal(STORE.doc, 'picks/open');
  assert.equal(SEND.server, 'Claude Code Remote');
  assert.equal(SEND.tool, 'create_session');
  assert.equal(SEND.repo, 'moedisoya13/moedisoya13');
  assert.equal(SEND.branch, 'claude/vibrant-ritchie-xornhd');
  assert.equal(SEND.title, '프로 복서');
  assert.ok(MODELS.length >= 1);
});

test('the page is made as an artifact with every file it loads', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'open-')),
    out = path.join(dir, 'open.html'),
    files = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools/artifact.mjs'), 'open.html', 'src/open.mjs', out], { cwd: root, encoding: 'utf8' })),
    page = readFileSync(out, 'utf8');
  assert.match(page, /^<title>미결 카탈로그 · 프로 복서<\/title>/);
  assert.match(page, /<script type="module" src="src\/open\.mjs"><\/script>/);
  assert.doesNotMatch(page, /<html|<head>|<body/);
  for (const f of ['src/open.mjs', 'src/open.data.mjs', 'src/open.clips.mjs', 'src/pending.mjs', 'src/pending.data.mjs', 'src/replay.mjs', 'src/clips/index.mjs', 'assets/manifest.json', 'assets/boxer.splats.txt']) assert.ok(files[f], f);
  for (const g of Object.values(CLIPS)) for (const c of g.clips) for (const f of [c.file, c.poster]) if (f) assert.ok(files[f], f);
  for (const i of ITEMS.filter((x) => CARDS.some((c) => c.id === x.id && c.old)))
    for (const k of (i.groups || []).flatMap((g) => g.rows.flat())) for (const f of [k.video, k.image]) if (f) assert.ok(files[f], `${i.id}: ${f}`);
  for (const [k, v] of Object.entries(files)) assert.ok(existsSync(path.join(root, typeof v === 'string' ? v : v.from)), k);
});

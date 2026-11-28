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
import { GROUPS, CARDS, QUESTIONS, DECIDED_LIST, ANSWERS_1128, STORE, SEND, MODELS, question, live, counts, starRest, answersText } from '../src/open.data.mjs';
import { GROUPS as CLIPS } from '../src/open.clips.mjs';
import { ITEMS } from '../src/open.old.data.mjs';
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
  // (spar-tempo had no ★ until the clips were measured; answered on 11-28, it is decided as picked, not ★)
  const tempo = DECIDED_LIST.find((d) => d.id === 'spar-tempo');
  assert.ok(tempo && !CARDS.some((c) => c.id === 'spar-tempo'), 'spar-tempo is decided, not open');
  assert.match(tempo.said, /엔진 전체에서 줄임/);
  // (a new card with no ★ says why)
  const body = CARDS.find((c) => c.id === 'body-count');
  assert.equal(body.star, '');
  assert.match(body.why, /★ 없음/);
  for (const c of CARDS.filter((x) => x.group === 'round' && x.kind !== 'note')) assert.ok(c.star || /★ 없음/.test(c.why), `${c.id}: no ★ and no reason`);
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
  // (the sound layer still open asks “how”, and a fixer's values open a memo on 바꿈; arm-way, answered, took its follow-up with it)
  assert.deepEqual(question('sound-mix.how').when, ['fix']);
  for (const c of CARDS.filter((x) => /^sound-(breath|hit|block|hurt|feet|bell|crowd|mix)$/.test(x.id))) assert.deepEqual(question(`${c.id}.how`).when, ['fix']);
  assert.deepEqual(question('late-rise.how').when, ['change']);
  assert.equal(question('arm-way.also'), undefined);
  assert.match(DECIDED_LIST.find((d) => d.id === 'arm-way').said, /그릴 때만 앞으로 · .*: 예/);
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

test('every card answered on 11-28 is decided with the pick and memo as sent, and none of them is still open', () => {
  const { picks, notes } = ANSWERS_1128,
    open = new Set(QUESTIONS.map((q) => q.id)),
    decided = new Map(DECIDED_LIST.map((d) => [d.id, d]));
  // (the 제출 of 11-28: 135 picks and 10 memos, docs/answers-2026-11-28.md)
  assert.equal(Object.keys(picks).length, 135);
  assert.equal(Object.keys(notes).length, 10);
  for (const id of [...Object.keys(picks), ...Object.keys(notes)]) {
    assert.ok(!open.has(id), `${id} was answered and is still asked`);
    const top = id.split('.')[0];
    assert.ok(decided.has(top), `${top} is not in 정해진 것`);
    const d = decided.get(top);
    assert.equal(d.at, '2026-11-28');
    assert.equal(d.how, 'page');
    if (notes[id]) assert.ok(d.memo.includes(notes[id]), `${id}: its memo as written`);
  }
  // (the pick by its labels; every fix says what came of it)
  assert.match(decided.get('a-dark-line').said, /크로스암 가드에 패리를 조금/);
  assert.match(decided.get('l-spar').said, /도발이 1프레임 만에 끊김 · .*시계가 계속 감/);
  assert.match(decided.get('sound-hit').said, /^고침 · .*더 낮게 · 다른 소리로$/);
  for (const [id, v] of Object.entries(picks)) if (!id.includes('.') && v === 'fix') assert.ok(decided.get(id).done, `${id}: fixed, but what came of it is not said`);
  // (what is left to ask: the fixers' values and what was not fixed, the three not answered, the free memo under a new id)
  for (const id of ['l-sfx', 'l-open', 'sound-mix', 'free-2', 'pull-test-60', 'hitstop-count', 'late-rise', 'late-rise-test', 'attack-values', 'body-count', 'spar-shift-early', 'drag-speed']) assert.ok(open.has(id), id);
  assert.ok(!open.has('free'), 'the old free memo stays with its answer');
});

test('nothing counts as picked until picked; the stars button picks only when pressed', () => {
  const n = counts({}, {});
  assert.equal(n.picked, 0);
  assert.equal(n.memos, 0);
  assert.equal(n.of, QUESTIONS.filter((q) => !q.parent && q.opts.length).length);
  assert.ok(n.of >= 10);
  assert.equal(answersText({}, {}), '');
  const starred = starRest('round', {}),
    stars = QUESTIONS.filter((q) => !q.parent && q.star && CARDS.find((c) => c.id === q.card).group === 'round');
  assert.ok(stars.length >= 8);
  assert.equal(Object.keys(starred).length, stars.length);
  for (const [k, v] of Object.entries(starred)) assert.equal(v, question(k).star, `${k}: picked ${v}, not its ★`);
  for (const k of Object.keys(starred)) assert.equal(CARDS.find((c) => c.id === question(k).card).group, 'round');
  // (an answer already given stays; a question with no ★ is left alone; a follow-up opened by an answer is picked only if it has a ★)
  const kept = starRest('round', { 'late-rise': 'change', 'hitstop-count': 'count' });
  assert.equal(kept['late-rise'], 'change');
  assert.equal(kept['hitstop-count'], 'count');
  assert.equal(kept['body-count'], undefined);
  assert.equal(kept['late-rise.how'], undefined, 'late-rise.how has no ★');
  assert.equal(kept['drag-speed'], 'keep');
});

test('the answers as text hold every pick and memo of an open question', () => {
  const picks = { 'pull-test-60': 'rate', 'l-sfx': 'sfx-1,sfx-p1', 'sound-mix': 'fix', 'sound-mix.how': 'louder,shorter', 'hitstop-count': 'skip', 'limit-fall-5d': 'retry', 'late-rise': 'keep' },
    notes = { 'pull-test-60': '첫 줄\n둘째 줄', 'late-rise.how': '닫힌 질문의 메모', 'free-2': '자유 메모', 'drag-speed': '끌기 메모' };
  const text = answersText(picks, notes, '머리');
  assert.match(text, /^머리\n/);
  for (const [k, v] of Object.entries(picks)) for (const x of v.split(',')) assert.match(text, new RegExp(`${k.replace(/\./g, '\\.')}: .*${x}`), `${k} ${x}`);
  assert.match(text, /pull-test-60: rate \(넓은 시드의 비율 시험\) · 메모: 첫 줄 \/ 둘째 줄/);
  assert.match(text, /free-2: 메모: 자유 메모/);
  assert.match(text, /drag-speed: 메모: 끌기 메모/);
  assert.doesNotMatch(text, /닫힌 질문/, 'a memo on a follow-up that is not open');
  assert.ok(text.indexOf('## 수정 라운드에서 나온 것') < text.indexOf('## 카탈로그 점검에서 찾은 것'));
  // (a follow-up whose parent changed is no longer sent)
  assert.doesNotMatch(answersText({ 'sound-mix': 'good', 'sound-mix.how': 'louder' }, {}), /sound-mix\.how/);
  const n = counts(picks, notes);
  assert.equal(n.picked, 6);
  assert.equal(n.follow, 1);
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
  for (const f of ['src/open.mjs', 'src/open.data.mjs', 'src/open.clips.mjs', 'src/open.old.mjs', 'src/open.old.data.mjs', 'src/replay.mjs', 'src/clips/index.mjs', 'assets/manifest.json', 'assets/boxer.splats.txt']) assert.ok(files[f], f);
  for (const g of Object.values(CLIPS)) for (const c of g.clips) for (const f of [c.file, c.poster]) if (f) assert.ok(files[f], f);
  for (const i of ITEMS.filter((x) => CARDS.some((c) => c.id === x.id && c.old)))
    for (const k of (i.groups || []).flatMap((g) => g.rows.flat())) for (const f of [k.video, k.image]) if (f) assert.ok(files[f], `${i.id}: ${f}`);
  for (const [k, v] of Object.entries(files)) assert.ok(existsSync(path.join(root, typeof v === 'string' ? v : v.from)), k);
});

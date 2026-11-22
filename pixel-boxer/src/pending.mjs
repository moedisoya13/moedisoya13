/* The pending catalogue (docs/pending-catalog.md): every question still open, each with where it stands, its numbers
   against the plan, the bouts that show it, and the choice, saved as it is made. The bouts are the motion catalogue's
   (src/catalog.mjs): one canvas behind the page, each card's stage a window onto its own looped bout, the cards of a clock
   stepped together while any of them is on screen; the hit effect's cards draw the blow as the effect study does
   (src/fxlab.mjs: the spray kept outside the struck man's silhouette, the ripple through him). A variant card is the same
   engine with a value or two of the game's tables replaced while its own code runs (src/tune.mjs), so the card beside it
   runs on the defaults. What a variant card should show was measured by tools/pending.mjs (src/pending.numbers.mjs), and is
   written beside what it does show.
   The decisions: a document an item in the artifact's store (collection `decisions`, the item's id: { choice, note, at }),
   read once as the page opens and written one at a time, only when changed; where there is no store, this browser's
   localStorage (`pending:<id>`) in the same shape. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step, RULES } from './game/bout.mjs';
import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE, PARRY_DOWN, CROSS_ARM, CROSS_BODY, ROLLING, PULL_COUNTER, BLOCK_FIRE, SHELL } from './defense.mjs';
import { LADDER, DIRTY, STANCES, FOOTWORK, ENTRY, SHOWOFF, TAUNTING, BODY_LADDER, REAR_LADDER, WAVING, SHIFTING } from './ladder.mjs';
import { BODYSHOTS, LIVER_BLOCK } from './bodyshots.mjs';
import { MOVES } from './anim/moves.mjs';
import { CROSS, LEVEL } from './anim/skill.mjs';
import { TECHNIQUES } from './game/techniques.mjs';
import { withTune, patchesOf, guardAt, rearTilt } from './tune.mjs';
import { PARTS, ITEMS, VERSIONS, MIST, FX_SCENES, STASH_NOTE } from './pending.data.mjs';
import { NUMBERS } from './pending.numbers.mjs';

const DT = 1 / 60;
// the tables a card's tune may name (docs/pending-catalog.md §2.1)
const TABLES = { MOVES, CROSS, LEVEL, RULES, TECHNIQUES };
// the catalogue's scripts, as src/catalog.mjs knows them (the liver block, the cross-arm against the body, block and fire and
// the shell start each loop from a fresh bout though the boxer throws nothing)
const byId = Object.fromEntries([...ENTRIES, ...DEFENSE, ...STANCES, ...LADDER, ...DIRTY, ...FOOTWORK, ...ENTRY, ...SHOWOFF, ...TAUNTING, ...BODY_LADDER, ...REAR_LADDER, ...BODYSHOTS, ...LIVER_BLOCK.map(e => Object.assign({}, e, { fresh: true })), ...WAVING, ...PARRY_DOWN, ...CROSS_ARM, ...CROSS_BODY.map(e => Object.assign({}, e, { fresh: true })), ...ROLLING, ...PULL_COUNTER, ...[...BLOCK_FIRE, ...SHELL].map(e => Object.assign({}, e, { fresh: true })), ...SHIFTING].map(e => [e.id, e]));
// what became of the punch, and what met it, as a card says it (src/catalog.mjs)
const SAID = { whiff: '빗나감', graze: '스침', block: '막음', parry: '패리', hit: '명중' };
const MET = { glove: '글러브', forearm: '팔뚝', elbow: '팔꿈치', shoulder: '어깨' };
const HEAD = 0.115; // the head, as a ball, for the spray: metres (src/fxlab.mjs)
const N = NUMBERS || {};
const f1 = x => (x === undefined || x === null ? '–' : (+x).toFixed(1));
const f0 = x => (x === undefined || x === null ? '–' : String(Math.round(x)));
const signed = n => (n < 0 ? `−${-n}` : `${n}`);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// the data's own marks: `code` and **strong**
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/* On the page the two branches of grades 4 and 5 read L (명, clean) and D (암, dirty); the data keeps 명 and 암 (the same
   rule as src/catalog.mjs, which writes its page when imported and so cannot lend it). A Korean particle after the letter
   follows how it is said: L ends in a consonant (엘), D in a vowel (디). */
function asLD(s) {
  const after = { L: { 는: '은', 와: '과', 가: '이', 를: '을' }, D: { 은: '는', 과: '와', 이: '가', 을: '를' } },
    swap = (ld, j = '') => ld + (after[ld][j] || j);
  return s
    .replace(/([45])명(은|는|과|와|이|가|을|를)?/g, (_, n, j) => n + swap('L', j))
    .replace(/([45·])암(은|는|과|와|이|가|을|를)?/g, (_, n, j) => n + swap('D', j))
    .replace(/· 명/g, '· L')
    .replace(/· 암/g, '· D')
    .replace(/\((명|암)\)/g, (_, w) => (w === '명' ? '(L)' : '(D)'))
    .replace(/(^|[\s,(])암(은|는|과|와|의|에)/g, (_, b, j) => b + swap('D', j));
}
function shownAsLD(root) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/[명암]/.test(n.nodeValue)) n.nodeValue = asLD(n.nodeValue);
  for (const el of root.querySelectorAll('[aria-label], [title], [alt]'))
    for (const k of ['aria-label', 'title', 'alt']) if (el.hasAttribute(k)) el.setAttribute(k, asLD(el.getAttribute(k)));
}

/* ---- the page, written from the data: the contents, then each part and its items */
const main = document.getElementById('pending'),
  CLOCKS = [], // [{ card, el }] each: cards stepped together, started again together
  cardWant = card => (card.key && N.cards ? N.cards[card.key] : null),
  colgroup = n => `<colgroup><col style="width:${n <= 2 ? 34 : n === 3 ? 30 : n === 4 ? 25 : 21}%">${'<col>'.repeat(n - 1)}</colgroup>`,
  table = t => `<table class="nums">${colgroup(t.head.length)}<thead><tr>${t.head.map(h => `<th scope="col">${fmt(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => (i ? `<td>${fmt(c)}</td>` : `<th scope="row">${fmt(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table>`,
  PAIR_NO = ['', '①', '②', '③', '④'];

function head(item, no) {
  const el = document.createElement('div');
  el.className = 'item-head';
  el.id = `item-${item.id}`;
  el.innerHTML = `<h3>${fmt(item.title)}</h3>
    <div class="meta"><span>${item.part}부 · ${no}</span><code>${esc(item.id)}</code>${item.pairNo ? `<span class="pairno">비교 쌍 ${PAIR_NO[item.pairNo]}</span>` : ''}</div>
    <p class="state"><b>현재 상태.</b> ${fmt(item.state)}</p>
    ${(item.tables || []).map(table).join('')}
    ${(item.notes || []).map(n => `<p class="note">${fmt(n)}</p>`).join('')}
    ${item.refs ? `<div class="refs">${item.refs.map(r => `<a href="${esc(r.href)}" target="_blank" rel="noopener">${fmt(r.say)} ↗</a>`).join('')}</div>` : ''}`;
  return el;
}
// a card: a bout (its numbers under it), a reference sheet, or the empty half of a row
function cardEl(card) {
  if (card.fill) {
    const el = document.createElement('div');
    el.className = 'fill';
    return el;
  }
  const el = document.createElement('article');
  if (card.image) {
    el.className = 'card ref';
    el.innerHTML = `<a class="stage" href="${esc(card.image)}" target="_blank" rel="noopener" aria-label="참고 이미지 원본 열기"><img src="${esc(card.image)}" alt="${esc(card.say)}" loading="lazy"></a><div class="info"><p class="say">${fmt(card.say)}</p></div>`;
    return el;
  }
  const want = cardWant(card),
    entry = byId[card.entry],
    variant = card.tune ? (card.kind === 'cross' ? '기획 모양' : '조정안') : card.guard === 1 ? '조정안' : '';
  el.className = 'card' + (variant ? ' tuned' : '');
  let nums = '';
  switch (card.kind) {
    case 'liver': {
      const pct = x => `${((x / 180) * 100).toFixed(2)}%`;
      nums = `<div class="feet"><span class="big"><b data-j>–</b><small>N·s</small></span><span class="want">기대 ${f1(want && want.J)}</span></div>
        <div class="scale" aria-hidden="true"><span class="band" style="left:${pct(card.band[0])};width:${pct(card.band[1] - card.band[0])}"></span><span class="ko" style="left:${pct(RULES.body.liver)}"></span><span class="blow" data-bar></span></div>
        <div class="ticks"><span>0</span><span>기획 ${card.band[0]}~${card.band[1]}</span><span>180</span></div>
        <div class="feet"><span>${f0(want && want.ms)} ms · ${f1(want && want.speed)} m/s</span><span>리버 다운 기준 ${RULES.body.liver}</span></div>`;
      break;
    }
    case 'cross':
      nums = `<div class="feet result"><span class="tag" data-tag>–</span><span><b data-a>–</b> N·s</span><span data-b>–</span></div>
        <div class="feet"><span>뒷팔 기울기 <b data-tilt>–</b>°</span><span class="want">기대 ${f1(want && want.tilt)}° · ${esc((want && want.said) || '–')} ${f1(want && want.J)}</span></div>`;
      break;
    case 'pd': {
      const rate = card.rate && N.parryDown && N.parryDown.per100 ? N.parryDown.per100[card.rate[0]] && N.parryDown.per100[card.rate[0]][card.rate[1]] : undefined;
      nums =
        card.guard !== undefined
          ? `<div class="feet"><span>가드 <b>+${card.guard}</b> f</span>${card.gap ? `<span>거리 ${card.gap.toFixed(1)} m</span>` : ''}</div>
            <div class="feet result"><span class="tag" data-tag>–</span><span>반격 <b data-c>–</b> N·s</span></div>
            <div class="feet"><span class="want">기대 ${esc((want && want.said) || '–')} · 반격 ${f1(want && want.counter)}</span></div>
            <div class="feet"><span>시합: 잽 100개에 <b>${f1(rate)}</b>번</span></div>`
          : `<div class="feet result"><span class="tag" data-tag>–</span><span>구간 <b>${signed(entry.window[0])}–${signed(entry.window[1])}</b> f</span></div>
            <div class="feet"><span>반격 <b data-a>–</b> ms</span><span><b data-c>–</b> N·s</span></div>`;
      break;
    }
    case 'fx':
      nums = `<div class="feet"><span>충격량 <b data-blow>–</b> N·s</span><span>입자 <b data-beads>–</b></span><span>뻗는 거리 <b data-reach>–</b> cm</span></div>`;
      break;
    case 'wave':
      nums = `<div class="feet"><span>둘레 속도 <b data-a>–</b> m/s</span><span>거리 <b data-b>–</b> m</span></div>`;
      break;
    default:
      nums = `<div class="feet result"><span class="tag" data-tag>–</span><span><b data-blow>–</b> N·s</span></div>
        <div class="feet"><span>그가 친 주먹 <b data-own>–</b> N·s</span></div>`;
  }
  el.innerHTML = `<div class="stage" role="img" aria-label="${esc(card.say.replace(/`/g, ''))} 애니메이션">${variant ? `<span class="mark">${variant}</span>` : ''}</div>
    <div class="info"><p class="say">${fmt(card.say)}</p>${nums}</div>`;
  return el;
}
function clocks(groups) {
  const out = document.createDocumentFragment();
  for (const g of groups) {
    const box = document.createElement('div'),
      clock = [];
    box.className = 'clock';
    if (g.title) box.insertAdjacentHTML('beforeend', `<h4>${fmt(g.title)}</h4>`);
    for (const row of g.rows) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const card of row) {
        const el = cardEl(card);
        grid.append(el);
        if (card.entry) g.apart ? CLOCKS.push([{ card, el }]) : clock.push({ card, el });
      }
      box.append(grid);
    }
    if (clock.length) CLOCKS.push(clock);
    out.append(box);
  }
  return out;
}
// the choice: a radio a choice, the recommended one marked; back to none; a note; and how its saving stands
function decide(item) {
  const el = document.createElement('fieldset'),
    rec = item.options.find(o => o.id === item.recommend);
  el.className = 'decide';
  el.dataset.item = item.id;
  el.disabled = true; // (until the saved decisions are in, or it is clear they will not come)
  el.innerHTML = `<legend>결정</legend>
    <div class="opts">${item.options.map(o => `<label class="opt"><input type="radio" name="choice-${item.id}" value="${o.id}"><span><b>${fmt(o.name)}</b>${o.id === item.recommend ? '<i class="rec">권장</i>' : ''}<span class="says">${fmt(o.says)}</span></span></label>`).join('')}</div>
    ${rec ? `<p class="why">권장: <b>${fmt(rec.name)}</b>${item.why ? `. ${fmt(item.why)}` : ''}</p>` : ''}
    <textarea maxlength="2000" rows="2" aria-label="메모" placeholder="메모 (선택, 2000자까지)"></textarea>
    <div class="row"><button type="button" data-clear>고르지 않음</button><span class="saved" data-saved aria-live="polite">아직 정하지 않음</span></div>`;
  return el;
}
function article(item, no) {
  const el = document.createElement('article');
  el.className = 'item';
  el.append(head(item, no));
  if (item.banner) {
    el.insertAdjacentHTML('beforeend', `<a class="banner" href="${esc(item.banner.image)}" target="_blank" rel="noopener"><img src="${esc(item.banner.image)}" alt="${esc(item.banner.say)}" loading="lazy"></a><p class="banner-note">${fmt(item.banner.say)}</p>`);
  }
  if (item.groups) el.append(clocks(item.groups));
  el.append(decide(item));
  return el;
}
// two items that share a row of cards: [A's head][B's head], the row, [A's choice][B's choice]
function pairing(a, b, no) {
  const el = document.createElement('section'),
    heads = document.createElement('div'),
    choices = document.createElement('div');
  el.className = 'pairing';
  heads.className = choices.className = 'two';
  heads.append(head(a, no), head(b, no + 1));
  choices.append(decide(a), decide(b));
  // (two scripts that have nothing to do with each other: a clock each)
  el.append(heads, clocks([{ rows: [[a.card, b.card]], apart: true }]), choices);
  return el;
}

function contents() {
  document.getElementById('toc').innerHTML = `<h2 class="toc-title">차례</h2>
    <p class="toc-count" id="count">${ITEMS.length}개 가운데 <b>0</b>개를 정했습니다</p>
    <ol class="toc-parts">${PARTS.map(P => `<li><a class="toc-part" href="#part-${P.n}">${P.n}. ${fmt(P.title)}</a><ul class="toc-rows">${ITEMS.filter(i => i.part === P.n).map(i => `<li><a href="#item-${i.id}" data-toc="${i.id}"><span class="dot" aria-hidden="true"></span><span>${fmt(i.title)}</span><span class="pick"></span></a></li>`).join('')}</ul></li>`).join('')}</ol>`;
}
contents();
for (const P of PARTS) {
  main.insertAdjacentHTML('beforeend', `<h2 class="part" id="part-${P.n}"><span class="no">${P.n}</span>${fmt(P.title)}</h2><p class="part-note">${fmt(P.note)}</p>`);
  const items = ITEMS.filter(i => i.part === P.n);
  for (let k = 0; k < items.length; k++) {
    if (items[k].pair) {
      main.append(pairing(items[k], items[k + 1], k + 1));
      k++;
    } else main.append(article(items[k], k + 1));
  }
  if (P.n === 4) main.insertAdjacentHTML('beforeend', `<p class="part-note" style="margin:0">${fmt(STASH_NOTE)}</p>`);
}
shownAsLD(document.body);
// (opened at an item's address: the page is written by now, so go there; the browser's own jump came before it was)
if (location.hash && document.getElementById(location.hash.slice(1))) document.getElementById(location.hash.slice(1)).scrollIntoView();

/* ---- the decisions and where they are kept */
const KEY = id => `pending:${id}`;
/* The store: the artifact's db when this view has it (one document an item in `decisions`), otherwise this browser.
   all() -> { id: doc }, set(id, doc). Only this object knows which. */
const store = {
  db: null,
  mode: 'loading', // 'loading' | 'db' | 'local'
  async all() {
    if (this.db) {
      const snap = await this.db.collection('decisions').get();
      return Object.fromEntries(snap.docs.filter(d => d.exists).map(d => [d.id, d.data()]));
    }
    const out = {};
    for (const item of ITEMS)
      try {
        const v = localStorage.getItem(KEY(item.id));
        if (v) out[item.id] = JSON.parse(v);
      } catch {
        // (blocked or unreadable storage: nothing kept here)
      }
    return out;
  },
  async set(id, doc) {
    if (this.db) return this.db.doc(`decisions/${id}`).set(doc);
    localStorage.setItem(KEY(id), JSON.stringify(doc));
  }
};
let readOnly = false;
const state = Object.fromEntries(
  ITEMS.map(item => {
    const box = document.querySelector(`fieldset[data-item="${item.id}"]`);
    return [item.id, { item, box, saved: null, choice: null, note: '', busy: false, again: false, failed: false, touched: false, timer: 0 }];
  })
);
const known = (item, choice) => item.options.some(o => o.id === choice);
const when = iso => {
  const d = new Date(iso);
  return isNaN(d) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const storeLine = document.getElementById('store');
function storeSays(text, kind) {
  storeLine.textContent = text;
  storeLine.className = 'store' + (kind ? ' ' + kind : '');
}

// how an item's saving stands, under its choice, and its mark in the contents
function status(id) {
  const s = state[id],
    line = s.box.querySelector('[data-saved]'),
    where = store.mode === 'local' ? '이 브라우저에만 저장됨' : '저장됨';
  line.className = 'saved';
  if (s.busy) (line.textContent = '저장 중…'), line.classList.add('busy');
  else if (s.failed) {
    line.innerHTML = '<button type="button" data-retry>저장하지 못했습니다. 다시 시도</button>';
    line.querySelector('[data-retry]').addEventListener('click', () => save(id, true));
  } else if (s.saved && known(s.item, s.saved.choice)) (line.textContent = `${where} · ${when(s.saved.at)}`), line.classList.add('ok');
  else if (s.saved && s.saved.note) (line.textContent = `고르지 않음 · 메모 ${store.mode === 'local' ? '이 브라우저에만 ' : ''}저장됨 · ${when(s.saved.at)}`), line.classList.add('ok');
  else line.textContent = store.mode === 'local' ? '아직 정하지 않음 · 이 브라우저에만 저장됨' : '아직 정하지 않음';
  const link = document.querySelector(`[data-toc="${id}"]`),
    chosen = s.saved && known(s.item, s.saved.choice);
  link.classList.toggle('chosen', !!chosen);
  link.querySelector('.pick').textContent = chosen ? asLD(s.item.options.find(o => o.id === s.saved.choice).name.replace(/`/g, '')) : '';
  link.setAttribute('aria-label', `${asLD(s.item.title.replace(/`/g, ''))}: ${chosen ? '정함' : '정하지 않음'}`);
  document.querySelector('#count b').textContent = String(ITEMS.filter(i => state[i.id].saved && known(i, state[i.id].saved.choice)).length);
}
// what is shown: the choice and the note as they stand
function show(id) {
  const s = state[id];
  for (const r of s.box.querySelectorAll('input[type="radio"]')) r.checked = r.value === s.choice;
  const note = s.box.querySelector('textarea');
  if (document.activeElement !== note) note.value = s.note;
  status(id);
}
/* Save an item: one write at a time for a document, and only when what it holds has changed (a change made while one is on
   its way is written once that one is done). force: write it again whether or not (the retry after a failure). */
function save(id, force) {
  const s = state[id];
  if (readOnly) return;
  if (s.busy) return void (s.again = true);
  const same = s.saved && s.saved.choice === s.choice && (s.saved.note || '') === s.note;
  if ((same || (!s.saved && s.choice === null && !s.note)) && !force && !s.failed) return status(id);
  const doc = { choice: s.choice, note: s.note, at: new Date().toISOString() };
  s.busy = true;
  s.failed = false;
  status(id);
  Promise.resolve()
    .then(() => store.set(id, doc))
    .then(
      () => (s.saved = doc),
      error => {
        s.failed = true;
        console.warn('pending: saving', id, error);
        // (a well-formed write refused: this viewer may not write here, for the rest of the visit)
        if (error && error.code === 'invalid_argument') lock('읽기 전용: 이 페이지의 결정을 바꿀 수 없습니다');
      }
    )
    .finally(() => {
      s.busy = false;
      status(id);
      if (s.again) (s.again = false), save(id);
    });
}
function lock(text) {
  readOnly = true;
  storeSays(text, 'warn');
  for (const s of Object.values(state)) (s.box.disabled = true), s.box.setAttribute('data-readonly', '');
}
for (const s of Object.values(state)) {
  const id = s.item.id,
    note = s.box.querySelector('textarea');
  s.box.addEventListener('change', e => {
    if (e.target.type !== 'radio') return;
    s.touched = true;
    s.choice = e.target.value;
    save(id);
  });
  s.box.querySelector('[data-clear]').addEventListener('click', () => {
    s.touched = true;
    s.choice = null;
    show(id);
    save(id);
  });
  // (the note: once typing has stopped for 0.8 s, and as it loses the focus)
  note.addEventListener('input', () => {
    s.touched = true;
    s.note = note.value.slice(0, 2000);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => save(id), 800);
  });
  note.addEventListener('blur', () => {
    clearTimeout(s.timer);
    s.note = note.value.slice(0, 2000);
    save(id);
  });
  status(id);
}
// the saved decisions, put in: a choice the item no longer has shows as none, its note kept; an id that is no item is left be
function fill(docs) {
  for (const [id, doc] of Object.entries(docs || {})) {
    const s = state[id];
    if (!s || !doc || typeof doc !== 'object' || s.touched) continue;
    s.saved = { choice: typeof doc.choice === 'string' ? doc.choice : null, note: typeof doc.note === 'string' ? doc.note : '', at: doc.at };
    s.choice = known(s.item, s.saved.choice) ? s.saved.choice : null;
    s.note = s.saved.note;
    show(id);
  }
}
const open = () => {
  if (!readOnly) for (const s of Object.values(state)) s.box.disabled = false;
};
const within = (p, ms) => Promise.race([p, new Promise(resolve => setTimeout(() => resolve('late'), ms))]);
async function connect() {
  let db = null,
    user = null;
  try {
    const use = window.claude && window.claude.use ? name => window.claude.use(name) : null;
    if (use) [db, user] = await within(Promise.all([use('db'), use('user').catch(() => null)]), 10000).then(r => (r === 'late' ? [null, null] : r));
  } catch (error) {
    console.warn('pending: the store', error);
  }
  if (db) {
    store.db = db;
    store.mode = 'db';
    // (told this viewer may not write: shown read-only; told nothing, the controls stay and a refused write decides)
    if (user) user.can('data.write').then(can => can === false && lock('읽기 전용: 결정을 볼 수만 있습니다'), () => {});
    const read = store.all();
    const got = await within(read, 10000).catch(error => ({ error }));
    if (got === 'late') {
      storeSays('저장된 결정을 아직 불러오지 못했습니다. 들어오는 대로 채웁니다', 'warn');
      open();
      read.then(docs => (fill(docs), storeSays('결정은 이 페이지에 저장되고, 함께 보는 사람과 같습니다', 'ok')), () => storeSays('저장된 결정을 불러오지 못했습니다', 'warn'));
    } else if (got && got.error) {
      console.warn('pending: reading the decisions', got.error);
      storeSays('저장된 결정을 불러오지 못했습니다. 고르면 다시 저장을 시도합니다', 'warn');
      open();
    } else {
      fill(got);
      if (!readOnly) storeSays('결정은 이 페이지에 저장되고, 함께 보는 사람과 같습니다', 'ok');
      open();
    }
  } else {
    store.mode = 'local';
    fill(await store.all());
    storeSays('이 브라우저에만 저장됨', 'warn');
    open();
  }
  for (const id of Object.keys(state)) status(id);
}
connect();

/* ---- the bouts */
function floor(half, centre) {
  const gap = 0.085,
    n = Math.round((half * 2) / gap),
    rows = new Float32Array(n * n * 12),
    s = 0.042 ** 2;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = centre[0] - half + (i + 0.5) * gap,
        z = centre[1] - half + (j + 0.5) * gap,
        tile = 0.5,
        fx = Math.abs((((x / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        fz = Math.abs((((z / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        dark = (Math.floor(x / tile + 100) + Math.floor(z / tile + 100)) % 2;
      rows.set([x, 0, z, s, 0, 0, 1e-6, 0, s, fx < 0.03 || fz < 0.03 ? 22 : dark ? 23 : 24, 0, 3], k);
      k += 12;
    }
  return { rows, count: n * n };
}
async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const boxer = unpack(fromBase64(await (await fetch('assets/' + manifest.boxer.file)).text()), manifest.boxer);
  return { manifest, boxer };
}
// the dice of an effect card: the same for the four cards of a scene and thrown again from the start every loop (src/fxlab.mjs)
const dice = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const flash = el => {
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
};

function start({ manifest, boxer }) {
  const canvas = document.getElementById('view'),
    R = createRenderer(canvas),
    bind = fk(guardPose()),
    tiles = floor(3.2, [0.6, 0]),
    meshes = { boxer: R.mesh(boxer, manifest.boxer.count), floor: R.mesh(tiles.rows, tiles.count) },
    palettes = [paletteArray(manifest.palette), paletteArray(manifest.palette.map((hex, i) => RIVAL[i] ?? hex))],
    mats = new Float32Array(NAMES.length * 12),
    ink = new Float32Array(rgb(manifest.palette[0]));
  let speed = 1,
    last = 0,
    ground = new Float32Array(12);

  const q = (el, s) => el.querySelector(s);
  function makeCell({ card, el }) {
    const entry = card.guard !== undefined ? guardAt(byId[card.entry], card.guard, card.gap) : byId[card.entry],
      version = card.version ? VERSIONS.find(v => v.id === card.version) : null,
      scene = version ? FX_SCENES[card.scene] : null,
      view = card.view || entry.view,
      cell = {
        card,
        entry,
        patches: patchesOf(card.tune, TABLES),
        version,
        scene,
        el,
        stage: q(el, '.stage'),
        tag: q(el, '[data-tag]'),
        bar: q(el, '[data-bar]'),
        out: Object.fromEntries(['a', 'b', 'c', 'j', 'blow', 'own', 'beads', 'reach', 'tilt'].map(k => [k, q(el, `[data-${k}]`)])),
        exchange: entry.punch !== undefined || !!entry.fresh,
        bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
        seed: scene ? 7 + card.scene : 0,
        rnd: Math.random,
        waves: [null, null],
        cam: scene ? { target: [scene.struck ? 1.2 : -0.45, 1.3, 0], yaw: view.yaw, pitch: view.pitch, dist: 2.9 } : { target: [0.45, entry.level ? 0.95 : entry.punch !== undefined ? 0.85 : 0.52, 0], yaw: view.yaw, pitch: view.pitch, dist: 5.4 },
        shake: 0,
        t: 0
      };
    cell.fx = createFx(() => cell.rnd());
    cell.mesh = R.mesh(cell.fx.rows, 0, true);
    // (an effect card's spray off each man apart from the rest: it is kept off his own silhouette, and only his)
    cell.sprays = scene ? [0, 1].map(() => {
      const spray = createFx(() => cell.rnd());
      return { fx: spray, mesh: R.mesh(spray.rows, 0, true) };
    }) : [];
    return cell;
  }
  const clocks = CLOCKS.map(cards => ({ cells: cards.map(makeCell), acc: 0 }));
  const cells = clocks.flatMap(c => c.cells);
  for (const cell of cells) reset(cell);

  function reset(cell) {
    // (a variant's bout is made with its values in force: making it may read them)
    cell.bout = withTune(cell.patches, () => freshBout(cell.entry));
    cell.t = 0;
    cell.m = { own: [], tilt: [], held: 0, path: [] };
    cell.waves = [null, null];
    if (cell.scene) cell.rnd = dice(cell.seed);
  }
  const put = (cell, k, v) => cell.out[k] && (cell.out[k].textContent = v);
  function tell(cell, text, blow) {
    if (!cell.tag) return;
    cell.tag.textContent = text;
    flash(cell.tag);
    if (blow !== undefined) put(cell, 'blow', blow === null || blow === undefined ? '–' : String(Math.round(blow)));
  }

  /* One step of one card, its values in force for all of it (the step, and what is measured off it). A card past the end of
     its loop (waiting for the rest of its clock) stands in its guard. */
  function tick(cell) {
    withTune(cell.patches, () => {
      const { entry, card } = cell,
        bout = cell.bout,
        [a, b] = bout.fighters,
        m = cell.m,
        over = cell.exchange && cell.t >= entry.loop - 1e-9,
        controls = over ? [{}, {}] : drive(entry, bout, cell.t, DT);
      cell.t += DT;
      step(bout, controls, DT);
      b.hp = 1000; // he is here to be stood in front of, not beaten
      if (!entry.hurt) a.hp = 1000;
      for (const e of bout.events) {
        const by = e.type === 'parry' ? e.on : e.who;
        if (by === 1 && SAID[e.type]) tell(cell, e.down && e.type !== 'parry' ? (e.out ? '실신' : '다운') : e.roll ? '굴림' : e.type === 'parry' && e.down ? '눌러 내림' : SAID[e.type], e.J);
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && e.J !== undefined) (m.own = m.own.concat(Math.round(e.J)).slice(-3)), put(cell, 'own', m.own.join(' · '));
        if (cell.scene) blowFx(cell, e);
        else if (e.type === 'hit') {
          // the blow, as the catalogue draws it: sparks sized by its impulse, and the picture shaken
          const k = Math.min(1.6, e.J / 85);
          cell.fx.sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
          cell.fx.sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir);
          cell.shake = e.down ? 5 : 1 + 2.5 * k;
        } else if (e.type === 'block') (cell.fx.sparks(e.at, 4, [38, 25, 24], 2.5, e.dir), (cell.shake = 1));
        else if (e.type === 'parry') (cell.fx.sparks(e.at, 14, [38, 38, 39, 40], 5), (cell.shake = 2));
        switch (card.kind) {
          case 'liver':
            if (e.type === 'hit' && e.who === 0) {
              put(cell, 'j', f1(e.J));
              cell.bar.style.left = `${Math.min(100, (e.J / 180) * 100).toFixed(2)}%`;
              cell.bar.classList.toggle('in', e.J >= card.band[0] && e.J <= card.band[1]);
              cell.bar.classList.add('on');
            }
            break;
          case 'cross':
            if (e.type === 'block' && e.who === 1) put(cell, 'a', f1(e.J)), put(cell, 'b', MET[e.part] || e.part || '–');
            if (e.type === 'hit' && e.who === 1) put(cell, 'a', f1(e.J)), put(cell, 'b', '맞음');
            break;
          case 'pd':
            // (on the bout's clock, as tests/clean.test.mjs times it: the moments held at a blow are not counted)
            if (e.type === 'parry' && e.on === 1 && e.down) m.downAt = bout.t;
            if (e.type === 'hit' && e.who === 0 && m.downAt !== undefined && !m.said) (m.said = true), put(cell, 'a', String(Math.round((bout.t - m.downAt) * 1000))), put(cell, 'c', f1(e.J));
            break;
        }
      }
      cell.shake *= 0.82;
      if (card.kind === 'cross') {
        // the rear forearm's lean, averaged over the loop while the guard has been up 0.3 s and more (tools/pending.mjs)
        // (said once the guard comes down, when the whole of it has been averaged)
        if (!a.cover && m.held >= 0.3 - 1e-9 && m.tilt.length) put(cell, 'tilt', f1(m.tilt.reduce((s, x) => s + x, 0) / m.tilt.length));
        m.held = a.cover ? m.held + DT : 0;
        if (m.held >= 0.3 - 1e-9) m.tilt.push(rearTilt(a));
      }
      if (card.kind === 'wave') {
        // how fast he goes round: the way he has come in the last second, and how far he is from the other man
        m.path.push([a.x, a.z]);
        if (m.path.length > 61) m.path.shift();
        if (m.path.length > 60 && Math.round(cell.t / DT) % 15 === 0) {
          let d = 0;
          for (let i = 1; i < m.path.length; i++) d += Math.hypot(m.path[i][0] - m.path[i - 1][0], m.path[i][1] - m.path[i - 1][1]);
          put(cell, 'a', (d / ((m.path.length - 1) * DT)).toFixed(2));
          put(cell, 'b', Math.hypot(a.x - b.x, a.z - b.z).toFixed(2));
        }
      }
    });
  }
  // a blow as an effect card draws it: the version's spray and ripple, or the blow as it is drawn now (src/fxlab.mjs)
  function blowFx(cell, e) {
    const { version, scene } = cell;
    if (e.type === 'hit') {
      const k = Math.min(1.6, e.J / 85),
        struck = cell.bout.fighters[e.on];
      let n;
      if (version.spray) {
        // the sweat off the shadowed side of what was struck (a blow to the body: off the trunk, at 0.6 of the amount and reach)
        const o = scene.body ? Object.assign({}, version.spray, { n: version.spray.n * 0.6, range: version.spray.range * 0.6 }) : version.spray,
          part = scene.body && e.trunk ? e.trunk : { at: struck.points.head, r: HEAD };
        n = cell.sprays[e.on].fx.spray(part, e.vec, e.J, MIST, o);
        cell.waves[e.on] = { off: [e.at[0] - struck.points.head[0], e.at[1] - struck.points.head[1], e.at[2] - struck.points.head[2]], age: 0, strength: Math.min(1, e.J / 60) };
        put(cell, 'reach', String(Math.round(o.range * Math.min(1.7, e.J / 85) * 100)));
      } else {
        cell.fx.sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
        cell.fx.sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir);
        n = Math.round(5 + 12 * k) + Math.round(3 + 8 * k);
        put(cell, 'reach', '–');
      }
      cell.shake = e.down ? scene.shake || 5 : 1 + 2.5 * k;
      put(cell, 'blow', String(Math.round(e.J)));
      put(cell, 'beads', String(n));
    } else if (e.type === 'block') (cell.fx.sparks(e.at, 4, [38, 25, 24], 2.5, e.dir), (cell.shake = 1));
  }

  /* A clock: its cards step together, so the same moment of the script is in all of them; an exchange starts again, all of
     it, once every card has played its loop. */
  function stepClock(clock) {
    if (clock.cells[0].exchange && clock.cells.every(c => c.t >= c.entry.loop - 1e-9)) clock.cells.forEach(reset);
    for (const cell of clock.cells) tick(cell);
  }

  function theme() {
    // the canvas has no transparency: what it paints round the stages is the page's own colour
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
    ground = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
  }
  const onScreen = box => !(box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth || box.width < 8);
  function frame(now) {
    const elapsed = globalThis.__pending.hold ? 0 : Math.min(0.1, (now - last) / 1000 || 0) * speed;
    last = now;
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    const grid = R.resize(h / Math.max(2, Math.round(dpr * 2.5))); // about two and a half screen pixels to an art pixel
    if (Math.round(now / 500) !== Math.round((now - 17) / 500)) theme();
    R.begin();
    for (const clock of clocks) {
      const boxes = clock.cells.map(c => c.stage.getBoundingClientRect());
      if (!boxes.some(onScreen)) continue;
      clock.acc += elapsed;
      let steps = 0;
      while (clock.acc >= DT && steps++ < 6) (clock.acc -= DT), stepClock(clock);
      if (steps > 6) clock.acc = 0;
      clock.cells.forEach((cell, i) => onScreen(boxes[i]) && draw(cell, boxes[i], dpr, grid, elapsed));
    }
    R.end({ hall: ground, ink });
    requestAnimationFrame(frame);
  }
  // a card's picture as its bout stands, what is in the air moved on by `elapsed` seconds
  function draw(cell, box, dpr, grid, elapsed) {
    const [a, b] = cell.bout.fighters,
      layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5 }],
      shadows = [];
    [a, b].forEach((f, i) => {
      R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
      shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
    });
    cell.mesh.update(cell.fx.rows, cell.fx.update(elapsed, shadows, 22));
    const rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) },
      ease = 1 - Math.exp(-elapsed * 4),
      jolt = cell.shake > 0.3 ? [Math.sin(cell.t * 97) * cell.shake, Math.cos(cell.t * 83) * cell.shake * 0.6] : null;
    if (cell.scene) {
      for (const s of cell.sprays) s.mesh.update(s.fx.rows, s.fx.update(elapsed));
      // each man's ripple, if one is going through him: from where the glove met him, wherever his head is now
      const waves = [a, b].map((f, i) => {
        const wv = cell.waves[i],
          set = cell.version.wave;
        if (!wv || !set) return null;
        wv.age += elapsed;
        if (wv.age >= set.last) return (cell.waves[i] = null);
        const hd = f.points.head;
        return [hd[0] + wv.off[0], hd[1] + wv.off[1], hd[2] + wv.off[2], set.speed * wv.age, set.width, wv.strength * (1 - wv.age / set.last) ** 1.2, set.sway];
      });
      layers.push(
        { mesh: cell.mesh, palette: palettes[0], mask: 0.6 },
        { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1, wave: waves[0], flash: !cell.version.wave && a.flash > 0 ? 1 : 0, silhouette: 1 },
        { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, wave: waves[1], flash: !cell.version.wave && b.flash > 0 ? 1 : 0, silhouette: 2 },
        // (the spray off each man is never seen over him: where it crosses his own outline it is not there)
        ...cell.sprays.map((s, i) => ({ mesh: s.mesh, palette: palettes[0], mask: 0.6, outside: i + 1 }))
      );
      // framed on the man who is hit, a little behind him: the room is on the far side of him, for what the blow throws off
      const [hit, other] = cell.scene.struck ? [b, a] : [a, b];
      cell.cam.target[0] += (hit.x * 1.45 - other.x * 0.45 - cell.cam.target[0]) * ease;
      cell.cam.target[2] += (hit.z * 1.45 - other.z * 0.45 - cell.cam.target[2]) * ease;
    } else {
      layers.push({ mesh: cell.mesh, palette: palettes[0], mask: 0.6 }, { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1 }, { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, flash: b.flash > 0 ? 1 : 0 });
      // (an exchange is framed on the two of them, close; footwork on the boxer whose feet these are)
      const mine = cell.exchange ? 0.5 : 0.6;
      cell.cam.target[0] += (a.x * mine + b.x * (1 - mine) - cell.cam.target[0]) * ease;
      cell.cam.target[2] += (a.z * mine + b.z * (1 - mine) - cell.cam.target[2]) * ease;
      // far enough back that both men are in the picture from the feet up, whatever shape the window is
      const [near, wide] = cell.entry.level ? [3.4, 2.1] : cell.exchange ? [3.3, 2.5] : [5.2, 3.6];
      cell.cam.dist = Math.max(near, wide / (2 * Math.tan((19 * Math.PI) / 180) * (rect.w / rect.h)));
    }
    R.cell(rect, { camera: cell.cam, layers, shake: jolt });
  }

  for (const button of document.querySelectorAll('[data-speed]'))
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('[data-speed]')) other.setAttribute('aria-pressed', String(other === button));
    });
  /* (for looking at the page from a script: the clocks of the cards inside `within` (all, if left out) stepped on by so many
     seconds at once, what is in the air with them; and hold, which stops the page's own time) */
  globalThis.__pending = {
    cells,
    clocks,
    renderer: R,
    hold: false,
    advance: (sec, within) =>
      clocks
        .filter(clock => !within || clock.cells.some(cell => within.contains(cell.el)))
        .forEach(clock => {
          for (let i = 0; i < Math.round(sec / DT); i++) {
            stepClock(clock);
            for (const cell of clock.cells) (cell.fx.update(DT, [], 22), cell.sprays.forEach(sp => sp.fx.update(DT)), cell.waves.forEach(wv => wv && (wv.age += DT)));
          }
        })
  };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});

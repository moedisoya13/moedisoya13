/* The pending catalogue (docs/pending-catalog.md): every question still open, each with where it stands, its numbers
   against the plan, the bouts that show it, and the choice, saved as it is made. The bouts are the motion catalogue's
   (src/catalog.mjs): one canvas behind the page, each card's stage a window onto its own looped bout, the cards of a clock
   stepped together while any of them is on screen, and a blow drawn as the game draws it (render/blow.mjs). The hit
   effect's cards (an item decided: the versions it was decided among, kept as they were compared) draw the blow each its
   own way: a version's spray kept outside the struck man's silhouette and its ripple through him, or the blow as it was
   drawn before, its sparks where it landed and the struck man white for 0.07 s (his palette made white: the renderer has
   no flash any more). A variant card is the same
   engine with a value or two of the game's tables replaced while its own code runs (src/tune.mjs), so the card beside it
   runs on the defaults. What a variant card should show was measured by tools/pending.mjs (src/pending.numbers.mjs), and is
   written beside what it does show. A recorded card (a clip: src/clips.data.mjs, recorded by tools/clips.mjs) is motion that
   is not in this checkout yet, a stage's or a checker's, fought where it is and kept frame by frame: it is played back through
   the same renderer and the same blows (each man's pose as it was kept, each frame's blows thrown as the frame is reached), the
   frames between two kept ones blended (src/replay.mjs blend) so that it plays as smoothly at a quarter of the speed. The
   clips of a comparison are one clock: they start together, go at their own speeds (a slow one's beside its full speed one
   goes round once while the other goes round four times), and start again together after a moment held on the last frame.
   A clip's frames are loaded only as its row comes near the screen. A recorded card that is one option of a decision has the
   option's own words over the rest (choice: the words of its button); and one that asks for it (white) has the game's white
   flash at a parry drawn over its picture, as main.mjs draws it over the screen.
   The decisions: a document an item in the artifact's store (collection `decisions`, the item's id: { choice, note, at }),
   read once as the page opens and written one at a time, only when changed; where there is no store, this browser's
   localStorage (`pending:<id>`) in the same shape. The page is written once they are read: an item answered (a document
   with one of its choices, or with none, decided in the data: src/pending.data.mjs answered) is left out of its part and of
   the counts, and folded at the part's end behind one line, where its choice can still be changed. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { blow, met, rippleOf, rippleRow } from './render/blow.mjs';
import { createGuard, styleOf, warpOf } from './render/guard.mjs';
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
import { PARTS, ITEMS, VERSIONS, MIST, FX_SCENES, STASH_NOTE, sortOut, ANSWERED_LINE } from './pending.data.mjs';
import { NUMBERS } from './pending.numbers.mjs';
import { ROOTS } from './clips.data.mjs';
import { CLIPS_MADE, LOAD } from './clips/index.mjs';
import { blend } from './replay.mjs';
import { trunk } from './game/trunk.mjs';
import { toWorld } from './anim/pose.mjs';

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
  REELS = [], // the same for the recorded cards: [{ card, el }] each, played together
  cardWant = card => (card.key && N.cards ? N.cards[card.key] : null),
  colgroup = n => `<colgroup><col style="width:${n <= 2 ? 34 : n === 3 ? 30 : n === 4 ? 25 : 21}%">${'<col>'.repeat(n - 1)}</colgroup>`,
  table = t => `<table class="nums">${colgroup(t.head.length)}<thead><tr>${t.head.map(h => `<th scope="col">${fmt(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => (i ? `<td>${fmt(c)}</td>` : `<th scope="row">${fmt(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table>`,
  PAIR_NO = ['', '①', '②', '③', '④'];

function head(item, no) {
  const el = document.createElement('div');
  el.className = 'item-head';
  el.id = `item-${item.id}`;
  el.innerHTML = `<h3>${fmt(item.title)}</h3>
    <div class="meta"><span>${(PARTS.find(P => P.n === item.part) || {}).mark || item.part + '부'} · ${no}</span><code>${esc(item.id)}</code>${item.pairNo ? `<span class="pairno">비교 쌍 ${PAIR_NO[item.pairNo]}</span>` : ''}</div>
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
  // (a recording of the game's own picture, its still the poster: played muted, the two of a row started again together)
  if (card.video) {
    el.className = 'card ref';
    el.innerHTML = `<div class="stage"><video src="${esc(card.video)}" poster="${esc(card.image)}" muted autoplay playsinline preload="auto" aria-label="${esc(card.say.replace(/`/g, ''))}"></video></div><div class="info"><p class="say">${fmt(card.say)}</p></div>`;
    const video = el.querySelector('video');
    video.addEventListener('ended', () => {
      const row = [...el.parentNode.querySelectorAll('video')];
      if (row.every(v => v.ended)) row.forEach(v => ((v.currentTime = 0), v.play().catch(() => {})));
    });
    return el;
  }
  if (card.image) {
    el.className = 'card ref';
    el.innerHTML = `<a class="stage" href="${esc(card.image)}" target="_blank" rel="noopener" aria-label="참고 이미지 원본 열기"><img src="${esc(card.image)}" alt="${esc(card.say)}" loading="lazy"></a><div class="info"><p class="say">${fmt(card.say)}</p></div>`;
    return el;
  }
  if (card.clip) return clipEl(card, el);
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
/* ---- a recorded card: where it came from, what it is, the line it was measured to show (its numbers from the very run it
   was recorded from: tools/clips.mjs MEASURES), and what became of the blow as it plays */
const PUNCH = { jab: '잽', cross: '스트레이트', hook: '훅', hookR: '뒷손 훅', upper: '어퍼', hookIn: '숏 훅', upperIn: '숏 어퍼', hookBody: '바디 훅', flicker: '플리커', crossOver: '크로스 카운터' };
const FACE = { up: '등으로 누움', down: '엎드림', side: '옆으로 누움' };
const s2 = x => (x === null || x === undefined ? '–' : (+x).toFixed(2));
const n1 = x => (x === null || x === undefined ? '–' : (+x).toFixed(1));
const blowSaid = b => (b ? `${PUNCH[b.name] || b.name} ${b.type === 'hit' ? (b.part === 'body' ? '몸에 명중' : '명중') : `${SAID[b.type] || b.type}${b.part && MET[b.part] ? `(${MET[b.part]})` : ''}`} <b>${n1(b.J)}</b> N·s` : '–');
// (the blow a card is about: the punch it names, the last of them; or the last blow of the run)
const blowOf = (m, name) => ((m && m.blows) || []).filter(b => !name || b.name === name).pop();
const CLIP_SAY = {
  blow: (m, card) => blowSaid(blowOf(m, card.blow)),
  cross: m => `엇갈린 폭 <b>${n1(m.crossed)}</b> cm`,
  reach: m => `머리까지 <b>${n1(m.head)}</b> cm${m.head < 0 ? ' (안으로 들어감)' : ''}`,
  chest: (m, card) => `${blowSaid(blowOf(m, card.blow))} · 가슴 <b>${f0(m.chest)}</b> °/s`,
  chin: m => `턱 <b>${n1(m.neck && m.neck.chin)}</b>° · 고개 ${n1(m.neck && m.neck.turn)}°`,
  head: m => `머리가 닿음 <b>${m.head === null ? '–' : m.head.toFixed(2)}</b> s · 턱 ${n1(m.neck && m.neck.chin)}°`,
  spread: m => `글러브 사이 <b>${n1(m.gloves)}</b> cm · 어깨 ${n1(m.rise)} cm`,
  across: (m, card, cell) => `화면 가로로 <b data-across>${cell && cell.across !== undefined ? n1(cell.across) : '–'}</b> cm · 글러브 사이 ${n1(m.gloves)}`,
  jump: m => `${m.glove === 'L' ? '앞' : '뒤'} 글러브 <b>${n1(m.jump)}</b> m/s · ${m.frame - 1}f`,
  legs: m => `누워서 넓적다리 사이 <b>${f0(m.thighs)}</b>° · 발목 ${f0(m.ankles)} cm`,
  pull: (m, card) => `${blowSaid(blowOf(m, card.blow))} · 상대 머리 <b>${n1(m.head)}</b> cm`,
  // (the options' clips: what each press threw and the blows, the waist, the tempo, how he lies, the guard of a rocked man)
  chain: m => `${(m.blows || []).map(b => `${PUNCH[b.name] || b.name} <b>${n1(b.J)}</b>${b.type === 'hit' ? '' : ` (${SAID[b.type] || b.type})`}`).join(' → ')} · 합 <b>${f0(m.sum)}</b> N·s`,
  waist: (m, card) => {
    // (a punch thrown again and again, the flicker: each of them)
    const all = ((m && m.blows) || []).filter(b => b.name === card.blow);
    return `${all.length > 1 ? `${PUNCH[card.blow] || card.blow} <b>${all.map(b => n1(b.J)).join(' · ')}</b> N·s` : blowSaid(blowOf(m, card.blow))} · 허리(골반 위) <b>${f0(m.waist)}</b> °/s · 가슴(허리 위) ${f0(m.own)} · 가슴(골반 위) ${f0(m.trunk)} °/s`;
  },
  tempo: m => `닿음 사이 <b>${(m.gaps || []).join(' · ')}</b> ms · ${(m.blows || []).map(b => `${PUNCH[b.name] || b.name} ${SAID[b.type] || b.type} ${n1(b.J)}`).join(', ')} N·s`,
  lying: m => `${FACE[m.face] || '–'} · 넓적다리 사이 <b>${f0(m.thighs)}</b>° · 머리 닿음 ${s2(m.down)} s${m.stood === null ? '' : ` · 일어섬 ${s2(m.stood)} s`}`,
  guard: m => `한 프레임 글러브 이동: ${(m.after || []).map(a => `${PUNCH[a.name] || a.name} 뒤 <b>${n1(a.step)}</b> cm`).join(' · ')}`,
  // (the cross counter: the jab it went over, by how much that missed or what it did, then the cross: how hard, a counter or not)
  over: m => (m.blows || []).map(b => `${PUNCH[b.name] || b.name} ${b.type === 'whiff' && b.margin !== undefined ? `빗나감 <b>${n1(b.margin)}</b> cm` : `${SAID[b.type] || b.type} <b>${n1(b.J)}</b> N·s${b.counter ? ' (카운터)' : ''}${b.out ? ' · 실신' : b.down ? ' · 다운' : ''}`}`).join(' → ') || '–',
  // (a miss: by how much, the bout's own margin; and a defence the bout found brilliant)
  missed: (m, card) => {
    const b = blowOf(m, card.blow);
    return b ? `${PUNCH[b.name] || b.name} ${SAID[b.type] || b.type} ${b.margin !== undefined ? `<b>${n1(b.margin)}</b> cm` : `<b>${n1(b.J)}</b> N·s`}${m.brilliant ? ' · 기막힌 수비' : ''}` : '–';
  }
};
function clipEl(card, el) {
  const made = CLIPS_MADE[card.clip],
    root = made ? ROOTS[made.root] : null;
  el.className = 'card rec' + (made && made.root !== 'now' ? ' tuned' : '');
  el.innerHTML = `<div class="stage" role="img" aria-label="${esc((card.choice ? card.choice + ': ' : root ? root.say + ': ' : '') + card.say.replace(/`/g, ''))} 녹화 애니메이션"><span class="mark">${card.slow ? '녹화 · ¼' : '녹화'}</span>${card.white ? '<span class="white" data-white aria-hidden="true"></span>' : ''}</div>
    <div class="info">${card.choice ? `<p class="choice">${fmt(card.choice)}</p>` : ''}<p class="from">${esc(root ? root.say : card.clip)}</p><p class="say">${fmt(card.say)}</p>
      <div class="feet result"><span class="tag" data-tag>–</span><span class="line" data-line>${made ? CLIP_SAY[card.line](made.measured, card) : '녹화 없음'}</span></div></div>`;
  return el;
}
function clocks(groups) {
  const out = document.createDocumentFragment();
  for (const g of groups) {
    const box = document.createElement('div'),
      clock = [],
      reel = [];
    box.className = 'clock';
    if (g.title) box.insertAdjacentHTML('beforeend', `<h4>${fmt(g.title)}</h4>`);
    for (const row of g.rows) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const card of row) {
        const el = cardEl(card);
        grid.append(el);
        if (card.entry) g.apart ? CLOCKS.push([{ card, el }]) : clock.push({ card, el });
        if (card.clip && CLIPS_MADE[card.clip]) reel.push({ card, el });
      }
      box.append(grid);
    }
    if (clock.length) CLOCKS.push(clock);
    if (reel.length) REELS.push(reel);
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
  // (one of two items that share a row of cards, written without the other: its card alone, the blank beside it)
  else if (item.card) el.append(clocks([{ rows: [[item.card, { fill: true }]], apart: true }]));
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

/* The page is written once the saved decisions are in (or it is clear they will not come soon): each part's items still
   open, and at its end, behind one line, those answered, folded away with what was chosen, so that a choice can still be
   changed there (src/pending.data.mjs answered, sortOut). It is laid out by the decisions as they stood when it opened: an
   item chosen during a visit stays where it is until the next, so a slip can be put right where it was made. */
let SHOWN = []; // (the items written open)
const day = iso => {
  const m = /^\d{4}-(\d\d)-(\d\d)/.exec(iso || '');
  return m ? `${+m[1]}월 ${+m[2]}일` : '';
};
const decidedSaid = d => `${d.how === 'chat' ? '대화로 정함' : '권장대로 만듦'} · ${day(d.at)}`;
const optionSaid = (item, id) => ((item.options.find(o => o.id === id) || {}).name || '').replace(/`/g, '');
function contents(parts) {
  const folded = parts.reduce((n, p) => n + p.answered.length, 0);
  // (the contents are folded away until asked for: the count stays in sight on the fold's own line)
  document.getElementById('toc').innerHTML = `<details class="toc-fold"><summary><span class="toc-title">차례</span><span class="toc-count" id="count">${SHOWN.length}개 가운데 <b>0</b>개를 정했습니다</span>${folded ? `<span class="toc-folded">답한 ${folded}개는 부마다 끝에 접어 둠</span>` : ''}</summary>
    <ol class="toc-parts">${parts.map(({ P, open }) => `<li><a class="toc-part" href="#part-${P.n}">${P.mark ? '' : P.n + '. '}${fmt(P.title)}</a><ul class="toc-rows">${open.map(i => `<li><a href="#item-${i.id}" data-toc="${i.id}"><span class="dot" aria-hidden="true"></span><span>${fmt(i.title)}</span><span class="pick"></span></a></li>`).join('')}</ul></li>`).join('')}</ol></details>`;
}
// a part's open items, numbered in the order they are written, two that share a row of cards side by side
function lay(items) {
  for (let k = 0; k < items.length; k++) {
    const a = items[k],
      b = items[k + 1];
    if (a.pair && b && b.id === a.pair) main.append(pairing(a, b, k + 1)), k++;
    else main.append(article(a, k + 1));
  }
}
// the answered items of a part, behind one line: each folded to its title and what was chosen, the whole item inside
function answeredFold(items, docs) {
  const box = document.createElement('details');
  box.className = 'answered';
  box.innerHTML = `<summary>${ANSWERED_LINE(items.length)}</summary><div class="answered-list"></div>`;
  for (const item of items) {
    const one = document.createElement('details'),
      doc = docs[item.id],
      said = doc ? `${optionSaid(item, doc.choice)} · 저장됨 · ${when(doc.at)}` : `${optionSaid(item, item.decided.choice)} · ${decidedSaid(item.decided)}`;
    one.className = 'ans';
    one.innerHTML = `<summary><span class="t">${fmt(item.title)}</span><span class="pick">${esc(said)}</span></summary>`;
    one.append(article(item, '답함'));
    box.lastElementChild.append(one);
  }
  return box;
}
function write(docs) {
  const parts = PARTS.map(P => Object.assign({ P }, sortOut(P.n, docs)));
  SHOWN = parts.flatMap(p => p.open);
  contents(parts);
  for (const { P, open, answered: done } of parts) {
    main.insertAdjacentHTML('beforeend', `<h2 class="part" id="part-${P.n}"><span class="no">${P.mark || P.n}</span>${fmt(P.title)}</h2><p class="part-note">${fmt(P.note)}</p>`);
    lay(open);
    if (done.length) main.append(answeredFold(done, docs));
    if (P.n === 4) main.insertAdjacentHTML('beforeend', `<p class="part-note" style="margin:0">${fmt(STASH_NOTE)}</p>`);
  }
  shownAsLD(document.body);
  // (opened at an item's address: the page is written by now, so go there, opening the folds it is in)
  const at = location.hash && document.getElementById(location.hash.slice(1));
  if (at) {
    for (let d = at.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
    at.scrollIntoView();
  }
}

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
/* each item's choice as it stands (made once the page is written: wire): what is saved, what was decided away from the page
   where nothing is saved (preset: the item's decided), what is shown, and how its saving goes */
let state = {};
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
  else if (!s.saved && s.preset && s.choice === s.preset.choice && !s.note) (line.textContent = `정해짐 · ${decidedSaid(s.preset)}`), line.classList.add('ok');
  else line.textContent = store.mode === 'local' ? '아직 정하지 않음 · 이 브라우저에만 저장됨' : '아직 정하지 않음';
  const link = document.querySelector(`[data-toc="${id}"]`),
    chosen = s.saved && known(s.item, s.saved.choice);
  // (an answered item, folded away, has no line in the contents)
  if (link) {
    link.classList.toggle('chosen', !!chosen);
    link.querySelector('.pick').textContent = chosen ? asLD(s.item.options.find(o => o.id === s.saved.choice).name.replace(/`/g, '')) : '';
    link.setAttribute('aria-label', `${asLD(s.item.title.replace(/`/g, ''))}: ${chosen ? '정함' : '정하지 않음'}`);
  }
  document.querySelector('#count b').textContent = String(SHOWN.filter(i => state[i.id].saved && known(i, state[i.id].saved.choice)).length);
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
  const base = s.saved || (s.preset && { choice: s.preset.choice, note: '' }),
    same = base && base.choice === s.choice && (base.note || '') === s.note;
  if ((same || (!base && s.choice === null && !s.note)) && !force && !s.failed) return status(id);
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
function wire(docs) {
  state = Object.fromEntries(
    ITEMS.map(item => {
      const box = document.querySelector(`fieldset[data-item="${item.id}"]`),
        preset = item.decided && !(docs && docs[item.id]) ? item.decided : null;
      return [item.id, { item, box, saved: null, preset, choice: preset ? preset.choice : null, note: '', busy: false, again: false, failed: false, touched: false, timer: 0 }];
    })
  );
  for (const s of Object.values(state)) listen(s);
  if (readOnly) for (const s of Object.values(state)) (s.box.disabled = true), s.box.setAttribute('data-readonly', '');
}
function listen(s) {
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
  show(id);
}
// the saved decisions, put in: a choice the item no longer has shows as none, its note kept; an id that is no item is left be
function fill(docs) {
  for (const [id, doc] of Object.entries(docs || {})) {
    const s = state[id];
    if (!s || !doc || typeof doc !== 'object' || s.touched) continue;
    s.saved = { choice: typeof doc.choice === 'string' ? doc.choice : null, note: typeof doc.note === 'string' ? doc.note : '', at: doc.at };
    s.preset = null; // (what is saved is what counts)
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
  let docs = {},
    said = null,
    later = null;
  if (db) {
    store.db = db;
    store.mode = 'db';
    // (told this viewer may not write: shown read-only; told nothing, the controls stay and a refused write decides)
    if (user) user.can('data.write').then(can => can === false && lock('읽기 전용: 결정을 볼 수만 있습니다'), () => {});
    const read = store.all();
    const got = await within(read, 10000).catch(error => ({ error }));
    if (got === 'late') (said = ['저장된 결정을 아직 불러오지 못했습니다. 들어오는 대로 채웁니다', 'warn']), (later = read);
    else if (got && got.error) console.warn('pending: reading the decisions', got.error), (said = ['저장된 결정을 불러오지 못했습니다. 고르면 다시 저장을 시도합니다', 'warn']);
    else (docs = got || {}), (said = readOnly ? null : ['결정은 이 페이지에 저장되고, 함께 보는 사람과 같습니다', 'ok']);
  } else {
    store.mode = 'local';
    docs = await store.all();
    said = ['이 브라우저에만 저장됨', 'warn'];
  }
  // (the page, laid out by the decisions as they are now; and the decisions put in)
  write(docs);
  wire(docs);
  fill(docs);
  if (said && !(readOnly && said[1] === 'ok')) storeSays(...said);
  open();
  if (later) later.then(d => (fill(d), readOnly || storeSays('결정은 이 페이지에 저장되고, 함께 보는 사람과 같습니다', 'ok')), () => storeSays('저장된 결정을 불러오지 못했습니다', 'warn'));
  for (const id of Object.keys(state)) status(id);
}
const written = connect();

/* ---- the bouts */
function floor(half, centre) {
  const gap = 0.085,
    n = Math.round((half * 2) / gap),
    rows = new Float32Array(n * n * 12),
    s = 0.042 ** 2;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      // (plain, as the ring's canvas is: render/floor.mjs)
      const x = centre[0] - half + (i + 0.5) * gap,
        z = centre[1] - half + (j + 0.5) * gap;
      rows.set([x, 0, z, s, 0, 0, 1e-6, 0, s, 24, 0, 3], k);
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
    // (a struck man in white, as the blow was drawn before: only the effect cards' "now" draws it)
    white = paletteArray(manifest.palette.map(() => 0xffffff)),
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
        ripples: [null, null],
        whites: [0, 0],
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
    // (and on any other card, what a blow throws off each man as the game draws it, kept off his own silhouette)
    cell.motes = scene ? [] : [0, 1].map(() => {
      const m = createFx();
      return { fx: m, mesh: R.mesh(m.rows, 0, true) };
    });
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
    cell.ripples = [null, null];
    cell.whites = [0, 0];
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
      cell.whites = cell.whites.map(w => Math.max(0, w - DT));
      for (const e of bout.events) {
        const by = e.type === 'parry' ? e.on : e.who;
        if (by === 1 && SAID[e.type]) tell(cell, e.down && e.type !== 'parry' ? (e.out ? '실신' : '다운') : e.roll ? '굴림' : e.type === 'parry' && e.down ? '눌러 내림' : SAID[e.type], e.J);
        if (e.who === 0 && ['hit', 'block', 'whiff', 'graze'].includes(e.type) && e.J !== undefined) (m.own = m.own.concat(Math.round(e.J)).slice(-3)), put(cell, 'own', m.own.join(' · '));
        if (cell.scene) blowFx(cell, e);
        else struck(cell, e, bout.fighters);
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
  // the blow, as the game draws it (render/blow.mjs): sparks off the far side of what it struck, a ripple, the picture shaken
  function struck(cell, e, men) {
    if (e.type === 'hit') {
      const k = Math.min(1.6, e.J / 85);
      blow(cell.motes[e.on].fx, e, men[e.on]);
      cell.ripples[e.on] = rippleOf(e, men[e.on]);
      cell.shake = e.down ? 5 : 1 + 2.5 * k;
    } else if (cell.guard) {
      // (a card drawn in a defence style of its own, card.fx: render/guard.mjs; the screen's white is the card's own, white)
      const d = cell.guard.meet(e, men, cell.fx, cell.motes.map(m => m.fx));
      if (d.ripple) cell.ripples[d.ripple.on] = d.ripple.ripple;
      if (e.type === 'block' || e.type === 'parry') cell.shake = e.type === 'parry' ? 2 : 1;
    } else if (e.type === 'block') (met(cell.fx, e), (cell.shake = 1));
    else if (e.type === 'parry') (met(cell.fx, e), (cell.shake = 2));
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
        cell.whites[e.on] = 0.07;
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

  /* ---- the recorded cards. A clip as it is played: each kept frame a step as replay.mjs keeps one ({ men: [{ pose, place,
     x, z, yaw, points }] }), his points worked out from his pose the way the bout does (game/bout.mjs: the middle of each glove
     7.5 cm on past the wrist, the head 10 cm on past the neck, the elbows, the shoulders and the trunk); each frame's blows; and
     where the camera looks in each frame (the middle of the two men, or a man's head, steadied over nine frames). */
  const FIELDS = NAMES.length * 4 + 14;
  const qmat = (d, k) => {
    const x = d[k] / 32767,
      y = d[k + 1] / 32767,
      z = d[k + 2] / 32767,
      w = d[k + 3] / 32767,
      l = Math.hypot(x, y, z, w) || 1,
      [a, b, c, e] = [x / l, y / l, z / l, w / l];
    return [1 - 2 * (b * b + c * c), 2 * (a * b - c * e), 2 * (a * c + b * e), 2 * (a * b + c * e), 1 - 2 * (a * a + c * c), 2 * (b * c - a * e), 2 * (a * c - b * e), 2 * (b * c + a * e), 1 - 2 * (a * a + b * b)];
  };
  const beyond = (a, b, far) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      l = Math.hypot(...d) || 1;
    return [b[0] + (d[0] * far) / l, b[1] + (d[1] * far) / l, b[2] + (d[2] * far) / l];
  };
  function man(d, k) {
    const rot = {};
    NAMES.forEach((n, i) => (rot[n] = qmat(d, k + 4 * i)));
    k += NAMES.length * 4;
    const pose = { rot, root: [d[k] / 1000, d[k + 1] / 1000, d[k + 2] / 1000], stretch: d[k + 3] / 10000 },
      place = { R: qmat(d, k + 4), p: [d[k + 8] / 1000, d[k + 9] / 1000, d[k + 10] / 1000] };
    pose.at = fk(pose).p;
    const at = n => toWorld(place, pose.at[n], pose.stretch);
    return {
      pose,
      place,
      x: d[k + 11] / 1000,
      z: d[k + 12] / 1000,
      yaw: d[k + 13] / 10000,
      points: { L: beyond(at('LeftForeArm'), at('LeftHand'), 0.075), R: beyond(at('RightForeArm'), at('RightHand'), 0.075), head: beyond(at('Neck1'), at('Head'), 0.1), LE: at('LeftForeArm'), RE: at('RightForeArm'), LS: at('LeftArm'), RS: at('RightArm'), ...trunk(at) }
    };
  }
  function decode(mod, card) {
    const bin = atob(mod.MEN),
      bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const d = new Int16Array(bytes.buffer),
      frames = [];
    for (let i = 0; i < mod.FRAMES; i++) frames.push({ men: [man(d, i * 2 * FIELDS), man(d, (i * 2 + 1) * FIELDS)], events: [] });
    for (const [i, e] of mod.EVENTS) frames[i].events.push(e);
    // (where the camera looks, frame by frame, steadied)
    const cam = card.cam || {},
      raw = frames.map(({ men }) => (cam.on === 'head0' || cam.on === 'head1' ? men[+cam.on[4]].points.head.slice() : cam.on === 'man0' || cam.on === 'man1' ? [men[+cam.on[3]].x, cam.y ?? 0.85, men[+cam.on[3]].z] : [(men[0].x + men[1].x) / 2, cam.y ?? 0.85, (men[0].z + men[1].z) / 2])),
      look = raw.map((_, i) => {
        const near = raw.slice(Math.max(0, i - 4), i + 5);
        return [0, 1, 2].map(j => near.reduce((s, p) => s + p[j], 0) / near.length);
      });
    if (cam.y !== undefined && cam.on && cam.on.startsWith('head')) look.forEach(p => (p[1] += cam.y));
    return { frames, look };
  }
  function makeReel(cards) {
    const cells = cards.map(({ card, el }) => {
      const cell = {
        card,
        el,
        rec: true,
        id: card.clip,
        made: CLIPS_MADE[card.clip],
        s: card.slow || 1,
        stage: q(el, '.stage'),
        tag: q(el, '[data-tag]'),
        out: { across: q(el, '[data-across]') },
        // (the screen's white flash at a parry, where the card draws it: as the game does, main.mjs)
        flash: q(el, '[data-white]'),
        whiteAt: null, // (the frame of the parry it is flashing for)
        bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
        ripples: [null, null],
        shake: 0,
        cam: { target: [0, 0.85, 0], yaw: (card.cam && card.cam.yaw) ?? 0.6, pitch: (card.cam && card.cam.pitch) ?? 0.25, dist: 3.3 },
        at: 0, // where it is now, in frames (fractional)
        seen: -1, // the last frame whose blows have been thrown
        men: null,
        data: null,
        // (a card in a defence style of its own: render/guard.mjs, which sees every frame; its brilliant slow, warp)
        guard: card.fx ? createGuard(styleOf(card.fx)) : null,
        warp: null,
        pace: 1
      };
      cell.fx = createFx();
      cell.mesh = R.mesh(cell.fx.rows, 0, true);
      cell.motes = [0, 1].map(() => {
        const m = createFx();
        return { fx: m, mesh: R.mesh(m.rows, 0, true) };
      });
      return cell;
    });
    return { cells, u: 0, state: 'idle' };
  }
  const reels = REELS.map(makeReel);
  const HOLD = 0.6; // seconds a comparison holds its last frame before all of it starts again
  function load(reel) {
    reel.state = 'loading';
    return (reel.ready = Promise.all(reel.cells.map(cell => LOAD[cell.id]().then(mod => (cell.data = decode(mod, cell.card)))))
      .then(() => {
        // (how long one play of each is, at its speed; the comparison goes round once in the longest of them)
        for (const cell of reel.cells) (cell.n = cell.data.frames.length), (cell.warp = cell.guard && warpOf(cell.guard.style, cell.data.frames)), (cell.span = cell.warp ? cell.warp.span / cell.s : cell.n / 60 / cell.s);
        reel.play = Math.max(...reel.cells.map(c => c.span));
        for (const cell of reel.cells) (cell.loops = Math.max(1, Math.round(reel.play / cell.span))), across(cell);
        reel.state = 'ready';
        seek(reel, 0);
      })
      .catch(error => {
        reel.state = 'failed';
        console.error('pending: a clip', error);
        for (const cell of reel.cells) cell.tag && (cell.tag.textContent = '못 불러옴');
      }));
  }
  /* (the shrug seen from the card's camera: how far apart the gloves are across the picture at the most, the camera's own
     right, as the recording has them) */
  function across(cell) {
    if (!cell.out.across) return;
    const yaw = cell.cam.yaw,
      X = [Math.cos(yaw), 0, -Math.sin(yaw)];
    let most = 0;
    for (const { men } of cell.data.frames) {
      const { L, R: Rg } = men[0].points;
      most = Math.max(most, Math.abs((L[0] - Rg[0]) * X[0] + (L[2] - Rg[2]) * X[2]));
    }
    cell.across = most * 100;
    cell.out.across.textContent = most ? (most * 100).toFixed(1) : '–';
  }
  // where a card of the comparison is when the comparison is u seconds in: a slow card once round, a full speed one as often
  // as goes into the same time, and each on its last frame for the moment held at the end
  const frameAt = (reel, cell, u) => (u >= reel.play ? cell.n - 1 : cell.warp ? Math.min(cell.n - 1, cell.warp.at((u * cell.s) % (cell.loops > 1 ? cell.warp.span : Infinity))) : Math.min(cell.n - 1, ((u * 60 * cell.s) % (cell.loops > 1 ? cell.n : Infinity))));
  function seek(reel, u) {
    reel.u = u;
    for (const cell of reel.cells) {
      const at = frameAt(reel, cell, u),
        i = Math.floor(at);
      // (the blows of the frames it has come to since it was last asked, thrown as it comes to them; gone round: from the start)
      if (i < cell.seen) (cell.seen = -1), (cell.whiteAt = null), cell.guard && (cell.guard = createGuard(cell.guard.style));
      if (cell.warp) cell.pace = u >= reel.play ? 1 : cell.warp.pace((u * cell.s) % (cell.loops > 1 ? cell.warp.span : Infinity));
      for (let k = cell.seen + 1; k <= i; k++) {
        if (cell.guard) cell.guard.see(cell.data.frames[k].men);
        if (!cell.data.frames[k].events.length) continue;
        // (the men as they were on that frame: what the blow throws off comes off them as they were then)
        cell.men = cell.men || cell.data.frames[k].men.map(m => Object.assign({}, m));
        cell.data.frames[k].men.forEach((m, n) => Object.assign(cell.men[n], m));
        for (const e of cell.data.frames[k].events) clipBlow(cell, e, k);
      }
      cell.seen = i;
      cell.at = at;
    }
  }
  function clipBlow(cell, e, k) {
    const by = e.type === 'parry' ? e.on : e.who;
    if (SAID[e.type] && by !== undefined) tell(cell, e.down && e.type !== 'parry' ? (e.out ? '실신' : '다운') : e.roll ? '굴림' : SAID[e.type]);
    struck(cell, e, cell.men);
    if (e.type === 'parry' && cell.flash) cell.whiteAt = k;
  }
  function stepReel(reel, elapsed) {
    let u = reel.u + elapsed;
    if (u >= reel.play + HOLD) {
      u = 0;
      for (const cell of reel.cells) (cell.seen = -1), (cell.ripples = [null, null]), (cell.whiteAt = null), cell.guard && (cell.guard = createGuard(cell.guard.style));
    }
    const before = reel.cells.map(c => c.at);
    seek(reel, u);
    // (the picture shaken by a blow settles as the frames go by, as it does on a live card a step at a time)
    reel.cells.forEach((c, i) => (c.shake *= 0.82 ** Math.max(0, (c.at - before[i] + c.n) % c.n)));
  }
  // a recorded card's picture: the two men k of the way from one kept frame to the next, the camera on them as the card says
  function drawReel(cell, box, dpr, grid, elapsed) {
    const { frames, look } = cell.data,
      i = Math.floor(cell.at),
      k = cell.at - i,
      j = Math.min(cell.n - 1, i + 1),
      snap = blend(frames[i], frames[j], k);
    cell.men = cell.men || snap.men.map(m => Object.assign({}, m));
    snap.men.forEach((m, n) => Object.assign(cell.men[n], m));
    const cam = cell.card.cam || {};
    cell.cam.target = look[i].map((x, n) => x + (look[j][n] - x) * k);
    // (the white over the picture, from the parry's frame on going as the game's goes: e^-16 a second of the bout's time)
    if (cell.flash) {
      const white = cell.whiteAt === null || cell.at < cell.whiteAt ? 0 : cell.card.white * Math.exp((-16 * (cell.at - cell.whiteAt)) / 60);
      cell.flash.style.opacity = white > 0.02 ? white.toFixed(3) : '0';
    }
    draw(cell, box, dpr, grid, elapsed * cell.s * cell.pace, cam.dist);
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
    for (const reel of reels) {
      const boxes = reel.cells.map(c => c.stage.getBoundingClientRect());
      // (its frames fetched once it is within a screen of being seen)
      if (reel.state === 'idle' && boxes.some(b => b.bottom > -innerHeight && b.top < 2 * innerHeight)) load(reel);
      if (reel.state !== 'ready' || !boxes.some(onScreen)) continue;
      stepReel(reel, elapsed);
      reel.cells.forEach((cell, i) => onScreen(boxes[i]) && drawReel(cell, boxes[i], dpr, grid, elapsed));
    }
    R.end({ hall: ground, ink });
    requestAnimationFrame(frame);
  }
  // a card's picture as its bout stands, what is in the air moved on by `elapsed` seconds
  function draw(cell, box, dpr, grid, elapsed, fixed) {
    const [a, b] = cell.rec ? cell.men : cell.bout.fighters,
      layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5 }],
      shadows = [];
    [a, b].forEach((f, i) => {
      R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
      shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
    });
    cell.mesh.update(cell.fx.rows, cell.fx.update(elapsed, shadows, 22));
    const rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) },
      ease = 1 - Math.exp(-elapsed * 4),
      clock = cell.rec ? cell.at / 60 : cell.t,
      jolt = cell.shake > 0.3 ? [Math.sin(clock * 97) * cell.shake, Math.cos(clock * 83) * cell.shake * 0.6] : null;
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
        { mesh: meshes.boxer, bones: cell.bones[0], palette: cell.whites[0] > 0 ? white : palettes[0], mask: 1, wave: waves[0], silhouette: 1 },
        { mesh: meshes.boxer, bones: cell.bones[1], palette: cell.whites[1] > 0 ? white : palettes[1], mask: 1, wave: waves[1], silhouette: 2 },
        // (the spray off each man is never seen over him: where it crosses his own outline it is not there)
        ...cell.sprays.map((s, i) => ({ mesh: s.mesh, palette: palettes[0], mask: 0.6, outside: i + 1 }))
      );
      // framed on the man who is hit, a little behind him: the room is on the far side of him, for what the blow throws off
      const [hit, other] = cell.scene.struck ? [b, a] : [a, b];
      cell.cam.target[0] += (hit.x * 1.45 - other.x * 0.45 - cell.cam.target[0]) * ease;
      cell.cam.target[2] += (hit.z * 1.45 - other.z * 0.45 - cell.cam.target[2]) * ease;
    } else {
      for (const m of cell.motes) m.mesh.update(m.fx.rows, m.fx.update(elapsed));
      const ripples = [a, b].map((f, i) => {
        const r = cell.ripples[i];
        if (!r) return null;
        r.age += elapsed;
        return rippleRow(r, f) || (cell.ripples[i] = null);
      });
      layers.push(
        { mesh: cell.mesh, palette: palettes[0], mask: 0.6 },
        { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1, wave: ripples[0], silhouette: 1 },
        { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, wave: ripples[1], silhouette: 2 },
        ...cell.motes.map((m, i) => ({ mesh: m.mesh, palette: palettes[0], mask: 0.6, outside: i + 1 }))
      );
      // (an exchange is framed on the two of them, close; footwork on the boxer whose feet these are; a recorded card where it
      // says, its target already set)
      const mine = cell.exchange ? 0.5 : 0.6;
      if (!cell.rec) {
        cell.cam.target[0] += (a.x * mine + b.x * (1 - mine) - cell.cam.target[0]) * ease;
        cell.cam.target[2] += (a.z * mine + b.z * (1 - mine) - cell.cam.target[2]) * ease;
      }
      // far enough back that both men are in the picture from the feet up, whatever shape the window is (or as near as it says)
      const [near, wide] = cell.rec ? [3.3, 2.5] : cell.entry.level ? [3.4, 2.1] : cell.exchange ? [3.3, 2.5] : [5.2, 3.6];
      cell.cam.dist = fixed || Math.max(near, wide / (2 * Math.tan((19 * Math.PI) / 180) * (rect.w / rect.h)));
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
    reels,
    // (the recorded cards: all of them loaded now, and a comparison put at u seconds into its play)
    loadAll: () => Promise.all(reels.map(r => (r.state === 'idle' ? load(r) : r.ready))),
    seek: (u, within) => reels.filter(r => r.state === 'ready' && (!within || r.cells.some(c => within.contains(c.el)))).forEach(r => {
      for (const c of r.cells) (c.seen = -1), (c.ripples = [null, null]), (c.whiteAt = null), c.guard && (c.guard = createGuard(c.guard.style));
      seek(r, u);
    }),
    renderer: R,
    hold: false,
    advance: (sec, within) =>
      clocks
        .filter(clock => !within || clock.cells.some(cell => within.contains(cell.el)))
        .forEach(clock => {
          for (let i = 0; i < Math.round(sec / DT); i++) {
            stepClock(clock);
            for (const cell of clock.cells) (cell.fx.update(DT, [], 22), cell.sprays.forEach(sp => sp.fx.update(DT)), cell.motes.forEach(m => m.fx.update(DT)), cell.waves.forEach(wv => wv && (wv.age += DT)), cell.ripples.forEach(r => r && (r.age += DT)));
          }
        })
  };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

// (the bouts once the page that holds their cards is written)
Promise.all([load(), written]).then(([assets]) => start(assets)).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});

/* The open-questions catalogue (open.html; docs/open-catalog.md): every decision still open, written from src/open.data.mjs.
   Each card: where it stands, the builds side by side (the recorded videos of src/open.clips.mjs on one clock, or the old
   catalogue's own cards, lent by src/pending.mjs onto the canvas behind the page), the choices, a follow-up opened on the
   same card by a choice, a memo. A pick or a keystroke is saved at once: the artifact's db document picks/open
   ({ picks, notes, log, sent, at }); with no store, this browser only (and the page says so). 제출 sends the answers as text
   (answersText) to the session watching the page (a comment sent to Claude) or to a new session (the Claude Code Remote
   connector's create_session), one after the other, and copies them when neither can take them; each try is logged in
   the document (sent). */
import { GROUPS, CARDS, QUESTIONS, DECIDED_LIST, STORE, SEND, MODELS, EFFORTS, question, live, counts, starRest, answersText } from './open.data.mjs';
import { GROUPS as CLIPS } from './open.clips.mjs';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// the data's own marks: `code` and **strong**
const fmt = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const NO = ['', '1', '2', '3', '4', '5', '6', '7'];

/* ---- the page, written from the data */
function optsHtml(q) {
  if (!q.opts.length) return '';
  if (q.multi) return `<div class="chips" role="group" aria-label="${esc(q.id)} 고르기">${q.opts.map(([v, l]) => `<button type="button" class="chip" data-k="${esc(q.id)}" data-v="${esc(v)}" data-multi="1" aria-pressed="false">${esc(l)}</button>`).join('')}</div>`;
  return `<div class="opts" role="group" aria-label="${esc(q.id)} 고르기">${q.opts
    .map(([v, l, sub]) => {
      const star = v === q.star ? ' <i>★</i>' : '',
        key = v.length <= 2 ? esc(v) : '';
      return `<button type="button" class="opt" data-k="${esc(q.id)}" data-v="${esc(v)}" aria-pressed="false"><span class="k">${key}${star}</span><span class="l">${fmt(l)}</span>${sub ? `<small>${fmt(sub)}</small>` : ''}</button>`;
    })
    .join('')}</div>`;
}
const memoHtml = (id) => `<label class="memo"><span>메모 · ${esc(id)}</span><textarea data-k="${esc(id)}" rows="2" maxlength="2000" placeholder="쓰면 저장됩니다"></textarea></label>`;
function followHtml(c) {
  return QUESTIONS.filter((q) => q.parent === c.id)
    .map((f) => `<div class="follow" data-q="${esc(f.id)}" hidden><h3>${fmt(f.title)}</h3>${f.note ? `<p class="note">${fmt(f.note)}</p>` : ''}${optsHtml(f)}${f.memo ? memoHtml(f.id) : ''}</div>`)
    .join('');
}
const tableHtml = (t) => `<div class="tablebox"><table><thead><tr>${t.head.map((h) => `<th>${fmt(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((d, i) => (i ? `<td>${fmt(d)}</td>` : `<th>${fmt(d)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
// (a card's folded text: the old catalogue's whole item { state, tables, notes, refs }, or a line of this page's own — the
// audit's cause, cost and repro)
function moreHtml(m) {
  if (!m) return '';
  if (typeof m === 'string') return `<details class="more"><summary>자세히 (원인 · 고치는 데 · 재현)</summary><div><p>${fmt(m)}</p></div></details>`;
  const body = [m.state ? `<p>${fmt(m.state)}</p>` : '', ...(m.tables || []).map(tableHtml), ...(m.notes || []).map((n) => `<p>${fmt(n)}</p>`), (m.refs || []).length ? `<p>${m.refs.map((r) => `<a href="${esc(r.href)}" target="_blank" rel="noopener">${fmt(r.say)} ↗</a>`).join(' · ')}</p>` : ''].join('');
  return `<details class="more"><summary>자세히 (옛 카탈로그의 글 그대로)</summary><div>${body}</div></details>`;
}
// a group of recorded comparisons: the clips at one width, a scrub, the controls; or a box saying it is still to be recorded
function cmpHtml(key) {
  const g = CLIPS[key];
  if (!g || !g.clips || !g.clips.length)
    return `<div class="cmp" data-cmp="${esc(key)}"><div class="wait"><b>녹화 대기</b>${g ? fmt(g.say) : esc(key)}</div></div>`;
  const n = g.clips.length,
    ratio = g.w && g.h ? ` style="aspect-ratio:${g.w} / ${g.h}"` : '';
  return `<div class="cmp" data-cmp="${esc(key)}"><p class="cmp-say">${fmt(g.say)}${g.scene ? ` · ${fmt(g.scene)}` : ''}</p>
    <div class="cmp-grid${n === 3 ? ' n3' : ''}">${g.clips
      .map((c) => `<figure class="clip" data-id="${esc(c.id)}"><figcaption class="who">${fmt(c.say)}</figcaption><video muted playsinline preload="none" data-src="${esc(c.file)}"${c.poster ? ` poster="${esc(c.poster)}"` : ''}${ratio} aria-label="${esc(c.say)}"></video>${c.measure ? `<p class="measure">${fmt(c.measure)}</p>` : ''}</figure>`)
      .join('')}</div>
    <input class="scrub" type="range" min="0" max="${Math.max(0, (g.frames || 1) - 1)}" step="1" value="0" aria-label="프레임">
    <div class="ctl"><button type="button" data-view="all" aria-pressed="true">나란히</button>${g.clips.map((c) => `<button type="button" data-view="${esc(c.id)}" aria-pressed="false">${esc(String(c.say).split(' · ')[0])} 크게</button>`).join('')}<button type="button" data-step="-1" aria-label="한 프레임 뒤로">◀</button><button type="button" data-step="1" aria-label="한 프레임 앞으로">▶</button><button type="button" data-rate="1" aria-pressed="true">1×</button><button type="button" data-rate="0.5" aria-pressed="false">½×</button><button type="button" data-rate="0.25" aria-pressed="false">¼×</button><span class="fr"></span></div></div>`;
}
// the old catalogue's cards (src/pending.mjs lends them into the slot), with the old player's own controls
const oldHtml = (id) => `<div class="old" data-old="${esc(id)}"><div data-pending-cards="${esc(id)}"></div>
  <div class="ctl"><button type="button" data-wide aria-pressed="false">크게</button><button type="button" data-old-step="-1" aria-label="한 프레임 뒤로 (녹화 카드만)">◀</button><button type="button" data-old-step="1" aria-label="한 프레임 앞으로">▶</button><button type="button" data-speed="1" aria-pressed="true">1×</button><button type="button" data-speed="0.5" aria-pressed="false">½×</button><button type="button" data-speed="0.25" aria-pressed="false">¼×</button><span class="fr">옛 카탈로그의 카드 · 속도는 옛 카드 모두에</span></div></div>`;
function cardHtml(c) {
  const tag = c.old ? '옛 카탈로그에서' : c.kind === 'note' ? '알림' : '';
  const head = `<div class="head"><code class="num">${esc(c.id)}</code>${tag ? `<span class="tag">${tag}</span>` : ''}</div><h2>${fmt(c.title)}</h2>`,
    state = `<div class="state">${c.state ? `<p>${fmt(c.state)}</p>` : ''}${c.list ? `<ul>${c.list.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>` : ''}</div>`,
    links = c.links ? `<p class="links">${c.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${fmt(l.say)} ↗</a>`).join('')}</p>` : '';
  if (c.kind === 'note') return `<section class="item note" id="i-${esc(c.id)}">${head}${state}${links}</section>`;
  const q = question(c.id),
    why = q.opts.length ? `<p class="why">${q.star ? `<i>★</i> ${esc((q.opts.find((o) => o[0] === q.star) || [])[1] || q.star)}` : '★ 없음'}${c.why ? ` — ${fmt(c.why)}` : ''}</p>` : '';
  return `<section class="item" id="i-${esc(c.id)}" data-card="${esc(c.id)}"><div class="band"><b>답</b><span></span></div>${head}${state}${links}${c.clips ? cmpHtml(c.clips) : ''}${c.old ? oldHtml(c.id) : ''}${moreHtml(c.more)}<div class="q">${optsHtml(q)}${why}${followHtml(c)}${q.memo ? memoHtml(q.id) : ''}</div></section>`;
}
const hasStars = (g) => QUESTIONS.some((q) => q.star && CARDS.find((c) => c.id === q.card).group === g);
$('#items').outerHTML = GROUPS.map((g, i) => {
  const cs = CARDS.filter((c) => c.group === g.id);
  return `<div class="group" id="g-${g.id}"><h2><span class="no">${NO[i + 1]}</span>${esc(g.title)}</h2>${hasStars(g.id) ? `<button type="button" class="stars" data-stars="${g.id}">이 묶음의 남은 것을 모두 ★로</button>` : ''}</div>${g.note ? `<p class="groupnote">${g.note}</p>` : ''}${cs.map(cardHtml).join('')}`;
}).join('');
$('#decided').innerHTML = `<summary>정해진 것 (${DECIDED_LIST.length})</summary><ul>${DECIDED_LIST.map((d) => `<li><b>${fmt(d.title)}</b> — ${fmt(d.said)} <span>· ${esc(d.at)} · ${d.how === 'chat' ? '대화로' : d.how === 'db' ? '옛 페이지에서' : '권장대로 만듦'}</span></li>`).join('')}</ul>`;
function toc() {
  const picks = state.picks;
  $('#toc').innerHTML = GROUPS.map((g) => {
    const top = QUESTIONS.filter((q) => !q.parent && q.opts.length && CARDS.find((c) => c.id === q.card).group === g.id);
    return `<a href="#g-${g.id}">${esc(g.title)}<span>${top.length ? `${top.filter((q) => picks[q.id]).length}/${top.length}` : '메모'}</span></a>`;
  }).join('');
}

/* ---- the recorded comparisons: each group on its own clock (the page's, so they play with reduced motion on); a
   moment held on the last frame, then all of them from the start together; only a group near the screen loads or plays */
let playing = true;
const players = [];
const HOLD = 0.6;
for (const root of document.querySelectorAll('.cmp')) {
  const g = CLIPS[root.dataset.cmp],
    vids = [...root.querySelectorAll('video')];
  if (!vids.length) continue;
  const p = { root, g, vids, t: 0, rate: 1, near: false, fps: g.fps || 20, dur: g.frames && g.fps ? g.frames / g.fps : 0, scrub: $('.scrub', root), fr: $('.fr', root) };
  p.frames = () => g.frames || Math.max(1, Math.round(p.dur * p.fps));
  p.load = () => {
    for (const v of vids)
      if (!v.src) {
        v.preload = 'auto';
        v.src = v.dataset.src;
        v.addEventListener('loadedmetadata', () => {
          if (!g.frames && vids.every((x) => x.duration > 0)) (p.dur = Math.min(...vids.map((x) => x.duration))), (p.scrub.max = String(p.frames() - 1));
        });
      }
  };
  p.show = () => {
    const i = Math.min(p.frames() - 1, Math.floor(Math.min(p.t, p.dur) * p.fps));
    p.scrub.value = String(i);
    p.fr.textContent = `${(i / p.fps).toFixed(2)} s · ${String(i + 1).padStart(3, '0')} / ${p.frames()}`;
  };
  // (every clip kept on the group's clock: played at the group's rate and put back when it drifts, or held still on the frame)
  p.sync = (run) => {
    const at = Math.min(p.t, Math.max(0, p.dur - 0.5 / p.fps));
    for (const v of vids) {
      if (!(v.readyState >= 1)) continue;
      if (run && p.t < p.dur) {
        if (v.playbackRate !== p.rate) v.playbackRate = p.rate;
        if (Math.abs(v.currentTime - at) > 0.12) v.currentTime = at;
        if (v.paused) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - at) > 0.02) v.currentTime = at;
      }
    }
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.view) {
      $('.cmp-grid', root).classList.toggle('solo', b.dataset.view !== 'all');
      for (const f of root.querySelectorAll('.clip')) f.classList.toggle('on', f.dataset.id === b.dataset.view);
      for (const x of root.querySelectorAll('[data-view]')) x.setAttribute('aria-pressed', String(x === b));
    }
    if (b.dataset.step) {
      setPlaying(false);
      const n = p.frames(),
        i = (Math.min(n - 1, Math.floor(p.t * p.fps)) + Number(b.dataset.step) + n) % n;
      p.t = (i + 0.5) / p.fps;
      p.sync(false);
      p.show();
    }
    if (b.dataset.rate) {
      p.rate = Number(b.dataset.rate);
      for (const x of root.querySelectorAll('[data-rate]')) x.setAttribute('aria-pressed', String(x === b));
    }
  });
  p.scrub.addEventListener('input', () => {
    setPlaying(false);
    p.t = (Number(p.scrub.value) + 0.5) / p.fps;
    p.sync(false);
    p.show();
  });
  players.push(p);
}
try {
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const p = players.find((x) => x.root === e.target);
      if (p) (p.near = e.isIntersecting), p.near && p.load();
    }
  }, { rootMargin: '600px' });
  for (const p of players) io.observe(p.root);
} catch (err) {
  for (const p of players) (p.near = true), p.load();
}
let last = 0;
(function loop(now) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now || 0;
  for (const p of players) {
    if (!p.near || !p.dur) continue;
    if (playing) {
      p.t += dt * p.rate;
      if (p.t >= p.dur + HOLD) (p.t = 0), p.vids.forEach((v) => v.readyState >= 1 && (v.currentTime = 0));
    }
    p.sync(playing);
    p.show();
  }
  requestAnimationFrame(loop);
})();
function setPlaying(v) {
  playing = v;
  const b = $('#play');
  b.setAttribute('aria-pressed', String(v));
  b.textContent = v ? '❚❚ 모두 멈춤' : '▶ 모두 재생';
  if (globalThis.__pending) globalThis.__pending.hold = !v;
}
$('#play').addEventListener('click', () => setPlaying(!playing));

/* ---- the old catalogue's cards: lent by src/pending.mjs (loaded only when this page has a slot for them); its own speed
   buttons (data-speed, for all its cards), a frame on (its bouts are stepped; its recordings sought), and 크게 */
if (document.querySelector('[data-pending-cards]')) {
  import('./pending.mjs').catch((err) => console.error('open: the old cards', err));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.old button');
    if (!b) return;
    const box = b.closest('.old');
    if (b.hasAttribute('data-wide')) {
      const on = !box.classList.contains('wide');
      box.classList.toggle('wide', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const P = globalThis.__pending;
    if (b.dataset.oldStep && P) {
      setPlaying(false);
      const dir = Number(b.dataset.oldStep),
        reels = P.reels.filter((r) => r.state === 'ready' && r.cells.some((c) => box.contains(c.el)));
      if (reels.length) P.seek(Math.max(0, reels[0].u + dir / 60), box);
      if (dir > 0) P.advance(1 / 60, box);
    }
  });
}

/* ---- the answers: picks/open in this artifact's db; without a store, this browser only */
const state = { picks: {}, notes: {}, log: [], sent: [] };
let store = null,
  canWrite = true,
  saving = false,
  dirty = false;
const hhmm = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
function saveState(text, cls) {
  const e = $('#save');
  e.textContent = text;
  e.className = 'save' + (cls ? ' ' + cls : '');
}
const values = (k) => (state.picks[k] ? String(state.picks[k]).split(',').filter(Boolean) : []);
function refresh() {
  const { picks, notes } = state,
    ro = !!store && !canWrite;
  for (const b of document.querySelectorAll('[data-k][data-v]')) {
    const k = b.dataset.k,
      on = b.dataset.multi ? values(k).includes(b.dataset.v) : picks[k] === b.dataset.v;
    b.setAttribute('aria-pressed', String(on));
    b.disabled = ro || !live(k, picks);
  }
  for (const f of document.querySelectorAll('.follow')) f.hidden = !live(f.dataset.q, picks);
  for (const t of document.querySelectorAll('.memo textarea')) {
    const v = notes[t.dataset.k] || '';
    if (document.activeElement !== t && t.value !== v) t.value = v;
    t.disabled = ro;
    t.closest('.memo').classList.toggle('has', !!v);
  }
  // (a card whose open questions with choices are all answered shows its answer in a green band)
  for (const el of document.querySelectorAll('.item[data-card]')) {
    const qs = QUESTIONS.filter((q) => q.card === el.dataset.card && q.opts.length && live(q.id, picks)),
      done = qs.length && qs.every((q) => picks[q.id]);
    el.classList.toggle('answered', !!done);
    if (done) $('.band span', el).textContent = qs.map((q) => `${q.id} ${picks[q.id]}`).join(' · ');
  }
  for (const b of document.querySelectorAll('[data-stars]')) {
    const next = starRest(b.dataset.stars, picks);
    b.disabled = ro || Object.keys(next).length === Object.keys(picks).length;
  }
  const n = counts(picks, notes);
  $('#sum').innerHTML = `고른 것 <b>${n.picked} / ${n.of}</b>${n.follow ? ` · 다음 질문 <b>${n.follow}</b>` : ''} · 메모 <b>${n.memos}</b>` + (n.picked || n.memos ? '' : ' — 누르거나 쓰면 저장됩니다');
  toc();
}
async function persist() {
  if (!store) {
    try {
      localStorage.setItem(STORE.local, JSON.stringify(state));
      saveState('이 기기에만 기억됨 (저장소 없음) — ‘제출’이나 ‘답 복사’로 보내 주세요', 'warn');
    } catch (err) {
      saveState('저장할 곳이 없음 — ‘제출’이나 ‘답 복사’로 보내 주세요', 'warn');
    }
    return;
  }
  if (saving) return void (dirty = true);
  saving = true;
  dirty = false;
  saveState('저장 중…');
  const body = { picks: { ...state.picks }, notes: { ...state.notes }, log: state.log.slice(-120), sent: state.sent.slice(-20), at: new Date().toISOString() };
  try {
    await store.doc(STORE.doc).set(body);
    saveState('저장됨 · ' + hhmm(body.at), 'ok');
  } catch (e) {
    saveState('저장 실패 (' + ((e && e.code) || '오류') + ') — ‘제출’이나 ‘답 복사’로 보내 주세요', 'warn');
  }
  saving = false;
  if (dirty) persist();
}
const stamp = () => new Date().toISOString();
document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-stars]');
  if (s && !s.disabled) {
    const before = state.picks;
    state.picks = starRest(s.dataset.stars, state.picks);
    const added = Object.keys(state.picks).filter((k) => !(k in before));
    state.log.push({ k: 'stars', v: `${s.dataset.stars}: ${added.join(' ')}`, at: stamp() });
    refresh();
    persist();
    return;
  }
  const b = e.target.closest('[data-k][data-v]');
  if (!b || b.disabled) return;
  const k = b.dataset.k,
    v = b.dataset.v;
  if (b.dataset.multi) {
    const set = new Set(values(k));
    set.has(v) ? set.delete(v) : set.add(v);
    const ord = question(k).opts.map((o) => o[0]).filter((x) => set.has(x));
    if (ord.length) state.picks[k] = ord.join(',');
    else delete state.picks[k];
  } else if (state.picks[k] === v) delete state.picks[k];
  else state.picks[k] = v;
  state.log.push({ k, v: state.picks[k] || null, at: stamp() });
  refresh();
  persist();
});
let memoTimer = 0;
function memoSet(t) {
  const k = t.dataset.k,
    v = t.value.trim().slice(0, 2000);
  if ((state.notes[k] || '') === v) return;
  if (v) state.notes[k] = v;
  else delete state.notes[k];
  state.log.push({ k, memo: v.slice(0, 80), at: stamp() });
  refresh();
  persist();
}
document.addEventListener('input', (e) => {
  const t = e.target.closest && e.target.closest('.memo textarea');
  if (!t) return;
  clearTimeout(memoTimer);
  saveState('메모 쓰는 중…');
  memoTimer = setTimeout(() => memoSet(t), 700);
});
document.addEventListener('focusout', (e) => {
  const t = e.target.closest && e.target.closest('.memo textarea');
  if (t) clearTimeout(memoTimer), memoSet(t);
});

/* ---- 제출: where it goes is chosen before the press, and whether it can take the answers is shown under the button (read at
   load without asking anything: comments.canSendToClaude, mcp.listTools); one press tries the chosen place, then the other
   when the first cannot run here, then copies the answers; every try is written to the document (sent). The answers are
   saved first: the db is the record either way. */
const sendTo = $('#send-to'),
  mSel = $('#send-model'),
  eSel = $('#send-effort'),
  sendBtn = $('#send'),
  out = $('#send-out'),
  PREF = STORE.local + '.send';
mSel.innerHTML = MODELS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
eSel.innerHTML = EFFORTS.map((v) => `<option value="${v}">effort ${v}</option>`).join('');
sendTo.value = 'here';
mSel.value = MODELS[0][0];
eSel.value = 'high';
try {
  const pr = JSON.parse(localStorage.getItem(PREF) || '{}');
  if (pr.to) sendTo.value = pr.to;
  if (pr.model) mSel.value = pr.model;
  if (pr.effort) eSel.value = pr.effort;
} catch (err) {
  /* no storage */
}
if (!mSel.value) mSel.value = MODELS[0][0];
if (!eSel.value) eSel.value = 'high';
if (!sendTo.value) sendTo.value = 'here';
const route = { here: { ns: null, state: 'checking' }, new: { ns: null, state: 'checking' } };
let busy = false;
const DOCNOTE = `db ${STORE.doc}`;
const fit = (t, n) => {
  const en = new TextEncoder(),
    tail = `\n… (전체는 ${DOCNOTE})`;
  if (en.encode(t).length <= n) return t;
  let k = t.length;
  while (k > 0 && en.encode(t.slice(0, k) + tail).length > n) k -= 20;
  return t.slice(0, Math.max(0, k)) + tail;
};
function say(text, cls, extra) {
  out.className = 'send-out' + (cls ? ' ' + cls : '');
  out.textContent = text;
  if (extra && extra.link && /^https:\/\//.test(extra.link)) {
    const a = document.createElement('a');
    a.href = extra.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '세션 열기';
    out.append(' · ', a);
  }
  if (extra && extra.text) {
    const t = document.createElement('textarea');
    t.readOnly = true;
    t.value = extra.text;
    out.append(t);
    t.addEventListener('focus', () => t.select());
  }
}
const HERE = { available: '이 페이지를 지켜보는 세션이 받습니다', writers_only: '편집자만 Claude에게 보낼 수 있습니다', no_session: '지금 이 페이지를 지켜보는 세션이 없습니다', off: '이 화면에서는 Claude에게 보낼 수 없습니다', none: '이 화면에서는 댓글을 쓸 수 없습니다' };
const NEW = { ready: '새 세션을 열 수 있습니다 (처음 한 번은 허용을 묻습니다)', none: '이 화면에서는 커넥터를 쓸 수 없습니다', missing: 'Claude Code Remote 커넥터에 새 세션 열기가 없습니다', needs_reauth: 'Claude Code Remote 커넥터를 다시 연결해야 합니다', off: '이 계정에 Claude Code Remote 커넥터가 연결되어 있지 않습니다' };
const lastLine = () => {
  const x = state.sent[state.sent.length - 1];
  return x ? ` · 마지막 제출 ${hhmm(x.at)} ${x.ok ? '성공(' + (x.via === 'session' ? '새 세션' : '지켜보는 세션') + ')' : '실패(' + x.code + ')'}` : '';
};
function show() {
  const isNew = sendTo.value === 'new';
  mSel.hidden = eSel.hidden = !isNew;
  const st = route[isNew ? 'new' : 'here'].state,
    can = isNew ? st === 'ready' : st === 'available',
    other = route[isNew ? 'here' : 'new'].state,
    otherOk = isNew ? other === 'available' : other === 'ready';
  sendBtn.disabled = busy || (!!store && !canWrite);
  sendBtn.textContent = state.sent.some((x) => x.ok) ? '다시 제출' : '제출';
  if (busy) return;
  if (st === 'checking') return say('받는 곳 확인 중…');
  const note = (isNew ? NEW : HERE)[st] || st;
  if (can) say('✓ ' + note + (isNew ? ` — ${mSel.selectedOptions[0].textContent} · ${eSel.value}` : '') + lastLine(), 'ok');
  else say('✕ ' + note + (otherOk ? ' — 누르면 ' + (isNew ? '지켜보는 세션' : '새 세션') + '으로 보냅니다' : ' — 누르면 답을 복사합니다(채팅에 붙여 넣기)') + lastLine(), 'warn');
}
const keep = () => {
  try {
    localStorage.setItem(PREF, JSON.stringify({ to: sendTo.value, model: mSel.value, effort: eSel.value }));
  } catch (err) {
    /* no storage */
  }
  show();
};
sendTo.addEventListener('change', keep);
mSel.addEventListener('change', keep);
eSel.addEventListener('change', keep);
const use = (name) => (window.claude && window.claude.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
async function check() {
  const [cm, mcp] = await Promise.all([use('comments'), use('mcp')]);
  route.here.ns = cm;
  route.new.ns = mcp;
  route.here.state = cm ? await cm.canSendToClaude().catch(() => 'off') : 'none';
  if (!mcp) route.new.state = 'none';
  else
    try {
      const l = await mcp.listTools(SEND.server),
        s = ((l && l.servers) || []).find((x) => x.server === SEND.server && x.kind !== 'artifact'),
        tools = s ? (s.tools || []).map((t) => (typeof t === 'string' ? t : t.name)) : [];
      route.new.state = !s ? 'off' : s.authStatus === 'needs_reauth' ? 'needs_reauth' : tools.includes(SEND.tool) ? 'ready' : tools.length ? 'missing' : 'off';
    } catch (e) {
      route.new.state = (e && e.code) === 'needs_reauth' ? 'needs_reauth' : 'none';
    }
  show();
}
document.addEventListener('visibilitychange', () => !document.hidden && !busy && check());
function logSend(x) {
  state.sent.push(x);
  state.log.push({ k: 'send', v: `${x.via} ${x.ok ? 'ok' : x.code}`, at: x.at });
  persist();
}
const definite = (code) => !['server_unavailable', 'upstream_error', 'cancelled'].includes(code); // (ambiguous: the session may exist)
const page = () => (SEND.page ? `페이지 ${SEND.page}` : '페이지 “미결 카탈로그 · 프로 복서”(주소는 docs/open-catalog.md)');
async function viaHere(text, at) {
  const cm = route.here.ns,
    st = cm ? await cm.canSendToClaude().catch(() => 'off') : 'none';
  route.here.state = st;
  if (st !== 'available') throw { code: st };
  const anchor = await cm.anchorFor(sendBtn);
  await cm.sendToClaude({ anchor, text: fit(`[${SEND.title} · 미결 카탈로그 — 답 제출 · ${at}]\n${text}\n\n(같은 답이 이 페이지의 ${DOCNOTE}에 있습니다. docs/handoff.md를 따라 이 답으로 이어 가 주세요. 답은 한국어로.)`, 3900) });
  logSend({ at, via: 'comment', ok: true });
  say('✓ 보냈습니다 — 이 페이지를 지켜보는 세션이 받습니다(페이지의 댓글에 남음)', 'ok');
}
async function viaNew(text, at) {
  const mcp = route.new.ns;
  if (!mcp) throw { code: 'none' };
  const model = mSel.value,
    effort = eSel.value,
    name = mSel.selectedOptions[0].textContent;
  say('새 세션을 여는 중… (' + name + ' · ' + effort + ')');
  const prompt = [
    `${SEND.title} — 미결 카탈로그의 답이 제출되었습니다 · ${at}`,
    `${page()} · 같은 답이 그 페이지의 db 문서 ${STORE.doc}에 있습니다(ArtifactData get ${STORE.doc}).`,
    `저장소 ${SEND.repo} · 브랜치 ${SEND.branch} · 프로젝트 폴더 pixel-boxer`,
    `모델 · effort: ${name} · ${effort} (페이지에서 고름)`,
    '',
    '답:',
    text,
    '',
    `pixel-boxer/docs/handoff.md를 먼저 읽고, 이 답으로 이어 가 주세요. 브랜치 ${SEND.branch}에서 계속합니다. 답은 한국어로.`
  ].join('\n');
  const res = await mcp.callTool(SEND.server, SEND.tool, { prompt, title: SEND.title, model, effort, environment_id: SEND.env, source_url: 'https://github.com/' + SEND.repo, source_revision: SEND.branch });
  let blob = '';
  try {
    blob = JSON.stringify(res && (res.payload !== undefined ? res.payload : res.content));
  } catch (err) {
    /* not JSON */
  }
  const id = (blob.match(/session_[A-Za-z0-9]{16,}/) || [])[0] || null;
  logSend({ at, via: 'session', ok: true, model, effort, session: id });
  say('✓ 보냈습니다 — 새 세션이 답을 받습니다', 'ok', { link: id ? 'https://claude.ai/code/' + id : null });
}
async function copyOut(text, why) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (err) {
    /* not allowed here */
  }
  say('✕ ' + why + ' — ' + (copied ? '답을 복사했습니다. 채팅에 붙여 넣어 주세요' : '아래 답을 길게 눌러 복사해 채팅에 붙여 넣어 주세요') + (store ? ' (답은 db에 저장되어 있습니다)' : ''), 'warn', { text });
}
const answers = () => answersText(state.picks, state.notes) || '(아직 고른 것 없음)';
const where = (to) => (to === 'new' ? '새 세션' : '지켜보는 세션');
sendBtn.addEventListener('click', async () => {
  if (busy) return;
  const at = stamp(),
    text = answers(),
    first = sendTo.value,
    second = first === 'new' ? 'here' : 'new',
    run = { here: viaHere, new: viaNew },
    fails = [];
  busy = true;
  sendBtn.disabled = true;
  persist();
  for (const to of [first, second]) {
    const via = to === 'new' ? 'session' : 'comment',
      ready = to === 'new' ? ['ready', 'checking'].includes(route.new.state) : true; // (the comment route checks itself again)
    if (!ready) {
      fails.push(`${where(to)}: ${NEW[route.new.state] || route.new.state}`);
      logSend({ at, via, ok: false, code: route.new.state });
      continue;
    }
    try {
      await run[to](text, at);
      busy = false;
      sendBtn.disabled = false;
      sendBtn.textContent = '다시 제출';
      return;
    } catch (e) {
      const code = (e && e.code) || 'error';
      fails.push(`${where(to)}: ${(to === 'new' ? NEW : HERE)[code] || '실패'} (${code})`);
      logSend({ at, via, ok: false, code, msg: String((e && e.message) || '').slice(0, 160) });
      if (to === 'new' && !definite(code)) {
        busy = false;
        sendBtn.disabled = false;
        return say('? 새 세션이 열렸는지 알 수 없습니다(' + code + ') — 다시 누르기 전에 Claude Code의 세션 목록을 확인해 주세요', 'warn');
      }
      if (code === 'consent_required' || code === 'approval_required') {
        busy = false;
        show();
        return say('✕ 허용이 필요합니다(' + code + ') — 다시 누르면 묻습니다', 'warn');
      }
    }
  }
  busy = false;
  sendBtn.disabled = false;
  await copyOut(text, fails.join(' · '));
});
$('#copy').addEventListener('click', async () => {
  const text = answers(),
    b = $('#copy');
  try {
    await navigator.clipboard.writeText(text);
    b.textContent = '복사됨';
  } catch (err) {
    say('아래 답을 길게 눌러 복사해 주세요', '', { text });
  }
  setTimeout(() => (b.textContent = '답 복사'), 2500);
});
show();
check();

/* ---- the store: the db when this view has it (a write refused decides read-only), otherwise this browser */
(async () => {
  const db = await use('db');
  if (!db) {
    try {
      const j = JSON.parse(localStorage.getItem(STORE.local) || 'null');
      if (j && j.picks) Object.assign(state, { picks: j.picks, notes: j.notes || {}, log: Array.isArray(j.log) ? j.log : [], sent: Array.isArray(j.sent) ? j.sent : [] });
    } catch (err) {
      /* no storage */
    }
    saveState('이 기기에만 기억됨 (저장소 없음) — ‘제출’이나 ‘답 복사’로 보내 주세요', 'warn');
    refresh();
    show();
    return;
  }
  store = db;
  try {
    const u = await use('user'),
      w = u ? await u.can('data.write') : null;
    if (w === false) canWrite = false;
  } catch (err) {
    /* a refused write decides */
  }
  const timer = setTimeout(() => saveState('저장소에 아직 닿지 않음 — 닿으면 저장됩니다', 'warn'), 10000);
  db.doc(STORE.doc).onSnapshot(
    (snap) => {
      clearTimeout(timer);
      const d = snap.exists ? snap.data() : null;
      if (d && !dirty && !saving) Object.assign(state, { picks: { ...(d.picks || {}) }, notes: { ...(d.notes || {}) }, log: Array.isArray(d.log) ? d.log.slice() : [], sent: Array.isArray(d.sent) ? d.sent.slice() : [] });
      if (!dirty && !saving) saveState(d ? (canWrite ? '저장됨 · ' : '보기 전용 · ') + hhmm(d.at) : canWrite ? '아직 고른 것 없음 — 누르면 저장' : '보기 전용', d ? 'ok' : '');
      refresh();
      show();
    },
    (e) => {
      clearTimeout(timer);
      store = null;
      saveState('저장소 오류 (' + ((e && e.code) || '') + ') — 이 기기에만 기억됨', 'warn');
      refresh();
    }
  );
})();
refresh();

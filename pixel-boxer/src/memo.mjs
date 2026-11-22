/* Notes on the catalogue: under every row (and every card that stands on its own) a thread of short notes, the feedback
   the person reviewing the catalogue leaves on that technique. Each note is its own document in the artifact's store
   (collection `feedback`: { item: the row's id, text, at: ISO time, by: the writer's id or null }), so that a later
   session reads them all with one listing; away from the artifact (a local server, a preview) they are kept in this
   browser only. The page draws itself without them and fills them in when the store answers. What a note says is
   whatever its writer typed: it is set as text, never as markup. */

export const COLLECTION = 'feedback';
export const MAX = 2000; // characters a note may have
const LOCAL = 'catalog-feedback'; // the browser's own copy, when there is no store
const WAIT = 10000; // ms to wait for the store before saying it cannot be reached

// the notes, as the store holds them, sorted into their rows: { [item]: [{ id, text, at, by }] }, oldest first
export function group(docs, known) {
  const out = {};
  for (const d of docs) {
    if (!d || typeof d.item !== 'string' || typeof d.text !== 'string' || !d.text.trim()) continue;
    if (known && !known.has(d.item)) continue;
    (out[d.item] ||= []).push({ id: d.id, text: d.text.slice(0, MAX), at: typeof d.at === 'string' ? d.at : '', by: typeof d.by === 'string' ? d.by : null });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  return out;
}

// a note as it is written down: trimmed, not empty, not too long (null when there is nothing to keep)
export function note(item, text, by, now = new Date()) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  return { item, text: t.slice(0, MAX), at: now.toISOString(), by: by ?? null };
}

const when = iso => {
  const d = new Date(iso);
  return isNaN(d) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const within = (p, ms) => Promise.race([p, new Promise(resolve => setTimeout(() => resolve('late'), ms))]);

/* items: [{ id, name, host }] where host is the element the thread goes into; line: the element that says where the notes
   are kept; toc: (id) => the contents link of that row, or null */
export function attachMemos({ items, line, toc }) {
  const known = new Set(items.map(i => i.id)),
    boxes = {};
  let notes = {},
    db = null,
    me = null,
    owner = false,
    canWrite = true,
    mode = 'loading';

  const says = (text, kind) => {
    line.textContent = text;
    line.className = 'store' + (kind ? ' ' + kind : '');
  };

  for (const { id, name, host } of items) {
    const box = document.createElement('details');
    box.className = 'memo';
    box.dataset.memo = id;
    box.innerHTML = `<summary><span class="memo-label">메모</span> <b data-n>0</b></summary>
      <ol class="memo-list" aria-live="polite"></ol>
      <form class="memo-form">
        <label class="memo-hint" for="memo-${id}"></label>
        <textarea id="memo-${id}" rows="2" maxlength="${MAX}" placeholder="이 줄에 남길 피드백"></textarea>
        <div class="memo-row"><span class="memo-state" data-state></span><button type="submit">남기기</button></div>
      </form>`;
    box.querySelector('.memo-hint').textContent = `${name}에 메모`;
    const form = box.querySelector('form'),
      area = form.querySelector('textarea'),
      button = form.querySelector('button');
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const doc = note(id, area.value, me);
      if (!doc || button.disabled) return;
      button.disabled = true;
      state(id, '남기는 중…');
      try {
        await add(doc);
        area.value = '';
        state(id, '');
      } catch (error) {
        console.warn('memo: writing a note', error);
        state(id, error && error.code === 'quota_exceeded' ? '저장 공간이 찼습니다. 오래된 메모를 지워 주세요' : '남기지 못했습니다. 다시 눌러 주세요', 'warn');
      } finally {
        button.disabled = !canWrite;
      }
    });
    // (a key press to send: Ctrl or ⌘ with Enter)
    area.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) form.requestSubmit();
    });
    host.append(box);
    boxes[id] = box;
  }

  function state(id, text, kind) {
    const el = boxes[id].querySelector('[data-state]');
    el.textContent = text;
    el.className = 'memo-state' + (kind ? ' ' + kind : '');
  }

  function draw(id) {
    const box = boxes[id],
      list = notes[id] || [],
      ol = box.querySelector('.memo-list');
    box.querySelector('[data-n]').textContent = String(list.length);
    box.classList.toggle('has', list.length > 0);
    ol.replaceChildren(
      ...list.map(n => {
        const li = document.createElement('li'),
          text = document.createElement('p'),
          meta = document.createElement('div'),
          time = document.createElement('time');
        text.textContent = n.text;
        time.textContent = when(n.at);
        if (n.at) time.dateTime = n.at;
        meta.className = 'memo-meta';
        meta.append(time);
        if (mode === 'local' || owner || (me && n.by === me)) {
          // (two presses to take a note away: the first asks, the second does it)
          const del = document.createElement('button');
          del.type = 'button';
          del.textContent = '지우기';
          del.addEventListener('click', async () => {
            if (del.dataset.armed !== '1') {
              del.dataset.armed = '1';
              del.textContent = '정말 지울까요?';
              setTimeout(() => {
                del.dataset.armed = '';
                del.textContent = '지우기';
              }, 6000);
              return;
            }
            del.disabled = true;
            try {
              await remove(n.id);
            } catch (error) {
              console.warn('memo: removing a note', error);
              del.disabled = false;
              del.textContent = '지우지 못했습니다';
            }
          });
          meta.append(del);
        }
        li.append(text, meta);
        return li;
      })
    );
    const link = toc && toc(id);
    if (link) {
      let mark = link.querySelector('.memo-n');
      if (list.length && !mark) link.append((mark = Object.assign(document.createElement('span'), { className: 'memo-n' })));
      if (mark) list.length ? (mark.textContent = `메모 ${list.length}`) : mark.remove();
    }
  }
  const drawAll = () => {
    for (const id of Object.keys(boxes)) draw(id);
  };

  // ---- where the notes are kept
  function local() {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return []; // (blocked or unreadable storage: nothing kept here)
    }
  }
  function keepLocal(docs) {
    localStorage.setItem(LOCAL, JSON.stringify(docs));
  }
  async function add(doc) {
    if (db) return db.collection(COLLECTION).add(doc); // (the subscription brings it back into the thread)
    const docs = local();
    docs.push(Object.assign({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }, doc));
    keepLocal(docs);
    notes = group(docs, known);
    drawAll();
  }
  async function remove(noteId) {
    if (db) return db.doc(`${COLLECTION}/${noteId}`).delete();
    keepLocal(local().filter(d => d.id !== noteId));
    notes = group(local(), known);
    drawAll();
  }
  function lock(text) {
    canWrite = false;
    for (const box of Object.values(boxes)) {
      box.querySelector('textarea').disabled = true;
      box.querySelector('form button').disabled = true;
    }
    says(text, 'warn');
  }

  (async () => {
    says('메모를 불러오는 중…');
    let user = null;
    try {
      const use = window.claude && window.claude.use ? name => window.claude.use(name) : null;
      if (use) [db, user] = await within(Promise.all([use('db'), use('user').catch(() => null)]), WAIT).then(r => (r === 'late' ? [null, null] : r));
    } catch (error) {
      console.warn('memo: the store', error);
      db = null;
    }
    if (!db) {
      mode = 'local';
      notes = group(local(), known);
      drawAll();
      says('메모: 이 브라우저에만 저장됨', 'warn');
      return;
    }
    mode = 'db';
    if (user) {
      try {
        [me, owner] = await Promise.all([user.id ? user.id().catch(() => null) : null, user.isOwner().catch(() => false)]);
        if ((await user.can('data.write').catch(() => null)) === false) lock('메모: 읽기 전용(볼 수만 있습니다)');
      } catch {
        // (who is looking is a convenience: without it every note stays and only deleting is held back)
      }
    }
    drawAll();
    let heard = false;
    const timer = setTimeout(() => !heard && says('메모를 아직 불러오지 못했습니다. 들어오는 대로 채웁니다', 'warn'), WAIT);
    db.collection(COLLECTION).onSnapshot(
      snap => {
        notes = group(
          snap.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())),
          known
        );
        drawAll();
        if (!snap.metadata || !snap.metadata.fromCache) {
          heard = true;
          clearTimeout(timer);
          if (canWrite) says('메모: 이 페이지에 저장되고, 함께 보는 사람과 같습니다', 'ok');
        }
      },
      error => {
        heard = true;
        clearTimeout(timer);
        console.warn('memo: the notes', error);
        says('메모를 불러오지 못했습니다. 페이지를 다시 열어 주세요', 'warn');
      }
    );
  })();
}

// Clip viewer: every clip of every character on one screen, for reviewing frames as they arrive.
//   before-dawn.html?anim=1          all characters: a row each, one cell per clip of the table
//   before-dawn.html?anim=goblin     one character, large; click a row (or 1–8, ←/→) to switch,
//                                    Esc / 0 back to all; Space pauses, . steps a frame when paused
// A clip that exists plays (attack: the wind-up over 0.6 s as a telegraph would fill it, the strike
// frame flashes, then the follow-through; hurt and die repeat after a pause). A missing clip shows
// what the game draws instead (BD.anim.resolve's fallback), dimmed, with the rule that chose it.

const C = BD.C;
const U = BD.ui;
const AS = BD.client.assets;
const R = BD.client.render;
const S = BD.anim;
const VW = BD.client.animView = { focus: null, paused: false, t: 0, rows: [] };
const WIND = 0.6; // s of wind-up in the demo (a typical telegraph)

function chars() {
  const out = ['hero'];
  for (const d of BD.enemies.all()) if (d.type !== 'boss') out.push(d.id);
  for (const d of BD.enemies.all()) if (d.type === 'boss') out.push(d.id);
  return out;
}
const actionOf = (clip) => clip.replace(/_(side|down|up)$/, '');
const dirOf = (clip) => (/_(side|down|up)$/.exec(clip) || [null, 'side'])[1];

VW.attach = function (canvas, ui, which) {
  const list = chars();
  VW.focus = which && which !== '1' && list.includes(which) ? which : null;
  const pick = (i) => { if (i >= 0 && i < list.length) VW.focus = list[i]; };
  window.addEventListener('keydown', (ev) => {
    const i = list.indexOf(VW.focus);
    if (ev.code === 'Escape' || ev.code === 'Digit0') VW.focus = null;
    else if (ev.code === 'Space') VW.paused = !VW.paused;
    else if (ev.code === 'Period') VW.t += 1 / 60;
    else if (ev.code === 'ArrowRight') pick((i + 1) % list.length);
    else if (ev.code === 'ArrowLeft') pick((i + list.length - 1) % list.length);
    else { const d = /^Digit([1-9])$/.exec(ev.code); if (d) pick(Number(d[1]) - 1); }
  });
  canvas.addEventListener('pointerdown', (ev) => {
    const r = canvas.getBoundingClientRect(), [x, y] = ui.view.toLogical(ev.clientX - r.left, ev.clientY - r.top);
    if (VW.focus) { if (y < 60) VW.focus = null; return; }
    const row = VW.rows.find((q) => y >= q.y && y < q.y + q.h);
    if (row && x < 1280) VW.focus = row.char;
  });
};

// Draw what the game would draw for `char` doing `action` at demo time tt, feet at (fx, fy).
function demo(g, char, clip, fx, fy, zoom, tt) {
  const m = BD.client.render.anim.live(), action = actionOf(clip), dir = char === 'hero' ? dirOf(clip) : null;
  const moving = action === 'move';
  const r = S.resolve(m, char, action, dir, moving);
  const def0 = r.name ? m[char][r.name] : null;
  const mv = R.mapView(fx, fy), size = 1;
  const o = { flip: false };
  const st = { walkT: tt };
  let ph = { t: tt }, info = '', note = '';
  // demo phases
  if (action === 'attack') {
    const T = def0 && r.shows === 'attack' ? (char === 'hero' ? S.heroAttackTiming(def0, C.HERO.interval) : { wind: WIND, follow: S.enemyFollow(def0) }) : { wind: WIND, follow: 0.25 };
    const cyc = T.wind + T.follow + 0.5, u = tt % cyc;
    ph = u < T.wind ? { p: u / T.wind } : u < T.wind + T.follow ? { q: (u - T.wind) / T.follow } : { q: 1 };
    if (u >= T.wind && u < T.wind + 0.06) note = 'strike';
  } else if (action === 'hurt') ph = { t: tt % 0.9 };
  else if (action === 'dash') ph = { t: tt % 0.6 };
  const AN = R.anim;
  if (action === 'die' && !(r.name && r.shows === 'die')) {
    // the ghost's ink dissolve (from the stand-in frame, if any)
    const cyc = AN.DISSOLVE + 0.6, age = Math.min(tt % cyc, AN.DISSOLVE - 0.001);
    const src = r.name ? (() => { const c = AN.clip(char, r.name); return c ? { def: c.def, img: c.img, f: r.hold ? 0 : S.frame(c.def, { t: tt }) } : null; })() : null;
    if (char !== 'hero') AN.drawGhost(g, mv, { kind: char, sprite: BD.enemies.get(char).sprite, x: 0, y: 0, face: Math.atan2(-1, 1), size: zoom, outline: null, die: null, src: src && Object.assign({}, src), dur: AN.DISSOLVE, seed: 3.1 }, age);
    else R.sprite(g, mv, 'hero_hurt', 0, 0, { rot: 1.2, sy: 0.95, scale: zoom });
    return { label: r.name ? '→ ' + r.name + ' + 먹 흩어짐' : '→ 코드: 먹 흩어짐', have: false };
  }
  if (action === 'die') {
    const c = AN.clip(char, r.name), cyc = S.duration(c.def) + 0.6;
    ph = { t: tt % cyc };
  }
  AN.codeMotion(o, r.code, r.code === 'shake' ? { t: (tt % 0.9) } : ph, st, 3, 1, 0.3);
  const have = r.name === clip || (char !== 'hero' && r.name === action && r.shows === action);
  let label = have ? clip : r.pose ? '→ ' + r.pose + ' (정지)' : r.name ? '→ ' + r.name + (r.hold ? ' 0번 고정' : '') + (r.code ? ' + ' + r.code : '') : '→ 코드: ' + (r.code || '정지');
  if (r.name) {
    const c = AN.clip(char, r.name);
    if (c) {
      const f = S.frame(c.def, r.hold ? { hold: true } : r.shows === action ? ph : { t: tt });
      if (note === 'strike') o.outline = U.ORANGE;
      AN.drawFrame(g, mv, c.def, c.img, f, 0, 0, o, AN.frameScale(char, c.def, size) * zoom);
      info = c.def.frames + 'f ' + (+c.def.fps).toFixed(1) + 'fps · ' + (f + 1) + '/' + c.def.frames + (c.def.strike !== undefined ? ' · strike ' + c.def.strike : '');
    }
  } else {
    const id = r.pose || (char === 'hero' ? ({ side: 'hero_side', down: 'hero_front', up: 'hero_back' })[dir] : BD.enemies.get(char).sprite);
    o.scale = zoom;
    R.sprite(g, mv, id, 0, 0, o);
  }
  return { label, info, have };
}

VW.draw = function (g, ui, dt) {
  if (!VW.paused) VW.t += dt;
  const tt = VW.t;
  g.fillStyle = '#16151c'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
  const text = (s, x, y, o) => ui.text(s, x, y, Object.assign({ size: 13, color: '#d8d2c4' }, o || {}));
  const list = chars();
  const n = Object.values(BD.animMeta || {}).reduce((a, c) => a + Object.keys(c).length, 0), loaded = Object.keys(AS.anim).length;
  if (!VW.focus) {
    text('애니메이션 클립 검토  ·  클립 ' + n + '개 (띠 ' + loaded + '/' + Object.keys(BD.animData || {}).length + ' 해독)  ·  행을 누르면 확대  ·  Space 정지', 16, 24, { size: 16, weight: 800, color: '#f3ead8' });
    text('밝은 칸 = 클립이 있다 · 흐린 칸 = 없어서 대신 그리는 것 (→ 규칙)', 16, 44, { color: '#9b968c' });
    VW.rows = [];
    const top = 56, rh = Math.floor((C.VIEW_H - top) / list.length);
    list.forEach((char, i) => {
      const y = top + i * rh, clips = S.clipNames(char), cw = Math.min(104, Math.floor((C.VIEW_W - 92) / (clips.length + 1)));
      VW.rows.push({ char, y, h: rh });
      g.fillStyle = i % 2 ? '#1c1b23' : '#201f28'; g.fillRect(0, y, C.VIEW_W, rh);
      text(char, 8, y + 16, { size: 13, weight: 800, color: '#f3ead8' });
      const sid = char === 'hero' ? 'hero_side' : BD.enemies.get(char).sprite, sh = AS.img[sid] ? AS.img[sid].height * (C.HERO.spriteH / 256) : 60;
      const zoom = Math.min(1, (rh - 26) / sh);
      // static picture
      R.sprite(g, R.mapView(92 + cw / 2, y + rh - 14), sid, 0, 0, { scale: zoom });
      text('정지', 92 + cw / 2, y + rh - 2, { align: 'center', size: 11, color: '#9b968c' });
      clips.forEach((clip, j) => {
        const cx = 92 + (j + 1) * cw;
        g.save(); g.beginPath(); g.rect(cx, y, cw, rh); g.clip();
        const d = demo(g, char, clip, cx + cw / 2, y + rh - 14, zoom, tt + j * 0.13);
        g.restore();
        if (!d.have) { g.fillStyle = 'rgba(22,21,28,0.3)'; g.fillRect(cx + 1, y + 1, cw - 2, rh - 2); }
        g.strokeStyle = d.have ? '#d9b45a' : '#3a3944'; g.lineWidth = 1; g.strokeRect(cx + 0.5, y + 0.5, cw - 1, rh - 1);
        text(clip, cx + 4, y + 12, { size: 11, weight: 800, color: d.have ? '#ffd56a' : '#77737f', maxW: cw - 8 });
        if (!d.have) text(d.label, cx + 4, y + 25, { size: 9, weight: 600, color: '#8d8896', maxW: cw - 8 });
      });
    });
    return;
  }
  // one character, large
  const char = VW.focus, clips = S.clipNames(char);
  text(char + '  ·  Esc 전체  ·  ←/→ 다른 캐릭터  ·  Space 정지 / . 한 장', 16, 26, { size: 18, weight: 800, color: '#f3ead8' });
  const cols = char === 'hero' ? 4 : 3, rows = Math.ceil(clips.length / cols), cw = Math.floor((C.VIEW_W - 24) / cols), chh = Math.floor((C.VIEW_H - 50) / rows);
  const sid = char === 'hero' ? 'hero_side' : BD.enemies.get(char).sprite, sh = AS.img[sid] ? AS.img[sid].height * (C.HERO.spriteH / 256) : 60;
  const zoom = Math.min(char === 'demon_king' ? 1.3 : 2.4, (chh - 46) / sh);
  clips.forEach((clip, j) => {
    const cx = 12 + (j % cols) * cw, cy = 44 + Math.floor(j / cols) * chh;
    g.fillStyle = j % 2 ? '#1c1b23' : '#201f28'; g.fillRect(cx, cy, cw - 6, chh - 6);
    // ground line and anchor cross
    const fx = cx + cw / 2, fy = cy + chh - 30;
    g.fillStyle = '#4a4756'; g.beginPath(); g.ellipse(fx, fy, cw * 0.3, 14, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.rect(cx, cy, cw - 6, chh - 6); g.clip();
    const d = demo(g, char, clip, fx, fy, zoom, tt);
    g.restore();
    if (!d.have) { g.fillStyle = 'rgba(22,21,28,0.3)'; g.fillRect(cx, cy, cw - 6, chh - 6); }
    g.strokeStyle = d.have ? '#d9b45a' : '#3a3944'; g.lineWidth = 2; g.strokeRect(cx + 1, cy + 1, cw - 8, chh - 8);
    text(clip, cx + 10, cy + 20, { size: 15, weight: 800, color: d.have ? '#ffd56a' : '#77737f' });
    text(d.have ? d.info || '' : d.label, cx + 10, cy + chh - 12, { size: 12, color: d.have ? '#d8d2c4' : '#8d8896', maxW: cw - 24 });
  });
};

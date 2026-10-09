// ─────────────────────────────────────────────────────────────
// HUD (low-res pixel art), touch controls, hi-res overlays
// ─────────────────────────────────────────────────────────────

const FONT_DISPLAY = '"Futura-CondensedExtraBold", "Futura Condensed ExtraBold", "AvenirNextCondensed-Heavy", "Avenir Next Condensed", Impact, "Arial Narrow Bold", "Arial Black", sans-serif';
const FONT_SERIF = '"Didot", "Bodoni 72", "Bodoni MT", Georgia, "Times New Roman", serif';
const FONT_KO = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

function slotFilled(i) {
  const l = LETTERS[i];
  if (l === 'A') return i === 2 ? P.letters.A >= 1 : P.letters.A >= 2;
  return !!P.letters[l];
}

function drawHUD() {
  const W = Screen.W;
  L.globalAlpha = 0.84; L.fillStyle = '#0a0709'; L.fillRect(0, 0, W, 20); L.globalAlpha = 1;
  rect(0, 20, W, 1, '#3a1e26');
  // hearts
  for (let i = 0; i < CFG.HP; i++) iconHeart(4 + i * 8, 7, i < P.hp);
  // S H A Z A M
  const sw = 10, gap = 1, total = 6 * sw + 5 * gap, x0 = Math.round(W / 2 - total / 2), y0 = 3;
  for (let i = 0; i < 6; i++) {
    const x = x0 + i * (sw + gap), l = LETTERS[i], on = slotFilled(i);
    const pop = G.letterPop[l] || 0;
    const lit = G.phase === 'shazam' && G.shz && i < G.shz.lit;
    rect(x - 1, y0 - 1, sw + 2, 15, C.ink);
    if (on || lit) {
      rect(x, y0, sw, 13, lit ? '#ffffff' : C.gold2); rect(x, y0, sw, 7, lit ? '#fffbe0' : C.gold);
      text5(l, x + 2.5, y0 + 3, C.ink);
    } else {
      const blink = G.aPhase && l === 'A' && ((G.rt * 3) | 0) % 2;
      rect(x, y0, sw, 13, blink ? '#3a2a10' : '#1c1317');
      text5(l, x + 2.5, y0 + 3, blink ? C.gold2 : '#3d2e35');
    }
    if (pop > 0) { L.globalAlpha = pop; rect(x, y0, sw, 13, '#ffffff'); L.globalAlpha = 1; }
  }
  // keys & honey
  let x = W - 3;
  const kp = G.hudPop.keys || 0, hp = G.hudPop.honey || 0;
  x -= text3(String(P.keys), x, 8 - Math.round(kp * 2), kp > 0 ? '#ffffff' : C.white, 1, 'right') + 2;
  drawKeyIcon(x - 4, 10);
  x -= 13;
  x -= text3(String(P.honey), x, 8 - Math.round(hp * 2), hp > 0 ? '#ffffff' : C.white, 1, 'right') + 2;
  drawJarIcon(x - 3, 10);

  // context row
  const K = G.killer;
  const y1 = 24;
  if (G.mode === 'revenge') {
    const f = clamp(G.revengeT / CFG.REVENGE_TIME, 0, 1);
    rect(3, y1, W - 6, 5, C.ink); rect(4, y1 + 1, W - 8, 3, '#3a2a10');
    rect(4, y1 + 1, Math.round((W - 8) * f), 3, G.revengeT < 5 && ((G.rt * 6) | 0) % 2 ? '#ffffff' : C.gold);
  } else if (K) {
    if (K.kind === 'witch') {
      const lit = K.litCount();
      for (let i = 0; i < 6; i++) { const cx = 6 + i * 7; rect(cx - 1, y1 + 2, 3, 5, C.ink); rect(cx, y1 + 3, 1, 3, i < lit ? '#efe9d8' : '#3a3036'); if (i < lit) px(cx, y1 + 1, ((G.rt * 9 + i) | 0) % 2 ? '#ffb347' : '#fff2c0'); }
      if (lit >= 4) text3('!', 6 + 6 * 7, y1 + 2, C.red);
    } else if (K.kind === 'doctor') {
      const urgent = G.docT <= 30;
      const c = urgent && ((G.rt * 4) | 0) % 2 ? C.red : '#7dff9a';
      text3(fmtTime(G.docT), W / 2, y1, c, 2, 'center');
    } else if (K.kind === 'janitor') {
      iconGrade(10, y1 + 5, K.grade, K.gradePop);
    } else if (K.kind === 'evolver' && K.stage !== 'egg') {
      const names = { larva: 'LARVA', adult: 'ADULT', perfect: 'PERFECT' };
      text3(names[K.stage], 4, y1 + 1, K.stage === 'perfect' ? C.red : '#8fbf6a');
      if (K.stage !== 'perfect') {
        const next = K.stage === 'larva' ? CFG.EVOLVE_ADULT : CFG.EVOLVE_PERFECT, prev = K.stage === 'larva' ? 0 : CFG.EVOLVE_ADULT;
        const f = clamp((K.evoT - prev) / (next - prev), 0, 1);
        rect(4, y1 + 7, 30, 2, '#2a2a20'); rect(4, y1 + 7, Math.round(30 * f), 2, '#8fbf6a');
      }
    }
  }
  if (G.dupT > 0) {
    iconEye(W - 10, y1 + 4, G.rt);
    rect(W - 24, y1 + 8, 20, 2, '#1a2a3a'); rect(W - 24, y1 + 8, Math.round(20 * G.dupT / CFG.DUP_BUFF), 2, '#7ad0ff');
  }
  drawSlotReel(W / 2, 40);
}

function drawKeyIcon(x, y) { ring(x - 2, y, 1.6, C.key); rect(x - 1, y, 5, 1, C.key); px(x + 2, y + 1, C.key); px(x + 3, y + 1, C.key); }
function drawJarIcon(x, y, s = 1) {
  rect(x - 3, y - 3, 6, 7, C.ink); rect(x - 2, y - 2, 4, 5, C.honey); rect(x - 2, y - 4, 4, 1, '#d8c8a8'); px(x - 1, y - 1, '#ffe08a');
}

function drawSlotReel(cx, cy) {
  const s = G.slot.active;
  if (!s) return;
  const size = 18;
  const appear = Math.min(1, s.t / 0.12);
  const x = Math.round(cx - size / 2), y = Math.round(cy - size / 2 - (1 - appear) * 6);
  rect(x - 2, y - 2, size + 4, size + 4, C.ink);
  rect(x - 1, y - 1, size + 2, size + 2, s.landed ? C.goldHi : C.gold2);
  rect(x, y, size, size, '#140c10');
  L.save(); L.beginPath(); L.rect(x, y, size, size); L.clip();
  const pos = s.pos || 0, idx = Math.floor(pos), frac = pos - idx;
  for (let k = -1; k <= 1; k++) {
    const sym = SLOT_SYMS[(((idx + k) % 6) + 6) % 6];
    const yy = y + 5 + Math.round((k - frac) * size);
    if (sym === 'honey') drawJarIcon(cx, yy + 4);
    else text5(sym, cx - 2, yy, s.landed ? '#ffffff' : C.gold);
  }
  L.restore();
  if (s.landed) { L.globalAlpha = Math.max(0, 1 - s.holdT * 2); ring(cx, cy, 13 + s.holdT * 18, C.goldHi); L.globalAlpha = 1; }
}

// ── touch controls ──
function drawControls() {
  const W = Screen.W, H = Screen.H;
  const playing = G.phase === 'play' && P.state !== 'dead';
  const act = (Input.layout.act = { x: W - 27, y: H - 32, r: 17, visible: playing && !P.hero });
  const hon = (Input.layout.honey = { x: W - 61, y: H - 19, r: 12, visible: playing && !P.hero && P.honey > 0 });
  if (act.visible) drawActButton(act);
  if (hon.visible) {
    const pr = Input.btn.honey.down;
    disc(hon.x, hon.y + 1, hon.r + 1, C.ink);
    disc(hon.x, hon.y + (pr ? 1 : 0), hon.r, '#7a4a10');
    disc(hon.x, hon.y - 1 + (pr ? 1 : 0), hon.r - 2, '#a86410');
    drawJarIcon(hon.x, hon.y + (pr ? 1 : 0));
    text3(String(P.honey), hon.x + 7, hon.y + 3, C.white);
  }
  const j = Input.joy;
  if (playing && j.active) {
    L.globalAlpha = 0.35; disc(j.ox, j.oy, Input.JOY_R + 2, '#000000'); L.globalAlpha = 0.5; ring(j.ox, j.oy, Input.JOY_R, C.white);
    L.globalAlpha = 0.75; disc(j.ox + j.vx * Input.JOY_R, j.oy + j.vy * Input.JOY_R, 8, '#d8d0c8'); L.globalAlpha = 1;
  } else if (playing && G.rt - G.startT < 7) {
    const a = 0.25 + Math.sin(G.rt * 4) * 0.12;
    L.globalAlpha = a; ring(34, H - 40, Input.JOY_R, C.white); disc(34 + Math.sin(G.rt * 2) * 8, H - 40, 7, C.white); L.globalAlpha = 1;
  }
}

function drawActButton(b) {
  const it = P.interact;
  const en = !!it && it.kind !== 'locked' && it.kind !== 'toiletWait';
  const pr = Input.btn.act.down;
  const y = b.y + (pr ? 1 : 0);
  disc(b.x, b.y + 2, b.r + 1, C.ink);
  disc(b.x, y, b.r, en ? '#8e1520' : '#2a2026');
  disc(b.x, y - 1, b.r - 2, en ? '#c8202c' : '#3a2e34');
  ring(b.x, y - 1, b.r - 2, en ? '#ff6a70' : '#4a3e44', 0.35, -Math.PI * 0.95);
  const c = en ? C.white : '#6a5e64';
  const k = it ? it.kind : null;
  if (k === 'unlock') drawBigKey(b.x, y, c);
  else if (k === 'lock' || k === 'locked') drawPadlock(b.x, y, c, k === 'lock');
  else if (k === 'hide') drawClosetIcon(b.x, y, c);
  else if (k === 'exit') drawExitIcon(b.x, y, c);
  else if (k === 'toilet' || k === 'toiletWait') drawToiletIcon(b.x, y, c);
  else if (k === 'candle') { drawCandleIcon(b.x, y, c); if (P.holdT > 0) for (let r = b.r - 1; r <= b.r; r += 0.5) ring(b.x, y - 1, r, C.goldHi, P.holdT / CFG.CANDLE_HOLD); }
  else drawHandIcon(b.x, y, c);
}
function drawBigKey(x, y, c) { ring(x - 4, y - 1, 3, c); ring(x - 4, y - 1, 2.4, c); rect(x - 1, y - 1, 8, 2, c); rect(x + 3, y + 1, 2, 2, c); rect(x + 6, y + 1, 1, 3, c); }
function drawPadlock(x, y, c, open) { ring(x + (open ? 2 : 0), y - 4, 3, c); rect(x - 4, y - 2, 9, 7, c); px(x, y + 1, C.ink); px(x, y + 2, C.ink); }
function drawClosetIcon(x, y, c) { rect(x - 4, y - 6, 9, 12, c); rect(x, y - 5, 1, 10, C.ink); px(x - 1, y, C.ink); px(x + 2, y, C.ink); }
function drawExitIcon(x, y, c) { rect(x - 5, y - 6, 6, 12, c); rect(x - 4, y - 5, 4, 10, C.ink); rect(x + 1, y - 1, 5, 2, c); px(x + 4, y - 2, c); px(x + 4, y + 1, c); }
function drawToiletIcon(x, y, c) { rect(x - 4, y - 6, 8, 3, c); ellipse(x, y + 1, 4.5, 3.4, 0, c); ellipse(x, y + 1, 2, 1.4, 0, C.ink); rect(x - 2, y + 4, 4, 2, c); }
function drawCandleIcon(x, y, c) { rect(x - 1, y - 2, 3, 8, c); px(x, y - 4, C.gold); px(x, y - 5, '#ffb347'); }
function drawHandIcon(x, y, c) { disc(x, y + 1, 3.2, c); for (let i = -2; i <= 1; i++) rect(x + i * 2, y - 5, 1, 4, c); rect(x - 5, y - 1, 2, 2, c); }

// ── hi-res overlays (device px) ──
function hiU() { return Math.min(Screen.pw, Screen.ph * 0.6) / 100; }

function drawTitleHi() {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, u = hiU(), t = G.rt;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const grd = g.createLinearGradient(0, 0, 0, ph);
  grd.addColorStop(0, 'rgba(6,2,6,0.9)'); grd.addColorStop(0.6, 'rgba(6,2,6,0.35)'); grd.addColorStop(1, 'rgba(6,2,6,0.92)');
  g.fillStyle = grd; g.fillRect(0, 0, pw, ph);
  bloodWord(g, 'SLASHER', pw / 2, ph * 0.27, u * 21, t, 1);
  // the X: two brush slashes
  const cx = pw / 2, cy = ph * 0.355, r = u * 9;
  g.lineCap = 'round';
  for (const [a, b] of [[-1, 1], [1, 1]]) {
    g.strokeStyle = '#0a0608'; g.lineWidth = u * 4.6;
    g.beginPath(); g.moveTo(cx - r * a, cy - r); g.lineTo(cx + r * a, cy + r); g.stroke();
    g.strokeStyle = '#d4192a'; g.lineWidth = u * 3.2;
    g.beginPath(); g.moveTo(cx - r * a, cy - r); g.lineTo(cx + r * a, cy + r); g.stroke();
  }
  bloodWord(g, 'SLASHER', pw / 2, ph * 0.5, u * 21, t + 3, 2);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#d8cfc4'; g.font = `600 ${u * 4.2}px ${FONT_KO}`;
  g.fillText('살인마로부터 살아남아라', pw / 2, ph * 0.6);
  const a = 0.55 + Math.sin(t * 4) * 0.45;
  g.globalAlpha = a; g.fillStyle = '#ffffff'; g.font = `900 ${u * 5.6}px ${FONT_DISPLAY}`;
  g.fillText('TAP TO START', pw / 2, ph * 0.78);
  g.globalAlpha = 0.7; g.font = `500 ${u * 3.4}px ${FONT_KO}`; g.fillStyle = '#b8aeb0';
  g.fillText('화면 아무 곳이나 탭', pw / 2, ph * 0.82);
  g.globalAlpha = 0.45; g.font = `500 ${u * 2.7}px ${FONT_KO}`;
  g.fillText('소리를 켜고 플레이하세요 · 왼손 조이스틱 / 오른손 버튼', pw / 2, ph * 0.94);
  g.restore();
}

function bloodWord(g, word, x, y, size, t, seed) {
  g.save();
  g.font = `900 ${size}px ${FONT_DISPLAY}`;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const w = g.measureText(word).width;
  const sx = Math.min(1.25, (Screen.pw * 0.9) / w);
  g.translate(x, y); g.scale(sx, 1);
  // drips
  const n = 9;
  for (let i = 0; i < n; i++) {
    const hx = (hash2(i, seed) - 0.5) * w * 0.9;
    const sp = 0.25 + hash2(i, seed + 9) * 0.6;
    const maxL = size * (0.3 + hash2(i, seed + 3) * 0.9);
    const len = (((t * sp * size * 0.25) + hash2(i, seed + 5) * maxL) % (maxL * 1.6));
    const L2 = Math.min(len, maxL);
    const wd = size * (0.035 + hash2(i, seed + 7) * 0.03);
    g.fillStyle = '#9a0f1b';
    g.fillRect(hx - wd / 2, -size * 0.06, wd, L2);
    g.beginPath(); g.arc(hx, L2 - size * 0.06, wd * 0.85, 0, TAU); g.fill();
    if (len > maxL) { g.beginPath(); g.arc(hx, L2 + (len - maxL) * 1.8, wd * 0.6, 0, TAU); g.fill(); }
  }
  g.lineJoin = 'round';
  g.lineWidth = size * 0.09; g.strokeStyle = '#0a0608'; g.strokeText(word, 0, 0);
  const gr = g.createLinearGradient(0, -size * 0.8, 0, 0);
  gr.addColorStop(0, '#fbf6ee'); gr.addColorStop(0.6, '#d9d0c4'); gr.addColorStop(1, '#a8382f');
  g.fillStyle = gr; g.fillText(word, 0, 0);
  g.restore();
}

function drawIntroHi() {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, u = hiU(), t = G.phaseT, K = G.killer;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const out = clamp((3.8 - t) / 0.5, 0, 1);
  g.fillStyle = '#000000'; g.fillRect(0, 0, pw, ph);
  // grain + flicker
  g.globalAlpha = 0.06 + rnd() * 0.04;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 160; i++) g.fillRect(rnd() * pw, rnd() * ph, u * 0.25, u * 0.25);
  g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const a1 = clamp((t - 0.2) / 0.5, 0, 1) * out;
  g.globalAlpha = a1; g.fillStyle = '#a89f96';
  g.font = `400 ${u * 3.2}px ${FONT_SERIF}`;
  spacedText(g, 'SLASHER X SLASHER PRESENTS', pw / 2, ph * 0.34, u * 0.9);
  const a2 = clamp((t - 0.8) / 0.4, 0, 1) * out;
  const shake = t > 1.3 && t < 2.0 ? (2.0 - t) * u * 1.2 : 0;
  const words = K.title.split(' ');
  g.globalAlpha = a2;
  g.fillStyle = '#e8e0d4'; g.font = `400 ${u * 5}px ${FONT_SERIF}`;
  spacedText(g, words[0], pw / 2, ph * 0.43, u * 1.6);
  const name = words.slice(1).join(' ');
  g.font = `900 ${u * 17}px ${FONT_DISPLAY}`;
  const w = g.measureText(name).width;
  g.save();
  g.translate(pw / 2 + rand(-shake, shake), ph * 0.52 + rand(-shake, shake));
  const s = Math.min(1, (pw * 0.88) / w); g.scale(s, 1);
  g.fillStyle = '#5a0008'; g.fillText(name, u * 0.6, u * 0.8);
  g.fillStyle = '#d4192a'; g.fillText(name, 0, 0);
  g.restore();
  g.fillStyle = '#e8e0d4'; g.font = `700 ${u * 6}px ${FONT_KO}`;
  g.fillText(K.ko, pw / 2, ph * 0.61);
  g.globalAlpha = 1;
  // letterbox
  g.fillStyle = '#000000'; g.fillRect(0, 0, pw, ph * 0.12); g.fillRect(0, ph * 0.88, pw, ph * 0.12);
  g.restore();
}
function spacedText(g, str, x, y, sp) {
  const chars = [...str];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let cx = x - total / 2;
  const al = g.textAlign; g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, cx, y); cx += widths[i] + sp; });
  g.textAlign = al;
}

function drawShazamHi() {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, u = hiU(), t = G.phaseT;
  if (t > 1.6) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const size = u * 13, gap = size * 0.78;
  const x0 = pw / 2 - gap * 2.5;
  const fade = clamp((1.6 - t) / 0.4, 0, 1);
  for (let i = 0; i < 6; i++) {
    const ti = t - i * 0.13;
    if (ti < 0) continue;
    const pop = Ease.outBack(Math.min(1, ti / 0.18));
    g.save();
    g.translate(x0 + i * gap, ph * 0.3);
    g.scale(pop, pop); g.rotate((i % 2 ? 1 : -1) * 0.06);
    g.globalAlpha = fade;
    g.font = `900 ${size}px ${FONT_DISPLAY}`;
    g.lineWidth = size * 0.14; g.strokeStyle = '#0a0608'; g.strokeText(LETTERS[i], 0, 0);
    g.fillStyle = t > 0.95 && t < 1.1 ? '#ffffff' : '#ffd23f'; g.fillText(LETTERS[i], 0, 0);
    g.restore();
  }
  g.restore();
}

function drawCloseupHi() {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, t = G.phaseT;
  const f = clamp((t - 0.6) / 0.4, 0, 1);
  if (f <= 0) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0a0608';
  const h = (ph / 2) * Ease.inCubic(f);
  g.fillRect(0, 0, pw, h); g.fillRect(0, ph - h, pw, h);
  g.restore();
}
function fadeHi(a) {
  if (a <= 0) return;
  const g = Screen.ctx; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1)})`; g.fillRect(0, 0, Screen.pw, Screen.ph); g.restore();
}

function drawEndHi(victory) {
  const g = Screen.ctx, pw = Screen.pw, ph = Screen.ph, u = hiU(), t = G.phaseT, K = G.killer;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const a = clamp(t / 0.6, 0, 1);
  const grd = g.createLinearGradient(0, 0, 0, ph);
  if (victory) { grd.addColorStop(0, `rgba(40,24,0,${0.92 * a})`); grd.addColorStop(1, `rgba(8,4,0,${0.95 * a})`); }
  else { grd.addColorStop(0, `rgba(60,0,8,${0.9 * a})`); grd.addColorStop(1, `rgba(6,0,2,${0.95 * a})`); }
  g.fillStyle = grd; g.fillRect(0, 0, pw, ph);
  g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = victory ? 'VICTORY' : 'GAME OVER';
  const size = u * 17;
  g.font = `900 ${size}px ${FONT_DISPLAY}`;
  const w = g.measureText(word).width, s = Math.min(1, (pw * 0.88) / w);
  g.save(); g.translate(pw / 2, ph * 0.36); g.scale(s * (1 + (1 - Ease.outBack(Math.min(1, t / 0.5))) * 0.4), 1 + (1 - Ease.outBack(Math.min(1, t / 0.5))) * 0.4);
  g.lineWidth = size * 0.1; g.strokeStyle = '#0a0608'; g.lineJoin = 'round'; g.strokeText(word, 0, 0);
  g.fillStyle = victory ? '#ffd23f' : '#d4192a'; g.fillText(word, 0, 0);
  g.restore();
  g.fillStyle = '#efe8dc'; g.font = `700 ${u * 5}px ${FONT_KO}`;
  const sub = victory ? `${K.ko} 처단 완료` : G.deathCause === 'hellgate' ? '지옥문에 빠졌다' : G.deathCause === 'explode' ? '폭발에 휘말렸다' : `${K.ko}에게 당했다`;
  g.fillText(sub, pw / 2, ph * 0.47);
  g.font = `500 ${u * 3.6}px ${FONT_KO}`; g.fillStyle = '#b8aeb0';
  const surv = G.time;
  g.fillText(`생존 ${fmtTime(surv)} · SHAZAM ${G.shazams}회`, pw / 2, ph * 0.53);
  if (t > 1.2) {
    g.globalAlpha = 0.55 + Math.sin(G.rt * 4) * 0.45;
    g.fillStyle = '#ffffff'; g.font = `900 ${u * 5.2}px ${FONT_DISPLAY}`;
    g.fillText(victory ? 'TAP TO PLAY AGAIN' : 'TAP TO RETRY', pw / 2, ph * 0.72);
    g.font = `500 ${u * 3.4}px ${FONT_KO}`; g.fillStyle = '#c8bec0';
    g.fillText('새 살인마가 기다린다', pw / 2, ph * 0.765);
  }
  g.restore();
}

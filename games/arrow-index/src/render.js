// ── 월드 렌더링 ──────────────────────────────────────────────────
const View = { W: 0, H: 0, dpr: 1, P: 4, U: 3, vw: 0, vh: 0, ox: 0, oy: 0, safe: { t: 0, b: 0, l: 0, r: 0 }, frame: 0 };
let cv, ctx;

function worldToScreen(x, y) { return [View.ox + x * View.P, View.oy + y * View.P]; }

function readSafeArea() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const s = { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
  probe.remove();
  return s;
}

function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  View.W = cv.width; View.H = cv.height; View.dpr = dpr;
  View.U = Math.max(1, Math.round(dpr));
  const P = clamp(Math.round(Math.min(View.W, View.H) / 245), 2, 8);
  View.P = P;
  Gfx.setScale(P);
  Ground.clear();
  View.vw = View.W / P; View.vh = View.H / P;
  const s = readSafeArea();
  View.safe = { t: s.t * dpr, b: s.b * dpr, l: s.l * dpr, r: s.r * dpr };
  ctx.imageSmoothingEnabled = false;
  HUD.onResize();
}

// ── 바닥 ──
const Ground = {
  T: 128,
  cache: {},
  clear() { this.cache = {}; this.patterns = {}; },
  tile(style) {
    if (this.cache[style]) return this.cache[style];
    const T = this.T;
    const s = { w: T, h: T, d: new Uint8Array(T * T) };
    const set = (x, y) => { s.d[(((y % T) + T) % T) * T + (((x % T) + T) % T)] = 1; };
    const seed = style.length * 7;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const h = hash2(x, y, seed);
      if (style === 'meadow') {
        if (h < 0.0022) set(x, y);
        else if (h < 0.0029) { set(x, y); set(x - 1, y - 1); set(x + 1, y - 1); } // 풀 한 포기
      } else if (style === 'under') {
        if (h < 0.002) set(x, y);
        else if (h < 0.0024) { // 금 간 자국
          let cx = x, cy = y;
          for (let k = 0; k < 9; k++) { set(cx, cy); cx += hash2(cx, cy, 3) < 0.5 ? 1 : 0; cy += hash2(cx, cy, 4) < 0.6 ? 1 : -1; }
        }
      } else if (style === 'desert') {
        const yy = y + Math.round(Math.sin(x * 0.11 + Math.floor(y / 16) * 1.7) * 2);
        if (yy % 16 === 0 && (x & 1) === 0 && hash2(x >> 4, y >> 4, 5) < 0.3) set(x, y);
        else if (h < 0.0015) set(x, y);
      } else if (style === 'snow') {
        if (h < 0.006) set(x, y);
        else if (h < 0.0066) { set(x, y); set(x - 1, y); set(x + 1, y); set(x, y - 1); set(x, y + 1); }
      } else if (style === 'temple') {
        const gx = x % 32, gy = y % 32;
        const crack = hash2(x >> 4, y >> 4, 9) < 0.25;
        if ((gx === 0 || gy === 0) && (x + y) % 4 === 0 && !crack) set(x, y);
        else if (h < 0.0012) set(x, y);
      } else {
        if (h < 0.0025) set(x, y);
        else if (h < 0.0029) { set(x, y); set(x - 1, y); set(x + 1, y); set(x, y - 1); set(x, y + 1); }
      }
    }
    const c = rasterize(s, View.P);
    this.cache[style] = c;
    return c;
  },
  pattern(style) {
    if (!this.patterns[style]) this.patterns[style] = ctx.createPattern(this.tile(style), 'repeat');
    return this.patterns[style];
  },
  draw(style) {
    const tw = this.T * View.P;
    const ox = Math.round(View.ox), oy = Math.round(View.oy);
    const mx = ((ox % tw) + tw) % tw, my = ((oy % tw) + tw) % tw;
    ctx.save();
    ctx.translate(mx - tw, my - tw);
    ctx.fillStyle = this.pattern(style);
    ctx.fillRect(0, 0, View.W + tw * 2, View.H + tw * 2);
    ctx.restore();
  },
};

const DECO_CELL = 70;
function drawDeco(style) {
  const list = DECO[style];
  const x0 = Math.floor((G.cam.x - View.vw / 2 - 20) / DECO_CELL), x1 = Math.floor((G.cam.x + View.vw / 2 + 20) / DECO_CELL);
  const y0 = Math.floor((G.cam.y - View.vh / 2 - 20) / DECO_CELL), y1 = Math.floor((G.cam.y + View.vh / 2 + 20) / DECO_CELL);
  const seed = style.length * 31;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const h = hash2(cx, cy, seed);
    if (h > 0.3) continue;
    const name = list[Math.floor(hash2(cx, cy, seed + 1) * list.length)];
    const x = cx * DECO_CELL + hash2(cx, cy, seed + 2) * DECO_CELL;
    const y = cy * DECO_CELL + hash2(cx, cy, seed + 3) * DECO_CELL;
    const c = Gfx.get(name, 0, 'd2', hash2(cx, cy, seed + 4) < 0.5);
    blit(c, x, y);
  }
}

// 월드 좌표 중심에 캔버스를 찍는다 (bottom=true 면 y 가 발끝)
function blit(c, x, y, scx = 1, scy = 1, bottom = false) {
  const P = View.P;
  const w = c.width * scx, h = c.height * scy;
  const X = View.ox + x * P - w / 2;
  const Y = View.oy + y * P - (bottom ? h : h / 2);
  ctx.drawImage(c, Math.round(X), Math.round(Y), Math.round(w), Math.round(h));
}

function px(x, y, color = INK) {
  const P = View.P;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(View.ox + x * P - P / 2), Math.round(View.oy + y * P - P / 2), P, P);
}

// 픽셀 원 (중점 알고리즘). fade 0..1 이면 Bayer 로 점을 지운다.
function pxCircle(x, y, r, fade = 0, color = INK, dash = 0) {
  const P = View.P;
  const cx = Math.round(View.ox + x * P), cy = Math.round(View.oy + y * P);
  ctx.fillStyle = color;
  let xx = Math.round(r), yy = 0, err = 1 - xx;
  const lim = 16 * (1 - fade);
  const plot = (a, b) => {
    if (fade > 0 && bayerAt(a + 64, b + 64) >= lim) return;
    if (dash && ((Math.atan2(b, a) * 6 / Math.PI * dash + View.frame * 0.05) & 1)) return;
    ctx.fillRect(cx + a * P - (P >> 1), cy + b * P - (P >> 1), P, P);
  };
  while (xx >= yy) {
    plot(xx, yy); plot(yy, xx); plot(-yy, xx); plot(-xx, yy);
    plot(-xx, -yy); plot(-yy, -xx); plot(yy, -xx); plot(xx, -yy);
    yy++;
    if (err < 0) err += 2 * yy + 1;
    else { xx--; err += 2 * (yy - xx) + 1; }
  }
}

// 픽셀 선 (브레젠험, 월드 좌표)
function pxLine(x0, y0, x1, y1, color = INK, gap = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  const P = View.P;
  ctx.fillStyle = color;
  for (let guard = 0; guard < 2000; guard++) {
    if (!gap || (n++ % gap) === 0) ctx.fillRect(Math.round(View.ox + x0 * P - P / 2), Math.round(View.oy + y0 * P - P / 2), P, P);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function ditherDisc(x, y, r, lvl) {
  if (lvl <= 0) return;
  const P = View.P;
  ctx.fillStyle = Gfx.pattern(ctx, lvl);
  ctx.beginPath();
  ctx.arc(View.ox + x * P, View.oy + y * P, r * P, 0, TAU);
  ctx.fill();
}

// 파티클 깜빡임 페이드: 수명 끝 30% 동안 점점 덜 그린다
function fadeVisible(life, max, seed) {
  const f = life / max;
  if (f > 0.3) return true;
  return hash2(seed, (View.frame >> 1)) < f / 0.3;
}

function drawWorld() {
  const P = View.P;
  const sh = G.shake * G.shake;
  const t = performance.now() / 1000;
  const shx = noise1(t * 22, 1) * sh * 7 * P, shy = noise1(t * 22, 2) * sh * 7 * P;
  View.ox = View.W / 2 - (G.cam.x + (G.kickX || 0)) * P + shx;
  View.oy = View.H / 2 - (G.cam.y + (G.kickY || 0)) * P + shy;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, View.W, View.H);

  const style = STAGES[G.stage].ground;
  if (G.wipe) {
    // 새 차원이 플레이어에서부터 번진다
    Ground.draw(G.wipe.from);
    drawDeco(G.wipe.from);
    const u = easeOutCubic(G.wipe.t / G.wipe.dur);
    const R = u * Math.hypot(View.vw, View.vh) * 0.75;
    ctx.save();
    ctx.beginPath();
    ctx.arc(View.ox + G.p.x * P, View.oy + G.p.y * P, R * P, 0, TAU);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.clip();
    Ground.draw(style);
    drawDeco(style);
    ctx.restore();
    pxCircle(G.p.x, G.p.y, R, u * 0.6);
    pxCircle(G.p.x, G.p.y, R - 2, 0.5 + u * 0.4);
  } else {
    Ground.draw(style);
    drawDeco(style);
  }

  // 바닥 효과
  for (const f of G.fx) {
    if (f.type === 'mark') drawMark(f);
    else if (f.type === 'tele') drawTele(f);
    else if (f.type === 'shadow') drawShadow(f);
  }
  for (const tr of G.traps) drawTrap(tr);

  // 보석과 아이템
  for (const g of G.gems) drawGem(g);
  for (const it of G.items) drawItem(it);

  // 배우들 (y 정렬)
  const actors = [];
  for (const e of G.enemies) if (!e.dead && onScreen(e, 30)) actors.push(e);
  if (!G.p.dead && G.state !== 'title') actors.push(G.p);
  actors.sort((a, b) => (a.y + (a.h || 16) / 2) - (b.y + (b.h || 16) / 2));
  for (const a of actors) {
    if (a === G.p) drawPlayer();
    else drawEnemy(a);
  }

  for (const a of G.arrows) drawArrow(a);
  for (const b of G.ebullets) drawBullet(b);
  drawFalcons();
  drawFeathers();

  // 파티클
  for (const q of G.parts) {
    if (!fadeVisible(q.life, q.max, q.seed)) continue;
    if (q.kind === 'px') px(q.x, q.y - q.z);
    else if (q.kind === 'dust') { if ((q.seed + View.frame) & 1) px(q.x, q.y - q.z); }
    else if (q.kind === 'spark') {
      px(q.x, q.y);
      px(q.x - q.vx * 0.012, q.y - q.vy * 0.012);
    }
  }

  // 위 효과
  for (const f of G.fx) {
    const u = clamp(f.t / f.dur, 0, 1);
    switch (f.type) {
      case 'ring': {
        const r = lerp(f.r0, f.r1, easeOutCubic(u));
        pxCircle(f.x, f.y, r, u);
        if (f.thick > 1) pxCircle(f.x, f.y, r - 1, Math.min(1, u * 1.4));
        break;
      }
      case 'disc': ditherDisc(f.x, f.y, f.r * (0.7 + 0.3 * easeOutCubic(u)), 16 * Math.pow(1 - u, 1.6)); break;
      case 'bolt': drawBolt(f, u); break;
      case 'fall': drawFall(f); break;
      case 'stuck': drawStuck(f, u); break;
      case 'beam': drawBeam(f, u); break;
      case 'streak': drawStreak(f, u); break;
      case 'glint': drawGlint(f, u); break;
      case 'pierce': drawPierce(f, u); break;
      case 'text': drawWorldText(f, u); break;
    }
  }

  // 데미지 숫자
  for (const n of G.nums) drawNum(n);
}

function drawEnemy(e) {
  const nf = Gfx.frames(e.type);
  const rate = e.d.fly ? 9 : e.boss ? 3 : 5;
  const fr = nf > 1 ? Math.floor(e.animT * rate) % nf : 0;
  let v = e.flash > 0 ? 'f' : e.elite ? 'i' : 'n';
  if (e.spawnT < 1) v = e.spawnT < 0.34 ? 'd1' : e.spawnT < 0.67 ? 'd2' : 'd3';
  else if (e.d.ghost && e.flash <= 0 && Math.sin(e.t * 6 + e.seed) > 0.7) v = 'd3';
  if (e.spawnT <= 0.02) return;
  const c = Gfx.get(e.type, fr, v, e.face < 0);
  const s = e.sq.v;
  const scx = clamp(1 + (1 - s) * 0.8, 0.6, 1.5), scy = clamp(s, 0.55, 1.4);
  let bob = 0;
  if (!e.boss && !e.seg && e.d.beh !== 'hop' && e.d.beh !== 'float') bob = -Math.abs(Math.sin(e.animT * 7 + e.seed)) * 0.7;
  if (e.d.beh === 'float' || e.d.fly) bob = Math.sin(e.t * 3 + e.seed) * 1.4;
  const jit = e.jit || 0;
  if (e.z > 1 || e.d.fly) drawGroundDots(e.x, e.y + e.h / 2 - 1, e.r * 0.9);
  // 발끝 기준으로 그려서 스쿼시해도 발이 땅에 붙어 있다
  blit(c, e.x + jit, e.y - e.z + bob + e.h / 2, scx, scy, true);
  if (e.elite) pxCircle(e.x, e.y - e.z, e.r + 6 + Math.sin(e.t * 5) * 1, 0.55, INK, 2);
}

function drawGroundDots(x, y, r) {
  for (let i = -r; i <= r; i += 2) px(x + i, y);
}

function drawPlayer() {
  const p = G.p;
  if (p.invuln > 0 && p.hurtT <= 0 && (View.frame >> 2) & 1) return;
  const fr = p.moving ? 2 + (Math.floor(p.animT) % 4) : Math.floor(p.animT) % 2;
  const v = p.hurtT > 0 ? 'f' : 'n';
  const c = Gfx.get('archer', fr, v, p.face < 0);
  const s = p.sq.v;
  const scx = clamp(1 + (1 - s) * 0.7, 0.7, 1.4), scy = clamp(s, 0.6, 1.3);
  const h = Gfx.bitmaps.archer[0].h;
  // 활
  const aim = p.draw > 0.02 || p.recoil > 0.1 ? p.aim : (p.face > 0 ? 0.15 : Math.PI - 0.15);
  const bowC = Gfx.bows[p.draw > 0.45 ? 1 : 0][Gfx.angIndex(aim)];
  const reach = 5.5 - p.draw * 1.3 - p.recoil * 2.2;
  const bx = p.x + Math.cos(aim) * reach, by = p.y + 1 + Math.sin(aim) * reach * 0.8;
  const behind = Math.sin(aim) < -0.35;
  if (behind) blit(bowC, bx, by);
  blit(c, p.x, p.y + h / 2, scx, scy, true);
  if (!behind) blit(bowC, bx, by);
  // 체력 바
  if (p.hp < p.maxHp) {
    const P = View.P, w = 14, yy = p.y + h / 2 + 2;
    const X = Math.round(View.ox + (p.x - w / 2) * P), Y = Math.round(View.oy + yy * P);
    ctx.fillStyle = INK;
    ctx.fillRect(X - P, Y - P, (w + 2) * P, 3 * P);
    ctx.fillStyle = PAPER;
    ctx.fillRect(X, Y, w * P, P);
    ctx.fillStyle = p.hp < p.maxHp * 0.3 && (View.frame >> 3) & 1 ? PAPER : INK;
    ctx.fillRect(X, Y, Math.round(w * (p.hp / p.maxHp)) * P, P);
  }
  if (p.slowT > 0) pxCircle(p.x, p.y, 9, 0.5, INK, 3);
}

function drawArrow(a) {
  const set = Gfx.arrows[a.kind];
  const c = set[Gfx.angIndex(a.a)];
  const nx = Math.cos(a.a), ny = Math.sin(a.a);
  if (a.kind === 'long') {
    // 강궁: 길게 끌리는 잔상
    for (let k = 0; k < 7; k++) {
      const d = 10 + k * 3;
      if (k < 2 || ((View.frame + k) & 1)) px(a.x - nx * d, a.y - ny * d);
    }
  } else if (a.kind !== 'dart') {
    // 속도선
    if ((View.frame + (a.x | 0)) & 1) px(a.x - nx * 8, a.y - ny * 8);
    px(a.x - nx * 11, a.y - ny * 11);
  }
  blit(c, a.x, a.y);
}

function drawBullet(b) {
  if (b.kind === 'quill') { blit(Gfx.arrows.quill[Gfx.angIndex(b.a)], b.x, b.y); return; }
  const r = 2 + ((View.frame >> 2) & 1);
  pxCircle(b.x, b.y, r, 0, INK);
  px(b.x, b.y, (View.frame >> 3) & 1 ? INK : PAPER);
}

function drawGem(g) {
  const c = Gfx.get('gem' + g.k, 0, 'n');
  const bob = g.mag ? 0 : Math.sin(g.t * 3) * 0.6;
  blit(c, g.x, g.y - g.z + bob);
  // 반짝임
  if (!g.mag && (g.t * 0.7) % 2.2 < 0.12) {
    const s = g.k + 3;
    px(g.x + s * 0.6, g.y - g.z - s * 0.6);
    px(g.x + s * 0.6 + 1, g.y - g.z - s * 0.6);
    px(g.x + s * 0.6, g.y - g.z - s * 0.6 - 1);
  }
}

function drawItem(it) {
  const c = Gfx.get(it.kind, 0, 'n');
  const bob = Math.sin(it.t * 4) * 1.2;
  blit(c, it.x, it.y - it.z + bob - 2);
  if (!it.mag) pxCircle(it.x, it.y, 9 + Math.sin(it.t * 4) * 1.2, 0.5, INK, 2);
}

function drawTrap(t) {
  if (t.state === 'armed') {
    const c = Gfx.get('trapOpen', 0, t.t < 0.3 ? 'd2' : 'n');
    blit(c, t.x, t.y);
  } else {
    const v = t.t > 0.45 ? 'd1' : t.t > 0.3 ? 'd2' : 'n';
    blit(Gfx.get('trapShut', 0, v), t.x, t.y);
  }
}

function drawFalcons() {
  for (const f of G.falcons) {
    const fr = f.st === 'dive' ? 1 : Math.floor(f.t * 9) % 2;
    if (f.st === 'dive') for (let i = 1; i < f.trail.length; i += 2) blit(Gfx.get('falcon', 1, 'd1', f.vx < 0), f.trail[i][0], f.trail[i][1]);
    blit(Gfx.get('falcon', fr, 'n', f.vx < 0), f.x, f.y);
  }
}

function drawFeathers() {
  const w = G.weapons.find(x => x.id === 'feather');
  if (!w || G.featherR < 2) return;
  const n = W(w, 'count') + Stat.amount();
  const p = G.p;
  for (let i = 0; i < n; i++) {
    const a = G.featherA + (i / n) * TAU;
    const x = p.x + Math.cos(a) * G.featherR, y = p.y + Math.sin(a) * G.featherR;
    for (let k = 1; k <= 2; k++) {
      const b = a - k * 0.14;
      if ((View.frame + k) & 1) px(p.x + Math.cos(b) * G.featherR, p.y + Math.sin(b) * G.featherR);
    }
    blit(Gfx.feathers[Gfx.angIndex(a + Math.PI / 2)], x, y);
  }
}

function drawMark(f) {
  const u = f.t / f.dur;
  const fade = u < 0.15 ? 1 - u / 0.15 : u > 0.75 ? (u - 0.75) / 0.25 : 0;
  pxCircle(f.x, f.y, f.r, 0.35 + fade * 0.65, INK, 3);
  const s = 3;
  if (fade < 0.6) for (let i = -s; i <= s; i++) { px(f.x + i, f.y); px(f.x, f.y + i); }
}

function drawTele(f) {
  const u = f.t / f.dur;
  const blink = Math.floor(f.t * (8 + u * 22)) & 1;
  if (!blink && u < 0.9) return;
  const nx = Math.cos(f.ang), ny = Math.sin(f.ang);
  const qx = -ny, qy = nx;
  const hw = f.w / 2;
  for (let d = 4; d < f.len; d += 3) {
    px(f.x + nx * d + qx * hw, f.y + ny * d + qy * hw);
    px(f.x + nx * d - qx * hw, f.y + ny * d - qy * hw);
  }
  if (u > 0.55) for (let d = 6; d < f.len; d += 7) px(f.x + nx * d, f.y + ny * d);
}

function drawShadow(f) {
  const u = f.t / f.dur;
  const r = f.r * (0.3 + 0.7 * u);
  pxCircle(f.x, f.y, r, 0.55 - u * 0.4, INK, 2);
  if (u > 0.6) pxCircle(f.x, f.y, r * 0.5, 0.6);
}

function drawBolt(f, u) {
  if (!f.jag || View.frame % 3 === 0) {
    f.jag = [];
    for (let i = 0; i < f.pts.length - 1; i++) {
      const [ax, ay] = f.pts[i], [bx, by] = f.pts[i + 1];
      const seg = [[ax, ay]];
      const n = Math.max(2, Math.floor(Math.hypot(bx - ax, by - ay) / 7));
      for (let k = 1; k < n; k++) {
        const tt = k / n;
        seg.push([lerp(ax, bx, tt) + rand(-4, 4), lerp(ay, by, tt) + rand(-4, 4)]);
      }
      seg.push([bx, by]);
      f.jag.push(seg);
    }
  }
  if (u > 0.6 && View.frame & 1) return;
  for (const seg of f.jag) for (let i = 0; i < seg.length - 1; i++) pxLine(seg[i][0], seg[i][1], seg[i + 1][0], seg[i + 1][1]);
  for (let i = 1; i < f.pts.length; i++) if (u < 0.3) pxCircle(f.pts[i][0], f.pts[i][1], 3, 0.3);
}

function drawFall(f) {
  if (f.t < 0) return;
  const u = clamp(f.t / f.dur, 0, 1);
  const h = (1 - easeInCubic(u)) * 70;
  if (u < 1) blit(Gfx.arrows.arrow[Gfx.angIndex(Math.PI / 2)], f.x, f.y - h);
  if (u > 0.3) { px(f.x - 1, f.y + 1); px(f.x + 1, f.y + 1); }
}

function drawStuck(f, u) {
  if (u > 0.6 && (View.frame >> 1) & 1) return;
  const c = Gfx.arrows[f.kind || 'arrow'][Gfx.angIndex(f.a)];
  blit(c, f.x, f.y - (f.a === Math.PI / 2 ? 4 : 0));
}

// 발사 순간 공기를 가르는 직선
function drawStreak(f, u) {
  const nx = Math.cos(f.a), ny = Math.sin(f.a);
  const len = 14 + easeOutCubic(u) * 46;
  const from = easeInCubic(u) * len;
  pxLine(f.x + nx * from, f.y + ny * from, f.x + nx * len, f.y + ny * len, INK, 1 + Math.floor(u * 3));
}

// 만작 순간 화살촉의 번쩍임
function drawGlint(f, u) {
  const s = Math.round(3 * (1 - u)) + 1;
  for (let i = -s; i <= s; i++) { px(f.x + i, f.y); px(f.x, f.y + i); }
  if (u < 0.5) { px(f.x - 1, f.y - 1); px(f.x + 1, f.y + 1); px(f.x + 1, f.y - 1); px(f.x - 1, f.y + 1); }
}

// 관통 자국: 화살이 몸을 찢고 나가는 짧은 선
function drawPierce(f, u) {
  if (u > 0.5 && (View.frame & 1)) return;
  const nx = Math.cos(f.a), ny = Math.sin(f.a);
  const qx = -ny, qy = nx;
  const w = 3 * (1 - u);
  pxLine(f.x - nx * 5, f.y - ny * 5, f.x + nx * (10 + u * 8), f.y + ny * (10 + u * 8));
  pxLine(f.x + nx * 6 + qx * w, f.y + ny * 6 + qy * w, f.x + nx * 12 + qx * w * 1.5, f.y + ny * 12 + qy * w * 1.5);
  pxLine(f.x + nx * 6 - qx * w, f.y + ny * 6 - qy * w, f.x + nx * 12 - qx * w * 1.5, f.y + ny * 12 - qy * w * 1.5);
}

function drawBeam(f, u) {
  const P = View.P;
  const x = View.ox + f.x * P, y = View.oy + f.y * P;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(f.ang);
  const w = f.w * P * (1 - u * 0.6);
  ctx.fillStyle = u < 0.2 || View.frame & 1 ? INK : Gfx.pattern(ctx, 8);
  ctx.fillRect(0, -w / 2, f.len * P, w);
  ctx.restore();
}

function drawWorldText(f, u) {
  if (u > 0.7 && (View.frame >> 1) & 1) return;
  const [sx, sy] = worldToScreen(f.x, f.y - easeOutCubic(u) * 10);
  drawText(f.text, sx, sy, 12, f.color || INK, 'center', true);
}

function drawNum(n) {
  if (n.t > 0.5 && (View.frame >> 1) & 1) return;
  const str = String(n.v) + (n.crit ? '!' : '');
  const cw = 4 * View.P;
  const [sx, sy] = worldToScreen(n.x, n.y);
  let x = sx - (str.length * cw) / 2;
  const pop = n.t < 0.08 ? -View.P : 0;
  for (const ch of str) {
    const c = Gfx.digit(ch);
    ctx.drawImage(c, Math.round(x), Math.round(sy + pop));
    if (n.crit) ctx.drawImage(c, Math.round(x + View.P / 2), Math.round(sy + pop));
    x += cw;
  }
}

// Galmuri 텍스트 (외곽선 포함). size 는 CSS px 기준 (12의 배수 권장)
function drawText(str, x, y, size, color = INK, align = 'left', outline = false, bold = false, base = 'middle') {
  const U = View.U;
  ctx.font = (bold ? '700 ' : '400 ') + size * U + 'px Galmuri11, "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = base;
  x = Math.round(x); y = Math.round(y);
  if (outline) {
    ctx.fillStyle = PAPER;
    const o = U;
    for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) ctx.fillText(str, x + ox, y + oy);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

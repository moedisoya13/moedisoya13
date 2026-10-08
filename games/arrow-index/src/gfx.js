// ── 그래픽 기초: 스프라이트 래스터화, 디더, 픽셀 도형 ─────────────────
const INK = '#ece8dc';
const PAPER = '#08080a';
const UP = '#ff3b55';     // 상승 (한국식: 빨강)
const DOWN = '#2d7dff';   // 하락 (한국식: 파랑)

const INK_RGB = [0xec, 0xe8, 0xdc];
const PAPER_RGB = [0x08, 0x08, 0x0a];

// 4x4 Bayer 행렬 (0..15)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayerAt = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function parseRows(rows) {
  const h = rows.length;
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    for (let x = 0; x < w; x++) {
      const c = r[x] || '.';
      let v = 0;
      if (c === '#') v = 1;
      else if (c === 'o') v = 2;
      else if (c === ':') v = (x + y) & 1 ? 2 : 1;
      d[y * w + x] = v;
    }
  }
  return { w, h, d };
}

// 1px 외곽선 (값 3) 을 두른 새 비트맵
function withOutline(s) {
  const W = s.w + 2, H = s.h + 2;
  const d = new Uint8Array(W * H);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) d[(y + 1) * W + x + 1] = s.d[y * s.w + x];
  const o = d.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[y * W + x]) continue;
    let near = false;
    for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && d[yy * W + xx]) { near = true; break; }
    }
    if (near) o[y * W + x] = 3;
  }
  return { w: W, h: H, d: o };
}

// 변형: n 기본 · f 피격 섬광(전부 잉크) · i 반전(정예) · d1..d3 디더 페이드(25/50/75% 보임)
function colorOf(v, variant, x, y) {
  if (!v) return 0;
  switch (variant) {
    case 'f': return v === 3 ? 2 : 1;
    case 'i': return v === 1 ? 2 : 1;
    case 'd1': case 'd2': case 'd3': {
      const lvl = +variant[1] * 4;
      if (bayerAt(x, y) >= lvl) return 0;
      return v === 1 ? 1 : 2;
    }
    case 's': return v === 3 ? 0 : 2; // 실루엣 그림자 (검정)
    default: return v === 1 ? 1 : 2;
  }
}

function rasterize(s, P, variant = 'n', flip = false) {
  const small = document.createElement('canvas');
  small.width = s.w; small.height = s.h;
  const sg = small.getContext('2d');
  const img = sg.createImageData(s.w, s.h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const sx = flip ? s.w - 1 - x : x;
    const c = colorOf(s.d[y * s.w + sx], variant, x, y);
    if (!c) continue;
    const rgb = c === 1 ? INK_RGB : PAPER_RGB;
    const k = (y * s.w + x) * 4;
    img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
  }
  sg.putImageData(img, 0, 0);
  if (P === 1) return small;
  const c = document.createElement('canvas');
  c.width = s.w * P; c.height = s.h * P;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, c.width, c.height);
  return c;
}

const Gfx = {
  P: 4,
  bitmaps: {},   // name -> [bitmap with outline per frame]
  cache: new Map(),

  init() {
    for (const k in ART) this.bitmaps[k] = ART[k].map(f => withOutline(parseRows(f)));
    this.digitBm = {};
    for (const k in DIGITS) this.digitBm[k] = withOutline(parseRows(DIGITS[k]));
  },

  setScale(P) {
    if (this.P === P && this.cache.size) return;
    this.P = P;
    this.cache.clear();
    this.buildProcedural();
    this.buildDither();
  },

  // 스프라이트 캔버스 (지연 생성 + 캐시)
  get(name, frame = 0, variant = 'n', flip = false) {
    const key = name + '|' + frame + '|' + variant + '|' + (flip ? 1 : 0);
    let c = this.cache.get(key);
    if (!c) {
      const fr = this.bitmaps[name];
      const bm = fr[frame % fr.length];
      c = rasterize(bm, this.P, variant, flip);
      c.bw = bm.w; c.bh = bm.h;
      this.cache.set(key, c);
    }
    return c;
  },

  frames(name) { return this.bitmaps[name].length; },

  // 1배율 아이콘 → dataURL (DOM 카드용)
  iconURL(name, scale = 1) {
    const s = withOutline(parseRows(ICONS[name] || ICONS.bonus));
    return rasterize(s, scale).toDataURL();
  },
  spriteURL(name, frame = 0, scale = 1) {
    return rasterize(this.bitmaps[name][frame], scale).toDataURL();
  },

  digit(ch, variant = 'n') {
    const key = 'D|' + ch + '|' + variant;
    let c = this.cache.get(key);
    if (!c) {
      c = rasterize(this.digitBm[ch], this.P, variant);
      this.cache.set(key, c);
    }
    return c;
  },

  // ── 절차적 회전 스프라이트: 화살, 활, 깃털 ──
  ANG: 64,
  buildProcedural() {
    const P = this.P, N = this.ANG;
    this.arrows = {};
    const kinds = {
      arrow: { len: 11, head: 3, fletch: 2, thick: 0 },
      bolt: { len: 14, head: 4, fletch: 3, thick: 1 },
      dart: { len: 7, head: 2, fletch: 0, thick: 0 },
      quill: { len: 6, head: 0, fletch: 3, thick: 0 }, // 텐구 깃털 (적 탄)
    };
    for (const k in kinds) {
      const spec = kinds[k];
      this.arrows[k] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        this.arrows[k].push(this.rasterPts(this.arrowPts(a, spec), 19, P));
      }
    }
    // 활: 2 상태 x N 각도 (0 휴식, 1 당김)
    this.bows = [[], []];
    for (let st = 0; st < 2; st++) for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      this.bows[st].push(this.rasterPts(this.bowPts(a, st), 17, P));
    }
    this.feathers = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      this.feathers.push(this.rasterPts(this.featherPts(a), 13, P));
    }
  },

  arrowPts(a, s) {
    const pts = [];
    const cx = Math.cos(a), cy = Math.sin(a);
    const px = -cy, py = cx;
    const half = s.len / 2;
    for (let t = -half; t <= half; t += 0.35) {
      pts.push([cx * t, cy * t]);
      if (s.thick) pts.push([cx * t + px * 0.8, cy * t + py * 0.8]);
    }
    for (let j = 1; j <= s.head; j++) {
      const t = half - j;
      pts.push([cx * t + px * j * 0.75, cy * t + py * j * 0.75]);
      pts.push([cx * t - px * j * 0.75, cy * t - py * j * 0.75]);
    }
    for (let j = 0; j < s.fletch; j++) {
      const t = -half + j;
      pts.push([cx * (t - 1) + px * 1.2, cy * (t - 1) + py * 1.2]);
      pts.push([cx * (t - 1) - px * 1.2, cy * (t - 1) - py * 1.2]);
    }
    return pts;
  },

  bowPts(a, st) {
    const pts = [];
    const cx = Math.cos(a), cy = Math.sin(a);
    const px = -cy, py = cx;
    const R = 4.8;
    // 활대: 조준 방향으로 볼록한 호
    for (let t = -1; t <= 1.0001; t += 0.06) {
      const ang = t * 1.2;
      const along = (Math.cos(ang) * R - R) * 0.7 + 2;
      const side = Math.sin(ang) * R * 1.15;
      pts.push([cx * along + px * side, cy * along + py * side]);
    }
    const endAlong = (Math.cos(1.2) * R - R) * 0.7 + 2;
    const endSide = Math.sin(1.2) * R * 1.15;
    const pull = st ? -2.8 : endAlong;
    // 시위
    for (let t = 0; t <= 1.0001; t += 0.08) {
      const along1 = endAlong + (pull - endAlong) * t;
      const side1 = endSide * (1 - t);
      pts.push([cx * along1 + px * side1, cy * along1 - 0 + py * side1]);
      pts.push([cx * along1 - px * side1, cy * along1 - py * side1]);
    }
    if (st) for (let t = pull; t <= 5.5; t += 0.35) pts.push([cx * t, cy * t]); // 걸린 화살
    return pts;
  },

  featherPts(a) {
    const pts = [];
    const cx = Math.cos(a), cy = Math.sin(a);
    const px = -cy, py = cx;
    for (let t = -4; t <= 4; t += 0.35) pts.push([cx * t, cy * t]);
    for (let t = -2; t <= 3; t += 1) {
      const w = 1.6 - Math.abs(t - 0.5) * 0.35;
      pts.push([cx * t + px * w, cy * t + py * w]);
      if (t & 1) pts.push([cx * t - px * w, cy * t - py * w]);
    }
    return pts;
  },

  rasterPts(pts, size, P) {
    const h = size >> 1;
    const s = { w: size, h: size, d: new Uint8Array(size * size) };
    for (const [x, y] of pts) {
      const ix = Math.round(x) + h, iy = Math.round(y) + h;
      if (ix >= 0 && iy >= 0 && ix < size && iy < size) s.d[iy * size + ix] = 1;
    }
    const o = withOutline(s);
    const c = rasterize(o, P);
    c.bw = o.w; c.bh = o.h;
    return c;
  },

  angIndex(a) {
    const N = this.ANG;
    let i = Math.round((a / (Math.PI * 2)) * N) % N;
    if (i < 0) i += N;
    return i;
  },

  // ── 디더 패턴 (17단계, 4x4 Bayer) ──
  buildDither() {
    const P = this.P;
    this.ditherTiles = [];
    for (let lvl = 0; lvl <= 16; lvl++) {
      const c = document.createElement('canvas');
      c.width = 4 * P; c.height = 4 * P;
      const g = c.getContext('2d');
      g.fillStyle = INK;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayerAt(x, y) < lvl) g.fillRect(x * P, y * P, P, P);
      this.ditherTiles.push(c);
    }
    this.patterns = null;
  },
  pattern(ctx, lvl) {
    if (!this.patterns) this.patterns = this.ditherTiles.map(t => ctx.createPattern(t, 'repeat'));
    return this.patterns[clamp(Math.round(lvl), 0, 16)];
  },
};

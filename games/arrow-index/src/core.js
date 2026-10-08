'use strict';
// ── 공용 유틸 ───────────────────────────────────────────────────
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
// 프레임레이트와 무관한 지수 감쇠 보간
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const chance = p => Math.random() < p;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInCubic = t => t * t * t;
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutElastic = t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1);

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

// 정수 좌표 해시 → [0,1)
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 부드러운 1D 노이즈 (화면 흔들림용)
function noise1(t, seed) {
  const i = Math.floor(t), f = t - i;
  const a = hash2(i, seed) * 2 - 1, b = hash2(i + 1, seed) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// 감쇠 스프링 (스쿼시/스트레치, UI 바운스)
class Spring {
  constructor(v = 0, k = 320, c = 16) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
  step(dt) {
    const a = (this.t - this.v) * this.k - this.vel * this.c;
    this.vel += a * dt;
    this.v += this.vel * dt;
    return this.v;
  }
  kick(dv) { this.vel += dv; }
}

const fmtTime = s => {
  s = Math.max(0, Math.floor(s));
  return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const fmtInt = n => Math.round(n).toLocaleString('ko-KR');

// 간단한 공간 해시 (적 충돌 / 분리)
class Grid {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(cx, cy) { return (cx + 4096) * 8192 + (cy + 4096); }
  insert(e) {
    const c = this.cell;
    const k = this.key(Math.floor(e.x / c), Math.floor(e.y / c));
    let b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); }
    b.push(e);
  }
  // r 반경 안에 들 수 있는 후보들에 대해 fn 호출. fn 이 true 를 돌려주면 중단.
  query(x, y, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = this.map.get(this.key(cx, cy));
      if (!b) continue;
      for (let i = 0; i < b.length; i++) if (fn(b[i])) return;
    }
  }
}

const Store = {
  get(k, d) { try { const v = localStorage.getItem('arrowindex.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('arrowindex.' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
};

// 움직임 줄이기 설정이면 화면 흔들림과 반전 섬광을 약하게
const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

const QS = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();

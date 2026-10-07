export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// 순서를 신경 쓰지 않는 O(1) 삭제
export function swapRemove(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}

export function norm(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? [x / l, y / l] : [0, 0];
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtPct(p, digits = 1) {
  const v = (p * 100).toFixed(digits);
  return (p > 0 ? '+' : '') + v + '%';
}

// 고정 크기 균일 격자. 매 프레임 clear → insert → query.
export function createGrid(cell = 32) {
  return { cell, map: new Map(), pool: [] };
}

const key = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

export function gridClear(g) {
  for (const arr of g.map.values()) {
    arr.length = 0;
    g.pool.push(arr);
  }
  g.map.clear();
}

export function gridInsert(g, e) {
  const k = key(Math.floor(e.x / g.cell), Math.floor(e.y / g.cell));
  let a = g.map.get(k);
  if (!a) {
    a = g.pool.pop() || [];
    g.map.set(k, a);
  }
  a.push(e);
}

export function gridQuery(g, x, y, r, out) {
  out.length = 0;
  const c = g.cell;
  const x0 = Math.floor((x - r) / c);
  const x1 = Math.floor((x + r) / c);
  const y0 = Math.floor((y - r) / c);
  const y1 = Math.floor((y + r) / c);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const a = g.map.get(key(cx, cy));
      if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
    }
  }
  return out;
}

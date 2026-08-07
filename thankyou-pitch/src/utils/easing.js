export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** a→b 구간을 0→1로 정규화하고 잘라낸다. */
export const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1));

export const smoothstep = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

/** 프레임레이트에 독립적인 지수 감쇠 보간. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => t * (2 - t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuint = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInExpo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
export const linear = (t) => t;

export const EASINGS = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeOutQuint,
  easeInOutQuint,
  easeOutExpo,
  easeInExpo,
  easeOutBack,
  easeOutElastic,
  smoothstep,
};

export const resolveEase = (ease) =>
  typeof ease === 'function' ? ease : EASINGS[ease] || easeInOutCubic;

/**
 * 결정적(deterministic) 의사난수. 시크(seek)해도 같은 t에서 같은 값이 나와야
 * 스크럽 시 화면이 튀지 않는다.
 */
export const hashNoise = (x) => {
  const s = Math.sin(x * 127.1) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

/** 여러 옥타브를 겹친 부드러운 결정적 노이즈 (-1..1). */
export const smoothNoise = (x) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hashNoise(i), hashNoise(i + 1), u);
};

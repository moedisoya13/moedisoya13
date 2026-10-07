// 시각 효과 (파티클, 데미지 숫자, 링, 경고 표시). 게임 판정에는 영향 없음.

const MAX_PARTICLES = 400;
const MAX_TEXTS = 60;

export function addText(run, x, y, str, color = '#fff', opts = {}) {
  if (run.texts.length >= MAX_TEXTS) run.texts.shift();
  run.texts.push({ x, y, str, color, t: 0, life: opts.life || 0.6, vy: opts.vy ?? -28, big: !!opts.big });
}

export function addSparks(run, x, y, n, color = '#fff', speed = 60, life = 0.3) {
  for (let i = 0; i < n && run.particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    run.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: life * (0.6 + Math.random() * 0.6), color, g: 0 });
  }
}

export function addDebris(run, x, y, n, color, speed = 70) {
  for (let i = 0; i < n && run.particles.length < MAX_PARTICLES; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const s = speed * (0.5 + Math.random() * 0.7);
    run.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.5 + Math.random() * 0.3, color, g: 260 });
  }
}

export function addRing(run, x, y, r, color = '#fff', life = 0.25, follow = false) {
  run.rings.push({ x, y, r, color, t: 0, life, follow });
}

// 보스 공격 예고 (원형 또는 직선)
export function addTelegraph(run, o) {
  run.telegraphs.push({ t: 0, ...o });
}

export function updateEffects(run, dt) {
  const ps = run.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.t += dt;
    if (p.t >= p.life) {
      ps[i] = ps[ps.length - 1];
      ps.pop();
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    if (!p.g) p.vy *= 0.96;
  }
  for (let i = run.texts.length - 1; i >= 0; i--) {
    const t = run.texts[i];
    t.t += dt;
    t.y += t.vy * dt;
    t.vy *= 0.92;
    if (t.t >= t.life) run.texts.splice(i, 1);
  }
  for (let i = run.rings.length - 1; i >= 0; i--) {
    const r = run.rings[i];
    r.t += dt;
    if (r.follow) {
      r.x = run.player.x;
      r.y = run.player.y;
    }
    if (r.t >= r.life) run.rings.splice(i, 1);
  }
  for (let i = run.telegraphs.length - 1; i >= 0; i--) {
    const g = run.telegraphs[i];
    g.t += dt;
    if (g.t >= g.life) run.telegraphs.splice(i, 1);
  }
  if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 18);
  if (run.flash > 0) run.flash = Math.max(0, run.flash - dt * 3);
}

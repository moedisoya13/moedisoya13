// 공격 판정 + 투사체. 근접 공격(펀치·발차기)도 짧게 사는 판정 원으로 통일해 다룬다.

import { gridQuery, dist2 } from './util.js';
import { hitEnemy } from './enemies.js';
import { hurtPlayer } from './player.js';
import { breakProp } from './world.js';
import { addSparks, addDebris, addRing } from './effects.js';

const tmp = [];

export function addProj(run, o) {
  const p = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ay: 0,
    r: 6,
    dmg: 0,
    pierce: Infinity,
    life: 1,
    t: 0,
    knock: 40,
    kind: null,
    rot: 0,
    vrot: 0,
    owner: 'p',
    rehit: 0,
    hits: null,
    follow: false,
    ox: 0,
    oy: 0,
    orbit: null,
    onEnd: null,
    collide: true,
    shield: false,
    alpha: 1,
    z: 0,
    dead: false,
    ...o,
  };
  if (p.owner === 'p' && p.collide) p.hits = new Map();
  run.projectiles.push(p);
  return p;
}

export function updateProjectiles(run, dt) {
  const pl = run.player;
  const list = run.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.t += dt;
    if (p.t >= p.life || p.dead) {
      if (p.onEnd && !p.dead) p.onEnd(run, p);
      list[i] = list[list.length - 1];
      list.pop();
      continue;
    }

    if (p.orbit) {
      p.orbit.a += p.orbit.spd * dt;
      p.x = pl.x + Math.cos(p.orbit.a) * p.orbit.rad;
      p.y = pl.y + Math.sin(p.orbit.a) * p.orbit.rad;
      p.rot = p.orbit.a + Math.PI / 2;
    } else if (p.follow) {
      p.x = pl.x + p.ox;
      p.y = pl.y + p.oy;
    } else {
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
    }

    if (p.owner === 'p') {
      if (!p.collide) continue;
      collideEnemies(run, p);
      if (!p.dead) collideProps(run, p);
    } else {
      // 적 투사체: 방패(우산)에 막히거나 플레이어에 맞는다
      if (blockedByShield(run, p)) continue;
      const rr = p.r + 4;
      if (dist2(p.x, p.y, pl.x, pl.y) < rr * rr) {
        hurtPlayer(run, p.dmg);
        p.dead = true;
      }
    }
  }
}

function collideEnemies(run, p) {
  const near = gridQuery(run.grid, p.x, p.y, p.r + 16, tmp);
  for (let j = 0; j < near.length; j++) {
    const e = near[j];
    if (e.dead) continue;
    const rr = p.r + e.r;
    if (dist2(p.x, p.y, e.x, e.y) > rr * rr) continue;
    const last = p.hits.get(e.id);
    if (last !== undefined && (p.rehit <= 0 || p.t - last < p.rehit)) continue;
    p.hits.set(e.id, p.t);
    // 넉백 방향: 판정 중심 → 적 (궤도/근접), 진행 방향 (투사체)
    let kx = e.x - p.x;
    let ky = e.y - p.y;
    if (!p.follow && !p.orbit && (p.vx || p.vy)) {
      kx = p.vx;
      ky = p.vy;
    }
    hitEnemy(run, e, p.dmg, kx, ky, p.knock);
    if (--p.pierce <= 0) {
      p.dead = true;
      if (p.onEnd) p.onEnd(run, p);
      return;
    }
  }
}

function collideProps(run, p) {
  const props = run.world.props;
  for (let k = props.length - 1; k >= 0; k--) {
    const o = props[k];
    const rr = p.r + o.r;
    if (dist2(p.x, p.y, o.x, o.y) < rr * rr) breakProp(run, o);
  }
}

function blockedByShield(run, shot) {
  for (const s of run.projectiles) {
    if (!s.shield) continue;
    const rr = s.r + shot.r;
    if (dist2(s.x, s.y, shot.x, shot.y) < rr * rr) {
      // 반사: 내 투사체가 되어 되돌아간다
      shot.owner = 'p';
      shot.vx *= -1.3;
      shot.vy *= -1.3;
      shot.dmg = Math.max(shot.dmg * 2, s.dmg);
      shot.pierce = 2;
      shot.collide = true;
      shot.hits = new Map();
      shot.life = shot.t + 1.2;
      addSparks(run, shot.x, shot.y, 5, '#bfe6ff', 50);
      run.sfx.push('block');
      return true;
    }
  }
  return false;
}

// 병이 깨질 때: 작은 범위 피해
export function shatter(run, p) {
  addProj(run, { x: p.x, y: p.y, r: p.splash, dmg: p.dmg, life: 0.08, knock: 30, kind: null });
  addDebris(run, p.x, p.y, 7, '#7fd17a', 60);
  addRing(run, p.x, p.y, p.splash, '#a8f0a0', 0.18);
  run.sfx.push('glass');
}

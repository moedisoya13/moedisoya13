// 적 정의 · AI · 피격/사망 처리.

import { gridQuery, dist2, norm } from './util.js';
import { hurtPlayer } from './player.js';
import { addText, addSparks, addRing, addTelegraph } from './effects.js';
import { dropXp, dropCoin, dropItem } from './pickups.js';
import { applyShock } from './market.js';
import { addProj } from './projectiles.js';
import { COIN_DROP_CHANCE, ENEMY_CAP } from './config.js';

export const ENEMY_TYPES = {
  thug: { name: '양아치', hp: 9, speed: 26, dmg: 4, r: 5, xp: 1, sprite: 'thug' },
  knife: { name: '칼잡이', hp: 15, speed: 36, dmg: 6, r: 5, xp: 2, sprite: 'knife' },
  biker: { name: '폭주족', hp: 26, speed: 105, dmg: 12, r: 8, xp: 3, sprite: 'biker', ai: 'charge', knockResist: 0.9 },
  ninja: { name: '닌자', hp: 30, speed: 48, dmg: 8, r: 5, xp: 4, sprite: 'ninja', ai: 'zigzag' },
  thrower: { name: '표창수', hp: 22, speed: 30, dmg: 5, r: 5, xp: 4, sprite: 'thrower', ai: 'ranged' },
  heavy: { name: '덩치', hp: 110, speed: 22, dmg: 12, r: 8, xp: 12, sprite: 'heavy', knockResist: 0.7 },
  boss1: { name: '거구 마이크', hp: 1400, speed: 28, dmg: 18, r: 13, xp: 80, sprite: 'boss1', ai: 'slam', boss: true, knockResist: 0.95 },
  boss2: { name: '삼합회 두목', hp: 3800, speed: 34, dmg: 20, r: 13, xp: 150, sprite: 'boss2', ai: 'triad', boss: true, knockResist: 0.95 },
  boss3: { name: '흑룡 사부', hp: 9000, speed: 40, dmg: 24, r: 14, xp: 300, sprite: 'boss3', ai: 'master', boss: true, knockResist: 0.97 },
};

// 시간이 갈수록 졸개 체력이 오른다 (15분에 약 3.2배)
export function hpMul(t) {
  return 1 + (t / 60) * 0.15;
}

let nextId = 1;
const tmp = [];

export function spawnEnemy(run, type, x, y) {
  const def = ENEMY_TYPES[type];
  if (!def) return null;
  if (!def.boss && run.enemies.length >= ENEMY_CAP) return null;
  const hp = def.boss ? def.hp : Math.round(def.hp * hpMul(run.t));
  const e = {
    id: nextId++,
    type,
    def,
    x,
    y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    hp,
    maxHp: hp,
    r: def.r,
    flash: 0,
    facing: 1,
    animT: Math.random() * 10,
    t: 0,
    st: 'move',
    stT: 0,
    timer: 0,
    timer2: 0,
    timer3: 0,
    dead: false,
    seed: Math.random() * Math.PI * 2,
  };
  if (def.ai === 'charge') {
    const [dx, dy] = norm(run.player.x - x, run.player.y - y);
    e.vx = dx * def.speed;
    e.vy = dy * def.speed;
    e.facing = dx >= 0 ? 1 : -1;
  }
  if (def.ai === 'ranged') e.timer = 1 + Math.random() * 2;
  if (def.boss) {
    e.timer = 3;
    e.timer2 = 6;
    e.timer3 = 8;
    run.boss = e;
    run.events.push({ type: 'boss', name: def.name });
    run.sfx.push('boss');
  }
  run.enemies.push(e);
  return e;
}

export function updateEnemies(run, dt) {
  const pl = run.player;
  const list = run.enemies;
  const view = run.view;
  const farR = Math.max(view.w, view.h) * 0.85 + 60;

  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead) {
      list[i] = list[list.length - 1];
      list.pop();
      continue;
    }
    const def = e.def;
    e.t += dt;
    e.animT += dt;
    if (e.flash > 0) e.flash -= dt;

    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;

    switch (def.ai) {
      case 'charge':
        // 직선 돌진. 화면 밖으로 멀어지면 사라진다
        if (e.t > 1.5 && d > farR) {
          e.dead = true;
          continue;
        }
        break;
      case 'zigzag': {
        const side = Math.sin(e.t * 5 + e.seed) * 0.9;
        e.vx = (ux - uy * side) * def.speed;
        e.vy = (uy + ux * side) * def.speed;
        break;
      }
      case 'ranged':
        aiRanged(run, e, d, ux, uy, dt);
        break;
      case 'slam':
        aiSlam(run, e, d, ux, uy, dt);
        break;
      case 'triad':
        aiTriad(run, e, d, ux, uy, dt);
        break;
      case 'master':
        aiMaster(run, e, d, ux, uy, dt);
        break;
      default:
        e.vx = ux * def.speed;
        e.vy = uy * def.speed;
    }

    // 넉백은 감쇠하는 별도 속도
    e.x += (e.vx + e.kx) * dt;
    e.y += (e.vy + e.ky) * dt;
    const decay = Math.pow(0.0005, dt);
    e.kx *= decay;
    e.ky *= decay;
    if (Math.abs(e.vx) > 2) e.facing = e.vx > 0 ? 1 : -1;

    // 너무 멀어진 졸개는 진행 방향 앞쪽으로 재배치 (뱀서식 리사이클)
    if (!def.boss && def.ai !== 'charge' && d > farR) {
      relocateAhead(run, e);
      continue;
    }

    // 접촉 피해
    const rr = e.r + 4;
    if (e.st !== 'air' && d < rr) hurtPlayer(run, def.dmg);
  }

  separate(run);
}

// 같은 칸 이웃끼리 살짝 밀어내기 — 한 점에 겹쳐 뭉치는 것만 막는 수준
function separate(run) {
  const g = run.grid;
  for (const e of run.enemies) {
    if (e.def.boss || e.def.ai === 'charge') continue;
    const near = gridQuery(g, e.x, e.y, e.r * 2, tmp);
    for (let j = 0; j < near.length && j < 8; j++) {
      const o = near[j];
      if (o === e || o.dead) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const min = e.r + o.r - 2;
      const dd = dx * dx + dy * dy;
      if (dd > 0.01 && dd < min * min) {
        const dist = Math.sqrt(dd);
        const push = (min - dist) * 0.35;
        e.x += (dx / dist) * push;
        e.y += (dy / dist) * push;
      }
    }
  }
}

function relocateAhead(run, e) {
  const pl = run.player;
  const R = Math.hypot(run.view.w, run.view.h) / 2 + 20;
  let a;
  if (pl.moving) a = Math.atan2(pl.vy, pl.vx) + (Math.random() - 0.5) * 1.6;
  else a = Math.random() * Math.PI * 2;
  e.x = run.cam.x + Math.cos(a) * R;
  e.y = run.cam.y + Math.sin(a) * R;
  e.kx = e.ky = 0;
}

function aiRanged(run, e, d, ux, uy, dt) {
  const sp = e.def.speed;
  if (d > 95) {
    e.vx = ux * sp;
    e.vy = uy * sp;
  } else if (d < 65) {
    e.vx = -ux * sp;
    e.vy = -uy * sp;
  } else {
    // 옆으로 게걸음
    e.vx = -uy * sp * 0.6;
    e.vy = ux * sp * 0.6;
  }
  e.timer -= dt;
  if (e.timer <= 0 && d < 160) {
    e.timer = 2.6 + Math.random();
    enemyShot(run, e.x, e.y, ux, uy, 85, e.def.dmg, 'shuriken');
  }
}

function enemyShot(run, x, y, ux, uy, speed, dmg, kind) {
  addProj(run, { x, y, vx: ux * speed, vy: uy * speed, r: 3, dmg, life: 3.5, owner: 'e', kind, vrot: 14 });
}

function fan(run, e, n, spread, speed, dmg, kind) {
  const base = Math.atan2(run.player.y - e.y, run.player.x - e.x);
  for (let k = 0; k < n; k++) {
    const a = base + (n === 1 ? 0 : (k / (n - 1) - 0.5) * spread);
    enemyShot(run, e.x, e.y, Math.cos(a), Math.sin(a), speed, dmg, kind);
  }
}

function summonRing(run, type, n, R) {
  const pl = run.player;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    spawnEnemy(run, type, pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R);
  }
}

// 거구: 점프 내려찍기
function aiSlam(run, e, d, ux, uy, dt) {
  const sp = e.def.speed;
  e.stT -= dt;
  if (e.st === 'move') {
    e.vx = ux * sp;
    e.vy = uy * sp;
    e.timer -= dt;
    if (e.timer <= 0) {
      e.st = 'wind';
      e.stT = 0.9;
      e.tx = run.player.x;
      e.ty = run.player.y;
      addTelegraph(run, { kind: 'circle', x: e.tx, y: e.ty, r: 34, life: 1.25 });
    }
  } else if (e.st === 'wind') {
    e.vx = e.vy = 0;
    if (e.stT <= 0) {
      e.st = 'air';
      e.stT = 0.35;
      e.sx = e.x;
      e.sy = e.y;
    }
  } else if (e.st === 'air') {
    e.vx = (e.tx - e.sx) / 0.35;
    e.vy = (e.ty - e.sy) / 0.35;
    if (e.stT <= 0) {
      e.st = 'move';
      e.timer = 3.5;
      e.x = e.tx;
      e.y = e.ty;
      e.vx = e.vy = 0;
      run.shake = 6;
      run.sfx.push('slam');
      addRing(run, e.x, e.y, 34, '#ffb347', 0.3);
      addSparks(run, e.x, e.y, 16, '#c9a27a', 90);
      if (dist2(e.x, e.y, run.player.x, run.player.y) < 38 * 38) hurtPlayer(run, 22);
    }
  }
}

// 두목: 칼 부채꼴 + 졸개 소환
function aiTriad(run, e, d, ux, uy, dt) {
  const sp = e.def.speed;
  e.vx = ux * sp;
  e.vy = uy * sp;
  e.timer -= dt;
  e.timer2 -= dt;
  if (e.timer <= 0) {
    e.timer = 3;
    fan(run, e, 5, 0.7, 95, 10, 'knife');
    run.sfx.push('throw');
  }
  if (e.timer2 <= 0) {
    e.timer2 = 9;
    summonRing(run, 'thug', 8, 100);
    addText(run, e.x, e.y - 30, '얘들아!', '#ffd2d2', { life: 1, big: true });
  }
}

// 흑룡 사부: 돌진 + 표창 + 닌자 소환
function aiMaster(run, e, d, ux, uy, dt) {
  const sp = e.def.speed;
  e.stT -= dt;
  e.timer -= dt;
  e.timer2 -= dt;
  e.timer3 -= dt;
  if (e.st === 'move') {
    e.vx = ux * sp;
    e.vy = uy * sp;
    if (e.timer <= 0) {
      e.st = 'wind';
      e.stT = 0.6;
      e.dx = ux;
      e.dy = uy;
      addTelegraph(run, { kind: 'line', x: e.x, y: e.y, dx: ux, dy: uy, len: 150, w: 14, life: 0.6 });
    }
  } else if (e.st === 'wind') {
    e.vx = e.vy = 0;
    if (e.stT <= 0) {
      e.st = 'dash';
      e.stT = 0.55;
      run.sfx.push('dash');
    }
  } else if (e.st === 'dash') {
    e.vx = e.dx * 270;
    e.vy = e.dy * 270;
    if (e.stT <= 0) {
      e.st = 'move';
      e.timer = 4.5;
    }
  }
  if (e.timer2 <= 0) {
    e.timer2 = 3.5;
    fan(run, e, 7, 1.1, 100, 10, 'shuriken');
    run.sfx.push('throw');
  }
  if (e.timer3 <= 0) {
    e.timer3 = 11;
    summonRing(run, 'ninja', 6, 110);
  }
}

const COMIC = ['POW!', 'BAM!', 'WHAM!', 'KAPOW!', 'BIFF!'];

export function hitEnemy(run, e, dmg, kx, ky, knock) {
  if (e.dead) return;
  const crit = Math.random() < 0.08;
  const amount = Math.round(dmg * (crit ? 2 : 1));
  e.hp -= amount;
  e.flash = 0.1;
  const resist = e.def.knockResist || 0;
  if (knock && resist < 1) {
    const l = Math.hypot(kx, ky) || 1;
    e.kx += (kx / l) * knock * (1 - resist) * 2.2;
    e.ky += (ky / l) * knock * (1 - resist) * 2.2;
  }
  run.stats.damage += amount;
  addText(run, e.x, e.y - e.r - 6, String(amount), crit ? '#ffe14d' : '#ffffff', { big: crit });
  run.sfx.push('hit');
  if (e.hp <= 0) killEnemy(run, e);
}

export function killEnemy(run, e) {
  e.dead = true;
  run.kills++;
  const def = e.def;
  addSparks(run, e.x, e.y, def.boss ? 40 : 6, '#ffffff', def.boss ? 140 : 70);
  if (Math.random() < 0.03) addText(run, e.x, e.y - 14, COMIC[Math.floor(Math.random() * COMIC.length)], '#ffe14d', { life: 0.7, big: true });
  dropXp(run, e.x, e.y, def.xp);
  if (Math.random() < COIN_DROP_CHANCE * (def.xp >= 4 ? 1.6 : 1)) dropCoin(run, e.x + 3, e.y + 2, def.xp >= 10 ? 5 : 1);
  if (e.type === 'heavy' && Math.random() < 0.25) dropItem(run, 'food', e.x, e.y);

  if (def.boss) {
    run.boss = null;
    run.bossesKilled++;
    run.shake = 10;
    run.sfx.push('bossdown');
    for (let k = 0; k < 18; k++) dropCoin(run, e.x + (Math.random() - 0.5) * 50, e.y + (Math.random() - 0.5) * 50, 5);
    dropItem(run, 'chest', e.x, e.y);
    addText(run, e.x, e.y - 30, `${def.name} 제압!`, '#ffe14d', { life: 1.6, big: true });
    // 시장 연동: 재키 활약 → 드래곤국수 CF 효과
    const ev = applyShock(run.market, 'DGN', 0.18 + Math.random() * 0.14, `재키, ${def.name} 제압! 드래곤국수 CF 섭외설`, run.mrng);
    if (ev) run.events.push(ev);
  }

  // 500킬마다 후원 계약 뉴스
  if (run.kills % 500 === 0) {
    const ev = applyShock(run.market, 'LTS', 0.08, `연꽃전자, 재키와 후원 계약 (${run.kills}킬 기념)`, run.mrng);
    if (ev) run.events.push(ev);
  }
}

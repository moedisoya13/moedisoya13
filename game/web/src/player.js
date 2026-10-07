import { PLAYER, xpToNext } from './config.js';
import { addText, addSparks, addRing } from './effects.js';
import { clamp } from './util.js';

export function computeStats(player, meta) {
  const p = player.passives;
  const lv = (id) => p[id] || 0;
  return {
    might: 1 + 0.1 * lv('might') + 0.05 * (meta.might || 0),
    speed: PLAYER.speed * (1 + 0.08 * lv('shoes') + 0.05 * (meta.speed || 0)),
    cooldown: Math.max(0.5, 1 - 0.06 * lv('breath')),
    area: 1 + 0.1 * lv('qi'),
    maxHp: PLAYER.baseHp + 20 * lv('vitality') + 10 * (meta.hp || 0),
    recovery: 0.25 * lv('recovery'),
    magnet: PLAYER.pickupRadius * (1 + 0.3 * lv('magnet') + 0.15 * (meta.magnet || 0)),
    greed: 1 + 0.15 * lv('greed') + 0.1 * (meta.greed || 0),
    amount: lv('clone'),
  };
}

export function createPlayer(meta) {
  const p = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    aimX: 1,
    aimY: 0,
    facing: 1,
    hp: 1,
    level: 1,
    xp: 0,
    xpNext: xpToNext(1),
    coins: (meta.seed || 0) * 20,
    weapons: [{ id: 'punch', level: 1, cd: 0.4, st: {} }],
    passives: {},
    stats: null,
    iframes: 0,
    pose: null, // 'punch' | 'kick' | 'hurt' | 'pose'
    poseT: 0,
    animT: 0,
    moving: false,
    pendingLevels: 0,
  };
  p.stats = computeStats(p, meta);
  p.hp = p.stats.maxHp;
  return p;
}

export function refreshStats(run) {
  const p = run.player;
  const oldMax = p.stats.maxHp;
  p.stats = computeStats(p, run.meta);
  if (p.stats.maxHp > oldMax) p.hp += p.stats.maxHp - oldMax;
  p.hp = Math.min(p.hp, p.stats.maxHp);
}

export function setPose(p, pose, dur) {
  // 피격 포즈는 공격 포즈에 덮이지 않게
  if (p.pose === 'hurt' && p.poseT > 0 && pose !== 'hurt') return;
  p.pose = pose;
  p.poseT = dur;
}

export function updatePlayer(run, input, dt) {
  const p = run.player;
  const ix = input.x;
  const iy = input.y;
  const mag = Math.min(1, Math.hypot(ix, iy));
  p.moving = mag > 0.12;
  if (p.moving) {
    const l = Math.hypot(ix, iy);
    p.aimX = ix / l;
    p.aimY = iy / l;
    if (Math.abs(ix) > 0.15) p.facing = ix > 0 ? 1 : -1;
  }
  const sp = p.stats.speed * (p.moving ? mag : 0);
  p.vx = p.moving ? (ix / Math.hypot(ix, iy)) * sp : 0;
  p.vy = p.moving ? (iy / Math.hypot(ix, iy)) * sp : 0;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  p.animT += dt * (p.moving ? 1 : 0.5);
  if (p.poseT > 0) {
    p.poseT -= dt;
    if (p.poseT <= 0) p.pose = null;
  }
  if (p.iframes > 0) p.iframes -= dt;
  if (p.stats.recovery > 0 && p.hp < p.stats.maxHp) {
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.recovery * dt);
  }
}

export function addXp(run, amount) {
  const p = run.player;
  p.xp += amount;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpToNext(p.level);
    p.pendingLevels++;
  }
}

// 현재 레벨 진행분 안에서만 XP 를 쓴다 — 레벨이 내려가지는 않는다.
export function spendXp(run, amount) {
  const p = run.player;
  p.xp = Math.max(0, p.xp - amount);
}

export function healPlayer(run, amount) {
  const p = run.player;
  const before = p.hp;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount);
  const got = Math.round(p.hp - before);
  if (got > 0) addText(run, p.x, p.y - 16, `+${got}`, '#7dff8a');
}

const OUCH = ['아야!', '아야야', '으악', '윽!', '아이고'];

export function hurtPlayer(run, dmg) {
  const p = run.player;
  if (p.iframes > 0 || run.over || run.debug?.god) return false;
  p.hp -= dmg;
  p.iframes = PLAYER.iframes;
  setPose(p, 'hurt', 0.25);
  run.shake = Math.max(run.shake, 3);
  run.flash = Math.max(run.flash, 0.35);
  run.sfx.push('hurt');
  if (Math.random() < 0.3) addText(run, p.x, p.y - 22, OUCH[Math.floor(Math.random() * OUCH.length)], '#ffd2d2', { life: 0.7 });
  if (p.hp <= 0) {
    if (run.revives > 0) {
      run.revives--;
      p.hp = p.stats.maxHp * 0.5;
      p.iframes = 2;
      run.events.push({ type: 'revive' });
      addText(run, p.x, p.y - 26, '스턴트 대역 투입!', '#ffe14d', { life: 1.4, big: true });
      addRing(run, p.x, p.y, 90, '#ffe14d', 0.5);
      addSparks(run, p.x, p.y, 30, '#ffe14d', 120);
      // 주변 적을 날려버린다
      for (const e of run.enemies) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 90 && !e.def.boss) {
          e.kx += (dx / (d || 1)) * 260;
          e.ky += (dy / (d || 1)) * 260;
        }
      }
    } else {
      p.hp = 0;
      run.events.push({ type: 'dead' });
    }
  }
  return true;
}

export function hpRatio(p) {
  return clamp(p.hp / p.stats.maxHp, 0, 1);
}

// 기술(무기) 정의. 맨손 쿵푸 + 그 자리에 있는 소품을 휘두르는 재키 스타일.
// 각 기술은 Lv1~8 표(L[n-1])와 update(w, run, dt) 를 가진다.

import { addProj, shatter } from './projectiles.js';
import { addRing } from './effects.js';
import { setPose } from './player.js';
import { gridQuery, dist2 } from './util.js';

const tmp = [];

function nearestEnemies(run, x, y, range, n) {
  const near = gridQuery(run.grid, x, y, range, tmp);
  const list = [];
  for (const e of near) {
    if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < range * range) list.push([d, e]);
  }
  list.sort((a, b) => a[0] - b[0]);
  return list.slice(0, n).map((v) => v[1]);
}

function randomEnemyNear(run, x, y, range) {
  const near = gridQuery(run.grid, x, y, range, tmp).filter((e) => !e.dead && dist2(x, y, e.x, e.y) < range * range);
  return near.length ? near[Math.floor(Math.random() * near.length)] : null;
}

const T = (arr) => (lv) => arr[Math.min(arr.length, lv) - 1];

export const WEAPONS = {
  punch: {
    name: '연타 펀치',
    icon: 'i_punch',
    max: 8,
    desc: ['이동 방향으로 주먹을 날린다', '연타 +1', '피해 +2, 범위 증가', '연타 +1', '뒤쪽도 친다', '피해 +2', '연타 +1', '피해 +3, 쿨타임 감소'],
    cd: T([0.9, 0.9, 0.85, 0.8, 0.8, 0.75, 0.7, 0.6]),
    hits: T([1, 2, 2, 3, 3, 3, 4, 4]),
    dmg: T([9, 10, 12, 12, 14, 16, 17, 20]),
    r: T([9, 9, 10, 10, 11, 11, 12, 13]),
    update(w, run, dt) {
      const p = run.player;
      const s = p.stats;
      const st = w.st;
      if (st.queue > 0) {
        st.gap -= dt;
        if (st.gap <= 0) {
          st.gap = 0.08;
          const idx = st.total - st.queue;
          st.queue--;
          const r = this.r(w.level) * s.area;
          const reach = 10 + r * 0.6;
          const side = (idx % 2 === 0 ? 1 : -1) * 3;
          // 근처에 적이 있으면 자동 조준 (폰에서 조준까지 시키면 너무 바쁘다).
          // Lv5 부터 짝수번째 주먹은 두 번째로 가까운 적(없으면 뒤쪽)을 노린다.
          const back = w.level >= 5 && idx % 2 === 1;
          const targets = nearestEnemies(run, p.x, p.y, 34 + r, 2);
          let ax = p.aimX;
          let ay = p.aimY;
          const tgt = back ? targets[1] : targets[0];
          if (tgt) {
            const l = Math.hypot(tgt.x - p.x, tgt.y - p.y) || 1;
            ax = (tgt.x - p.x) / l;
            ay = (tgt.y - p.y) / l;
          } else if (back) {
            ax = -ax;
            ay = -ay;
          }
          if (Math.abs(ax) > 0.2 && !p.moving) p.facing = ax > 0 ? 1 : -1;
          addProj(run, {
            follow: true,
            ox: ax * reach - ay * side,
            oy: ay * reach + ax * side,
            r,
            dmg: this.dmg(w.level) * s.might,
            life: 0.12,
            knock: 30,
            kind: 'fist',
            rot: Math.atan2(ay, ax),
          });
          setPose(p, 'punch', 0.12);
          run.sfx.push('swing');
        }
      }
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = this.cd(w.level) * s.cooldown;
        st.total = this.hits(w.level) + s.amount;
        st.queue = st.total;
        st.gap = 0;
      }
    },
  },

  kick: {
    name: '회전 발차기',
    icon: 'i_kick',
    max: 8,
    desc: ['주변 적을 발차기로 날려버린다', '피해 +2', '범위 증가', '쿨타임 감소', '피해 +2, 범위 증가', '쿨타임 감소', '피해 +2', '피해 +4, 범위 대폭 증가'],
    cd: T([3.0, 2.8, 2.7, 2.4, 2.3, 2.1, 2.0, 1.8]),
    dmg: T([12, 14, 14, 16, 18, 20, 22, 26]),
    r: T([26, 26, 29, 29, 32, 34, 35, 40]),
    update(w, run, dt) {
      const p = run.player;
      const s = p.stats;
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = this.cd(w.level) * s.cooldown;
        const r = this.r(w.level) * s.area;
        addProj(run, { follow: true, r, dmg: this.dmg(w.level) * s.might, life: 0.2, knock: 90, kind: null });
        addRing(run, p.x, p.y, r, '#ffffff', 0.22, true);
        setPose(p, 'kick', 0.25);
        run.sfx.push('kick');
      }
    },
  },

  ladder: {
    name: '사다리 돌리기',
    icon: 'i_ladder',
    max: 8,
    desc: ['사다리가 몸 주위를 돈다', '사다리 +1', '피해 +2, 지속 증가', '사다리 +1', '회전 속도 증가', '피해 +2, 반경 증가', '사다리 +1', '멈추지 않는다'],
    count: T([1, 2, 2, 3, 3, 3, 4, 4]),
    dmg: T([8, 8, 10, 10, 11, 13, 13, 15]),
    rad: T([30, 30, 32, 32, 33, 36, 36, 38]),
    spd: T([3, 3, 3.2, 3.2, 3.8, 3.8, 4, 4.2]),
    dur: T([3, 3, 3.5, 3.5, 4, 4, 4.5, 9999]),
    update(w, run, dt) {
      const s = run.player.stats;
      const st = w.st;
      w.cd -= dt;
      if (w.cd <= 0 && !st.on) {
        const n = this.count(w.level) + s.amount;
        const dur = this.dur(w.level);
        for (let k = 0; k < n; k++) {
          addProj(run, {
            orbit: { a: (k / n) * Math.PI * 2, rad: this.rad(w.level) * s.area, spd: this.spd(w.level) },
            r: 7 * s.area,
            dmg: this.dmg(w.level) * s.might,
            life: dur,
            rehit: 0.5,
            knock: 50,
            kind: 'ladder',
            weapon: w,
          });
        }
        st.on = true;
        st.until = run.t + dur;
        run.sfx.push('whoosh');
      }
      if (st.on && run.t >= st.until) {
        st.on = false;
        w.cd = 2.5 * s.cooldown;
      }
      // 레벨업으로 개수가 바뀌면 즉시 다시 깐다
      if (st.on && st.level !== w.level) {
        for (const p of run.projectiles) if (p.weapon === w) p.dead = true;
        st.on = false;
        w.cd = 0;
      }
      st.level = w.level;
    },
  },

  chair: {
    name: '의자 던지기',
    icon: 'i_chair',
    max: 8,
    desc: ['의자를 높이 던진다 (관통)', '관통 +1', '의자 +1', '피해 +2', '관통 +1', '의자 +1', '피해 +4', '피해 +4, 관통 +1'],
    cd: T([1.5, 1.5, 1.4, 1.4, 1.3, 1.2, 1.1, 1.0]),
    count: T([1, 1, 2, 2, 2, 3, 3, 3]),
    dmg: T([16, 16, 16, 18, 18, 18, 22, 26]),
    pierce: T([2, 3, 3, 3, 4, 4, 4, 5]),
    update(w, run, dt) {
      const p = run.player;
      const s = p.stats;
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = this.cd(w.level) * s.cooldown;
        const n = this.count(w.level) + s.amount;
        for (let k = 0; k < n; k++) {
          addProj(run, {
            x: p.x,
            y: p.y - 6,
            vx: p.facing * (15 + Math.random() * 45) + (Math.random() - 0.5) * 40,
            vy: -150 - Math.random() * 40,
            ay: 280,
            r: 6 * s.area,
            dmg: this.dmg(w.level) * s.might,
            pierce: this.pierce(w.level),
            life: 2.2,
            knock: 40,
            kind: 'chair',
            vrot: (Math.random() < 0.5 ? -1 : 1) * 9,
          });
        }
        run.sfx.push('throw');
      }
    },
  },

  umbrella: {
    name: '우산 막기',
    icon: 'i_umbrella',
    max: 8,
    desc: ['우산으로 찌르고, 날아오는 표창을 되받아친다', '피해 +2', '사거리 증가', '방어 시간 증가', '피해 +2', '쿨타임 감소', '사거리 증가', '피해 +4, 방어 시간 증가'],
    cd: T([2.2, 2.1, 2.0, 1.9, 1.8, 1.6, 1.5, 1.4]),
    dmg: T([10, 12, 12, 12, 14, 14, 16, 20]),
    reach: T([36, 36, 42, 42, 44, 46, 52, 54]),
    guard: T([0.5, 0.5, 0.6, 0.75, 0.75, 0.8, 0.8, 1.0]),
    update(w, run, dt) {
      const p = run.player;
      const s = p.stats;
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = this.cd(w.level) * s.cooldown;
        const reach = this.reach(w.level) * s.area;
        const dmg = this.dmg(w.level) * s.might;
        const steps = 4;
        for (let k = 1; k <= steps; k++) {
          const d = (reach * k) / steps;
          addProj(run, { follow: true, ox: p.aimX * d, oy: p.aimY * d, r: 6 * s.area, dmg, life: 0.14, knock: 45, kind: null });
        }
        addProj(run, {
          follow: true,
          ox: p.aimX * 10,
          oy: p.aimY * 10,
          r: 15 * s.area,
          dmg: dmg,
          life: this.guard(w.level),
          collide: false,
          shield: true,
          kind: 'umbrella',
          rot: Math.atan2(p.aimY, p.aimX),
          reach,
        });
        setPose(p, 'punch', 0.2);
        run.sfx.push('swing');
      }
    },
  },

  flyingkick: {
    name: '그림자 날아차기',
    icon: 'i_flyingkick',
    max: 8,
    desc: ['잔상이 가장 가까운 적에게 날아차기', '피해 +4', '관통 +1', '잔상 +1', '피해 +4, 관통 +1', '쿨타임 감소', '잔상 +1', '피해 +6'],
    cd: T([2.4, 2.3, 2.2, 2.0, 1.9, 1.7, 1.6, 1.4]),
    count: T([1, 1, 1, 2, 2, 2, 3, 3]),
    dmg: T([20, 24, 24, 24, 28, 28, 30, 36]),
    pierce: T([3, 3, 4, 4, 5, 5, 5, 6]),
    update(w, run, dt) {
      const p = run.player;
      const s = p.stats;
      w.cd -= dt;
      if (w.cd <= 0) {
        const n = this.count(w.level) + s.amount;
        const targets = nearestEnemies(run, p.x, p.y, 180, n);
        if (!targets.length) {
          w.cd = 0.3;
          return;
        }
        w.cd = this.cd(w.level) * s.cooldown;
        for (let k = 0; k < n; k++) {
          const e = targets[k % targets.length];
          const a = Math.atan2(e.y - p.y, e.x - p.x) + (k >= targets.length ? (Math.random() - 0.5) * 0.6 : 0);
          addProj(run, {
            x: p.x,
            y: p.y,
            vx: Math.cos(a) * 210,
            vy: Math.sin(a) * 210,
            r: 7 * s.area,
            dmg: this.dmg(w.level) * s.might,
            pierce: this.pierce(w.level),
            life: 0.95,
            knock: 70,
            kind: 'afterimage',
            flip: Math.cos(a) < 0,
            alpha: 0.7,
          });
        }
        run.sfx.push('dash');
      }
    },
  },

  bottle: {
    name: '병 던지기',
    icon: 'i_bottle',
    max: 8,
    desc: ['근처 적에게 병을 던져 깨뜨린다 (범위)', '피해 +2', '병 +1', '범위 증가', '병 +1', '피해 +2', '병 +1', '피해 +4, 범위 증가'],
    cd: T([1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1]),
    count: T([1, 1, 2, 2, 3, 3, 4, 4]),
    dmg: T([10, 12, 12, 12, 12, 14, 14, 18]),
    splash: T([14, 14, 14, 17, 17, 18, 18, 22]),
    update(w, run, dt) {
      const p = run.player;
      const s = p.stats;
      w.cd -= dt;
      if (w.cd <= 0) {
        w.cd = this.cd(w.level) * s.cooldown;
        const n = this.count(w.level) + s.amount;
        const flight = 0.45;
        for (let k = 0; k < n; k++) {
          const e = randomEnemyNear(run, p.x, p.y, 130);
          const tx = e ? e.x : p.x + (Math.random() - 0.5) * 120;
          const ty = e ? e.y : p.y + (Math.random() - 0.5) * 120;
          addProj(run, {
            x: p.x,
            y: p.y - 4,
            vx: (tx - p.x) / flight,
            vy: (ty - p.y) / flight,
            life: flight,
            collide: false,
            kind: 'bottle',
            vrot: 16,
            arc: 26,
            dmg: this.dmg(w.level) * s.might,
            splash: this.splash(w.level) * s.area,
            onEnd: shatter,
          });
        }
        run.sfx.push('throw');
      }
    },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export function updateWeapons(run, dt) {
  for (const w of run.player.weapons) WEAPONS[w.id].update(w, run, dt);
}

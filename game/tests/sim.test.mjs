// 헤드리스 시뮬레이션: 간단한 봇으로 한 판을 돌려서 예외·NaN·폭주가 없는지 본다.
// (렌더/DOM 없이 game.js 만으로 돌아간다는 것 자체가 구조 검증이기도 하다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, updateRun, chooseUpgrade, tradeBuy, tradeSell, finishRun, shopBuy } from '../web/src/game.js';
import { buildChoices } from '../web/src/upgrades.js';
import { STEP, ENEMY_CAP } from '../web/src/config.js';

function bot(run) {
  // 평소엔 천천히 원을 그리며 걷고, 적이 가까우면 반대쪽으로 빠진다 (카이팅 흉내)
  const p = run.player;
  let ax = Math.cos(run.t * 0.4) * 0.3;
  let ay = Math.sin(run.t * 0.4) * 0.3;
  // 목표: 브로커 > 가장 가까운 만두
  let goal = run.broker.active ? run.broker : null;
  if (!goal) {
    let best = 120 * 120;
    for (const g of run.pickups) {
      const d2 = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      if (d2 < best) {
        best = d2;
        goal = g;
      }
    }
  }
  if (goal) {
    const l = Math.hypot(goal.x - p.x, goal.y - p.y) || 1;
    ax = ((goal.x - p.x) / l) * 0.8;
    ay = ((goal.y - p.y) / l) * 0.8;
  }
  let threat = false;
  for (const e of run.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 28 * 28 && d2 > 0) {
      ax += (dx / d2) * 40;
      ay += (dy / d2) * 40;
      threat = true;
    }
  }
  if (!threat) return { x: ax, y: ay };
  const l = Math.hypot(ax, ay) || 1;
  return { x: ax / l, y: ay / l };
}

function play(seed, seconds, { god = false } = {}) {
  const run = createRun({ seed, upgrades: { seed: 1 }, debug: god ? { god: true } : null });
  run.view = { w: 280, h: 600, barH: 70, barSide: 'top' };
  const log = { levelups: 0, brokers: 0, news: 0, bosses: 0, dead: false, clear: false, trades: 0 };
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    updateRun(run, bot(run), STEP);
    while (run.player.pendingLevels > 0) {
      chooseUpgrade(run, buildChoices(run.player, run.rng)[0]);
      log.levelups++;
    }
    for (const ev of run.events) {
      if (ev.type === 'broker') {
        log.brokers++;
        // 매번 국수 1주 사고, 연꽃은 있으면 판다
        if (tradeBuy(run, 'DGN', 1, true)) log.trades++;
        if (tradeSell(run, 'LTS', 1)) log.trades++;
        tradeBuy(run, 'LTS', 1, false);
        shopBuy(run, 'noodle');
      }
      if (ev.type === 'news') log.news++;
      if (ev.type === 'boss') log.bosses++;
      if (ev.type === 'dead') log.dead = true;
      if (ev.type === 'clear') log.clear = true;
    }
    run.events.length = 0;
    run.sfx.length = 0;
    if (log.dead || log.clear) break;

    if (i % 600 === 0) {
      const p = run.player;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'player pos finite');
      assert.ok(run.enemies.length <= ENEMY_CAP + 30, `enemies ${run.enemies.length}`);
      for (const e of run.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.hp), `enemy ${e.type}`);
      assert.ok(run.projectiles.length < 2000, 'projectiles bounded');
    }
  }
  return { run, log };
}

test('봇이 3분을 플레이해도 예외/NaN 없음, 레벨업·브로커·뉴스 발생', () => {
  const { run, log } = play(123, 180);
  assert.ok(log.levelups >= 3, `levelups ${log.levelups}`);
  assert.ok(log.brokers >= 1, `brokers ${log.brokers}`);
  assert.ok(run.kills > 50, `kills ${run.kills}`);
  const r = finishRun(run, 'quit');
  assert.ok(r.deposit >= 0);
  assert.ok(Number.isFinite(r.tradePnl));
  assert.equal(run.portfolio.holdings.LTS.qty + run.portfolio.holdings.DGN.qty, 0);
});

test('무적 봇으로 15분 끝까지: 보스 3마리 등장, 클리어 이벤트', () => {
  const { run, log } = play(7, 15 * 60 + 1, { god: true });
  assert.equal(log.bosses, 3);
  assert.ok(log.clear, 'clear');
  assert.ok(run.player.level > 15, `level ${run.player.level}`);
});

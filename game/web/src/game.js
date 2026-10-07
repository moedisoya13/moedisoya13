// 한 판(run)의 상태와 업데이트. DOM 을 모른다 — UI 는 run.events / run.sfx 를 읽어 반응한다.

import { RUN_SECONDS, TRADE, SHOP } from './config.js';
import { createRng } from './rng.js';
import { createPlayer, updatePlayer, refreshStats, healPlayer, spendXp, addXp } from './player.js';
import { createMarket, stepMarket, getStock, prices, applyShock } from './market.js';
import { createPortfolio, buy, sell, liquidate } from './portfolio.js';
import { createSpawner, updateSpawner } from './spawner.js';
import { updateEnemies } from './enemies.js';
import { updateWeapons } from './weapons.js';
import { updateProjectiles } from './projectiles.js';
import { updatePickups } from './pickups.js';
import { createBroker, updateBroker } from './broker.js';
import { createWorld, updateWorld } from './world.js';
import { updateEffects } from './effects.js';
import { createGrid, gridClear, gridInsert, lerp } from './util.js';
import { applyChoice } from './upgrades.js';

export function createRun({ upgrades = {}, seed = (Math.random() * 2 ** 32) >>> 0, debug = null } = {}) {
  const meta = { ...upgrades };
  const player = createPlayer(meta);
  const mrng = createRng(seed ^ 0x9e3779b9);
  return {
    seed,
    t: 0,
    rng: createRng(seed),
    mrng,
    meta,
    debug,
    player,
    startCoins: player.coins,
    enemies: [],
    projectiles: [],
    pickups: [],
    particles: [],
    texts: [],
    rings: [],
    telegraphs: [],
    grid: createGrid(32),
    market: createMarket(mrng),
    portfolio: createPortfolio(),
    broker: createBroker(),
    spawner: createSpawner(),
    world: createWorld(seed),
    view: { w: 270, h: 480, barH: 70, barSide: 'top' },
    cam: { x: 0, y: 0, off: 0 },
    kills: 0,
    coinsEarned: 0,
    bossesKilled: 0,
    boss: null,
    revives: meta.revive || 0,
    pager: 0,
    magnetAll: 0,
    shake: 0,
    flash: 0,
    over: false,
    lastHurtNews: -999,
    stats: { damage: 0 },
    events: [],
    sfx: [],
  };
}

export function updateRun(run, input, dt) {
  if (run.over) return;
  run.t += dt;
  const pl = run.player;

  updatePlayer(run, input, dt);
  updateCamera(run, dt);
  updateWorld(run.world, run.cam.x, run.cam.y, run.view.w, run.view.h);
  updateSpawner(run, dt);

  gridClear(run.grid);
  for (const e of run.enemies) if (!e.dead) gridInsert(run.grid, e);

  updateEnemies(run, dt);
  updateWeapons(run, dt);
  updateProjectiles(run, dt);
  updatePickups(run, dt);
  updateBroker(run, dt);

  for (const ev of stepMarket(run.market, run.mrng, dt)) run.events.push(ev);

  // 재키가 크게 다치면 '부상설'로 국수 주가가 흔들린다 (90초에 한 번)
  if (pl.hp / pl.stats.maxHp < 0.25 && run.t - run.lastHurtNews > 90) {
    run.lastHurtNews = run.t;
    const ev = applyShock(run.market, 'DGN', -0.1, '재키 부상설… 드래곤국수 광고 차질 우려', run.mrng);
    if (ev) run.events.push(ev);
  }

  updateEffects(run, dt);

  if (run.t >= RUN_SECONDS) run.events.push({ type: 'clear' });
}

export function updateCamera(run, dt, snap = false) {
  const pl = run.player;
  const v = run.view;
  // 차트 바가 가린 만큼 카메라를 밀어서, 플레이어가 "보이는 영역"의 가운데 오게 한다
  const target = v.barSide === 'top' ? -v.barH / 2 : v.barH / 2;
  run.cam.off = snap ? target : lerp(run.cam.off, target, Math.min(1, dt * 6));
  run.cam.x = pl.x;
  run.cam.y = pl.y + run.cam.off;
}

// ---- 매매 / 상점 (브로커 모달에서 호출) ----

export function feeRate(run) {
  const l = Math.min(2, run.meta.sense || 0);
  return Math.max(0, TRADE.feeRate - 0.0025 * l);
}

export function hasAnalyst(run) {
  return (run.meta.sense || 0) >= 3;
}

export function spendableXp(run) {
  return Math.floor(run.player.xp);
}

export function tradeBuy(run, id, qty, useXp) {
  const pl = run.player;
  const s = getStock(run.market, id);
  const wallet = { coins: pl.coins, xp: spendableXp(run) };
  const r = buy(run.portfolio, id, qty, s.price, feeRate(run), wallet, TRADE.xpRate, useXp, run.t);
  if (!r) return null;
  pl.coins -= r.coins;
  spendXp(run, r.xp);
  run.sfx.push('buy');
  return r;
}

export function tradeSell(run, id, qty) {
  const s = getStock(run.market, id);
  const r = sell(run.portfolio, id, qty, s.price, feeRate(run), run.t);
  if (!r) return null;
  run.player.coins += r.proceeds;
  run.sfx.push(r.pnl >= 0 ? 'sellwin' : 'selllose');
  return r;
}

export function shopPrice(run, item) {
  return item.price(run.player.level);
}

export function shopBuy(run, id) {
  const item = SHOP.find((x) => x.id === id);
  const pl = run.player;
  const price = shopPrice(run, item);
  if (pl.coins < price) return false;
  if (item.max && run.pager >= item.max && id === 'pager') return false;
  pl.coins -= price;
  if (id === 'noodle') healPlayer(run, pl.stats.maxHp * 0.4);
  else if (id === 'scroll') addXp(run, pl.xpNext - pl.xp);
  else if (id === 'pager') run.pager++;
  run.sfx.push('buy');
  return true;
}

export function chooseUpgrade(run, choice) {
  const pl = run.player;
  applyChoice(pl, choice);
  if (choice.kind === 'heal') healPlayer(run, 50);
  refreshStats(run);
  pl.pendingLevels = Math.max(0, pl.pendingLevels - 1);
}

// 런 종료: 강제청산 → 시드머니 반납 → 금고 입금액 계산
export function finishRun(run, outcome) {
  run.over = true;
  const pl = run.player;
  const pf = run.portfolio;
  const realizedBefore = pf.realized;
  const liquidation = liquidate(pf, prices(run.market), feeRate(run), run.t);
  pl.coins += liquidation;
  const seedBack = Math.min(pl.coins, run.startCoins);
  const deposit = Math.max(0, pl.coins - seedBack);
  return {
    outcome, // 'dead' | 'clear' | 'quit'
    time: run.t,
    level: pl.level,
    kills: run.kills,
    coinsEarned: run.coinsEarned,
    liquidation,
    liquidationPnl: pf.realized - realizedBefore,
    tradePnl: pf.realized,
    bestTrade: pf.bestTrade,
    trades: pf.trades,
    seedBack,
    deposit,
    bosses: run.bossesKilled,
    history: run.market.stocks.map((s) => ({ id: s.id, name: s.def.name, runHistory: s.runHistory.slice(), open: s.open })),
  };
}

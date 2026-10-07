// 부트스트랩 · 화면(scene) 전환 · 게임 루프.

import { STEP, LOGICAL_TARGET_W, META } from './config.js';
import { buildSprites, drawSprite } from './sprites.js';
import { createRun, updateRun, updateCamera, chooseUpgrade, tradeBuy, tradeSell, shopBuy, finishRun } from './game.js';
import { buildChoices } from './upgrades.js';
import { renderWorld, renderFx } from './render.js';
import { createInput } from './input.js';
import { decideSide } from './chartSide.js';
import { ChartBar, newsColor } from './ui/chartbar.js';
import * as UI from './ui/menus.js';
import { loadSave, writeSave, resetSave } from './save.js';
import * as Audio from './audio.js';
import { spawnBroker } from './broker.js';
import { spawnEnemy } from './enemies.js';
import { addXp } from './player.js';
import { fmtPct } from './util.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

let save = loadSave();
Audio.initAudio(save.settings);

const gameCanvas = document.getElementById('game');
const gctx = gameCanvas.getContext('2d');
const fxCanvas = document.getElementById('fx');
const fctx = fxCanvas.getContext('2d');
const chartBar = new ChartBar(document.getElementById('bar'), { onPause: () => pause(), onPager: () => usePager() });

let scene = 'title'; // title | play | result
let run = null;
let modal = null; // levelup | broker | chest | pause
const queue = [];
let timeScale = 1;
const view = { w: 270, h: 480, scaleCss: 1, cssW: 0, cssH: 0, fxDpr: 1 };
let insets = { top: 0, bottom: 0 };

const input = createInput(window, {
  onTouchStart(y) {
    if (scene === 'play' && !modal) setBarSide(decideSide(save.settings.chart, chartBar.side, y, window.innerHeight));
  },
});
// iOS: 오디오는 사용자 제스처 안에서만 깨어난다
['touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, () => Audio.unlock(), { passive: true }));
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------- 레이아웃 ----------------
function readInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  return r;
}

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  // 장치 픽셀 기준 정수 배율 → 픽셀이 고르게 보인다
  const s = Math.max(1, Math.round((vw * dpr) / LOGICAL_TARGET_W));
  const lw = Math.ceil((vw * dpr) / s);
  const lh = Math.ceil((vh * dpr) / s);
  gameCanvas.width = lw;
  gameCanvas.height = lh;
  const css = s / dpr;
  gameCanvas.style.width = lw * css + 'px';
  gameCanvas.style.height = lh * css + 'px';
  gctx.imageSmoothingEnabled = false;
  view.w = lw;
  view.h = lh;
  view.scaleCss = css;
  view.cssW = vw;
  view.cssH = vh;
  view.fxDpr = Math.min(dpr, 2);
  fxCanvas.width = Math.round(vw * view.fxDpr);
  fxCanvas.height = Math.round(vh * view.fxDpr);
  fxCanvas.style.width = vw + 'px';
  fxCanvas.style.height = vh + 'px';
  insets = readInsets();
  chartBar.layout();
  syncView();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

function syncView() {
  if (!run) return;
  run.view.w = view.w;
  run.view.h = view.h;
  run.view.scaleCss = view.scaleCss;
  run.view.barSide = chartBar.side;
  run.view.barH = chartBar.outerHeight() / view.scaleCss;
}

function setBarSide(side) {
  if (side === chartBar.side) return;
  chartBar.setSide(side);
  // 카메라 오프셋은 updateCamera 가 부드럽게 따라간다
  setTimeout(syncView, 140);
}

// ---------------- 화면 전환 ----------------
function goTitle() {
  scene = 'title';
  modal = null;
  queue.length = 0;
  run = null;
  chartBar.show(false);
  Audio.stopMusic();
  UI.showTitle(save, {
    onStart: startRun,
    onVault: () => showVault(goTitle),
    onSettings: () =>
      UI.showSettings(save, {
        onBack: goTitle,
        onChange: applySetting,
        onReset: () => {
          save = resetSave();
          writeSave(save);
          goTitle();
        },
      }),
  });
}

function applySetting(key, val) {
  if (key === 'sound') Audio.setSound(val);
  if (key === 'music') Audio.setMusic(val);
  if (key === 'chart' && val !== 'auto') chartBar.setSide(val, false);
  writeSave(save);
  syncView();
}

function showVault(back) {
  UI.showVault(save, {
    onBuy(id) {
      const m = META.find((x) => x.id === id);
      const lv = save.upgrades[id] || 0;
      if (lv >= m.max) return;
      const cost = m.cost(lv);
      if (save.vault < cost) return;
      save.vault -= cost;
      save.upgrades[id] = lv + 1;
      writeSave(save);
      Audio.play('buy');
    },
    onBack: back,
  });
}

function startRun() {
  Audio.unlock();
  run = createRun({ upgrades: save.upgrades, debug: DEBUG ? { god: false } : null });
  scene = 'play';
  modal = null;
  queue.length = 0;
  timeScale = 1;
  UI.closeAll();
  chartBar.show(true);
  chartBar.setSide(save.settings.chart === 'bottom' ? 'bottom' : 'top', false);
  chartBar.ticker.length = 0;
  chartBar.pushTicker('[개장] 연꽃전자(우량주) · 드래곤국수(테마주) 거래 시작', '#ffd34d');
  syncView();
  updateCamera(run, 0, true);
  Audio.startMusic();
}

function endRun(outcome) {
  if (!run || run.over) return;
  const res = finishRun(run, outcome);
  save.vault += res.deposit;
  save.runs++;
  save.best.time = Math.max(save.best.time, res.time);
  save.best.kills = Math.max(save.best.kills, res.kills);
  save.best.profit = Math.max(save.best.profit, Math.round(res.tradePnl));
  if (outcome === 'clear') save.best.clears++;
  writeSave(save);
  scene = 'result';
  modal = null;
  queue.length = 0;
  input.reset();
  chartBar.show(false);
  Audio.stopMusic();
  Audio.play(outcome === 'clear' ? 'clear' : 'death');
  // 사망 연출: 잠깐 슬로모션 후 결과
  setTimeout(() => {
    UI.showResult(res, save, { onRetry: startRun, onVault: () => showVault(goTitle), onTitle: goTitle });
  }, outcome === 'quit' ? 0 : 700);
}

function pause() {
  if (scene !== 'play' || modal) return;
  modal = 'pause';
  input.reset();
  UI.showPause(run, save, {
    onResume: closeModal,
    onQuit: () => {
      closeModal();
      endRun('quit');
    },
    onSettingsChange: applySetting,
  });
}

function usePager() {
  if (scene !== 'play' || modal || run.pager <= 0) return;
  run.pager--;
  queue.unshift({ type: 'broker', source: 'pager' });
  openNextModal();
}

function closeModal() {
  modal = null;
  UI.closeAll();
  input.reset();
  openNextModal();
}

function openNextModal() {
  if (modal || !queue.length || scene !== 'play') return;
  const q = queue.shift();
  input.reset();
  if (q.type === 'levelup') {
    if (run.player.pendingLevels <= 0) return openNextModal();
    modal = 'levelup';
    Audio.play('levelup');
    UI.showLevelUp(run, buildChoices(run.player, run.rng), (c) => {
      chooseUpgrade(run, c);
      if (run.player.pendingLevels > 0) queue.unshift({ type: 'levelup' });
      closeModal();
    });
  } else if (q.type === 'chest') {
    modal = 'chest';
    UI.showChest(q, closeModal);
  } else if (q.type === 'broker') {
    modal = 'broker';
    UI.showBroker(run, {
      source: q.source,
      onBuy: (id, qty, useXp) => !!tradeBuy(run, id, qty, useXp),
      onSell: (id, qty) => tradeSell(run, id, qty),
      onShop: (id) => shopBuy(run, id),
      onClose: closeModal,
    });
  }
}

function handleEvents() {
  for (const ev of run.events) {
    switch (ev.type) {
      case 'news':
        chartBar.pushTicker(`[속보] ${ev.text} ${fmtPct(ev.pct, 0)}`, newsColor(ev.pct));
        Audio.play(ev.pct >= 0 ? 'newsUp' : 'newsDown');
        break;
      case 'ticker':
        chartBar.pushTicker(ev.text, '#ffd34d');
        break;
      case 'toast':
        UI.toast(ev.text);
        break;
      case 'boss':
        UI.toast(`보스 등장: ${ev.name}`, '#ff4d5e');
        chartBar.pushTicker(`[경보] ${ev.name} 출현!`, '#ff4d5e');
        break;
      case 'revive':
        UI.toast('스턴트 대역 투입!');
        break;
      case 'broker':
        queue.push({ type: 'broker', source: ev.source });
        break;
      case 'chest':
        queue.push(ev);
        break;
      case 'dead':
        run.events.length = 0;
        endRun('dead');
        return;
      case 'clear':
        run.events.length = 0;
        endRun('clear');
        return;
      default:
        break;
    }
  }
  run.events.length = 0;
  if (run.player.pendingLevels > 0 && !queue.some((q) => q.type === 'levelup')) queue.push({ type: 'levelup' });
  openNextModal();
}

// ---------------- 루프 ----------------
let last = performance.now();
let acc = 0;
let titleT = 0;
let frozenDrawn = false;
let fpsT = 0;
let fpsN = 0;
let fps = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (scene === 'play' && !modal && run) {
    acc += dt * timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 10) {
      updateRun(run, input.read(), STEP);
      acc -= STEP;
      steps++;
      handleEvents();
      if (modal || scene !== 'play') {
        acc = 0;
        break;
      }
    }
    if (steps >= 10) acc = 0; // 너무 밀리면 따라잡기 포기 (죽음의 나선 방지)
  }

  if (run) {
    // 모달/결과 화면 뒤의 월드는 멈춰 있으니 한 번만 그린다 (배터리 절약)
    const frozen = !!modal || scene !== 'play';
    if (!frozen || !frozenDrawn) {
      syncView();
      renderWorld(gctx, run, frozen ? null : input);
      fctx.setTransform(view.fxDpr, 0, 0, view.fxDpr, 0, 0);
      renderFx(fctx, run, view.cssW, view.cssH, view.scaleCss, insets);
      if (scene === 'play') chartBar.draw(run, frozen ? 0 : dt);
      frozenDrawn = frozen;
    }
    for (const s of run.sfx) Audio.play(s);
    run.sfx.length = 0;
  } else {
    renderTitleBg(dt);
  }

  if (DEBUG) {
    fpsN++;
    fpsT += dt;
    if (fpsT >= 0.5) {
      fps = Math.round(fpsN / fpsT);
      fpsN = 0;
      fpsT = 0;
      const el = document.querySelector('#debug .fps');
      if (el) el.textContent = `${fps}fps ${run ? run.enemies.length + 'e' : ''}`;
    }
  }
  requestAnimationFrame(frame);
}

function renderTitleBg(dt) {
  titleT += dt;
  const fake = {
    view: { w: view.w, h: view.h, barH: 0, barSide: 'top', scaleCss: view.scaleCss },
    cam: { x: titleT * 20, y: titleT * 8 },
    world: { decor: [], props: [] },
    telegraphs: [],
    enemies: [],
    pickups: [],
    projectiles: [],
    particles: [],
    rings: [],
    texts: [],
    broker: { active: false },
    player: { x: titleT * 20, y: titleT * 8 + 1000, stats: { maxHp: 1 }, hp: 1, animT: titleT, moving: true, facing: 1 },
    shake: 0,
    flash: 0,
    t: titleT,
  };
  renderWorld(gctx, fake, null);
  gctx.fillStyle = 'rgba(10,6,14,0.35)';
  gctx.fillRect(0, 0, view.w, view.h);
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    Audio.suspendAudio();
  } else {
    Audio.resumeAudio();
    last = performance.now();
  }
});

// ---------------- 디버그 (?debug=1) ----------------
function setupDebug() {
  const el = document.getElementById('debug');
  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn(b);
    });
    el.appendChild(b);
  };
  const fpsEl = document.createElement('div');
  fpsEl.className = 'fps';
  el.appendChild(fpsEl);
  btn('x1/x4', (b) => {
    timeScale = timeScale === 1 ? 4 : 1;
    b.textContent = 'x' + timeScale;
  });
  btn('왕씨', () => run && spawnBroker(run));
  btn('+100c', () => run && (run.player.coins += 100));
  btn('Lv+', () => run && addXp(run, run.player.xpNext - run.player.xp));
  btn('보스', () => run && spawnEnemy(run, 'boss1', run.player.x + 120, run.player.y));
  btn('무적', (b) => {
    if (!run) return;
    run.debug.god = !run.debug.god;
    b.textContent = run.debug.god ? '무적ON' : '무적';
  });
  btn('삐삐', () => run && run.pager++);
}

// 테스트(Playwright)용 핸들
window.__game = {
  get run() {
    return run;
  },
  get scene() {
    return scene;
  },
  get modal() {
    return modal;
  },
  get barSide() {
    return chartBar.side;
  },
  get save() {
    return save;
  },
  setTimeScale: (s) => (timeScale = s),
  startRun,
  spawnBroker: () => run && spawnBroker(run),
  levelUp: () => run && addXp(run, run.player.xpNext - run.player.xp),
  kill: () => run && run.events.push({ type: 'dead' }),
};

// ---------------- 부팅 ----------------
async function boot() {
  try {
    await document.fonts.load('12px Galmuri11');
  } catch {
    /* 폰트 실패해도 진행 */
  }
  buildSprites();
  resize();
  if (DEBUG) setupDebug();
  document.getElementById('boot').remove();
  goTitle();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();

export { drawSprite };

// 월드 렌더링 (저해상도 픽셀 canvas). 한글 텍스트는 fx(고해상도) canvas 에 따로 그린다.

import { SPR, drawSprite, drawBitmapText, BITMAP_RE } from './sprites.js';
import { xpSprite, coinSprite } from './pickups.js';
import { hpRatio } from './player.js';
import { CHUNK } from './world.js';

let groundTile = null;
const TILE = 128;

function makeGround() {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2e2836';
  ctx.fillRect(0, 0, TILE, TILE);
  // 엇갈린 돌바닥
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const BW = 16;
  const BH = 8;
  for (let row = 0; row < TILE / BH; row++) {
    const off = row % 2 ? BW / 2 : 0;
    for (let col = -1; col < TILE / BW + 1; col++) {
      const x = col * BW + off;
      const y = row * BH;
      const v = rnd();
      ctx.fillStyle = v < 0.15 ? '#3c3446' : v < 0.85 ? '#383141' : '#41394c';
      ctx.fillRect(x + 1, y + 1, BW - 1, BH - 1);
      ctx.fillStyle = '#463d52';
      ctx.fillRect(x + 1, y + 1, BW - 2, 1);
      if (rnd() < 0.25) {
        ctx.fillStyle = '#2f2937';
        ctx.fillRect(x + 3 + Math.floor(rnd() * 9), y + 3 + Math.floor(rnd() * 3), 2, 1);
      }
    }
  }
  return c;
}

const DECOR = {
  manhole(ctx, x, y) {
    ctx.fillStyle = '#25202b';
    ctx.fillRect(x - 6, y - 4, 12, 8);
    ctx.fillRect(x - 7, y - 3, 14, 6);
    ctx.fillStyle = '#4d4558';
    for (let i = -5; i <= 5; i += 2) ctx.fillRect(x + i, y - 3, 1, 6);
  },
  crack(ctx, x, y) {
    ctx.fillStyle = '#231e29';
    ctx.fillRect(x, y, 3, 1);
    ctx.fillRect(x + 3, y + 1, 2, 1);
    ctx.fillRect(x + 5, y + 2, 3, 1);
    ctx.fillRect(x + 2, y - 1, 1, 1);
  },
  puddle(ctx, x, y) {
    ctx.fillStyle = '#2b3b5c';
    ctx.fillRect(x - 7, y - 2, 14, 4);
    ctx.fillRect(x - 5, y - 3, 10, 6);
    ctx.fillStyle = '#ff5fa8'; // 네온 반사
    ctx.fillRect(x - 3, y - 1, 3, 1);
    ctx.fillStyle = '#5fd0ff';
    ctx.fillRect(x + 1, y + 1, 2, 1);
  },
  paper(ctx, x, y) {
    ctx.fillStyle = '#d8d2c0';
    ctx.fillRect(x, y, 5, 4);
    ctx.fillStyle = '#9a9484';
    ctx.fillRect(x + 1, y + 1, 3, 1);
  },
  drain(ctx, x, y) {
    ctx.fillStyle = '#1e1a23';
    ctx.fillRect(x - 5, y - 2, 10, 4);
    ctx.fillStyle = '#5a5266';
    for (let i = -4; i <= 4; i += 2) ctx.fillRect(x + i, y - 2, 1, 4);
  },
  sign(ctx, x, y) {
    ctx.fillStyle = '#3a1418';
    ctx.fillRect(x - 6, y - 3, 12, 6);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(x - 5, y - 2, 10, 1);
    ctx.fillRect(x - 5, y + 1, 10, 1);
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(x - 2, y - 1, 4, 2);
  },
};

const ANIM_RUN = ['_run0', '_run1', '_run2', '_run3'];

function charFrame(base, e, moving, pose) {
  if (pose) return base + '_' + pose;
  if (moving) return base + ANIM_RUN[Math.floor(e.animT * 8) % 4];
  return base + '_idle';
}

export function renderWorld(ctx, run, input) {
  if (!groundTile) groundTile = makeGround();
  const v = run.view;
  const pl = run.player;
  let sx = 0;
  let sy = 0;
  if (run.shake > 0) {
    sx = (Math.random() - 0.5) * run.shake;
    sy = (Math.random() - 0.5) * run.shake;
  }
  const camL = Math.round(run.cam.x - v.w / 2 + sx);
  const camT = Math.round(run.cam.y - v.h / 2 + sy);

  // 바닥 (타일 반복)
  const ox = ((camL % TILE) + TILE) % TILE;
  const oy = ((camT % TILE) + TILE) % TILE;
  for (let y = -oy; y < v.h; y += TILE) for (let x = -ox; x < v.w; x += TILE) ctx.drawImage(groundTile, x, y);

  ctx.save();
  ctx.translate(-camL, -camT);
  const inView = (x, y, m = 24) => x > camL - m && x < camL + v.w + m && y > camT - m && y < camT + v.h + m;

  for (const d of run.world.decor) if (inView(d.x, d.y)) DECOR[d.kind](ctx, Math.round(d.x), Math.round(d.y));

  // 보스 공격 예고
  for (const g of run.telegraphs) {
    const a = 0.25 + 0.25 * Math.sin(g.t * 20);
    ctx.fillStyle = `rgba(255,60,60,${a})`;
    if (g.kind === 'circle') fillCircle(ctx, g.x, g.y, g.r);
    else if (g.kind === 'line') {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(Math.atan2(g.dy, g.dx));
      ctx.fillRect(0, -g.w / 2, g.len, g.w);
      ctx.restore();
    }
  }

  // 그림자 + 정렬 대상 수집
  const drawables = [];
  for (const p of run.world.props) if (inView(p.x, p.y)) drawables.push(p);
  for (const e of run.enemies) if (inView(e.x, e.y, 40)) drawables.push(e);
  drawables.push(pl);
  if (run.broker.active && inView(run.broker.x, run.broker.y, 40)) drawables.push(run.broker);

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const d of drawables) {
    const r = d === run.broker ? 12 : d.r || 5;
    const air = d.st === 'air' ? 0.6 : 1;
    ctx.fillRect(Math.round(d.x - r * air), Math.round(d.y + 2), Math.round(r * 2 * air), 2);
  }

  // 만두·코인 (바닥에 있으니 캐릭터보다 먼저)
  for (const p of run.pickups) {
    if (!inView(p.x, p.y)) continue;
    let name = p.kind;
    if (p.kind === 'xp') name = xpSprite(p.value);
    else if (p.kind === 'coin') name = coinSprite(p.value);
    const bob = p.kind === 'xp' || p.kind === 'coin' ? 0 : Math.round(Math.sin(run.t * 4 + p.x) * 1.5);
    drawSprite(ctx, name, p.x, p.y + bob);
  }

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) {
    if (d === pl) drawPlayer(ctx, run, pl);
    else if (d === run.broker) drawBroker(ctx, run, d);
    else if (d.def) drawEnemy(ctx, run, d);
    else drawSprite(ctx, d.kind, d.x, d.y);
  }

  // 투사체
  for (const p of run.projectiles) {
    if (!p.kind || !inView(p.x, p.y)) continue;
    drawProj(ctx, run, p);
  }

  // 파티클
  for (const p of run.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  ctx.globalAlpha = 1;

  // 링 (발차기 충격파 등)
  for (const r of run.rings) {
    const k = r.t / r.life;
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Math.round(r.x), Math.round(r.y), r.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 플레이어 HP 바
  const ratio = hpRatio(pl);
  const bx = Math.round(pl.x - 8);
  const by = Math.round(pl.y + 5);
  ctx.fillStyle = '#1b1020';
  ctx.fillRect(bx - 1, by - 1, 18, 4);
  ctx.fillStyle = '#5a1a24';
  ctx.fillRect(bx, by, 16, 2);
  ctx.fillStyle = ratio > 0.3 ? '#ff4d4d' : '#ffb000';
  ctx.fillRect(bx, by, Math.round(16 * ratio), 2);

  // 비트맵 글자 (숫자/영문 의성어)
  for (const t of run.texts) {
    if (!BITMAP_RE.test(t.str)) continue;
    ctx.globalAlpha = Math.min(1, 2 * (1 - t.t / t.life));
    drawBitmapText(ctx, t.str, t.x, t.y, t.color, t.big ? 2 : 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 저체력 붉은 테두리 / 피격 플래시
  if (run.flash > 0 || ratio < 0.3) {
    const a = Math.max(run.flash * 0.5, ratio < 0.3 ? 0.18 + 0.1 * Math.sin(run.t * 6) : 0);
    ctx.fillStyle = `rgba(255,30,40,${a})`;
    ctx.fillRect(0, 0, v.w, 3);
    ctx.fillRect(0, v.h - 3, v.w, 3);
    ctx.fillRect(0, 0, 3, v.h);
    ctx.fillRect(v.w - 3, 0, 3, v.h);
  }

  // 조이스틱
  if (input && input.active) {
    const k = v.scaleCss; // CSS px → logical
    const bx2 = input.ox / k;
    const by2 = input.oy / k;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(bx2), Math.round(by2), Math.round(input.radius / k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ffffff';
    fillCircle(ctx, bx2 + (input.x * input.radius) / k, by2 + (input.y * input.radius) / k, Math.max(3, Math.round(16 / k)));
    ctx.globalAlpha = 1;
  }
}

function fillCircle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(ctx, run, p) {
  if (p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0 && p.pose !== 'hurt') return; // 깜빡임
  const name = charFrame('jacky', p, p.moving, p.pose);
  drawSprite(ctx, name, p.x, p.y, { flip: p.facing < 0, white: p.pose === 'hurt' && p.poseT > 0.18 });
}

function drawEnemy(ctx, run, e) {
  const def = e.def;
  const flip = e.facing < 0;
  const white = e.flash > 0;
  if (def.sprite === 'biker') {
    drawSprite(ctx, 'biker' + (Math.floor(e.animT * 10) % 2), e.x, e.y, { flip, white });
    return;
  }
  const scale = def.boss ? 2 : 1;
  const lift = e.st === 'air' ? -Math.sin(Math.min(1, (0.35 - e.stT) / 0.35) * Math.PI) * 26 : 0;
  let pose = null;
  if (e.st === 'wind') pose = def.ai === 'slam' ? 'pose' : 'kick';
  else if (e.st === 'dash') pose = 'kick';
  const moving = Math.abs(e.vx) + Math.abs(e.vy) > 1;
  drawSprite(ctx, charFrame(def.sprite, e, moving, pose), e.x, e.y + lift, { flip, white, scale });
}

function drawBroker(ctx, run, b) {
  const blink = b.left < 5 && Math.floor(b.left * 6) % 2 === 0;
  drawSprite(ctx, 'cart' + (Math.floor(run.t * 3) % 2), b.x, b.y, { alpha: blink ? 0.4 : 1 });
}

function drawProj(ctx, run, p) {
  switch (p.kind) {
    case 'fist':
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffffff';
      fillCircle(ctx, run.player.x + p.ox * 0.6, run.player.y - 6 + p.oy * 0.6, 2);
      ctx.globalAlpha = 1;
      drawSprite(ctx, 'fist', p.x, p.y - 5, { rot: p.rot });
      break;
    case 'ladder':
      drawSprite(ctx, 'ladder', p.x, p.y - 4, { rot: p.rot });
      break;
    case 'chair':
      drawSprite(ctx, 'chair', p.x, p.y, { rot: p.rot });
      break;
    case 'bottle': {
      const k = p.t / p.life;
      const z = Math.sin(k * Math.PI) * (p.arc || 0);
      drawSprite(ctx, 'bottle', p.x, p.y - z, { rot: p.rot });
      break;
    }
    case 'umbrella': {
      const a = p.rot;
      drawSprite(ctx, 'umbrella', p.x + Math.cos(a) * 4, p.y - 6 + Math.sin(a) * 4, { rot: a + Math.PI / 2 });
      break;
    }
    case 'afterimage':
      drawSprite(ctx, 'ghost', p.x, p.y, { flip: p.flip, alpha: 0.65 * (1 - p.t / p.life) + 0.2 });
      break;
    case 'shuriken':
      drawSprite(ctx, 'shuriken', p.x, p.y, { rot: p.rot });
      break;
    case 'knife':
      drawSprite(ctx, 'knifeShot', p.x, p.y, { rot: Math.atan2(p.vy, p.vx) });
      break;
    default:
      break;
  }
}

// ---- fx canvas (고해상도): 한글 떠다니는 글자, 브로커 화살표, 보스 바 ----
export function renderFx(ctx, run, W, H, k, insets) {
  ctx.clearRect(0, 0, W, H);
  const v = run.view;
  const camL = run.cam.x - v.w / 2;
  const camT = run.cam.y - v.h / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const t of run.texts) {
    if (BITMAP_RE.test(t.str)) continue;
    const x = (t.x - camL) * k;
    const y = (t.y - camT) * k;
    ctx.globalAlpha = Math.min(1, 2 * (1 - t.t / t.life));
    ctx.font = `${t.big ? 16 : 12}px Galmuri11, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1b1020';
    ctx.strokeText(t.str, x, y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, x, y);
  }
  ctx.globalAlpha = 1;

  // 플레이 영역 (차트 바 제외)
  const barPx = v.barH * k;
  const top = v.barSide === 'top' ? barPx : insets.top;
  const bottom = v.barSide === 'bottom' ? H - barPx : H - insets.bottom;

  // 브로커 방향 화살표
  const b = run.broker;
  if (b.active) {
    const x = (b.x - camL) * k;
    const y = (b.y - camT) * k;
    const m = 26;
    const onScreen = x > m && x < W - m && y > top + m && y < bottom - m;
    const d = Math.round(Math.hypot(b.x - run.player.x, b.y - run.player.y) / 8);
    if (!onScreen) {
      const cx = W / 2;
      const cy = (top + bottom) / 2;
      const a = Math.atan2(y - cy, x - cx);
      const hw = W / 2 - m;
      const hh = (bottom - top) / 2 - m;
      const t = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), hh / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * t;
      const ay = cy + Math.sin(a) * t;
      const pulse = 1 + 0.15 * Math.sin(run.t * 8);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = '#1b1020';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      label(ctx, `왕씨 ${d}m · ${Math.ceil(b.left)}초`, ax - Math.cos(a) * 30, ay - Math.sin(a) * 22, '#ffd34d');
    } else {
      label(ctx, `왕씨 증권 ${Math.ceil(b.left)}초`, x, y - 30 * k - 8, '#ffd34d');
    }
  }

  // 보스 체력 바
  if (run.boss && !run.boss.dead) {
    const e = run.boss;
    const bw = Math.min(W - 40, 360);
    const bx = (W - bw) / 2;
    const by = top + 14;
    ctx.fillStyle = 'rgba(27,16,32,0.85)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, 26);
    ctx.fillStyle = '#4a1418';
    ctx.fillRect(bx, by + 12, bw, 8);
    ctx.fillStyle = '#ff3b4a';
    ctx.fillRect(bx, by + 12, bw * Math.max(0, e.hp / e.maxHp), 8);
    ctx.font = '12px Galmuri11, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(e.def.name, bx + 2, by + 4);
    ctx.textAlign = 'center';
  }
}

function label(ctx, str, x, y, color) {
  ctx.font = '12px Galmuri11, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1b1020';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export { SPR };

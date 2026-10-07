// 무한 골목 바닥 + 청크 단위 소품. 소품 배치는 (청크 좌표, 시드) 해시로 결정적이다.

import { createRng, hash2 } from './rng.js';
import { addDebris, addText } from './effects.js';
import { dropCoin, dropItem } from './pickups.js';

export const CHUNK = 192;

const BREAKABLE = {
  crate: { r: 6, color: '#a0703c' },
  barrel: { r: 6, color: '#3d6e9c' },
  jar: { r: 5, color: '#b5643c' },
};

export function createWorld(seed) {
  return { seed, chunks: new Map(), broken: new Set(), props: [], decor: [], cx: null, cy: null };
}

function genChunk(world, cx, cy) {
  const rng = createRng(hash2(cx, cy, world.seed));
  const props = [];
  const decor = [];
  const nb = rng.weighted([[0, 3], [1, 4], [2, 2]]);
  for (let i = 0; i < nb; i++) {
    const id = `${cx},${cy},${i}`;
    if (world.broken.has(id)) continue;
    const kind = rng.pick(['crate', 'crate', 'barrel', 'jar']);
    props.push({ id, kind, x: cx * CHUNK + rng.range(16, CHUNK - 16), y: cy * CHUNK + rng.range(16, CHUNK - 16), r: BREAKABLE[kind].r });
  }
  const nd = rng.int(2, 5);
  for (let i = 0; i < nd; i++) {
    decor.push({
      kind: rng.pick(['manhole', 'crack', 'crack', 'puddle', 'paper', 'paper', 'drain', 'sign']),
      x: cx * CHUNK + rng.range(0, CHUNK),
      y: cy * CHUNK + rng.range(0, CHUNK),
    });
  }
  return { props, decor };
}

// 카메라 주변 3x3(+α) 청크만 유지
export function updateWorld(world, camX, camY, viewW, viewH) {
  const cx = Math.floor(camX / CHUNK);
  const cy = Math.floor(camY / CHUNK);
  if (cx === world.cx && cy === world.cy) return;
  world.cx = cx;
  world.cy = cy;
  const rx = Math.ceil(viewW / 2 / CHUNK) + 1;
  const ry = Math.ceil(viewH / 2 / CHUNK) + 1;
  const keep = new Map();
  for (let x = cx - rx; x <= cx + rx; x++) {
    for (let y = cy - ry; y <= cy + ry; y++) {
      const k = `${x},${y}`;
      keep.set(k, world.chunks.get(k) || genChunk(world, x, y));
    }
  }
  world.chunks = keep;
  world.props = [];
  world.decor = [];
  for (const c of keep.values()) {
    for (const p of c.props) if (!world.broken.has(p.id)) world.props.push(p);
    for (const d of c.decor) world.decor.push(d);
  }
}

export function breakProp(run, prop) {
  const world = run.world;
  if (world.broken.has(prop.id)) return;
  world.broken.add(prop.id);
  const i = world.props.indexOf(prop);
  if (i >= 0) world.props.splice(i, 1);
  for (const c of world.chunks.values()) {
    const j = c.props.indexOf(prop);
    if (j >= 0) c.props.splice(j, 1);
  }
  addDebris(run, prop.x, prop.y, 8, BREAKABLE[prop.kind].color, 80);
  run.sfx.push('smash');
  // 재키는 소품을 부순다 → 안에서 뭔가 나온다
  const roll = Math.random();
  if (roll < 0.62) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) dropCoin(run, prop.x, prop.y, Math.random() < 0.2 ? 5 : 1);
  } else if (roll < 0.8) dropItem(run, 'food', prop.x, prop.y);
  else if (roll < 0.87) dropItem(run, 'magnet', prop.x, prop.y);
  else if (roll < 0.91) dropItem(run, 'pager', prop.x, prop.y);
  else addText(run, prop.x, prop.y - 10, '꽝', '#cccccc');
}

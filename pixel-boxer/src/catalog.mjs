/* The footwork catalogue: every entry is a real bout, looped, with the boxer driven through one piece of footwork by a script
   of places to be and buttons to press. One canvas lies behind the page and each card's stage is a window onto its own bout;
   only the cards on screen are stepped and drawn. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices, toWorld } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { createBout, step, settle } from './game/bout.mjs';

import { ENTRIES, HOME, AWAY, drive } from './footwork.mjs';

const DT = 1 / 60;
// the cards are written from the entries, so the page and the bouts cannot disagree about what is in the catalogue
{
  const groups = ['박자', '직선', '좌우', '주먹과 함께'],
    main = document.getElementById('catalog');
  for (const group of groups) {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${group}</h2><div class="grid"></div>`;
    for (const e of ENTRIES.filter(e => e.group === group)) {
      const card = document.createElement('article');
      card.className = e.id === 'bounce' ? 'card feature' : 'card';
      card.dataset.entry = e.id;
      card.innerHTML = `<div class="stage" role="img" aria-label="${e.name} 애니메이션"></div>
        <div class="info">
          <h3>${e.name} <span class="en">${e.en}</span></h3>
          <p>${e.note}</p>
          <div class="feet">
            <span class="lamp lead" data-lamp="L"></span><span>앞발</span>
            <span class="lamp rear" data-lamp="R"></span><span>뒷발</span>
            <span class="pace">분당 <b data-pace>–</b>보</span>
          </div>
        </div>`;
      section.lastElementChild.append(card);
    }
    main.append(section);
  }
}

// the square of canvas each bout stands on: tiles, so that where a foot lands can be seen
function floor(half, centre) {
  const gap = 0.085,
    n = Math.round((half * 2) / gap),
    rows = new Float32Array(n * n * 12),
    s = 0.042 ** 2;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = centre[0] - half + (i + 0.5) * gap,
        z = centre[1] - half + (j + 0.5) * gap,
        tile = 0.5,
        fx = Math.abs((((x / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        fz = Math.abs((((z / tile) % 1) + 1.5) % 1 - 0.5) * tile,
        dark = (Math.floor(x / tile + 100) + Math.floor(z / tile + 100)) % 2;
      rows.set([x, 0, z, s, 0, 0, 1e-6, 0, s, fx < 0.03 || fz < 0.03 ? 22 : dark ? 23 : 24, 0, 3], k);
      k += 12;
    }
  return { rows, count: n * n };
}

async function load() {
  const manifest = await (await fetch('assets/manifest.json')).json();
  const boxer = unpack(fromBase64(await (await fetch('assets/' + manifest.boxer.file)).text()), manifest.boxer);
  return { manifest, boxer };
}

function start({ manifest, boxer }) {
  const canvas = document.getElementById('view'),
    R = createRenderer(canvas),
    bind = fk(guardPose()),
    tiles = floor(3.2, [0.6, 0]),
    meshes = { boxer: R.mesh(boxer, manifest.boxer.count), floor: R.mesh(tiles.rows, tiles.count) },
    palettes = [paletteArray(manifest.palette), paletteArray(manifest.palette.map((hex, i) => RIVAL[i] ?? hex))],
    mats = new Float32Array(NAMES.length * 12);
  let speed = 1,
    prints = true,
    last = 0,
    ground = new Float32Array(12),
    ink = new Float32Array(rgb(manifest.palette[0]));

  const cells = ENTRIES.map(entry => {
    const el = document.querySelector(`[data-entry="${entry.id}"]`),
      fx = createFx(),
      cell = {
        entry,
        el,
        stage: el.querySelector('.stage'),
        lamps: { L: el.querySelector('[data-lamp="L"]'), R: el.querySelector('[data-lamp="R"]') },
        pace: el.querySelector('[data-pace]'),
        fx,
        mesh: R.mesh(fx.rows, 0, true),
        bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
        bout: null,
        t: 0,
        acc: 0,
        up: { L: false, R: false },
        plants: [],
        cam: { target: [0.45, 0.52, 0], yaw: entry.view.yaw, pitch: entry.view.pitch, dist: 5.4 },
        seen: false
      };
    reset(cell);
    return cell;
  });
  function reset(cell) {
    const bout = createBout(7);
    [bout.fighters[0].x, bout.fighters[0].z] = HOME;
    [bout.fighters[1].x, bout.fighters[1].z] = AWAY;
    settle(bout);
    cell.bout = bout;
    cell.t = 0;
  }
  function tick(cell) {
    const { entry, bout } = cell,
      [a, b] = bout.fighters,
      controls = drive(entry, bout, cell.t, DT);
    cell.t += DT;
    step(bout, controls, DT);
    b.hp = 1000; // he is here to be stood in front of, not beaten
    // a foot coming down: light its lamp, leave its print, and keep the time for the pace
    for (const [side, joint] of [['L', 'LeftFoot'], ['R', 'RightFoot']]) {
      const y = a.pose.at[joint][1],
        wasUp = cell.up[side];
      if (y > 0.099) cell.up[side] = true;
      else if (wasUp && y < 0.094) {
        cell.up[side] = false;
        cell.lamps[side].classList.remove('on');
        void cell.lamps[side].offsetWidth;
        cell.lamps[side].classList.add('on');
        cell.plants.push(cell.t);
        if (cell.plants.length > 8) cell.plants.shift();
        if (prints) cell.fx.print(toWorld(a.place, a.pose.at[joint], 1), a.yaw + (side === 'L' ? -0.2 : -0.8), side === 'L' ? [40, 40, 39, 25, 24] : [41, 41, 25, 25, 24], 1.5);
      }
    }
  }

  function theme() {
    // the canvas has no transparency: what it paints round the stages is the page's own colour
    const bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
    ground = new Float32Array([0, 1, 2, 3].flatMap(() => [bg[0] / 255, bg[1] / 255, bg[2] / 255]));
  }
  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000 || 0) * speed;
    last = now;
    const dpr = Math.min(devicePixelRatio || 1, 3),
      w = Math.max(1, Math.round(canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    const grid = R.resize(h / Math.max(2, Math.round(dpr * 2.5))); // about two and a half screen pixels to an art pixel
    if (Math.round(now / 500) !== Math.round((now - 17) / 500)) theme();
    R.begin();
    for (const cell of cells) {
      const box = cell.stage.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight || box.width < 8) continue;
      cell.acc += elapsed;
      let steps = 0;
      while (cell.acc >= DT && steps++ < 6) (cell.acc -= DT), tick(cell);
      if (steps > 6) cell.acc = 0;
      const [a, b] = cell.bout.fighters,
        layers = [{ mesh: meshes.floor, palette: palettes[0], mask: 0.5 }],
        shadows = [];
      [a, b].forEach((f, i) => {
        R.packBones(boneMatrices(f.pose, bind, f.place, mats, 0), cell.bones[i]);
        shadows.push({ x: f.x + f.pose.at.Hips[2] * Math.sin(f.yaw), z: f.z + f.pose.at.Hips[2] * Math.cos(f.yaw), yaw: f.yaw, long: 0.3, wide: 0.24 });
      });
      cell.mesh.update(cell.fx.rows, cell.fx.update(elapsed, shadows, 22));
      layers.push({ mesh: cell.mesh, palette: palettes[0], mask: 0.6 }, { mesh: meshes.boxer, bones: cell.bones[0], palette: palettes[0], mask: 1 }, { mesh: meshes.boxer, bones: cell.bones[1], palette: palettes[1], mask: 1, flash: b.flash > 0 ? 1 : 0 });
      // the camera stays on the boxer whose feet these are, the other man at the edge of the picture
      const ease = 1 - Math.exp(-elapsed * 4),
        rect = { x: Math.round((box.left * dpr) / grid.scale), y: Math.round(((innerHeight - box.bottom) * dpr) / grid.scale), w: Math.round((box.width * dpr) / grid.scale), h: Math.round((box.height * dpr) / grid.scale) };
      cell.cam.target[0] += (a.x * 0.6 + b.x * 0.4 - cell.cam.target[0]) * ease;
      cell.cam.target[2] += (a.z * 0.6 + b.z * 0.4 - cell.cam.target[2]) * ease;
      // far enough back that both men are in the picture from the feet up, whatever shape the window is
      cell.cam.dist = Math.max(5.2, 3.6 / (2 * Math.tan((19 * Math.PI) / 180) * (rect.w / rect.h)));
      R.cell(rect, { camera: cell.cam, layers });
      // the pace: feet a minute, from the last few to come down
      if (cell.plants.length >= 4 && Math.round(cell.t * 2) !== Math.round((cell.t - DT) * 2)) {
        const span = cell.plants[cell.plants.length - 1] - cell.plants[0];
        cell.pace.textContent = cell.t - cell.plants[cell.plants.length - 1] > 1.5 ? '–' : String(Math.round(((cell.plants.length - 1) / span) * 60));
      }
    }
    R.end({ hall: ground, ink });
    requestAnimationFrame(frame);
  }

  for (const button of document.querySelectorAll('[data-speed]'))
    button.addEventListener('click', () => {
      speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('[data-speed]')) other.setAttribute('aria-pressed', String(other === button));
    });
  const toggle = document.getElementById('prints');
  toggle.addEventListener('click', () => {
    prints = !prints;
    toggle.setAttribute('aria-pressed', String(prints));
  });
  globalThis.__catalog = { cells, renderer: R };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});

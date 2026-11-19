/* The motion catalogue: every entry is a real bout, looped, with the boxer driven through one piece of footwork, or one
   exchange of punches and defence, by a script of places to be and buttons to press (src/footwork.mjs, src/defense.mjs).
   One canvas lies behind the page and each card's stage is a window onto its own bout; only the cards on screen are
   stepped and drawn. An exchange starts from a fresh bout every loop, so what each card shows is what its test checks. */
import { createRenderer, paletteArray, rgb } from './render/renderer.mjs';
import { createFx } from './render/fx.mjs';
import { unpack, fromBase64 } from './render/splats.mjs';
import { fk, NAMES } from './rig/skeleton.mjs';
import { RIVAL } from './rig/boxer.mjs';
import { boneMatrices, toWorld } from './anim/pose.mjs';
import { guardPose } from './anim/animator.mjs';
import { step } from './game/bout.mjs';

import { ENTRIES, freshBout, drive } from './footwork.mjs';
import { DEFENSE } from './defense.mjs';

const ALL = [...ENTRIES, ...DEFENSE];
// what became of the punch, as the card says it
const SAID = { whiff: '빗나감', graze: '스침', block: '막음', parry: '패리', hit: '명중' };

const DT = 1 / 60;
// the cards are written from the entries, so the page and the bouts cannot disagree about what is in the catalogue
{
  const parts = [
      ['풋워크', ['박자', '직선', '좌우', '주먹과 함께']],
      ['수비와 피격', ['피하기', '막기', '맞기', '다운']]
    ],
    main = document.getElementById('catalog');
  for (const [part, groups] of parts) {
    const head = document.createElement('h2');
    head.className = 'part';
    head.textContent = part;
    main.append(head);
    for (const group of groups) {
      const section = document.createElement('section');
      section.innerHTML = `<h2>${group}</h2><div class="grid"></div>`;
      for (const e of ALL.filter(e => e.group === group)) {
        const card = document.createElement('article');
        card.className = e.group === '박자' ? 'card feature' : 'card';
        card.dataset.entry = e.id;
        card.innerHTML = `<div class="stage" role="img" aria-label="${e.name} 애니메이션"></div>
          <div class="info">
            <h3>${e.name} <span class="en">${e.en}</span></h3>
            <p>${e.note}</p>
            ${
              e.punch !== undefined
                ? e.status
                  ? `<div class="feet result"><span class="tag">${e.status}</span></div>`
                  : `<div class="feet result"><span class="tag" data-tag>–</span><span class="pace"><b data-blow>–</b> N·s</span></div>`
                : `<div class="feet">
              <span class="lamp lead" data-lamp="L"></span><span>앞발</span>
              <span class="lamp rear" data-lamp="R"></span><span>뒷발</span>
              <span class="pace">분당 <b data-pace>–</b>보</span>
            </div>`
            }
          </div>`;
        section.lastElementChild.append(card);
      }
      main.append(section);
    }
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

  const cells = ALL.map(entry => {
    const el = document.querySelector(`[data-entry="${entry.id}"]`),
      fx = createFx(),
      cell = {
        entry,
        el,
        stage: el.querySelector('.stage'),
        lamps: { L: el.querySelector('[data-lamp="L"]'), R: el.querySelector('[data-lamp="R"]') },
        pace: el.querySelector('[data-pace]'),
        tag: el.querySelector('[data-tag]'),
        blow: el.querySelector('[data-blow]'),
        exchange: entry.punch !== undefined,
        shake: 0,
        fx,
        mesh: R.mesh(fx.rows, 0, true),
        bones: [new Float32Array(R.maxBones * 12), new Float32Array(R.maxBones * 12)],
        bout: null,
        t: 0,
        acc: 0,
        up: { L: false, R: false },
        plants: [],
        cam: { target: [0.45, entry.punch !== undefined ? 0.85 : 0.52, 0], yaw: entry.view.yaw, pitch: entry.view.pitch, dist: 5.4 },
        seen: false
      };
    reset(cell);
    return cell;
  });
  function reset(cell) {
    cell.bout = freshBout(cell.entry);
    cell.t = 0;
  }
  // what a card says about the exchange it is showing
  function tell(cell, text, blow) {
    cell.tag.textContent = text;
    cell.tag.classList.remove('on');
    void cell.tag.offsetWidth;
    cell.tag.classList.add('on');
    cell.blow.textContent = blow === undefined ? '–' : String(Math.round(blow));
  }
  function tick(cell) {
    const { entry } = cell;
    // an exchange is fought from a fresh bout every time round
    if (cell.exchange && cell.t > 0 && Math.round(cell.t / DT) % Math.round(entry.loop / DT) === 0) reset(cell);
    const bout = cell.bout,
      [a, b] = bout.fighters,
      controls = drive(entry, bout, cell.t, DT);
    cell.t += DT;
    step(bout, controls, DT);
    b.hp = 1000; // he is here to be stood in front of, not beaten
    if (!entry.hurt) a.hp = 1000;
    for (const e of bout.events) {
      const by = e.type === 'parry' ? e.on : e.who;
      if (cell.tag && by === 1 && SAID[e.type]) tell(cell, e.down ? '다운' : SAID[e.type], e.J);
      // the blow itself, as the game shows it: sparks and sweat sized by its impulse, and the picture shaken
      if (e.type === 'hit') {
        const k = Math.min(1.6, e.J / 85);
        cell.fx.sparks(e.at, Math.round(5 + 12 * k), [38, 39, 40, 41], 2.5 + 3 * k, e.dir);
        cell.fx.sparks(e.at, Math.round(3 + 8 * k), [41, 41, 25], 2.5 + 2 * k, e.dir);
        cell.shake = e.down ? 5 : 1 + 2.5 * k;
      } else if (e.type === 'block') (cell.fx.sparks(e.at, 4, [38, 25, 24], 2.5, e.dir), (cell.shake = 1));
      else if (e.type === 'parry') (cell.fx.sparks(e.at, 14, [38, 38, 39, 40], 5), (cell.shake = 2));
    }
    cell.shake *= 0.82;
    // a foot coming down: light its lamp, leave its print, and keep the time for the pace
    if (!cell.exchange) for (const [side, joint] of [['L', 'LeftFoot'], ['R', 'RightFoot']]) {
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
      // (an exchange is framed on the two of them, close; footwork on the boxer whose feet these are)
      const mine = cell.exchange ? 0.5 : 0.6;
      cell.cam.target[0] += (a.x * mine + b.x * (1 - mine) - cell.cam.target[0]) * ease;
      cell.cam.target[2] += (a.z * mine + b.z * (1 - mine) - cell.cam.target[2]) * ease;
      // far enough back that both men are in the picture from the feet up, whatever shape the window is
      const [near, wide] = cell.exchange ? [3.3, 2.5] : [5.2, 3.6];
      cell.cam.dist = Math.max(near, wide / (2 * Math.tan((19 * Math.PI) / 180) * (rect.w / rect.h)));
      const jolt = cell.shake > 0.3 ? [Math.sin(cell.t * 97) * cell.shake, Math.cos(cell.t * 83) * cell.shake * 0.6] : null;
      R.cell(rect, { camera: cell.cam, layers, shake: jolt });
      // the pace: feet a minute, from the last few to come down
      if (!cell.exchange && cell.plants.length >= 4 && Math.round(cell.t * 2) !== Math.round((cell.t - DT) * 2)) {
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
  // (for looking at the page from a script: every card stepped on by so many seconds at once)
  globalThis.__catalog = { cells, renderer: R, advance: sec => cells.forEach(cell => { for (let i = 0; i < Math.round(sec / DT); i++) tick(cell); }) };
  theme();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

load().then(start).catch(error => {
  console.error(error);
  document.getElementById('loading').textContent = '불러오지 못했습니다: ' + error.message;
});

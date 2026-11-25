// 5-3: in the underground pit a block's sparks (today's defence style, render/blow.mjs met: colours [38, 25, 24], "white and
// blue") are drawn with the pit's floor palette, because src/main.mjs puts them in fx[0] (the shadows and dust layer) and
// draws that layer with arena.floor; the pit's floor palette has its concrete in 22-25. So in the pit they come out white and
// dark brown concrete instead of white and canvas blue. (Hit sparks go into the motes layers, drawn with the plain palette,
// and keep their blue: [41, 41, 25].) No browser: the palette and the event's spark rows, as the page builds them.
// usage: node 5-3.mjs <pixel-boxer root>
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const imp = p => import(path.join(root, p));
const { dress } = await imp('src/rig/boxer.mjs');
const { pitPalette } = await imp('src/world/pit.mjs');
const { createFx } = await imp('src/render/fx.mjs');
const { met } = await imp('src/render/blow.mjs');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const ringFloor = dress(manifest.palette, 0), pitFloor = pitPalette(dress(manifest.palette, 0)), plain = dress(manifest.palette, 0);
const main = fs.readFileSync(path.join(root, 'src/main.mjs'), 'utf8');
const wired = /guard\.meet\(e, bout\.fighters, fx\[0\]/.test(main) && /mesh: meshes\.fx\[0\], palette: arena\.floor/.test(main);
console.log('main.mjs: guard sparks into fx[0], fx[0] drawn with arena.floor:', wired);
// a block, as the bout reports one: its sparks' palette entries
let seed = 7;
const fx = createFx(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
met(fx, { type: 'block', at: [0, 1.4, 0], dir: [0, 0, 1] });
// (their colours over their life: a frame at a time for 0.4 s, every splat drawn counted)
const used = new Map();
let n = 0;
for (let f = 0; f < 24; f++) {
  const live = fx.update(1 / 60, [], 22);
  n += live;
  for (let i = 0; i < live; i++) { const p = Math.round(fx.rows[i * 12 + 9]); used.set(p, (used.get(p) || 0) + 1); }
}
const hex = v => '#' + v.toString(16).padStart(6, '0');
let changed = 0;
for (const [p, k] of [...used].sort((a, b) => a[0] - b[0])) {
  const differs = ringFloor[p] !== pitFloor[p];
  if (differs) changed += k;
  console.log(`entry ${p} x${k}: ring ${hex(ringFloor[p])}  pit ${hex(pitFloor[p])}  (motes' palette ${hex(plain[p])})${differs ? '  <- recoloured in the pit' : ''}`);
}
console.log(`block spark splats drawn over 24 frames ${n}, recoloured in the pit ${changed}`);
console.log(wired && changed ? `REPRO: yes a block's sparks in the pit: ${changed}/${n} spark-frames drawn in the pit floor's concrete (#37322f/#4a4440) instead of canvas blue` : 'REPRO: no');

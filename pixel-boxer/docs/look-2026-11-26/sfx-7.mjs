/* sfx-7: the 헐떡임 card plays a spent man's in-breath and out-breath 0.38 s apart (src/sfx.mjs: setTimeout 380 ms), but the
   game breathes him every 0.75 s (createEars: s.pant >= 0.75), so the page pants twice as fast as the game does.
   node sfx-7.mjs <pixel-boxer root> */
import { open, SR } from './sfx-lib.mjs';
const root = process.argv[2];
const { createEars } = await import(root + '/src/game/audio.mjs');
// the game: a spent man standing still, stepped at 60 Hz for 4 s
const ears = createEars(), man = { x: 0, z: 0, stamina: 0.02, k: { staminaMax: 1 } }, at = [];
for (let i = 0; i < 240; i++) for (const q of ears.watch([man], 1 / 60, {})) q.name === 'pant' && at.push(+(i / 60).toFixed(3));
const gameGap = at[1] - at[0];
// the page: the card rendered, the onsets found (envelope crossing 10% of the peak after 60 ms under it)
const h = await open(root);
const r = await h.render({ card: '헐떡임', dur: 2 });
await h.close();
const env = [], hop = 240;
for (let i = 0; i + hop <= r.L.length; i += hop) {
  let s = 0;
  for (let j = i; j < i + hop; j++) s += r.L[j] * r.L[j] + r.R[j] * r.R[j];
  env.push(Math.sqrt(s / hop));
}
const pk = env.reduce((a, b) => Math.max(a, b), 0), on = [];
let quiet = 99;
env.forEach((v, i) => {
  if (v > pk * 0.1 && quiet >= 12) on.push((i * hop) / SR);
  quiet = v > pk * 0.1 ? 0 : quiet + 1;
});
const pageGap = on[1] - on[0];
console.log(`game pant cues at ${at.slice(0, 5).join(', ')} s (gap ${gameGap.toFixed(2)} s); page card onsets ${on.map(x => x.toFixed(3)).join(', ')} s (gap ${pageGap.toFixed(2)} s); log ${r.log.join(' | ')}`);
console.log(pageGap < gameGap * 0.7 ? `REPRO: yes the 헐떡임 card breathes in and out ${pageGap.toFixed(2)} s apart, the game ${gameGap.toFixed(2)} s` : 'REPRO: no');

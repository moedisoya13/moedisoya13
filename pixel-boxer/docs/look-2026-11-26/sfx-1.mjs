/* sfx-1: the cards played by name pan sounds the game plays in the centre (bell, crowd, win/lose) to the chosen man's side,
   and pan a voice at ±0.40 where the same voice heard through cuesOf (another card) sits at ±0.25.
   Game: main.mjs:156 audio.play('bell', { strikes: 1 }), :283 audio.play(won ? 'win' : 'lose') — no pan; cuesOf's roar /
   cheer / bell have no `who`, so cast() gives panOf(c, undefined) = 0.  Page: src/sfx.mjs `play` defaults pan to ±0.4.
   node sfx-1.mjs <pixel-boxer root> */
import { open, measure, f1 } from './sfx-lib.mjs';
const root = process.argv[2];
const h = await open(root);
const rows = [];
for (const [card, who] of [['공: 시작', 0], ['공: 시작', 1], ['공: KO', 0], ['함성', 0], ['환호', 1], ['승리', 0], ['패배', 1]]) {
  const r = await h.render({ card, who, dur: card === '함성' ? 4 : 3 });
  rows.push([`page card ${card} (voice ${who ? '파랑' : '빨강'})`, measure(r.L, r.R).lr, r.log.at(-1)]);
}
// the game's way: as main.mjs / spar.mjs call it, and the bell / roar as cuesOf gives them for a knockdown
for (const [label, body] of [
  ["game: audio.play('bell', { strikes: 1 })", "s => s.audio.play('bell', { strikes: 1 })"],
  ["game: audio.play('win')", "s => s.audio.play('win')"],
  ['game: cuesOf roar (hit, down, pit) alone', "s => s.audio.play('roar', { pan: 0 })"]
]) {
  const r = await h.call(body, 4);
  rows.push([label, measure(r.L, r.R).lr, r.played]);
}
// a voice: the gasp card (by name) vs the gasp inside the head-hit card (through cuesOf)
const g1 = await h.render({ card: '머리 "헉"' });
const g2 = await h.call("s => s.audio.hear({ type: 'hit', who: 1, on: 0, J: 85, part: 'glove' }, s.heard(false))", 3);
rows.push(['page card 머리 "헉" (by name)', measure(g1.L, g1.R).lr, g1.log.at(-1)]);
rows.push(['page card 머리 (cuesOf: impact + gasp)', measure(g2.L, g2.R).lr, g2.played]);
await h.close();
for (const [k, lr, log] of rows) console.log(`${k.padEnd(48)} L/R ${f1(lr).padStart(5)} dB   ${String(log).slice(0, 110)}`);
const bellPage = rows[0][1], bellBlue = rows[1][1], bellGame = rows.find(r => r[0].startsWith("game: audio.play('bell'"))[1];
const yes = Math.abs(bellPage) > 3 && Math.abs(bellGame) < 0.5 && Math.sign(bellPage) !== Math.sign(bellBlue);
console.log(yes ? `REPRO: yes the start bell card is ${f1(bellPage)} dB L/R (red) / ${f1(bellBlue)} dB (blue); the game's bell ${f1(bellGame)} dB (centre)` : 'REPRO: no');

// spar-4: after the knockdown the HUD round clock runs on, under a result that gives the knockdown's time. src/spar.mjs:254 shows
// bout.t whenever the phase is 'play' or 'over', and the page keeps stepping the bout once the plan's controls run out
// (src/spar.mjs:520: NONE once he is down), so the clock goes on counting while the result reads "KO 0:39". Plays the round's
// controls as the page does, then 20 s more of NONE (the result sits on screen as long as the viewer likes).
// (Browser check: shots/spar-s5-390-53.png HUD 0:48 under "KO 0:39".) Usage: node spar-6.mjs <pixel-boxer root> [seed]
const root = process.argv[2], seed = +(process.argv[3] || 5);
const { planOf, startOf } = await import(root + '/src/spar/plan.mjs');
const { step } = await import(root + '/src/game/bout.mjs');
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const plan = planOf(seed), bout = startOf(plan);
for (const inp of plan.inputs) step(bout, inp, 1 / 60);
const atEnd = bout.t;
for (let i = 0; i < 20 * 60; i++) step(bout, [{}, {}], 1 / 60);
console.log(`#${seed}: result "KO ${clock(plan.ko.t)}"; HUD clock when the plan's controls end ${clock(atEnd)}, 20 s later ${clock(bout.t)}`);
console.log(`REPRO: ${bout.t - plan.ko.t > 2 ? 'yes' : 'no'} the HUD clock reads ${clock(bout.t)} under a result of KO ${clock(plan.ko.t)} (+${(bout.t - plan.ko.t).toFixed(1)} s and still counting)`);

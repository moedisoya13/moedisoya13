// eye 7, finding 7-1: a knockdown blow of low impulse sounds like a light tap (no sub boom, short, quieter than the round's
// ordinary blows), though README says the knockdown's impact is the heaviest.
// usage: node 7-1.mjs <pixel-boxer root>      (sparring rounds #6 and #8, as spar.html arranges them; ~1-2 min)
const root = process.argv[2];
const { createAudio, cuesOf } = await import(root + '/src/game/audio.mjs');
const { planOf, startOf, DT } = await import(root + '/src/spar/plan.mjs');
const { step } = await import(root + '/src/game/bout.mjs');

function fakeContext() {
  const p = v => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(x) { if (!(x > 0)) throw new RangeError(); }, setTargetAtTime() {}, cancelScheduledValues() {} });
  const n = m => Object.assign({ connect: x => x, disconnect() {} }, m);
  return { currentTime: 0, sampleRate: 48000, state: 'running', destination: n(), resume() {}, createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }), createGain: () => n({ gain: p(1) }), createStereoPanner: () => n({ pan: p(0) }), createBiquadFilter: () => n({ frequency: p(1), Q: p(1) }), createDynamicsCompressor: () => n({ threshold: p(0), knee: p(0), ratio: p(0), attack: p(0), release: p(0) }), createOscillator: () => n({ frequency: p(1), start() {}, stop() {} }), createBufferSource: () => n({ start() {}, stop() {} }) };
}
// (one impact cue played alone, so the voice cap and gaps do not come into it)
const sized = o => {
  const a = createAudio({ context: fakeContext(), random: () => 0.5 });
  a.unlock();
  return a.play('impact', o);
};
const median = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let shown = 0;
for (const seed of [6, 8]) {
  const plan = planOf(seed),
    bout = startOf(plan),
    levels = [],
    durs = [];
  let ko = null;
  for (const inp of plan.inputs) {
    step(bout, inp, DT);
    for (const e of bout.events) {
      if (e.type !== 'hit') continue;
      const imp = cuesOf(e, { men: bout.fighters }).find(q => q.name === 'impact'),
        r = sized(imp.o);
      if (e.down || e.out) ko = { J: e.J, counter: !!e.counter, name: e.name, level: r.level, dur: r.dur };
      else levels.push(r.level), durs.push(r.dur);
    }
    if (ko) break;
  }
  const mL = median(levels), mD = median(durs), beaten = levels.filter(l => l > ko.level).length;
  console.log(`round #${seed}: knockdown ${ko.name} J ${ko.J} N·s -> impact level ${ko.level.toFixed(3)}, ${(ko.dur * 1000).toFixed(0)} ms; ` + `the round's ${levels.length} other blows: median level ${mL.toFixed(3)}, ${(mD * 1000).toFixed(0)} ms; ${beaten} of them louder than the knockdown`);
  if (ko.level < mL || ko.dur < mD) shown++;
}
// (the impact's own curve: no sub drop, and no knockdown lengthening, below J = 0.5 * CLEAN = 42.5 N·s)
const a = sized({ J: 40, down: true, where: 'head' }), b = sized({ J: 45, down: true, where: 'head' }), c = sized({ J: 85, where: 'head' });
console.log(`curve: down J40 ${(a.dur * 1000).toFixed(0)} ms level ${a.level.toFixed(3)} | down J45 ${(b.dur * 1000).toFixed(0)} ms level ${b.level.toFixed(3)} | ordinary clean cross J85 ${(c.dur * 1000).toFixed(0)} ms level ${c.level.toFixed(3)}`);
console.log(shown ? `REPRO: yes in ${shown} of 2 rounds the knockdown impact is quieter/shorter than the round's median blow (down J40: ${(a.dur * 1000).toFixed(0)} ms vs down J45: ${(b.dur * 1000).toFixed(0)} ms)` : 'REPRO: no knockdown impacts are the heaviest');

// eye 7, finding 7-2: the knockout's three bell strikes (live, scheduled 1.1 s after the blow) ring over the slow replay, and
// land on top of the replay's own slowed impact. Played as src/spar.mjs plays a round (its knockdown: src/spar/knock.mjs),
// with a fake AudioContext whose clock moves 1/60 s a step (and a frame of the replay).
// usage: node 7-2.mjs <pixel-boxer root>     (sparring rounds #1 and #6 in the ring; ~1 min)
const root = process.argv[2];
const { createAudio, cuesOf, panOf } = await import(root + '/src/game/audio.mjs');
const { planOf, startOf, DT } = await import(root + '/src/spar/plan.mjs');
const { step } = await import(root + '/src/game/bout.mjs');
const { createKnockdown } = await import(root + '/src/spar/knock.mjs');

function fakeContext() {
  const p = v => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(x) { if (!(x > 0)) throw new RangeError(); }, setTargetAtTime() {}, cancelScheduledValues() {} });
  const n = m => Object.assign({ connect: x => x, disconnect() {} }, m);
  return { currentTime: 0, sampleRate: 48000, state: 'running', destination: n(), resume() {}, createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }), createGain: () => n({ gain: p(1) }), createStereoPanner: () => n({ pan: p(0) }), createBiquadFilter: () => n({ frequency: p(1), Q: p(1) }), createDynamicsCompressor: () => n({ threshold: p(0), knee: p(0), ratio: p(0), attack: p(0), release: p(0) }), createOscillator: () => n({ frequency: p(1), start() {}, stop() {} }), createBufferSource: () => n({ start() {}, stop() {} }) };
}
let overlaps = 0;
const seeds = [1, 6];
for (const seed of seeds) {
  const plan = planOf(seed),
    ctx = fakeContext(),
    audio = createAudio({ context: ctx, random: () => 0.5 }),
    bout = startOf(plan),
    cam = { yaw: 0, target: [0, 0.8, 0] },
    heard = (men, more) => Object.assign({ men: men || bout.fighters, yaw: cam.yaw, target: cam.target, pit: false, you: null }, more),
    knock = createKnockdown({ yaw: () => cam.yaw, aspect: () => 16 / 9 }),
    log = [];
  audio.unlock();
  const hear = (e, c, tag) => {
    for (const r of audio.hear(e, c)) log.push({ tag, name: r.name, at: r.at, end: r.at + r.dur });
  };
  let k = 0, replayFrom = null, replayTo = null;
  for (let guard = 0; guard < 60 * 150; guard++) {
    if (knock.playing) {
      if (replayFrom === null) replayFrom = ctx.currentTime;
      knock.picture(DT, bout);
      const rate = Math.max(0.2, Math.min(1, knock.moved / DT));
      for (const st of knock.crossed) for (const e of st.events) hear(e, heard(st.men, { replay: true, rate }), 'replay');
      ctx.currentTime += DT;
      if (!knock.playing) replayTo = ctx.currentTime;
      continue;
    }
    if (replayTo !== null) break;
    const inp = k < plan.inputs.length ? plan.inputs[k] : bout.over !== null ? [{}, {}] : null;
    if (!inp) break;
    k++;
    step(bout, inp, DT);
    ctx.currentTime += DT;
    for (const e of bout.events) hear(e, heard(), 'live');
    audio.watch(bout.fighters, DT, heard());
    knock.after(bout, true);
  }
  const blow = log.find(x => x.tag === 'live' && x.name === 'impact' && x.at >= (log.find(y => y.name === 'exhale') || {}).at - 0.2),
    bell = log.filter(x => x.name === 'bell').pop(),
    strikes = bell ? [0, 0.3, 0.6].map(d => bell.at + d) : [],
    again = log.find(x => x.tag === 'replay' && x.name === 'impact');
  const f = x => (x - blow.at).toFixed(2);
  console.log(`round #${seed}: knockdown blow at +0.00 s; replay plays +${f(replayFrom)}..+${f(replayTo)} s; the replay's slowed impact at +${f(again.at)} s; ` + `the KO bell's strikes at +${strikes.map(f).join(', +')} s, ringing to +${f(bell.end)} s`);
  if (bell && bell.at < replayTo && bell.end > replayFrom) overlaps++;
}
console.log(overlaps ? `REPRO: yes in ${overlaps} of ${seeds.length} rounds the live KO bell (3 strikes from +1.1 s) rings during the slow replay, over its slowed impact` : 'REPRO: no the bell does not overlap the replay');

// eye 7, finding 7-3: the slow replay of a knockdown re-plays only the blow (hit/block/parry: replay.mjs BLOWS); the punch's
// breath and swing, and every other sound of the replayed stretch, are not heard again, so the slowed wind-up is silent. Played as src/spar.mjs plays a round (its knockdown: src/spar/knock.mjs),
// with a fake AudioContext whose clock moves 1/60 s a step (and a frame of the replay).
// usage: node 7-3.mjs <pixel-boxer root>     (sparring rounds #1 and #6 in the ring; ~1 min)
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
  let view = null;
  audio.unlock();
  const hear = (e, c, tag) => {
    for (const r of audio.hear(e, c)) log.push({ tag, name: r.name, at: r.at, end: r.at + r.dur, t: bout.t, type: e.type });
  };
  let k = 0, replayFrom = null, replayTo = null;
  for (let guard = 0; guard < 60 * 150; guard++) {
    if (knock.playing) {
      if (replayFrom === null) replayFrom = ctx.currentTime;
      knock.picture(DT, bout);
      view = view || knock.view;
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
  const live = log.filter(x => x.tag === 'live' && x.t >= view.from - 1e-9 && x.t <= view.blow + 1e-9),
    again = log.filter(x => x.tag === 'replay'),
    names = xs => Object.entries(xs.reduce((m, x) => ((m[x.name] = (m[x.name] || 0) + 1), m), {})).map(([k, v]) => k + ' ' + v).join(', ');
  const firstAgain = again.length ? again[0].at - replayFrom : null;
  console.log(`round #${seed}: replayed stretch ${view.from.toFixed(2)}..${view.to.toFixed(2)} s of the bout (blow at ${view.blow.toFixed(2)}); live sounds up to the blow: ${live.length} (${names(live)}); ` + `heard again in the replay: ${again.length} (${names(again)}); the replay plays ${(replayTo - replayFrom).toFixed(2)} s, its first sound ${firstAgain.toFixed(2)} s in`);
  if (live.some(x => x.name === 'breath') && !again.some(x => x.name === 'breath')) overlaps++;
}
console.log(overlaps ? `REPRO: yes in ${overlaps} of ${seeds.length} rounds the slow replay drops the knockout punch's breath/swing: only the impact (and the faller's exhale) is heard again` : 'REPRO: no the replay re-plays the punch too');

// Sound effects of GDD §10, synthesised with WebAudio (no samples, no music). The engine creates
// the AudioContext on the first key or pointer press and plays a registered id through its
// master gain (volume = settings.sfx, 0 = mute); this file registers every id. Sounds run
// through one compressor so a crowd of hits does not clip.

const SFX = BD.ui.sfx;
const AU = BD.client.audio;
const A = BD.ui.audio = {};

let bus = null, busCtx = null, noiseBuf = null;
function out(ac, dest) {
  if (bus && busCtx === ac) return bus;
  busCtx = ac;
  bus = ac.createDynamicsCompressor();
  bus.threshold.value = -14; bus.knee.value = 10; bus.ratio.value = 6; bus.attack.value = 0.003; bus.release.value = 0.12;
  bus.connect(dest);
  return bus;
}
function noise(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const n = ac.sampleRate;
  noiseBuf = ac.createBuffer(1, n, n);
  const d = noiseBuf.getChannelData(0);
  let s = 0x9e3779b9;
  for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
  return noiseBuf;
}
function env(gn, t, attack, dur, peak) {
  const p = gn.gain;
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + Math.max(0.002, attack));
  p.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
}
// oscillator voice: o {type, f0, f1, t, dur, gain, attack, curve: 'exp'|'lin', to}
function tone(ac, dest, o) {
  const osc = ac.createOscillator(), gn = ac.createGain();
  osc.type = o.type || 'sine';
  const t = o.t, f1 = o.f1 === undefined ? o.f0 : o.f1;
  osc.frequency.setValueAtTime(o.f0, t);
  if (f1 !== o.f0) {
    if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(f1, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + o.dur);
  }
  env(gn, t, o.attack || 0.004, o.dur, o.gain || 0.2);
  osc.connect(gn); gn.connect(o.to || dest);
  osc.start(t); osc.stop(t + o.dur + 0.05);
  return osc;
}
// filtered noise: o {t, dur, gain, filter: 'bandpass'|'highpass'|'lowpass', f0, f1, q, attack}
function hiss(ac, dest, o) {
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
  src.buffer = noise(ac);
  src.loop = true;
  f.type = o.filter || 'bandpass';
  f.frequency.setValueAtTime(o.f0, o.t);
  if (o.f1 !== undefined && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), o.t + o.dur);
  f.Q.value = o.q === undefined ? 1 : o.q;
  env(gn, o.t, o.attack || 0.003, o.dur, o.gain || 0.2);
  src.connect(f); f.connect(gn); gn.connect(o.to || dest);
  src.start(o.t, Math.random() * 0.5); src.stop(o.t + o.dur + 0.05);
}
function bell(ac, dest, t, f, dur, gain, partials) {
  for (const [m, k] of partials || [[1, 1], [2.76, 0.45], [5.4, 0.2]]) tone(ac, dest, { t, f0: f * m, dur: dur * (m > 2 ? 0.6 : 1), gain: gain * k, attack: 0.003 });
}
let curve = null;
function distortion(ac) {
  if (!curve) {
    const n = 1024;
    curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 4); }
  }
  const sh = ac.createWaveShaper();
  sh.curve = curve;
  return sh;
}

// ---- voices (GDD-V2 §7.3: a phone must hold 60 fps under 150–330 kills a minute) ------------------
// Every sound counts as one voice for its length. Crowd sounds (kill, hit, shard, slash, warnings …)
// play only while fewer than 8 voices sound, ordinary ones below 12; the sounds that must be heard
// (hurt, level up, the choice, guardians, the boss, the endings, menus) always play. While `hurt`
// sounds (0.25 s) the crowd sounds are held back, so the hit stands out (§7.3 "다른 소리보다 크게").
const VOICE = { live: [], max: 12, crowd: 8, hurtUntil: -1, dropped: 0, played: 0 };
A.voice = VOICE;
const ALWAYS = new Set(['hurt', 'death', 'win', 'level_up', 'choice_open', 'choice_pick', 'card_set', 'guardian_in', 'guardian_down', 'boss_roar', 'dawn_bell', 'ui_ok', 'ui_move', 'surge_horn', 'elite_down', 'stairs_open', 'awaken', 'altar_open', 'flask']);
const CROWD = new Set(['kill', 'hit', 'shard', 'slash', 'telegraph', 'chain', 'ignite', 'splash', 'arrow', 'whirl', 'pierce', 'wave', 'hit_type', 'quest_tick', 'combo_up']);
const DUR = { kill: 0.24, hit: 0.1, shard: 0.08, slash: 0.13, telegraph: 0.07, hurt: 0.25, level_up: 0.5, multi_kill: 0.3, streak: 0.2 };
function admit(id, now) {
  const L = VOICE.live;
  while (L.length && L[0] <= now) L.shift();
  if (ALWAYS.has(id)) return true;
  if (CROWD.has(id) && (L.length >= VOICE.crowd || now < VOICE.hurtUntil)) return false;
  return L.length < VOICE.max;
}
function hold(id, now) {
  const end = now + (DUR[id] || 0.35), L = VOICE.live;
  let i = L.length;
  while (i > 0 && L[i - 1] > end) i--;
  L.splice(i, 0, end); // kept sorted by end time
  if (id === 'hurt') VOICE.hurtUntil = now + 0.25;
}

// def(play(ac, d, opts, t)) — d is the compressor bus, t the start time
function reg(id, fn) {
  SFX.register({
    id,
    play(ac, dest, opts) {
      const now = ac.currentTime;
      if (!admit(id, now)) { VOICE.dropped++; return; }
      hold(id, now); VOICE.played++;
      fn(ac, out(ac, dest), opts || {}, now + 0.004);
    },
  });
}
A.ids = [];
const R = (id, fn) => { A.ids.push(id); reg(id, fn); };

// ---- combat: the hero ----------------------------------------------------------------------
R('slash', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.12, gain: 0.32, filter: 'bandpass', f0: 3200, f1: 900, q: 1.4 }); tone(ac, d, { t, f0: 1300, f1: 420, dur: 0.08, gain: 0.05 }); });
R('pierce', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.24, gain: 0.22, filter: 'highpass', f0: 3800, f1: 6500, attack: 0.02 }); tone(ac, d, { t, f0: 1700, f1: 2700, dur: 0.2, gain: 0.07, attack: 0.02 }); });
R('whirl', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.32, gain: 0.3, filter: 'bandpass', f0: 380, f1: 1500, q: 2.2, attack: 0.08 }); tone(ac, d, { t, f0: 200, f1: 340, dur: 0.3, gain: 0.08, attack: 0.08 }); });
R('wave', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.42, gain: 0.26, filter: 'bandpass', f0: 2600, f1: 500, q: 2.5, attack: 0.01 }); });
R('dash', (ac, d, o, t) => {
  tone(ac, d, { t, f0: 95, f1: 55, dur: 0.22, gain: 0.45 });
  hiss(ac, d, { t, dur: 0.16, gain: 0.22, filter: 'lowpass', f0: 600, f1: 250 });
  for (const dt of [0.05, 0.11]) hiss(ac, d, { t: t + dt, dur: 0.035, gain: 0.12, filter: 'bandpass', f0: 1800, q: 6 });
});
R('dodge', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.1, gain: 0.16, filter: 'highpass', f0: 6000 }); tone(ac, d, { t, f0: 2400, f1: 3400, dur: 0.08, gain: 0.05 }); });
R('charge_ready', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.34, gain: 0.2, filter: 'bandpass', f0: 1400, f1: 5200, q: 7, attack: 0.04 }); tone(ac, d, { t: t + 0.05, f0: 2100, f1: 3200, dur: 0.28, gain: 0.05 }); });
R('riposte', (ac, d, o, t) => {
  for (const [f, k] of [[1520, 1], [2290, 0.6], [3410, 0.35]]) tone(ac, d, { t, f0: f, dur: 0.32, gain: 0.12 * k, type: 'triangle' });
  hiss(ac, d, { t, dur: 0.06, gain: 0.25, filter: 'highpass', f0: 3000 });
});

// ---- combat: hits ----------------------------------------------------------------------------
R('hit', (ac, d, o, t) => { tone(ac, d, { t, f0: 190, f1: 80, dur: 0.08, gain: 0.4 }); hiss(ac, d, { t, dur: 0.06, gain: 0.2, filter: 'lowpass', f0: 1100 }); });
R('hit_guard', (ac, d, o, t) => {
  for (const [f, k] of [[1850, 1], [2780, 0.55], [4100, 0.25]]) tone(ac, d, { t, f0: f, dur: 0.28, gain: 0.13 * k, type: 'triangle' });
  hiss(ac, d, { t, dur: 0.03, gain: 0.2, filter: 'highpass', f0: 4000 });
});
R('hit_type', (ac, d, o, t) => { tone(ac, d, { t, f0: 180, f1: 80, dur: 0.07, gain: 0.3 }); bell(ac, d, t + 0.01, 1320, 0.4, 0.09); });
// kill: opts.pitch semitones (±2 at random, GDD-V2 §7.1), opts.low adds the threat's low thump
R('kill', (ac, d, o, t) => {
  const p = Math.pow(2, (o.pitch || 0) / 12);
  hiss(ac, d, { t, dur: 0.2, gain: 0.38, filter: 'lowpass', f0: 1400 * p, f1: 260 * p }); tone(ac, d, { t, f0: 95 * p, f1: 42 * p, dur: 0.22, gain: 0.3 });
  if (o.low) tone(ac, d, { t: t + 0.02, f0: 62, f1: 34, dur: 0.32, gain: 0.42 });
});
R('ignite', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.05, gain: 0.25, filter: 'bandpass', f0: 5200, q: 3 }); hiss(ac, d, { t: t + 0.03, dur: 0.22, gain: 0.14, filter: 'highpass', f0: 2200, f1: 1400 }); });
R('splash', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.26, gain: 0.32, filter: 'lowpass', f0: 2400, f1: 380 }); hiss(ac, d, { t: t + 0.02, dur: 0.12, gain: 0.12, filter: 'bandpass', f0: 1100, q: 3 }); });
R('chain', (ac, d, o, t) => {
  for (let i = 0; i < 3; i++) { hiss(ac, d, { t: t + i * 0.055, dur: 0.04, gain: 0.22, filter: 'bandpass', f0: 3200 + i * 500, q: 5 }); tone(ac, d, { t: t + i * 0.055, f0: 60, dur: 0.04, gain: 0.12, type: 'square' }); }
});
R('steam', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.75, gain: 0.24, filter: 'highpass', f0: 3200, f1: 1500, attack: 0.03 }); });
R('slam', (ac, d, o, t) => { tone(ac, d, { t, f0: 125, f1: 46, dur: 0.26, gain: 0.55 }); hiss(ac, d, { t, dur: 0.14, gain: 0.25, filter: 'lowpass', f0: 320 }); });

// ---- the hero is hit / heals -----------------------------------------------------------------
R('hurt', (ac, d, o, t) => { tone(ac, d, { t, f0: 150, f1: 60, dur: 0.18, gain: 0.55 }); hiss(ac, d, { t, dur: 0.1, gain: 0.28, filter: 'lowpass', f0: 800 }); tone(ac, d, { t: t + 0.03, f0: 72, dur: 0.24, gain: 0.25 }); });
R('heal_small', (ac, d, o, t) => { tone(ac, d, { t, f0: 520, f1: 790, dur: 0.26, gain: 0.13, type: 'triangle', attack: 0.03 }); });
R('flask', (ac, d, o, t) => {
  for (const [f, dt] of [[1900, 0], [2500, 0.04]]) tone(ac, d, { t: t + dt, f0: f, dur: 0.14, gain: 0.07 });
  [523, 659, 784].forEach((f, i) => tone(ac, d, { t: t + 0.08 + i * 0.07, f0: f, dur: 0.42, gain: 0.1, type: 'triangle', attack: 0.01 }));
});

// ---- enemies -------------------------------------------------------------------------------------
R('telegraph', (ac, d, o, t) => { tone(ac, d, { t, f0: 230, f1: 200, dur: 0.06, gain: 0.12, type: 'triangle' }); hiss(ac, d, { t, dur: 0.02, gain: 0.08, filter: 'bandpass', f0: 2000, q: 4 }); });
R('arrow', (ac, d, o, t) => { tone(ac, d, { t, f0: 1500, f1: 650, dur: 0.16, gain: 0.08 }); hiss(ac, d, { t, dur: 0.1, gain: 0.08, filter: 'highpass', f0: 5000 }); });
R('fire_circle', (ac, d, o, t) => {
  tone(ac, d, { t, f0: 70, f1: 150, dur: 0.5, gain: 0.25, attack: 0.38 });
  hiss(ac, d, { t: t + 0.42, dur: 0.3, gain: 0.35, filter: 'lowpass', f0: 1200, f1: 300 });
});
R('blink', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.17, gain: 0.22, filter: 'bandpass', f0: 500, f1: 3600, q: 3, attack: 0.14 }); });
R('charge', (ac, d, o, t) => { for (let i = 0; i < 4; i++) { tone(ac, d, { t: t + i * 0.07, f0: 110, f1: 60, dur: 0.06, gain: 0.3 }); hiss(ac, d, { t: t + i * 0.07, dur: 0.02, gain: 0.08, filter: 'bandpass', f0: 2600, q: 6 }); } });
R('spawn', (ac, d, o, t) => {
  tone(ac, d, { t, f0: 72, f1: 52, dur: 0.6, gain: 0.2, attack: 0.08 });
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.connect(d);
  tone(ac, d, { t, f0: 74, f1: 54, dur: 0.6, gain: 0.12, type: 'sawtooth', attack: 0.08, to: f });
});
R('guardian_in', (ac, d, o, t) => { for (const dt of [0, 0.3]) { tone(ac, d, { t: t + dt, f0: 82, f1: 40, dur: 0.38, gain: 0.62 }); hiss(ac, d, { t: t + dt, dur: 0.12, gain: 0.2, filter: 'lowpass', f0: 220 }); } });
R('guardian_down', (ac, d, o, t) => { tone(ac, d, { t, f0: 64, f1: 48, dur: 1.2, gain: 0.4, attack: 0.02 }); bell(ac, d, t + 0.25, 1100, 1.2, 0.08); });
R('boss_roar', (ac, d, o, t) => {
  const sh = distortion(ac), f = ac.createBiquadFilter(), gn = ac.createGain();
  f.type = 'lowpass'; f.frequency.value = 700; gn.gain.value = 0.32;
  sh.connect(f); f.connect(gn); gn.connect(d);
  tone(ac, d, { t, f0: 72, f1: 48, dur: 1.4, gain: 0.5, type: 'sawtooth', attack: 0.12, to: sh });
  hiss(ac, d, { t, dur: 1.2, gain: 0.25, filter: 'lowpass', f0: 380, f1: 160, attack: 0.1 });
});
R('boss_cleave', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.5, gain: 0.4, filter: 'bandpass', f0: 360, f1: 140, q: 1.5, attack: 0.12 }); tone(ac, d, { t: t + 0.3, f0: 70, f1: 40, dur: 0.25, gain: 0.35 }); });
R('thorns', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.13, gain: 0.28, filter: 'highpass', f0: 2200, f1: 4200, attack: 0.04 }); tone(ac, d, { t, f0: 300, f1: 950, dur: 0.1, gain: 0.08, type: 'square' }); });

// ---- flow --------------------------------------------------------------------------------------
R('stairs_open', (ac, d, o, t) => {
  [0, 0.05, 0.13, 0.17, 0.26].forEach((dt, i) => hiss(ac, d, { t: t + dt, dur: 0.04, gain: 0.22, filter: 'bandpass', f0: 2300 + (i % 3) * 600, q: 8 }));
  tone(ac, d, { t: t + 0.26, f0: 140, f1: 80, dur: 0.18, gain: 0.3 });
});
R('altar_open', (ac, d, o, t) => { bell(ac, d, t, 220, 1.6, 0.18, [[1, 1], [2.5, 0.4], [3.0, 0.3], [4.2, 0.12]]); });
R('dawn_bell', (ac, d, o, t) => {
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(d);
  for (const dt of [0, 0.85, 1.7]) bell(ac, f, t + dt, 330, 1.8, 0.16, [[1, 1], [2.52, 0.5], [3.03, 0.3]]);
});
R('death', (ac, d, o, t) => { tone(ac, d, { t, f0: 330, f1: 98, dur: 1.3, gain: 0.22, type: 'triangle', attack: 0.02 }); tone(ac, d, { t, f0: 165, f1: 49, dur: 1.4, gain: 0.18 }); });
R('win', (ac, d, o, t) => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(ac, d, { t: t + i * 0.11, f0: f, dur: 1.7 - i * 0.1, gain: 0.09, type: 'triangle', attack: 0.02 })); });

// ---- cards (GDD §9.3) ----------------------------------------------------------------------------
// v2 (GDD-V2 §7.2): a shard picked up — opts.step 0..12 raises it a semitone per quick pick-up; a
// level up (rising chord); the growth choice opening
R('shard', (ac, d, o, t) => { tone(ac, d, { t, f0: 1320 * Math.pow(2, (o.step || 0) / 12), dur: 0.07, gain: 0.08, type: 'triangle' }); });
R('level_up', (ac, d, o, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(ac, d, { t: t + i * 0.06, f0: f, dur: 0.32, gain: 0.12, type: 'triangle' })); });
R('choice_open', (ac, d, o, t) => { tone(ac, d, { t, f0: 392, f1: 784, dur: 0.25, gain: 0.1 }); bell(ac, d, t + 0.12, 1568, 0.4, 0.05); });
R('multi_kill', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.3, gain: 0.45, filter: 'lowpass', f0: 900, f1: 160 }); tone(ac, d, { t, f0: 70, f1: 34, dur: 0.3, gain: 0.45 }); });
// GDD-V2 §7.3: the rest of the new ids
R('choice_pick', (ac, d, o, t) => { tone(ac, d, { t, f0: 784, f1: 1175, dur: 0.12, gain: 0.1, type: 'triangle' }); bell(ac, d, t + 0.06, 1568, 0.45, 0.07); });
R('streak', (ac, d, o, t) => { const f = 660 * Math.pow(2, (o.step || 0) / 12); tone(ac, d, { t, f0: f * 0.9, f1: f, dur: 0.16, gain: 0.1, type: 'triangle' }); tone(ac, d, { t: t + 0.07, f0: f * 1.5, dur: 0.14, gain: 0.05, type: 'triangle' }); });
R('elite_in', (ac, d, o, t) => {
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(d);
  tone(ac, d, { t, f0: 110, f1: 82, dur: 0.5, gain: 0.3, type: 'sawtooth', to: f, attack: 0.05 });
  for (const dt of [0, 0.18]) tone(ac, d, { t: t + dt, f0: 440, f1: 415, dur: 0.14, gain: 0.07, type: 'square' });
});
R('elite_down', (ac, d, o, t) => { hiss(ac, d, { t, dur: 0.4, gain: 0.45, filter: 'lowpass', f0: 1100, f1: 140 }); tone(ac, d, { t, f0: 82, f1: 36, dur: 0.5, gain: 0.5 }); bell(ac, d, t + 0.12, 880, 0.7, 0.06); });
R('halo', (ac, d, o, t) => { [784, 988, 1175, 1568].forEach((f, i) => tone(ac, d, { t: t + i * 0.05, f0: f, dur: 0.5, gain: 0.07, type: 'sine', attack: 0.02 })); hiss(ac, d, { t, dur: 0.6, gain: 0.07, filter: 'highpass', f0: 5000, attack: 0.1 }); });
R('holy_stone', (ac, d, o, t) => { tone(ac, d, { t, f0: 160, f1: 60, dur: 0.45, gain: 0.5 }); hiss(ac, d, { t, dur: 0.35, gain: 0.3, filter: 'bandpass', f0: 3000, f1: 600, q: 1.2 }); bell(ac, d, t + 0.05, 1320, 0.9, 0.08); });
R('surge_horn', (ac, d, o, t) => {
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.connect(d);
  tone(ac, d, { t, f0: 147, f1: 155, dur: 1.1, gain: 0.24, type: 'sawtooth', attack: 0.12, to: f });
  tone(ac, d, { t, f0: 220, f1: 233, dur: 1.1, gain: 0.12, type: 'sawtooth', attack: 0.16, to: f });
});
R('site_start', (ac, d, o, t) => { tone(ac, d, { t, f0: 330, f1: 495, dur: 0.22, gain: 0.1, type: 'triangle', attack: 0.04 }); });
R('site_clear', (ac, d, o, t) => { tone(ac, d, { t, f0: 120, f1: 50, dur: 0.4, gain: 0.45 }); hiss(ac, d, { t, dur: 0.3, gain: 0.25, filter: 'lowpass', f0: 1600, f1: 300 }); bell(ac, d, t + 0.08, 660, 0.9, 0.08); });
R('card_set', (ac, d, o, t) => { tone(ac, d, { t, f0: 950, f1: 300, dur: 0.05, gain: 0.18, type: 'square' }); hiss(ac, d, { t, dur: 0.03, gain: 0.25, filter: 'bandpass', f0: 2200, q: 3 }); tone(ac, d, { t, f0: 130, f1: 80, dur: 0.1, gain: 0.3 }); });
R('quest_tick', (ac, d, o, t) => { tone(ac, d, { t, f0: 1760, dur: 0.2, gain: 0.08 }); tone(ac, d, { t, f0: 3520, dur: 0.1, gain: 0.025 }); });
R('awaken', (ac, d, o, t) => { [392, 494, 587, 784].forEach((f, i) => tone(ac, d, { t: t + i * 0.09, f0: f, dur: 0.5, gain: 0.1, type: 'triangle' })); bell(ac, d, t + 0.4, 1568, 1.1, 0.07); });
R('combo_up', (ac, d, o, t) => { const f = 440 * Math.pow(2, Math.min(12, (o.stack || 1) * 2) / 12); tone(ac, d, { t, f0: f * 0.92, f1: f, dur: 0.13, gain: 0.1, type: 'triangle' }); });
R('combo_max', (ac, d, o, t) => { [523, 659, 784, 1046].forEach((f) => tone(ac, d, { t, f0: f, dur: 0.6, gain: 0.07, type: 'triangle', attack: 0.01 })); });
R('combo_warn', (ac, d, o, t) => { for (const dt of [0, 0.08]) tone(ac, d, { t: t + dt, f0: 1000, dur: 0.035, gain: 0.1, type: 'square' }); });
R('combo_break', (ac, d, o, t) => {
  for (let i = 0; i < 5; i++) tone(ac, d, { t: t + i * 0.018, f0: 2800 + ((i * 1237) % 3000), dur: 0.09, gain: 0.04, type: 'triangle' });
  hiss(ac, d, { t, dur: 0.16, gain: 0.22, filter: 'highpass', f0: 4200 });
  tone(ac, d, { t: t + 0.05, f0: 620, f1: 190, dur: 0.36, gain: 0.12, type: 'triangle' });
});

// ---- interface -------------------------------------------------------------------------------------
R('ui_ok', (ac, d, o, t) => { tone(ac, d, { t, f0: 880, f1: 640, dur: 0.05, gain: 0.1, type: 'square' }); hiss(ac, d, { t, dur: 0.02, gain: 0.08, filter: 'bandpass', f0: 2500, q: 3 }); });
R('ui_move', (ac, d, o, t) => { tone(ac, d, { t, f0: 1250, dur: 0.025, gain: 0.05, type: 'square' }); });

// Volume from the settings (0 = mute). Called when settings change.
A.applyVolume = function (save) { AU.setVolume(save && save.settings ? Number(save.settings.sfx) || 0 : 0.8); };

// iOS Safari resumes audio only from touchend/click: the engine's AU.unlock handles it (50_audio.js).

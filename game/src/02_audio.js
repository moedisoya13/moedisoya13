// ─────────────────────────────────────────────────────────────
// Audio — everything is synthesised with Web Audio (no files).
// iOS only allows sound after a user gesture → Sfx.init() runs from the first tap.
// ─────────────────────────────────────────────────────────────

const Sfx = {
  ctx: null, out: null, noiseBuf: null, ok: false, drone: null,

  init() {
    if (this.ctx) { this.resume(); return; }
    try {
      // Play even with the iPhone silent switch on (Safari 17+)
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ } }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
      const out = ctx.createGain(); out.gain.value = 0.85;
      out.connect(comp); comp.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx; this.out = out; this.noiseBuf = buf; this.ok = true;
      // iOS unlock: a silent blip inside the gesture
      const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(out); o.start(); o.stop(ctx.currentTime + 0.02);
      this.resume();
    } catch (e) { this.ok = false; }
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
  get t() { return this.ctx ? this.ctx.currentTime : 0; },

  // ── building blocks ──
  tone(f0, f1, dur, o = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 !== f0) {
      if (o.lin) osc.frequency.linearRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const vol = o.vol ?? 0.2, att = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
    }
    if (o.filter) {
      const f = ctx.createBiquadFilter(); f.type = o.filter[0]; f.frequency.value = o.filter[1]; f.Q.value = o.filter[2] || 1;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(this.out);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },
  noise(dur, o = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f0 || 1200, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = ctx.createGain(); const vol = o.vol ?? 0.2, att = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
  },

  // Voice-like sweep through two formant filters → the "cute scream" timbre
  voice(pts, o = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime + (o.at || 0);
    const dur = pts[pts.length - 1][0];
    const mk = (type, det) => { const s = ctx.createOscillator(); s.type = type; s.detune.value = det; return s; };
    const a = mk('sawtooth', 0), b = mk('square', 7);
    for (const s of [a, b]) {
      s.frequency.setValueAtTime(pts[0][1], t0);
      for (let i = 1; i < pts.length; i++) s.frequency.exponentialRampToValueAtTime(pts[i][1], t0 + pts[i][0]);
    }
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = o.vibRate || 7; vg.gain.value = o.vibDepth || 30;
    vib.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency);
    const mix = ctx.createGain(); mix.gain.value = 0.5; a.connect(mix); b.connect(mix);
    const g = ctx.createGain();
    const vol = o.vol ?? 0.22;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const forms = o.formants || [900, 2400];
    for (const ff of forms) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = ff; f.Q.value = o.q || 5;
      mix.connect(f); f.connect(g);
    }
    if (o.am) { // amplitude wobble (growl / giggle)
      const am = ctx.createOscillator(), ag = ctx.createGain();
      am.frequency.value = o.am[0]; ag.gain.value = vol * o.am[1];
      am.connect(ag); ag.connect(g.gain); am.start(t0); am.stop(t0 + dur + 0.05);
    }
    g.connect(this.out);
    for (const s of [a, b, vib]) { s.start(t0); s.stop(t0 + dur + 0.05); }
  },

  // ── game sounds ──
  tap() { this.tone(900, 600, 0.06, { type: 'square', vol: 0.05 }); },
  step(vol = 0.05, heavy = false) { this.noise(heavy ? 0.12 : 0.06, { vol, f0: heavy ? 260 : 700, ft: 'lowpass' }); if (heavy) this.tone(70, 40, 0.12, { vol: vol * 1.6 }); },
  key() { [1760, 2350, 2960].forEach((f, i) => this.tone(f, f * 1.01, 0.12, { vol: 0.08, at: i * 0.05, type: 'triangle' })); },
  laurel() { [660, 880, 1320, 1760].forEach((f, i) => this.tone(f, f, 0.18, { vol: 0.07, at: i * 0.045, type: 'triangle' })); },
  slotTick() { this.tone(1400, 1000, 0.025, { type: 'square', vol: 0.035 }); },
  slotLand(good) { if (good) [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.32, { vol: 0.07, at: i * 0.05, type: 'triangle' })); else this.tone(520, 380, 0.25, { type: 'triangle', vol: 0.08 }); },
  letter() { [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, f, 0.25, { vol: 0.08, at: i * 0.06, type: 'square', filter: ['lowpass', 3000] })); },
  dup() { this.tone(300, 1500, 0.35, { type: 'sawtooth', vol: 0.06, filter: ['lowpass', 2000] }); this.noise(0.3, { vol: 0.06, ft: 'bandpass', f0: 600, f1: 4000, q: 2 }); },
  honeyGet() { this.tone(400, 900, 0.12, { vol: 0.1 }); this.tone(900, 500, 0.12, { vol: 0.08, at: 0.1 }); },
  honeyPlace() { this.noise(0.25, { vol: 0.12, f0: 900, f1: 200 }); this.tone(300, 120, 0.2, { vol: 0.08 }); },
  honeyStick() { this.tone(200, 90, 0.4, { vol: 0.12, type: 'triangle', vib: [12, 20] }); this.noise(0.35, { vol: 0.08, f0: 500, f1: 150 }); },
  unlock() { this.tone(2200, 1800, 0.03, { type: 'square', vol: 0.05 }); this.tone(1500, 1200, 0.04, { type: 'square', vol: 0.05, at: 0.07 }); this.tone(180, 120, 0.5, { type: 'sawtooth', vol: 0.03, at: 0.1, filter: ['bandpass', 500, 4], vib: [9, 15] }); },
  lock() { this.tone(160, 90, 0.1, { vol: 0.15 }); this.tone(1800, 1400, 0.03, { type: 'square', vol: 0.05, at: 0.02 }); },
  bash() { this.noise(0.14, { vol: 0.22, f0: 300 }); this.tone(90, 45, 0.16, { vol: 0.2 }); },
  doorBreak() { this.noise(0.6, { vol: 0.3, f0: 1500, f1: 200 }); this.tone(80, 30, 0.5, { vol: 0.25 }); },
  flush() { this.noise(0.9, { vol: 0.12, ft: 'bandpass', f0: 2500, f1: 300, q: 1.5 }); this.tone(500, 200, 0.6, { vol: 0.03, vib: [18, 40] }); },
  hide() { this.noise(0.18, { vol: 0.1, ft: 'bandpass', f0: 2500, q: 1.2 }); this.tone(140, 90, 0.12, { vol: 0.08 }); },
  hit(big) { this.noise(big ? 0.35 : 0.2, { vol: big ? 0.35 : 0.26, f0: 2200, f1: 300 }); this.tone(big ? 140 : 180, 40, big ? 0.35 : 0.22, { vol: 0.3 }); },
  whoosh() { this.noise(0.18, { vol: 0.08, ft: 'bandpass', f0: 600, f1: 2400, q: 1.5 }); },
  stab() { // Psycho-style string screech when a chase starts
    [1320, 1397, 1480].forEach((f, i) => this.tone(f, f * 1.02, 0.38, { type: 'sawtooth', vol: 0.035, detune: i * 9, vib: [22, 25], filter: ['highpass', 900] }));
    [1320, 1397].forEach((f) => this.tone(f * 1.06, f * 1.08, 0.3, { type: 'sawtooth', vol: 0.03, at: 0.42, vib: [22, 25], filter: ['highpass', 900] }));
  },
  heartbeat(v) { this.tone(58, 38, 0.16, { vol: 0.22 * v, attack: 0.01 }); this.tone(52, 36, 0.14, { vol: 0.15 * v, at: 0.2, attack: 0.01 }); },
  thunder() { this.noise(2.2, { vol: 0.5, f0: 3000, f1: 80, attack: 0.002 }); this.noise(0.25, { vol: 0.35, ft: 'highpass', f0: 2000 }); this.tone(60, 28, 1.6, { vol: 0.35 }); },
  transform() { [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.6, { type: 'sawtooth', vol: 0.05, at: 0.12 + i * 0.07, filter: ['lowpass', 2600] })); },
  revert() { this.tone(600, 120, 0.8, { type: 'sawtooth', vol: 0.06, filter: ['lowpass', 1500] }); },
  zap(level) { const f = 300 + level * 180; this.tone(f, f * 2.2, 0.22, { type: 'square', vol: 0.09, vib: [55, 120], filter: ['bandpass', 1800, 1.2] }); this.noise(0.18, { vol: 0.12, ft: 'highpass', f0: 3000 }); },
  fizz() { this.noise(0.3, { vol: 0.1, f0: 1500, f1: 200 }); this.tone(300, 120, 0.25, { type: 'triangle', vol: 0.05 }); },
  punch(level) { this.noise(0.5 + level * 0.15, { vol: 0.45, f0: 4000, f1: 120, attack: 0.002 }); this.tone(160, 30, 0.6, { vol: 0.5 }); if (level >= 3) this.thunder(); },
  whiff() { this.noise(0.25, { vol: 0.12, ft: 'bandpass', f0: 400, f1: 1800, q: 2 }); },
  victory() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.32, { type: 'square', vol: 0.06, at: i * 0.12, filter: ['lowpass', 2600] })); },
  death() { [110, 117, 147].forEach((f) => this.tone(f, f * 0.7, 1.8, { type: 'sawtooth', vol: 0.07, filter: ['lowpass', 600] })); this.noise(1.2, { vol: 0.15, f0: 800, f1: 60 }); },
  wallCrack() { this.noise(0.6, { vol: 0.12, ft: 'bandpass', f0: 300, q: 3 }); this.tone(60, 50, 0.6, { vol: 0.1, vib: [30, 8] }); },
  wallBreak() { this.noise(0.8, { vol: 0.4, f0: 2500, f1: 150 }); this.tone(70, 30, 0.6, { vol: 0.35 }); },
  candlePlace() { this.noise(0.4, { vol: 0.06, ft: 'bandpass', f0: 300, f1: 1200, q: 2 }); this.tone(220, 330, 0.5, { type: 'triangle', vol: 0.04 }); },
  candleOut() { this.noise(0.22, { vol: 0.09, ft: 'highpass', f0: 2500, f1: 800 }); },
  eye() { [440, 466, 494].forEach((f, i) => this.tone(f, f, 0.9, { type: 'sine', vol: 0.04, at: i * 0.03, vib: [5, 6] })); },
  siren() { for (let i = 0; i < 3; i++) { this.tone(700, 1100, 0.25, { type: 'square', vol: 0.05, at: i * 0.5, filter: ['lowpass', 2500] }); this.tone(1100, 700, 0.25, { type: 'square', vol: 0.05, at: i * 0.5 + 0.25, filter: ['lowpass', 2500] }); } },
  whistle() { this.tone(2700, 2900, 0.35, { vol: 0.07, vib: [28, 120] }); },
  flashClick() { this.tone(3000, 2500, 0.025, { type: 'square', vol: 0.06 }); },
  flash() { this.noise(0.35, { vol: 0.15, ft: 'highpass', f0: 5000, f1: 1500 }); this.tone(1200, 400, 0.3, { type: 'triangle', vol: 0.06 }); },
  stamp() { this.tone(120, 60, 0.15, { vol: 0.25 }); this.noise(0.1, { vol: 0.15, f0: 900 }); },
  teleport() { this.tone(200, 2400, 0.3, { type: 'sawtooth', vol: 0.05, filter: ['bandpass', 1500, 2] }); this.tone(2400, 200, 0.3, { type: 'sawtooth', vol: 0.05, at: 0.25, filter: ['bandpass', 1500, 2] }); },
  summon() { this.tone(80, 400, 0.7, { type: 'square', vol: 0.06, filter: ['lowpass', 800], vib: [20, 30] }); this.noise(0.5, { vol: 0.1, ft: 'bandpass', f0: 400, f1: 2000 }); },
  saw() { this.tone(180, 260, 0.6, { type: 'sawtooth', vol: 0.06, vib: [45, 40], filter: ['bandpass', 1400, 1.5] }); },
  drill() { this.tone(120, 140, 0.5, { type: 'square', vol: 0.05, vib: [60, 30], filter: ['lowpass', 900] }); },
  spearWindup() { this.tone(1800, 3400, 0.6, { type: 'triangle', vol: 0.04, vib: [9, 30] }); },
  spear() { this.noise(0.2, { vol: 0.22, ft: 'bandpass', f0: 3000, f1: 800, q: 1.5 }); this.tone(900, 300, 0.12, { type: 'sawtooth', vol: 0.05 }); },
  well() { this.tone(300, 120, 0.4, { vol: 0.1, vib: [10, 40] }); this.noise(0.4, { vol: 0.06, ft: 'bandpass', f0: 900, f1: 300 }); },
  hatch() { this.noise(0.25, { vol: 0.2, ft: 'bandpass', f0: 2500, q: 2 }); this.tone(400, 200, 0.2, { type: 'square', vol: 0.06, at: 0.05 }); },
  evolve() { this.tone(70, 140, 1.2, { type: 'sawtooth', vol: 0.12, vib: [9, 20], filter: ['lowpass', 700] }); this.noise(1.0, { vol: 0.1, f0: 400, f1: 1600 }); },
  tentacle() { this.noise(0.12, { vol: 0.2, ft: 'bandpass', f0: 1800, q: 1 }); this.tone(600, 200, 0.12, { type: 'sawtooth', vol: 0.06 }); },
  beep() { this.tone(1600, 1600, 0.08, { type: 'square', vol: 0.05 }); },
  explosion() { this.noise(2.5, { vol: 0.6, f0: 2500, f1: 50, attack: 0.002 }); this.tone(80, 20, 1.8, { vol: 0.5 }); },
  hellgate() { [55, 58, 82].forEach((f) => this.tone(f, f * 0.6, 3, { type: 'sawtooth', vol: 0.09, filter: ['lowpass', 400] })); this.noise(3, { vol: 0.2, f0: 300, f1: 60 }); },
  machineBreak() { this.noise(0.5, { vol: 0.2, ft: 'bandpass', f0: 2000, f1: 400, q: 1 }); this.tone(400, 80, 0.4, { type: 'square', vol: 0.06 }); },

  // Cute, voice-modulated screams — one personality per killer
  scream(kind) {
    switch (kind) {
      case 'butcher': // baby lion "rawr~"
        this.voice([[0, 260], [0.15, 520], [0.5, 640], [0.9, 380]], { formants: [700, 1700], am: [26, 0.5], vibRate: 6, vibDepth: 40, vol: 0.26 });
        break;
      case 'witch': // toy-like giggle
        for (let i = 0; i < 5; i++) this.voice([[0, 980 - i * 60], [0.07, 1150 - i * 70], [0.11, 900 - i * 60]], { at: i * 0.13, formants: [1100, 2700], q: 6, vol: 0.18 });
        break;
      case 'janitor': // whistle, then a squeaky yelp
        this.whistle();
        this.voice([[0, 600], [0.1, 1250], [0.45, 1350], [0.7, 800]], { at: 0.35, formants: [1000, 2400], vibRate: 9, vibDepth: 45 });
        break;
      case 'evolver': // chirp-chirp-kyuu
        for (let i = 0; i < 3; i++) this.tone(1700, 2700, 0.07, { at: i * 0.1, type: 'triangle', vol: 0.09 });
        this.voice([[0, 1100], [0.12, 1800], [0.45, 900]], { at: 0.32, formants: [1500, 3000], vibRate: 14, vibDepth: 60, vol: 0.2 });
        break;
      case 'doctor': // burp-gurgle then "ueh!"
        this.voice([[0, 150], [0.3, 105]], { formants: [400, 900], am: [24, 0.7], vol: 0.25 });
        this.voice([[0, 420], [0.12, 950], [0.4, 620]], { at: 0.32, formants: [800, 2000], vibDepth: 25 });
        break;
      case 'samurai': // sharp "yah!"
        this.voice([[0, 480], [0.06, 880], [0.35, 720]], { formants: [750, 1250], q: 4, vibDepth: 15, vol: 0.28 });
        break;
      default:
        this.voice([[0, 600], [0.12, 1300], [0.6, 800]]);
    }
  },
  cackle() { this.scream('witch'); },

  startDrone() {
    if (!this.ok || this.drone) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.06, t0 + 2);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200; f.Q.value = 3;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 82.4;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 58.3;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 70;
    lfo.connect(lg); lg.connect(f.frequency);
    o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g); g.connect(this.out);
    [o1, o2, o3, lfo].forEach((o) => o.start());
    this.drone = { g, nodes: [o1, o2, o3, lfo] };
  },
  stopDrone() {
    if (!this.drone) return;
    const d = this.drone, t = this.ctx.currentTime;
    d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + 0.6);
    d.nodes.forEach((o) => o.stop(t + 0.7));
    this.drone = null;
  },
  creak() { this.tone(rand(90, 160), rand(70, 120), rand(0.6, 1.2), { type: 'sawtooth', vol: 0.025, filter: ['bandpass', rand(400, 900), 6], vib: [rand(6, 14), 12] }); },
};

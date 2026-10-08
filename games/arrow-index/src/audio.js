// ── 합성 효과음 (WebAudio) ───────────────────────────────────────
// iOS 는 첫 터치 이후에만 소리를 낼 수 있어서 unlock() 을 입력 핸들러에서 부른다.
const Sfx = {
  ctx: null,
  master: null,
  on: true,
  last: {},
  combo: 0,
  comboT: 0,

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.55 : 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  setOn(v) {
    this.on = v;
    Store.set('sound', v);
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.55 : 0, this.ctx.currentTime, 0.02);
  },

  ok(name, gap) {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return false;
    const t = this.ctx.currentTime;
    if (gap && this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  },

  tone(f, dur, type = 'square', vol = 0.1, f2 = null, at = 0, attack = 0.004) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.1, ftype = 'bandpass', f = 1500, q = 1, f2 = null, at = 0) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter(); fl.type = ftype; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },

  update(dt) {
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
  },

  play(name, k = 1) {
    switch (name) {
      case 'shoot':
        if (!this.ok(name, 0.045)) return;
        this.tone(1250 + rand(-80, 80), 0.07, 'triangle', 0.07, 420);
        this.noise(0.025, 0.05, 'highpass', 3500);
        break;
      case 'hit':
        if (!this.ok(name, 0.03)) return;
        this.noise(0.045, 0.13, 'bandpass', 1700 + rand(-300, 300), 1.2);
        this.tone(190, 0.07, 'sine', 0.16, 70);
        break;
      case 'crit':
        if (!this.ok(name, 0.05)) return;
        this.noise(0.06, 0.16, 'bandpass', 2600, 2);
        this.tone(980, 0.06, 'square', 0.05, 1500);
        this.tone(150, 0.1, 'sine', 0.2, 55);
        break;
      case 'kill':
        if (!this.ok(name, 0.035)) return;
        this.tone(520 + rand(-60, 60), 0.09, 'square', 0.05, 130);
        this.noise(0.06, 0.06, 'lowpass', 2200, 0.7, 400);
        break;
      case 'bigkill':
        if (!this.ok(name, 0.1)) return;
        this.tone(160, 0.35, 'sawtooth', 0.12, 40);
        this.noise(0.4, 0.2, 'lowpass', 2500, 0.7, 120);
        break;
      case 'gem': {
        if (!this.ok(name, 0.02)) return;
        this.combo = Math.min(this.combo + 1, 24); this.comboT = 0.45;
        const f = 880 * Math.pow(2, (this.combo % 25) / 12);
        this.tone(f, 0.08, 'sine', 0.06, f * 1.01);
        break;
      }
      case 'stock': {
        if (!this.ok(name, 0.02)) return;
        this.combo = Math.min(this.combo + 1, 24); this.comboT = 0.45;
        const f = 440 * Math.pow(2, (this.combo % 25) / 12);
        this.tone(f, 0.07, 'square', 0.03, f * 1.5);
        break;
      }
      case 'level':
        if (!this.ok(name, 0.2)) return;
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.1, null, i * 0.055));
        break;
      case 'pick':
        if (!this.ok(name, 0.05)) return;
        this.tone(660, 0.06, 'square', 0.06, 990);
        this.tone(1320, 0.1, 'triangle', 0.06, null, 0.05);
        break;
      case 'hurt':
        if (!this.ok(name, 0.08)) return;
        this.tone(240, 0.2, 'sawtooth', 0.14, 70);
        this.noise(0.15, 0.12, 'lowpass', 1200, 0.8, 200);
        break;
      case 'buy':
        if (!this.ok(name, 0.05)) return;
        this.tone(330, 0.1, 'square', 0.06, 660);
        this.tone(990, 0.06, 'sine', 0.05, null, 0.06);
        break;
      case 'unbuy':
        if (!this.ok(name, 0.05)) return;
        this.tone(660, 0.08, 'square', 0.04, 440);
        break;
      case 'sellUp':
        if (!this.ok(name, 0.1)) return;
        this.noise(0.05, 0.12, 'highpass', 4000);
        this.tone(1318, 0.06, 'square', 0.07);
        this.tone(1760, 0.22, 'square', 0.07, null, 0.06);
        this.tone(2637, 0.3, 'sine', 0.05, null, 0.1);
        break;
      case 'sellDown':
        if (!this.ok(name, 0.1)) return;
        this.noise(0.05, 0.1, 'highpass', 3000);
        this.tone(523, 0.12, 'square', 0.07, 392);
        this.tone(330, 0.25, 'square', 0.06, 247, 0.1);
        break;
      case 'dud':
        if (!this.ok(name, 0.1)) return;
        this.tone(140, 0.08, 'square', 0.05, 110);
        break;
      case 'explode':
        if (!this.ok(name, 0.06)) return;
        this.noise(0.4, 0.22 * k, 'lowpass', 2400, 0.8, 140);
        this.tone(95, 0.3, 'sine', 0.22 * k, 38);
        break;
      case 'zap':
        if (!this.ok(name, 0.06)) return;
        for (let i = 0; i < 4; i++) this.tone(rand(700, 2200), 0.03, 'square', 0.035, null, i * 0.025);
        this.noise(0.12, 0.08, 'highpass', 2500);
        break;
      case 'thunk':
        if (!this.ok(name, 0.04)) return;
        this.noise(0.04, 0.08, 'lowpass', 900);
        this.tone(130, 0.05, 'sine', 0.08, 60);
        break;
      case 'snap':
        if (!this.ok(name, 0.05)) return;
        this.noise(0.05, 0.14, 'bandpass', 1200, 3);
        this.tone(220, 0.06, 'square', 0.06, 90);
        break;
      case 'whoosh':
        if (!this.ok(name, 0.08)) return;
        this.noise(0.18, 0.06, 'bandpass', 600, 1.5, 2600);
        break;
      case 'tick':
        if (!this.ok(name, 0.3)) return;
        this.tone(k > 0 ? 1480 : 990, 0.035, 'sine', 0.018);
        break;
      case 'boss':
        if (!this.ok(name, 1)) return;
        this.tone(55, 1.4, 'sawtooth', 0.16, 41, 0, 0.1);
        this.tone(82, 1.4, 'sawtooth', 0.1, 61, 0.05, 0.1);
        this.noise(1.2, 0.08, 'lowpass', 400, 1, 120);
        break;
      case 'warn':
        if (!this.ok(name, 0.4)) return;
        this.tone(880, 0.12, 'square', 0.05, 660);
        break;
      case 'stage':
        if (!this.ok(name, 1)) return;
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.09, null, i * 0.09));
        this.tone(1046, 0.6, 'square', 0.05, null, 0.36);
        break;
      case 'open':
        if (!this.ok(name, 0.3)) return;
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.18, 'square', 0.05, null, i * 0.07));
        break;
      case 'die':
        this.tone(330, 1.2, 'sawtooth', 0.15, 40);
        this.noise(1.2, 0.15, 'lowpass', 1600, 0.7, 100);
        break;
      case 'win':
        [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, null, i * 0.12));
        break;
      case 'ui':
        if (!this.ok(name, 0.04)) return;
        this.tone(1200, 0.035, 'square', 0.035);
        break;
    }
  },
};

// iOS 18+ Safari: <input switch> 라벨 클릭으로 햅틱을 낸다. 지원 안 되면 조용히 무시.
const Haptic = {
  el: null,
  init() {
    try {
      const lab = document.createElement('label');
      lab.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none';
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.setAttribute('switch', '');
      lab.appendChild(inp);
      document.body.appendChild(lab);
      this.el = lab;
    } catch (e) { this.el = null; }
  },
  tap() {
    try {
      if (navigator.vibrate) navigator.vibrate(8);
      else if (this.el) this.el.click();
    } catch (e) { /* 없음 */ }
  },
};

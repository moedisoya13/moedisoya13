/**
 * 합성 효과음 모음. 전부 오실레이터/노이즈로 만든다.
 */
export function createSfx(engine) {
  let ambientNodes = null;

  const c = () => engine.ctx;

  function connectDry(node, gain = 1, send = 0.25) {
    const g = c().createGain();
    g.gain.value = gain;
    node.connect(g);
    g.connect(engine.master);
    if (send > 0) {
      const s = c().createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(engine.reverbSend);
    }
    return g;
  }

  /** 밴드패스를 통과하는 노이즈 스윕 — 휘파람/헛스윙 계열 */
  function noiseSweep({ dur = 0.5, f0 = 400, f1 = 3200, q = 6, peak = 0.5, send = 0.3 }) {
    const t = engine.now;
    const src = engine.noiseSource(dur + 0.1);
    const bp = c().createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const amp = c().createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + dur * 0.72);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(amp);
    connectDry(amp, 1, send);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  /** 짧고 딱딱한 타격음 */
  function transient({ dur = 0.16, lp = 2600, hp = 180, peak = 0.9, sub = 60, subPeak = 0.6, send = 0.35 }) {
    const t = engine.now;
    const src = engine.noiseSource(dur);
    const lpf = c().createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(lp, t);
    lpf.frequency.exponentialRampToValueAtTime(Math.max(lp * 0.25, 120), t + dur);
    const hpf = c().createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    const amp = c().createGain();
    amp.gain.setValueAtTime(peak, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hpf).connect(lpf).connect(amp);
    connectDry(amp, 1, send);
    src.start(t);
    src.stop(t + dur + 0.02);

    if (subPeak > 0) {
      const osc = c().createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(sub * 2.2, t);
      osc.frequency.exponentialRampToValueAtTime(sub * 0.7, t + 0.12);
      const og = c().createGain();
      og.gain.setValueAtTime(subPeak, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(og);
      connectDry(og, 1, 0.15);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  }

  /** 군중 — 로우패스된 노이즈 스웰 */
  function crowd({ dur = 2.2, peak = 0.28, f = 900, rise = 0.35 }) {
    const t = engine.now;
    const src = engine.noiseSource(dur);
    const lpf = c().createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(f * 0.5, t);
    lpf.frequency.linearRampToValueAtTime(f, t + dur * rise);
    lpf.frequency.linearRampToValueAtTime(f * 0.45, t + dur);
    const bp = c().createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;
    const amp = c().createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + dur * rise);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(lpf).connect(amp);
    connectDry(amp, 1, 0.6);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const CUES = {
    /** 밤 — 바람과 풀벌레 */
    night() {
      if (ambientNodes) return;
      const t = engine.now;
      const src = engine.noiseSource(6);
      src.loop = true;
      const lpf = c().createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 420;
      const amp = c().createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.09, t + 2.2);
      // 바람이 오가는 느낌
      const lfo = c().createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = c().createGain();
      lfoGain.gain.value = 0.045;
      lfo.connect(lfoGain).connect(amp.gain);
      src.connect(lpf).connect(amp);
      connectDry(amp, 1, 0.5);
      src.start(t);
      lfo.start(t);

      // 풀벌레 — 아주 높은 대역의 미세한 트레몰로
      const cri = engine.noiseSource(6);
      cri.loop = true;
      const cbp = c().createBiquadFilter();
      cbp.type = 'bandpass';
      cbp.frequency.value = 5200;
      cbp.Q.value = 12;
      const cAmp = c().createGain();
      cAmp.gain.value = 0.016;
      const cLfo = c().createOscillator();
      cLfo.type = 'square';
      cLfo.frequency.value = 11;
      const cLfoG = c().createGain();
      cLfoG.gain.value = 0.012;
      cLfo.connect(cLfoG).connect(cAmp.gain);
      cri.connect(cbp).connect(cAmp);
      connectDry(cAmp, 1, 0.4);
      cri.start(t);
      cLfo.start(t);

      ambientNodes = [src, lfo, cri, cLfo];
    },

    /** 수은등 점등 — 릴레이 '텅' + 아크 버즈 */
    lampOn() {
      transient({ dur: 0.12, lp: 1600, hp: 90, peak: 0.55, sub: 78, subPeak: 0.5, send: 0.6 });
      const t = engine.now;
      const osc = c().createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 120;
      const bp = c().createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 3;
      const g = c().createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(bp).connect(g);
      connectDry(g, 1, 0.5);
      osc.start(t);
      osc.stop(t + 1.2);
    },

    footsteps() {
      for (let i = 0; i < 5; i++) {
        setTimeout(
          () => engine.enabled && transient({ dur: 0.1, lp: 1200, hp: 140, peak: 0.28, sub: 65, subPeak: 0.2, send: 0.45 }),
          i * 340
        );
      }
    },

    batTap() {
      transient({ dur: 0.09, lp: 5200, hp: 700, peak: 0.5, sub: 180, subPeak: 0.22, send: 0.5 });
    },

    hudOn() {
      const t = engine.now;
      const osc = c().createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
      const g = c().createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      connectDry(g, 1, 0.3);
      osc.start(t);
      osc.stop(t + 0.34);
    },

    /** 릴리스 — 유니폼 스치는 소리 + 짧은 숨 */
    release() {
      noiseSweep({ dur: 0.22, f0: 900, f1: 2600, q: 2, peak: 0.16, send: 0.2 });
    },

    /** 공이 공기를 가르는 소리 */
    whoosh({ dur = 1.0 } = {}) {
      noiseSweep({ dur, f0: 520, f1: 4200, q: 5.5, peak: 0.34, send: 0.25 });
    },

    /** 미트 포구음 */
    mitt({ power = 1 } = {}) {
      transient({
        dur: 0.2,
        lp: 4200,
        hp: 220,
        peak: 0.95 * power,
        sub: 92,
        subPeak: 0.85 * power,
        send: 0.75,
      });
    },

    /** 배트 헛스윙 */
    batWhiff() {
      noiseSweep({ dur: 0.3, f0: 1400, f1: 320, q: 4, peak: 0.42, send: 0.4 });
    },

    /** 삼진 — 배 아래로 꺼지는 서브 */
    strikeout() {
      const t = engine.now;
      const osc = c().createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 1.1);
      const g = c().createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.75, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      osc.connect(g);
      connectDry(g, 1, 0.4);
      osc.start(t);
      osc.stop(t + 1.35);
    },

    heartbeat() {
      const beat = (delay, peak) =>
        setTimeout(() => {
          if (!engine.enabled) return;
          const t = engine.now;
          const osc = c().createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(78, t);
          osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
          const g = c().createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
          osc.connect(g);
          connectDry(g, 1, 0.25);
          osc.start(t);
          osc.stop(t + 0.4);
        }, delay);
      for (let i = 0; i < 4; i++) {
        beat(i * 900, 0.42);
        beat(i * 900 + 330, 0.26);
      }
    },

    /** 감정이 차오르는 상승음 */
    swell() {
      const t = engine.now;
      const src = engine.noiseSource(3.2);
      const bp = c().createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(220, t);
      bp.frequency.exponentialRampToValueAtTime(4200, t + 2.8);
      const g = c().createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 2.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      src.connect(bp).connect(g);
      connectDry(g, 1, 0.7);
      src.start(t);
      src.stop(t + 3.3);
    },

    crowdRise() {
      crowd({ dur: 3.0, peak: 0.16, f: 800, rise: 0.55 });
    },
    crowdGasp() {
      crowd({ dur: 1.5, peak: 0.2, f: 1100, rise: 0.18 });
    },
    crowdRoar() {
      crowd({ dur: 4.5, peak: 0.3, f: 1500, rise: 0.22 });
    },
  };

  return {
    play(name, opts) {
      if (!engine.enabled || !engine.ctx) return;
      const fn = CUES[name];
      if (fn) {
        try {
          fn(opts || {});
        } catch {
          /* 오디오 실패가 화면을 멈추게 하지는 않는다 */
        }
      }
    },
    startAmbient() {
      if (engine.enabled && engine.ctx) CUES.night();
    },
    has: (name) => Boolean(CUES[name]),
  };
}

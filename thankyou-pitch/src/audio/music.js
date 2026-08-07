import { clamp } from '../utils/easing.js';

/**
 * 앰비언트 음악.
 *
 * 드론 패드(디튠 saw) + 로우패스 LFO 위에, 긴장도(tension)에 따라
 * 킥/하이햇과 상성 화음이 얹힌다. 스텝 시퀀서는 재생 중에만 돈다.
 */
const ROOT = 55; // A1
const CHORD = [1, 1.5, 2, 3]; // root, 5th, octave, 12th
const TENSE_NOTE = 2.37; // 살짝 어긋난 음 — 긴장 구간에서만 섞인다

export function createMusic(engine) {
  let started = false;
  let padGain = null;
  let filter = null;
  let tenseGain = null;
  let pulseGain = null;
  let voices = [];
  let scheduler = null;
  let nextBeat = 0;
  let beatIndex = 0;
  let tension = 0;
  let playing = false;

  const c = () => engine.ctx;
  const BPM = 92;
  const SPB = 60 / BPM;

  function start() {
    if (started || !engine.ctx) return;
    started = true;
    const t = engine.now;

    filter = c().createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 1.1;

    padGain = c().createGain();
    padGain.gain.value = 0.0001;
    filter.connect(padGain);
    padGain.connect(engine.master);

    const send = c().createGain();
    send.gain.value = 0.55;
    padGain.connect(send);
    send.connect(engine.reverbSend);

    // 코드 보이스
    CHORD.forEach((mult, i) => {
      const osc = c().createOscillator();
      osc.type = i === 0 ? 'sine' : 'sawtooth';
      osc.frequency.value = ROOT * mult;
      osc.detune.value = (i - 1.5) * 7;
      const g = c().createGain();
      g.gain.value = i === 0 ? 0.5 : 0.16;
      osc.connect(g).connect(filter);
      osc.start(t);
      voices.push(osc);
    });

    // 긴장용 음
    const tense = c().createOscillator();
    tense.type = 'sawtooth';
    tense.frequency.value = ROOT * TENSE_NOTE;
    tense.detune.value = 11;
    tenseGain = c().createGain();
    tenseGain.gain.value = 0.0001;
    tense.connect(tenseGain).connect(filter);
    tense.start(t);
    voices.push(tense);

    // 컷오프를 흔드는 LFO
    const lfo = c().createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = c().createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start(t);
    voices.push(lfo);

    pulseGain = c().createGain();
    pulseGain.gain.value = 0.9;
    pulseGain.connect(engine.master);

    padGain.gain.setTargetAtTime(0.16, t, 1.2);
    nextBeat = t + 0.1;
    beatIndex = 0;
  }

  function kick(time, level) {
    const osc = c().createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(126, time);
    osc.frequency.exponentialRampToValueAtTime(41, time + 0.13);
    const g = c().createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(level, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    osc.connect(g).connect(pulseGain);
    osc.start(time);
    osc.stop(time + 0.4);
  }

  function hat(time, level) {
    const src = engine.noiseSource(0.06);
    const hp = c().createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = c().createGain();
    g.gain.setValueAtTime(level, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(hp).connect(g).connect(pulseGain);
    src.start(time);
    src.stop(time + 0.08);
  }

  /** 25ms마다 앞으로 120ms 분량을 예약한다 */
  function tick() {
    if (!engine.ctx || !playing || !engine.enabled) return;
    const ahead = engine.now + 0.12;
    while (nextBeat < ahead) {
      const step = beatIndex % 8;
      const t = tension;
      if (t > 0.28 && (step === 0 || step === 3 || step === 6)) {
        kick(nextBeat, 0.28 + t * 0.5);
      }
      if (t > 0.55 && step % 2 === 1) {
        hat(nextBeat, 0.035 + t * 0.05);
      }
      nextBeat += SPB / 2;
      beatIndex++;
    }
  }

  return {
    start() {
      start();
      if (!scheduler) scheduler = setInterval(tick, 25);
    },
    setPlaying(v) {
      playing = v;
      if (v && engine.ctx) nextBeat = Math.max(nextBeat, engine.now + 0.05);
    },
    setTension(v) {
      tension = clamp(v);
      if (!started || !engine.ctx) return;
      const t = engine.now;
      filter.frequency.setTargetAtTime(280 + tension * 1750, t, 0.4);
      padGain.gain.setTargetAtTime(0.12 + tension * 0.14, t, 0.5);
      tenseGain.gain.setTargetAtTime(0.0001 + tension * tension * 0.075, t, 0.6);
    },
    stop() {
      playing = false;
      if (scheduler) {
        clearInterval(scheduler);
        scheduler = null;
      }
      if (padGain && engine.ctx) padGain.gain.setTargetAtTime(0.0001, engine.now, 0.3);
    },
    dispose() {
      this.stop();
      voices.forEach((v) => {
        try {
          v.stop();
        } catch {
          /* 이미 멈춘 노드 */
        }
      });
      voices = [];
      started = false;
    },
  };
}

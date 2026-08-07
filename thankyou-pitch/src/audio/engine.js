/**
 * WebAudio 엔진.
 *
 * 이 환경에서는 외부 오디오 파일을 받을 수 없어서 모든 소리를 합성한다.
 * 브라우저 자동재생 정책 때문에 AudioContext는 사용자 제스처에서 처음 만들고,
 * 기본 상태는 음소거다.
 */
export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let comp = null;
  let reverb = null;
  let reverbSend = null;
  let enabled = false;

  /** 노이즈로 만든 짧은 임펄스 응답 — 야간 구장의 잔향감 */
  function makeImpulse(seconds = 2.4, decay = 2.6) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function build() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);

    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse();
    reverb.connect(master);

    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.34;
    reverbSend.connect(reverb);
  }

  /** 화이트 노이즈 버퍼 소스 */
  function noiseSource(seconds = 1) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  return {
    get ctx() {
      return ctx;
    },
    get master() {
      return master;
    },
    get reverbSend() {
      return reverbSend;
    },
    get enabled() {
      return enabled;
    },
    get now() {
      return ctx ? ctx.currentTime : 0;
    },

    /** 사용자 제스처에서 호출 */
    async enable() {
      build();
      if (!ctx) return false;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          /* 사용자가 거부하면 조용히 무시 */
        }
      }
      enabled = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.25);
      return true;
    },

    disable() {
      enabled = false;
      if (!ctx) return;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    },

    noiseSource,

    /** 게인 엔벨로프 헬퍼 */
    env(node, t0, { attack = 0.005, peak = 1, decay = 0.2, sustain = 0, hold = 0, release = 0.1 }) {
      const g = node.gain;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(0.0001, t0);
      g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
      if (hold > 0) g.setValueAtTime(Math.max(peak, 0.0002), t0 + attack + hold);
      const dStart = t0 + attack + hold;
      g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), dStart + decay);
      g.exponentialRampToValueAtTime(0.0001, dStart + decay + release);
      return dStart + decay + release;
    },

    dispose() {
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}

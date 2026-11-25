/* The sounds, made on the spot: filtered noise for the air a blade moves, a pitched thud for a hit, two detuned bells for
   steel on steel, and a crowd's cheer and roar (the underground pit's, world/pit.mjs). Nothing is loaded, and nothing plays until the first touch has unlocked the audio context. */
export function createAudio() {
  let ctx = null,
    noise = null,
    muted = false;
  function unlock() {
    if (ctx) return ctx.state === 'suspended' && ctx.resume();
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const env = (gain, t, peak, attack, decay) => {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  function hiss(from, to, dur, peak, q) {
    const t = ctx.currentTime,
      src = ctx.createBufferSource(),
      band = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = noise;
    band.type = 'bandpass';
    band.Q.value = q || 1.2;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(gain, t, peak, 0.01, dur);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  function tone(type, from, to, dur, peak, delay) {
    const t = ctx.currentTime + (delay || 0),
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(gain, t, peak, 0.004, dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  // (a crowd: the noise looped and let through low, swelling and dying away over `dur` seconds)
  function crowd(dur, peak, low, high) {
    const t = ctx.currentTime,
      src = ctx.createBufferSource(),
      band = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = noise;
    src.loop = true;
    band.type = 'bandpass';
    band.Q.value = 0.6;
    band.frequency.setValueAtTime(low, t);
    band.frequency.linearRampToValueAtTime(high, t + dur * 0.3);
    band.frequency.linearRampToValueAtTime(low, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + dur * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  const SOUNDS = {
    cheer: () => crowd(1.1, 0.12, 500, 1100),
    roar: () => crowd(3.2, 0.2, 450, 1300),
    swing: () => hiss(900, 3600, 0.12, 0.22),
    whiff: () => hiss(700, 2200, 0.16, 0.12),
    hit: () => (tone('square', 190, 48, 0.16, 0.3), hiss(2600, 500, 0.1, 0.3, 0.7)),
    heavy: () => (tone('square', 130, 36, 0.3, 0.38), hiss(2200, 300, 0.2, 0.35, 0.6)),
    deflect: () => (tone('triangle', 2350, 2300, 0.4, 0.2), tone('triangle', 3180, 3100, 0.3, 0.14), hiss(6000, 3000, 0.06, 0.2, 2)),
    chance: () => (tone('square', 880, 880, 0.07, 0.1), tone('square', 1320, 1320, 0.12, 0.1, 0.07)),
    dodge: () => hiss(500, 1400, 0.14, 0.1),
    step: () => hiss(240, 120, 0.05, 0.05, 0.8),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.16, 0.1, i * 0.1)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.24, 0.14, i * 0.16))
  };
  return {
    unlock,
    play(name) {
      if (ctx && !muted && SOUNDS[name]) SOUNDS[name]();
    },
    mute(on) {
      muted = on;
    }
  };
}

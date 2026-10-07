// WebAudio 합성 효과음 + 5음계 칩튠 BGM. 오디오 파일 없음.
// iOS 는 사용자 터치 안에서 AudioContext 를 resume 해야 소리가 난다 → unlock() 을 첫 터치에 호출.

let ac = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let noiseBuf = null;
let soundOn = true;
let musicOn = true;
const lastPlayed = new Map();

export function initAudio(settings) {
  soundOn = settings.sound;
  musicOn = settings.music;
}

export function unlock() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.6;
      master.connect(ac.destination);
      sfxGain = ac.createGain();
      sfxGain.gain.value = soundOn ? 0.5 : 0;
      sfxGain.connect(master);
      musicGain = ac.createGain();
      musicGain.gain.value = musicOn ? 0.22 : 0;
      musicGain.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  } catch {
    ac = null;
  }
}

export function setSound(on) {
  soundOn = on;
  if (sfxGain) sfxGain.gain.value = on ? 0.5 : 0;
}
export function setMusic(on) {
  musicOn = on;
  if (musicGain) musicGain.gain.value = on ? 0.22 : 0;
}

export function suspendAudio() {
  if (ac && ac.state === 'running') ac.suspend();
}
export function resumeAudio() {
  if (ac && ac.state === 'suspended') ac.resume();
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0, dest = sfxGain) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3, freq = 1200, delay = 0) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(sfxGain);
  s.start(t);
  s.stop(t + dur + 0.02);
}

// 같은 소리가 한 프레임에 수십 번 겹치지 않도록 최소 간격
const GAP = { hit: 0.05, xp: 0.04, coin: 0.06, swing: 0.07, glass: 0.06, smash: 0.08, hurt: 0.15, block: 0.08 };

const SFX = {
  hit: () => {
    noise(0.06, 0.25, 900);
    tone('square', 180, 60, 0.06, 0.15);
  },
  swing: () => noise(0.05, 0.08, 3000),
  kick: () => {
    noise(0.12, 0.2, 600);
    tone('triangle', 220, 80, 0.12, 0.25);
  },
  whoosh: () => noise(0.25, 0.1, 1500),
  throw: () => tone('square', 500, 900, 0.05, 0.06),
  dash: () => noise(0.2, 0.12, 2200),
  glass: () => {
    noise(0.1, 0.18, 5000);
    tone('square', 2400, 1800, 0.05, 0.05);
  },
  smash: () => {
    noise(0.15, 0.3, 400);
    tone('square', 120, 50, 0.1, 0.15);
  },
  block: () => tone('square', 1400, 1400, 0.05, 0.1),
  xp: () => tone('square', 880 + Math.random() * 200, 1320, 0.05, 0.06),
  coin: () => {
    tone('square', 988, 988, 0.05, 0.1);
    tone('square', 1319, 1319, 0.12, 0.1, 0.05);
  },
  eat: () => {
    tone('triangle', 400, 600, 0.08, 0.2);
    tone('triangle', 500, 800, 0.1, 0.2, 0.08);
  },
  powerup: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.08, 0.1, i * 0.05)),
  levelup: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.1, 0.12, i * 0.06)),
  hurt: () => {
    tone('sawtooth', 300, 120, 0.15, 0.2);
    noise(0.08, 0.15, 700);
  },
  buy: () => {
    // 찰칵-띵
    noise(0.03, 0.2, 4000);
    tone('square', 1568, 1568, 0.08, 0.1, 0.04);
    tone('square', 2093, 2093, 0.15, 0.1, 0.1);
  },
  sellwin: () => [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, 0.09, 0.12, i * 0.06)),
  selllose: () => [440, 392, 330, 262].forEach((f, i) => tone('triangle', f, f, 0.12, 0.18, i * 0.09)),
  newsUp: () => tone('square', 660, 1320, 0.15, 0.08),
  newsDown: () => tone('square', 660, 220, 0.25, 0.08),
  bell: () => [1047, 1319, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.12, 0.2, i * 0.11)),
  boss: () => {
    for (let i = 0; i < 4; i++) {
      tone('sawtooth', 440, 660, 0.25, 0.12, i * 0.5);
      tone('sawtooth', 660, 440, 0.25, 0.12, i * 0.5 + 0.25);
    }
  },
  bossdown: () => [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.14, i * 0.07)),
  slam: () => {
    noise(0.3, 0.4, 200);
    tone('sine', 90, 40, 0.3, 0.4);
  },
  engine: () => tone('sawtooth', 60, 120, 0.8, 0.12),
  click: () => tone('square', 1200, 1200, 0.03, 0.06),
  death: () => [523, 494, 466, 440, 415, 392].forEach((f, i) => tone('triangle', f, f * 0.98, 0.18, 0.2, i * 0.15)),
  clear: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.14, 0.14, i * 0.12)),
};

export function play(name) {
  if (!ac || !soundOn || ac.state !== 'running') return;
  const fn = SFX[name];
  if (!fn) return;
  const now = ac.currentTime;
  const gap = GAP[name] || 0.03;
  if (now - (lastPlayed.get(name) || 0) < gap) return;
  lastPlayed.set(name, now);
  try {
    fn();
  } catch {
    /* 오디오 실패는 게임을 멈추지 않는다 */
  }
}

// ---- BGM: 중국풍 5음계(궁상각치우) 루프 ----
const SCALE = [0, 2, 4, 7, 9]; // 펜타토닉
const BASE = 220; // A3
const MELODY = [
  [4, 1], [3, 1], [2, 1], [3, 1], [4, 2], [4, 2],
  [3, 1], [2, 1], [1, 1], [2, 1], [3, 4],
  [4, 1], [5, 1], [6, 1], [5, 1], [4, 2], [3, 2],
  [2, 1], [3, 1], [1, 1], [0, 1], [1, 4],
];
const BASS = [0, 0, 3, 3, 2, 2, 4, 1];
let musicTimer = null;
let step = 0;
let nextTime = 0;
let melIdx = 0;
let melLeft = 0;

function noteFreq(deg, oct = 0) {
  const o = Math.floor(deg / 5);
  const s = SCALE[((deg % 5) + 5) % 5];
  return BASE * Math.pow(2, (s + 12 * (o + oct)) / 12);
}

export function startMusic(tempo = 1) {
  if (!ac) return;
  stopMusic();
  const beat = 0.2 / tempo; // 16분음표 길이
  nextTime = ac.currentTime + 0.1;
  step = 0;
  melIdx = 0;
  melLeft = 0;
  musicTimer = setInterval(() => {
    if (!ac || ac.state !== 'running') return;
    while (nextTime < ac.currentTime + 0.25) {
      if (musicOn) {
        // 베이스 (8분)
        if (step % 2 === 0) {
          const b = BASS[Math.floor(step / 8) % BASS.length];
          tone('triangle', noteFreq(b, -1), noteFreq(b, -1), beat * 1.8, 0.35, nextTime - ac.currentTime, musicGain);
        }
        // 북 (정박)
        if (step % 4 === 0) toneDrum(nextTime);
        // 멜로디
        if (melLeft <= 0) {
          const [deg, len] = MELODY[melIdx % MELODY.length];
          melIdx++;
          melLeft = len * 2;
          tone('square', noteFreq(deg, 1), noteFreq(deg, 1), beat * len * 2 * 0.9, 0.12, nextTime - ac.currentTime, musicGain);
        }
        melLeft--;
      }
      nextTime += beat;
      step++;
    }
  }, 60);
}

function toneDrum(t) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + 0.17);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

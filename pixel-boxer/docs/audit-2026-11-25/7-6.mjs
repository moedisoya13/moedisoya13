// eye 7, finding 7-6: no page ever calls audio.mute(); the sparring page's "소리 끔" only stops new cues (sound = false) and the
// murmur, so what was already scheduled -- the knockout's three bell strikes 1.1 s later, the pit's 3.2 s roar -- still plays
// after the button is pressed. usage: node 7-6.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
const root = process.argv[2];
const { createAudio } = await import(root + '/src/game/audio.mjs');
const pages = ['src/main.mjs', 'src/spar.mjs', 'src/sfx.mjs'].map(p => [p, (readFileSync(root + '/' + p, 'utf8').match(/audio\.mute\(/g) || []).length]);
console.log('audio.mute( calls:', pages.map(([p, n]) => `${p} ${n}`).join(', '));
const spar = readFileSync(root + '/src/spar.mjs', 'utf8'), at = spar.indexOf("what === 'sound'");
console.log('the sound button in src/spar.mjs:', spar.slice(at, spar.indexOf('$(\'soundbtn\')', at)).replace(/\s+/g, ' ').trim());
function fakeContext() {
  const p = v => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const n = m => Object.assign({ connect: x => x, disconnect() {} }, m);
  return { currentTime: 0, sampleRate: 48000, state: 'running', destination: n(), resume() {}, createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }), createGain: () => n({ gain: p(1) }), createStereoPanner: () => n({ pan: p(0) }), createBiquadFilter: () => n({ frequency: p(1), Q: p(1) }), createDynamicsCompressor: () => n({ threshold: p(0), knee: p(0), ratio: p(0), attack: p(0), release: p(0) }), createOscillator: () => n({ frequency: p(1), start() {}, stop() {} }), createBufferSource: () => n({ start() {}, stop() {} }) };
}
const ctx = fakeContext(), audio = createAudio({ context: ctx, random: () => 0.5 });
audio.unlock();
// (the knockout in the pit, heard as the sparring page hears it; then "소리 끔" 0.1 s later: sound = false, ambience(null))
const played = audio.hear({ type: 'hit', who: 0, on: 1, J: 60, part: 'glove', down: true }, { men: [], pit: true });
ctx.currentTime = 0.1;
audio.ambience(null);
const after = played.filter(r => r.at + r.dur > 0.1).map(r => `${r.name} ${r.at.toFixed(2)}..${(r.at + r.dur).toFixed(2)} s`);
ctx.currentTime = 1.2;
console.log(`pressed at 0.10 s; still to sound after it: ${after.join(', ')}; voices still sounding at 1.20 s: ${audio.voices}`);
const bell = played.find(r => r.name === 'bell');
console.log(bell && bell.at > 0.1 && pages.every(([, n]) => n === 0) ? `REPRO: yes "소리 끔" at 0.10 s leaves the KO bell to ring at ${bell.at.toFixed(2)}..${(bell.at + bell.dur).toFixed(2)} s; audio.mute() is called by no page` : 'REPRO: no');

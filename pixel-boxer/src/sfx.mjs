/* The audition page (sfx.html): every sound of a bout on its own button, and a few short exchanges, played the way the game
   plays them. A card that is an event of the bout (a punch, a blow, a block ...) goes through audio.hear, the one mapping
   the game and the sparring use (game/audio.mjs cuesOf); one that is the bout's state between events (a step, the ropes,
   panting) or the page's (the bell, the crowd) is played by name. The red man stands on the left of the picture and the
   blue on the right, so each is heard on his side. This page replays nothing, so it says so (replays: false) and the
   knockout's bell rings at its own delay (the game and the sparring hold it until the replay is over).
   CHANGED: the cards whose sound was made again on 2026-11-28 by the user's answers (sound-breath, -hit, -block, -feet,
   -bell, -crowd, -head-pop, -steps; the struck man's voice, sound-hurt, dropped), marked "바뀜" on the page. */
import { createAudio, COUNTER_GAIN } from './game/audio.mjs';
import { muteButton } from './mute.mjs';

const $ = id => document.getElementById(id);
const audio = createAudio();
const at = { who: 0, pit: false, slow: false, J: 85, murmur: false };
// (the two men as the mapping reads them: where they stand, and their breath; a spent man for the tired cards)
const man = (x, spent) => ({ x, z: 0, stamina: spent ? 0.05 : 1, k: { staminaMax: 1 } });
const heard = spent => ({ men: [man(-1.4, spent), man(1.4, spent)], yaw: 0, target: [0, 0, 0], pit: at.pit, you: null, rate: at.slow ? 0.25 : 1, replays: false });
const other = () => 1 - at.who;
const log = done => {
  const list = (Array.isArray(done) ? done : [done]).filter(Boolean);
  $('log').textContent = list.length ? list.map(d => `${d.name} 크기 ${d.level.toFixed(2)} · ${Math.round(d.dur * 1000)} ms · 좌우 ${d.pan.toFixed(2)}`).join('  /  ') : '(소리 없음: 잠겼거나 같은 소리가 너무 잦음)';
};
const hear = (e, spent) => log(audio.hear(e, heard(spent)));
const play = (name, o) => log(audio.play(name, Object.assign({ who: at.who, rate: at.slow ? 0.25 : 1, pit: at.pit, pan: at.who ? 0.4 : -0.4 }, o)));
const hit = more => hear(Object.assign({ type: 'hit', who: other(), on: at.who, J: at.J, name: 'cross', kind: 'straight', part: 'glove' }, more));

const SECTIONS = [
  [
    '주먹의 숨 "훅"',
    [
      ['잽 "훗"', '입으로 짧게 내뿜는 숨, 가장 짧고 조금 밝게', () => hear({ type: 'punch', who: at.who, name: 'jab' })],
      ['스트레이트 "훅"', '조금 더 길게, 조금 낮게', () => hear({ type: 'punch', who: at.who, name: 'cross' })],
      ['훅', '길게, 아래로 쓸어내리며 · 큰 궤적의 바람', () => hear({ type: 'punch', who: at.who, name: 'hook' })],
      ['어퍼컷', '훅처럼 길게, 더 낮게 · 올려 치는 바람 · 뒷손이라 "흡"도', () => hear({ type: 'punch', who: at.who, name: 'upper' })],
      ['강타 "흡"', '뒷손 훅: 숨 아래 짧은 목소리', () => hear({ type: 'punch', who: at.who, name: 'hookR' })],
      ['지친 숨', '숨이 찬 선수의 스트레이트: 더 길고 낮게, 아래에 거친 숨', () => hear({ type: 'punch', who: at.who, name: 'cross' }, true)],
      ['도발', '주먹 아닌 동작: 아주 약한 숨', () => hear({ type: 'taunt', who: at.who, name: 'shimmy' })],
      ['휘두름 바람', '큰 궤적만, 숨 아래 부드럽게', () => play('swing', { kind: 'hook', power: true })]
    ]
  ],
  [
    '맞는 소리 (세기에 따라)',
    [
      ['머리', '낮은 "텁" + 밝고 긴 가죽 소리 "팍"', () => hit()],
      ['몸통', '더 낮고 둔하고 길게', () => hit({ part: 'body', zone: 'liver', name: 'hookBody', kind: 'hook' })],
      ['카운터', `갈라지는 소리가 더해짐 (세기 ×${COUNTER_GAIN})`, () => hit({ counter: true })],
      ['다운 타격', '가장 무겁게(약한 주먹이라도 강타만큼), 다른 소리를 잠깐 누름 · 다운의 숨 · 공', () => hit({ down: true })],
      ['다운의 숨', '쓰러지는 선수의 길게 빠져나가는 숨', () => play('exhale')]
    ]
  ],
  [
    '수비',
    [
      ['글러브로 막기', '먹먹하고 낮은 "퍽", 쇳소리 없음', () => hear({ type: 'block', who: other(), on: at.who, J: at.J, part: 'glove' })],
      ['팔뚝으로 막기', '더 낮고 둔하게', () => hear({ type: 'block', who: other(), on: at.who, J: at.J, part: 'forearm' })],
      ['숄더 롤', '어깨로 흘림: 부드럽게 쓸림', () => hear({ type: 'block', who: other(), on: at.who, J: at.J, part: 'shoulder', roll: true })],
      ['쳐내기', '가볍고 빠른 "탁"', () => hear({ type: 'parry', who: at.who, on: other(), J: at.J })],
      ['스침', '주먹이 아닌 닿음: 가는 쓸림', () => hear({ type: 'graze', who: other(), on: at.who, J: 4 })],
      ['슬립', '머리를 옆으로: 옷과 공기', () => hear({ type: 'slip', who: at.who })],
      ['덕 · 위빙', '더 낮게', () => hear({ type: 'duck', who: at.who })],
      ['헛친 주먹', '귀 옆을 지나는 바람 (피한 사람 쪽에서)', () => hear({ type: 'whiff', who: other(), name: 'cross' })]
    ]
  ],
  [
    '발 · 바닥 · 로프',
    [
      ['발걸음', '캔버스에 닿는 발바닥의 부드러운 "툭" (지하: 콘크리트의 모래알)', () => play('step', { v: 1.6 })],
      ['바운스', '제자리에서 뛰는 박자마다: 더 짧고 작게', () => play('step', { v: 0.5, bounce: true })],
      ['대시', '빠른 스텝: 신발이 캔버스를 끄는 소리 (지하: 모래)', () => hear({ type: 'dash', who: at.who })],
      ['쓰러짐', '몸이 떨어지는 둔한 쿵 (링: 짧은 울림 · 지하: 둔탁)', () => hear({ type: 'floor', who: at.who })],
      ['로프', '로프에 기댐: 낮은 떨림과 삐걱임 (링)', () => play('rope', { press: 0.8 })]
    ]
  ],
  [
    '관중 · 공',
    [
      ['환호', '강타·카운터에 (지하): 여러 무리 · 목소리 · 박수', () => play('cheer')],
      ['함성', '다운에 (지하): 더 크고 길게', () => play('roar')],
      ['웅성임', '지하 관중이 기다리며 떠드는 소리 (켜고 끄기)', el => {
        at.murmur = !at.murmur;
        audio.ambience(at.murmur ? 'pit' : null);
        el.classList.toggle('on', at.murmur);
        $('log').textContent = at.murmur ? '웅성임 켬' : '웅성임 끔';
      }],
      ['공: 시작', '놋쇠 공을 한 번: 망치 소리와 긴 울림', () => play('bell', { strikes: 1 })],
      ['공: KO', '세 번 빠르게 (게임에서는 리플레이가 끝난 뒤)', () => play('bell', { strikes: 3 })],
      ['승리', '결과 화면', () => play('win')],
      ['패배', '결과 화면', () => play('lose')]
    ]
  ]
];
// (the cards made again on 2026-11-28, by their titles: marked on the page)
const CHANGED = new Set(['잽-잽-크로스', '원투 훅', '잽 "훗"', '스트레이트 "훅"', '훅', '어퍼컷', '강타 "흡"', '지친 숨', '도발', '머리', '몸통', '카운터', '다운 타격', '글러브로 막기', '팔뚝으로 막기', '숄더 롤', '쳐내기', '발걸음', '바운스', '대시', '쓰러짐', '로프', '환호', '함성', '웅성임', '공: 시작', '공: KO', '지친 선수', '카운터 다운', '막기와 쳐내기']);

/* ---- the exchanges: [seconds, the event] (who: 0 the chosen man, 1 the other; a step or a pant by name) */
const DEMOS = [
  ['잽-잽-크로스', '숨 셋, 하나는 막힘', [[0, { type: 'punch', who: 0, name: 'jab' }], [0.12, { type: 'hit', who: 0, on: 1, J: 34, part: 'glove', name: 'jab' }], [0.42, { type: 'punch', who: 0, name: 'jab' }], [0.54, { type: 'block', who: 0, on: 1, J: 30, part: 'glove' }], [0.8, { type: 'punch', who: 0, name: 'cross' }], [0.95, { type: 'hit', who: 0, on: 1, J: 88, part: 'glove', name: 'cross' }]]],
  ['원투 훅', '잽, 스트레이트, 그리고 큰 훅', [[0, { type: 'punch', who: 0, name: 'jab' }], [0.12, { type: 'hit', who: 0, on: 1, J: 30, part: 'glove' }], [0.3, { type: 'punch', who: 0, name: 'cross' }], [0.45, { type: 'hit', who: 0, on: 1, J: 80, part: 'glove' }], [0.72, { type: 'punch', who: 0, name: 'hook' }], [0.9, { type: 'hit', who: 0, on: 1, J: 96, part: 'glove' }]]],
  ['카운터 다운', '상대의 잽을 피하고 크로스 카운터, 쓰러짐', [[0, { type: 'punch', who: 1, name: 'jab' }], [0.04, { type: 'slip', who: 0 }], [0.16, { type: 'whiff', who: 1, name: 'jab' }], [0.18, { type: 'punch', who: 0, name: 'cross' }], [0.32, { type: 'hit', who: 0, on: 1, J: 72, part: 'glove', counter: true, down: true }], [1.25, { type: 'floor', who: 1 }]]],
  ['막기와 쳐내기', '막기, 쳐내기, 숄더 롤, 스침', [[0, { type: 'punch', who: 1, name: 'jab' }], [0.12, { type: 'block', who: 1, on: 0, J: 32, part: 'glove' }], [0.4, { type: 'punch', who: 1, name: 'cross' }], [0.52, { type: 'parry', who: 0, on: 1, J: 70 }], [0.85, { type: 'punch', who: 1, name: 'hookR' }], [1.02, { type: 'block', who: 1, on: 0, J: 80, part: 'shoulder', roll: true }], [1.3, { type: 'punch', who: 1, name: 'jab' }], [1.42, { type: 'graze', who: 1, on: 0, J: 4 }]]],
  ['지친 선수', '느리고 거친 숨, 몸통에 맞는 소리', [[0, { type: 'punch', who: 0, name: 'jab' }], [0.16, { type: 'whiff', who: 0, name: 'jab' }], [0.55, { type: 'punch', who: 0, name: 'cross' }], [0.72, { type: 'hit', who: 0, on: 1, J: 28, part: 'glove' }], [1.5, { type: 'punch', who: 1, name: 'hookBody' }], [1.68, { type: 'hit', who: 1, on: 0, J: 70, part: 'body', zone: 'liver' }]], true]
];
function demo([, , steps, spent]) {
  const k = at.slow ? 4 : 1,
    mine = who => (who === 0 ? at.who : other());
  for (const [t, e] of steps)
    setTimeout(() => {
      hear(Object.assign({}, e, { who: mine(e.who) }, e.on === undefined ? null : { on: mine(e.on) }), spent);
    }, t * 1000 * k);
}

/* ---- the page */
function card(title, line, fn, demoCard) {
  const b = document.createElement('button');
  b.className = 'card' + (demoCard ? ' demo' : '');
  b.innerHTML = `<b></b><span></span>`;
  b.querySelector('b').textContent = title;
  b.querySelector('span').textContent = line;
  // (its mark drawn by the page's style, so that the card's title stays its title)
  if (CHANGED.has(title)) b.classList.add('changed');
  b.addEventListener('click', () => (audio.unlock(), fn(b)));
  return b;
}
function section(name, cards) {
  const s = document.createElement('section'),
    h = document.createElement('h2'),
    g = document.createElement('div');
  h.textContent = name;
  g.className = 'grid';
  cards.forEach(c => g.appendChild(c));
  s.append(h, g);
  return s;
}
const main = $('sounds');
main.appendChild(section('짧은 공방', DEMOS.map(d => card(d[0], d[1], () => demo(d), true))));
for (const [name, list] of SECTIONS) main.appendChild(section(name, list.map(([t, l, fn]) => card(t, l, fn))));

const seg = (id, key, read) =>
  $(id).addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    at[key] = read(b);
    for (const x of $(id).querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  });
seg('who', 'who', b => Number(b.dataset.who));
seg('place', 'pit', b => b.dataset.pit === '1');
seg('speed', 'slow', b => b.dataset.slow === '1');
$('J').addEventListener('input', () => ((at.J = Number($('J').value)), ($('Jv').textContent = `${at.J} N·s`)));

// (the first touch anywhere unlocks the sound)
const unlock = () => {
  audio.unlock();
  const on = !!audio.context;
  $('state').textContent = on ? '소리 켜짐' : '이 브라우저에서는 소리를 낼 수 없습니다';
  $('state').classList.toggle('on', on);
};
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });
/* (the mute button every page that sounds has, src/mute.mjs: in the header's top right corner, beside the title; it goes up
   with the page as it scrolls, so that it covers no card) */
const mute = muteButton(audio, { into: document.querySelector('header'), place: 'right:0;top:0;' });
globalThis.__sfx = { audio, at, heard, mute };

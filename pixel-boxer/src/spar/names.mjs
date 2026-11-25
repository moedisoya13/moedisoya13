/* The sparring's words: what an action is called on the rails and in the result, the catalogue's own names where it has
   one (src/ladder.mjs: the punches, the tricks, the fouls, the taunts; game/techniques.mjs: the techniques). Nothing here
   draws and nothing here touches a bout. */
import { MOVES } from '../anim/moves.mjs';
import { PUNCHES, BODY_PUNCHES, REAR, TRICKS, TECHNIQUES as FOULS, TAUNT_ROWS } from '../ladder.mjs';
import { TECHNIQUES } from '../game/techniques.mjs';

const NAMED = Object.fromEntries([...PUNCHES, ...BODY_PUNCHES, ...REAR].map(p => [p.id, p.name]));
const KIND = { straight: '스트레이트', hook: '훅', upper: '어퍼컷' };
// a punch by its id (anim/moves.mjs), as the catalogue calls it: the ladder's rows, the show-off's flicker, or its kind
export const punchName = id =>
  NAMED[id] ||
  (id === 'flicker'
    ? (TRICKS.find(t => t.id === 'flicker') || {}).name || '플리커'
    : id === 'shiftHook'
      ? '시프트 훅'
      : id === 'crossOver'
        ? '크로스 카운터'
        : MOVES[id] && MOVES[id].kind
          ? (MOVES[id].kind === 'straight' && MOVES[id].hand === 'L' ? '잽' : KIND[MOVES[id].kind]) + (MOVES[id].zone ? ' (바디)' : '')
          : id);
export const trickName = id => (TRICKS.find(t => t.id === id) || FOULS.find(t => t.id === id) || TAUNT_ROWS.find(t => t.id === id) || {}).name || id;
export const techName = id => (TECHNIQUES[id] || {}).name || id;
// what came of a punch (src/catalog.mjs: SAID), and of a defence
export const SAID = { whiff: '빗나감', graze: '스침', block: '막힘', parry: '패리당함', hit: '명중' };
// the moves that are not punches, as the rails call them
export const MOVED = {
  slip: '슬립', duck: '더킹', roll: '위빙', pull: '스웨이', guard: '가드', shell: '셸', shoulder: '숄더 롤', pat: '다운패링', hurt: '피격', thrown: '튕김', down: '다운',
  // (his feet: the distance, and the axis)
  in: '스텝 인', out: '스텝 아웃', press: '압박', back: '백스텝', duckIn: '더킹 인',
  side: '사이드 스텝', pivot: '피벗', cut: '링 컷', dash: '대시', hopPivot: '피벗 아웃', hopCircle: '서클 아웃', wave: '파도'
};
/* A block of the rails (rails.mjs) in words: what it is (labelOf), and what came of it (saidOf: a punch landed, blocked,
   parried or gone by; an evasion a punch went by in; a guard that met one; a hit reaction's blow; and the blow that cut it) */
export const labelOf = b => (b.kind === 'attack' ? (b.trick ? trickName(b.trick) : punchName(b.name)) : b.kind === 'show' ? trickName(b.name) : MOVED[b.name] || b.name) + (b.tech ? ` (${techName(b.tech)})` : '');
export const saidOf = b =>
  (b.kind === 'attack'
    ? b.out
      ? b.out === 'hit'
        ? `${b.counter ? '카운터 ' : ''}명중 ${Math.round(b.worth)} N·s${b.down ? ' · 다운' : ''}`
        : SAID[b.out]
      : ''
    : b.kind === 'evade' || b.kind === 'step'
      ? b.out === 'clear'
        ? '피함'
        : ''
      : b.kind === 'guard'
        ? b.out === 'parry'
          ? '패리'
          : b.out === 'block'
            ? `막음${b.n > 1 ? ' ×' + b.n : ''}`
            : ''
        : b.kind === 'hurt' && b.by
          ? `${punchName(b.by.name)} ${Math.round(b.by.worth)} N·s`
          : '') + (b.cut ? `${b.kind === 'attack' && !b.out ? '' : ' ·'} ${b.cut.power ? '강타 ' : ''}${punchName(b.cut.name)}에 끊김` : '');
// a short word for a narrow block of the rails (two or three letters)
export const SHORT = {
  jab: '잽', cross: '스트', hook: '훅', upper: '어퍼', hookIn: '숏훅', upperIn: '숏어퍼', jabBody: '바디잽', crossBody: '바디', hookBody: '리버', upperBody: '바디어퍼', shiftHook: '시프트',
  hookR: '뒷훅', crossOver: '크로스', flicker: '플리커',
  slip: '슬립', duck: '더킹', roll: '위빙', pull: '스웨이', guard: '가드', shell: '셸', shoulder: '롤', pat: '패링', hurt: '피격', thrown: '튕김', down: '다운',
  in: '인', out: '아웃', press: '압박', back: '백', duckIn: '더킹인', side: '사이드', pivot: '피벗', cut: '컷', dash: '대시', hopPivot: '피벗아웃', hopCircle: '서클', wave: '파도',
  beckon: '손짓', chinOut: '도발', wind: '풍차', shrug: '으쓱', tapChin: '도발'
};
export const shortOf = b => SHORT[b.name] || labelOf(b);

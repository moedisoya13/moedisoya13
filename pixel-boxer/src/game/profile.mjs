/* A boxer as his career knows him, and what that makes him in the ring.
   The career only ever deals in the sheet: seven attributes from 1 to 100 (50 is an honest club fighter). The ring never
   sees them: body(sheet) turns them into the numbers the physics and the rules run on, so that training a boxer changes
   how his punches actually travel, how his feet actually move and how his body takes a blow, not a hidden dice roll.
     body(sheet)        -> what the rules and the physics use (see FIELDS below)
     fatigue(f)         -> 0..1: how much of his freshness is left, from his stamina
     rate(sheet)        -> one number for how good he is, for matching opponents and for the career's display
     loadout(skills, asked?) -> the techniques he carries (game/techniques.mjs): those asked for that his grades open and his
                           slots hold, or, asked for none, the ones his grades give him (SLOTS: how many, by his best grade) */
import { TECHNIQUES, gradeOf, opens } from './techniques.mjs';
import { LEVEL } from '../anim/skill.mjs';

export const ATTRS = [
  { id: 'power', name: '힘', short: '힘', what: '주먹 뒤에 실리는 몸무게. 충격량이 커집니다.' },
  { id: 'speed', name: '속도', short: '속도', what: '근육이 관절을 돌리는 빠르기. 주먹이 더 빨리, 더 세게 닿습니다.' },
  { id: 'footwork', name: '풋워크', short: '발', what: '이동 속도와 대시 거리, 거리를 잡는 감각.' },
  { id: 'stamina', name: '지구력', short: '지구', what: '체력의 양과 회복 속도. 지치면 모든 것이 느려집니다.' },
  { id: 'defense', name: '수비', short: '수비', what: '패리가 걸리는 시간, 가드가 막아내는 양, 주먹을 읽는 확률.' },
  { id: 'chin', name: '맷집', short: '맷집', what: '같은 주먹에 덜 다칩니다. 다운에서 일어날 확률이 올라갑니다.' },
  { id: 'iq', name: '감각', short: '감각', what: '카운터를 노리는 눈, 콤비네이션의 선택, 쉴 때를 아는 것.' }
];
export const IDS = ATTRS.map(a => a.id);

export const blank = (v = 50) => Object.fromEntries(IDS.map(id => [id, v]));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const u = (sheet, id) => clamp(sheet[id] ?? 50, 1, 100) / 100; // 0.01 .. 1
const lerp = (a, b, t) => a + (b - a) * t;

/* What each attribute is in the ring. The ends of every range were tried in the bout: at 1 a boxer is poor but can still
   box, at 100 he is outstanding but not out of the sport. 50 gives the values the rules had before there were attributes. */
export function body(sheet) {
  sheet = sheet || blank();
  const p = u(sheet, 'power'),
    s = u(sheet, 'speed'),
    f = u(sheet, 'footwork'),
    st = u(sheet, 'stamina'),
    d = u(sheet, 'defense'),
    c = u(sheet, 'chin'),
    q = u(sheet, 'iq');
  return {
    // ---- punching
    power: lerp(0.76, 1.24, p), // the impulse a punch delivers, times this
    rate: lerp(0.84, 1.16, s), // every muscle of the kinetic chain, this much quicker
    // ---- moving
    walk: lerp(1.8, 2.8, f), // metres a second, free
    accel: lerp(12, 22, f),
    dash: lerp(0.95, 1.45, f), // metres a dash covers
    // ---- defending
    parry: lerp(0.11, 0.23, d), // seconds a fresh guard turns a punch aside
    smother: lerp(0.23, 0.07, d), // share of a blow that gets through a held guard
    chin: lerp(1.3, 0.7, c), // damage taken, times this
    stunTaken: lerp(1.25, 0.75, c), // and the stagger after it
    // ---- lasting
    staminaMax: lerp(70, 130, st),
    regen: lerp(5, 14, st), // stamina a second, not punching
    // ---- deciding (the brain reads these)
    read: lerp(0.55, 1.3, (d + q) / 2), // how often he sees a punch coming and does something about it
    counter: lerp(0.35, 1, q), // how often he takes an opening he is given
    patience: lerp(0.6, 1.25, q), // how well he paces himself: rests when tired, does not waste punches out of range
    will: lerp(0.35, 0.95, (c + st) / 2) // getting up off the canvas
  };
}

// what a punch or a move costs him in stamina
export const COST = { jab: 4, cross: 7, hook: 8, upper: 9, dash: 6, slip: 3 };

/* How fresh he is, 0..1. Above a third of his stamina he is fresh; below it he slows down toward a floor, never to a stop. */
export function fatigue(f) {
  return clamp(f.stamina / (0.35 * f.k.staminaMax), 0, 1);
}

/* The techniques he carries (docs/moves-plan-5.md §4.0): the third thing a boxer is, after his sheet and his grades. SLOTS:
   how many slots his best grade gives him (each technique takes its cost of them; the career may change this). Asked for a
   list, he carries what of it his grades open, in its order, as long as it fits; asked for none, what his grades give him
   (each technique's `standard`: the pull counter from a pro up, the cross-arm guard for a dirty fighter of 4 and 5). */
export const SLOTS = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 6 };
// his best grade at anything: the grades his skills name, and a pro's for what they leave to the default
export function best(skills) {
  const grades = Object.values(skills || {}).map(v => (typeof v === 'object' ? v && v.grade : LEVEL[v] && LEVEL[v].grade)).filter(g => g),
    rest = skills && skills.all ? [] : [LEVEL[3].grade];
  return Math.max(...grades, ...rest);
}
export function loadout(skills, asked) {
  const room = SLOTS[best(skills)] ?? SLOTS[3],
    ids = asked ? [...new Set(asked)] : Object.keys(TECHNIQUES).filter(id => TECHNIQUES[id].standard && TECHNIQUES[id].standard(gradeOf(skills, id))),
    out = [];
  let used = 0;
  for (const id of ids) if (TECHNIQUES[id] && opens(skills, id) && used + TECHNIQUES[id].cost <= room) out.push(id), (used += TECHNIQUES[id].cost);
  return out;
}

// one number for how good a sheet is (1..100): the attributes are not equally decisive, and this says by how much
const WEIGHT = { power: 1.2, speed: 1.2, footwork: 0.8, stamina: 0.9, defense: 1.1, chin: 1, iq: 0.8 };
export function rate(sheet) {
  let sum = 0,
    w = 0;
  for (const id of IDS) (sum += (sheet[id] ?? 50) * WEIGHT[id]), (w += WEIGHT[id]);
  return Math.round(sum / w);
}

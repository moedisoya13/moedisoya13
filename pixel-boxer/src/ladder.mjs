/* The skill ladder in the catalogue: every punch thrown at each of its seven grades (anim/skill.mjs), by a boxer at the
   range it is thrown from, at a man who stands there and takes it. The scripts are in the footwork's form (footwork.mjs),
   so the page, the review sheet and the tests all fight the same bouts. */
import { HOME } from './footwork.mjs';
import { LEVELS, LEVEL } from './anim/skill.mjs';

// (a hook from any closer meets the head early in its swing, before the body is behind it: see README, known limits)
const RANGE = { jab: 1.0, cross: 1.0, hook: 0.92, upper: 0.85 };
export const PUNCHES = [
  { id: 'jab', name: '잽', en: 'Jab' },
  { id: 'cross', name: '스트레이트', en: 'Cross' },
  { id: 'hook', name: '훅', en: 'Hook' },
  { id: 'upper', name: '어퍼컷', en: 'Uppercut' }
];
export const AT = 0.5; // when in the loop the punch is thrown

export const LADDER = PUNCHES.flatMap(p =>
  LEVELS.map(lv => ({
    id: `${p.id}@${lv}`,
    punch: p.id,
    level: lv,
    name: `${p.name} ${LEVEL[lv].label}`,
    en: `${p.en} · ${LEVEL[lv].name}`,
    group: p.name,
    loop: 1.6,
    view: { yaw: 0.12, pitch: 0.2 },
    me: () => HOME,
    him: () => [HOME[0] + RANGE[p.id], HOME[1]],
    // a hook and an uppercut are the second and third of the power chain: he is set up as if he had just thrown what comes
    // before (bout.mjs), so that the one punch is the whole of the card
    setup: b => {
      const f = b.fighters[0];
      f.skills = { all: lv };
      if (p.id === 'hook' || p.id === 'upper') Object.assign(f, { lastPower: true, sinceLast: -AT, link: p.id === 'hook' ? 0 : 1 });
    },
    press: [[AT, p.id === 'jab' ? 'jab' : 'power']]
  }))
);

/* The combinations in the catalogue (docs/combos-plan.md §9.1): each combination a technique of its own, a row with a card for
   every grade that knows it (game/combos.data.mjs: KNOWS), in the footwork's form (footwork.mjs), so that the page, the
   review sheet, the audit, the log of events and the tests all fight the same bouts. Only the combinations the punches there
   are now can throw are here (stage C0): the lead uppercut (1-2-5-2), the weights, the feints and the same hand twice come
   with the stages that bring them.

   The card does not go through the head. Its script presses the beats by name, as a scripted sparring partner would: the first
   when his grade throws (src/ladder.mjs: cue, his own beat or none), and each one after so that it lands its grade's time
   after the one before it landed (TEMPO, gapOf; the held moment of a blow counted): the moment it is pressed is that landing,
   and the time, less how long that punch takes to land on this card (its flight, measured: combos.numbers.mjs, written by
   tools/combos.mjs --write, which passes a frame either way over flights from which the exchange is not clean, as the
   defence's windows are passed over: src/audit.mjs); or, the chain not taking it yet, the first step it does. (The plan's
   own rule takes off how long the punch takes to reach all the way out, animator.arrival: on a guard held up a punch lands
   two to six frames before that, so it pressed too soon, and a cross pressed into the end of a hook bent the shoulder past
   where it goes.) A jab is the jab button; the rest are the power button with the punch named (game/bout.mjs: a press that
   names a punch is that punch); the chain's row presses the power button itself. He stays where his punches take him (a combination steps in as it goes,
   RULES.stepIn), and once it is all home walks back out to where he started; the other man, a pro with his guard up, stands
   and takes it, and walks back to his spot when he is knocked off it.
     COMBO_ROWS                 the rows: id (COMBOS'), name, en, note, from (metres apart as it starts), levels
     COMBINATIONS               the cards: one script a row and grade
     comboScript(row, lv, o)    a card's script; o: { press: 'tempo' (the card's) | 'fast' (each the step after the one before
                                landed, as soon as the chain takes it) | 'clock' (as the head presses now: 0.2 s after a
                                jab was pressed, 0.3 s after anything else, whether it has landed or not), guard: false (his
                                hands down), pinned: true (held where he stands: no blow moves him), from (metres), named:
                                true (the chain's beats named too, not the power button pressed), loop (seconds); at the
                                tempo, flights (frames from the press to landing, a beat each: the card's own, written by
                                tools/combos.mjs --write) or arrival: true (how long to reach all the way out, the plan's
                                rule, instead) }
     tally(m, bout, t)          what became of each beat, kept on m as the bout goes (the card's numbers, tools/combos.mjs's)
     comboCard(e), comboStep(cell, a, b)   the page's: the numbers under a card, and putting them there as it goes */
import { HOME } from './footwork.mjs';
import { cue, AT } from './ladder.mjs';
import { LEVEL } from './anim/skill.mjs';
import { MOVES, TO_BODY } from './anim/moves.mjs';
import { arrival } from './anim/animator.mjs';
import { createChain } from './phys/chain.mjs';
import { fatigue } from './game/profile.mjs';
import { COMBOS, KNOWS, NUM, beatsOf, gapOf } from './game/combos.data.mjs';
import { FLIGHTS } from './combos.numbers.mjs';

const DT = 1 / 60;
export const COMBO_LEVELS = ['1', '2', '3', '4m', '4a', '5m', '5a'];
// (the grades that know a combination: KNOWS)
const knowing = id => COMBO_LEVELS.filter(lv => KNOWS[lv].combos.includes(id));

/* The rows, in the order of the article (1-2-5-2, which needs the lead uppercut, comes with stage C1), and the chain, the power
   button's own order. Each starts in jab range (0.985 m, where the ladder throws the jab and the cross), but the cross, hook,
   cross, which is the one for when there is no room for a jab, at 0.86 m. */
export const COMBO_ROWS = [
  { id: '1-2', en: 'One-two', from: 0.985,
    note: '처음 배우는 콤비네이션. 가벼운 잽이 틈을 내고 뒷손 스트레이트가 끝냅니다. 둘째 주먹은 잽이 닿은 때에서 그 등급의 박자 뒤에 닿도록 누릅니다(1 0.45초, 2 0.30, 3 0.23, 4 0.20, 5명 0.18, 5암 0.17초): 1은 두 주먹 사이에 서고, 2는 늦게, 4명은 잽이 앞발 착지에, 5명은 엇박에 닿습니다.' },
  { id: '1-1-2', en: 'Jab, jab, cross', from: 0.985,
    note: '상대가 원투를 기다릴 때, 스트레이트에 카운터를 노릴 때 잽을 한 번 더 던져 떠봅니다. 두 번째 잽은 같은 손이라 앞 잽이 멈춘 자리에서 출발합니다(더블 잽). 든 가드에 막힌 잽 뒤에는 글러브가 이미 가드에 붙어 있어 거의 힘이 실리지 않는 등급이 있습니다(같은 손 잇기는 C3). 1은 이 콤비네이션을 모릅니다.' },
  { id: '1-2-3', en: 'One-two, hook', from: 0.985,
    note: '스트레이트의 체중 이동이 앞손 훅을 감습니다. 스트레이트가 닿든 안 닿든 훅은 위험합니다. 막힌 스트레이트는 상대를 덜 밀어 훅이 닿고, 깨끗이 맞은 스트레이트는 상대를 밀어내 훅이 빗나갈 수 있습니다. 1은 이 콤비네이션을 모릅니다.' },
  { id: '1-2-3-2', en: 'One-two, hook, cross', from: 0.985,
    note: '왼-오-왼-오. 잽이 가드를 열고 강타 셋이 따라갑니다. 끝 스트레이트는 걷지 않고 길게 쳐야 하는데(뒷발을 밀어 스탠스를 늘임) 그 동작은 아직 없어(C2), 지금은 훅이 좁힌 거리(스트레이트가 다 뻗는 1.0 m보다 가까운 0.88~0.91 m)에서 그대로 던져 가드에 뭉개집니다. 3부터 압니다.' },
  { id: '1-6-3-2', en: 'Jab, uppercut, hook, cross', from: 0.985,
    note: '원투가 읽혀 상대가 스트레이트를 슬립하거나 가드를 미리 올릴 때. 잽 뒤에 뒷손 어퍼가 아래에서 올라오고 훅과 스트레이트가 따라갑니다. 어퍼를 감는 동안 머리가 잽에 열립니다(위험). 3부터 압니다.' },
  { id: '2-3-2', en: 'Cross, hook, cross', from: 0.86,
    note: '잽을 놓을 자리가 없을 때, 상대가 거칠게 들어올 때 가까운 거리(0.86 m)에서 발을 박고 칩니다. 발을 박는 것과 끝 스트레이트를 길게 치는 것은 아직 없어(C2), 지금은 훅이 걸어 들어가고 끝 스트레이트가 0.83~0.86 m에서 가드에 뭉개집니다. 3부터 압니다.' },
  { id: 'chain', name: '체인 · 스트레이트 훅 어퍼', en: 'The chain: cross, hook, uppercut', from: 0.985, button: true,
    note: '강타 버튼을 0.55초 안에 이어 누르면 나오는 순서(스트레이트 → 훅 → 어퍼)입니다. 이 줄은 이름 없이 강타 버튼만 누릅니다(0.72 m 안이면 숏 훅 · 숏 어퍼가 됩니다). 지금 시합의 머리가 가장 많이 던지는 콤비네이션(2-3, 2-3-6)이 이것입니다.' }
].map(r => Object.assign({ name: COMBOS[r.id].name, levels: knowing(r.id) }, r));

// the button a beat is pressed with: the jab button for the jab, the power button with the punch named for the rest
export function pressOf(beat) {
  const name = beat.to === 'body' ? TO_BODY[beat.do] || beat.do : beat.do,
    move = MOVES[name];
  return move.kind === 'straight' && move.hand === 'L' && !move.zone ? { jab: true } : { power: name };
}
// (a punch of his that the chain will follow with another now: game/bout.mjs open)
const open = f => f.stun <= 0 && (!f.action || (!!MOVES[f.action.name].punch && (f.action.chain.phase === 'hold' || f.action.chain.phase === 'recover')));
// what became of a punch of his, as the bout says it (a parry says it of the man whose punch it turned aside)
const OUTCOME = ['hit', 'block', 'graze', 'whiff', 'parry'];
const isOutcome = (e, who) => OUTCOME.includes(e.type) && (e.type === 'parry' ? e.on : e.who) === who;

/* When to press each beat. The first: when his grade throws ('tempo': ladder.mjs cue), or at once. Each after it, by `how`
   (comboScript); at the tempo, the time it takes to land is the card's own, measured (flights: frames, combos.numbers.mjs), or
   how long the punch takes to reach all the way out (animator.arrival), the plan's rule (§7.4), where there is none. What has
   happened so far is kept on him (f.cues: forgotten as each loop starts). */
function beatsCue(beats, lv, how, button, flights) {
  const level = LEVEL[lv],
    // (the chain's row presses the power button itself, as the head does, and the bout chains the punches: bout.mjs RULES.chain)
    press = b => (button ? { power: true } : pressOf(b)),
    first = how === 'tempo' ? cue(beats[0].do, level, AT, 'first') : null;
  return (bout, t) => {
    const f = bout.fighters[0],
      own = (f.cues = f.cues || {}),
      got = (own.got = own.got || []),
      at = (own.at = own.at || []);
    // (what the last step said, as it ended: a beat started, a beat landed or went by)
    for (const e of bout.events) {
      if (e.type === 'punch' && e.who === 0) at.push(t - DT);
      else if (isOutcome(e, 0) && got.length < at.length) got.push(t - DT);
    }
    const k = own.k || 0;
    if (k >= beats.length) return null;
    let go = false;
    if (k === 0) go = first ? !!first(bout, t) : t >= AT - 1e-9;
    /* (the head's clock runs from its press, whether the chain took the press at once or kept it a moment, a step at a time:
       brain.mjs think, brain.next) */
    else if (how === 'clock') go = (own.next -= DT) <= 0;
    else if (got.length >= k && open(f)) {
      if (how === 'fast') go = true;
      else {
        // (when it should land, less how long it will take to get there: worked out once, as the one before lands)
        if (own.due === undefined || own.dueFor !== k) {
          const move = MOVES[pressOf(beats[k]).power || 'jab'];
          own.due = got[k - 1] + gapOf(beats[k - 1], beats[k], lv) - (flights && flights[k] !== null && flights[k] !== undefined ? flights[k] * DT : arrival(createChain(move, f.k.rate * (0.75 + 0.25 * fatigue(f)), LEVEL[lv]), move));
          own.dueFor = k;
        }
        go = t >= own.due - 1e-9;
      }
    }
    if (!go) return null;
    own.k = k + 1;
    own.next = beats[k].do === 'jab' ? 0.2 : 0.3;
    return press(beats[k]);
  };
}

/* A card's script (and, with o, the same combination as tools/combos.mjs measures it otherwise). Long enough for the slowest
   grade that knows it to throw it all and be home again. */
export function comboScript(row, lv, o) {
  o = o || {};
  const beats = beatsOf(row.id),
    from = o.from ?? row.from,
    spot = [HOME[0] + from, HOME[1]],
    slow = row.levels.includes('1') ? '1' : row.levels[0],
    loop = Math.ceil((AT + 0.45 + beats.slice(1).reduce((s, b, i) => s + gapOf(beats[i], b, slow), 0) + 1.0) * 10) / 10;
  return {
    id: `${row.id}@${lv}`,
    combo: row.id,
    level: lv,
    beats,
    name: `${row.name} ${LEVEL[lv].label}`,
    en: `${row.en} · ${LEVEL[lv].name}`,
    group: row.name,
    item: row.id,
    fresh: true,
    loop: o.loop || loop,
    view: { yaw: 0.25, pitch: 0.25 },
    /* (he stays where his punches take him, a combination stepping in as it goes; and once it is all home, he walks back out
       to where he started: two men standing in their guards right up close have their arms in each other's) */
    me: (t, f) => (t === 0 || (f && f.cues && f.cues.k >= beats.length && !f.action) ? HOME : null),
    // (the other man walks back to his spot when he is knocked off it; held, he is never moved off it)
    him: o.pinned ? t => (t === 0 ? spot : null) : () => spot,
    hisCover: o.guard === false ? undefined : () => true,
    setup: b => {
      b.fighters[0].skills = { all: lv };
      b.fighters[1].skills = { all: '3' };
    },
    keep: o.pinned
      ? b => {
          const g = b.fighters[1];
          [g.x, g.z] = spot;
          g.vx = g.vz = g.kx = g.kz = g.ix = g.iz = 0;
        }
      : undefined,
    cue: beatsCue(beats, lv, o.press || 'tempo', !!row.button && !o.named, o.arrival ? null : o.flights || FLIGHTS[`${row.id}@${lv}`] || null)
  };
}
export const COMBINATIONS = COMBO_ROWS.flatMap(row => row.levels.map(lv => comboScript(row, lv)));

/* ---- what became of each beat: m.beats [{ name, at (pressed), t (landed or gone by), bat and bt (the same on the bout's
   clock, which stands still in the held moment of a blow), type, J, part, zone, apart (metres centre to centre then) }], m.breath (the share of all his breath it took, from before the first press to the last
   landing), m.apart (metres apart once his last punch is home). t: the time at the end of the step (held moments counted). */
export function tally(m, bout, t) {
  const [a, b] = bout.fighters,
    beats = (m.beats = m.beats || []),
    apart = () => Math.hypot(b.x - a.x, b.z - a.z);
  let changed = false;
  for (const e of bout.events) {
    if (e.type === 'punch' && e.who === 0) (beats.push({ name: e.name, at: t, bat: bout.t }), (changed = true));
    else if (isOutcome(e, 0)) {
      const x = beats.find(x => x.t === undefined);
      if (x) Object.assign(x, { t, bt: bout.t, type: e.type, J: e.J, part: e.part || null, zone: e.zone || null, apart: apart() }), (changed = true);
    }
  }
  const last = beats[beats.length - 1];
  if (m.breath === undefined && m.want && beats.length >= m.want && last.t !== undefined) (m.breath = (m.before - a.stamina) / a.k.staminaMax), (changed = true);
  if (m.apart === undefined && m.breath !== undefined && !a.action) (m.apart = apart()), (changed = true);
  // (his breath before the first press: as it was the step before)
  if (!beats.length) m.before = a.stamina;
  return changed;
}

// a beat by the article's number (the short punches are the 3 and the 6 too; to the body, b)
const NUMBER = Object.assign(Object.fromEntries(Object.entries(NUM).map(([n, p]) => [p, n])), { hookIn: '3', upperIn: '6', jabBody: '1b', crossBody: '2b', hookBody: '3b', upperBody: '6b' });
const RESULT = { hit: '맞음', block: '막힘', graze: '스침', whiff: '빗나감', parry: '패리' };
const PART = { forearm: '팔뚝', elbow: '팔꿈치', shoulder: '어깨' };
export const said = x => (x.type ? RESULT[x.type] + (x.type === 'block' && PART[x.part] ? `·${PART[x.part]}` : '') : '–');

// the numbers under a card: a line a beat (its number, ms from the one before landing, N·s, what became of it), and the whole
export function comboCard(e) {
  const line = (n, i) => `<span>${n}</span><span><b data-gap="${i}">${i ? '–' : ''}</b></span><span><b data-j="${i}">–</b></span><span data-r="${i}">–</span>`;
  return `<div class="beats"><span>박</span><span>사이 ms</span><span>N·s</span><span>결과</span>${e.beats.map((b, i) => line(NUMBER[pressOf(b).power || 'jab'] || b.do, i)).join('')}</div>
    <div class="feet stats"><span>끝까지 <b data-c>–</b> s</span><span>숨 <b data-d>–</b>%</span></div><div class="feet stats"><span>끝 거리 <b data-a>–</b> m</span></div>`;
}
// and putting them there, each step of the card's bout (cell: the catalogue's; a and b, the two men)
export function comboStep(cell, a, b) {
  const m = (cell.m.combo = cell.m.combo || { want: cell.entry.beats.length });
  if (!tally(m, cell.bout, cell.t)) return;
  const q = s => cell.el.querySelector(s),
    put = (s, v) => q(s) && (q(s).textContent = v);
  m.beats.forEach((x, i) => {
    if (x.t === undefined) return;
    if (i) put(`[data-gap="${i}"]`, m.beats[i - 1].t === undefined ? '–' : String(Math.round((x.t - m.beats[i - 1].t) * 1000)));
    put(`[data-j="${i}"]`, x.J === undefined ? '–' : String(Math.round(x.J)));
    put(`[data-r="${i}"]`, said(x));
  });
  const last = m.beats[m.beats.length - 1];
  if (m.breath !== undefined) put('[data-c]', (last.t - m.beats[0].at).toFixed(2)), put('[data-d]', String(Math.round(m.breath * 100)));
  if (m.apart !== undefined) put('[data-a]', m.apart.toFixed(2));
}

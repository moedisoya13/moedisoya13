/* Blows to the body, as scripts in the catalogue's form (src/defense.mjs, src/footwork.mjs: drive): the other man throws at
   a place on the boxer's trunk at a set moment of the loop, and the boxer takes it, or meets it with his elbow, or goes down
   from it a moment late and gets up (docs/moves-plan-5.md §3; game/trunk.mjs, game/bout.mjs RULES.body, anim/body.mjs).
   There are no punches to the body yet (§3.3 is the next stage's): these throw the punches there are, aimed at a place on
   his trunk instead of at his head (trunk.mjs: aimFor), the aim followed until the joint that steers the punch fires and kept
   from then, as an aim at the head is (bout.mjs: viewOf). A punch aimed at his trunk is what the bout judges as a punch to
   the body (bout.mjs: lowOf). The hook and the uppercut come out of the other man's power chain as its second and third
   (bout.mjs: decide), so the script starts his chain there.
   What the punches there are can reach, a man standing in his guard: a hook aimed low lands on the pit of his stomach (it
   cannot be swung lower than his own shoulder lets a bent arm go, and sweeps across the front of a man turned side on); his
   ribs face the other man, and a hook reaches them as he jabs (his chest turned further from it); his liver is turned away,
   and a hook reaches it only while his chest is turned open by his own cross, two frames into it (no later: his rear elbow
   comes round over it). A jab aimed low meets his lead forearm, and a cross gets there with little behind it.
     BODYSHOTS      the scripts: being hit on each place, going down from the liver, and the elbow block by grade
     aimAt(place, name)   a script's `keep` that aims the other man's punch (that punch, if named) at that place (a place's
                    name, or [k, a]: trunk.mjs middle) */
import { HOME } from './footwork.mjs';
import { getUp } from './game/bout.mjs';
import { MOVES } from './anim/moves.mjs';
import { LEVELS } from './anim/skill.mjs';
import { aimFor } from './game/trunk.mjs';

const DT = 1 / 60;
export const aimAt = (place, name) => bout => {
  const [a, b] = bout.fighters,
    act = b.action,
    move = act && MOVES[act.name];
  if (!move || !move.punch || act.struck || !a.points || (name && act.name !== name)) return;
  if (!act.aim || act.chain.fired[move.arm === 'swing' ? 1 : 3] < 0) act.aim = aimFor(b, a.points, place, move.arm, move.hand);
};
// (the other man's chain started at the punch: the hook is the second of it, the uppercut the third)
const LINK = { cross: null, hook: 0, upper: 1 };
function shot(e) {
  const [punch, at] = e.punch,
    aim = aimAt(e.aim || e.zone, punch),
    more = e.keep;
  return Object.assign({ hurt: true, view: { yaw: 0.3, pitch: 0.2 } }, e, {
    me: () => HOME,
    him: () => [HOME[0] + e.gap, HOME[1]],
    against: (e.before || []).concat([[at, 'power']]),
    keep: (bout, t) => {
      const b = bout.fighters[1];
      if (LINK[punch] !== null && Math.abs(t - at) < DT / 2) (b.link = LINK[punch]), (b.lastPower = true), (b.sinceLast = 0);
      aim(bout, t);
      if (more) more(bout, t);
    }
  });
}
// (knocked down, he gets up `up` seconds into the loop, as the referee of a match would let him: the knockdown scripts' way)
const rise = up => (bout, t) => {
  const f = bout.fighters[0];
  if (f.down && t >= up) getUp(bout, f);
};
// (his own punch, so many frames after the other man's: his chest turned one way or the other as it lands)
const own = (button, at, frames) => [[at + frames * DT, button]];
// (the liver, low on his right side: what a hook reaches of it while his cross turns him open, from 0.9 m)
const LIVER = [0.5, 70];

export const BODYSHOTS = [
  shot({
    id: 'body-solar', name: '바디 피격 (명치)', en: 'Taken in the pit of the stomach', group: '맞기', zone: 'solar', aim: [2.2, 0],
    note: '명치에 훅을 맞습니다. 몸통이 먼저 맞은 점을 감싸듯 앞으로 접히고(골반은 조금만 돌고 척추가 말림), 골반이 뒤로 빠지고 두 무릎이 받고, 머리가 앞·아래로 나오고, 두 팔꿈치가 배를 감싸며 글러브가 내려가 머리가 열립니다. 가슴이 한 번 꺼졌다 돌아오고, 1.5초 동안 숨이 빠릅니다.',
    loop: 2.2, gap: 0.85, punch: ['hook', 0.6], outcome: 'hit', view: { yaw: 0.9, pitch: 0.2 }
  }),
  shot({
    id: 'body-liver', name: '바디 피격 (간)', en: 'Taken on the liver', group: '맞기', zone: 'liver', aim: LIVER,
    note: '스트레이트를 던지느라 열린 오른쪽 옆구리(간)에 훅을 맞습니다. 맞은 쪽으로 상체가 꺾이고 앞으로 조금 접히며, 골반이 반대쪽으로 밀리고 오른무릎이 받고, 오른팔꿈치가 옆구리로 내려옵니다. 가벼운 훅이라(70 N·s 미만) 서 있습니다.',
    // (a lighter man's hook: under what puts him down)
    loop: 2.2, gap: 0.9, punch: ['hook', 0.6], press: own('power', 0.6, 2), outcome: 'hit', setup: b => (b.fighters[1].k.power = 0.62), view: { yaw: 1.3, pitch: 0.2 }
  }),
  shot({
    id: 'body-ribs', name: '바디 피격 (갈비)', en: 'Taken on the ribs', group: '맞기', zone: 'ribs', aim: [1.2, -60],
    note: '잽을 던지는 순간 상대 쪽을 향한 왼쪽 갈비에 훅을 맞습니다. 맞은 쪽(왼쪽)으로 상체가 꺾이고, 골반이 오른쪽으로 밀리고 왼무릎이 받고, 왼팔꿈치가 내려옵니다.',
    loop: 2.2, gap: 0.85, punch: ['hook', 0.6], press: own('jab', 0.6, 2), outcome: 'hit', view: { yaw: 0.2, pitch: 0.2 }
  }),
  shot({
    id: 'down-liver', name: '리버 다운', en: 'Down from the liver', group: '다운', zone: 'liver', aim: LIVER, liver: true,
    note: '스트레이트를 던지느라 열린 간에 70 N·s 넘게 들어간 훅입니다. 0.4초 동안은 보통 피격처럼 서 있다가(간은 늦게 옵니다), 뒷팔꿈치를 옆구리에 붙인 채 상체가 접히며 뒷무릎이 꺾이고, 0.75초 무렵 뒷무릎과 앞 글러브가 캔버스에 닿습니다. 의식이 있어 무릎에서 일어납니다. 실신하지 않고, 숨은 최대치의 30%로 깎입니다.',
    loop: 4.4, gap: 0.95, punch: ['hook', 0.6], press: own('power', 0.6, 2), outcome: 'hit', setup: b => (b.knockdowns = true), keep: rise(2.6), view: { yaw: 1.0, pitch: 0.24 }
  }),
  ...LEVELS.map(lv =>
    shot({
      id: `block-elbow@${lv}`, name: '팔꿈치 블록 (간)', en: 'The elbow block', group: '막기', zone: 'liver', level: lv, item: 'block-elbow',
      note: '가드를 든 채 간을 노린 훅을 팔로 받습니다. 가드의 팔꿈치와 아래팔이 몸통 앞에 있어 길을 막고, 상대의 엉덩이가 발사된 뒤 등급만큼 지나 맞는 쪽 팔꿈치가 옆구리로 내려오며(2는 두 팔을 다), 반대 글러브는 머리에 붙어 있습니다. 1은 팔꿈치를 벌린 가드라 맞습니다.',
      loop: 2, gap: 0.85, punch: ['hook', 0.6], cover: t => t > 0.1 && t < 1.3, outcome: lv === '1' || lv === '4a' || lv === '5a' ? 'hit' : 'block', setup: b => (b.fighters[0].skills = { all: lv }), view: { yaw: 1.0, pitch: 0.2 }
    })
  )
];

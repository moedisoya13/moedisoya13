// catalog-7: the note thread of 숏 어퍼 (upperIn) carries the green "조치 · N 단계 · 반영됨" for the user's note "무릎을 더
// 써서 주먹의 궤적을 U자로", while in the 5L and 5D cards the glove's path has no bottom to the U (its own text says so: "5명
// 0 cm … 5단계는 전과 거의 같습니다"). Measures, in each grade's card, the uppercutting glove from the press to the landing:
// how far below where it started it goes, and the flat bottom (how far it travels sideways/forward while within 3 cm of its
// lowest point, the measure src/memo.actions.mjs uses), and the deepest knee bend.
//   node catalog-7.mjs <pixel-boxer root>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2]);
const src = f => import(pathToFileURL(path.join(root, 'src', f)).href);
const [foot, ladder, { step }, { ACTIONS, STATES }] = await Promise.all(['footwork.mjs', 'ladder.mjs', 'game/bout.mjs', 'memo.actions.mjs'].map(src));
const DT = 1 / 60;
const res = {};
for (const lv of ['2', '3', '4m', '4a', '5m', '5a']) {
  const e = ladder.LADDER.find(x => x.id === `upperIn@${lv}`), bout = foot.freshBout(e), [a, b] = bout.fighters, path = [];
  let pressed = null, landed = null, knee = 0;
  for (let k = 0; k < Math.round(e.loop / DT) && landed === null; k++) {
    step(bout, foot.drive(e, bout, k * DT, DT), DT); b.hp = a.hp = 1000;
    for (const ev of bout.events) { if (ev.type === 'punch' && ev.who === 0 && pressed === null) pressed = k; if (pressed !== null && ev.who === 0 && ['hit', 'block', 'graze', 'whiff'].includes(ev.type)) landed = k; }
    if (pressed !== null) { path.push(a.points.R.slice()); if (a.pose.knee) knee = Math.max(knee, a.pose.knee.L ? a.pose.knee.L.flex : 0, a.pose.knee.R ? a.pose.knee.R.flex : 0); }
  }
  const low = Math.min(...path.map(p => p[1])), near = path.filter(p => p[1] <= low + 0.03);
  let flat = 0;
  for (const p of near) for (const q of near) flat = Math.max(flat, Math.hypot(p[0] - q[0], p[2] - q[2]));
  res[lv] = { drop: (path[0][1] - low) * 100, flat: flat * 100, knee };
  console.log(`upperIn@${lv}: glove goes ${(res[lv].drop).toFixed(1)} cm below where it was at the press, flat bottom ${res[lv].flat.toFixed(1)} cm, deepest knee ${knee.toFixed(0)}°, ${landed - pressed} frames press → landing`);
}
const a = ACTIONS.upperIn;
console.log(`note thread: "조치 · ${a.stage} 단계 · ${STATES[a.state]}" — "${a.text.slice(0, 80)}…"`);
const lame = ['5m', '5a'].filter(lv => res[lv].flat < 3);
console.log(a.state === 'done' && lame.length ? `REPRO: yes upperIn is marked "${STATES[a.state]}" while the U's flat bottom is ${lame.map(lv => res[lv].flat.toFixed(1) + ' cm at ' + lv).join(', ')} (3: ${res['3'].flat.toFixed(1)} cm; plan 8–10)` : 'REPRO: no');

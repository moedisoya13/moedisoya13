// catalog-2: the card "실신 · 크로스 카운터에" (out-counter) cuts its knockdown short with a quarter-speed "brilliant
// defence" replay 0.25 s after the blow, while the man is still falling, before the knockdown's own replay. Every other
// knockdown card falls live all the way down first (README "보여 주는 순서", docs/moves-plan-6.md §2.4D; the card's plan,
// docs/cross-counter-plan.md:345: "라이브로 쓰러진 뒤 느린 리플레이(다운 연출의 지금 규칙)").
// Emulates src/catalog.mjs tick + draw for one card at 1× (one step and one picture a 1/60 s), with its src/replay.mjs, the
// effects aged as draw() ages them (render/blow.mjs), until the row's loop ends.
//   node catalog-2.mjs <pixel-boxer root>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2]);
const src = f => import(pathToFileURL(path.join(root, 'src', f)).href);
const [foot, defense, { step }, { createFx }, B, { createReplay }] = await Promise.all(['footwork.mjs', 'defense.mjs', 'game/bout.mjs', 'render/fx.mjs', 'render/blow.mjs', 'replay.mjs'].map(src));
const DT = 1 / 60;
function emulate(e) {
  const c = { t: 0, bout: foot.freshBout(e), motes: [createFx(), createFx()], ripples: [null, null], falls: [null, null], ground: null, replay: createReplay({ yaw: () => e.view.yaw }) };
  const log = [];
  let wall = 0;
  const say = what => log.push({ what, t: +c.t.toFixed(2), wall: +wall.toFixed(2) });
  for (let k = 0; k < 3600; k++) {
    wall += DT;
    if (c.replay.playing) { c.replay.next(DT); if (!c.replay.playing) say('replay ends'); continue; }
    if (c.t >= e.loop - 1e-9) { say('loop over'); break; }
    const bout = c.bout;
    c.t += DT;
    step(bout, foot.drive(e, bout, c.t - DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!e.hurt) bout.fighters[0].hp = 1000;
    for (const ev of bout.events) {
      if (ev.type === 'hit') { B.blow(c.motes[ev.on], ev, bout.fighters[ev.on]); c.ripples[ev.on] = B.rippleOf(ev, bout.fighters[ev.on]); if (B.fallOf(ev)) c.falls[ev.on] = B.fallOf(ev); say(`blow ${ev.name} ${Math.round(ev.J)} N·s${ev.down ? ', down' : ''}`); }
      if (ev.type === 'brilliant') say('brilliant defence');
    }
    c.falls.forEach((f, i) => { const at = B.landed(f, bout.fighters[i]); if (at) (c.ripples[i] = B.landRipple(f, bout.fighters[i], at)), (c.ground = B.groundOf(f, at)), say('comes down on the canvas'); });
    if (c.replay.watch(bout, DT, B.quietOf(c.motes, c.ripples, c.ground))) say(`replay "${c.replay.kind}" starts (tag: ${c.replay.kind === 'fall' ? '리플레이' : '리플레이 ¼'})`);
    for (const m of c.motes) m.update(DT);
    c.ripples = c.ripples.map((r, i) => { if (!r) return null; r.age += DT; return B.rippleRow(r, bout.fighters[i]) ? r : null; });
    if (c.ground) { c.ground.age += DT; if (!B.groundRow(c.ground)) c.ground = null; }
  }
  return log;
}
const cards = [defense.OUT_COUNTER, ...defense.DEFENSE.filter(e => !e.level && (e.group === '다운'))];
let cut = 0;
for (const e of cards) {
  const log = emulate(e);
  const blow = log.find(x => / down/.test(x.what)), land = log.find(x => /canvas/.test(x.what)), first = log.find(x => /replay ".*" starts/.test(x.what));
  const before = first && land && first.t < land.t;
  if (before) cut++;
  console.log(`${e.id.padEnd(12)} blow t=${blow ? blow.t : '-'}  lands t=${land ? land.t : '-'}  first replay: ${first ? first.what + ' at t=' + first.t : 'none'}${before ? '  <- BEFORE he lands' : ''}`);
  if (e.id === 'out-counter') for (const x of log) console.log(`    wall ${x.wall.toFixed(2)} s, card t ${x.t.toFixed(2)} s: ${x.what}`);
}
const oc = emulate(defense.OUT_COUNTER), reps = oc.filter(x => /starts/.test(x.what)).length;
console.log(cut ? `REPRO: yes ${cut} of ${cards.length} knockdown cards (out-counter) cut the live fall with a replay before he lands; out-counter plays ${reps} replays in one loop` : 'REPRO: no');

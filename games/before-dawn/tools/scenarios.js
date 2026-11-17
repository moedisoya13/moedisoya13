// §13.2-15 scenarios. They use only registry ids and engine APIs, so they run unchanged once
// the content agents register dark_knight, ghoul, skel_archer, armor_break, holy_light,
// flame and rest_of_dead. Each returns {name, ok, why}.
'use strict';

function setup(BD, hand) {
  const H = BD.harness();
  H.start({ seed: 11, hand, floor: 2, level: 1 }); // level 1: the swing damage the scenarios pin (GDD-V2 §10.3 would start 2F at 6)
  const w = H.world();
  H.killAll(); w.wave.n = 3; w.freezeT = 0;
  w.hero.x = w.grid.w / 2; w.hero.y = w.grid.h / 2;
  H.input({ mx: 0, my: 0 });
  return { H, w };
}
function place(BD, w, kind, dx, dy, opts) {
  const e = BD.W.makeEnemy(w, kind, w.hero.x + dx, w.hero.y + dy, opts || {});
  return e;
}
function hitsOn(w, id) { return w.bus.recent(4000).filter((ev) => ev.event === 'hit' && ev.enemyId === id); }

function guard(BD, withBreak) {
  const { H, w } = setup(BD, withBreak ? ['armor_break'] : []);
  const e = place(BD, w, 'dark_knight', 1.4, 0);
  e.face = Math.PI; // facing the hero (hero is at -x)
  e.stunT = 1e9;
  H.step(40);
  const hs = hitsOn(w, e.id).filter((h) => h.source === 'slash');
  if (!hs.length) return { ok: false, why: 'no slash hit' };
  const base = BD.C.HERO.dmg + w.hero.radiance;
  const want = withBreak ? base : Math.max(1, Math.round(base * 0.2));
  return { ok: hs[0].dmg === want, why: `first slash dmg ${hs[0].dmg}, expected ${want}` };
}

exports.run = function (BD) {
  const out = [];
  const g1 = guard(BD, false), g2 = guard(BD, true);
  out.push({ name: 'dark knight front guard 20% / armor_break 100%', ok: g1.ok && g2.ok, why: g1.why + '; ' + g2.why });

  {
    const { H, w } = setup(BD, ['holy_light']);
    const e = place(BD, w, 'ghoul', 1.2, 0);
    e.hp = 1; e.stunT = 1e9;
    H.step(40);
    const ev = w.bus.recent(4000);
    const down = ev.some((x) => x.event === 'down' && x.enemyId === e.id), kill = ev.some((x) => x.event === 'kill' && x.enemyId === e.id);
    out.push({ name: 'holy_light ghoul: kill without down', ok: kill && !down, why: `kill=${kill} down=${down}` });
  }
  {
    const { H, w } = setup(BD, ['flame']);
    const e = place(BD, w, 'slime', 1.2, 0); // slimes are always wet
    e.hp = 999; e.stunT = 1e9;
    H.step(40);
    const steam = w.bus.recent(4000).some((x) => x.event === 'hit' && x.source === 'steam');
    out.push({ name: 'flame on a wet enemy → steam hit', ok: steam, why: `steam hit=${steam}` });
  }
  {
    const { H, w } = setup(BD, ['rest_of_dead']);
    let awake = false;
    w.bus.on('quest_awaken', (ev) => { if (ev.cardId === 'rest_of_dead') awake = true; });
    const goal = BD.cards.get('rest_of_dead').goal; // v1 12, GDD-V2 §4.4 150
    let n = 0;
    for (; n < goal && !awake; n++) {
      const e = place(BD, w, 'skel_archer', 1.2, 0);
      e.hp = 1; e.stunT = 1e9;
      let k = 0;
      while (!e.dead && k++ < 120) H.step(1);
    }
    const prog = BD.cardRt.get(w, 'rest_of_dead').state.progress;
    out.push({ name: `rest_of_dead awakens after ${goal} undead kills`, ok: awake && prog === goal, why: `awaken=${awake} progress ${prog}/${goal} (${n} placed)` });
  }
  return out;
};

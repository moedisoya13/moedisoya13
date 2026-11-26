/* sfx-5 (evidence for an improvement): which sound variants real sparring rounds make (spar/plan.mjs rounds, the events
   heard through cuesOf as spar.mjs does, plus the parry ping the game adds for the player, you: 0) and which of them the
   audition page can play. A variant is a cue with the options that change its sound (game/audio.mjs SOUNDS).
   node sfx-5.mjs <pixel-boxer root> [seeds, default 1-8] */
const root = process.argv[2];
const seeds = (process.argv[3] || '1,2,3,4,5,6,7,8').split(',').map(Number);
const { cuesOf, punchOf } = await import(root + '/src/game/audio.mjs');
const { planOf, startOf, DT } = await import(root + '/src/spar/plan.mjs');
const { step } = await import(root + '/src/game/bout.mjs');

// (the options that change the sound, per cue: as SOUNDS[name].make reads them)
const key = q => {
  const o = q.o;
  switch (q.name) {
    case 'breath': return `breath ${o.kind}${o.power ? '+power' : ''}${o.soft ? '+soft' : ''}${o.tired > 0.05 ? '+tired' : ''}`;
    case 'swing': return `swing ${o.kind === 'upper' ? 'upper' : 'other'}${o.power ? '+power' : ''}`;
    case 'impact': return `impact ${o.where}${o.counter ? '+counter' : ''}${o.down ? '+down' : ''}`;
    case 'block': return `block ${o.part === 'glove' ? 'glove' : o.part === 'shoulder' ? 'shoulder' : 'forearm/elbow'}`;
    case 'parry': return `parry${o.hammer || o.down ? ' heavy(hammer/down)' : ''}`;
    case 'evade': return `evade ${o.kind === 'duck' || o.kind === 'roll' ? 'duck/roll' : o.kind === 'pull' ? 'pull' : 'slip/collar'}`;
    case 'whiff': return `whiff ${o.kind === 'straight' ? 'straight' : 'hook/upper'}`;
    case 'dash': return 'dash';
    case 'step': return `step${o.v >= 3 ? ' stomp' : ''}`;
    default: return q.name;
  }
};
// what the page's cards can make (src/sfx.mjs SECTIONS and DEMOS, read off the code; ring/pit and voice are page controls)
const PAGE = new Set(['breath jab', 'breath straight', 'breath hook', 'breath upper+power', 'breath hook+power', 'breath straight+tired', 'breath jab+tired', 'breath hook+tired', 'breath straight+soft', 'swing other+power', 'swing other', 'swing upper+power',
  'impact head', 'impact body', 'impact head+counter', 'impact head+down', 'impact head+counter+down', 'block glove', 'block forearm/elbow', 'block shoulder', 'parry', 'graze', 'evade slip/collar', 'evade duck/roll', 'whiff straight',
  'grunt', 'gasp', 'exhale', 'pant', 'step', 'dash', 'floor', 'rope', 'cheer', 'roar', 'bell', 'win', 'lose']);
const seen = new Map(), types = new Map(), tired = [];
let frames = 0;
for (const seed of seeds) {
  const plan = planOf(seed), bout = startOf(plan);
  for (const inp of plan.inputs) {
    step(bout, inp, DT);
    frames++;
    for (const e of bout.events) {
      types.set(e.type, (types.get(e.type) || 0) + 1);
      for (const q of cuesOf(e, { men: bout.fighters, you: 0 })) {
        seen.set(key(q), (seen.get(key(q)) || 0) + 1);
        if (q.name === 'breath') tired.push(q.o.tired || 0);
      }
    }
  }
}
const rows = [...seen].sort((a, b) => b[1] - a[1]);
for (const [k, n] of rows) console.log(`${PAGE.has(k) ? '  page ' : '  MISSING'} ${k.padEnd(34)} ${n}`);
console.log('event types:', [...types].map(([t, n]) => `${t} ${n}`).join(', '));
// (variants the bout makes that these rounds did not reach: from the code, not counted)
console.log('not in these rounds but in the code: impact body+counter/down, step stomp (foul stomp), block J 12 (paw), whiff hook/upper if absent above');
tired.sort((a, b) => a - b);
const q = p => tired[Math.floor(p * (tired.length - 1))].toFixed(2);
console.log(`breaths: ${tired.length}; tired (0 fresh .. 1 spent; the page's 지친 숨 card is 0.92, every other card 0) quartiles ${q(0.25)} / ${q(0.5)} / ${q(0.75)}, over 0.05: ${tired.filter(t => t > 0.05).length}, over 0.5: ${tired.filter(t => t > 0.5).length}`);
const miss = rows.filter(([k]) => !PAGE.has(k)), tot = rows.reduce((a, r) => a + r[1], 0), missN = miss.reduce((a, r) => a + r[1], 0);
console.log(`EVIDENCE: ${seeds.length} sparring rounds (${(frames * DT).toFixed(0)} s): ${rows.length} sound variants heard, ${miss.length} of them not playable on the page (${miss.map(r => r[0] + ' ' + r[1]).join(', ')}) = ${missN} of ${tot} cues (${((100 * missN) / tot).toFixed(1)}%)`);

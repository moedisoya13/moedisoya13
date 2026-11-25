// 1-4: the cross-arm guard that the default loadout gives 4암 / 5암 (techniques.mjs crossArm.standard) takes away almost all
// of their parries (a cross-arm guard turns nothing aside, bout.mjs guardOf / the 'guard' branch), which costs more than its
// counter brings: the same 4암 parries about twice as often and does better against a 4명 without it.
// Two full matches each way (seeds 1000 and 8919, sides swapped on the second), even sheets.
// usage: node 1-4.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch, nextRound, cornerAdvice } = await import(root + '/src/game/match.mjs');
const SEEDS = [1000, 8919];
function run(tech) {
  const t = { parries: 0, blocksOnHim: 0, hitsOnHim: 0, crossArmCounters: 0, downs: 0, wins: 0, losses: 0, draws: 0, loadout: null };
  SEEDS.forEach((seed, i) => {
    const me = i % 2 === 0 ? 1 : 0, skills = [null, null], techniques = [undefined, undefined];
    skills[me] = { all: '4a' };
    skills[1 - me] = { all: '4m' };
    techniques[me] = tech;
    const m = createMatch({ seed, skills, techniques, rounds: 3, roundTime: 60 });
    t.loadout = m.bout.fighters[me].techniques;
    const bout = m.bout;
    function see(e) {
      if (e.type === 'parry' && e.who === me) t.parries++;
      if (e.type === 'block' && e.who === 1 - me) t.blocksOnHim++;
      if (e.type === 'hit' && e.who === 1 - me) t.hitsOnHim++;
      if (e.type === 'hit' && e.who === me && bout.fighters[me].action && bout.fighters[me].action.asked && bout.fighters[me].action.asked.tech === 'crossArm') t.crossArmCounters++;
      if (e.type === 'hit' && e.on === me && e.down) t.downs++;
    }
    // (finish()'s loop, the same corner advice, reading each step's events)
    let guard = 0;
    while (m.phase !== 'over' && guard++ < 60 * 60 * 60) {
      if (m.phase === 'break') nextRound(m, [cornerAdvice(m, 0), cornerAdvice(m, 1)]);
      else { stepMatch(m, 1 / 60); bout.events.forEach(see); }
    }
    const r = m.result;
    if (r.winner === null) t.draws++;
    else if (r.winner === me) t.wins++;
    else t.losses++;
  });
  return t;
}
const withX = run(undefined), without = run(['pullCounter']);
console.log('4암 default loadout', JSON.stringify(withX));
console.log('4암 pull counter only', JSON.stringify(without));
const yes = without.parries >= 1.5 * withX.parries;
console.log(`REPRO: ${yes ? 'yes' : 'no'} 4암 vs 4명, 2 matches: with the default cross-arm guard ${withX.parries} parries, ${withX.hitsOnHim} hits taken, W-L-D ${withX.wins}-${withX.losses}-${withX.draws}; without it ${without.parries} parries, ${without.hitsOnHim} hits taken, W-L-D ${without.wins}-${without.losses}-${without.draws}`);

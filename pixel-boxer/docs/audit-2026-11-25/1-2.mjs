// 1-2: a majority draw (one judge for one man, the other two level) comes out as result { winner: 0, how: 'draw' }:
// src/game/match.mjs decision(): winner = zero > one ? 0 : ..., how = 'draw'. Anything that reads `winner` (tools/balance.mjs
// counts `winner !== null` as a win) books a draw as a win.
// The cards are set by hand (rounds 1-2), round 3 is fought for its last frame with nothing landed (all three judges 10-10).
// usage: node 1-2.mjs <pixel-boxer root>
const root = process.argv[2];
const { createMatch, stepMatch } = await import(root + '/src/game/match.mjs');
const tally = () => ({ thrown: 0, landed: 0, power: 0, J: 0, blocked: 0, downs: 0 });
const m = createMatch({ seed: 5, rounds: 3, roundTime: 60 });
m.cards = [
  [[10, 9], [10, 10], [10, 10]], // round 1: judge 1 gives it to boxer 0, judges 2 and 3 have it even
  [[10, 10], [10, 10], [10, 10]] // round 2: even on every card
];
m.stats = [[tally(), tally()], [tally(), tally()], [tally(), tally()]];
m.round = 3;
m.clock = 60 - 1 / 120; // the last frame of round 3 (the boxers are still apart in their corners: nothing lands)
let guard = 0;
while (m.phase !== 'over' && guard++ < 10) stepMatch(m, 1 / 60);
console.log('totals per judge', JSON.stringify(m.totals));
console.log('result', JSON.stringify({ winner: m.result.winner, how: m.result.how }));
// the same thing balance.mjs does with it
const counted = m.result.winner === null ? 'draw' : 'win for ' + m.result.winner;
console.log('tools/balance.mjs would count it as:', counted);
// and the same in a match fought out: seed 16838, grade 3 (default loadout) vs grade 4암 carrying only the pull counter
const { finish } = await import(root + '/src/game/match.mjs');
const n = createMatch({ seed: 16838, skills: [{ all: '3' }, { all: '4a' }], techniques: [undefined, ['pullCounter']], rounds: 3, roundTime: 60 });
const r = finish(n);
console.log('fought: totals per judge', JSON.stringify(n.totals), 'result', JSON.stringify({ winner: r.winner, how: r.how, round: r.round }), 'bout.over (who cheers)', n.bout.over);
const yes = m.result.how === 'draw' && m.result.winner !== null, yes2 = r.how === 'draw' && r.winner !== null;
console.log(`REPRO: ${yes || yes2 ? 'yes' : 'no'} cards ${JSON.stringify(m.totals)} give { winner: ${m.result.winner}, how: '${m.result.how}' }; fought seed 16838 cards ${JSON.stringify(n.totals)} give { winner: ${r.winner}, how: '${r.how}' } (a draw with a winner)`);

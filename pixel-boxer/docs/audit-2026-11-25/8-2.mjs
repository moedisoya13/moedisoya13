// 8-2: the longest stretch in which ONE man starts no technique (attack, evasion, guard, taunt), and what fills his two
// lanes in it. The docs (docs/spar.md 숫자) report only the stretch in which NEITHER man starts one (max 2.45 s).
// usage: node 8-2.mjs <pixel-boxer root> [seeds, comma list]
const root = process.argv[2];
const seeds = (process.argv[3] || '35,36').split(',').map(Number);
const { planOf } = await import(root + '/src/spar/plan.mjs');
const { ACTS } = await import(root + '/src/spar/rails.mjs');
let worst = 0, worstAt = null;
for (const seed of seeds) {
  const p = planOf(seed), end = p.ko.step;
  for (const i of [0, 1]) {
    const acts = p.rails[i].filter(b => ACTS.includes(b.kind) && b.from < end);
    let at = 0, best = [0, 0, 0];
    for (const b of acts) (b.from - at > best[0] && (best = [b.from - at, at, b.from])), (at = b.from);
    if (end - at > best[0]) best = [end - at, at, end];
    const [len, from, to] = best;
    const inside = lane => lane.filter(b => b.from < to && (b.to ?? end) > from);
    const share = {};
    for (const b of inside(p.rails[i])) {
      const k = b.kind + ':' + b.name, a = Math.max(from, b.from), z = Math.min(to, b.to ?? end);
      share[k] = (share[k] || 0) + (z - a);
    }
    const covered = Object.values(share).reduce((s, x) => s + x, 0);
    const feet = {};
    for (const b of inside(p.feet[i])) feet[b.name] = (feet[b.name] || 0) + Math.min(to, b.to ?? end) - Math.max(from, b.from);
    const hitsOn = p.events.filter(e => e[1] === 'hit' && e[0] > from && e[0] <= to && e[2] === 1 - i).length;
    console.log(`#${seed} man ${i} (${p.men[i].grade}): longest with no technique started ${(len / 60).toFixed(2)} s, steps ${from}..${to} (${(from / 60).toFixed(1)}-${(to / 60).toFixed(1)} s); his technique lane in it (frames): ${JSON.stringify(share)}, empty ${len - covered} frames; his feet: ${JSON.stringify(feet)}; blows that landed on him in it: ${hitsOn}`);
    if (len > worst) (worst = len), (worstAt = `#${seed} man ${i}`);
  }
}
console.log(worst / 60 > 3 ? `REPRO: yes one man starts no technique for ${(worst / 60).toFixed(2)} s (${worstAt}); docs report only the both-men lull (max 2.45 s)` : `REPRO: no longest one-man stretch ${(worst / 60).toFixed(2)} s`);

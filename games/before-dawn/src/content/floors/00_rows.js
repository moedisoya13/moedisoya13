// The enemy side of the director's rows (GDD-V2 §3.4–3.6) in one place: the HP and damage multipliers
// of regular enemies, the wind-up caps, the threats' interval and cap, the elites' interval — the knobs
// §9.2 tunes difficulty with (① HP and damage, ② the caps). BD.C.DIRECTOR.floors (src/core/00_base.js)
// still holds the proof slice's row and everything else of it (want, rate, packs …); this file sets
// these columns at load. Values that differ from GDD-V2 are listed, with the reason, in
// docs/requests/v2-enemies.md "tuning" and pinned by tests/enemies/numbers.test.js (tests/enemies/tuned.js).
//
//                 1F    2F    3F    4F    5F   rooftop
const ROWS = {
  hp:          [1.0,  1.2,  1.4,  1.6,  1.8,  1.5],
  dmg:         [1.3,  1.8,  2.2,  2.7,  3.1,  1.9],
  melee:       [4,    4,    5,    5,    6,    3],
  ranged:      [2,    3,    3,    4,    4,    2],
  threatEvery: [6,    6,    5,    5,    4,    0],
  threatCap:   [3,    4,    5,    6,    7,    0],
  eliteEvery:  [0,    60,   50,   45,   40,   0],
};
for (const [col, vals] of Object.entries(ROWS)) vals.forEach((v, i) => { BD.C.DIRECTOR.floors[i + 1][col] = v; });

// Guardian HP 1F–5F (§3.6, the knob ③ of §9.2; the engine's BD.C.GUARDIAN.hp is read by makeEnemy)
BD.C.GUARDIAN.hp = [0, 280, 480, 680, 880, 1090];

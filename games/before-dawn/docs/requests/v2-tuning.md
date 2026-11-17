# v2 proof slice — numbers changed against GDD-V2

The proof slice (docs/GDD-V2.md §11.1) was built with the GDD-V2 starting values. One pass
condition missed with them; §11.1 says to fix the director table (§3.4) and the level curve (§4.2)
first. Only the director table changed. Every number that differs from the GDD-V2 text is listed
here, with what the measurement showed. Method: `node tools/fun/measure.js --seeds 1-20`
(human-like pilot, dealt hands, median over runs).

## 1. Tuned: the director table (§3.4) — `BD.C.DIRECTOR.floors` (src/core/00_base.js)

| floor | GDD-V2 from → to | now | GDD-V2 rate (/s) | now |
|---|---|---|---|---|
| 1F | 12 → 20 | 14 → 24 | 3.0 | 4.0 |
| 2F | 14 → 26 | 16 → 30 | 3.5 | 4.5 |
| 3F | 18 → 32 | 20 → 36 | 4.0 | 5.0 |
| 4F | 22 → 38 | 24 → 42 | 4.8 | 6.0 |
| 5F | 26 → 44 | 28 → 48 | 5.5 | 6.8 |
| rooftop (per boss phase) | 8 / 12 / 16 | 10 / 14 / 18 | 2.0 | 2.6 |

Why: with the GDD values the median "enemies on screen" was **11.7** (gate ≥ 12; 1F 8.8, 2F 11.1).
The trace showed the tokens at 0 most of the time on 1F: the hero kills packs about as fast as they
arrive, so — as §3.4 says — density is set by the spawn rate, not by the on-screen target. Rate ×1.3
alone gave 13.1; rate ×1.3 with the targets raised about 15 % gave 13.6 (seeds 1–20), hits per
minute stayed at 1.3–1.5. The level curve (§4.2) was not changed: choice gap 32 s → 29–30 s, first
choice 6 s, inside the gate.

| measure (seeds 1–20, median) | GDD-V2 values | tuned |
|---|---|---|
| kills per minute | 171.3 | 194 |
| enemies on screen | **11.7** | 13.5 |
| < 3 on screen | 5.6 % | 4.8 % |
| 2+ enemies hit per swing | 58.5 % | 59.6 % |
| hits taken per minute | 1.4 | 1.3 |
| median choice gap | 32.3 s | 29 s |
| runs reaching 3F | 20/20 | 20/20 |

## 2. Not in the GDD-V2 text: values the slice had to choose

| what | value | where | note |
|---|---|---|---|
| fodder "next to the hero" (§3.5, "공격 사거리 안") | 1.6u for 0.5 s | `C.V2.fodderNearR` | the GDD names no distance |
| camera snaps when the hero is this far from it | 12u (\|dx\|+\|dy\|) | `C.V2.cam.snap` | covers teleports and tests that move the hero |
| shard acceleration 6 → 18 u/s | 40 u/s² | `C.V2.shard.accel` | the GDD gives the speeds, not the rate |
| burn spread per tick | ≤ 2 per burning enemy (GDD), and a just-lit enemy spreads from the next tick | src/core/24_status.js | without the second half one swing lit a whole pack in one tick |
| husk (굶주린 망자) lunge | leap 0.6u in 0.15 s, cd 2.0 s, 80° fan r 1.4 | ghoul.js `husk.T` | the GDD gives the fan and warning only |
| slimelet / mana slime hop | hop 0.3 / 0.32 s, flat 0.5 s, cd 2.0 s, range 2.0 / 2.2u | slime.js | the GDD gives distance, period, circle and warning only |
| flasks | one per floor at a zone centre (v1) + two on the rooftop | `gen.floorV2` | GDD-V2 §6 supplies flasks from elites and threats instead; that is the pickups agent's (§11.2-6). Kept so a slice run has some healing |
| threats (slime, archer, ghoul, mage, dark knight) | v1 speed, damage and behaviour, GDD-V2 HP | enemy files | as §11.1-2 says ("위협은 v1 행동 그대로에 새 HP만"); slime damage stays the v1 tuned 12 |
| minimum warning | 0.45 s (v1) | `C.ENEMY.minTelegraph` | GDD-V2 §3.5 says 0.5 s; left for the enemies agent with the other behaviour changes |

## 3. Targets outside the §11.1 gate (not tuned yet)

From the same 20 runs: longest wait for a choice about 80 s (target ≤ 75: the rooftop, where few
fodder die), 4F ÷ 1F kills per minute 1.5 (≥ 1.6), seconds on 3F about 175 (110–170), winning run
15.6 min (12.5–15.5), 3+ enemies in reach at a swing 14 % (≥ 30), "enemies alive but none in reach"
55 % (≤ 20; the metric counts every enemy on the floor, most of them off screen). These belong to
the tuning rounds of §11.2-7.

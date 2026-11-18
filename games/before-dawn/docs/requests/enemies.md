# Enemies & floors agent — engine edits, requests, tuning, interpretations

Owned: `src/content/{enemies,bosses,rooms,floors}/`, `tests/enemies/`, this file. Everything in
GDD §6 and §7 is implemented. `tests/enemies/` pins every number (`numbers.test.js`, tuned values
listed against the GDD value) and checks each rule, telegraph timing, the boss phases, the
generation guarantees over 300 seeds, and the contracts the real cards rely on
(`contracts.test.js`). `tests/enemies/stage_screens.js` stages every enemy, guardian and boss
phase in the built game; its output is in `docs/screens/enemies/`.

## Engine edits made (smallest additive)

### `tools/accept.js` criterion 8: read the 450 s clock on an enemy-proof idle run

**Reason.** Criterion 8 reads the clock at t = 450 s on the idle seed-1 run. With the real
enemies an idle hero dies within about 20 s, because every 1F carries two archers and a mage
(non-dominant bundles, §7.4). They keep 4–7u away, so the hero never reaches them. The run
ended before 450 s, so the check printed `clock at 450 s = null` and FAILed. No enemy number can
fix this: at 1 damage per hit they would still kill an idle hero long before 450 s.

**Change.** The first idle run is unchanged and must still end in death before 1200 s. If it ends
before 450 s, a second idle seed-1 run is stepped with `hero.invuln = 1` on every tick, so enemy
hits cannot land. The dawn drain ignores invulnerability. That run must read `00:00` at t = 450
and must still die (by dawn) before 1200 s. Fifteen added lines, marked `(enemies agent)`.

## Requests

### 1. Move the tuned guardian HP row into `BD.C.GUARDIAN.hp`

Tuning tripled guardian HP: `[0, 480, 660, 840, 1020, 1200]`, against the GDD's 160 / 220 / 280 /
340 / 400. That row is an engine constant, so the content applies it itself:

- `src/content/enemies/00_tuning.js` defines `BD.enemyTune.guardian(e, w)`.
- Every enemy's `guardian.create` calls it.
- The result is `maxHp = row[floor] × w.mods.enemyHp`, the same formula the engine uses.

Request: set `BD.C.GUARDIAN.hp` to that row. Then `BD.enemyTune.guardian` can become a no-op.
`numbers.test.js` checks that the engine row is still the GDD value, so update that test too.

### 2. Bot: it walks back into arrows and bolts already in flight (distorts tuning)

The bot sees danger only in telegraphs and zones, not in hostile projectiles. It leaves the
warned line in time. Once the line fills, the arrow is in flight, and the bot often steps back
across its path while repositioning (rule ③).

Measured over 30 seeds: 315 arrow and dark-bolt hits. Only 27 of them came from a line the
hero was still inside when it filled. The other 288 (91 %) came after the hero had left the
line.

This makes `skel_archer:shot` the top source of damage taken in every tuning run, and the top
cause of death on undead floors. A player who watches the arrow would take far less.

Suggested fix in `insideDanger`: treat as danger the stretch each hostile projectile will
cover in the next ~0.6 s (`p` → `p + dir × min(range − travelled, speed × 0.6)`, radius `p.r`).
Not edited. Archer damage was left at the GDD value because of this.

### 3. Criterion 17's win length cannot be met without breaking LEAD §1 for human players

GDD §16 assumes 40 % attack uptime. The bot's measured uptime is **68–72 %**: it swings during
72 % of the time enemies are alive, over 30 seeds.

| Enemy numbers | Bot floors (s) | Bot wins |
|---|---|---|
| GDD | 30–53 | 4.7 min |
| Now (tuned) | 62–130 | 9.1–9.4 min |

A player at 40–55 % uptime needs about 1.3–1.8× the bot's time, so about 12–17 min per run.
That fits LEAD §1 (10–20 min) and the GDD floor budget (90–150 s).

Pushing the bot itself to 11–15 min needs about 4× HP. One trial: 10.3 min, but only 6 % wins.
Human runs would then last about 19–26 min and hit the 06:00 dawn before the roof. I stopped at
about 9 min and leave the trade-off to the lead. Raising boss HP and guardian HP lengthens wins
the most per unit of added danger.

### 4. (cosmetic) The collapse ring is drawn over the building facade

`collapse`'s outer ring (6–9u around the roof centre) reaches past the 13×13 roof everywhere
except the corners. The engine's `hatch` drawer paints the whole annulus, so part of it lies on
the facade below the floor edge (see `boss_p3_collapse.png`). No damage comes from there.

Clipping telegraph fills to floor cells in the hatch drawer would fix it. Thorn circles near the
edge show the same effect, more mildly.

### 5. Known bus bug (`type` overwritten in `hit` / `kill`)

No enemy code reads `type` from an event. The tests read the enemy type through `kind` and the
registry, as the cards do.

## Tuning

**Method.** Bot runs at tier 0 with a fresh save, so hands are dealt from the 12 base cards, and
the real 18 cards are registered. No trials. Measured with
`BD.simRun({seed, tier: 0, maxSec: 1500})` over seeds 1–100, and over 101–200 as a check.

**What changed.** HP, damage, counts and timings only. No behaviour changed.

| Number | GDD | Tuned | Why |
|---|---|---|---|
| `goblin.hp` | 20 | **60** | Melee bodies hardly hurt the bot (it dodges almost every stab), so their HP sets floor length without adding much danger |
| `goblin.dmg` | 6 | **7** | Beast floors killed almost no one |
| `slime.hp` | 30 | **90** | As goblin |
| `slime.dmg` | 10 | **12** | As goblin |
| `skel_archer.hp` | 25 | **60** | ×2.4. Damage left at 9 (see request 2) |
| `ghoul.hp` | 60 | **180** | ×3. Corpse HP stays 20, so finishing the body still works (§6.5) |
| `ghoul.T.reviveHp` | 30 | **60** | Keeps the rise worth stopping at ×3 HP |
| `mage.hp` | 40 | **80** | ×2 only: mages are the main killer |
| `dark_knight.hp` | 120 | **360** | ×3 |
| guardian HP 1F–5F | 160 / 220 / 280 / 340 / 400 | **480 / 660 / 840 / 1020 / 1200** | ×3, so a guardian stays tougher than its tuned kin (request 1) |
| `demon_king.hp` | 1500 | **3600** | ×2.4. The rooftop takes about 120 s (GDD budget 150) |
| magic-dominant mages 2F–5F | M8 / M10 / M12 / M13 | **M6 / M7 / M8 / M9** | §16 foresees it: fire zones covered the room; magic floors killed half the bot runs |

Elite multipliers, damage of the other enemies, every telegraph time, every cooldown, the boss
attacks and every other bundle are still the GDD values.

> **Superseded (HP rows):** `docs/CONTROLS-REVIEW.md` §3.1 re-tuned every HP above to about 2/3
> (goblin 40, slime 60, archer 40, ghoul 120 + revive 40, mage 54, knight 240, guardians
> 385 / 530 / 675 / 815 / 960, boss 3000), with post-hit invulnerability 1.0 s and the mage's fire
> circle warning 1.1 s, against a human-like pilot instead of the perfect bot. Those values are now
> the GDD's own (§2.2, §6.2–6.4). The damage rows and the mage counts above still stand.

**Bot results** (criterion 17 targets: median death floor 3–4F, 5–30 % wins, median win length
11–15 min):

| | Wins | Median death floor | Median win | Deaths by floor | 2F reached (seeds 1–20) |
|---|---|---|---|---|---|
| Before (GDD numbers), seeds 1–100 | 97 % | (3 deaths) | 4.7 min | 4F 2, 6F 1 | 20/20 |
| After, seeds 1–100 | **15 %** | **3F** | 9.1 min | 2F 19, 3F 26, 4F 14, 5F 6, 6F 20 | 20/20 |
| After, seeds 101–200 | **13 %** | **3F** | 9.4 min | 1F 1, 2F 18, 3F 26, 4F 17, 5F 10, 6F 15 | 20/20 |

- No exceptions in 200 runs.
- Median floor times after tuning: 1F 62 s, 2F 81 s, 3F 91–99 s, 4F 81–94 s, 5F 93–98 s,
  rooftop 117–129 s.
- Causes of death, seeds 1–100: archer shot 26, mage fire circle 19, mage fire zone 16, knight
  charge 14, boss 6, other 4.
- Deaths per floor entered: beast 13 %, undead 28 %, heavy 26 %, magic 26 %, rooftop 57 %.
- Criterion 7 (≥ 15/20 reach 2F) passes 20/20.
- Win length misses the target; see request 3.

## Interpretations of the GDD

### Rooms (§7.2)

- **Gaps.** "간격 3칸 이상" (`pillars`, `aisle`) is read as three free cells between blocks
  (Chebyshev). The general rule keeps two free cells from walls and void.
- **`pillars` on 1F.** A 12×12 room fits at most four pillars under these gaps, so 1F pillar
  rooms always have four. Larger rooms draw 4–6.
- **`aisle`.** If the room cannot take two rows in the drawn orientation (bitten or narrow
  rooms), it tries the other orientation.
- **`ring`.** If `bite` leaves too little room in front, the block steps one cell toward the
  back walls, so the 2-cell gap to void holds.
- **`notch`.** It cuts one side corner of the diamond, (W, 0) or (0, H). The back corner keeps
  both back walls; the front corner holds the start.
- **`bite`.** It cuts the y = H and x = W edges, the front edges nearest the camera.

### Archer

- Its line ends at the wall. Elite and guardian scaling (§6.3) applies only to the line's width.
- It shoots only from an edge distance of 9u or less.
- When cornered for 0.6 s while backing off, it shoots instead.

### Mage

- It casts only from 9u or less.
- It drifts sideways while inside its 4–7u band.
- It teleports to a random free cell at least 6u away that the hero can reach.
- A `bind` that lands while it channels cancels the teleport.
- Its fire zone's damage scales like its hit (elite ×1.25, guardian ×1.3).
- 대마도사 (guardian): its side circles sit ±2.2u across the mage→hero line.

### Ghoul

- After rising it waits 0.8 s before its next lunge.
- Elite and tier HP scale the revive and corpse HP by the same factor.
- 구울 폭군 (guardian): it rises with 50 % of its tuned maximum HP.

### Dark knight

- **Guard.** A direct hit is guarded when it arrives inside the front 120°. Where it comes from
  is the strike's origin as the engine passes it: the hero for a swing or a dash, or the wave's
  position at impact for a sword wave. A dash counts as direct and is guarded.
- **Fizzle.** If the knight is knocked more than 0.3u off its warned line during the wind-up,
  it drops the charge.
- **Warning length.** The warning ends where the run will end: where the body first meets a
  wall, obstacle or void, plus the hitbox reach, never past the wall ahead. A shoulder that
  clips an obstacle beside the lane counts as a slam (2.8 s opening). So does a void edge.
- **Elite.** An elite's 5u charge scales ×1.2.
- **암흑기사 단장 (guardian).**
  - Its charge is a fixed 7u long (§6.3 table); only the width takes ×1.4.
  - Its sweep keeps radius 2.2 and deals 20 × 1.3 = 26.

### Demon king

- If it is cleave's turn and the hero is farther than 4u, the cycle moves on to the next skill.
- **Dark bolts in phase 1:** each line aims at the hero when it appears.
- **Dark bolts from phase 2:** five lines fanned over ±30° around the bearing at the start.
- The roar wipes only the boss's own warnings. Minions keep theirs.
- The summon timer counts from the start of the phase, the roar included.
- "졸개 8을 넘으면" counts living minions plus pending rifts and queued spawns.

## Not verified

- Human-play pacing. Request 3 estimates it from the bot's uptime only.
- Criterion 18 (card tuning targets) was not measured.
- Tier ≥ 1 balance (밤의 깊이) was not run.
- The screenshots are single frames. Motion (squash, hop, lunge arcs) was checked in state
  dumps, not by watching it in a browser.

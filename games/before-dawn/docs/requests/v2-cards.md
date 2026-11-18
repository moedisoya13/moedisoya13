# v2 cards — what the cards side built, the hooks it needs, the engine edits it made

Branch `v2-cards` (docs/GDD-V2.md §4, §11.2-4). All 18 cards have their five levels (§4.4), the
seven boons are registered (§4.5), the growth choice and the chest follow §4.3 / §4.6 with no dead
offer, the altar does §4.6 to the hand, every card is dealt again, and the two v2 unlocks (§8)
are in. Every number that differs from GDD-V2 is under **Tuning** at the end.

Files: `src/content/cards/*.js` (levels next to each card's rules and drawers),
`src/content/cards/_altar.js` (the altar), `src/content/boons/{body,long,step,wide}.js`,
`tests/cards/*` (levels_table, levels_more, boons, offers, altar + the v1 files moved to the v2
level-1 numbers), and three scripts that are not tests: `tests/cards/balance.js` (the balance
runs of §5), `tests/cards/combos.js` (V8 at mixed levels: all 816 hands, every card at every level,
20 s each on 3F — `816 hands … no exceptions, no NaN`, 72 s on 4 cores) and `tests/cards/shoot.js`
(the frames and contact sheets in `docs/screens/v2-cards/`: each card at levels 1, 3, 5, frozen
the moment its own effect fires with ≥ 15 enemies in view).

## 1. The altar — the hook the floors agent calls (GDD-V2 §4.6, §5.5, §10.3)

The floors agent registers the site kind and places it; the cards side owns what it does to the
hand. Register exactly this (the cards side registers no `altar` site, so the ids cannot clash):

```js
BD.sites.register({
  id: 'altar', name: '제단', stay: 0.8, known: true, optional: true,
  use: (w, site) => BD.cardAltar.use(w, site),          // opens the choice; returns false (site stays 'active')
  update: (w, site, dt) => BD.cardAltar.update(w, site, dt), // after 나중에: back to 'idle' once the hero steps off
});
```

and put one per floor (1F–5F) in `floor.layout.sites` as `{kind: 'altar', x, y}`. The cards side
then:

- on the stay: computes the floor's three offers once (`BD.cardAltar.offers(w)`, kept on the
  site so 나중에 shows the same three), opens `w.choice = {kind: 'altar', step: 'choose', offers,
  pick: null, options, floor, nextDomType, pray: 30, site, lastCards, level}`, sets
  `w.choiceOpen` (the world stands still), emits `altar_open {floor}` and
  `choice_open {kind: 'altar', options: ['card:<id>' × 3]}`;
- answers `app.cmd('choice', cmd, arg)` while `w.choice.kind === 'altar'`:
  `pick i` (offer i → step `slot`; in step `slot` a pick is the slot), `slot s`, `back`, `pray`,
  `later`;
- a swap: the new card goes into slot s **at that slot's level** (`BD.cardRt.equip(w, s, id,
  out.level)`); quest progress and combo stacks leave with the old card (combo `swap` reset);
  `card_swap {slot, outId, inId}`, `choice_pick {kind: 'altar', pick: 'swap:<out>><in>'}`, toast
  `성인을 새겼다: <이름> N단계`, `altar_close {choice: 'card'}`, site cleared (`site_clear`);
- a prayer: HP +30 (`heal` source `altar`), `altar_pray`, `choice_pick {pick: 'pray'}`,
  `altar_close {choice: 'pray'}`, site cleared;
- 나중에: `altar_close {choice: 'later'}`, no `choice_pick`; the site stays `active` until the hero
  leaves its ring, then is `idle` again;
- sets `w.botAltarUsed = true` when the altar is used (the bot's `smart` rule reads it).

Offers (§4.6): three unlocked cards not equipped; 1F–4F with 50 % the first is the next floor's
target card; quest cards only while feasible (§4.4): 망자의 안식 while an undead floor is left
above, 왕의 사냥 while two or more floors are left, 불의 순례 while one is (§4.4 gives no rule for
it; a horde floor holds hundreds of kills). The draw is `BD.sub(seed, 'gen', 'altar<floor>')`.

Tested with a fixture site of the same shape (`tests/cards/altar_site.js`, id `test_altar`).

## 2. Requests to the other agents

**UI agent.**
- The altar is a choice of kind `altar` (above), not the v1 `w.altar` overlay. Until the overlay
  draws it, the generic growth-choice overlay already works with it: in step `choose` the options
  are the three offers (`kind: 'card'`, `from = to = 1`, `altar: 'offer'`), in step `slot` the
  three slots (`kind: 'card'`, `from = to =` the slot's level, `slot`, `altar: 'slot'`, `text`
  "<out> → <in> N단계: …"), and tapping one is `pick`. Missing there: 기도한다 (HP +`w.choice.pray`),
  나중에 and 돌아가기 buttons (`app.cmd('choice', 'pray' | 'later' | 'back')`), and the title
  `제단 — 다음 층: <w.choice.nextDomType>`. v1's `src/ui/62_altar.js` reads `w.altar`, which v2
  floors never set.
- Unlock lines: `def.unlockText` now exists on every card with an unlock (`누적 처치 4000`,
  `누적 마법 유형 처치 1200`, …); `src/ui/05_cardinfo.js` still says 150 / 마도사 20. Progress for
  마력 역류 reads `save.counters.magicKills`.
- The dash cooldown arc: a dash now starts `w.hero.stats.dashCd` (가벼운 발 lowers it to 1.3 s);
  draw the arc against that, not `C.DASH.cd`.
- Boon icons: `long`, `wide`, `body`, `step` have no glyph in `63_growth.js` (they draw the dot).
- New card presentation hooks (vfx kinds): `tide_bump`, `holy_burst`, `armor_burst`,
  `royal_first`, `flawless_block`; decor `armor_edge`, `flawless_shell`; trails `tide` (the
  level-5 wave), `one_flash` with `trail.flash` (the level-5 일섬 line); zone `pilgrim_trail`.
- HUD: 회전베기, 해류, 성광 (level 5), 망자의 안식 (level 5), 갑옷 파쇄 (empowered swings) use `pips`;
  무결 uses `ring` (kills toward the next stack).

**Floors / sites agent.**
- The chest: `BD.growth.open(w, 'chest')` (the options for kind `chest` are in
  `BD.growth.options(w, 'chest')`: my three cards in slot order, a top-level card's place filled
  by a boon, then 여명의 숨). The halo the chest gives is yours.
- `tools/fun/lib.js` counts every optional `site_start` as a choice and also the `choice_pick`
  that follows at an altar or a chest, so those count twice; GDD-V2 §10.1 counts only the rift by
  `site_start`.

**Bot / measurement (lead).**
- `thinkV2` rule ⑦ only stands in the ring of *task* sites; an optional site on screen (altar,
  chest) is walked to only while no enemy is near, so in a horde the bot rarely stands 0.8 s on
  one. Treat a chosen optional site like a task site in ⑦.

**Enemies agent.** Elites come only from the enemies agent's director work (`eliteEvery` is unused
on this branch), so 왕의 사냥 (quest: 5 elites or guardians), 갑옷 파쇄 level 4–5 and 마력 역류
level 5 meet elites only after the merge; their tests stage elites directly.

## 3. Engine edits made on this branch (smallest additive form)

| file | change | why |
|---|---|---|
| `src/core/21_hero.js` | hero stats gain `dashCd` (default `C.DASH.cd`); a dash starts `stats.dashCd` | 가벼운 발 (§4.5) lowers the dash cooldown |
| `src/core/22_combat.js` | `knock(…, {slam, slamDmg})`: the slam damage per knock (default `STATUS.slamDmg`) | 해류 2·4단계 충돌 피해 14 / 20 |
| `src/core/22_combat.js` | `w.stats.magicKills` counts magic-type kills | 마력 역류 unlock (§8) |
| `src/core/40_progress.js` | `counters.magicKills`, `summary().run.magicKills`, `endRun` adds it | the same (the save v2 migration of §8 stays with whoever does the save) |
| `src/core/20_world.js` | `hurtHero`: a card's `blockHurt(ctx, dmg, info)` returning true takes the blow (no damage, no `hurt`, the usual 1 s invulnerability) | 무결 3단계 "피격 한 번을 막는다" |
| `src/core/29_growth.js` | `options(w, kind)`: kind `chest` (§4.6); in a level choice the remaining growable card comes before 여명의 숨; `open(w, kind)` passes the kind and a chest keeps the rotation | the chest and "no dead offer" |
| `src/core/50_app.js` | `app.cmd('choice', …)` goes to `BD.cardAltar.cmd` while the open choice is the altar | §10.3 `('choice', 'slot' / 'pray' / 'later')` |
| `src/bot/bot.js` | `BD.bot.choose` answers an altar choice with `BD.cardAltar.choose` | the bot's altar policy (§10.3 `mixed` / `card` / `pray`) |
| `tools/scenarios.js` | criterion 15's 망자의 안식 scenario kills `def.goal` undead (150) instead of 12 | §4.4 goal |
| `tests/ui/hud.test.js` | the slot test reads the quest goal (`'7/' + goal`) instead of `7/12` | §4.4 goal (UI agent's file: three lines) |

Not touched, for whoever owns it: `catalog/sync.js` can now read `def.levels[1..5].text` for every
card, `def.unlockText`, and `BD.boons` (7) — GDD-V2 §12.

## 4. Interpretations (where GDD-V2 §4.4 allowed more than one reading)

- **Counting effects** ("베기 N번째마다", "처치 N번째마다"): a swing counts when it hit something;
  the Nth swing is the one whose earlier count is N − 1 (mod N) (as 회전베기 5단계 in the slice).
  Kill counts count every kill, any source; a kill that already bursts by its own rule (an undead
  for 성광, 망자의 안식) bursts once even when it is also the Nth.
- **검기.** The crescents of one swing share one hit set (an enemy is cut once per swing by the
  wave) and chain 뇌전 once between them. Level 5's "사거리 8u" is the crescents' range; the aim
  range stays 6.5u. With 관통 (or 일섬 at its pierce stack) each crescent passes 2 more.
- **해류.** Elites are pushed 0.4u like heavies. 3단계's bump: the pushed enemy's path is swept at
  the hit (enemies ahead of it within the two radii); it takes 6 once, each enemy it runs into
  takes 6 once. 5단계's wave is a `slash`-source line of the card (credited to 해류); its hits are
  pushed 3u along the line.
- **반격 5단계.** The dash-end counter has no cooldown of its own (the dash's cooldown paces it)
  and does not start the hurt/dodge cooldown.
- **발도.** v2: the distance counts while swinging; only the charged swing spends it (v1: any
  swing reset it). 4단계's fan +60° and 5단계's circle apply to the charged swing only.
- **갑옷 파쇄.** 4단계: non-heavy elites, guardians and the demon king crack up to 3 (heavy ones
  keep 5); the per-crack multiplier applies to any cracked enemy. 5단계: "다음 베기 3번" are the
  three swings after the kill (the swing that killed does not use one); kills of heavy fodder
  (고블린 병졸) count.
- **마력 역류 5단계.** "위협·정예": role `threat` or an elite; guardians and the demon king do not.
- **망자의 안식 2단계.** Goal 120 also for a card that comes in at level 2+ (altar); a card past 120
  awakens on the level-up.
- **왕의 사냥.** The quest counts elite and floor-guardian kills (`kill` with `elite`/`guardian`),
  not the demon king. 3단계's extra shard drops before and after awakening. 5단계's ×3 is the
  first direct hit on each target (burns and chains do not use it).
- **불의 순례.** It lights with 화염's numbers when 화염 is equipped (a direct lower burn would
  replace a stronger one). 5단계's trail is a 0.4u-radius fire patch every 0.4u walked (dashes
  included), 1.5 s, 5 every 0.5 s to enemies only.
- **무결.** A hurt resets the stack and the kill count. 3단계's block: at the top stack (6, 8 at
  5단계) the blow is taken by the card (no `hurt`), stack 0 (reason `hurt`), toast
  `무결: 한 번을 막았다`. 5단계: echo at 6–7 once, at 8 twice (0.2 s and 0.4 s).
- **일섬 5단계.** 일섬 is added on a swing whose target was in the tip zone while the stack is 8
  (after that swing's +1); a too-close swing has none.

## 5. Tuning

Method: the human-like pilot of `tools/fun/lib.js` (the same as `measure.js`), mixed choice
policy, one card alone against no card (`node tests/cards/balance.js --seeds 1-24 --jobs 4`; in
a one-card hand the card reaches level 5 by the fourth choice, so this mostly measures level 5),
then the outliers again over seeds 1–48 with only their numbers changed. Dealt three-card hands
(all 18 unlocked, seeds 1–80) as a check. Every run is deterministic; the scripts re-derive every
number here.

**Changed against GDD-V2 §4.4 (level numbers only, no rule changed):**

| card | level | GDD-V2 | now | why |
|---|---|---|---|---|
| 불의 순례 `fire_pilgrimage` | 1 (awakened burst) | 12 in 1.5u | **6 in 1.0u** | the awakened burst ignites every enemy it reaches (not bound by the spread cap of 2 per tick), so in a horde each burning death lit the next ring: alone it won 14 of 24 (27 of 48), 63 % of all damage, the hero hit 0.8×/min |
| 불의 순례 | 3 (burst radius) | 2.0u | **1.3u** | the same chain |
| 불의 순례 | 4 (burst damage) | 18 | **10** | the same chain |
| 뇌전 `lightning` | 3 (chain damage) | 80 % | **70 %** | the second outlier: alone 5 of 48 wins, 64 % of damage, mean floor 5.3 |
| 뇌전 | 4 (jumps, reach) | 6 (wet 8) in 3.5u | **5 (wet 7) in 3.2u** | the same |

Effect (seeds 1–24 alone; 1–48 in brackets):

| card | wins | mean floor | card share of damage | hits taken /min |
|---|---|---|---|---|
| 불의 순례, GDD numbers | 14 / 24 (27 / 48) | 5.92 (5.88) | 63 % | 0.87 |
| 불의 순례, tuned | 2 / 24 (6 / 48) | 5.38 (5.33) | 52 % | 0.9 |
| 뇌전, GDD numbers | 3 / 24 (5 / 48) | 5.46 (5.30) | 64 % | 1.2 |
| 뇌전, tuned | 0 / 24 (0 / 48) | 5.13 (5.21) | 59 % | 1.4 |

**화염 (the designer's flag) — not changed.** Alone it wins 1 of 24 (3 of 48), mean floor 4.4
(4.6), 47 % of damage: the top of the main group (일섬 4.3, 관통 4.3, 검기 4.1, 해류 4.0), not
above it. The slice's spread cap (a burning enemy lights at most 2 others per tick, a just-lit
enemy spreads from the next tick, `src/core/24_status.js`) already took out the prototype's
runaway (GDD-V2 §3.8); the fire runaway that remained was 불의 순례's burst above, which ignites
without that cap.

**Every card after tuning** (`node tests/cards/balance.js --seeds 1-24 --jobs 4`, each card alone):

| card | wins / 24 | floor (median) | kills/min | swings/kill | card dmg % | hits/min |
|---|---|---|---|---|---|---|
| (no card) | 0 | 3 | 147.7 | 0.62 | 6.9 | 1.7 |
| 관통 pierce | 0 | 5 | 186.3 | 0.48 | 85.3 | 1.3 |
| 회전베기 whirl | 0 | 3 | 161.1 | 0.52 | 45.3 | 2.3 |
| 검기 sword_wave | 0 | 4 | 181.6 | 0.52 | 76.7 | 1.4 |
| 화염 flame | 1 | 4 | 183.8 | 0.48 | 47.3 | 2.2 |
| 뇌전 lightning | 0 | 6 | 193.1 | 0.43 | 59.2 | 1.4 |
| 해류 tide | 0 | 4 | 171.1 | 0.52 | 27.4 | 2.0 |
| 흡수 leech | 0 | 3 | 145.7 | 0.62 | 9.2 | 2.2 |
| 반격 riposte | 0 | 3 | 141.5 | 0.59 | 30.0 | 2.5 |
| 발도 drawcut | 0 | 4 | 173.1 | 0.51 | 2.5 | 1.9 |
| 성광 holy_light | 0 | 3 | 151.3 | 0.55 | 30.1 | 2.9 |
| 갑옷 파쇄 armor_break | 0 | 3 | 141.9 | 0.59 | 13.1 | 2.6 |
| 마력 역류 mana_backlash | 0 | 3 | 148.3 | 0.58 | 11.8 | 1.6 |
| 망자의 안식 rest_of_dead | 0 | 2 | 134.8 | 0.57 | 21.3 | 3.0 |
| 왕의 사냥 kings_hunt | 0 | 2 | 139.1 | 0.62 | 6.7 | 2.2 |
| 불의 순례 fire_pilgrimage | 2 | 6 | 187.1 | 0.46 | 51.9 | 0.9 |
| 연참 chain_slash | 0 | 3 | 155.3 | 0.57 | 9.3 | 2.0 |
| 무결 flawless | 1 | 3 | 153.6 | 0.58 | 27.5 | 2.3 |
| 일섬 one_flash | 2 | 4 | 184.0 | 0.48 | 49.8 | 1.7 |

(`card dmg %` counts hits whose source is not the bare blade or the dash, so flat and multiplier
cards — 발도, 연참, the target cards — show little there; read them by kills/min and floor.)

`node tools/fun/measure.js --seeds 1-12 --cards` after tuning (the engine's own report, the same
pilot; 12 seeds because it runs serially):

```
one card alone, seeds 1-12, human-like pilot (card-blind steering)

card                    wins   med floor      1F sec   kills/min multi-hit %  card dmg % card ev/min
(no card)                  0           3       149.2       151.9        72.4         5.4        48.3
armor_break                0           3       149.6       148.9        69.1        10.5          73
chain_slash                0           3       140.4       159.6        62.6         8.2       101.8
drawcut                    0           5       120.5       183.3        59.7         2.8        37.8
fire_pilgrimage            2           6       136.2       188.7          48          52       436.6
flame                      1           6       129.9       189.2        50.2        46.6       415.7
flawless                   1           4       120.9       171.7        59.7          28       165.8
holy_light                 0           3       176.2       161.7        63.4        31.6          97
kings_hunt                 0           3       144.9       140.6        74.3         4.5          33
leech                      0           3       182.7       150.9        69.1         9.3        62.6
lightning                  0           6       113.3       193.2        45.5        59.5       295.8
mana_backlash              0           3       158.8       144.8        70.6         5.9          39
one_flash                  2           5       114.6       188.2        71.3        46.1       146.7
pierce                     0           5       132.9       186.1        80.5        85.3       289.6
rest_of_dead               0           3       162.7       158.9        63.2        26.5        96.5
riposte                    0           3       156.4       143.9        64.7        27.7        74.5
sword_wave                 0           4       143.7       179.7        25.6        76.2       330.1
tide                       0           4       162.4       171.4        61.1        28.8       175.1
whirl                      0           3       123.7       164.2        79.8        45.6         186
```

**Left as they are, with the reason.** At the bottom alone are 왕의 사냥, 반격, 망자의 안식, 갑옷
파쇄, 성광 and 회전베기 (mean floor 2.6–3.0 against 3.2 for no card: a card that does little alone
costs the four choices that would have gone to boons). The target cards and 망자의 안식 work on one
floor type in four by design; 왕의 사냥 meets no elites on this branch (the director's
`eliteEvery` is the enemies agent's), so its quest can only use guardians; 반격 is paced by the
hits the hero takes (≈ 2.5 a minute in a horde) and a bigger radius did not move it (radius
3.2 / 3.8: 0 wins, mean floor 3.00 against 2.67). Re-measure these after the enemies and floors
merge. Dealt hands (seeds 1–80, before tuning): 9 wins in 80; per card the win share was 불의 순례
45 %, 뇌전 29 %, the rest 0–33 % on 6–21 hands each — too few to tune from, so used only as a check.

V13 (`--cards`: 회전베기 +20 %p of 2+-hit swings, 관통·검기 +10 %p) is a tuning target: against no
card (66.3 %) 회전베기 gives 76.6 % (+10.3), 관통 79.8 % (+13.5), 검기 24.5 % — 검기's aim range of
6.5u makes the hero swing at far targets whose only hit is the crescent, which `swing_end`'s
`hitCount` does not count.

**Run-level effect (for the §9.2 knobs, not the cards').** `tools/accept.js` on this branch: 16
pass, 0 fail, 1 pending, as on the base commit. #7 (slice gate): 17 / 20 runs reach 3F (base
20 / 20; the gate asks ≥ 10). #17 (V12, a tuning target): the human-like pilot wins 12 / 100 (base
17) and 17 runs die on 1F–2F (base 3, target ≤ 15): all 18 cards are dealt again, and a dealt hand
can now hold the cards that do little alone or off their floor (target and quest cards). The
§9.2 order (floor HP / damage multipliers first) is the place to answer it once the enemies and
floors are merged.


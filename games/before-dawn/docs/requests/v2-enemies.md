# v2 enemies — what is in, engine edits, the API for tasks, requests, tuning

Branch `v2-enemies` (enemies agent, GDD-V2 §3, §5.6, §9, §10). Owned: `src/content/enemies/`,
`src/content/bosses/`, the director mix content (`src/content/floors/*.js`, `00_rows.js`), `tests/enemies/`,
this file. Shared rules live in `src/content/enemies/00_foes.js` (`BD.foes`).

## 1. What is in

| kind | role | v2 behaviour (GDD-V2 §3.2, §3.6) | tested in |
|---|---|---|---|
| `goblin` 고블린 | fodder (beast) | 10 HP, 3.2 u/s (slower than the hero), 60° stab r 1.3 in 0.6 s after 0.5 s next to the hero; one swing of the 1F blade kills it. Guardian 고블린 족장: three goblins every 12 s, behind the rift warning | v2, melee, numbers |
| `squire` 고블린 병졸 | fodder (heavy) | goblin × 1.1 in steel, 18 HP, no front guard | numbers, rules |
| `slimelet` 새끼 슬라임 | fodder (beast) | slime × 0.6, does not split | v2, numbers |
| `husk` 굶주린 망자 | fodder (undead) | ghoul × 0.8, pale, no revive | numbers, ranged (burns) |
| `mana_slime` 마력 슬라임 | fodder (magic) | slime × 0.75 in violet, always wet | numbers |
| `slime` 슬라임 | threat (beast) | pounce, **splits into two slimelets** (still 0.3 s, no attack 0.6 s; the cap holds). Guardian 대왕 슬라임: two slimes every third pounce (six), no split | v2, melee, variants |
| `skel_archer` 해골 궁수 | threat (undead) | **holds its ground**: stops within 6u, steps back 3u at most once per 6 s when the hero is within 2u, walks again beyond 9u; line ≤ 12u. Guardian 해골 명궁: three lines, moves only inside the stairs zone | ranged |
| `ghoul` 구울 | threat (undead) | lunge, rises once (v1). Guardian 구울 폭군: rises with 50 % | melee |
| `mage` 마도사 | threat (magic) | **teleports once per life** at half HP, 4–6u from the hero inside the combat window, 0.4 s mark; waits out a bind; an elite never. Fire zone ignites enemies (burns the horde). Guardian 대마도사: three circles; teleports inside the stairs zone, cooldown 6 s | ranged, contracts |
| `dark_knight` 암흑기사 | threat (heavy, counts 2) | **its charge hits every enemy in its way once: 30 `foe` damage, thrown 1u aside, kills drop shards**. Guardian 암흑기사 단장: 7u charge + sweep (sweep only if it is still in the combat window) | v2, knight |
| `demon_king` 마왕 | boss | 3 phases (v1 skills), HP 6000; **no summon skill — the rooftop director sends the four types' fodder all fight**; **thorns and collapse hit minions for 40**; bolts ≤ 12u; a staggered bolt or ring starts only while the boss is inside the combat window | boss |
| elites | — | the dominant threat (`mix.elite`), × 1.3 size, × 1.25 damage, × 1.2 warnings, HP by floor (160 / 220 / 300 / 380, knight × 1.5), outside the caps, never recycled, edge marker (`flags.marker = 'threat'`), white saw-tooth ring; big shard 25 + flask. The director sends one every `eliteEvery` s (2F 60 · 3F 50 · 4F 45 · 5F 40; twice as often in overtime) while none it sent lives | v2, variants, numbers |
| guardians | — | appear at the stairs zone (engine), keep to the zone + 6u (archer and mage guardians to the zone); a melee guardian whose hero left the box waits at its nearest point | v2 |

Rules across kinds: threats before fodder in the attack slots (§3.5: while a threat in view waits, fodder
leave the last slot free); elites, guardians and the boss take no slot; caps per floor (melee 4/4/5/5/6, 3 on
the rooftop; ranged as tuned below); every damaging warning ≥ 0.5 s, fodder 0.6 s; no attack before 0.5 s
inside the combat window (engine, §5.6-1) — `tests/enemies/rules.test.js` checks every warning of 36 bot runs
for it, for `unseen`, and for the caps; `w.stats.unseenHits` stayed 0 in every measured run.

Presentation: variants are drawn from tinted copies of their original's sprite and strips, **baked once**
when they decode (`BD.render.tints`, recipes in `00_foes.js`); variants play their original's clips; every
enemy's walk cycle starts at its own phase; fodder never play `hurt` (white flash + 0.1u recoil) and die in a
0.18 s four-band ink scatter with 3 motes (a `die` clip is sped up to end within 0.3 s); fodder carry no type
icon, so threats keep theirs as a mark in the horde. Frames: `docs/screens/v2-enemies/`
(`node build.js && node tests/enemies/v2_screens.js`).

## 2. Engine edits (smallest additive; please keep at merge)

| file | change | why |
|---|---|---|
| `src/core/22_combat.js` | `'foe'` added to the indirect damage sources | enemy area attacks hitting enemies (§3.2) go through `combat.damage` so kills fire `kill`, drop shards and count; a source of their own keeps them apart from the hero's (no card credit, ignores the front guard) |
| `src/core/20_world.js` | `makeEnemy` copies `opts.flags` into `e.flags` | a task's marks (`keep`, `marker`, its own ids) travel through rift warnings and the spawn queue |
| `src/core/28_director.js` | elites: `eliteT` counts down (×2 in overtime); when due and no `flags.directorElite` enemy lives, the next pack's first member is `mix.elite` with `{elite: true}`; `spawnPack(…, firstOpts)` | §3.6; `eliteEvery` was in the table but unused |
| `src/core/00_base.js` | `C.ENEMY.minTelegraph` 0.45 → 0.5 | §3.5 |
| `src/core/07_anim.js` | `BD.anim.charOf(e)` = `def.variantOf` or kind; `enemyAction` resolves clips with it; fodder get no `hurt` action | variants reuse their base character's clips (assets/anim); §5.9 ⑥ |
| `src/client/34_anim.js` | tint baking (`recolour`, `bakeTints`, `lookOf`), clips by `charOf` in the variant's tint, per-enemy walk phase, fodder recoil, short fodder dissolve and die clip | §5.9 ②③④⑥, §7.1 (cheap at 100 enemies) |
| `src/client/30_render.js` | same-hue border reads the tint's hue; no type icon over fodder | readability of variants on their floors; threats stand out of the horde |

Content that sets engine constants (one place, `src/content/floors/00_rows.js`): the enemy columns of
`BD.C.DIRECTOR.floors` (hp, dmg, melee, ranged, threatEvery, threatCap, eliteEvery), the rooftop's `phases`
and `rate`, and `BD.C.GUARDIAN.hp`. **Request (lead):** fold these values into `src/core/00_base.js` at merge
and delete the file (tests read the live values, so nothing else changes).

## 3. For the floors agent (tasks, sites, pickups): kinds, flags, API

Kinds by role: fodder `goblin squire slimelet husk mana_slime`; threats `slime skel_archer ghoul mage
dark_knight`; any threat with `{elite: true}` is an elite at this floor's elite HP. Guardians are the engine's.

```js
BD.foes.spawn(w, kind, x, y, {warn, elite, dormant: {r}, flags, via})  // now (off screen) or behind the
    // 1.2 s rift warning (in view, or warn > 0); queues at 110; returns the enemy, the rift or null
BD.foes.pack(w, x, y, n, {threats, warn, dormant, flags, r})  // n of this floor's fodder (+ threats) around (x, y)
BD.foes.eliteKind(w)        // the floor's elite kind (rift: spawn(w, eliteKind(w), x, y, {elite: true, warn: 1.2}))
BD.foes.room(w)             // how many more may be made now (110 alive, rifts and queue included)
e.flags.keep = true         // never recycled, survives the floor clear (task targets, hunt leaders)
e.flags.marker = 'objective' | 'threat'   // edge marker and minimap
```

- Hunt leaders "stand until the hero is on screen": the engine's `dormant` is a radius (`{r: 12}` is about
  the screen); a `dormant: {view: true}` in `A.update` would be exact — engine request if you want it.
- Nests: give their fodder `flags: {nest: id}` through `pack`/`spawn` and kill them with `combat.kill` when the
  nest breaks (shards drop, as §5.4 says).
- Seal guards / chest guards: `BD.foes.pack(w, x, y, 6, {threats: 2, dormant: {r: 12}})`.
- `hold` (화로): the director's ×1.4 want and the four doors are director (core) changes, not content.
- Flasks from threats (4 %), halo, holy stone (§6) are yours; elites already drop their flask (engine). A holy
  stone's shockwave is hero damage: source `burst`, not `foe`.

## 4. Requests to the other agents

- **UI**: elites carry `e.elite` and `flags.marker = 'threat'` (§5.7 red skull, white on the red floor);
  fodder no longer draw a type icon (`30_render.js`) — keep it that way or say why; `hit`/`kill` events may now
  carry `source: 'foe'` (an enemy's charge or the boss's rings) — no card credit, and the kill feedback may want
  its own look; fodder hurt/death is cheap in `34_anim.js` (§7.1 numbers) — the §7.1 ink splat and `kill`
  sound are yours and stack on top.
- **Cards**: kills by `foe` damage count as kills for kill counters (chain_slash, leech, quests); nothing reads
  `foe` as a hero source.
- **Lead**: re-run the tuning after the merge (§6 below), then fold `00_rows.js` into `00_base.js`.

## 5. Tuning

Method: the human-like pilot (`tools/fun/lib.js` `makePilot`, as `tools/feel/human_bot.js`), tier 0, dealt
hands, seeds 1–100, four processes (`node <scratch>/tune.js . 1-100`: wins, deaths by floor, hits per minute,
guardian and boss fight lengths, causes); the §10.1 table with `node tools/fun/measure.js --seeds 1-20
--check`. Only HP, damage, counts and timings changed; no behaviour.

Every number changed against GDD-V2 (also in `tests/enemies/tuned.js`, pinned by `numbers.test.js`):

| number | GDD-V2 | tuned | why |
|---|---|---|---|
| slime HP / damage / pounce cooldown | 30 / 10 / 2.2 s | **45 / 14 / 1.8 s** | threats died before their first or second attack: 1.5 hits a minute, 60 % wins |
| archer HP / damage / cooldown | 20 / 8 / 2.4 s | **35 / 12 / 1.8 s** | as above |
| ghoul HP / damage / cooldown | 45 / 12 / 2.0 s | **70 / 18 / 1.6 s** | as above |
| mage HP / cooldown | 30 / 3.0 s | **50 / 2.4 s** | as above (damage 10 kept: magic floors already hurt most) |
| dark knight HP / damage / cooldown | 120 / 18 / 3.5 s | **160 / 11 / 3.0 s** | the charge was half of all deaths before the roof |
| boss cleave / bolts / thorns / collapse | 22 / 12 / 18 / 20 | **46 / 22 / 36 / 38** | the rooftop killed 1 in 9 who reached it (v1 numbers for a 13 × 13 room) |
| damage multiplier 1F…5F, rooftop | 1.0 / 1.0 / 1.15 / 1.15 / 1.3 / 1.15 | **1.3 / 1.8 / 2.2 / 2.7 / 3.1 / 1.9** | §9.2 knob ①; deaths spread over 2F–5F |
| ranged cap 2F / 4F / 5F | 2 / 3 / 3 | **3 / 4 / 4** | knob ② |
| threat interval 1F…5F | 8 / 8 / 7 / 6 / 5 s | **6 / 6 / 5 / 5 / 4 s** | knob ②: hits per minute into 1.5–4 |
| threat cap 2F…5F | 3 / 4 / 5 / 6 | **4 / 5 / 6 / 7** | as above |
| guardian HP 1F…5F | 400 / 700 / 1000 / 1300 / 1600 | **280 / 480 / 680 / 880 / 1090** | knob ③: fights took 45 s (target 25–35) |
| rooftop minions want by phase / rate | 8 / 12 / 16, 2.0/s (slice: 10 / 14 / 18, 2.6/s) | **12 / 16 / 20, 3.2/s** | the longest wait for a choice (§10.1 #12) fell in the boss fight (85–90 s) |

Unchanged from GDD-V2: fodder numbers (all five), HP multipliers by floor, melee caps, elite HP and interval,
boss HP 6000, every warning time, every shape.

Rounds (seeds 1–60 unless noted; wins / hits per minute / deaths by floor):

| round | change | wins | hits/min | deaths |
|---|---|---|---|---|
| 0 (100) | slice numbers, v2 behaviours | 60 % | 1.5 | 3F 2 · 5F 10 · 6F 28 (29 by dawn) |
| 1 | damage ×1.2–2.0, more threats | 53 % | 1.5 | 2F 1 · 3F 3 · 5F 4 · 6F 20 |
| 2 | damage ×1.3–2.6, guardian −20 % | 60 % | 1.6 | 2F 2 · 3F 6 · 4F 3 · 5F 5 · 6F 8 (knight 13 of 24) |
| 3 | threat damage up, knight down, ranged cap +1 | 60 % | 1.6 | 3F 6 · 4F 2 · 5F 1 · 6F 15 |
| 4 | threat HP up, guardian −15 % | 62 % | 1.8 | 3F 8 · 4F 5 · 5F 1 · 6F 9 |
| 5 | threat cooldowns −20 % | 55 % | 2.0 | 2F 4 · 3F 11 · 4F 4 · 5F 4 · 6F 4 (one off-screen hit: fixed, §1 boss) |
| 6 | knight 14 → 11, ghoul/archer up, boss damage up | 43 % | 1.8 | 2F 3 · 3F 10 · 4F 2 · 5F 2 · 6F 17 |
| 9 (100) | damage 4F/5F up, boss damage up | 29 % | 2.0 | 2F 7 · 3F 15 · 4F 5 · 5F 9 · 6F 35 |
| 11 (100) | rooftop minions 12/16/20 at 3.2/s, boss +10 % | **25 %** | **2.0** | **2F 7 · 3F 15 · 4F 5 · 5F 9 · 6F 39** |

Final (round 11, seeds 1–100, human-like pilot): wins 25 (20–35), deaths on 1F 0 (≤ 3), on 1F–2F 7 (≤ 15),
reached the roof 64 (≥ 45), median win 14.2 min (12.5–15.5), median death 12.8 min (≥ 6), hits per minute 2.0
(1.5–4), guardian fight 30 s (25–35), boss fight 146 s (120–150), 4 elites a run, `unseenHits` 0. Perfect bot
(`BD.simRun`): 75 wins (≥ 70). Deaths by type of floor entered: beast 1/145, heavy 9/99, undead 14/96, magic
12/104 — the beast floor stays the gentle one (one-swing goblins, the pilot reads the pounce).

`node tools/fun/measure.js --seeds 1-20 --check` (final): see the report; the misses are the slice's
(3+ in reach 18 %, "alive but none in reach" 54 % — counts off-screen enemies, 4F ÷ 1F kills 1.44 — the
director's rate, different tasks 1 — the floors agent's).

## 6. Must be re-measured after the merge

The tasks (seals, nests, hold, hunt), sites (spring +40, chest, rift elites), pickups (flask/halo/holy stone
drops) and the other cards change floor length, healing and the hero's strength, so **every row of §5 above
and the §10.1 table** must be re-run on the merged build: `node tools/fun/measure.js --seeds 1-40 --check`,
the §9.2 run (`node tools/feel/human_bot.js --seeds 1-100`, accept #17), and the guardian / boss fight
lengths. Expect healing from springs and more choices to raise the win rate: the first knobs to turn back are
the damage row (§5) and the boss's four damages.

## 7. Cost

`node tests/enemies/tick_cost.js 1200 4`: 110 live enemies of every kind (some elites) packed within 11u of
the hero on a 48 × 48 floor (107 inside the combat window), 60 hostile shots, 200 shards, hero at level 15
with whirl / flame / lightning killing ~50 a second, refilled every tick: **1.8–2.4 ms average**, p95 6–7 ms
(ticks with a burst of kills); spread within 22u: 1.2 ms. Profile: buckets, separation and status ticks
(engine) lead; `BD.foes.slot` 1 %, every behaviour ≤ 1.5 %.

## 8. Not verified

- Human hands on a real device: the frames are staged in the built game, not played.
- Tier ≥ 1 (밤의 깊이: elite interval −10 s is a progression rule, not added).
- The tuning with the other agents' content (see §6).

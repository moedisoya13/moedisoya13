# v2 UI — engine edits, requests to the other agents, notes for the lead

Branch `v2-ui` (from `claude/pensive-einstein-luyyw4` at `daa5a7e`). Owner of `src/ui/`, `tests/ui/`
and this file. Everything the player sees and hears on top of the world in v2: the growth choice
overlay, the HUD, the minimap and edge markers, the §7 feedback and its sounds and caps, the changed
screens and the v2 save. Content of the other branches (cards, boons, enemies, tasks, sites,
pickups) is read through registries, the world and events only; ids this branch has never seen fall
back (see "What the UI reads" below). Stand-ins for tests and screenshots only:
`tests/ui/fixtures/standins.js` (boons `long wide body step`, tasks `seals nests hold hunt`, sites
`seal nest brazier altar spring chest rift`, `BD.uiTest.stageSites`), never shipped.

## Engine edits made on this branch (smallest, additive)

### E1. `src/core/40_progress.js` — the v2 save (GDD-V2 §8, accept V14)

The save is a core file but its v2 format is this branch's job. Changes:

- `P.KEY = 'before-dawn.save.v2'`, `P.VERSION = 2`, `P.KEY_V1` kept for the migration; `P.FIELDS`
  gains `bestLevel`, `bestKills`; `counters.magicKills`; `codex[id].bestLevel`.
- `load()`: a v2 save loads as before; with no v2 save, a v1 save is migrated by `P.migrateV1`:
  exactly the §8 list — `unlocked`, `runs`, `wins`, `bestFloor`, `tier*`, `rerollUnlocked`,
  `settings`, `counters` (`mageKills` → `magicKills`). v1's fastest win, codex counts and history
  are not carried (a 6-minute v1 win would hold the "최단 승리" record forever). The v1 key is
  left untouched; the next store writes the v2 key. Broken fields (non-array `unlocked`,
  `history`, `tierWins`, a null `codex`) are repaired instead of throwing.
- `summary()` adds `level`, `cards[].level`, `boons`, `tasks`, `shards`, `run.magicKills`
  (= `w.stats.magicKills` when the engine counts it, else `mageKills`).
- `endRun()` keeps `bestLevel`, `bestKills` (one run's kills), `codex[id].bestLevel`, and adds
  `magicKills`; `counters.mageKills` is still summed so the current `mana_backlash` rule
  (`mageKills >= 20`) and `tests/cards/rules.test.js` keep working.
- Tested: `tests/ui/save_v2.test.js` (Node), `tests/ui/save.test.js` (browser).

### E2. `tools/accept.js` #13 — reads the v2 key

`o.v === 1` / `'before-dawn.save.v1'` → `P.VERSION` / `P.KEY`; the line now says
`key before-dawn.save.v2 written, v=2, fields = GDD-V2 §8`. Nothing else in the criterion changed.

### Not edited, taken over from the UI side

- `BD.client.offscreen.draw` (src/client/70_offscreen.js) is replaced by a no-op from
  `src/ui/42_map.js`, which draws the edge markers and the minimap itself in HUD layers (so they
  sit under the HUD boxes and follow GDD-V2 §5.7: icons, priorities, max 6, distance in u, the
  28 px band). `OS.enabled(w)` (the per-floor switch) and `BD.render.markers` sources are still
  read: a source another branch registers shows (by its `color` / `icon`, `kind: 'threat'` ranks
  with elites). If the engine prefers, ARCHITECTURE §9.4 can say "the UI draws them; OS.draw is
  the fallback".

## Requests

### R1. Engine / enemies: count magic-type kills — `w.stats.magicKills`

GDD-V2 §8 unlocks 마력 역류 at 1200 magic-type kills. `src/core/22_combat.js` counts
`mageKills` only. Smallest change: `if (e.type === 'magic') w.stats.magicKills++` next to the
`mageKills` line, and `magicKills: 0` in `src/core/20_world.js` stats. The save already sums it
when present (E1). Then the cards agent can switch `mana_backlash.unlock` to
`save.counters.magicKills >= 1200` and `tide` to `save.counters.kills >= 4000`. The codex already
shows the v2 words and progress for both (`src/ui/05_cardinfo.js`); a card def may also carry its
own `unlockText` / `unlockProgress(save) → [cur, goal]`, which wins.

### R2. Cards and boons agent

- Level text: the overlay shows `levels[n].text` as the line a level adds (set large), so keep
  each to one idea, ≤ ~40 characters (pierce/flame/leech fit in 1–3 lines on a phone). A card
  without levels shows `n단계로 오른다`.
- Boons: the overlay and pause draw glyphs for `edge long quick wide draw body step` (icons in
  `src/ui/11_glyphs.js`); any other id gets a lettered seal. `text(rank)` is shown verbatim.
- The altar in v2 (§4.6, §10.3 "모든 선택 오버레이는 w.choice로"): if it moves to `w.choice` with
  `kind: 'altar'`, the choice overlay already draws any option by `name`/`text` (title `제단`), but
  the slot step (`('choice', 'slot', s)`), `pray` and `later` need buttons — tell me the shape of
  the options (`{kind: 'swap'|'pray', id, name, text}`?) and I will add them. Until then the v1
  `altar` overlay (`w.altarOpen`) is unchanged.
- Pause shows `CI.stateLine(card)` (quest progress / combo stack) — unchanged contract.

### R3. Floors, sites, tasks and pickups agent

- Sites: `w.sites[]` as ARCHITECTURE §10.4. The UI treats `optional === false` (or kind `seal`,
  `nest`, `brazier` when `optional` is missing) as a task place (gold on the edge and minimap,
  grey once `state` is `used`), anything else as a place to visit (`?` until `known`, then its
  glyph; grey when used). States `used done dead broken dry open spent` count as used. Glyphs exist
  for `seal nest brazier altar spring chest rift`; other kinds get a seal.
- Task targets that are enemies (nests as objects, hunt chiefs): `role: 'object'` or
  `flags.marker = 'objective'` → task marker; elites: `e.elite` or `role: 'elite'` → red skull.
- Task labels: the def's `label(task)` is shown at the top centre; goals 2–6 draw as segments
  (`봉인 1/3`), others as a bar. A small-goal step also shows a banner with the label (§7.3
  `봉인 2/3`) — if the task emits its own identical banner, the message layer shows it once.
- Pickups: `pickup` with `kind: 'halo'` (gold rings, `halo` sound) and `'holy_stone'` (7u white
  ring, 0.05 s flash, `holy_stone` sound) are drawn already; the pull itself (`growth.pullAll`)
  and the shockwave are yours. Flasks are marked on the edge at HP ≤ 50.
- `site_clear` of `kind: 'brazier'` flashes the screen (the beacon); other task places get a 5u
  ring; places to visit a small one.
- Heal source `'spring'` is drawn blue like a flask (send `heal {source: 'spring'}`).

### R4. Enemies and boss agent

- Elites arriving play `elite_in` from the `spawn` event when the made enemy has `elite` or
  `role: 'elite'`; elite kills play `elite_down`, 60 ms stop and 0.2 s slow motion ×0.5.
- Guardians: the HUD bar uses `def.guardian.name`; the crown marker blinks three times toward
  `C.V2.floor.guardianAt` after `task_clear` until the guardian is made.

### R5. Lead / engine (optional, nothing waits on these)

- Slow motion (§7.1 "느린 화면") is the UI holding one frame in every 1/k (`ui.hold = 1e-6` from an
  effect's update) at speed 1 only; no tick is skipped or added. A `ui.slow = k` in the shell's
  frame loop would be smoother at 30 fps.
- `C.CAP.particles` (300) is the engine pool's; the UI keeps kill/hit motes to ≤ 1 per event above
  180 live and none above 240 (`FEEL.budget`).

## What the UI reads (and how unknown content falls back)

| thing | read from | fallback |
|---|---|---|
| choice | `w.choice {kind, options[{kind, id, name, from, to, text, pick}]}`, `w.choiceOpen` | unknown kind: name + text + seal; card without text: `n단계로 오른다`; title by kind (`level`, `chest`, `altar`, else `셋 중 하나`) |
| gauge | `w.hero.level / xp / xpNeed` | hidden when `level` is missing |
| task | `w.task`, `BD.tasks.get(kind).label` | `name value/goal` |
| sites | `w.sites[]` | see R3 |
| markers | enemies (`guardian`, `boss`, `elite`, `role`, `flags.marker`), `w.stairs`, `w.pickups`, `BD.render.markers` sources | lettered seal glyph |
| boons | `w.hero.boons`, `BD.boons` | id as name, max 3 |
| card levels | `card.level`, `BD.cardRt.maxLevel`, `levelText` | no pips for unlevelled cards |
| result | `app.lastResult` (+ the UI's run log of the same seed) | summary-only lines |

## Caps (GDD-V2 §3.7, §7)

- Sounds: crowd sounds (kill, hit, shard, slash, warnings …) play while < 8 voices sound, others
  < 12; hurt, level up, the choice, guardians, boss, endings and menus always play; while `hurt`
  sounds (0.25 s) crowd sounds wait. Plus the per-id rates: kill 8/s (±2 semitones), hit 10/s,
  shard 20/s, and the engine's 50 ms same-id rule.
- Ink marks: a pool of 150 pre-drawn splats (24 sprites), the oldest 30 fading; only guardians and
  the boss bake a permanent splat. Sound words: 10 at most, one new per 0.12 s; one 촤악! per
  0.45 s. Particles: the budget above.

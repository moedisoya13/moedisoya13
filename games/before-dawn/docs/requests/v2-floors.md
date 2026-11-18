# v2 floors — what the floors side built, the contracts it offers, what it relies on

Branch `v2-floors` (GDD-V2 §5, §6, §10.3 rules 2–4 and 7). Owned here: generation, zone fills, layouts,
tasks, sites, touch pickups (`src/core/11_gen.js` v2 part, `31_tasks.js`, `32_sites.js`, `33_pickups.js`,
`src/content/{zones,tasks,sites,pickups}/`), `tests/floors/`, the art stage tests. Everything else
touched is listed in §5 with the reason.

## 1. What exists

| | built | tested (tests/floors/) | seen (docs/screens/v2-floors/) |
|---|---|---|---|
| fills `open pillars planters aisle cubicles ring chamber island` | content/zones/fills.js | gen.test.js | overviews |
| layouts `plaza office atrium hall ruin` (+ rooftop) | content/zones/layouts.js | gen.test.js: 200 seeds each | overviews, play frames |
| tasks `purge seals nests hold hunt` | content/tasks/*.js | tasks.test.js, bot.test.js | play frames |
| sites `altar spring chest rift` + `seal nest brazier` | content/sites/*.js, tasks | sites.test.js, tasks.test.js | overviews |
| pickups `halo holy_stone` + flask supply | content/pickups/, core/33_pickups.js | pickups.test.js | — |
| bot §10.3 rules ②③④⑦ for tasks and sites | src/bot/bot.js | bot.test.js, accept #19 | play frames |

Generation per floor: task → its layout → places (`BD.gen.sitePlan`: the task's places in zones (0, 2)
(2, 0) (1, 1); four optional sites in four other zones, never the start (2, 2) or stairs (0, 0) zone; 1F
two chests instead of the rift) → fills (a zone whose centre holds a place gets no `centre` fill: no ring)
→ office zone walls → stairs → `BD.gen.checkV2` (§5.8 1–6) → 20 retries → plaza all-open with the places
kept. `BD.gen.checkRunV2(run)` is §5.8-7. Every block a fill or a wall puts is recorded and becomes one
named prop in `floor.stage.props`; every SOLID cell belongs to exactly one prop.

## 2. Contracts other agents can rely on

### 2.1 `w.sites` (art, UI, bot)

`{id (number), kind, x, y, zx, zy, phase, state, known, optional, progress, need, needExit, mem}`.
- `kind`: `altar spring chest rift seal nest brazier` (the art's site ids).
- `phase`: `idle` → `active` (in use, e.g. a rift's fight, an open altar) → `used`. **Grey a site on the
  minimap on `phase === 'used'`**, not on `state` (ARCHITECTURE §10.4 said `state` for this in the slice;
  `state` is now the look, as docs/requests/art.md asked).
- `state`: the look, always current (also inside `site_clear` listeners): altar `lit → used`, spring
  `full → dry`, chest `closed → open`, rift `available → active → spent`, seal `intact → cracked (≥ 50 %)
  → broken`, nest `alive → dead`, brazier `cold → lit` (lit from the first step into its ring).
- `known`: false = show `?` (optional sites until the hero is within 16u; the altar and task places are
  known from the start). Ring radius `BD.siteRt.ring(site)`; the arc is `progress / need`.
- The engine draws each idle site's ring and arc in `src/client/30_render.js` (colour `def.ringColor`); the
  UI may move this into its HUD layer.

### 2.2 The altar ↔ cards agent (exact call)

The altar is a site (`src/content/sites/altar.js`): one per floor, known and lit from the start, stay 0.8 s.
- **Open:** if `BD.altar.open` exists, the site calls `BD.altar.open(w, site)` and stays `active`.
  Otherwise it uses the v1 altar of `src/core/27_flow.js`: `w.altar = {state: 'lit', x: site.x, y: site.y,
  offers: [], offered: [], round: 0, step: 'choose', pick: null, needExit: false, siteId}` (kept in
  `site.mem.altar`, so a reopened altar shows the same offers), then `BD.flow.lightAltar(w)` (offers: yours)
  and `BD.flow.openAltar(w)` (`w.altarOpen`, the overlay, `altar_open`).
- **Close:** the site listens to `altar_close {choice}` — `'card'` / `'pray'` → `used` (`site_clear`);
  `'later'` → `idle` again, re-armed once the hero has left the ring — and to `choice_pick {kind: 'altar'}`
  → `used`. If the v2 altar closes without either event, call `BD.siteRt.clear(w, site)` (used) or
  `BD.siteRt.release(w, site)` (나중에). With the v1 path, `w.altar` is set back to null on close.
- Everything inside (3 offers, level inheritance, pray +30, `choice_open {kind: 'altar'}`) is yours.

### 2.3 The chest choice (cards agent, UI)

`BD.growth.open(w, 'chest')` builds its options from `BD.growth.kinds.chest(w)` (a hook added to
`29_growth.js`): one option per slot in slot order — the card `+1 level` while it can grow, else a boon in
its place, else 여명의 숨. Same option objects, overlay, `choice_open` / `choice_pick` with `kind: 'chest'`,
answered by `app.cmd('choice', 'pick', i)`. Note: `G.open` sets `lastCards` to every card shown, so the
next level choice treats all three as "offered last time" (harmless; say if you want the chest to leave
`w.lastCards` alone).

### 2.4 Task defs (UI)

`{id, name, layout, icon ('seal'|'nest'|'brazier'|'chief'), places?, goal, start?, update?, on?, label?,
wantMult?}`. Labels: `봉인 1/3`, `둥지 1/3`, `수성 24/40초`, `사냥 1/3`, `소탕 137/200` (through the existing
`BD.ui.taskLabel`). `task_progress` / `task_clear` as GDD-V2 §4.7.

### 2.5 Markers (UI)

Source `places` (`src/content/sites/markers.js`): task places gold, edge + minimap, from floor entry; the
hunt's chiefs gold; optional sites minimap only (`edge: false`), `?` until known, grey once used; the
spring (unused, known) and flasks on the edge while HP ≤ 50 (flasks `mini: false`). Each marker may carry
`icon(g, x, y, r)` (edge disc glyph) and `miniIcon(g, x, y)` (minimap glyph). Added to
`70_offscreen.js`: `edge === false` skips the edge, `mini === false` skips the minimap, `miniIcon` replaces
the dot. Restyle freely; the data fields are the contract.

### 2.6 Pickups

`BD.pickupRt.drop(w, kind, x, y, {always})`. Chance drops on a threat's death: flask 4 %, halo 2 %, holy
stone 1.5 % (`w.rng.spawn`, in that order), only while fewer than 4 / 2 / 2 of that kind lie on the floor.
Sure drops (`always`): an elite's flask (`BD.flow.dropFlask` on v2 floors), a chest's halo, a cleared rift's
holy stone. No generator flask on 1F–5F (the slice's one-per-floor is gone); the rooftop keeps its two.
Drawers: `BD.render.pickups` by kind (a kind without one draws as the flask). Bot rule ③ fetches a halo
within 8u, a holy stone only with ≥ 8 enemies within 3u.

### 2.7 Task objects (enemies agent, UI)

The nests are enemy-like bodies (`role: 'object'`, `kind: 'nest'`, `flags.keep`, `knockScale: 0`, the
floor's type) made with `BD.W.makeEnemy(w, NEST_DEF, …)` — makeEnemy now also takes a def object that is
**not** an enemy kind, so the nest is not in `BD.enemies` (no codex entry, not in staged crowds, not in a
horde mix). The hero's auto-attack takes it like any enemy. The renderer skips its sprite and its death
ghost and calls `BD.render.objects.get('nest')` (its health bar); the stage art draws the nest as the
`nest` site. Code that iterates `w.enemies` should treat `role === 'object'` as not a fighter.

### 2.8 Staged scenarios

`BD.W.scenario(w)` (tests that stage a fight: `w.scenario` or `w.wave.n = 3`) now also leaves the floor's
sites alone — a test hero standing on a zone centre must not open a chest or call a garrison. Tests of the
sites themselves set `w.sitesLive = true`.

## 3. What the floors rely on from the enemies side (call through registries only)

- `BD.director.mixes.get(domType).fodder` / `.threats` (weights) — chest guards (2 threats + 6 fodder),
  seal garrisons (a threat + two packs), nest broods (4 fodder), chiefs' packs (6 fodder), rift packs.
- `BD.places.eliteKind(w)` — the floor's elite kind: `BD.director.eliteKind(w)` **if you define it**
  (please do, when elites land), else `ghoul` on undead floors, else the mix's heaviest threat. Used by the
  hunt's chiefs, the hold's 20 s elite and the rift.
- `W.makeEnemy` / `W.spawnAt` options `elite`, `dormant: {r}`, `flags` (copied onto `e.flags`: the floors
  use `keep`, `marker`, `wake`, `target`, `chief`, `brood`, `garrison`, `rift`, `riftElite`), the `wake`
  event, `e.role` (`fodder | threat | elite | guardian | boss | object`).
- `flags.keep` exempts from recycling **and** from the floor clear's dissolve (task targets, the rift's
  own enemies, waiting guards; chest guards still waiting are removed at `floor_clear` by the chest).
- `C.DIRECTOR.floors[n].pack` (pack size), `BD.director.row(w)`, director `state === 'normal'` for the
  hold's `wantMult` hook (`src/core/28_director.js` `wanted()`).
- Elite HP and the elite table of GDD-V2 §3.6 are yours; the floors only ask for `elite: true`.

## 4. Requests

1. **Enemies:** define `BD.director.eliteKind(w)` with your elite rules; keep `flags.keep`; if the elite's
   flask moves out of `combat.kill`, call `BD.pickupRt.drop(w, 'flask', x, y, {always: true})`.
2. **Cards:** implement the v2 altar behind the contract of §2.2 (`BD.altar.open` or the v1 path);
   decide about `lastCards` after a chest (§2.3).
3. **UI:** minimap glyphs per site kind and the `?` (§2.5; mine are simple placeholders), the site ring and
   arc styling (§2.1), task icons from `def.icon`, toast/banner texts used: `봉인석이 깨졌다`, `둥지를
   부쉈다`, `화로에 불이 붙었다 — 지켜라`, `봉화가 올랐다`, `정예가 온다`, `시련 — 균열이 열렸다`,
   `시련을 넘었다 — 광휘 +1`, `상자 — 키울 성인을 고른다`, `샘 — HP +40`, `빛의 고리 — 조각 N개가
   날아온다`, `성광석 — 빛이 터진다`. vfx kinds added: `shock` (ring), `beacon` (light column).
4. **Lead:** `tests/cards/bot.test.js` runs ~1.5× slower than on the base (real layouts make the
   path checks take their slow path more often; 0.29 vs 0.19 ms per tick, profile shows no hot spot of
   the floors code).

## 5. Edits outside the floors' own files (file — change — why)

- `src/core/04_registry.js` — `BD.render.pickups`, `BD.render.objects` registries; site def validation —
  drawers for §6 pickups and task objects.
- `src/core/20_world.js` — `makeEnemy` takes a def object; `opts.flags` copied onto `e.flags` — nests
  without an enemy kind; tagging what tasks and sites spawn through rift warnings.
- `src/core/27_flow.js` — `enterFloorV2` calls `BD.pickupRt.start`; `dropFlask` on v2 floors goes
  through `BD.pickupRt.drop(…, {always})` — §6 supply.
- `src/core/28_director.js` — `wanted()` multiplies by the task def's `wantMult` — hold's × 1.4.
- `src/core/29_growth.js` — `BD.growth.kinds[kind]` options hook — the chest (as ARCHITECTURE §10.3 planned).
- `src/core/31_tasks.js` — `BD.places.wake(w)` each tick — dormant groups.
- `src/core/60_harness.js` — dump `sites[].phase`, `progress`.
- `src/client/30_render.js` — site rings and arcs; `role === 'object'` uses its object drawer; pickups
  by kind — §5.7, §6.
- `src/client/34_anim.js` — no death ghost for a task object.
- `src/client/39_sites.js` — reads `s.kind || s.id` (engine ids are numbers); a tall prop in front of a
  site turns see-through like it does for actors — art test fix, "props never hide a site".
- `src/client/70_offscreen.js` — `edge: false`, `mini: false`, `miniIcon`, `r` on markers — §5.7.
- `src/client/96_artstage.js` — the showcase's display sites go in `floor.sites`, `w.sites = []` — art
  test fix (§6).
- `src/bot/bot.js` — §10.3 rules ②③④⑦ for tasks and sites; the goal order guardian → task places →
  a rift's elite → optional sites → stairs (a wanted optional site within 10u first); the guardian, a
  chief or a nest in view is held at reach; a goal off screen pulls (shard fetches only on the way).
- `tools/fun/lib.js`, `tools/fun/measure.js` — `--task`, `--floors`, a task-by-task table.
- `tools/accept.js` — #4 also checks sites, fallbacks, §5.8-7; new #19 is V10; #11's "chain timer with
  no enemies" counts a tick only when no enemy was up at its start and end (since elites appear, an
  elite ghoul going down mid-tick was on screen when the card's timer ran — a false alarm).
- Tests: `tests/core/v2.test.js` (the generation test expects each task's layout; the site hook test
  reads `phase`, sets `w.sitesLive`), `tests/core/mechanics.test.js` (keep-out ring: seed 2 and an
  invulnerable hero — a crowd or a hit can push an idle hero into the ring; base seeds 1 and 7 show it too),
  `tests/art/stage.test.js` (§6), `tests/ui/flow.test.js` (the 2F banner names any of the five tasks — it
  expected `소탕`, the slice's only task).

## 6. The two art stage tests that failed on the base commit

- "one prop per rectangle …": the page threw `unknown site id 'undefined'` every frame. The art's showcase
  (`96_artstage.js`) wrote its display sites into `w.sites` in the art's shape (`{id: 'seal', state}`),
  which the slice's site runtime runs (it needs `kind`). Art side was wrong: the showcase now puts them in
  `floor.sites` (display only), and the art reader prefers `kind` (the engine's `id` is a number).
- "… a v1 room keeps its screen cache": since the slice every run starts on a 48 × 48 v2 floor, so the
  test's "run start = v1 room" premise no longer held. Test side was wrong: it now stages a 12 × 12 v1 room.
- The stage test also checks the generator's own floors (every layout, two seeds: all props named, the
  footprint rule) and the rooftop.

## 7. Interpretations and departures

- The hunt's middle chief stands 5u off the (1, 1) centre on both axes, beside the ruin's ring (GDD-V2
  gives the zone and the ring together); chiefs are task targets (`layout.targets`), not sites.
- Fills keep their blocks one cell inside the GDD's open 2-cell border (offsets 3..12): with office walls
  on a zone border a block at offset 2 would leave a 1-cell way (§5.8-3).
- The cap of §6 ("층에 남는 수가 찼으면 떨구지 않는다") is read as applying to the chance drops; the
  "반드시 하나" drops always come.
- The bot takes optional sites in rule ④'s order (after the task places and the guardian, before the
  stairs), except that one it wants within 10u comes first, on the way: walking back over an emptied
  floor after the clear made the screen sparse (slice gate 15.6 % > 15 %; with the detour 11.5 %). It
  also fights the guardian, a chief or a nest in view, and finishes a rift it opened.
- A staged scenario leaves sites alone (§2.8); the chest's waiting guards scatter at the floor clear with
  the rest of the horde (§5.5-4), the rift's own enemies do not (the rift still works after the clear).

## 8. Measurements (human-like pilot, `tools/fun/measure.js`)

V10 by task on 1F (`--seeds 1-10 --task <id> --floors 1`; seconds from floor entry, median):

| task | task done | guardian down ≤ 165 s | task s | guardian down s | floor s |
|---|---|---|---|---|---|
| purge | 10/10 | 10/10 | 64 | 101 | 106 |
| seals | 10/10 | 10/10 | 72 | 104 | 121 |
| nests | 10/10 | 10/10 | 75 | 114 | 123 |
| hold | 10/10 | 10/10 | 48 | 88 | 117 |
| hunt | 10/10 | 10/10 | 44 | 80 | 94 |

Whole runs, seeds 1–40 (2F–5F carry the four tasks in seeded orders):

| task | floors | task done | guardian down | ≤ budget × 1.5 | task s | guardian down s | floor s |
|---|---|---|---|---|---|---|---|
| purge (1F) | 40 | 100 % | 100 % | 100 % | 63 | 98 | 104 |
| seals | 40 | 100 % | 100 % | 83 % | 63 | 163 | 185 |
| nests | 40 | 100 % | 98 % | 75 % | 70 | 157 | 180 |
| hold | 40 | 100 % | 100 % | 90 % | 49 | 114 | 148 |
| hunt | 39 | 100 % | 100 % | 92 % | 41 | 126 | 150 |

Runs: 17/40 wins (the slice: 9/20), winning run 14.5 min (12.5–15.5 ✓), 3F 172 s (110–170, just
over), final level 26, < 3 on screen 11.5 % (≤ 15 ✓), kills/min 153, hits/min 2.0. Misses outside the
floors' reach, as in the slice: 3+ in reach 24 %, none in reach 50 %, 4F ÷ 1F 1.13 / 1.29. New misses:
median gap between choices 12.9 s (< 15: optional sites and chests count as choices) and the longest
wait 86 s (≤ 75; it falls in the guardian fights). The time after a task is mostly the guardian: its 6u
leash (§3.6) is not in yet, so 2F–5F guardians follow the hero round the floor and the fight takes
60–120 s with this pilot.

`node tools/accept.js`: 17 pass, #17 TARGET (V12: human-like pilot 42/100 wins against 20–35, 0 deaths on
1F, 1 on 1F–2F, median win 14.5 min; perfect pilot 59/100 against ≥ 70), #18 PENDING (as on the base).
#19 (V10, the shipped bot on 1F): purge, seals, nests, hold, hunt 10/10 each.

## 9. What the pictures show (docs/screens/v2-floors/, `node tests/floors/shoot.js`)

- `sheet-overview.jpg`: the five layouts read as five places with the floor colour set aside — plaza
  (open, single and big pillars, planters, fountains), office (glass walls with doors, cubicles, desk rows,
  partitions), atrium (the shaft round the island, railings), hall (the stone room round the brazier,
  server racks or bookshelves), ruin (crates, crystals, spike masses round the central ring).
- Every place stands on a clear 5 × 5 at its zone centre and none is behind a tall prop (a tall prop in
  front of a site now turns see-through). Ways are 2+ cells everywhere (§5.8-3, checked on 1 000 floors
  in the tests), so nothing traps the hero.
- In play (`sheet-play-*.jpg`), task places are gold edge markers from the start and ringed gold dots on
  the minimap; optional sites are `?` dots until near; at 667 × 375 they stay readable. A layout clash for
  the UI: an edge marker on the right side between y 150 and 274 sits under the minimap (`OS.INSET` vs
  `OS.MINIMAP` in `70_offscreen.js`).

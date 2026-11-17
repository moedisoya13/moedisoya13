# 여명 전야 — Engine architecture and extension contract

This is the contract between the engine (core) and the three agents that build on it in
parallel: **cards**, **enemies & floors**, **UI**. If you follow it, your work merges without
touching anyone else's files. Rules in `docs/GDD.md` and `docs/LEAD-DECISIONS.md` (§7 wins over
the GDD) are not repeated here; this file says *where* and *how* to put them.

Everything below is verified against the code at the commit that added this file. When the code
and this file disagree, the code is the truth and this file has a bug: say so in your
`docs/requests/<agent>.md` (see §7).

---

## 1. Layout, ownership, how it runs

```
games/before-dawn/
  build.js                    engine   node build.js → dist/before-dawn.html (dist/ is git-ignored)
  tools/                      engine   load.js (Node loader), layers.js (source discovery), sim.js,
                                       test.js, accept.js, scenarios.js
  src/core/                   engine   simulation: rng, events, registries, grid, gen, world, hero,
                                       combat, cards runtime, statuses, hazards, ai, flow, tick,
                                       progress (save), app, harness
  src/bot/                    engine   the deterministic bot (§13.1)
  src/client/                 engine   browser only: view/projection, assets, renderer, input,
                                       audio base, particle pool, shell (loop, URL params, __BD)
  src/boot.js                 engine
  src/content/cards/          CARDS    one file per card (pierce.js, chain_slash.js are references)
  src/content/enemies/        ENEMIES  one file per enemy (slime.js, goblin.js are references)
  src/content/bosses/         ENEMIES  demon_king.js (placeholder: replace it)
  src/content/rooms/          ENEMIES  room shapes and obstacle patterns (rect.js, open.js)
  src/content/floors/         ENEMIES  spawn bundles per type (beast.js)
  src/ui/                     UI       everything on screen above the world; src/ui/basic/* is the
                                       engine's bare placeholder — the UI agent owns, edits,
                                       replaces or deletes it
  tests/core/, tests/fixtures/ engine
  tests/cards/                CARDS    (create it)
  tests/enemies/              ENEMIES  (create it)
  tests/ui/                   UI       (create it)
  docs/requests/<agent>.md    each agent its own file: engine change requests (§7)
  docs/GDD.md, docs/LEAD-DECISIONS.md, assets/   read-only for everybody
```

**Read anything, edit only your directories.** In particular nobody but the engine edits
`src/core/`, `src/client/`, `src/bot/`, `tools/`, `build.js`. No shared list of files exists
anywhere: `tools/layers.js` discovers sources by directory, sorted by path, so adding a file
under your directory needs no edit to any shared file.

### Load order and the module pattern

Sources are concatenated in this order, each wrapped as `(function(BD){'use strict'; …})(BD)`:

1. `src/core/**` → 2. `src/content/**` → 3. `src/bot/**` → (browser only) 4. `src/client/**`
→ 5. `src/ui/**` → 6. `src/boot.js` (calls `BD.finalize()` and starts the shell).

Node (`tools/load.js`) evaluates 1–3 the same way, then `BD.finalize()`.

* A file is a plain script with `BD` in scope. No `import`/`require`, no globals besides `BD`.
  Top-level `const` is private to the file.
* **Register at load time; look up at run time.** Do not call `BD.enemies.get()` etc. at the top
  level of a file (the other file may load later). `finalize()` cross-checks references (bundle
  kinds exist and have the right type, sprites exist, exactly one boss, `rect`/`open` exist) and
  then freezes the sim registries.
* `get(id)` of an unknown id throws, listing the registered ids. Duplicate ids throw. Events
  that are not declared throw on `emit` and on `on`; a payload missing a declared field throws.
  Nothing is stubbed silently.
* The build refuses any source containing `http://`, `https://`, `fetch(`, `XMLHttpRequest`,
  `<script src`, `<link ` or a closing script tag (GDD §13.2-1). Don't write those strings, even
  in comments.

### Determinism (GDD §13.1) — rules for everything under src/core, src/content, src/bot

* Fixed tick 1/60 s (`BD.tick(w)`); never read wall-clock time. No `Math.random`, `Date.now`,
  `performance`, DOM, Canvas, WebAudio or `localStorage` in sim code. The client layer may.
* Randomness: `w.rng.ai` (behaviour), `w.rng.spawn` (spawn jitter), `w.rng.fx` (cosmetics only;
  the UI uses it), and for generation `BD.sub(seed, 'gen', '<name>')` which gives an independent
  stream per name (adding content to one floor does not shift another). All are mulberry32.
* Iterate arrays, not object key order, when the order matters for rules.
* `__BD.hash()` hashes the state dump without `particles` (browser-only presentation).

### Commands

```
node build.js                                   build dist/before-dawn.html
node tools/sim.js --seed 1 --bot                one headless bot run
node tools/sim.js --seeds 1-20 --hand pierce,chain_slash
node tools/sim.js --seed 3 --gen --grid         print the six generated floors
node tools/test.js [filter]                     run tests/**/*.test.js
node tools/accept.js [--only 3,7] [--skip-browser]   GDD §13.2, one line per criterion
dist/before-dawn.html?seed=123&tier=0&hand=pierce,flame,leech&floor=3&bot=1&speed=8&mute=1&nosave=1
```

`accept.js` prints PASS / FAIL / PENDING / SKIP; PENDING means the criterion needs content that is
not registered yet (it names what). Run it before you hand back; your area's PENDING lines should
become PASS when your content is in. Criterion 15's scenarios are already written in
`tools/scenarios.js` and run as soon as their ids exist.

A test file in your `tests/<area>/` exports `{ 'name': (t) => {...} }` (may be async):
`t.load({extraFiles})` gives a fresh `BD`, `t.assert`, `t.eq`, `t.near`, `t.fixture(name)`,
`t.dist` (file URL of the build). `BD.harness()` gives the §13.1 API in Node:

```js
const BD = t.load(); const H = BD.harness();
H.start({ seed: 5, hand: ['pierce'], floor: 2 });   // hand: [] = no cards; omitted = dealt by §5.6
const w = H.world(); H.killAll(); w.wave.n = 3;      // stop waves for a scenario
H.give('chain_slash', 1); H.input({ mx: 1, my: 0 }); H.step(60);
H.state(); H.hash(); H.events(20); H.sim({ seed: 1 }); H.gen(1, 0); H.setHp(30); H.goto(4);
H.cmd('altar', 'pick', 0);
```

---

## 2. The simulation in one page

`BD.createWorld({seed, tier})` builds a world `w` from `BD.gen.run(seed, tier)` (all six floors at
once). `BD.tick(w)` runs one step in this fixed order:

```
hero stats (cards' stats hooks) → hero move / dash → distance field (every 0.2 s) →
auto-attack §2.3 (may swing: ①…⑧) → timers (W.after) → enemies (knock, down/revive, stun,
behaviour update, guardian update, separation) → hazards (telegraph fills, projectiles, zones,
hitboxes) → statuses (burn ticks/spread, wet/bind timers) → rifts (warn → spawn, cap queue) →
flow (waves, trial, pickups, stay-rings) → deaths → clock & dawn drain → cleanup → `tick` event
```

The world does not advance during the altar overlay, pause/help/settings, rotate, or after the
run ended; blackout (0.6 s) and endings (win 1.5 s / death 0.8 s) stop the clock.

`BD.createApp()` wraps runs: `mode ∈ title|prep|codex|play|result`, `overlay() ∈
rotate|pause|help|settings|altar|null`. Browser and Node drive the same app.

### Useful world fields (read them; write only through the APIs below)

| field | meaning |
|---|---|
| `w.t`, `w.floorN`, `w.floor` | play time (s), floor 1..6, generated floor (`domType`, `nextDomType`, `layout`, `spawns`, `pattern`, `summon`, `summonType`) |
| `w.grid` | `w, h, get(cx,cy)` (0 floor, 1 solid, 2 void, −1 outside), `walkable`, `blocksShot` |
| `w.hero` | `x, y, r, hp, maxHp, face, aim, targetId, dashT, dashCd, invuln, dashInvuln, radiance, dead, pose, swingT, stats` |
| `w.hero.stats` | this tick's `{reach, interval, halfArc, acquireRange, acquire, dmgBase, charged, mods}` |
| `w.enemies` | enemy objects (§4.2) |
| `w.cards[0..2]` | `{id, def, slot, state:{stack, timer, progress, goal, awakened, …own}}` or null |
| `w.telegraphs, w.projectiles, w.zones, w.hitboxes, w.pickups, w.rifts` | hazards and pending spawns |
| `w.wave {n, t}`, `w.stairs {open, x, y, ringX, ringY, side}`, `w.altar {state, step, offers, pick}`, `w.trial {state}` | flow state (§3.2–3.5) |
| `w.interact {target, progress, need}` | the stay-ring the hero is filling |
| `w.stats` | run counters for the result screen |
| `w.mods` | tier modifiers (`runSec`, `flask`, …) |

### Events

All of GDD §5.2 with exactly the GDD payloads, plus these engine extras (presentation hooks; rules
must not depend on them): `strike {source, shapes, x, y, aim, elements}`, `telegraph`,
`telegraph_fire`, `projectile`, `spawn {enemyId, kind, x, y, via}`, `rift`, `pickup`, `revive`,
`stairs_open`, `guard`, `slam`, `steam`, `toast {text}`, `banner {text, kind}`, `altar_close`,
`boss_phase {phase}`, `vfx {kind, …}`. Some GDD payloads carry one extra field (`hurt.enemyId`).
Declare a new event with `BD.events.declare(name, [fields], {extra: true})` in your own file.

---

## 3. CARDS agent — `src/content/cards/`

### 3.1 Registration

```js
BD.cards.register({
  id, name, family,            // family: shape|element|trigger|target|quest|combo
  unlock,                      // 'base' | (save, runSummary) => bool  (evaluated at run end)
  desc,                        // Korean effect text (prep, pause, altar, codex)
  icon,                        // free string for the UI agent's icon drawer
  element,                     // element cards: 'tide'|'lightning'|'flame' (sets ⑤ order + stripe colour)
  targetType,                  // target cards: 'beast'|'undead'|'magic'|'heavy' (altar rule ②, HUD glow)
  maxStack,                    // combo cards (required)
  goal,                        // quest cards (required)
  init(ctx), onEquip(ctx), onUnequip(ctx),
  stats(ctx, s),               // every tick, before targeting
  shapes(ctx) -> [shape],      // ② per swing
  flat(ctx, enemy) -> number,  // ③ additive, per hit enemy
  mult(ctx, enemy) -> number,  // ③ multiplicative, per hit enemy
  onHit(ctx, enemy, hit),      // ⑤ per hit enemy (elements first, in tide→lightning→flame order)
  afterSwing(ctx),             // ⑦ (sword wave)
  on: { <event>(ev, ctx) },    // any declared event; only fires while the card is equipped
  offerable(info) -> bool,     // quest cards: altar feasibility (§5.6 ①)
  hud(state, ctx) -> {text, ring, pips, glow, badge},
});
```

Unlock functions read `save.counters.{kills, dodges, mageKills, questAwakened, comboMaxed}` and
`save.bestFloor`, already updated with the finished run; e.g. `unlock: (s) => s.bestFloor >= 3`.
The pool, the start hand (§5.6) and altar offers are computed from the registry — no id list to
edit anywhere. `offerable(info)` gets `{byType: {beast, undead, magic, heavy}, guardians, floor}`
counted over the floors after the current one (guardians included), e.g.
`offerable: (i) => i.byType.undead >= 12`.

### 3.2 The context `ctx`

`{ w, card, def, state, hero, swing }` plus helpers:
`emit(name, payload)`, `toast(text)`, `credit(amount)` (result-screen contribution; flat/mult and
shape hits are credited automatically), `after(delay, fn(w))`, `strike(spec)`, `damage(enemy,
amount, {source, direct})`, `status(enemy, name, opts)`, `knock(enemy, nx, ny, dist, {slam})`,
`heal(amount, source)`, `projectile(spec)`, `enemies()` (living), `setStack(to, reason)`,
`addProgress(n)`, `awaken()`.

`state` persists while equipped. Standard fields are dumped (`stack`, `timer`, `progress`, `goal`,
`awakened`); add your own freely. `setStack` emits `combo_change` (reasons: `gain`, `timeout`,
`hurt`, `too_close`, `swap` — anything else throws), tracks best stacks and `comboMaxed`;
unequipping a stacked combo card emits the `swap` reset for you. `addProgress` emits
`quest_progress` and, at the goal, `quest_awaken` + a banner; awakening is permanent.

### 3.3 Where each hook runs (GDD §2.3)

| step | engine | your hook |
|---|---|---|
| — every tick | `s = {reach 1.9, interval 0.6, halfArc 50, acquireRange 0, dmgBase 10+radiance, charged false, mods {}}` | `stats(ctx, s)`: change reach/interval, set `acquireRange` (6.5 for the wave), `charged` (drawcut), `mods.ignoreGuard` (armor_break; read by the dark knight), `mods.zoneImmune` (fire_pilgrimage) |
| targeting | candidates within `max(reach, acquireRange)`, LOS beyond reach, corpses last, 0.4u hysteresis | — |
| ① | `swing {aim, primaryId, primaryDist, reach, charged}` | `on.swing` |
| ② | base fan `{kind:'fan', r: reach, half: halfArc, factor 1, source 'slash'}` + your shapes; each enemy once at its best factor | `shapes(ctx)` |
| ③④ | `dmg = round((dmgBase + Σflat) × factor × Πmult × enemy defense)`, min 1, `hit` event | `flat`, `mult` |
| ⑤ | elements in order, then other `onHit` in slot order | `onHit(ctx, e, hit)` |
| ⑥ | deaths resolved (revive rules see `noRevive`, burning) → `kill` / `down` | `on.kill`, `on.down` |
| ⑦ | — | `afterSwing(ctx)` |
| ⑧ | `swing_end {hitCount, …}` | `on.swing_end` |

Shapes (`kind` + world units, relative to the swing origin and aim unless you give `x, y, dir`):
`fan {r, half(deg)}`, `line {len, width}`, `circle {r}`, `ring {r0, r1}`, each with `factor` and
`source` (one of `slash pierce whirl wave echo riposte dash` — direct — or `chain burn steam burst
slam` — indirect; anything else throws). `hit` objects in `onHit` and `ctx.swing.hits` are
`{e, factor, source, card, dmg}`. `ctx.swing` = `{id, isSwing, x, y, aim, primaryId, primaryDist,
reach, charged, dmgBase, shapes (placed), hits, data (free bag)}`.

Other APIs:
* `ctx.strike({shapes, factorScale, source, x, y, aim})` — a strike that is not a swing
  (no `swing`/`swing_end`), runs ③–⑥ including element `onHit`. Echo: `ctx.after(0.2, () =>
  ctx.strike({shapes: sw.shapes.map((s) => ({...s, source: 'echo'})), factorScale: 0.5}))`.
  Riposte: `ctx.strike({shapes: [{kind: 'circle', r: 2.6}], factorScale: 2, source: 'riposte'})`.
* `ctx.projectile({x, y, dir, speed, range, width, factor, pierce, skip: Set(ids), source:'wave'})`
  — hero projectile, blocked by obstacles, runs ③–⑥ per enemy hit (`ctx.swing.data.projectile`).
* `ctx.damage(e, amount, {source: 'chain'|'burst'|…, direct: false})` — fixed damage (no flat /
  mult; enemy defense only applies to direct hits by the enemy's own rule).
* `BD.status.apply(w, e, 'burn'|'wet'|'sunder'|'bind', {direct, dur, n, max})` — burn on a wet enemy
  becomes steam (§5.6) automatically; burn spreads 0.6u and burnt-out enemies are immune to spread
  for 2 s; `sunder` keeps `{n}` stacks; `bind` keeps `{t}` (mage behaviour reads it).
* `e.flags.noRevive = true` in `onHit` stops a revive-capable enemy from going down (§6.2 ghoul);
  set it on a corpse and it dies on the next tick.
* `ctx.hero.dashCd = 0` resets the dash (riposte). `w.lastSwing` is the latest swing.

### 3.4 Getting on screen

* **Trails**: every strike emits `strike`; the renderer draws each placed shape with the drawer
  registered for the shape's card id, else for its kind (`fan`, `line`, `circle`, `ring` exist,
  orange `#ff9a3c`, with element stripes in the equipped element colours). A card-specific trail:
  `BD.render.trails.register({ id: 'whirl', draw(g, view, shape, k /*0→1*/, trail, w) {…} })`.
  `view.proj(wx, wy, zPx)` → logical screen px.
* **Wave projectile**: `BD.render.projectiles.register({ id: 'wave', draw(g, view, p, w, t) })`
  (default: an orange streak).
* **Anything else** (lightning zigzag, white cross, gold dot to the slot): emit
  `ctx.emit('vfx', { kind: 'chain_bolt', points: [[x,y],…], life: 0.2 })` and register
  `BD.render.vfx.register({ id: 'chain_bolt', draw(g, view, ev, k, w, t) })`. A `line` vfx exists.
* **Marks on enemies/hero**: `BD.render.decor.register({ id: 'kings_hunt_mark', target: 'enemy'
  | '<kind>' | 'hero_back' | 'hero_front', draw(g, view, obj, w, box, t) })` — `box` has the
  sprite's screen `x, y (feet), top, w`. Check `BD.cardRt.has(w, 'kings_hunt')` inside.
* **Slot**: `hud(state, ctx)` → `{text: '7/12' | '×3', ring: 0..1, pips: n, glow: bool, badge}`;
  the UI agent draws it. Toasts via `ctx.toast`. Sounds are the UI agent's (map your events).
  Drawers live in your card file next to the rules; they are only ever called in the browser.

### 3.5 Worked examples

`src/content/cards/pierce.js` — shape stage:

```js
BD.cards.register({
  id: 'pierce', name: '관통', family: 'shape', unlock: 'base', icon: 'arrow',
  desc: '베기마다 조준선을 따라 길이 4.2u·폭 0.9u 찌르기를 더한다.',
  shapes(ctx) {
    return [{ kind: 'line', len: 4.2, width: 0.9, factor: 1.0, source: 'pierce' }];
  },
  hud() { return {}; },
});
```

`src/content/cards/chain_slash.js` — combo with timer, listeners and HUD:

```js
const LIMIT = 4.0;
BD.cards.register({
  id: 'chain_slash', name: '연참', family: 'combo', unlock: 'base', maxStack: 5, icon: 'chain',
  desc: '적을 처치할 때마다 스택 +1(최대 5). 스택마다 베기 피해 +2. 4초 동안 직접 타격을 못 하면 끊긴다.',
  init(ctx) { ctx.state.timer = LIMIT; },
  flat(ctx) { return 2 * ctx.state.stack; },
  on: {
    kill(ev, ctx) { ctx.setStack(ctx.state.stack + 1, 'gain'); ctx.state.timer = LIMIT; },
    hit(ev, ctx) { if (ev.direct) ctx.state.timer = LIMIT; },
    tick(ev, ctx) {
      if (ev.enemiesAlive <= 0) return;           // timer stands still in an empty room
      ctx.state.timer = Math.max(0, ctx.state.timer - ev.dt);
      if (ctx.state.timer <= 0 && ctx.state.stack > 0) {
        ctx.setStack(0, 'timeout');
        ctx.toast('연참 끊김: 4초 동안 베지 못했다');
      }
    },
  },
  hud(state) { return { text: '×' + state.stack, ring: state.timer / LIMIT }; },
});
```

### 3.6 Map of the remaining 16 cards onto the hooks

| card | hooks |
|---|---|
| whirl | `shapes`: `{kind:'circle', r: ctx.hero.stats.reach, factor: 0.7, source:'whirl'}` (fan hits keep 1.0) |
| sword_wave | `stats`: `s.acquireRange = 6.5`; `afterSwing`: `ctx.projectile({dir: sw.aim, speed:13, range: 6.5 (+0.6 if charged), width:1, factor:0.6, pierce: pierce equipped ? 3 : 1, skip: new Set(sw.hits.map(h => h.e.id))})` |
| flame | `element:'flame'`, `onHit`: `ctx.status(e, 'burn', {direct: true})` |
| lightning | `element:'lightning'`, `onHit` on the primary: chain via `ctx.damage(…, {source:'chain', direct:false})` = 60 % / 100 % of `hit.dmg`; `vfx` for the zigzag |
| tide | `element:'tide'`, `onHit`: `ctx.knock(e, nx, ny, 1.2, {slam:true})` (enemy `knockScale` gives 0.4u for heavy/guardian, 0 for the boss) + `ctx.status(e,'wet')` |
| leech | `on.kill` counter → `ctx.heal(5, 'leech')`; guardian/elite → 10; `hud.pips` |
| riposte | `on.hurt` → `ctx.after(0.15, strike ×2)`; `on.dodge` → strike ×3 now + `ctx.hero.dashCd = 0`; own 2.0 s cooldown in state |
| drawcut | `on.tick` sums `ev.moved` since the last swing; `stats`: `s.charged = ready; s.reach += 0.6`; `mult` 2.5 when `ctx.swing.charged`; reset on `swing_end` |
| holy_light | `targetType:'undead'`, `flat` +8 undead, `onHit` → `e.flags.noRevive = true` |
| armor_break | `targetType:'heavy'`, `stats` → `s.mods.ignoreGuard = true`; `onHit` heavy → `sunder {max 5}`; `mult` `1 + 0.15 × e.statuses.sunder.n` |
| mana_backlash | `targetType:'magic'`, `flat` +5 magic; `onHit` mage → `bind {dur 2.5}`; `on.kill` magic → `burst` 25 in 2.5u |
| rest_of_dead | quest, `goal:12`, `offerable`; `on.kill` undead → `addProgress(1)`; awakened: flats, `burst` 20 in 1.8u, `noRevive` |
| kings_hunt | quest, `goal:3`, `offerable: i => i.guardians >= 3`; `on.guardian_kill`; awakened `mult` 1.6, `on.kill` heal (source `kings_hunt`) |
| fire_pilgrimage | quest; count `swing_end` with `hitCount > 0`, every 4th ignite `w.lastSwing.hits`; progress on `kill.burning`; awakened `s.mods.zoneImmune`, `burst` on burning deaths |
| flawless | combo; `on.kill` (+1 when no hurt since), `on.hurt` → `setStack(0,'hurt')`; `stats` interval ×0.85 (≥2), reach +0.4 (≥4); echo at 6 (see §3.3) |
| one_flash | combo; `on.swing`: `primaryDist ≥ reach − 0.7` → +1, `< 0.7` → `'too_close'`; `shapes` adds a line at ≥4 unless `BD.cardRt.has(w,'pierce')`, 6.0 × 1.4 at 8; `flat` +stack; band decor on the hero |

---

## 4. ENEMIES & FLOORS agent — `src/content/{enemies,bosses,rooms,floors}/`

### 4.1 Registration

```js
BD.enemies.register({
  id, name, type,              // type: beast|undead|magic|heavy|boss
  sprite,                      // key of assets/sprites.json (skel_archer → 'skeleton_archer')
  hp, speed, dmg, radius, cost,// GDD §6.2 (cost not needed for the boss)
  attacks: { <attackId>: { name: '찌르기' } },   // names feed the death cause "고블린의 찌르기에"
  T: { … },                    // convention: your tuning numbers in one place
  create(e, w),                // init e.mem
  update(e, w, dt),            // behaviour; only called while active (see below)
  guardian: { name, create(e, w), update(e, w, dt) },   // presence = may be a guardian (§6.3)
  revive(e, w) -> {delay, hp, corpseHp} | null,          // goes down instead of dying (ghoul)
  defense(e, w, info) -> multiplier,                      // info {source, direct, fromX, fromY}
  onDeath(e, w),
  knockScale,                  // 1 default; heavy 0.33 (1.2u → 0.4u); guardian min 0.33; boss 0
  alwaysWet,                   // slime
});
```

`update` is **not** called while the enemy is frozen (floor entry 1.5 s), knocked back, stunned,
down, or before its rift finished; it is called during a lunge (check `e.lunge`). Set `e.state`
(dumped; the renderer squashes on `'windup'`, flattens on `'flat'`, lifts on `'jump'`).

### 4.2 The enemy object

`id, kind, def, type, x, y, r (radius × size), size, hp, maxHp, elite, guardian, boss, trial,
speed (tier-scaled), dmg (elite/guardian/tier-scaled — use it), tgScale (1, 1.2, 1.4),
knockScale, state, face (rad), mem (yours), flags, statuses {burn, wet, sunder, bind}, slot,
lunge, lunging, lastLunge {wall, t}, noAttackT, stunT, down, revives`.

Elites, guardians and tiers are applied by the engine (size, HP, damage, telegraph scale, knock,
guardian HP per floor, elite flask drop). Guardian behaviour differences: read `e.guardian` in
your `update`/`revive`, and put the extra skill in `guardian.update`.

### 4.3 Behaviour toolkit — `BD.ai`

| call | does |
|---|---|
| `canAttack(w, e)` | not frozen, not within 0.6 s of appearing, hero alive |
| `slot(w, e, 'melee'|'ranged')` / `release(w, e)` | §6.1 concurrency caps (3 / 2); guardians and the boss always get one. Release when the attack ends; death releases automatically |
| `chase(w, e, speed, dt, stopEdge)` | follow the BFS field (refreshed every 0.2 s) to `edgeDist ≤ stopEdge` |
| `goTo(w, e, x, y, speed, dt)`, `flee`, `orbit`, `keepRange(w, e, min, max, speed, dt)`, `turn(e, angle, ratePerSec, dt)` | movement |
| `move(w, e, dx, dy)` | raw move; grid collision; **keep-out** — no walking or separation brings an enemy inside edgeDist 0.8u |
| `lunge(w, e, x, y, dur, {hitbox: {r, dmg, attack}})` | the only way inside 0.8u (pounce, lunge, charge); `e.lastLunge.wall` tells if it hit a wall |
| `telegraph(w, e, spec)` | floor warning; default `dmg = e.dmg` (§4.4) |
| `projectile(w, e, {dir, speed, range, r, kind, attack})` | hostile shot from `e` (cap 60 → returns null when full) |
| `zone(w, e, {kind:'fire', x, y, r, life, tick, dmg, attack, igniteEnemies})` | lingering area |
| `hitbox(w, e, {r, dmg, attack, life, follow})` | one-shot contact damage |
| `summon(w, kinds, opts)` | spawn at the floor's rifts with the 1.2 s warning |
| `randomCell(w, minDist, maxDist)`, `dirToHero`, `dirTo`, `clearPath`, `fieldTo`, `edgeDist`, `angleToHero`, `rng(w)` | helpers |

Also: `BD.W.makeEnemy(w, kind, x, y, opts)` (now), `BD.W.spawnAt(w, kind, x, y, {warn, elite,
guardian, via})` (with warning, respects the 80 cap), `BD.W.hurtHero(w, dmg, {source, attack,
enemyId, attackId, x, y})` (dash i-frames → one `dodge` per `attackId`), `BD.W.pushHero(w, nx, ny,
dist)` (boss roar), `BD.hazards.clearTelegraphs(w, filter)`, `BD.nav.rayLen / losClear` (shots,
archer lines), `BD.W.after(w, delay, fn)` (staggered rings).

### 4.4 Telegraph spec (every damaging attack has one, ≥ 0.45 s enforced when `dmg > 0`)

```js
BD.ai.telegraph(w, e, {
  shape: 'circle' | 'fan' | 'line' | 'ring',
  x, y,                 // origin (fan/line) or centre; fixed when the telegraph starts (§6.1)
  r, dir, half,         // circle/fan (half in degrees)   line: len, width   ring: r0, r1
  time,                 // seconds to fill
  dmg,                  // applied at fill to a hero inside; 0 = warning only
  danger: true,         // warning of a later hit (arrow, charge): the bot avoids it
  attack: 'stab',       // key of def.attacks (death cause, hurt payload)
  style: 'hatch',       // drawer in BD.render.telegraphs ('hatch' red/white hatch, 'blink' dashed)
  persist: false,       // survive the owner's death (default: cancelled)
  noScale: false,       // skip elite/guardian ×1.2/×1.4 scaling of r, len, width, r0, r1
  onFire(w, tg) {},     // your continuation (jump, spawn the arrow, start the zone …)
});
```

The engine fills it from the inside out, hits at completion, emits `telegraph` / `telegraph_fire`.

### 4.5 Boss

Exactly one `type: 'boss'` enemy must be registered (finalize checks). Replace
`src/content/bosses/demon_king.js` (placeholder: HP block + `cleave`). The rooftop is built by the
engine (§7.5): boss at the centre, flasks, two rifts; `w.floor.summon` is the kind list of the
seed's summon type (3F non-dominant bundle) and `w.floor.summonType` its type. Conventions the UI
reads: `e.mem.phase` (1..3) and `def.phaseAt = [0.66, 0.33]` for the bar's ticks; emit
`boss_phase {phase}` on change. Killing the boss ends the run (engine). Roar: `BD.W.pushHero`,
`BD.hazards.clearTelegraphs(w)`.

### 4.6 Floors

```js
BD.gen.shapes.register({ id: 'notch', firstFloor: false, apply(grid, ctx) { /* set cells VOID */ } });
BD.gen.patterns.register({ id: 'pillars', firstFloor: true, apply(grid, ctx) { /* set SOLID */ } });
BD.gen.bundles.register({ id: 'undead', dom: [null, {skel_archer:5, ghoul:2}, …5F], nondom: [null, {skel_archer:2}, …] });
```

`ctx = {n (floor), rng (gen sub-stream), W, H, grid}`; `BD.CELL.{FLOOR, SOLID, VOID}`. Helpers:
`BD.gen.tryBlock(grid, rng, bw, bh, tries, gap)`, `BD.gen.canPlace(grid, cells, gap = 2)`,
`BD.gen.fill`. Bundle arrays have 6 entries (index 0 unused); `null` = "—" in §7.4; on 1F a type
can only be dominant if `dom[1]` exists. The engine does the rest: dominant order (§7.5),
size, shape/pattern choice (1F only `firstFloor` ones), §7.3 placement, §7.6 checks with 20
retries then `rect`+`open`, shuffling and 30/35/rest wave split, elites from wave 2, guardian
choice among the dominant type's kinds that declare `guardian`, trial lists, rooftop.

While only `beast` is registered, every floor is beast and `gen.run().reduced` says why; criterion
4 reports PENDING until all four bundles exist.

### 4.7 Getting on screen

The sprite (anchored at the feet, flipped by `e.face`), shadow, hit flash, elite/guardian
outline, crown, type icon, burn/wet/bind/sunder marks, the white border on a same-hue floor
(LEAD §7) and the target chevron are drawn by the engine. Add: telegraph styles
(`BD.render.telegraphs`), projectile looks by `kind` (`BD.render.projectiles`, e.g. `'arrow'`),
zone looks by `kind` (`BD.render.zones`), per-kind decor (`BD.render.decor` with `target:
'dark_knight'` for the shield spark), obstacle looks per pattern id
(`BD.render.obstacles.register({id: 'aisle', draw(g, view, cx, cy, w, t)})` — use
`BD.client.render.prism(g, view, x, y, dw, dh, hPx, top, left, right)`; guard with
`if (BD.client)` only if you call client code at load time — inside `draw` it always exists),
and `vfx` events.

### 4.8 Worked example — `src/content/enemies/goblin.js` (abridged; read the file)

```js
BD.enemies.register({
  id: 'goblin', name: '고블린', type: 'beast', sprite: 'goblin',
  hp: 20, speed: 4.5, dmg: 6, radius: 0.35, cost: 1,
  attacks: { stab: { name: '찌르기' } },
  T: { range: 1.0, half: 30, tgR: 1.3, tgTime: 0.45, backDist: 1.2, backTime: 0.3, cd: 1.6, ring: 0.95, chaseFar: 3.0 },
  guardian: {
    name: '고블린 족장',
    create(e) { e.mem.summonT = 12; },
    update(e, w, dt) { if ((e.mem.summonT -= dt) <= 0) { e.mem.summonT = 12; A.summon(w, ['goblin', 'goblin', 'goblin']); } },
  },
  create(e, w) { e.mem.cd = A.rng(w).range(0, 1); },
  update(e, w, dt) {
    const m = e.mem, T = e.def.T;
    m.cd -= dt;
    if (m.backT > 0) { m.backT -= dt; A.flee(w, e, T.backDist / T.backTime, dt); if (m.backT <= 0) A.release(w, e); return; }
    if (m.windup) return;
    if (A.canAttack(w, e) && m.cd <= 0 && A.edgeDist(w, e) <= T.range && A.slot(w, e, 'melee')) {
      m.windup = true; e.state = 'windup';
      const dir = A.angleToHero(w, e); e.face = dir;
      A.telegraph(w, e, { shape: 'fan', x: e.x, y: e.y, dir, half: T.half, r: T.tgR, time: T.tgTime, attack: 'stab',
        onFire() { m.windup = false; m.backT = T.backTime; m.cd = T.cd; } });
      return;
    }
    /* … surround movement … */
  },
});
```

`slime.js` shows hops, a circle telegraph + `lunge`, landing stun, guardian summons, `alwaysWet`.
`src/content/floors/beast.js` is the bundle example, `rooms/rect.js` / `rooms/open.js` the
shape/pattern examples.

---

## 5. UI agent — `src/ui/`

### 5.1 Registries (browser only, defined in `src/client/00_ui_registry.js`)

```js
BD.ui.screens.register({ id: 'title'|'prep'|'codex'|'play'|'result', draw(g, ui), pointer?(ev, ui), key?(ev, ui) -> bool });
BD.ui.overlays.register({ id: 'pause'|'altar'|'rotate'|'help'|'settings', draw(g, ui), pointer?(ev, ui), key?(ev, ui) -> bool });
// pointer(ev = {type: 'down'|'move'|'up', x, y, id}) gets presses that no ui.button() took; return true to claim
// the pointer (it then never becomes the joystick). key(ev) gets keydown first; return true to consume.
BD.ui.hud.register({ id, order, draw(g, ui) });                 // mode 'play', above the world
BD.ui.effects.register({ id, reset?(ui, w), on?: { <event>(ev, ui) }, update?(dt, ui), draw?(g, ui, layer) });
BD.ui.sfx.register({ id, play(ac, dest, opts) });              // WebAudio synth (GDD §10 ids)
```

A mode or overlay that is entered without a registered screen throws — `title`, `result`,
`pause`, `altar`, `rotate` must always exist; `prep`, `codex`, `help`, `settings` once you enter
them. Draw order per frame: world (mode play) → HUD layers by `order` → screen of the mode →
overlay → effects layer `'screen'`. Effects also get `'floor'` (under actors) and `'world'` (over
actors) layers. `on` handlers are subscribed to each new world's bus (`reset` runs first).

### 5.2 The `ui` object

`app, world (getter), view, g, time (real s), dt, camera {x, y}` (world offset — screen shake),
`fx` (particle pool: `ui.fx.emit({x, y, z, vx, vy, vz, g, life, color, size, shape: 'dot'|'text',
text, layer, screen})`, capped at 300, oldest dropped), `render` (`bake(fn(g, view))` paints on
this floor's permanent decal layer — ink splats; `prism`, `ellipse`, `sprite`, `typeIcon`,
`ELEMENT_COLORS`), `assets` (`img[id]`, `white[id]`), `button({x, y, w, h, label, onTap, onPress,
menu, style: 'primary'|'plain'|'none', size})` (declares a hit area this frame; `menu` buttons get
arrow/Enter/1–9 focus), `text(str, x, y, {size, color, align, base, weight, stroke, maxW})`,
`sfx(id)` (throws on unknown), `sfxSafe(id)`, `startRun(opts)` (URL params + opts), `focus`.
`view.proj(wx, wy, z)`, `view.toLogical(clientX, clientY)`. Logical canvas 1280 × 720.

### 5.3 The app (DOM-free; `ui.app`)

`mode`, `overlay()`, `setMode(m)`, `openOverlay('pause'|'help'|'settings')`, `closeOverlay()`,
`startRun({seed, tier, hand, floor, rerolls})`, `newSeed()`, `retry(sameSeed)`, `toTitle()`,
`pause()`, `resume()`, `giveUp()`, `cmd('altar', 'pick'|'back'|'slot'|'pray'|'later', arg)`,
`save` (GDD §11 object), `setSettings(patch)` (writes the save), `lastResult` (below),
`params` (URL), `botOn`. Prep: pick `seed = app.newSeed()`, show
`BD.cardRt.dealHand(seed, app.save.unlocked, rerolls)`, then `startRun({seed, tier, rerolls})`.

`lastResult = {result: 'win'|'death', cause, causeText ('구울의 달려들기에'), floor, sec, clock,
kills, trials, trialSec, dodges, hurts, cards: [{id, name, progress, goal, awakened, stack,
bestStack, contrib}], topDamage: [{key, dmg, text}], unlocks: [{kind: 'card'|'tier'|'reroll', id,
name}], seed, tier}`. Save logic (fields, unlocks, history, codex counters) is in
`src/core/40_progress.js`; you build the screens on `app.save`.

### 5.4 What to read for the HUD

Hero HP/radiance/dashCd, `BD.flow.clockStr(w)`, `BD.flow.clockMin(w)`, `w.mods.runSec`,
`w.floorN`, `w.floor.domType/nextDomType`, `w.wave.n`, `w.trial.state`, the living guardian/boss
(`e.guardian || e.boss`, `def.guardian.name`, `e.mem.phase`), `w.cards[i].def` + `def.hud(state,
ctx)` (`BD.cardRt.ctx(w, card)`), `def.targetType` vs `w.floor.domType`, `w.interact`. Toasts
and banners arrive as `toast` / `banner` events. Settings live in `app.save.settings`
(`sfx, shake, dashSide, hints`).

### 5.5 Getting on screen / sound

* Hit sparks, onomatopoeia, ink splats: an effect listening to `hit` / `kill` (see
  `src/ui/basic/effects.js`).
* Cape (length = combo stacks), gold rings, awaken glow on the hero: `BD.render.decor` with
  `target: 'hero_back'` / `'hero_front'`.
* Dawn edge glow, flashes: effects `draw` on layer `'screen'`. The sky already brightens from 03:00.
* Sound: `BD.ui.sfx.register({id: 'slash', play(ac, dest, opts) {…}})`, then play from an effect:
  `on: { swing(ev, ui) { ui.sfx('slash'); } }`. The AudioContext is created on the first input;
  `?mute=1` mutes; same id within 50 ms is skipped.
* The dash button is declared by the HUD: `ui.button({…, style: 'none', onPress: () => {
  BD.client.input.st.dashReq = true; }})`; card slots and the Ⅱ button call `app.pause()`.
  Touch on any declared button never becomes the joystick.

---

## 6. Things the GDD asks for that the registries do not fully cover, and decisions taken

* **Burn spreading is a status rule in the engine**, not a flame-card rule: any burning enemy
  spreads (mage fire zones included). GDD §5.3 puts it under 화염; §6.1/§5.4 make zone fire
  "the same burn", so one rule.
* **Criterion 9 "1.0초에 바뀐다"**: `floor_exit` fires at exactly 1.0 s on the ring; the dumped
  `floor` changes 0.6 s later (the §3.2 blackout). accept.js checks the 1.0 s `floor_exit`.
* **`?floor=N`** starts on floor N with radiance N−1 (as if the guardians below were killed).
* **Altar offers** depend on the hand when the altar lights, so `__BD.gen()` returns
  `altarPreview` computed against the starting hand; real offers come from
  `BD.sub(seed, 'gen', 'altar<floor>/<round>')`.
* **Win slow motion (1.5 s)**: the sim freezes for 1.5 s (`w.ending`); the slow-motion look is
  the renderer's/UI's.
* **Enemy contact pushing**: the hero collides with enemy circles (cannot pass, slides); enemies
  never push the hero; hurt knock 0.5u pushes the hero.
* **Dodge with projectiles**: a dash through an arrow emits one `dodge` and the arrow flies on.
* **Telegraphs of dead owners are cancelled** unless `persist: true`.
* **Particles** live in the browser pool; the state dump's `particles` mirrors its size and is
  excluded from `hash()` (Node has none).
* **`hand` URL/API with unknown ids throws** (fail loudly) rather than skipping.
* **Not provided by the engine** (yours to add if you want them): per-card sounds, the first-run
  hint system (`settings.hints`), 다시 뽑기 counting per run on the prep screen, codex layouts,
  the boss HP ticks drawing, rotate-overlay art, the shake setting (apply `ui.camera`).
* The bare HUD/screens/overlays in `src/ui/basic/` are placeholders and not to GDD §9 layout
  quality; the UI agent replaces them.

## 7. When you need an engine change

Do not edit engine files. Write what you need, why, and the smallest API that would serve it in
**your own** `docs/requests/<cards|enemies|ui>.md` (one file per agent, so no merge conflict),
and work around it in your directory meanwhile if you can. The lead merges the requests into an
engine change.

## 8. Before you hand back

`node build.js && node tools/test.js && node tools/accept.js` — no FAIL; your PENDING lines turned
PASS where your content completes them; open `dist/before-dawn.html` and look at your work.

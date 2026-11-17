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
  src/client/                 engine   browser only: view/projection, follow camera, assets, renderer
                                       (+ big-floor chunks, character animation), input, audio base,
                                       particle pool, off-screen markers/minimap, clip viewer, shell
                                       (loop, URL params, __BD)  — v2 APIs: §9
  src/boot.js                 engine
  src/content/cards/          CARDS    one file per card (pierce.js, chain_slash.js are references)
  src/content/enemies/        ENEMIES  one file per enemy (slime.js, goblin.js are references)
  src/content/bosses/         ENEMIES  demon_king.js (placeholder: replace it)
  src/content/rooms/          ENEMIES  room shapes and obstacle patterns (rect.js, open.js)
  src/content/floors/         ENEMIES  spawn bundles per type (beast.js) + v2 horde mixes (§10.2)
  src/content/boons/          v2       단련 (edge, quick, draw; §10.3)
  src/content/tasks/          v2       floor tasks (purge; §10.4)
  src/content/zones/          v2       zone fills and floor layouts (open, pillars, plaza; §10.4)
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
node build.js [--placeholders]                  build dist/before-dawn.html (+ assets/anim/_placeholder strips)
node tools/sim.js --seed 1 --bot                one headless bot run
node tools/sim.js --seeds 1-20 --hand pierce,chain_slash
node tools/sim.js --seed 3 --gen --grid         print the six generated floors
node tools/test.js [filter]                     run tests/**/*.test.js
node tools/accept.js [--only 3,7] [--skip-browser]   GDD §13.2, one line per criterion
dist/before-dawn.html?seed=123&tier=0&hand=pierce,flame,leech&floor=3&bot=1&speed=8&mute=1&nosave=1
dist/before-dawn.html?anim=1   (or ?anim=goblin)  every animation clip of every character (§9.5)
__BD.stage({size: [48, 48], enemies: 150})       a big floor with a crowd, in the page or H.stage() in Node (§9.6)
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
// events: [{event: 'hit', type: 'undead', …}]  (ev.event = name, §2);  killAll() emits kill events
H.cmd('altar', 'pick', 0);
// H.sim({seed, tier, hand, maxSec, bot, trial, floor, unlocked: [ids], hashAt: [sec]}) → {result, floor, sec, kills, cards, events, hashes}
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
| `w.hero` | `x, y, r, hp, maxHp, face, aim, targetId, dashT, dashCd, dashBuf, invuln, dashInvuln, radiance, dead, pose, swingT, moveX, moveY, stats` |
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
must not depend on them): `strike {source, shapes, x, y, aim, elements}`, `telegraph {id, shape,
ownerId, ownerKind, attack, time, style}`, `telegraph_fire {id, attack, ownerId, ownerKind}`,
`projectile`, `spawn {enemyId, kind, x, y, via}`, `rift`, `pickup`, `revive`, `stairs_open`,
`guard`, `slam`, `steam`, `toast {text}`, `banner {text, kind}`, `altar_close`, `boss_phase
{phase}`, `vfx {kind, …}`. Some GDD payloads carry one extra field (`hurt.enemyId`).
Declare a new event with `BD.events.declare(name, [fields], {extra: true})` in your own file.

**The event name is `ev.event`.** `emit` stamps it on every payload (and on the `__BD.events()` /
`bus.recent()` log), so filter with `x.event === 'hit'`. `type` is never touched: in `hit` and
`kill` it is the GDD §5.2 enemy type (`beast|undead|magic|heavy|boss`). `event` is a reserved
payload key (declaring it throws).

Banners the engine emits (`banner.kind`): `floor` (`3F — 중갑`), `guardian` (`수호자 — <guardian
name>` when a guardian appears, GDD §9.2), `awaken`, `stairs`, `boss` (phase change, from the boss
file), `trial` (`시련 — 균열이 열렸다`), `trial_clear` (`시련을 넘었다 — 제단이 다시 켜졌다`).

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
* **Slot geometry** is the engine's: `BD.slotRect(i)` → `{x, y, w, h}` (logical px, from
  `BD.C.SLOTS`), `BD.slotCenter(i)` → `[x, y]` — fly the quest dot there; the UI draws the slots there.
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
  attacks: { <attackId>: { name: '찌르기', sfx, sfxStart } }, // names feed the death cause "고블린의 찌르기에";
                               // sfx / sfxStart (optional): BD.ui.sfx ids played when the blow lands
                               // (telegraph_fire) / when its warning starts (telegraph)
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
guardian HP per floor, elite flask drop). Guardian HP per floor is `BD.C.GUARDIAN.hp` (the tuned
row 480 / 660 / 840 / 1020 / 1200, GDD ×3); `guardian.create` is for behaviour state only. Guardian behaviour differences: read `e.guardian` in
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
| `inView(w, x, y, pad)`, `seen(w, e)` | is the point (circle of `pad` u) / the enemy inside the view every client shows this tick — the "nothing hits from off screen" hook for big floors (§9.2). Always true in v1 rooms |

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
Telegraph drawers run clipped to the floor cells (`BD.client.render.clipFloor`), so a warning that
reaches past the floor edge (the boss's collapse ring) never paints the facade. The bot treats
every `danger` telegraph, every damaging zone and every hostile projectile in flight (as a line
over the next 0.6 s of its path) as danger.

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

`ctx = {n (floor), rng (gen sub-stream), W, H, grid}`; `BD.CELL.{FLOOR, SOLID, VOID}`. Shapes and
patterns must work at any size: floors larger than the screen come from a floor plan (§9.3). Helpers:
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
'dark_knight'` for the shield spark) and `vfx` events. Obstacles are drawn by the stage's prop
catalogue (§10): name a look with `floor.stage.props` or let the shape choose it;
`BD.render.obstacles` drawers are no longer called. Frame animation per kind comes from `assets/anim/manifest.json` (§9.5); a
behaviour only has to keep `e.state = 'windup'` and its telegraphs honest — the attack clip's
wind-up follows the telegraph's fill and the strike frame lands when it fires. Flag anything the
player must find with `e.flags.marker = 'objective' | 'threat'` (§9.4).

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
text, layer, screen})`, capped at 300, oldest dropped), `hold` (hit-stop: seconds the frame loop
holds the world, counted down in real time; no tick is skipped or added; `__BD.step` ignores it),
`isFocused(b)` (a menu button's keyboard focus, from the last frame's complete menu list — the
list arrows/Enter act on), `render` (`floorPath(w, v)` / `clipFloor(g, v, w)`, `bake(fn(g, view))` paints on
this floor's permanent decal layer — ink splats; `prism`, `ellipse`, `sprite`, `typeIcon`,
`ELEMENT_COLORS`), `assets` (`img[id]`, `white[id]`), `button({x, y, w, h, label, onTap, onPress,
menu, style: 'primary'|'plain'|'none', size})` (declares a hit area this frame; `menu` buttons get
arrow/Enter/1–9 focus), `text(str, x, y, {size, color, align, base, weight, stroke, maxW})`,
`sfx(id)` (throws on unknown), `sfxSafe(id)`, `startRun(opts)` (URL params + opts), `focus`.
`view.proj(wx, wy, z)`, `view.toLogical(clientX, clientY)`, `view.toWorld(lx, ly)`,
`view.clientToWorld(cx, cy)`, `view.onScreen(x, y, margin)`, `view.worldOnScreen(wx, wy, margin)`.
Logical canvas 1280 × 720. `view.proj` includes the follow camera (§9.1): world-anchored UI drawn
through it follows the camera by itself; `ui.camera` is only the screen-shake offset.

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
and banners arrive as `toast` / `banner` events (guardian and trial banners included, §2). Settings live in `app.save.settings`
(`sfx, shake, dashSide, hints`).

### 5.5 Getting on screen / sound

* Hit sparks, onomatopoeia, ink splats: an effect listening to `hit` / `kill` (see
  `src/ui/basic/effects.js`).
* Cape (length = combo stacks), gold rings, awaken glow on the hero: `BD.render.decor` with
  `target: 'hero_back'` / `'hero_front'`.
* Dawn edge glow, flashes: effects `draw` on layer `'screen'`. From 03:00 to 06:00 the engine
  brightens the sky and cross-fades the far skyline to its dawn look (lighter silhouettes, windows
  going out) (`R.dawnK(w)` 0→1).
* Sound: `BD.ui.sfx.register({id: 'slash', play(ac, dest, opts) {…}})`, then play from an effect:
  `on: { swing(ev, ui) { ui.sfx('slash'); } }`. The AudioContext is created on the first input
  and resumed on touchend/click and before every sound (iOS);
  `?mute=1` mutes; same id within 50 ms is skipped.
* The dash button is declared by the HUD: `ui.button({…, style: 'none', onPress: () => {
  BD.client.input.st.dashReq = true; }})`; card slots and the Ⅱ button call `app.pause()`.
  Touch on any declared button never becomes the joystick. The stick's sizes are CSS px
  (`BD.client.input.SIZES`: dead 8, full 48, follow 64, double tap within 60 px and 250 ms);
  `BD.client.input.clearDash()` drops a pending dash and the double-tap timer (the shell calls it
  while an overlay is open). `BD.ui.dashSize(ui)` / `BD.ui.dashCenter(ui)` give the dash button's
  phone-aware size and centre (docs/CONTROLS-REVIEW.md §3.7).

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
* **Enemy contact pushing** (GDD §2.2 as changed by `docs/CONTROLS-REVIEW.md` §3.5, LEAD §7): a
  walking hero shoves every overlapping regular enemy sideways off his line (`C.HERO.shoveShare`
  of the overlap, at most `shoveSpeed × speed` per second, through `nav.move`; an enemy that a
  wall would slide toward him stays put), then is pushed out of what remains (circle collision,
  slides). Guardians, the boss and lunging enemies are solid. Walking into an obstacle gets corner
  assist (`C.CORNER`, probes along the blocking cell face). Enemies never push the hero; hurt
  knock 0.5u pushes the hero. A dash passes through enemies.
* **Dash input**: `w.input.dash` is a press, kept `C.DASH.buffer` (0.2 s) in `hero.dashBuf` and
  fired on the first tick a dash is possible; dropped on floor entry, death and altar opening.
  With no movement input the dash goes along `hero.moveX/moveY` (the last walk). The hero faces
  his target every tick he has one (`hero.faceHold` keeps the face 0.25 s after it is gone).
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

---

## 9. v2 engine: floors larger than the screen, the camera, off-screen awareness, animation

> **Changed by the v2 proof slice (§10):** the camera centre is now simulation state (`w.cam`,
> GDD-V2 §5.6). The client no longer eases a camera of its own — it draws `BD.view.focusOf(w)` —
> so §9.1's follow/slack and §9.2's "hero-centred view inset by the slack" are replaced by §10.1.
> The floor-plan hook of §9.3 sizes only the v1 room generator (`gen.run(…, {v1: true})`,
> `BD.stageFloor`); v2 runs build their floors with `BD.gen.floorV2`.

Added for v2 (docs/V2-DIRECTION.md). Nothing here changes v1 rooms: every v1 room fits the
screen, so its camera stands still exactly where it stood (pixel-equal static layer and clip), the
view rectangle covers the whole room, markers and minimap are off, and bot hashes for the same
seeds are unchanged. What v1 rooms do get: sprites breathe, bounce and lunge, and deaths dissolve.

### 9.1 Camera and mapping (client)

The renderer places the world through `view.rox / view.roy`, set every frame by
`BD.client.camera.update(ui, dt)` (src/client/15_camera.js). Everything drawn with `view.proj`
— renderer, card/enemy drawers, UI effects, particles — follows it; `view.toWorld(lx, ly)` and
`view.clientToWorld(cx, cy)` go back (through the forced-landscape quarter turn too). Per axis:
if the floor's projected box plus `C.CAM.fit` margins fits 1280 × 720 the camera stands still with
the room centred; otherwise it eases toward the hero (`C.CAM.follow` s) plus a look-ahead along the
walk or dash (`C.CAM.lookahead` u, eased over `lookTime`), never lags or leads by more than
`C.CAM.slack` px, and is clamped to the floor box plus `C.CAM.frame` margins (room for the HUD bars
and the card tray). It snaps on a new floor; `BD.client.camera.snap()` after a teleport.
Everything is in logical px, so it is the same on every screen size and in forced landscape.

Drawing on a big floor: only what is near the screen is drawn (`R.actorOn(v, x, y, scale)`,
`R.flatOn(v, x, y, r)` are the engine's culling tests — use them in a drawer that loops over many
things). The static layer is painted lazily in 512 px chunks; `R.bake(fn)` decals go into one
floor-wide canvas (≤ 4.2 M px, so slightly softer on very large floors) and `R.clipFloor(g, v, w)`
works with any view, the bake view included. Shadows use `R.shadow(g, v, x, y, r, alpha)`.

### 9.2 The view rectangle — "nothing hits from off screen" (simulation, deterministic)

`src/core/05_view.js`. The camera math is pure, so the simulation knows what every client shows
without asking any device: the hero-centred (clamped) view inset by the camera's slack.

```js
BD.view.inView(w, x, y, pad)  // the circle of radius pad u at (x, y) is on every screen this tick
BD.ai.inView(w, x, y, pad)    // same, for behaviours;  BD.ai.seen(w, e) = inView(w, e.x, e.y, e.r)
BD.view.rect(w, pad)          // {x0, x1, y0, y1} in map px;  BD.view.corners(w, pad) → 4 world points
BD.view.map(x, y) / unmap(mx, my)   // map px: mx = (x − y)·40, my = (x + y)·20 (1u ≈ 57 px across)
BD.view.frame(grid), fits(grid), focus(grid, mx, my)   // what the camera does (the client uses these)
```

`pad > 0` keeps a margin inside the edge (the HUD covers ~90 px at the top and the card tray the
bottom 110 px: about 2u and 3u), `pad < 0` accepts points just outside. Use it in a behaviour,
e.g. `if (!A.seen(w, e)) { A.chase(…); return; }` before starting a telegraph, or in a spawn rule.
It is a query, not a rule: the designer decides where it applies. Tests: tests/core/view.test.js
(it holds for any camera lag within the slack).

### 9.3 Generating big floors

```js
BD.gen.plans.register({                  // at most one plan; floors 1–5
  id: 'v2',
  size(n, ctx) { return n === 1 ? null : [48, 48]; },   // null = the GDD §7 size (and rng draw)
  offscreen(n) { return { indicators: true, minimap: true }; },   // optional, per floor (§9.4)
});
BD.gen.floor(seed, tier, n, dom, next, { size: [W, H] });  BD.gen.run(seed, tier, { sizes: { 3: [64, 40] } });
```

`ctx = {seed, tier, domType, rng}` (rng is its own sub-stream `plan<n>`). Sides are integers in
`C.GEN_SIZE` (8..128; others throw). Unsized floors draw the same rng as before, so existing
seeds generate identically (600 seed/tier runs compared). All §7.6 checks hold at any size (one
BFS per try; a 96×96 floor generates in < 15 ms). The §7.3 placement itself (start corner, three
rifts, one altar, door on a back wall) is still v1's: places scattered over a big floor are yours
to add. Shapes and patterns place a fixed number of blocks, so a big floor is mostly open until
patterns scale with the room. The rooftop stays 13 × 13.

Simulation at scale: the distance field is one BFS per 0.2 s (2 304 cells at 48×48), separation and
burn spread use position buckets (same pair order, same results), `clearPath` has an exact fast
path, the per-target field cache keeps 64 targets, long rays are no longer capped at 256 steps.
`C.CAP.enemies` (80, spawnAt's queue) is still v1's number: raise it when the design needs it.
Measured at 48×48 with 150 live enemies converging on a walking hero: ~0.9–1.7 ms per tick in Node.

### 9.4 Off-screen awareness (client, switchable per floor)

Edge-of-screen markers and a minimap, src/client/70_offscreen.js. On per floor:
`w.floor.offscreen = {indicators, minimap}` (from the floor plan) wins, else `C.OFFSCREEN`
(`'auto'` = on when the floor does not fit the screen — never in a v1 room).

```js
e.flags.marker = 'threat' | 'objective'          // any enemy (or pickup.marker): shown when off screen
BD.render.markers.register({ id, collect(w, out) { out.push({ x, y, kind: 'objective', color, icon(g, x, y, r) }); } })
BD.client.offscreen.INSET = { x0, y0, x1, y1 }   // where markers may sit (clear of the v1 HUD)
BD.client.offscreen.MINIMAP = { x, y, w, h }     // default under the floor box, top right
BD.client.offscreen.drawIndicators(g, ui, rect) / drawMinimap(g, ui, rect) / markers(w) / enabled(w)
```

Built-in sources: guardians and the boss are threats; a lit altar, open stairs and an available
trial are objectives. Threats sort first, nearest first, at most `MAX` (12). The minimap is the
floor in the screen's own isometric orientation with enemies, markers, the hero and the screen
frame. The UI agent may move them (INSET, MINIMAP) or draw them itself in a HUD layer.

### 9.5 Character animation

Contract: assets/anim/README.md. `node build.js` embeds the strips named in
`assets/anim/manifest.json` (`--placeholders` adds `_placeholder/` ones) and refuses a wrong clip
name, a missing field, a `strike` outside the clip, or a strip whose pixel size is not
`frames × fw` by `fh`. Strips decode after the sprites; a clip falls back until its strip is ready.

Which clip (src/core/07_anim.js, pure; tests/core/anim.test.js):

| state | action |
|---|---|
| enemy: a telegraph of its own is filling | `attack`, frames 0..strike follow the fill (1 − remain/total) |
| enemy: its telegraph fired < follow-through ago | `attack`, frames strike..last over the clip's own time (≤ 0.8 s) |
| enemy: hit < 0.22 s ago / down (ghoul) / killed | `hurt` / `die` held on its last frame / `die` on its ghost |
| hero: < wind s before his swing, target held | `attack_<dir>` frames 0..strike — the strike frame is drawn on the swing's tick |
| hero: after the swing | follow-through; wind + follow fit `stats.interval` (0.6 s: ~0.24 + 0.36 s) |
| hero: dash / hurt pose / dead | `dash_side` / `hurt` / `hurt` (falls) |
| measured walking speed > 0.45 u/s | `move` (cycle speed × speed / own speed, 0.55–1.5) else `idle` |

Fallback chain when a clip is missing: (1) exact, (2) the action's `_side` clip, (3) hero dash
and hurt: v1's dedicated static pose (`hero_dash`, `hero_hurt`) — not the run cycle the README's
step 3 would give, (4) the clip of how the body moves (`move` / `idle`) with the action's code
motion on top, (5) the static sprite with code motion: breathing (idle), walking bounce (move),
lean-and-lunge (attack), shake (hurt), ink dissolve (death). A standing body with no idle clip
uses the static sprite breathing (move's frame 0 is mid-stride; `BD.anim.IDLE_HOLDS_MOVE = true`
holds it instead). Frames are scaled so `charH` equals the static sprite's on-screen height ×
size, mirrored for left, outlined (elite/guardian/same-hue) and hit-flashed like the static
sprite. A killed enemy leaves a client ghost for its `die` clip (+0.15 s fade) or the 0.7 s ink
dissolve with ink motes; the simulation has already removed it.

APIs (browser): `BD.client.render.anim.clip(char, name)`, `.drawFrame(g, v, def, img, f, x, y, o,
scale)`, `.frameScale(char, def, size)`, `.ghosts`, `.live()` (decoded clips). Pure:
`BD.anim.resolve(meta, char, action, dir, moving)`, `.frame(clip, phase)`, `.heroAction`,
`.enemyAction`, `.heroAttackTiming`, `.enemyFollow`, `.strikeOf` (default `round(frames × 0.4)`).

Viewer: `?anim=1` shows every character's row of the clip table — present clips play (attack:
0.6 s wind-up, strike frame outlined orange, follow-through), missing ones show what the game
draws instead and which rule chose it. Click a row (or `?anim=<char>`) for large cells with frame
numbers; Space pauses, `.` steps.

### 9.6 Testing at scale

`BD.stageFloor(w, {size, enemies, kinds, floor, minDist})` / `H.stage(o)` / `__BD.stage(o)`
replaces floor n (default 2) of the running world with a generated floor of that size and puts
`enemies` (default 150) on random cells ≥ minDist from the hero; waves stop. Engine tests:
tests/core/view.test.js, bigfloor.test.js (generation, buckets, staging, measured tick),
anim.test.js, camera.test.js (headless Chromium: mapping in normal and forced landscape, decals,
clip, particles, markers, animation, ghosts).

---

## 10. v2 proof slice: the horde, growth and task loop — where the next agents plug in

Built for docs/GDD-V2.md §11.1 (the proof slice). Every run is now the v2 run: five 48 × 48 floors
(`purge` on each in the slice), the 28 × 28 rooftop, the director sending packs, shards → gauge →
level → a choice of three, six levelled cards and three boons. The numbers live in `BD.C.DIRECTOR`,
`BD.C.V2` (src/core/00_base.js) and the content defs; values tuned away from the GDD are listed in
docs/requests/v2-tuning.md. Files: src/core/05_view.js (camera), 28_director.js, 29_growth.js,
31_tasks.js, 32_sites.js, 33_pickups.js; v2 parts of 11_gen.js, 20_world.js, 27_flow.js, 50_app.js;
src/bot/bot.js (`thinkV2`, `choose`); src/ui/63_growth.js (overlay, gauge, shards).

**Tick order (v2):** hero stats (cards, then boons) → hero move/dash → **camera** → distance field →
auto-attack → timers → enemies → hazards → statuses → rifts → flow (pickups, stairs, **sites**) →
**task** → **director** → **shards / levels / opening a queued choice** → deaths → clock → cleanup.
The world does not advance while `w.choiceOpen` (like the altar). `BD.W.scenario(w)` — set
`w.scenario = true`, or the v1 test idiom `w.wave.n = 3` — stops the director and keeps the choice
overlay shut (levels still count): use it in tests that stage a fight.

### 10.1 The camera and "nothing hits from off screen" (GDD-V2 §5.6)

```js
w.cam = {x, y, lx, ly, grid}          // world u; lx/ly the eased walking direction (dumped as cam{x, y})
BD.view.updateCam(w, dt)              // every tick after the hero moves: target hero + lead 1.5u, rate 8/s, clamp [5, side − 5]
BD.view.snapCam(w)                    // floor entry; a hero > 12u (|dx|+|dy|) from it or a new grid snaps on the next tick
BD.view.camOf(w) / focusOf(w)         // the camera the rules see (pure) / its map-px focus — what the client draws
BD.W.onScreen(w, x, y, pad)           // S: the whole 1280 × 720 view (spawning, recycling, markers, chain_slash's timer)
BD.W.inView(w, x, y, pad)             // C: S minus the HUD bands [48,1232]×[84,600] (on an axis where a v1 room fits: all of it)
BD.view.screen(w) / rect(w) / screenCorners / corners   // the same as map-px rects / world corners
```

Rules, all in the simulation: an enemy may start an attack only after `e.viewT ≥ 0.5 s` inside C
(`BD.ai.canAttack`; an enemy made inside C counts as seen, so placed enemies and rifts keep their
v1 timing); fodder also needs `e.nearT ≥ 0.5 s` within 1.6u of the hero and fewer than 32 warnings on
the floor (§3.5, §3.7); a warning whose owner or origin is outside C when it starts is `unseen` and a
hit from it counts in `w.stats.unseenHits` (must stay 0; checked by tests/enemies/rules.test.js and
`tools/accept.js` #12); hostile shots vanish 2u outside S. The melee / ranged caps come from the
floor's director row (4/4/5/5/6, rooftop 3; 2/2/3/3/3). A dormant enemy (`opts.dormant = {r}`, the
guardian: `r` 10) stands still until the hero comes within `r`, then emits `wake`.

### 10.2 Enemies and the director (GDD-V2 §3)

An enemy kind joins the horde by two declarations:

```js
BD.enemies.register({ id: 'husk', …, role: 'fodder', shards: 1, scale: 0.8, tint: 'pale', variantOf: 'ghoul' });
//   role 'fodder' | 'threat' (default threat), shards dropped on death (default fodder 1, threat 3),
//   scale = sprite size of a variant (body radius stays def.radius), tint/variantOf for the codex and the art agent
BD.director.mixes.register({ id: 'undead', fodder: { husk: 85, goblin: 15 }, threats: { skel_archer: 2, ghoul: 1 }, threatCost: {} });
//   one mix per dominant type (src/content/floors/*.js) + 'rooftop'; weights, not counts; a kind must be
//   listed under its own role (finalize checks); threatCost counts a kind as n threats (dark_knight: 2)
```

Variants reuse the original's `update` and bring their own `T` (registered in the original's file:
goblin.js → squire, slime.js → slimelet / mana_slime, ghoul.js → husk). `BD.W.makeEnemy` sets
`e.role` ('fodder' | 'threat' | 'elite' | 'guardian' | 'boss'), `e.size = scale × elite/guardian size`,
and multiplies a regular enemy's HP and damage by the floor's director row (`hp`, `dmg`).

`BD.C.DIRECTOR.floors[n]` = `{budget, from, to (rooftop: phases[3]), rate, threatEvery, threatCap,
eliteEvery (not used yet), hp, dmg, melee, ranged, pack: [min, max]}`. Every 0.4 s the director
compares `have` (on screen + off screen within 22u, guardians and the boss excluded) with `want`
(`from → to` over the budget × surge 1.5 / guardian 0.5 / overtime 1.25) and sends a pack 1.5–4u
outside S (60 % within ±60° of the last second of walking), paying one token per enemy (rate per
second, at most 12). A threat joins a pack when `threatEvery` has passed and live threat cost < cap
(25 % from another type's mix). Surges at 25 s and every 35 s (8 s, `surge` event, banner); overtime
banner `밤이 깊어진다`. Recycling: fodder > 24u and threats > 30u off screen for 3 s vanish
(`W.removeEnemy(w, e, 'recycle')`, no event, no shards); `e.flags.keep = true` exempts a task target.
Floor entry puts two packs 2u inside the screen edge. `BD.director.clear(w)` (floor clear) dissolves
every regular enemy (`dissolve` event). State: `w.director = {tau, tokens, want, have, surge, surgeN,
state: 'normal'|'guardian'|'clear'|'boss', overtime, off}` (`off = true` stops it).

**For the enemies agent (§11.2-5):** elites (`eliteEvery` is in the table, unused), the archer/mage
behaviour changes, slime split, wide attacks hitting enemies, the guardian's 6u leash, the boss's
director-only minions (the v2 rooftop already has `summon: []`) and the 0.5 s minimum warning are
yours; threats still run their v1 behaviour with the GDD-V2 HP. Tint variants are drawn at their
original colour (sprite scale only) until the art side bakes the tints.

### 10.3 Shards, the gauge, levels and the choice (GDD-V2 §4.1–4.3)

```js
BD.growth.drop(w, x, y, value)      // a shard pops (0.2 s), then waits; inside hero.pickupR it flies in (6→18 u/s)
BD.growth.onKill(w, e)              // called by combat.kill: def.shards / elite 25 / guardian 10 × 6 / boss none
BD.growth.pullAll(w)                // every shard flies in (floor clear; a halo pickup later)
BD.growth.addXp(w, n) / need(L)     // 12, 24, then round(30 + 7L); a full gauge → level_up, a queued choice
BD.growth.open(w, kind) / options(w) / pick(w, i)   // §4.3 draw (w.rng.choice), the overlay, the answer
BD.growth.giveBoon(w, id) / levelCard(w, card)      // what a pick does (also used by `&level=` starts)
```

`w.shards = [{id, x, y, v, popT, pull, sp}]` (≤ 200; the farthest merges into its nearest).
`w.hero.level / xp / xpNeed / boons {id: rank} / pickupR`. The choice is `w.choice = {kind, options:
[{kind: 'card'|'boon'|'breath', id, name, from, to, text, pick}], lastCards}` with `w.choiceOpen`;
answer with `app.cmd('choice', 'pick', i)` (or `BD.bot.choose(w, {policy})` → the arguments). A
pick toasts, gives 0.5 s invulnerability and shoves fodder within 3u out by 1.5u; a second queued
level opens the next choice on the next tick. **A chest** (§4.6) is `BD.growth.open(w, 'chest')` with
its own options: extend `options` by `kind` (the overlay reads `w.choice` only). `&level=N` /
`startRun({level})` and `&floor=N` (level `C.V2.levelAtFloor[N]`) pre-pick with the bot's `mixed` policy.

**A card's levels** (§4.4, §4.7): add `levels: [null, L1, …, L5]` to the card def, each `{text, …numbers}`
(cumulative: L3 holds only what changes). Hooks read `ctx.level` and `ctx.lv` (L1…Lcurrent merged);
`def.onLevel(ctx, from)` runs after `card_level`. `levels[n].maxStack` overrides a combo's
`maxStack` (`BD.cardRt.maxStack(card)`). While any card has levels, **only levelled cards are dealt
and offered** (`BD.cardRt.pool`): a card joins the v2 pool by getting levels. `BD.cardRt.equip(w,
slot, id, level)` takes the level (the altar swap keeps the slot's level, §4.6). Worked examples:
pierce.js (shape levels, an `onHit` push), flame.js (status numbers per level, a level-5 hero zone with
`enemyDmg`), chain_slash.js (per-level timer, haste in `stats`, `maxStack` 15 at level 5).

**A boon** (§4.5): `BD.boons.register({id, name, max: 3, text(rank) → line, stats(s, rank, w), onGain?(w, rank)})`
in src/content/boons/. `stats` runs every tick with the hero's stats (`dmgBase, interval, reach,
halfArc, pickupR, speedMul, …`), right after the cards'. `body` (max HP +15 and heal) needs `onGain`.

### 10.4 Tasks, the floor's end, sites, pickups (GDD-V2 §5.4–5.5, §6)

```js
BD.tasks.register({ id: 'purge', name: '소탕', layout: 'plaza', goal(n, w) → number,
  start?(w, task), update?(w, task, dt), on?: { kill(ev, w, task) … }, label?(task) → '소탕 137/200' });
BD.taskRt.progress(w, n) / set(w, value) / complete(w)      // task_progress; at the goal → task_clear
```

`w.task = {kind, name, value, goal, done}`. Completion: `task_clear`, banner `수호자가 계단을 지킨다`,
the floor's guardian (`floor.guardian`, of the dominant type) appears at the stairs-zone centre
(8, 8) after a 2 s warning, dormant until the hero is within 10u; the director runs at half. The
guardian's death (`flow.guardianKilled` → `BD.taskRt.floorClear`): radiance +1 (max 9), stairs open,
`floor_clear`, the horde dissolves, every shard flies in. 2F–5F take the registered tasks other than
`purge` in a shuffled order (`BD.gen.taskOrder`); while only `purge` exists every floor is purge.
A task def's `layout` names its floor layout.

**Sites** (§5.5): `BD.sites.register({id, name, stay, total?, ring?, optional?, known?, use(w, site) →
true when finished at once, update?(w, site, dt)})`; place them in the generator with
`floor.layout.sites = [{kind, x, y, optional?}]`. `w.sites = [{id, kind, x, y, state:
'idle'|'active'|'used', known, optional, progress, need}]`; standing in the ring for `stay` s emits
`site_start` and calls `use`; a site that is not done at once stays `active` (its `update` runs)
until it calls `BD.siteRt.clear(w, site)` (`site_clear`). `total: true` keeps the stay time when the
hero leaves (seal stones). The bot's goal rule (§10.3 rule 4) already walks to task sites and, with
`opts.sites`, to optional ones. Example: tests/fixtures/test_site.js. No kind is registered yet.

**Floor generation** (§5.2, §5.3): `BD.gen.fills.register({id, apply(grid, zone, rng)})` (zone = `{zx,
zy, x0, y0, size: 16, cx, cy, keep(x, y)}`; set SOLID/VOID inside the inner 12 × 12, keep the
`keep` cells floor) and `BD.gen.layouts.register({id, centre: fillId, fills: [ids]})` —
src/content/zones/plaza.js has `open`, `pillars`, `plaza`. `BD.gen.floorV2` puts start (2, 2) and
stairs (0, 0) zones `open`, checks §5.8 1–5 (`BD.gen.checkV2`) with 20 retries, then all-open.
`floor = {n, v2, domType, nextDomType, w, h, cells, floorKind, task, guardian, layout: {start,
stairs, flasks, sites, zones}, offscreen}`. Zone walls (office), void (atrium) and site placement
belong to the generation agent. The slice keeps v1's one flask per floor.

**Touch pickups** (§6): `BD.pickups.register({id, touch, take(w, p) → bool})`; place with
`w.pickups.push({id: BD.W.id(w), kind, x, y, value})`; a use emits `pickup {kind, x, y, value}`.
`flask` is registered in core (src/core/33_pickups.js). Shards are not touch pickups (§10.3).

### 10.5 Events and the state dump

New GDD-V2 §4.7 events: `level_up {level}`, `choice_open {kind, options}` (options = pick strings
`card:<id>` / `boon:<id>` / `breath`), `choice_pick {kind, pick}`, `card_level {cardId, level}`,
`boon {id, rank}`, `task_progress {floor, task, value, goal}`, `task_clear {floor, task}`,
`site_start` / `site_clear {kind, id, optional}`, `surge {floor, n}`, `floor_clear {floor}`;
`pickup` gained `value`. Engine extras: `shard_drop {x, y, value}`, `dissolve {enemyId, kind, x, y}`,
`wake {enemyId}`. Banner kinds added: `surge`, `overtime`, `task` (floor banners read `3F — 중갑 · 소탕`).

`__BD.state()` adds `floorKind`, `cam{x, y}`, `hero.level / xp / xpNeed / boons / pickupR`,
`cards[].level`, `enemies[].role / inView`, `shards` (count), `task{kind, value, goal, done}`,
`sites[]`, `director{want, have, tokens, surge, state}`, `choice{kind, options}` (while open),
`unseenHits`. URL / `startRun`: `&task=<id>` (1F's task), `&level=N`, `&floor=N` (with its level).
`H.calm()` marks a staged scenario. `H.sim({…, task, level})`.

### 10.6 What the UI can read

* **Gauge:** `w.hero.level`, `xp`, `xpNeed` (src/ui/63_growth.js draws the 420 × 10 bar at
  430–850 × 598–608 with `Lv N`; `level_up` flashes it).
* **Choice overlay** (`app.overlay() === 'choice'`, registered as overlay `choice`): `w.choice.options`
  (name, `from → to`, the level line `text`, kind and card family for the border); the 0.35 s input
  lock is the overlay's (real time; the world is stopped anyway).
* **Task:** `BD.ui.taskLabel(w)` (the def's `label`) for the top centre; `w.task.done` switches it to
  `수호자가 계단을 지킨다`; the guardian bar takes over while it lives.
* **Shards:** `w.shards` (pop height from `popT`, trail when `pull`), `w.hero.pickupR` for the ring.
* **Feedback hooks:** `kill` (fodder: `e.role === 'fodder'` before removal via `BD.W.enemyById` in
  the same tick), `swing` … `swing_end` for multi-kills, `pickup` (`kind: 'shard'`, `value`),
  `level_up`, `choice_open`, `choice_pick`, `surge`, `floor_clear`, `dissolve`. Sounds added:
  `shard` (opts.step 0–12 semitones), `level_up`, `choice_open`, `multi_kill`; `kill` ≤ 8/s, `hit` ≤ 10/s.
* **Minimap / edge markers:** the engine's §9.4 ones are on for v2 floors (`floor.offscreen`);
  guardians are threats, open stairs an objective. Sites and task targets: add `e.flags.marker` or a
  `BD.render.markers` source.

### 10.7 Bot and measurement

`BD.bot.think` uses `thinkV2` on v2 floors (GDD-V2 §10.3 rules 1, 2, 4–8: dodge; flask/spring at
HP ≤ 45; goal every 2 s — guardian → task site → optional sites by `opts.sites` → open stairs; step
back from ≥ 6 enemies within 2.2u; shards within 6u when < 4 enemies within 3u; walk to an
off-screen goal; else hold the nearest at reach − 0.5u). `BD.bot.choose(w, {policy: 'mixed' | 'card'
| 'pray'})` answers the choice or the altar. The gate is `node tools/fun/measure.js --seeds 1-20`
(also `tools/accept.js` #7); `tools/feel/human_bot.js` and `tools/fun/lib.js` answer choices with it.

## 11. The stage: props, zone fills, sites, walls, sky (art, v2)

Everything of the environment that is not a character is drawn in code by `src/client/31_kit.js`
… `39_sites.js` and staged for tuning by `96_artstage.js`. It is presentation only: nothing here
writes simulation state or changes a hash, and it reads only the fields named below. What the
generator or content controls is **which ids stand where**; how they look is the art's.

| file | what |
|---|---|
| `31_kit.js` `R.kit` | the facet kit: `box` (taper), `bevelBox`, `prismN`, `shard` (crystal), `spike`, `rock`, `shadowBox`/`shadowDisc` (cast shadow + halftone), `halftone`, `brush`, `pal(base)` → two tones, `sprite`/`blit` (LRU canvases at the screen's pixel density) |
| `33_props.js` `R.props` | the prop catalogue (§11.2), `piece(inst, dx, dy)` = the slice of one footprint cell, `whole`, `shadow` |
| `36_stage.js` `R.stage` | the stage model of a floor: layout, zones, props (given or inferred), voids, floor marks, wall bays, growths; `R.invalidate()` |
| `37_paint.js` `R.paint` | the static painter (facade, floor and its marks, shadows, back walls, wall items, elevator, furniture, back growths) for v1 rooms and big-floor chunks |
| `38_sky.js` `R.sky` | flat sky bands, stars, moon, three parallax skyline strips (night/dawn), drawn only where the stage leaves the sky open |
| `39_sites.js` `R.sites` | site drawers, the stairs door, spawn rift marks, and `R.stage.pushItems` (the depth-sorted pass) |
| `96_artstage.js` | showcase floors and the prop sheet (`?artstage=office&theme=magic`, `?propsheet=1`) |

**One light** comes from the screen's left and above: tops and the +y face (screen lower-left) are
lit, the +x face (screen lower-right) is the shadow face with a light halftone, cast shadows fall to
the screen right. Two tones per surface; ink heaviest on the ground line and the silhouette. The
floor stays **one flat colour per floor type** (`C.FLOOR_COLORS`): every mark on it is a step of
that colour or thin ink, and litter lies only against walls and props.

### 11.1 What a floor may say (all optional)

```js
floor.stage = {
  layout: 'plaza' | 'office' | 'atrium' | 'hall' | 'ruin',      // GDD-V2 §5.3 배치 유형
  zones:  [{ zx, zy, fill }],                                   // 16 × 16 zones; fill = a §5.2 id
  props:  [{ id, x, y, w, h, v?, state? }],                     // footprint cells must be SOLID
};
w.sites = [{ id, x, y, state }];      // or floor.sites — places to go (§11.4), drawn depth-sorted
```

* With no `floor.stage`, the layout comes from the v1 pattern (`aisle`/`cover` → office,
  `pillars`/`open` → plaza, `ring` → ruin), zones are the 16-u squares of a floor ≥ 32 × 32, and
  props are **inferred**: SOLID cells are grouped (4-neighbour), split greedily into rectangles, and
  each rectangle gets the id §11.2 gives for its shape, the layout and the floor type. A thin
  component of ≥ 8 cells (a `chamber` ring, an `office` boundary) is all `wall`.
* Every SOLID cell belongs to exactly one prop and a prop's footprint is SOLID only, so what is
  drawn is what collides (tests/art/stage.test.js checks it on every layout and on engine floors).
  Given props are trusted; cells they leave are inferred. An unknown id draws as `block` and is
  listed in `R.props.unknown` (one console warning).
* The floor type is `floor.domType` (`beast|undead|magic|heavy|rooftop`): it picks the prop mix,
  wall items, furniture, litter, floor marks and growth density (§11.5).
* A prop is drawn cell by cell (each slice keyed `x + y + 1`, like a 1 × 1 obstacle), so actors
  sort against a 1 × 5 desk row or a 2 × 2 column correctly. A `tall` slice that covers the hero,
  an on-screen enemy or a warning behind it is drawn at 42 % (GDD-V2 §5.9); slab-edge growths too.

### 11.2 Prop catalogue (ids, footprints in cells w × h, either orientation)

| id | footprint | height px | tall | inferred for |
|---|---|---|---|---|
| `pillar` | 1×1 | 106 | ✓ | 1×1 (`open`) in plaza/atrium/hall; state `broken` (ruin), `castle` (rooftop) |
| `pillar_big` | 2×2 | 112 | ✓ | 2×2 in plaza/atrium/hall (`pillars`) |
| `planter` | 1×N, N ≥ 2 | 62 | | 1×2–3 in plaza/atrium (`planters`) |
| `partition` | 1×N, N ≥ 2 | 64 | ✓ | 1×2–3 in office (`planters`, v1 `cover`) |
| `bench` | 1×N | 30 | | 1×2–3 in hall |
| `sandbags` | any | 30 | | half the 1×2–3 rows on the heavy floor outside offices |
| `desk_row` | 1×N, N ≥ 2 | 54 | | 1×4–5 (`aisle`) in office/plaza/atrium |
| `server_rack` | 1×N, N ≥ 2 | 80 | ✓ | 1×4–5 in hall |
| `bookshelf` | 1×N | 82 | ✓ | 1×4–5 in hall on magic; a third of the rows on magic |
| `weapon_rack` | 1×N | 70 | ✓ | a third of the 1×4–5 rows on heavy |
| `cubicle` | 2×2 | 62 | ✓ | 2×2 in office (`cubicles`) |
| `crate` | any | 64 / 88 | | 2×2 in ruin and on heavy; leftovers of odd shapes |
| `crystal_block` | any | 64 + 16·min(w,h) | ✓ | ruin 1×1 / 2×2; odd shapes on magic and in ruin |
| `spike_mass` | any | 54 + 18·min | ✓ | ruin 1×1 / 2×2; k×k centres on undead/heavy; rooftop rows |
| `crystal_mass` | any | 60 + 22·min | ✓ | k×k centres (`ring`) in ruin/hall and on magic; rooftop |
| `fountain` | k×k, k ≥ 2 | 40 + 22k | ✓ | k×k centres (`ring`) in plaza/atrium |
| `reception` | ≥ 3×3 | 96 | ✓ | ≥ 3×3 centres (`ring`) in office |
| `wall` | 1×N | 62 / 74 | ✓ | runs ≥ 6 and thin components; state `glass` (office, translucent), `stone` (hall), `concrete` (others) |
| `rubble` | any | 46 | | ruin singles and short rows |
| `cabinet` | 1×N | 60 | ✓ | office singles |
| `vending` / `copier` / `plant` | 1×1 | 84 / 46 / 76 | ✓ / – / – | office singles |
| `ac_unit` | w·h ≤ 2 | 44 | | rooftop singles and pairs |
| `water_tank` | 2×2 | 128 | ✓ | rooftop 2×2 |
| `block` | any | 40 | | the fallback for an unknown id |

Furniture along the back walls (decor, not obstacles, baked into the static layer; 1–2 u along the
wall × 0.56 u deep, never in front of the stairs): `wall_desk`, `wall_cabinet`, `water_cooler`,
`potted_plant`, `printer`, `wall_rack`, `wall_crates`, `wall_shelf`, `ac_unit_decor` — a decor id
draws its base prop squashed along the wall's depth. The stage places these itself.

### 11.3 Zone fills (GDD-V2 §5.2) and what the floor shows for them

| fill | props it gets | floor |
|---|---|---|
| `open` | `pillar` | an inlaid ring emblem (45 %); a rune circle on magic, the helipad on the rooftop |
| `pillars` | `pillar_big` (cubicles in office, crates/crystals in ruin) | inlaid ring emblem |
| `planters` | `planter` / `partition` / `bench` / `rubble` / `sandbags` | — |
| `aisle` | `desk_row` / `server_rack` / `bookshelf` / `weapon_rack` | carpet over the zone (runner in hall) |
| `cubicles` | `cubicle` (crates in ruin) | carpet over the zone |
| `ring` | `fountain` / `reception` / `crystal_mass` / `spike_mass` | inlaid ring emblem |
| `chamber` | `wall` (stone in hall, glass in office) | dark carpet inside the room |
| `island` | void shaft with railings round it and along the bridges | inlay on the island; the shaft's walls show the floors below |

Zone borders get a doubled expansion joint. A zone without a `fill` is read from what stands in it.

### 11.4 Sites (`w.sites[]`, plus the world's own objects)

| id | states (first = default) | drawn from |
|---|---|---|
| `altar` | `off`, `lit` (also `open`), `used` | `w.altar` (v1) or a site entry |
| `spring` | `full`, `dry` | site |
| `chest` | `closed`, `open` | site |
| `rift` | `available`, `active`, `spent` | `w.trial` (the v1 trial rift) or a site |
| `seal` | `intact`, `cracked`, `broken` | site (seals task) |
| `nest` | `alive`, `dead` | site (nests task) |
| `brazier` | `cold`, `lit` | site (hold task) |
| `spawn_rift` | — | `floor.layout.rifts` (a flat mark) |
| stairs door | locked / open | `w.stairs` (`side`, `x` or `y`, `open`), set into its back wall |

Stay rings, progress arcs and markers stay the engine's (§9.4); a site is only the object.

### 11.5 Walls, sky and the floor types

Back walls (the `x = 0` and `y = 0` sides) are 4-u bays: glass curtain wall with the city in it
(62 %; smashed panes on beast/undead) or concrete with wall items (`clock exit board whiteboard tv
vent extinguisher poster`, and the floor type's own: `claws` beast, `cobweb` undead, `sigil` magic,
`shield banner` heavy); pilasters between bays; one broken `elevator` bay away from the stairs; the
section cut on top. The rooftop has a parapet with a rail instead. Front edges: the slab lip, the
facade's lit storeys down to the frame, crystals grown into it. The demon castle's growths
(spikes, crystals; density per floor type in `R.stage.GROW`) mass at the corners and clump along
the walls and the slab edge. Floor types also differ in the floor (beast claw gouges, undead cracks,
magic cracks that glow, a heavy 4-u steel deck with rivets, rooftop gravel and drains) and in the
litter against walls (twigs, bones and candles, shardlets and orbs, bolts and chains, gravel).

### 11.6 Cost and tools

Static parts go into the v1 screen cache or the 512-px chunks (one chunk painted ahead per frame,
3–10 ms each); props, front growths, sites and the stairs door are cached sprites blitted in depth
order; the sky is culled to what the stage leaves open (nothing mid-floor). Nothing on the stage
fills a halftone pattern per frame (that makes the browser raster pending blits synchronously).
Measurements: docs/screens/v2-art/ROUNDS.md. Tools: `node tests/art/shoot.js <dir> [--engine]
[--layout L]`, `node tests/art/sheet.js <png>`, `node tests/art/extra.js <dir>`,
`node tests/art/perf.js [--art]`.

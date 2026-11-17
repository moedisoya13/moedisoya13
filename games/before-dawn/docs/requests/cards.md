# Cards agent — engine requests, interpretations, notes for the lead

No engine file is edited on the cards branch. Everything below is either a request for the
lead or a record of how the cards read the GDD.

## Requests

### 1. Bus overwrites the GDD `type` field of `hit` and `kill` (bug)

`BD.Bus.emit` sets `payload.type = name` (src/core/03_events.js). The GDD §5.2 payloads of
`hit` and `kill` carry a field called `type` (the enemy type), so every listener receives
`type: 'hit'` / `type: 'kill'` and the enemy type is lost. `__BD.events()` shows the same.

Check: `w.bus.on('kill', (ev) => console.log(ev.type))` prints `kill`.

Workaround in the cards: `BD.cardKit.etype(ev)` reads the type from `ev.kind` via the enemy
registry. Used by 성광, 망자의 안식 and 마력 역류.

Fix options for the lead (both are small):
- (a) The bus stores the event name in a key that no GDD payload uses (for example `ev.event`)
  and `type` keeps the payload's value. accept.js, scenarios.js and the core tests filter on
  `x.type === 'hit'`, so they would change too.
- (b) Keep `type` as the event name and add `etype` to the `hit`/`kill` payloads. This departs
  from the GDD field name.

The cards keep working with either fix, because `etype()` only reads `kind`.

### 2. `tests/core/mechanics.test.js` › "altar: bot picks an offered card …" fails once base cards exist

Line 188 lists the allowed pool as `['test_flame', 'test_tide', 'pierce', 'chain_slash']`.
That only held while the two reference cards were the whole base pool. With the 12 base cards
registered, the altar may offer any of them, so this is the one FAIL in `node tools/test.js`
on this branch. The intent of the test ("offers obey the pool") still holds. The one-line fix:

```js
t.assert(swaps.every((x) => BD.cardRt.pool(['test_flame', 'test_tide']).includes(x.inId)));
```

I did not apply it, because tests/core belongs to the engine.

## Criterion 15 and the enemies agent

`accept.js` #15 reports PENDING here because `dark_knight` and `ghoul` are not registered on
this branch. `tests/cards/bot.test.js` runs `tools/scenarios.js` unchanged against test
stand-ins (`tests/cards/standin_enemies.js`: ghoul with revive 2.5 s / 30 / corpse 20,
dark_knight with the 20 % front guard that reads `stats.mods.ignoreGuard` and knockScale 0.33,
mage, skel_archer). All four scenarios pass there. The stand-ins register only when the real
id is missing, so after the merge the same tests run against the real enemies.

The cards rely on these contracts from the enemies side:
- the dark knight's `defense` honours `w.hero.stats.mods.ignoreGuard` (갑옷 파쇄);
- heavy enemies set `knockScale` 0.33 (해류 → 0.4u);
- the mage's teleport reads `e.statuses.bind` (마력 역류);
- the ghoul's revive goes through `def.revive` (성광 and 망자의 안식 set `flags.noRevive`);
- the mage's fire zone uses `zone()` with `igniteEnemies` (불의 순례 counts those burns) and is
  `source: 'zone'` (각성 불의 순례 sets `mods.zoneImmune`).

## Interpretations of the GDD (where the text allowed more than one reading)

- **뇌전.** "3.0u 안" is measured hop by hop: from each link to the next enemy's edge, nearest
  first. A link is any enemy that the swing did not already hit. Corpses are not linked.
  - Damage is 60 % of the final damage the primary took from that swing (§4 "그 베기 최종
    피해"). If a wet enemy is anywhere in the path, the primary included, the chain does 100 %
    and may run 5 links.
  - A 검기 wave chains from the first enemy it hits, once per swing, and only if the blade did
    not chain. A 반격 chains from the hit nearest to the hero. 무결's echo chains from the
    swing's primary.
- **흡수.** A guardian or elite kill heals 10 at once instead of counting toward the four
  kills.
- **반격.** The 2.0 s cooldown blocks both triggers (hurt and dodge). The dash is reset only
  when the ×3 counter actually fires.
- **발도.** Any swing spends the charge and restarts the distance count. The charged swing's
  wave flies 0.6u further and also deals ×2.5.
- **성광.** Any hero-side damage to an undead marks it `noRevive`, not only blade hits. So a
  ghoul killed by a chain, burn or burst also stays down, and a corpse that is already down is
  finished.
- **망자의 안식, after awakening.** Undead take +10 in total (not +3 + 10); every other enemy
  takes +3. The pre-awakening +4 no longer applies.
- **왕의 사냥, after awakening.** ×1.6 replaces the +3.
- **불의 순례.** Only real swings count and ignite: not the echo, the counter or the wave.
  - The awakened burst sets its victims alight before it damages them, so burning deaths can
    chain.
  - `offerable` requires at least 12 enemies left on the floors above.
- **일섬.**
  - The stack changes at ① and so already applies to that swing's damage and shapes.
  - The pierce line that 일섬 grants at ×4 counts as 관통 for 검기 (the wave pierces 3).
  - At ×8 an equipped 관통 also grows to 6.0u × 1.4u.
- **무결's echo.** It is skipped if the stack dropped below 6 or the floor changed during the
  0.2 s.
- **해류.** The push always points from the hero to the enemy, including on wave and counter
  hits.
- **마력 역류.** The bind applies to any `magic` enemy, which today means the mage. The burst
  fires on a magic kill from any source.

## Notes for the UI agent (presentation hooks the cards emit)

- **Toasts the cards already send.** The UI does not need to add these:
  - combo breaks (`연참 끊김: 4초 동안 베지 못했다`, `무결 깨짐: <적>의 <공격>`,
    `일섬 흐트러짐: 품을 내줬다`);
  - combo max (`연참 ×5`, `무결 ×6`, `일섬 ×8`);
  - quest countdown (`<이름>: 앞으로 2/1`);
  - awakening (`각성: <이름>`; the engine adds the banner);
  - the first steam of a run (`증기: 젖은 적에 불이 닿았다`).
- **`hud()` fields.** The documented ones are `text`, `ring`, `pips`, `glow` and `badge`. Two
  more exist:
  - `flash`: a target card just hit, at most twice a second;
  - `warn`: the 연참 timer is under 1 s.

  What each field means per card:
  - `ring`: 연참's timer, 발도's charge, and the remaining cooldown on 반격.
  - `pips`: 흡수 0–3 and 불의 순례's embers 0–3.
  - `glow`:
    - on target cards, the floor's dominant type matches;
    - on 발도, the blade is ready;
    - on quest cards, the card has awakened.
  - `badge`: the current combo stage label.
- **`vfx` kinds, for mapping sounds.**

  | GDD §10 sound | vfx kind(s) |
  |---|---|
  | `chain` | `chain_bolt` |
  | `splash` | `splash` |
  | `ignite` | `ignite` |
  | `steam` | `steam_puff` |
  | `heal_small` | `leech_heal`, `royal_heal` |
  | `charge_ready` | `drawcut_ready` (draws nothing) |
  | `hit_type` | `holy_cross`, `armor_shards`, `mana_chain` |
  | (explosions) | `mana_burst`, `rod_burst`, `pilgrim_burst` |
  | `quest_tick` | `quest_mote` (flies to the slot) |
  | `combo_up` | `combo_label` |
  | — | `drawcut_flash`, `rod_glow`, `rod_rim`, `pilgrim_flare` |

- **Decor drawn by the cards:**
  - `riposte_flash`, `drawcut_feet`, `drawcut_blade`, `pilgrim_blade`, `chain_slash_ring`,
    `combo_afterglow`, `one_flash_band` (on the hero);
  - `mana_chains`, `kings_hunt_mark`, `armor_cracks` (on enemies).
- **What is left to the UI** (ARCHITECTURE §5.5): the cape length, the gold ring and cape crest
  on awakening, slot icons (each card's `icon` equals its id), sounds, and the HUD slots
  themselves.

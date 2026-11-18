# Engine requests — outcome of the integration pass

Every request in `cards.md`, `enemies.md` and `ui.md`, what the engine did, and the commit (branch
`claude/pensive-einstein-luyyw4`). "Done" = implemented as asked; "changed" = implemented in a
different shape (reason given); "declined" = not implemented (reason given). Where a request had a
workaround on the content or UI side, the workaround is removed in the same commit, so there is
one source of truth. `docs/ARCHITECTURE.md` describes the contract after these changes.

| # | Request | File | Outcome | Commit |
|---|---|---|---|---|
| 1 | Bus overwrites `type` of `hit` / `kill` | cards.md #1, ui.md #1, enemies.md #5 | **Done**, option (a). `emit` stamps the event name as `ev.event` (reserved key: declaring it throws); `type` keeps the GDD §5.2 enemy type. Every filter on the event name moved to `.event`: `tools/accept.js`, `tools/scenarios.js`, `tests/core`, `tests/cards` (`_kit.js`, combo, target), `tests/enemies` (`util.js`, contracts), `tests/ui` (flow, touch), and the `tools/feel/*` scripts that landed on the branch meanwhile (`4714dbb`; their hit-stop meter now reads `ui.hold`). Engine, bot and `src/content` / `src/ui` had no such filter. The cards' `etype()` and the UI's `typeOf(kind)` stay (they read `kind`, still correct). | `db2e526` |
| 2 | Core altar test lists a 4-id pool | cards.md #2 | **Already done** before this pass (the test reads `BD.cardRt.pool([...])`, merge `9d567af`); now filters on `ev.event`. | `9d567af`, `db2e526` |
| 3 | Move the tuned guardian HP row into `BD.C.GUARDIAN.hp` | enemies.md #1 | **Done.** `BD.C.GUARDIAN.hp = [0, 480, 660, 840, 1020, 1200]`. `src/content/enemies/00_tuning.js` deleted (it did nothing else); the six `guardian.create` no longer rescale. `numbers.test.js` checks the engine row and every guardian's HP on 1F–5F; bot runs seeds 1–16 hash-identical before/after. | `7d113d1` |
| 4 | Bot walks back into arrows / bolts in flight | enemies.md #2 | **Done.** `src/bot/bot.js`: each hostile projectile is a line danger shape over the next 0.6 s of its flight (capped by range left and walls), with `remain` = time to reach the hero, so rule ① steps out of its path and rule ③ never walks into it. No randomness. New core test (arrow from 6u: idle hero is hit, bot is not, two runs hash-equal); it fails on the old bot. Statistics below. | `c056637` |
| 4a | (follow-up) §6.1 keep-out watch flagged a knockback | — | The faster dodging bot dashed through a dark knight (seed 16, 3F); `updateKnock` moves and clears `e.knock` in the same tick, so `tests/enemies/rules.test.js` saw the last knock step as walking. The watch now also skips an enemy knocked on the previous tick. The rule itself is unchanged. | `c311361` |
| 5 | Criterion 17 win length vs LEAD §1 | enemies.md #3 | **Declined (lead decision).** A tuning trade-off, not an engine change; no enemy number changed. Bot numbers after the projectile fix are below for that decision. | — |
| 6 | Collapse ring drawn over the facade | enemies.md #4 | **Done.** `drawWorld` draws all telegraphs clipped to the floor cells (`R.floorPath` / `R.clipFloor`, cached per floor and room origin). The UI's ink-splat clip uses the same path instead of its own copy. Checked on the staged phase-3 collapse. | `796d3de` |
| 7 | accept.js #8 edit (enemy-proof idle run) | enemies.md "engine edits" | **Accepted as is.** It keeps the original idle run and its death check, and reads the 450 s clock on a second idle run only when the first dies early. | `aa0fca6` |
| 8 | Hit-stop hold in the shell's frame loop | ui.md #2 | **Done.** `ui.hold` (real seconds): `frame()` steps no tick while it is > 0 and counts it down. `FEEL.hitstop` sets `ui.hold` (still only at speed 1, same cooldown) and no longer writes `params.speed`; the hud test checks the hold is released and speed untouched. | `b66db0a` |
| 9 | Shell menu focus highlight uses a partial list | ui.md #3 | **Done.** `ui.isFocused(b)`: the button's index among this frame's menu buttons of its layer, modulo the last frame's complete count (the list `ui.key` moves and activates). `K.button` now asks the shell instead of repeating the rule. | `b66db0a` |
| 10 | iOS audio unlock in `AU.unlock` | ui.md #5 | **Done.** `AU.unlock` resumes a suspended context; the input layer also calls it on window `touchend` / `click`; `BD.client.sfx` resumes before each sound. The UI's own listeners and per-sound `resume()` are removed. Not verified on an iOS device. | `b66db0a` |
| 11 | Guardian entrance banner | ui.md #4 | **Done.** `makeEnemy` emits `banner {text: '수호자 — <guardian name>', kind: 'guardian'}` when a guardian appears; the UI's `spawn`-derived banner is removed. | `1ecff8a` |
| 12 | Trial start / clear banners | ui.md #4 | **Done.** The engine emits them (kinds `trial`, `trial_clear`, the UI's texts); the UI draws them like `guardian` / `stairs` as before and no longer derives them. | `1ecff8a` |
| 13 | Telegraph style on the event | ui.md #4 | **Done**, plus `ownerKind` on `telegraph` and `telegraph_fire`, so the UI no longer looks the warning up in `w.telegraphs` (it is gone by the time it fires). | `1ecff8a` |
| 14 | Enemy attack sound hooks | ui.md #4 | **Done.** `attacks.<id>.sfx` / `sfxStart` are part of the enemy contract (registry type-checks them; the hud browser test checks every id is a registered sound). The mapping that lived in the UI's `ON_FIRE` / `ON_START` tables is now in the defs: knight `charge`, `sweep`; mage `fire_circle`; boss `cleave`, `collapse`, `thorns`. The mage's blink plays by `style: 'blink'`. Tables removed. | `1ecff8a` |
| 15 | Boss phase ticks from `def.phaseAt` | ui.md #4 | **Nothing to do.** `demon_king` defines `phaseAt` and the UI reads it (its 0.66/0.33 fallback is the GDD value). | — |
| 16 | Faint dawn sky | ui.md #6 | **Done** in the renderer. The far skyline is its own layer, painted in a night and a dawn look (lighter hazy silhouettes with a warm rim, three in four windows out) and cross-faded 03:00 → 06:00 over a brighter sky gradient (`R.dawnK`). The UI's bottom-corner glows and top band, which stood in for it, are removed; the clock-box warming and the burning edges after 06:00 (GDD §3.6 pressure) stay with the UI. | `796d3de` |
| 17 | Slot geometry written twice | ui.md #7 | **Changed:** instead of the cards calling the UI, the geometry moved to core: `BD.C.SLOTS {size 84, gap 12, y 616}`, `BD.slotRect(i)`, `BD.slotCenter(i)`. The cards' `K.slotCenter` and the UI's `BD.ui.slotRect` both read it (same 502 / 598 / 694 × 616). | `796d3de` |
| 18 | `tests/ui/hud.test.js › slots` expects `7/12` | brief | **Done.** Cause: `killAll()` kills seed 5's 1F skeleton archer, an undead, so 망자의 안식 started at 1/12 (and 연참 at ×5). `playing()` now re-equips the hand after emptying the room and asserts that no progress or stacks remain; every check of the test is unchanged. | `1415a58` |

Not a request, noted: `tests/enemies/rules.test.js` says inward nudges made inside `BD.ai.move`'s
wall resolution are "reported in docs/requests/enemies.md"; they are not in that file. They are
counted, not failed, and were left as they are (changing `ai.move` would move every bot number).

## Bot statistics (tier 0, fresh save, real 18 cards, no trials, `BD.simRun({seed, tier: 0, maxSec: 1500})`)

"Before" is the merged game with only the bus and guardian-HP commits (both hash-identical to the
merge); it reproduces the enemies agent's table exactly. "After" adds the projectile-aware bot; it
was re-run at the final commit with identical results. Enemy numbers are unchanged.

| | Wins | Median death floor | Median win | Deaths by floor | Projectile hits taken |
|---|---|---|---|---|---|
| Before, seeds 1–100 | 15 % | 3F | 9.1 min | 2F 19, 3F 26, 4F 14, 5F 6, 6F 20 | 1163 |
| After, seeds 1–100 | **46 %** | **4F** | 9.7 min | 2F 7, 3F 10, 4F 13, 5F 8, 6F 16 | 259 |
| Before, seeds 101–200 | 13 % | 3F | 9.4 min | 1F 1, 2F 18, 3F 26, 4F 17, 5F 10, 6F 15 | 1062 |
| After, seeds 101–200 | **45 %** | **4F** | 9.9 min | 2F 12, 3F 12, 4F 6, 5F 10, 6F 15 | 203 |

Deaths per floor entered (before → after): seeds 1–100: 2F 19 → 7 %, 3F 32 → 11 %, 4F 25 → 16 %,
5F 15 → 11 %, rooftop 57 → 26 %; seeds 101–200: 2F 18 → 12 %, 3F 32 → 14 %, 4F 31 → 8 %, 5F 26 → 14 %,
rooftop 54 → 25 %.

Causes of death after, seeds 1–100: mage fire circle 16, mage fire zone 15, knight charge 11, boss
6, other 6 (archer shot 26 → 0). Seeds 101–200: fire zone 17, knight charge 12, fire circle 10,
boss 6, knight sweep 5, other 5 (archer shot 15 → 1).

With the bot no longer blind to arrows, the tier-0 bot is past criterion 17's 5–30 % win band and
the 3–4F median death floor sits at its top. Re-tuning is the lead's call (enemies.md #3 noted that
archer damage was held at the GDD value because of this bot blindness).

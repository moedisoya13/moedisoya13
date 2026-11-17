# UI agent — engine requests, interpretations, notes for the lead (ARCHITECTURE §7)

No engine file is edited on the UI branch, except the two hooks of item 8 (the rotate prompt,
asked for by the lead on `ui-tap-start`). Everything else works today through a workaround
inside `src/ui/`; each item says what the workaround is and the smallest engine change that
would replace it. Checked against the merged 18 real cards (`src/content/cards/`).

## Requests

### 1. Bug: the event bus overwrites `type` in `hit` and `kill` payloads

`src/core/03_events.js`, `Bus.emit`: `payload.type = name;` runs after the payload is built,
so the GDD §5.2 field `type` (`beast|undead|magic|heavy|boss`) of `hit` and `kill` reads
`'hit'` / `'kill'` in every listener and in `__BD.events()`. Same report as requests/cards.md #1.

- UI workaround: the enemy type is always derived from `ev.kind` (`BD.enemies.get(kind).type`,
  `BD.ui.typeOf`). Nothing in `src/ui/` reads `ev.type` of a `hit` / `kill`, so either fix works.

### 2. Hit-stop needs a hold in the shell's frame loop

GDD §9.2 / art direction ask for hit-stop. The shell steps the world from `params.speed × real time`.

- UI workaround (`src/ui/30_feel.js`, `FEEL.hitstop`): sets `window.__BD.params.speed = 0` for
  45–200 ms and restores it. Only when the speed is 1 (test runs at higher speeds are left
  alone); restored on leaving play, on death and on win. No tick is added or skipped, so the
  simulation stays deterministic. `__BD.step()` and the Node harness are not affected.
- Smallest engine change: in `src/client/90_shell.js` `frame()`, skip stepping while
  `ui.hold > 0` and count it down: `if (ui.hold > 0) { ui.hold -= dt; acc = 0; } else if (ready && …)`.
  The UI would then set `ui.hold` instead of touching `params`.

### 3. The shell's menu focus highlight uses a partial list

`ui.button()` (90_shell.js) computes focus with `menu[ui.focus % menu.length]` while the frame's
menu list is still being built, so with focus ≥ 1 an earlier button can also look focused. The
UI draws all its buttons itself (`style: 'none'` + `K.button`, focus from the previous frame's
list, as `ui.key` uses), so this does not show; any code using the shell's drawn buttons would.

### 4. Presentation hooks the UI derives itself (would be nicer as events)

- Guardian entrance banner `수호자 — …` (GDD §9.2): derived from `spawn` + `e.guardian`.
- Trial start/clear banners: from `trial_start` / `trial_clear`.
- Telegraph style (mage blink) for sounds: read from `w.telegraphs` by the `telegraph` event's id;
  a `style` field on the event would be simpler.
- Enemy attack sounds: the UI maps GDD attack ids (`fire_circle`, `charge`, `cleave`, `collapse`,
  `thorns`, `blink`) and also honours `def.attacks[id].sfx` (when the blow lands) / `.sfxStart`
  (when the warning starts) if the enemies agent sets them. Suggest the enemies agent add those
  fields for exact control (`dark_bolts` → `arrow` is already covered by `projectile`).
- Boss phase ticks: drawn at HP 66 % / 33 % (GDD §6.4), or at `def.phaseAt` if the boss defines it.

### 5. Audio unlock on iOS

`AU.unlock` creates the context on `pointerdown`/`keydown`. iOS Safari has historically only
started audio from `touchend`/`click`. The UI adds window `touchend`/`click` listeners that call
`ac.resume()` when suspended, and every sound calls `resume()` if needed. Not verified on a
device. Suggest calling `ac.resume()` in `AU.unlock` as well.

### 6. Dawn sky

`R.drawSky` brightens the gradient's bottom from 03:00, but the tower and skyline cover most of
it, so the change is faint. The UI adds a warm glow from the bottom corners (03:00→06:00), a top
band, the clock box warming, and burning edges after 06:00 — drawn as the lowest HUD layer, under
the HUD boxes. If the engine wants the skyline windows to dim or the far buildings to lighten
toward dawn, that belongs in `buildStatic`.

### 7. Slot geometry is written twice

`BD.cardKit.slotCenter` (cards `_lib.js`, used by the `quest_mote` flight) hard-codes the GDD §9.2
slot positions; the UI's are `BD.ui.slotRect(i)` (`src/ui/35_cardfx.js`). They agree today
(84 px sockets, gap 12, centred, y 616). If either moves, the gold dot flies to the wrong place.
Suggest the cards call `BD.ui.slotRect` when it exists (both run only in the browser).

### 8. Rotate prompt: one tap to play, and forced landscape (engine hooks made on `ui-tap-start`)

The user's two reports from a phone: "화면 회전 안내 이후 터치하면 자동 시작" and "화면 회전 안내에서
넘어가지 않습니다" (rotation lock, file viewers and in-app browsers never turn the window, so the
prompt could never be passed). The UI side is `src/ui/65_rotate.js`; it needed two small, additive
engine changes, made directly (lead's go-ahead) and listed here so the engine owner can review:

- `src/core/50_app.js`: `BD.UI_OVERLAYS` gains `'tap'` (the 화면을 터치하면 시작 / 계속 state: a UI
  overlay like `pause`, so `app.step()` and the shell hold the world while it is open). Nothing
  else in the app changes. ARCHITECTURE §5.1/§5.3 and the GDD §12 state list do not name it yet.
- `src/client/10_view.js`:
  - `view.setForced('turn' | 'fit' | null)`: forced landscape on a portrait window. `'turn'` draws
    the 1280 × 720 picture a quarter turn round to fill the window (`view.rot` = +1 clockwise, the
    home bar on the right; −1 when `screen.orientation.angle` is 180); `'fit'` keeps it upright and
    letterboxed (a tall desktop window; chosen for a mouse click or a key). `view.portrait` (which
    the shell already copies into `app.rotate` every frame) is false while forced. Forced landscape
    ends by itself as soon as the window is landscape.
  - `toLogical` maps pointer positions back through the turn, so the joystick, the dash button,
    the double tap and every menu follow the picture with no change in `40_input.js`.
    `toClient(lx, ly)` is the inverse (tests use it).
  - The size is re-read every frame in `begin()`, and on `orientationchange`, `visualViewport`
    resize and `screen.orientation` change: some browsers turn without a `resize` event or report
    the new size late.
  - `view.onTurn(fn)`: `fn(portrait)` the moment `portrait` changes. The UI opens the tap state
    from it, before the shell can run a tick (the frame loop steps the world before effects
    update, so an effect-based check let one tick through after turning back).
- No change to `90_shell.js` or `40_input.js`.

## Real cards against the GDD (no card edited)

The UI read every card's `hud()`, toasts, vfx kinds and decor ids. Nothing found that contradicts
GDD §5 / §9.3. The one test that failed after the merge was the UI's own:
`tests/ui/hud.test.js` expected `12/12` in an awakened quest slot (written against stand-ins);
the real quest cards show `각성` once awakened. GDD §5.4 only says the count is shown as `7/12`
and the frame turns gold for good after awakening, so `각성` is a valid reading; the test now
checks `각성`, the gold-frame state and that the count is gone.

## Interpretations of the GDD taken by the UI

- **Who draws which §9.3 feedback.** The cards already draw (requests/cards.md): the green heal
  number, the ink drawn into the blade, the gold quest dot to the slot, the stage words over the
  head, the 연참 timer ring at the feet (red blink under 1 s), the max afterglow on the blade,
  반격's pauldron flash and 발도's white blade. The UI keeps its own version of each only as a
  stand-in: it is skipped when the card's vfx arrives in the same tick or the card's decor is
  registered. The UI owns the slots, toasts, banners, sounds, the cape (length = combo stacks,
  ink drip on reset), the gold ring and cape crest on awakening, and the blade flash on equip.
- **Slot glow by family.** `hud().glow` means different things per card, so the slot shows it per
  family: target → red halo and the lit type icon; trigger (발도 ready) → pulsing white edge;
  quest (awakened) → gold wash under the gold frame.
- **반격 대기 가림막** (GDD §9.3): 반격's `ring` (cooldown left) is drawn both as the perimeter
  ring and as an ink shade over the icon (`hud().cover` if a card provides it).
- **Toasts the cards and the UI both send** (combo max, quest countdown, awakening) are shown once:
  the same text within a second is dropped. Reset reasons are toasted by the UI only when the
  card did not toast one starting with its name.
- **The rotate prompt and what follows** (`src/ui/65_rotate.js`, GDD §2.1 / §9.1 `rotate`). The
  prompt keeps `화면을 가로로 돌려 주세요` and adds what a touch does: `화면을 터치하면 / 가로 화면으로
  바로 시작합니다` (title, preparation), `…바로 이어집니다` (mid-run), `…봅니다` (a menu was open).
  - A touch on the prompt: forced landscape (item 8; `'turn'` for touch, `'fit'` for mouse/keys)
    and, in the same tap, the run starts or play continues. The run ends forced landscape only
    when the window is really landscape; play goes on without a restart.
  - Turning the device instead: on the title or preparation screen (and at launch), `화면을
    터치하면 시작` over the title art with the night it will be (the three cards); the first tap,
    click, Enter or Space starts. Mid-run, `화면을 터치하면 계속` over the held fight (dimmed except
    a window round the hero, the panel away from him) instead of the pause menu; one tap resumes.
    Esc goes to the title menu / P and Esc to the pause menu. Losing focus still pauses.
  - The hand is what the preparation screen would deal: `NAV.deal` (a fresh seed, the saved depth,
    §5.6, no reroll spent), or on the preparation screen the night it shows. The preparation screen
    is skipped on this path only. With the URL test hooks the URL's run starts, as 출정 does.
  - The tap is claimed on press and acts on release (a user gesture for audio, touch included); it
    clears any pending dash request and the double-tap timer, so it is never a move, a dash-button
    press or half of a double tap. The engine gives no invulnerability on resuming from pause, so
    none is added here either.
  - Where a menu overlay was open (pause, help, settings), at the altar, on codex/result, or in a
    bot run, turning back returns to where it was.
- **`?seed`, `?hand`, `?floor` or `?bot` in the URL** make 출정 start the run at once (skipping the
  preparation screen), so accept.js criteria 2, 13, 14 keep working with one Enter.
- **First-run hints** are on while `settings.hints` is true and switch off after the first finished
  run; 설정 → 첫 판 안내 → 다시 보기 turns them on again.
- **Phone legibility.** The logical canvas is 1280 × 720; on a 667 × 375 phone everything is
  ×0.52, so HUD text is kept at ≥ 18 logical px (≈ 9.5 css px) and running text at 21–27; menu
  buttons get hit areas up to the gaps between them.

## Notes for the merge

- `src/ui/basic/` is deleted; `BD.ui.FAMILY_COLORS` is still defined (in `src/ui/00_kit.js`).
- The UI registers a `play` screen (draws nothing; `M` toggles sound).
- Enemies of the other branch are read only through `kind` → `BD.enemies`, `def.name`,
  `def.attacks[id].name`, `def.guardian.name`, `e.guardian / e.boss / e.elite`, `e.mem.phase`.
  `tests/ui/fixtures/standins.js` registers skel_archer, ghoul, mage and dark_knight stand-ins
  for the UI tests and screenshots only when the real ids are missing.

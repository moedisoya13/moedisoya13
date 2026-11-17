# UI agent — engine requests (ARCHITECTURE §7)

No engine file was edited on the UI branch. Everything below works today through a workaround
inside `src/ui/`; each item says what the workaround is and the smallest engine change that
would replace it.

## 1. Bug: the event bus overwrites `type` in `hit` and `kill` payloads

`src/core/03_events.js`, `Bus.emit`: `payload.type = name;` runs after the payload is built,
so the GDD §5.2 field `type` (the enemy's type, `beast|undead|magic|heavy|boss`) of `hit` and
`kill` reads `'hit'` / `'kill'` in every listener and in `__BD.events()`.

- Impact: any card that checks `ev.type === 'undead'` in `on.kill` / `on.hit` (rest_of_dead,
  mana_backlash, holy_light by event) never fires. The cards agent may hit this.
- UI workaround: the UI derives the type from `ev.kind` (`BD.enemies.get(kind).type`).
- Smallest fix: keep the event name in another field of the log record (e.g. `payload.ev = name`)
  — but `.type` is how `accept.js`, the tests and `__BD.events()` users read the event name,
  so either rename the GDD payload field in the code (e.g. `etype`) or store the name as `type`
  only when the payload has no `type` and add `ev` everywhere. Lead's call.

## 2. Hit-stop needs a hold in the shell's frame loop

GDD/art direction ask for hit-stop. The shell steps the world from `params.speed × real time`.

- UI workaround (`src/ui/30_feel.js`, `FEEL.hitstop`): sets `window.__BD.params.speed = 0` for
  45–200 ms and restores it. Only when the speed is 1 (test runs at higher speeds are left
  alone); restored on leaving play, on death and on win. No tick is added or skipped, so the
  simulation stays deterministic. `__BD.step()` and the Node harness are not affected.
- Smallest engine change: in `src/client/90_shell.js` `frame()`, skip stepping while
  `ui.hold > 0` and count it down: `if (ui.hold > 0) { ui.hold -= dt; acc = 0; } else if (ready && …)`.
  The UI would then set `ui.hold` instead of touching `params`.

## 3. The shell's menu focus highlight uses a partial list

`ui.button()` (90_shell.js) computes focus with `menu[ui.focus % menu.length]` while the frame's
menu list is still being built, so with focus ≥ 1 an earlier button can also look focused. The
UI draws all its buttons itself (`style: 'none'` + `K.button`, focus from the previous frame's
list, as `ui.key` uses) so this does not show; any code using the shell's drawn buttons would.

## 4. Presentation hooks the UI derives itself (would be nicer as events)

- Guardian entrance banner `수호자 — …` (GDD §9.2): derived from `spawn` + `e.guardian`.
- Trial start/clear banners: from `trial_start` / `trial_clear`.
- Telegraph style (mage blink) for sounds: read from `w.telegraphs` by the `telegraph` event's id;
  a `style` field on the event would be simpler.
- Enemy attack sounds: the UI maps GDD attack ids (`fire_circle`, `charge`, `cleave`, `thorns`,
  `blink`) and also honours `def.attacks[id].sfx` (on hit) / `.sfxStart` (on warning) if the
  enemies agent sets them. Suggest the enemies agent add those fields for exact control.

## 5. Audio unlock on iOS

`AU.unlock` creates the context on `pointerdown`/`keydown`. iOS Safari has historically only
started audio from `touchend`/`click`. The UI adds window `touchend`/`click` listeners that call
`ac.resume()` when suspended, and every sound calls `resume()` if needed. Not verified on a
device. Suggest calling `ac.resume()` in `AU.unlock` as well.

## 6. Dawn sky

`R.drawSky` brightens the gradient's bottom from 03:00, but the tower and skyline cover most of
it, so the change is faint. The UI adds a warm glow from the bottom corners (03:00→06:00), a top
band, the clock box warming, and burning edges after 06:00. If the engine wants the skyline
windows to dim or the far buildings to lighten toward dawn, that belongs in `buildStatic`.

## 7. Notes for the merge

- `src/ui/basic/` is deleted; `BD.ui.FAMILY_COLORS` is still defined (in `src/ui/00_kit.js`).
- The UI registers a `play` screen (draw nothing; `M` toggles sound).
- Card HUD: the UI reads `def.hud(state, ctx)` and fills in what is missing from state
  (`progress/goal`, `×stack`, target glow by `def.targetType`, timer warning from `state.timer`,
  stage badges for `flawless`/`one_flash` from GDD §5.5). Cards can override with `text, ring,
  pips, glow, badge`.
- Combo resets: if a card does not toast its reset itself, the UI toasts the GDD wording
  (`… 끊김 / 깨짐: <attack> / 흐트러짐: 품을 내줬다`), so a card that does toast is shown once.
- `?seed`, `?hand`, `?floor` or `?bot` in the URL make 출정 start the run at once (skipping the
  preparation screen), so accept.js criteria 2, 13, 14 keep working with one Enter.

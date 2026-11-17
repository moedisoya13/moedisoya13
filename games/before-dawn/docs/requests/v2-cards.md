# v2 cards — what the cards side built, the hooks it needs, the engine edits it made

Branch `v2-cards` (docs/GDD-V2.md §4, §11.2-4). All 18 cards have their five levels (§4.4), the
seven boons are registered (§4.5), the growth choice and the chest follow §4.3 / §4.6 with no dead
offer, the altar does §4.6 to the hand, every card is dealt again, and the two v2 unlocks (§8)
are in. Every number that differs from GDD-V2 is under **Tuning** at the end.

Files: `src/content/cards/*.js` (levels next to each card's rules and drawers),
`src/content/cards/_altar.js` (the altar), `src/content/boons/{body,long,step,wide}.js`,
`tests/cards/*` (levels_table, levels_more, boons, offers, altar + the v1 files moved to the v2
level-1 numbers), `tests/cards/balance.js` (the balance runs below), `tests/cards/combos.js` (816
hands at mixed levels).

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

(filled in below after the balance runs)

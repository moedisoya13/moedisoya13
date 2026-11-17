# Requests from the stage art (v2-art) to the gameplay side

The stage already draws whatever the generator emits today (it infers props from SOLID cells), so
none of these blocks anything. They let the floors look like what the design means. Ids and
footprints: docs/ARCHITECTURE.md §10.

1. **Name the layout and the zone fills on each big floor.** Put
   `floor.stage = { layout, zones: [{ zx, zy, fill }] }` on every generated floor (GDD-V2 §5.3
   배치 유형, §5.2 채우기 ids). The layout picks the prop look of a shape (a 1 × 3 block is a
   partition in an office, a planter in a plaza, a bench in a hall, rubble in a ruin; a thin
   ≥ 8-cell run is a glass wall in an office and a stone wall in a hall); the fill picks the floor
   (carpet under `aisle`/`cubicles`, a dark carpet inside a `chamber`, an inlay on `pillars`/`ring`/
   `open`). Without it the art guesses the layout from the v1 pattern id and the fill from what
   stands in the zone.
2. **Optional: name props.** To force a look, add `floor.stage.props = [{ id, x, y, w, h, v?,
   state? }]`; every footprint cell must be SOLID (the art does not change collision). Cells not
   covered are still inferred. Useful for `wall` with `state: 'glass' | 'stone' | 'concrete'`.
3. **Sites as data.** Put the places a floor asks you to go in `w.sites = [{ id, x, y, state }]` (or
   `floor.sites`) with ids `seal nest brazier spring chest rift altar` and keep `state` current:
   seal `intact → cracked → broken` (by progress, e.g. cracked at ≥ 50 %), nest `alive → dead`,
   brazier `cold → lit` (lit while the 40 s run, or once the beacon rises — your call), spring
   `full → dry`, chest `closed → open`, rift `available → active → spent`. The v1 `w.altar`,
   `w.trial` and `w.stairs` keep working as they are. The art draws only the object; rings,
   progress arcs and markers stay yours.
4. **Floor type on the rooftop.** The rooftop must keep `domType: 'rooftop'` (the art reads it for
   the parapet, the castle stone and the growth density). A 28 × 28 rooftop is a big floor and gets
   the chunked stage automatically.
5. **Content obstacle drawers.** `BD.render.obstacles` (src/content/rooms/*.js) is no longer called
   by the renderer; the catalogue draws every obstacle. The drawers can stay (harmless) or be
   deleted by their owner.
6. **Do not put a site's centre within 1 u of a SOLID cell** if it can be avoided: sites are drawn
   0.6–0.85 u wide and would sit inside a desk or a column (the showcase floor avoids it by hand).

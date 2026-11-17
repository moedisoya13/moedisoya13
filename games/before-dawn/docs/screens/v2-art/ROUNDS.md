# Stage art rounds — 여명 전야 v2 (low-poly comic stage)

Each round: render the 48 × 48 stage at 1280 × 720 and 667 × 375 (device scale 2) on the five floor
colours from three spots (mid, back corner, front edge), put it beside
`docs/prior/style-reference-A.jpg`, write what still looks wrong, fix, render again.

Tools: `node tests/art/shoot.js <dir> [--engine] [--layout …]`, `node tests/art/sheet.js <png>`,
`node tests/art/perf.js [--art]`. Contact sheets are `sheet-<size>.jpg` in each folder
(rows = mid / back / front, columns = beast, undead, magic, heavy, rooftop).

## Before (`before/`, engine staging)

![before 1280](before/sheet-1280x720.jpg)

A flat checkerboard of identical tiles in the floor colour; obstacles are plain grey boxes; the
back walls are a thin dark strip with one desk; the facade below the slab edge is a field of
coloured dots; three purple triangles at the corners are the only demon-castle growth. On a
48 × 48 floor most of the screen is that checkerboard.

## Round 1 (`round1/`, showcase floor: all eight zone fills, office look)

![round 1 1280](round1/sheet-1280x720.jpg)

First render of the new system: facet kit, prop catalogue sliced per cell, stage model inferring
props from SOLID cells, static painter (facade with storeys and lit windows, slab lip, flat floor
with seams/joints/wear/cracks/stones, cast shadows with halftone, curtain walls with pilasters and
the section cut, wall items, the broken elevator, furniture along the walls), flat sky bands with
three parallax skyline strips, sites. Frame time unchanged (below).

Found, against the reference:
1. Growths are far too small and sparse. The reference frames the stage with crystal and spike
   clusters taller than a character at the corners and along the walls and the slab edge.
2. The glass curtain wall reads as a black slab; the reference shows the lit city through it.
3. In the office look every boundary and the chamber are glass boxes of one height: the middle of
   the floor turns into rows of identical glass, busy and monotone.
4. The moon sits under the clock/minimap HUD; the open sky above the back walls is bare bands.
5. Floor types differ by colour and a few prop swaps only (bookshelves, weapon racks, dead
   shrubs). Not enough to tell beast from undead with the colour removed.
6. The prop sheet shows several multi-cell props at 1 × 1 (crate, crystal_mass, rubble, wall…).

Fixed for round 2: growth clusters 1.5–2× taller, tallest in the middle of a clump, corner masses
of 8–10 shards, clumps every ~4–6 u along the walls and the slab edge, a few crystals grown into
the facade, see-through when they cover the hero; the city painted into every glass pane
(towers, lit windows, signs) with smashed panes on the beast/undead floors; office glass
partitions lowered to 54 px; the moon moved clear of the HUD; floor types got their own wall
items (claws / cobwebs / sigils / shields and banners), furniture along the walls (crates, shelves,
weapon racks), litter against walls and props only (twigs, bones and candles, crystal shardlets,
bolts and chains, gravel and drains) and floors (beast claw gouges, undead cracks, magic cracks
that glow, heavy steel deck); the sheet shows multi-cell props at a representative size.

## Round 2 (`round2/`)

![round 2 1280](round2/sheet-1280x720.jpg)
![round 2 667](round2/sheet-667x375.jpg)

Side by side with the reference (`back-undead-1280x720.jpg`):
1. The floor is still too clean. The reference has big dark grime patches, rubble chunks and ink
   blots crowding the walls and the slab edge; ours had small faint patches spread evenly.
2. Solid wall bays are a light flat grey; the reference's concrete is darker, panelled, cracked.
3. The heavy floor's 2-u steel plates make a regular grid again, the thing the lead disliked.
4. 2 × 2 columns read as pedestals (base, shaft, capital, plaque) rather than structure.
5. Props' ink is thin at the game's zoom next to the reference's brush lines.
6. Frame time: the stairs door drew a halftone shard every frame, which made the browser raster
   the chunk blits synchronously (found by timing drawWorld's steps from inside).

Fixed for round 3: bigger and darker grime patches crowding the walls and the slab edge, rubble
heaps of 3–6 chunks and large ink blots there, a calmer middle; concrete bays darker with panel
seams, streaks and cracks; the heavy deck in 4-u plates with rivets along the seams; columns
(1 × 1 and 2 × 2) run up to the section cut with the walls' light cut face; prop ink 2.2 px; the
stairs door cached per state (only the chains' pulse is drawn per frame).

## Round 3 (`round3/`)

![round 3 1280](round3/sheet-1280x720.jpg)
![round 3 667](round3/sheet-667x375.jpg)

Extra states (`tests/art/extra.js`): a v1 room (1F) and the 13 × 13 rooftop now look like the
reference's diorama (walls with glass city, elevator, sealed stairs door, corner crystal masses,
rubble, facade); dawn turns the top bands pink and fades the moon and windows; red and white
hatched warnings read cleanly over the steel deck and the yellow grime.

Found:
1. On the magic floor the bookshelves are purple wood on a purple floor: the same hue.
2. Slab-edge growths and tall props hide enemies (and parts of warnings) standing behind them;
   only the hero got the see-through. GDD-V2 §5.9 asks that any figure behind a tall prop stays
   visible.
3. The sprite cache was bounded by count (600); at device scale 2 that can reach ~150 MB.

Fixed: walnut shelves on magic; a tall prop slice or a slab-edge growth turns see-through (42 %)
when it covers the hero, any on-screen enemy or a warning behind it; the sprite cache is bounded
by 12 M device px.

## After (`after/`, final)

![after 1280](after/sheet-1280x720.jpg)
![after 667](after/sheet-667x375.jpg)

The first after-render of the see-through used each figure's whole box: with a crowd at the slab
edge nearly every growth went ghostly. It now fades only when the middle of a body (or a warning's
centre) lies inside the prop's core, so a growth fades for the slime it actually hides and stays
solid otherwise. Extra states in `after/extra/` (v1 1F room, rooftop, dawn, warnings on red and
yellow). Every prop, site state, wall item and growth with its id: `prop-sheet.png`.

Left as is, noted: the `office` showcase puts glass partitions round every zone (that is the
§5.3 office layout with doors, and the showcase also forces a chamber into it); the 2 × 2 column
is a plain block; the hero's and enemies' looks are not the stage's.

## Frame time (48 × 48 staged floor, 110 enemies, headless Chromium)

`node tests/art/perf.js` — `__BD.stage({size: [48, 48], enemies: 110})`, the hero walking a square,
dead enemies topped up. `js` = the whole rAF callback; `full` = js + a 1-px readback that forces
the canvas to raster. Phone = 667 × 375 at device scale 2 with the CPU throttled ×4. Milliseconds,
p50 / p95.

| profile | before (4b98841) js | before full | after js | after full | after, showcase floor full |
|---|---|---|---|---|---|
| desktop 1280 × 720 | 15.0 / 23.8 | 28.1 / 38.1 | 11.6 / 19.1 | 24.8 / 38.4 | 25.8 / 39.4 |
| phone ×4 throttle | 108.7 / 153.7 | 184.0 / 273.8 | 98.3 / 150.4 | 162.2 / 264.2 | 172.5 / 237.0 |

Like for like, the world draw alone on the same staged floor, rastered (`drawWorld` ×60 with a
readback each): mid-floor 6.72 → 3.56 ms, back corner 7.86 → 5.57 ms, mid-floor with 110 enemies
(43 on screen) 9.82 → 6.30 ms. The stage got cheaper: the sky is skipped where the stage covers
it, obstacles are cached slices instead of per-frame prisms. Chunk paints average 4 ms (desktop)
and 10–14 ms (throttled), one per frame ahead of the camera. Enemies dominate the frame either
way. These are software-raster numbers: the phone row is a relative measure, not a proof of
60 fps on a real phone.

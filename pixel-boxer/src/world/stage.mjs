/* Where a page's bout is drawn: the ring (its plain canvas and posts, and its ropes, bent where the men press them: ropes.mjs)
   or the underground pit (its floor and edge, and its crowd, an twelfth of it a layer, reacting: pit.mjs). The game page, the
   sparring page and the review sheet draw it the same way:
     const parts = await loadArena(manifest, name, get)     get(part) -> its rows (render/splats.mjs unpack)
     const A = createArena(R, manifest, parts)               R: the renderer
       A.name, A.edge (what a replay's camera keeps inside: the ropes, or the pit's edge), A.hall (the dark round it),
       A.floor (the colours of what is drawn on its floor: shadows and dust)
       A.hear(e)                     an event of the bout (the crowd's reactions)
       A.ground(groundRow) -> the layer the bout stands on (a ring through the canvas goes through it)
       A.over(men, dt, cam) -> the layers drawn over it: the ropes, bent by the men (each one's points), or the crowd's twelfths
                              a camera at cam.yaw sees past, posed dt on
   ?arena= on a page names it (arenaOf: 'ring' unless it is one of ARENAS). */
import { paletteArray, rgb } from '../render/renderer.mjs';
import { dress } from '../rig/boxer.mjs';
import { RING } from './ring.mjs';
import { createRopes } from './ropes.mjs';
import { arenaOf, PIT, CROWD, PER, pitPalette, crowdPalette, sectorOf, createCrowd } from './pit.mjs';

export { arenaOf };
const HALL = [0x171a2c, 0x11131f, 0x0c0d16, 0x090a11];

export async function loadArena(manifest, name, get) {
  if (arenaOf(name) === 'ring') {
    const [ring, ropes] = await Promise.all([get(manifest.ring), manifest.ropes ? get(manifest.ropes) : null]);
    return { name: 'ring', ring, ropes };
  }
  const [pit, crowd] = await Promise.all([get(manifest.pit), get(manifest.crowd)]);
  return { name: 'underground', pit, crowd };
}

export function createArena(R, manifest, parts) {
  const base = paletteArray(dress(manifest.palette, 0));
  if (parts.name === 'ring') {
    const ground = R.mesh(parts.ring, manifest.ring.count),
      ropes = parts.ropes ? createRopes(parts.ropes, manifest.ropes.count) : null,
      rope = ropes ? R.mesh(ropes.rows, manifest.ropes.count, true) : null;
    return {
      name: 'ring',
      edge: RING.rope,
      hall: new Float32Array(HALL.flatMap(rgb)),
      floor: base,
      ropes,
      hear() {},
      ground: row => ({ mesh: ground, palette: base, mask: 0.5, ground: row }),
      over(men, dt) {
        if (!rope) return [];
        if (ropes.update(men.map(m => m && m.points), dt)) rope.update(ropes.rows, manifest.ropes.count);
        return [{ mesh: rope, palette: base, mask: 0.5 }];
      }
    };
  }
  /* (the crowd's twelfths: by the figures' places, each figure's splats in one; a figure's arms ride its group's bones) */
  const floor = paletteArray(pitPalette(dress(manifest.palette, 0))),
    people = paletteArray(crowdPalette(manifest.palette)),
    ground = R.mesh(parts.pit, manifest.pit.count),
    crowd = createCrowd(),
    twelfths = figuresBySector(parts.crowd, manifest.crowd.count).map(rows => R.mesh(rows, rows.length / 12)),
    bones = twelfths.map(() => new Float32Array(R.maxBones * 12));
  return {
    name: 'underground',
    edge: PIT.edge,
    hall: new Float32Array(PIT.hall.flatMap(rgb)),
    floor,
    crowd,
    hear: e => crowd.hear(e),
    ground: row => ({ mesh: ground, palette: floor, mask: 0.5, ground: row }),
    over(men, dt, cam) {
      crowd.update(dt);
      return crowd.facing(cam.yaw).map(s => ({ mesh: twelfths[s], palette: people, mask: 0.5, bones: crowd.bones(s, bones[s]) }));
    }
  };
}
// (each figure's splats, PER of them one after another, in the twelfth its first stands in)
export function figuresBySector(rows, count) {
  const per = Array.from({ length: CROWD.sectors }, () => []);
  for (let f = 0; f * PER < count; f++) per[sectorOf(rows[f * PER * 12], rows[f * PER * 12 + 2])].push(f);
  return per.map(list => {
    const out = new Float32Array(list.length * PER * 12);
    list.forEach((f, k) => out.set(rows.subarray(f * PER * 12, (f + 1) * PER * 12), k * PER * 12));
    return out;
  });
}

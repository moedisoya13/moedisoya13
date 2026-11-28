/* Where a page's bout is drawn: the ring (its plain canvas and posts, and its ropes, bent where the men press them: ropes.mjs)
   or the underground pit (its floor and edge, and its crowd, an twelfth of it a layer, reacting: pit.mjs). The game page, the
   sparring page and the review sheet draw it the same way:
     const parts = await loadArena(manifest, name, get)     get(part) -> its rows (render/splats.mjs unpack)
     const A = createArena(R, manifest, parts)               R: the renderer
       A.name, A.edge (what a replay's camera keeps inside: the ropes, or the pit's edge), A.hall (the dark round it),
       A.floor (the colours of what is drawn on its floor: shadows and dust)
       A.hear(e)                     an event of the bout (the crowd's reactions)
       A.ground(groundRow) -> the layer the bout stands on (a ring through the canvas goes through it)
       A.over(men, dt, cam) -> the layers drawn over it: the ropes, bent by the men (each one's points), or the pit's edge and
                              the crowd's twelfths a camera at cam.yaw sees past, posed dt on (both thinned on the camera's
                              side, NEAR, and the crowd toward the top of the picture, where the page's lettering is)
   ?arena= on a page names it (arenaOf: 'ring' unless it is one of ARENAS). */
import { paletteArray, rgb } from '../render/renderer.mjs';
import { dress } from '../rig/boxer.mjs';
import { RING } from './ring.mjs';
import { createRopes } from './ropes.mjs';
import { arenaOf, PIT, CROWD, PER, pitPalette, crowdPalette, sectorOf, createCrowd } from './pit.mjs';

export { arenaOf };
const HALL = [0x171a2c, 0x11131f, 0x0c0d16, 0x090a11];
/* The pit's edge and its crowd, thinned on the camera's side (renderer.mjs layer.cut), by the angle round the pit between
   the way out to a splat and the way out to the camera, in degrees: the walls and drums between the camera and the fight are
   not drawn within `edge[0]` of it and are all drawn past `edge[1]`, dithered between (the user, 2026-11-28, card
   pit-near-wall: hide), so that on a tall phone screen they do not cover the men; the crowd is not drawn within `crowd[0]`
   and all of it is past `crowd[1]`, so that no one stands beside the lens drawn bigger than the men (card a-pit-hud) and
   the camera turning brings them in and out a few at a time (card pit-crowd-pop: fade); a twelfth of it wholly within
   `crowd[0]` is not drawn at all (world/pit.mjs facing, `wide`). The bands are narrow, so that little stands half drawn:
   what crosses one does so as the camera turns, in a quarter of a second or so. And the crowd thins out toward the top of
   the picture: none of it in the top `top[0]` CSS pixels of the canvas, all of it below `top[1]` (the page's lettering
   there, the corners' names, the round and a blow's impulse, over the dark as in the ring: card a-pit-hud). */
export const NEAR = { edge: [52, 60], crowd: [102, 110], top: [52, 80], wide: 1.45 };
const cos = deg => Math.cos((deg * Math.PI) / 180);
export const cutOf = (yaw, [hide, show], above) => [Math.sin(yaw), Math.cos(yaw), cos(hide), cos(show), above];

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
    [flat, standing] = byHeight(parts.pit, manifest.pit.count, EDGE_Y),
    ground = R.mesh(flat, flat.length / 12),
    edge = R.mesh(standing, standing.length / 12),
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
      const cut = cutOf(cam.yaw, NEAR.crowd, -1e3),
        tall = (R.gl && R.gl.canvas && R.gl.canvas.clientHeight) || 0,
        top = tall > 0 ? NEAR.top.map(px => Math.min(1, px / tall)) : null;
      return [
        { mesh: edge, palette: floor, mask: 0.5, cut: cutOf(cam.yaw, NEAR.edge, EDGE_Y) },
        ...crowd.facing(cam.yaw, NEAR.wide).map(s => ({ mesh: twelfths[s], palette: people, mask: 0.5, bones: crowd.bones(s, bones[s]), cut, top }))
      ];
    }
  };
}
// (the pit's splats lying on its floor, and those standing up off it: its walls, its drums and its lamp)
const EDGE_Y = 0.012;
export function byHeight(rows, count, y) {
  const low = [],
    high = [];
  for (let i = 0; i < count; i++) (rows[i * 12 + 1] > y ? high : low).push(i);
  const take = list => {
    const out = new Float32Array(list.length * 12);
    list.forEach((i, k) => out.set(rows.subarray(i * 12, i * 12 + 12), k * 12));
    return out;
  };
  return [take(low), take(high)];
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

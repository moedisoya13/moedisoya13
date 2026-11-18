/* The swordsman, sculpted as signed-distance solids around the joints of a bind pose. Every solid is tagged with the joint that
   carries it and made `whole`, so a bending joint is two complete surfaces sliding inside each other and never shows a hole.
   Shapes are placed in joint space (the T-pose's axes at that joint), so the same code sculpts the figure in any bind pose:
   the light baked into the splats then belongs to the stance the figure spends most of its time in. */
import * as M from './m3.mjs';

// Palette: index 0 is the backdrop. Each material is a ramp of indices from shadow to light.
const PALETTE = [
  0x0b0d14,
  0x4a2a30, 0x8a4c40, 0xc98262, 0xf0bc94, // 1-4 skin
  0x10152b, 0x1b2750, 0x2c4186, 0x4868bd, 0x86a6e6, // 5-9 indigo coat
  0x2b2733, 0x4a4456, 0x756d80, 0xa59fab, // 10-13 ash trousers
  0x4d3a1f, 0x86662f, 0xbf9648, 0xe9cd80, // 14-17 straw
  0x4c0f1c, 0x931c2a, 0xd23a38, 0xf5805c, // 18-21 scarlet scarf
  0x2e3848, 0x70829a, 0xbccbdb, 0xffffff, // 22-25 steel
  0x171a22, 0x252a38, 0x394052, 0x525b70, // 26-29 stone
  0x2a1216, 0x5c1f1f, 0x97302a, 0xc9553a, // 30-33 vermilion timber
  0x0f211d, 0x1a372a, 0x2c5637, 0x55854a, // 34-37 bamboo
  0x727b96, 0xa3acc4, // 38-39 pale stone
  0xffb85a, 0xffe9a8, // 40-41 lamplight
  0xcfdcff, 0xf4f7ff // 42-43 moon
];
const MAT = {
  skin: { r: [1, 2, 3, 4] },
  coat: { r: [5, 6, 7, 8, 9] },
  trousers: { r: [10, 11, 12, 13] },
  straw: { r: [14, 15, 16, 17] },
  scarf: { r: [18, 19, 20, 21] },
  steel: { r: [23, 24, 24, 25] }, // never dark: the blade is the one line that must read in every frame
  grip: { r: [26, 27, 18, 19] },
  brass: { r: [14, 15, 16, 17] },
  hair: { r: [26, 26, 27, 28] },
  ground: { r: [26, 27, 28, 29] },
  stone: { r: [26, 27, 28, 29, 38] },
  paleStone: { r: [27, 28, 29, 38, 39] },
  timber: { r: [30, 31, 32, 33] },
  bamboo: { r: [34, 35, 36, 37] },
  lamp: { r: [40, 41, 41], em: true },
  moon: { r: [42, 43, 43], em: true }
};

function sculptSwordsman(S, bind, o) {
  o = o || {};
  const res = o.res || 0.028;
  const frame = name => [M.col(bind.R[name], 0), M.col(bind.R[name], 1), M.col(bind.R[name], 2)];
  const at = (name, local) => M.add(bind.p[name], M.app(bind.R[name], local || [0, 0, 0]));
  const opt = (name, more) => Object.assign({ tag: name, whole: true, res, ax: frame(name) }, more);
  const ball = (name, local, r, mat, more) => S.ball(at(name, local), r, mat, opt(name, more));
  const tube = (name, a, b, r0, r1, mat, more) => S.tube([at(name, a), at(name, b)], r0, r1, mat, opt(name, Object.assign({ ax: undefined }, more)));

  // torso
  ball('Hips', [0, 0.0, 0], [0.155, 0.115, 0.12], MAT.trousers);
  tube('Spine1', [0, -0.04, 0], [0, 0.11, 0], 0.125, 0.12, MAT.coat);
  tube('Spine2', [0, -0.02, 0], [0, 0.1, 0], 0.122, 0.135, MAT.coat);
  ball('Chest', [0, 0.05, 0.005], [0.175, 0.135, 0.125], MAT.coat);
  // a sash at the waist: one bright band to break the coat from the trousers
  S.torus(at('Spine1', [0, -0.02, 0]), 0.118, 0.03, MAT.scarf, opt('Spine1'));

  // neck, head, hair, hat
  tube('Neck1', [0, -0.03, 0], [0, 0.08, 0], 0.048, 0.045, MAT.skin);
  // the head is a size too big on purpose: at fighting distance it is a dozen pixels, and has to carry the face
  ball('Head', [0, 0.115, 0.014], [0.14, 0.148, 0.142], MAT.skin);
  ball('Head', [0, 0.15, -0.04], [0.146, 0.135, 0.132], MAT.hair);
  tube('Head', [0, 0.12, -0.13], [0, 0.0, -0.2], 0.045, 0.018, MAT.hair); // tied tail
  // eyes: two dark dabs, enough to say which way the face looks
  for (const e of [-1, 1]) ball('Head', [e * 0.055, 0.115, 0.135], [0.022, 0.03, 0.02], MAT.hair);
  // the hat sits back on the crown so the brim's shadow falls behind the face
  S.lathe(at('Head', [0, 0.225, -0.03]), 0.14, [0.31, 0.19, 0.085, 0.02], MAT.straw, opt('Head'));

  // scarf: a ring at the neck and a tail in two lengths that trail behind
  S.torus(at('Chest', [0, 0.165, 0.005]), 0.082, 0.045, MAT.scarf, opt('Chest'));

  for (const sideName of ['Left', 'Right']) {
    const s = sideName === 'Left' ? 1 : -1;
    // arm: the bone runs along the joint's own X, outward
    ball(sideName + 'Shoulder', [s * 0.13, 0, 0], 0.075, MAT.coat);
    tube(sideName + 'Arm', [0, 0, 0], [s * 0.26, 0, 0], 0.066, 0.056, MAT.coat);
    tube(sideName + 'ForeArm', [0, 0, 0], [s * 0.2, 0, 0], 0.056, 0.064, MAT.coat); // sleeve widens to the cuff
    tube(sideName + 'ForeArm', [s * 0.17, 0, 0], [s * 0.245, 0, 0], 0.04, 0.036, MAT.skin);
    ball(sideName + 'Hand', [s * 0.05, 0, 0], [0.062, 0.05, 0.058], MAT.skin);
    // leg: wide trousers gathered at the shin, a dark boot
    tube(sideName + 'Leg', [0, 0.02, 0], [0, -0.4, 0], 0.11, 0.102, MAT.trousers);
    tube(sideName + 'Shin', [0, 0, 0], [0, -0.3, 0], 0.102, 0.094, MAT.trousers);
    tube(sideName + 'Shin', [0, -0.27, 0], [0, -0.41, 0], 0.05, 0.046, MAT.hair);
    ball(sideName + 'Foot', [0, -0.04, 0.05], [0.062, 0.05, 0.11], MAT.hair);
    ball(sideName + 'ToeBase', [0, 0.015, 0.01], [0.058, 0.04, 0.055], MAT.hair);
  }

  // sword: grip front to back through the fist, guard, and a blade thick enough to hold a pixel at fighting distance
  tube('Sword', [0, 0, -0.13], [0, 0, 0.075], 0.02, 0.02, MAT.grip);
  ball('Sword', [0, 0, -0.14], 0.027, MAT.brass);
  ball('Sword', [0, 0, 0.085], [0.05, 0.05, 0.014], MAT.brass);
  S.box(at('Sword', [0, 0, 0.56]), [0.011, 0.03, 0.47], MAT.steel, opt('Sword'));
  tube('Sword', [0, 0.004, 1.02], [0, -0.022, 1.09], 0.022, 0.004, MAT.steel);
}

export { PALETTE, MAT, sculptSwordsman };

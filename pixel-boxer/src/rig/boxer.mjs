/* The boxer, sculpted as signed-distance solids round the joints of his guard, each tagged with the joint that carries it and
   made whole, so a bending joint never opens a hole. Head, gloves and feet are a size too big on purpose: at the distance the
   match is watched from they are what a pose is read by. */
import * as M from './m3.mjs';

export const PALETTE = [
  0x090a11,
  0x5c2e2a, 0x9c5a42, 0xd38e64, 0xf4c096, // 1-4 skin
  0x15121a, 0x2a2430, 0x443a48, // 5-7 hair
  0x4a0e1c, 0x8e1828, 0xd03238, 0xf66c5a, // 8-11 trunks
  0x8c8a86, 0xc9c6bd, 0xf6f3ea, // 12-14 trim
  0x5e0e16, 0xac1a22, 0xe6382e, 0xff7c5e, // 15-18 gloves
  0x16151c, 0x2c2b36, 0x4a4958, // 19-21 boots
  0x27324c, 0x3a496c, 0x546890, 0x7890b6, // 22-25 canvas
  0x11152a, 0x1b2242, 0x2a3562, // 26-28 apron
  0x363d4e, 0x687186, 0xa6afc2, // 29-31 steel
  0x7a1422, 0xc42a30, 0xf05a4a, // 32-34 red rope and corner
  0x163a8a, 0x2a62d6, 0x62a0ff, // 35-37 blue rope and corner
  0xffffff, 0xffe9a8, 0xffc24a, // 38-40 sparks
  0xbfe6ff, // 41 sweat
  0x0d0f19, 0x151826 // 42-43 the hall beyond the ring
];
// the other corner: the same sculpt in other colours, by swapping palette entries
export const RIVAL = {
  1: 0x2c1a1e, 2: 0x573226, 3: 0x875236, 4: 0xb67a50,
  8: 0x0e2858, 9: 0x1a4696, 10: 0x2e74d6, 11: 0x6aaeff,
  12: 0x8a6a20, 13: 0xc9a03a, 14: 0xf2d470,
  15: 0x0c2a66, 16: 0x1650b4, 17: 0x2a84ec, 18: 0x74c0ff
};
/* What he may wear (sculptBoxer's o.wear): a training suit, a grey hooded sweatshirt and sweatpants, with the hood down
   ('training') or up ('training-up'). The suit is sculpted in the trunks' ramp (8-11), which it hides, and drawn grey by
   putting these colours in that ramp's place, so it takes no slot of the palette. Its ribbing, the hood's inside and the
   pants' drawstring take the darker steps of the same ramp; the sweatshirt's drawstrings and the shoes' soles, the trim's. WEAR is the red corner's (a heather
   grey), RIVAL_WEAR the other corner's (a charcoal a step darker, so that the two are told apart). */
const HEATHER = { 8: 0x3e4046, 9: 0x62656c, 10: 0x8d9097, 11: 0xb5b8be },
  CHARCOAL = { 8: 0x2b2d33, 9: 0x464950, 10: 0x6b6e76, 11: 0x93969e };
export const WEAR = { training: HEATHER, 'training-up': HEATHER };
export const RIVAL_WEAR = { training: CHARCOAL, 'training-up': CHARCOAL };
// the colours one corner is drawn in: the palette, the other corner's swaps (corner 1), and what he wears ('' or none: as he is)
export const dress = (palette, corner, wear) =>
  palette.map((hex, i) => (wear ? ((corner ? RIVAL_WEAR : WEAR)[wear] || {})[i] : undefined) ?? (corner ? RIVAL[i] : undefined) ?? hex);
export const MAT = {
  skin: { r: [1, 2, 3, 4] },
  hair: { r: [5, 5, 6, 7] },
  trunks: { r: [8, 9, 10, 11] },
  trim: { r: [12, 13, 14] },
  glove: { r: [15, 16, 17, 18] },
  boot: { r: [19, 20, 21] },
  canvas: { r: [22, 23, 24, 25] },
  apron: { r: [26, 27, 28] },
  steel: { r: [29, 30, 31] },
  red: { r: [32, 33, 34] },
  blue: { r: [35, 36, 37] },
  white: { r: [12, 13, 14] },
  // the training suit (WEAR): its cloth, its sleeves, its ribbing and the inside of its hood, in the trunks' ramp
  cloth: { r: [8, 9, 10, 11] },
  /* (the sleeves start a step up it: the rear arm is sculpted in the guard turned from the sun and in the shadow of his own
     glove and head, so in the cloth's ramp nearly all of it came out the darkest step, the step the trunk's shaded side is,
     and the arm went into the body in front of it, elbow and all; the bare arm is told from the body by its tape) */
  sleeve: { r: [9, 9, 10, 11] },
  rib: { r: [8, 8, 9] },
  lining: { r: [8, 8, 9] }
};

export function sculptBoxer(S, bind, o) {
  o = o || {};
  const res = o.res || 0.03;
  const frame = name => [M.col(bind.R[name], 0), M.col(bind.R[name], 1), M.col(bind.R[name], 2)];
  const at = (name, local) => M.add(bind.p[name], M.app(bind.R[name], local || [0, 0, 0]));
  const opt = (name, more) => Object.assign({ tag: name, whole: true, res, ax: frame(name) }, more);
  const ball = (name, local, r, mat, more) => S.ball(at(name, local), r, mat, opt(name, more));
  const tube = (name, a, b, r0, r1, mat, more) => S.tube([at(name, a), at(name, b)], r0, r1, mat, opt(name, Object.assign({ ax: undefined }, more)));
  // the head and the face, and a glove: the same whatever he wears
  const head = () => {
    ball('Head', [0, 0.1, 0.012], [0.118, 0.134, 0.128], MAT.skin);
    ball('Head', [0, 0.158, -0.022], [0.122, 0.098, 0.122], MAT.hair);
    for (const e of [-1, 1]) ball('Head', [e * 0.05, 0.105, 0.122], [0.02, 0.026, 0.018], MAT.hair);
    ball('Head', [0, 0.045, 0.125], [0.03, 0.014, 0.012], MAT.trim); // the gumshield, a pale line that says where the mouth is
  };
  const glove = (sideName, s) => {
    ball(sideName + 'Hand', [s * 0.075, 0, 0.005], [0.108, 0.092, 0.098], MAT.glove);
    ball(sideName + 'Hand', [s * 0.035, -0.02, 0.07], [0.05, 0.045, 0.05], MAT.glove); // thumb
  };
  if (o.wear) {
    if (!WEAR[o.wear]) throw new Error(`No outfit called ${o.wear}`);
    return suit({ S, bind, at, opt, ball, tube, head, glove }, o.wear === 'training-up');
  }

  // trunks and waistband
  ball('Hips', [0, -0.01, 0], [0.175, 0.14, 0.145], MAT.trunks);
  S.torus(at('Hips', [0, 0.085, 0]), 0.132, 0.034, MAT.trim, opt('Hips'));
  // torso: a narrow waist opening to the chest and shoulders
  tube('Spine1', [0, -0.02, 0], [0, 0.12, 0], 0.128, 0.134, MAT.skin);
  tube('Spine2', [0, 0, 0], [0, 0.12, 0], 0.134, 0.158, MAT.skin);
  ball('Chest', [0, 0.06, 0.012], [0.2, 0.15, 0.14], MAT.skin);
  // neck and head
  tube('Neck1', [0, -0.05, 0], [0, 0.08, 0], 0.058, 0.054, MAT.skin);
  head();

  for (const sideName of ['Left', 'Right']) {
    const s = sideName === 'Left' ? 1 : -1;
    ball(sideName + 'Shoulder', [s * 0.15, 0, 0], 0.09, MAT.skin);
    tube(sideName + 'Arm', [0, 0, 0], [s * 0.28, 0, 0], 0.074, 0.06, MAT.skin);
    tube(sideName + 'ForeArm', [0, 0, 0], [s * 0.19, 0, 0], 0.06, 0.052, MAT.skin);
    tube(sideName + 'ForeArm', [s * 0.16, 0, 0], [s * 0.25, 0, 0], 0.06, 0.066, MAT.trim); // the taped cuff
    glove(sideName, s);
    // legs: the trunks' leg, thigh, calf, a high boot
    tube(sideName + 'Leg', [0, 0.02, 0], [0, -0.2, 0], 0.118, 0.124, MAT.trunks);
    tube(sideName + 'Leg', [0, -0.15, 0], [0, -0.42, 0], 0.098, 0.076, MAT.skin);
    tube(sideName + 'Shin', [0, 0, 0], [0, -0.2, 0], 0.076, 0.07, MAT.skin);
    tube(sideName + 'Shin', [0, -0.17, 0], [0, -0.41, 0], 0.066, 0.058, MAT.boot);
    S.torus(at(sideName + 'Shin', [0, -0.17, 0]), 0.058, 0.02, MAT.trim, opt(sideName + 'Shin'));
    ball(sideName + 'Foot', [0, -0.04, 0.05], [0.064, 0.052, 0.115], MAT.boot);
    ball(sideName + 'ToeBase', [0, 0.014, 0.012], [0.06, 0.042, 0.058], MAT.boot);
  }
}

/* The training suit: a hooded sweatshirt over sweatpants, and low training shoes; the head, the face and the gloves as they
   are. Every piece of cloth is a little fuller than what it covers (a centimetre and a bit), is carried by the one joint the
   part under it is, and overlaps the next piece as the bare body's parts overlap theirs, so that a joint that bends opens no
   hole in it. The hood down lies bunched behind the neck on the Chest (it does not swing with the head); up, it is round the
   head on the Head, open at the face, with a little peak over the brow, and the neck under it is cloth too, so that a head
   turned or tucked shows no skin at the back of the neck, the hood's lower edge going down over the collar on the Chest. */
function suit(k, up) {
  const { S, at, opt, ball, tube, head, glove } = k;
  // a ring of cloth round a part, oval (half-widths a across and b front to back), level in the joint's own frame at c
  const loop = (name, c, a, b, r, mat) =>
    S.tube(Array.from({ length: 25 }, (_, i) => at(name, [c[0] + a * Math.cos((i / 24) * 2 * Math.PI), c[1], c[2] + b * Math.sin((i / 24) * 2 * Math.PI)])), r, r, mat, opt(name, { ax: undefined }));
  // a frame turned from the joint's own by so many degrees about its x (+: its front goes down)
  const tilted = (name, deg) => {
    const R = M.mul(k.bind.R[name], M.rx(deg));
    return [M.col(R, 0), M.col(R, 1), M.col(R, 2)];
  };

  // ---- the sweatpants' seat, the sweatshirt's skirt over it to a ribbed hem; the pants' waistband is under the hem, and only
  // the ends of its drawstring hang out below it (in the ribbing's grey: in the trim's pale, they read as a patch)
  ball('Hips', [0, -0.01, 0], [0.178, 0.142, 0.148], MAT.cloth);
  ball('Hips', [0, 0.02, 0.004], [0.21, 0.12, 0.163], MAT.cloth);
  loop('Hips', [0, 0.0, 0.004], 0.198, 0.152, 0.022, MAT.rib);
  for (const e of [-1, 1]) tube('Hips', [e * 0.012, 0.0, 0.168], [e * 0.02, -0.06, 0.165], 0.0075, 0.0075, MAT.rib);
  // ---- the sweatshirt: the trunk, a kangaroo pocket on the belly, the collar and the drawstrings
  tube('Spine1', [0, -0.02, 0], [0, 0.12, 0], 0.142, 0.148, MAT.cloth);
  ball('Spine1', [0, 0.04, 0.124], [0.108, 0.055, 0.03], MAT.cloth);
  tube('Spine2', [0, 0, 0], [0, 0.12, 0], 0.148, 0.171, MAT.cloth);
  ball('Chest', [0, 0.06, 0.012], [0.213, 0.163, 0.153], MAT.cloth);
  S.torus(at('Chest', [0, 0.176, 0.0]), 0.072, 0.024, MAT.rib, opt('Chest', { ax: tilted('Chest', 16) }));
  for (const e of [-1, 1]) {
    tube('Chest', [e * 0.034, 0.16, 0.132], [e * 0.042, 0.045, 0.168], 0.0075, 0.0075, MAT.trim);
    ball('Chest', [e * 0.042, 0.04, 0.168], 0.011, MAT.trim);
  }
  if (up) {
    // the hood up: round the head, open at the face, a peak over the brow; the neck under it, and its foot on the Chest
    tube('Neck1', [0, -0.05, 0], [0, 0.08, 0], 0.07, 0.068, MAT.cloth);
    S.torus(at('Chest', [0, 0.18, -0.012]), 0.08, 0.036, MAT.cloth, opt('Chest', { ax: tilted('Chest', 16) }));
    head();
    const hood = S.ball(at('Head', [0, 0.118, -0.012]), [0.14, 0.158, 0.156], MAT.cloth, opt('Head', { hold: true })),
      face = S.ball(at('Head', [0, 0.085, 0.165]), [0.094, 0.118, 0.11], MAT.cloth, opt('Head', { hold: true }));
    S.join('cut', hood, face, opt('Head', { r: 0, ax: undefined, inner: MAT.lining.r }));
    ball('Head', [0, 0.165, -0.085], [0.1, 0.1, 0.095], MAT.cloth); // its crown, a little back
    ball('Head', [0, -0.02, -0.06], [0.11, 0.08, 0.095], MAT.cloth); // down the back of the neck
    ball('Head', [0, 0.198, 0.112], [0.08, 0.018, 0.03], MAT.cloth); // the peak
    ball('Chest', [0, 0.165, -0.085], [0.13, 0.06, 0.07], MAT.cloth); // where it is sewn on, over the shoulders behind
  } else {
    // the hood down, bunched behind the neck
    tube('Neck1', [0, -0.05, 0], [0, 0.08, 0], 0.058, 0.054, MAT.skin);
    head();
    ball('Chest', [0, 0.165, -0.105], [0.125, 0.072, 0.07], MAT.cloth);
    ball('Chest', [0, 0.2, -0.088], [0.098, 0.045, 0.055], MAT.lining);
  }

  for (const sideName of ['Left', 'Right']) {
    const s = sideName === 'Left' ? 1 : -1;
    // ---- the sleeves, to a ribbed cuff at the wrist under the glove
    ball(sideName + 'Shoulder', [s * 0.15, 0, 0], 0.102, MAT.cloth);
    tube(sideName + 'Arm', [0, 0, 0], [s * 0.28, 0, 0], 0.086, 0.072, MAT.sleeve);
    tube(sideName + 'ForeArm', [0, 0, 0], [s * 0.17, 0, 0], 0.072, 0.064, MAT.sleeve);
    tube(sideName + 'ForeArm', [s * 0.16, 0, 0], [s * 0.25, 0, 0], 0.066, 0.07, MAT.rib);
    glove(sideName, s);
    // ---- the sweatpants' legs, to a ribbed cuff at the ankle; a low training shoe with a pale sole
    tube(sideName + 'Leg', [0, 0.0, 0], [0, -0.42, 0], 0.108, 0.088, MAT.cloth);
    tube(sideName + 'Shin', [0, 0, 0], [0, -0.3, 0], 0.088, 0.075, MAT.cloth);
    tube(sideName + 'Shin', [0, -0.28, 0], [0, -0.36, 0], 0.072, 0.068, MAT.rib);
    tube(sideName + 'Shin', [0, -0.35, 0], [0, -0.42, 0], 0.056, 0.054, MAT.boot);
    ball(sideName + 'Foot', [0, -0.042, 0.05], [0.064, 0.048, 0.115], MAT.boot);
    ball(sideName + 'Foot', [0, -0.072, 0.05], [0.068, 0.019, 0.12], MAT.trim);
    ball(sideName + 'ToeBase', [0, 0.01, 0.012], [0.06, 0.038, 0.058], MAT.boot);
    ball(sideName + 'ToeBase', [0, -0.012, 0.016], [0.063, 0.017, 0.062], MAT.trim);
  }
}

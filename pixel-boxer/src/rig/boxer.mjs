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
  white: { r: [12, 13, 14] }
};

export function sculptBoxer(S, bind, o) {
  o = o || {};
  const res = o.res || 0.03;
  const frame = name => [M.col(bind.R[name], 0), M.col(bind.R[name], 1), M.col(bind.R[name], 2)];
  const at = (name, local) => M.add(bind.p[name], M.app(bind.R[name], local || [0, 0, 0]));
  const opt = (name, more) => Object.assign({ tag: name, whole: true, res, ax: frame(name) }, more);
  const ball = (name, local, r, mat, more) => S.ball(at(name, local), r, mat, opt(name, more));
  const tube = (name, a, b, r0, r1, mat, more) => S.tube([at(name, a), at(name, b)], r0, r1, mat, opt(name, Object.assign({ ax: undefined }, more)));

  // trunks and waistband
  ball('Hips', [0, -0.01, 0], [0.175, 0.14, 0.145], MAT.trunks);
  S.torus(at('Hips', [0, 0.085, 0]), 0.132, 0.034, MAT.trim, opt('Hips'));
  // torso: a narrow waist opening to the chest and shoulders
  tube('Spine1', [0, -0.02, 0], [0, 0.12, 0], 0.128, 0.134, MAT.skin);
  tube('Spine2', [0, 0, 0], [0, 0.12, 0], 0.134, 0.158, MAT.skin);
  ball('Chest', [0, 0.06, 0.012], [0.2, 0.15, 0.14], MAT.skin);
  // neck and head
  tube('Neck1', [0, -0.05, 0], [0, 0.08, 0], 0.058, 0.054, MAT.skin);
  ball('Head', [0, 0.1, 0.012], [0.118, 0.134, 0.128], MAT.skin);
  ball('Head', [0, 0.158, -0.022], [0.122, 0.098, 0.122], MAT.hair);
  for (const e of [-1, 1]) ball('Head', [e * 0.05, 0.105, 0.122], [0.02, 0.026, 0.018], MAT.hair);
  ball('Head', [0, 0.045, 0.125], [0.03, 0.014, 0.012], MAT.trim); // the gumshield, a pale line that says where the mouth is

  for (const sideName of ['Left', 'Right']) {
    const s = sideName === 'Left' ? 1 : -1;
    ball(sideName + 'Shoulder', [s * 0.15, 0, 0], 0.09, MAT.skin);
    tube(sideName + 'Arm', [0, 0, 0], [s * 0.28, 0, 0], 0.074, 0.06, MAT.skin);
    tube(sideName + 'ForeArm', [0, 0, 0], [s * 0.19, 0, 0], 0.06, 0.052, MAT.skin);
    tube(sideName + 'ForeArm', [s * 0.16, 0, 0], [s * 0.25, 0, 0], 0.06, 0.066, MAT.trim); // the taped cuff
    ball(sideName + 'Hand', [s * 0.075, 0, 0.005], [0.108, 0.092, 0.098], MAT.glove);
    ball(sideName + 'Hand', [s * 0.035, -0.02, 0.07], [0.05, 0.045, 0.05], MAT.glove); // thumb
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

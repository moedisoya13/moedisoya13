/* What a body can do and how big it is, in one place: the solver keeps inside these (a little inside), the knockdown's
   physics is built from them, and tools/audit.mjs holds every frame of every move against them.
     RANGE     joint ranges, degrees. Generous: a supple athlete's, not the average man's, so what is outside is wrong and not
               merely unusual (AAOS / Kapandji ranges of motion, rounded up).
     RADIUS    how thick he is at each joint, metres: what cannot go into the canvas, into himself or into another man
     SEGMENTS  Dempster's shares of a body's mass, and where along each segment its middle is
     FOOT      the sole, as balls in the foot's own frame from the ankle: [centre, radius]. Flat, each just touches the canvas
     GLOVE     how far past the wrist the middle of the glove is, along the forearm, and its radius
     HEAD      the middle of the head, in the head's own frame from the Head joint
     SHOULDER  where the upper arm can point and how far it can turn about itself (with shoulderOf, which reads an arm
               against it): the solver, the knockdown's body and the audit all hold the shoulder to this one table */
export const RANGE = {
  elbowStraight: 185, // interior angle: past straight is hyperextension
  elbowFolded: 32, // the forearm on the upper arm
  kneeFolded: 30,
  kneeAzimuth: [-50, 80], // which way the knee points round the leg's own line, from the front of the thigh: in .. out
  hipBehind: 35,
  hipOut: 60,
  hipIn: 35,
  ankleUp: 35, // toes toward the shin
  ankleDown: 60,
  ankleRoll: 35,
  spineForward: 75,
  spineBack: 30,
  spineSide: 35,
  spineTwist: 45,
  neckDown: 60,
  neckUp: 65,
  neckTurn: 80,
  neckTilt: 45
};
export const RADIUS = { head: 0.11, glove: 0.1, Chest: 0.13, Hips: 0.12, Arm: 0.06, ForeArm: 0.04, Shin: 0.055, Foot: 0.05, ToeBase: 0.03 };
export const SEGMENTS = [
  ['Hips', 'Neck1', 0.497, 0.5],
  ['Neck1', 'head', 0.081, 1],
  ...['Left', 'Right'].flatMap(S => [
    [S + 'Arm', S + 'ForeArm', 0.028, 0.436],
    [S + 'ForeArm', S + 'Hand', 0.016, 0.43],
    [S + 'Hand', 'glove' + S, 0.01, 1],
    [S + 'Leg', S + 'Shin', 0.1, 0.433],
    [S + 'Shin', S + 'Foot', 0.0465, 0.433],
    [S + 'Foot', S + 'ToeBase', 0.0145, 0.5]
  ])
];
export const FOOT = {
  ball: [0, -0.06, 0.13], // the ToeBase joint: a ball of 0.03 on the canvas
  heel: [0, -0.05, -0.02],
  sole: [
    [[0, -0.06, 0.13], 0.03],
    [[0.035, -0.06, 0.115], 0.03],
    [[-0.035, -0.06, 0.115], 0.03],
    [[0, -0.05, -0.02], 0.04],
    [[0.028, -0.05, -0.02], 0.04],
    [[-0.028, -0.05, -0.02], 0.04]
  ]
};
export const GLOVE = { ahead: 0.075, r: 0.1 };
export const HEAD = [0, 0.1, 0.02];

/* The shoulder is a ball, and the upper arm can point only into part of the sphere round it. Its direction is read as the
   chest sees it, mirrored onto the left side (x out, y up, z ahead), in two angles (shoulderOf):
     plane   the plane it is raised in: 0 out to the side, +90 ahead, -90 behind, +-180 straight across
     elev    how far it is raised: 0 hanging, 90 level with the shoulder, 180 overhead
   SHOULDER.most is the highest it can be raised in each plane, degrees, with straight lines between: ahead all the way
   overhead, out to the side nearly so; across the chest so far (and the less the further across, an arm across the front
   at the height of the ribs lying against them, as a guard's rear elbow tucked in front of them does); behind, only low.
   What is above that line is the three places it cannot go: up behind (an arm stretched back and raised above the level),
   across past 140 degrees, and across behind the back (where, near hanging, the plane says little, and `low` degrees of
   the arm hanging are let be whatever plane they are in). Ranges as RANGE's are: a supple athlete's.
   And how far it is turned about itself (twist: + in, - out), from where it would be had it been raised from hanging with
   the forearm ahead of it the short way round (shoulderOf: the way the forearm bends from it, or the bone's own frame):
   SHOULDER.in and .out, by elevation, the same way. Hanging, 90 in and 80 out; raised above level, less and less in, 20
   at the top, and 90 out. Straight overhead (past `top`) the turn is not read. */
export const SHOULDER = {
  most: [[-180, 20], [-120, 20], [-90, 55], [-75, 76], [-60, 90], [-45, 100], [0, 170], [90, 180], [140, 110], [165, 60], [180, 20]],
  in: [[0, 90], [90, 90], [180, 30]],
  out: [[0, 80], [45, 102], [90, 120], [180, 90]],
  low: 20,
  top: 178
};
const DEGS = 180 / Math.PI;
const line = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 0; i + 1 < table.length; i++) if (x <= table[i + 1][0]) return table[i][1] + ((table[i + 1][1] - table[i][1]) * (x - table[i][0])) / (table[i + 1][0] - table[i][0]);
  return table[table.length - 1][1];
};
// the highest the upper arm can be raised in a plane, and how far it can be turned in and out at an elevation
export const armMost = plane => line(SHOULDER.most, plane);
export const twistMost = elev => [line(SHOULDER.in, elev), line(SHOULDER.out, elev)];
/* Where the forearm would point from the upper arm with no turn of it: ahead, carried up from hanging the short way round
   (d: the upper arm, unit, mirrored as above). Undefined straight up. */
export function noTurn(d) {
  const k = 1 - d[1];
  if (k < 1e-6) return [0, 0, -1];
  return [(-d[0] * d[2]) / k, d[2], -d[1] + (d[0] * d[0]) / k];
}
/* An upper arm read against the table. d: its direction, unit; z: the way the forearm bends from it (any vector off its
   line will do; left out, or along it, the turn is not read); both as the chest sees them, mirrored onto the left side.
   -> { plane, elev, twist (+ in, - out, or null), zone (degrees it is raised past the most of its plane, 0 inside), turned
   (degrees past the turn its elevation allows, 0 inside) }. margin: degrees to keep inside both by. */
export function shoulderOf(d, z, margin) {
  const m = margin || 0,
    plane = Math.atan2(d[2], d[0]) * DEGS,
    elev = Math.acos(Math.max(-1, Math.min(1, -d[1]))) * DEGS,
    zone = Math.max(0, elev - Math.max(armMost(plane) - m, Math.min(SHOULDER.low, armMost(plane)))),
    out = { plane, elev, twist: null, zone, turned: 0 };
  if (z && elev < SHOULDER.top) {
    const along = z[0] * d[0] + z[1] * d[1] + z[2] * d[2],
      p = [z[0] - d[0] * along, z[1] - d[1] * along, z[2] - d[2] * along],
      pl = Math.hypot(p[0], p[1], p[2]);
    if (pl > 1e-3) {
      const r = noTurn(d),
        c = [r[1] * p[2] - r[2] * p[1], r[2] * p[0] - r[0] * p[2], r[0] * p[1] - r[1] * p[0]],
        twist = Math.atan2((c[0] * d[0] + c[1] * d[1] + c[2] * d[2]) / pl, (r[0] * p[0] + r[1] * p[1] + r[2] * p[2]) / pl) * DEGS,
        [inn, outt] = twistMost(elev);
      out.twist = twist;
      out.turned = twist > inn - m ? twist - (inn - m) : twist < -(outt - m) ? -(outt - m) - twist : 0;
    }
  }
  return out;
}

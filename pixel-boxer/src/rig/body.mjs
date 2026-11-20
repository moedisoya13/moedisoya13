/* What a body can do and how big it is, in one place: the solver keeps inside these (a little inside), the knockdown's
   physics is built from them, and tools/audit.mjs holds every frame of every move against them.
     RANGE     joint ranges, degrees. Generous: a supple athlete's, not the average man's, so what is outside is wrong and not
               merely unusual (AAOS / Kapandji ranges of motion, rounded up).
     RADIUS    how thick he is at each joint, metres: what cannot go into the canvas, into himself or into another man
     SEGMENTS  Dempster's shares of a body's mass, and where along each segment its middle is
     FOOT      the sole, as balls in the foot's own frame from the ankle: [centre, radius]. Flat, each just touches the canvas
     GLOVE     how far past the wrist the middle of the glove is, along the forearm, and its radius
     HEAD      the middle of the head, in the head's own frame from the Head joint */
export const RANGE = {
  elbowStraight: 185, // interior angle: past straight is hyperextension
  elbowFolded: 32, // the forearm on the upper arm
  shoulderBehind: 60, // the upper arm behind the plane of the chest
  shoulderAcross: 60, // across the chest (a rear elbow tucked in front of the ribs in the guard is 40)
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

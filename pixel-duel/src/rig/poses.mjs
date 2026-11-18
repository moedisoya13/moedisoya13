/* The swordsman's stances (see solve.js for what a stance says). The figure faces +Z with its right foot and sword arm leading
   and its chest opened to its left, so a camera on its left sees the chest: the fencer's line.
   BIND is the one exception: plain joint rotations over the T-pose, the stance the figure is sculpted and lit in. */
const BIND = {
  rot: {
    LeftArm: [0, 0, -68], RightArm: [0, 0, 68],
    LeftForeArm: [0, -12, 0], RightForeArm: [0, 12, 0],
    LeftLeg: [0, 0, 5], RightLeg: [0, 0, -5]
  }
};

const FEET = { R: { at: [-0.06, 0.09, 0.3], yaw: -5 }, L: { at: [0.1, 0.09, -0.3], yaw: 55 } };
const look = yaw => ({ Neck1: [0, -yaw * 0.45, 0], Head: [-2, -yaw * 0.45, 0] }); // the head keeps facing the opponent

const STANCES = {
  guard: {
    hips: [0, 0.84, 0.02],
    spine: { Hips: [4, 38, 0], Spine2: [3, 8, 0], Chest: [2, 8, 0], ...look(54) },
    feet: FEET,
    hands: { R: { at: [-0.16, 1.02, 0.42], blade: [0, 0.45, 1] }, L: { at: [0.3, 0.98, -0.28], pole: [1, -0.3, -1] } }
  },
  // breathing out: the same stance a little lower, the point dipped
  guardLow: {
    hips: [0, 0.82, 0.02],
    spine: { Hips: [6, 38, 0], Spine2: [4, 8, 0], Chest: [3, 8, 0], ...look(54) },
    feet: FEET,
    hands: { R: { at: [-0.16, 0.99, 0.43], blade: [0, 0.38, 1] }, L: { at: [0.3, 0.95, -0.28], pole: [1, -0.3, -1] } }
  },
  // passing step of the walk: feet gathered, rear heel off the ground
  step: {
    hips: [0, 0.87, 0.02],
    spine: { Hips: [3, 34, 0], Spine2: [2, 8, 0], Chest: [2, 8, 0], ...look(50) },
    feet: { R: { at: [-0.06, 0.09, 0.14], yaw: -5 }, L: { at: [0.1, 0.15, -0.1], yaw: 45, pitch: 25 } },
    hands: { R: { at: [-0.16, 1.05, 0.4], blade: [0, 0.5, 1] }, L: { at: [0.3, 1.0, -0.25], pole: [1, -0.3, -1] } }
  },

  // ---- the cut: coil, contact, follow-through
  slashWind: {
    hips: [0, 0.79, -0.08],
    spine: { Hips: [-8, 58, 0], Spine2: [-4, 10, 0], Chest: [-6, 14, 0], ...look(82) },
    feet: FEET,
    hands: { R: { at: [-0.2, 1.68, -0.24], blade: [0, 0.7, -1], pole: [-1, -0.2, -0.2] }, L: { at: [0.22, 1.12, 0.3] } },
    stretch: 0.92
  },
  slashHit: {
    hips: [0, 0.8, 0.24],
    spine: { Hips: [14, 8, 0], Spine2: [6, -6, 0], Chest: [8, -10, 0], ...look(-8) },
    feet: { R: { at: [-0.06, 0.09, 0.58], yaw: -5 }, L: { at: [0.1, 0.12, -0.3], yaw: 55, pitch: 18 } },
    hands: { R: { at: [-0.12, 1.24, 0.66], blade: [0, 0.22, 1] }, L: { at: [0.28, 1.05, -0.2], pole: [1, -0.3, -1] } },
    stretch: 1.08
  },
  slashEnd: {
    hips: [0, 0.74, 0.28],
    spine: { Hips: [24, -10, 0], Spine2: [8, -8, 0], Chest: [10, -14, 0], ...look(-32) },
    feet: { R: { at: [-0.06, 0.09, 0.58], yaw: -5 }, L: { at: [0.1, 0.13, -0.3], yaw: 55, pitch: 22 } },
    hands: { R: { at: [0.1, 0.46, 0.5], blade: [0.2, -0.8, 0.6] }, L: { at: [0.26, 1.12, -0.42], pole: [1, -0.3, -1] } },
    stretch: 0.96
  },

  // ---- the thrust: drawn back, then the whole body on one line
  thrustWind: {
    hips: [0, 0.77, -0.2],
    spine: { Hips: [2, 62, 0], Spine2: [0, 10, 0], Chest: [0, 12, 0], ...look(84) },
    feet: FEET,
    hands: { R: { at: [-0.26, 1.1, -0.3], blade: [0, 0.04, 1], pole: [-0.6, -0.5, -1] }, L: { at: [0.16, 1.18, 0.34] } },
    stretch: 0.9
  },
  thrustHit: {
    hips: [0, 0.7, 0.52],
    spine: { Hips: [20, 18, 0], Spine2: [4, 2, 0], Chest: [4, 2, 0], Neck1: [-10, -8, 0], Head: [-12, -10, 0] },
    feet: { R: { at: [-0.06, 0.09, 0.96], yaw: -5 }, L: { at: [0.1, 0.09, -0.3], yaw: 60 } },
    hands: { R: { at: [-0.1, 1.16, 1.14], blade: [0, 0.02, 1] }, L: { at: [0.18, 0.98, -0.3], pole: [1, 0.2, -1] } },
    stretch: 1.1
  },
  // the lunge sunk onto the front knee: the second drawing, and the one the hit stop holds
  thrustHold: {
    hips: [0, 0.64, 0.5],
    spine: { Hips: [24, 16, 0], Spine2: [4, 2, 0], Chest: [4, 2, 0], Neck1: [-12, -8, 0], Head: [-14, -10, 0] },
    feet: { R: { at: [-0.06, 0.09, 0.96], yaw: -5 }, L: { at: [0.1, 0.09, -0.3], yaw: 60 } },
    hands: { R: { at: [-0.1, 1.08, 1.04], blade: [0, 0.0, 1] }, L: { at: [0.2, 0.9, -0.36], pole: [1, 0.2, -1] } },
    stretch: 0.97
  },

  // ---- defence
  parry: {
    hips: [0, 0.82, -0.04],
    spine: { Hips: [-4, 32, 0], Spine2: [0, 6, 0], Chest: [-2, 6, 0], ...look(44) },
    feet: FEET,
    hands: { R: { at: [-0.06, 1.2, 0.36], blade: [0.12, 1, 0.3] }, L: { at: [0.16, 1.24, 0.26] } }
  },
  parryHit: {
    hips: [0, 0.85, 0.02],
    spine: { Hips: [2, 26, 0], Spine2: [0, 4, 0], Chest: [0, 4, 0], ...look(34) },
    feet: FEET,
    hands: { R: { at: [-0.06, 1.42, 0.48], blade: [0, 1, 0.62] }, L: { at: [0.2, 1.1, 0.1] } },
    stretch: 1.05
  },
  dodge: {
    hips: [0, 0.7, -0.06],
    spine: { Hips: [-18, 30, 0], Spine2: [-4, 6, 0], Chest: [-4, 6, 0], Neck1: [8, -18, 0], Head: [10, -18, 0] },
    feet: { R: { at: [-0.06, 0.09, 0.44], yaw: -5 }, L: { at: [0.1, 0.09, -0.4], yaw: 60 } },
    hands: { R: { at: [-0.28, 0.84, 0.24], blade: [0, 0.12, 1] }, L: { at: [0.34, 1.0, -0.4], pole: [1, -0.3, -1] } },
    stretch: 0.94
  },

  // ---- struck: the furthest-back drawing, which the hit stop holds
  hurt: {
    hips: [0, 0.83, -0.2],
    spine: { Hips: [-24, 22, 0], Spine2: [-8, 4, 0], Chest: [-12, 4, 0], Neck1: [-10, -10, 0], Head: [-18, -10, 0] },
    feet: { R: { at: [-0.06, 0.2, 0.26], yaw: -5, pitch: -25 }, L: { at: [0.1, 0.09, -0.32], yaw: 55 } },
    hands: { R: { at: [-0.5, 1.22, -0.02], blade: [-0.4, 1, -0.2], pole: [-0.3, -1, -0.3] }, L: { at: [0.48, 1.28, -0.12], pole: [0.3, -1, -0.5] } },
    stretch: 0.93
  },
  down: {
    hips: [0, 0.17, -0.55],
    spine: { Hips: [-82, 8, 0], Spine2: [-4, 0, 0], Chest: [-4, 0, 0], Neck1: [6, 12, 0], Head: [8, 18, 0] },
    feet: { R: { at: [-0.14, 0.09, 0.2], yaw: -10 }, L: { at: [0.16, 0.06, 0.1], yaw: 30, pole: [0.6, 1, 0.2] } },
    hands: { R: { at: [-0.52, 0.07, -0.95], blade: [-1, 0.02, 0.3], pole: [-1, 0.3, 0] }, L: { at: [0.5, 0.07, -1.0], pole: [1, 0.3, 0] } }
  }
};

export { BIND, STANCES };

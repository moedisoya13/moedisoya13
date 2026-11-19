/* Footwork: the guard stance walked forward and back without the feet ever crossing, the way a fencer or a boxer moves.
   The leading foot steps, then the rear foot follows (retreating, the other way round), and a foot on the ground stays where it
   was put: its place under the body is worked back at exactly the speed the body travels, so nothing slides.
     gaitStance(t, advance)   the stance (see solve.mjs) t seconds into the walk; advance is 1 toward the opponent, -1 away
   The stride follows from the speed: stride = speed x CYCLE. */
import { STANCES } from '../rig/poses.mjs';

export const CYCLE = 0.36; // seconds for both feet to step once
const LIFT = 0.07; // metres a stepping foot clears the ground by
const smooth = x => x * x * (3 - 2 * x);

// one foot through the cycle: where it is ahead of (+) or behind (-) its place in the guard, and how high
function foot(phase, starts, reach) {
  const s = (((phase - starts) % 1) + 1) % 1;
  if (s < 0.5) {
    const u = s / 0.5;
    return { d: -reach + 2 * reach * smooth(u), lift: LIFT * Math.sin(Math.PI * u), pitch: 16 * Math.sin(2 * Math.PI * u) };
  }
  return { d: reach - 2 * reach * ((s - 0.5) / 0.5), lift: 0, pitch: 0 };
}

export function gaitStance(t, advance, speed) {
  const guard = STANCES.guard,
    // going back is the same walk run backwards: the rear foot reaches first and the planted one is drawn forward
    phase = ((advance < 0 ? -t : t) / CYCLE) % 1,
    reach = ((speed * CYCLE) / 4) * Math.min(1, t / 0.12 + 0.35), // the first step is a short one
    lead = foot(phase, 0, reach),
    rear = foot(phase, 0.5, reach),
    wide = (lead.d - rear.d) / (2 * reach || 1), // -1 feet gathered .. 1 feet apart
    swing = Math.sin(4 * Math.PI * phase);
  return {
    hips: [0.012 * Math.sin(2 * Math.PI * phase), guard.hips[1] + 0.012 - 0.026 * wide, guard.hips[2] + 0.4 * (lead.d + rear.d) * 0.5],
    spine: Object.assign({}, guard.spine, {
      Hips: [guard.spine.Hips[0] + 2.5 * advance, guard.spine.Hips[1] + 5 * wide, 1.5 * Math.sin(2 * Math.PI * phase)],
      Chest: [guard.spine.Chest[0], guard.spine.Chest[1] - 3 * wide, 0]
    }),
    feet: {
      R: { at: [guard.feet.R.at[0], guard.feet.R.at[1] + lead.lift, guard.feet.R.at[2] + lead.d], yaw: guard.feet.R.yaw, pitch: lead.pitch },
      L: { at: [guard.feet.L.at[0], guard.feet.L.at[1] + rear.lift, guard.feet.L.at[2] + rear.d], yaw: guard.feet.L.yaw, pitch: rear.pitch }
    },
    hands: {
      // the point of the sword trails the step a little: the hand is carried, the blade follows
      R: { at: [guard.hands.R.at[0], guard.hands.R.at[1] + 0.012 * swing, guard.hands.R.at[2]], blade: [0, guard.hands.R.blade[1] + 0.035 * Math.sin(4 * Math.PI * phase - 0.9), 1] },
      L: { at: [guard.hands.L.at[0], guard.hands.L.at[1] - 0.012 * swing, guard.hands.L.at[2] - 0.02 * wide], pole: guard.hands.L.pole }
    }
  };
}

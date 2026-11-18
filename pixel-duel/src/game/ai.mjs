/* The rival: closes to cutting distance, cuts behind a readable wind-up, and answers the player's cuts some of the time.
   It reads the same state the picture is drawn from and presses the same buttons. */
import { CLIPS } from '../anim/clips.mjs';
import { isFree, random } from './duel.mjs';

export const LEVELS = {
  calm: { parry: 0.2, dodge: 0.12, eager: 0.5, punish: 0.5, think: [0.7, 1.4] },
  keen: { parry: 0.4, dodge: 0.2, eager: 0.65, punish: 0.8, think: [0.45, 1.0] },
  fierce: { parry: 0.6, dodge: 0.25, eager: 0.8, punish: 1, think: [0.3, 0.7] }
};

export function createRival(level) {
  return { level: LEVELS[level] || LEVELS.keen, wait: 0.8, answer: null, seen: null };
}

export function think(rival, duel, dt) {
  const [player, me] = duel.fighters,
    L = rival.level,
    input = { move: 0 },
    gap = Math.abs(player.x - me.x),
    toward = Math.sign(player.x - me.x);
  if (duel.over !== null) return input;
  rival.wait -= dt;

  // the player's cut has started: decide once how to answer it, then press at the right moment
  const threat = (player.clip === 'slash' || player.clip === 'thrust') && !player.struck ? player : null;
  if (threat && rival.seen !== threat.clip + duel.t.toFixed(0) && threat.ct < 0.05) {
    rival.seen = threat.clip + duel.t.toFixed(0);
    const roll = random(duel);
    rival.answer = threat.clip === 'slash' && roll < L.parry ? 'parry' : roll < L.parry + L.dodge ? 'dodge' : null;
  }
  if (!threat) rival.answer = null;
  if (threat && rival.answer && isFree(me)) {
    const until = CLIPS[threat.clip].marks.hit - threat.ct;
    if (rival.answer === 'parry' && until < 0.1) (input.parry = true), (rival.answer = null);
    else if (rival.answer === 'dodge' && until < 0.12) (input.dodge = -toward), (rival.answer = null);
    return input;
  }

  if (me.chance > 0 && isFree(me) && gap < CLIPS.thrust.reach - 0.2) {
    if (random(duel) < L.punish) input.attack = true;
    else me.chance = 0;
    return input;
  }
  if (!isFree(me)) return input;
  const reach = CLIPS[me.attack].reach - 0.35;
  if (gap > reach) input.move = toward;
  else if (rival.wait <= 0) {
    rival.wait = L.think[0] + random(duel) * (L.think[1] - L.think[0]);
    if (random(duel) < L.eager) input.attack = true;
    else input.move = -toward; // give ground instead, and come again
  } else if (gap < 1.4) input.move = -toward;
  return input;
}

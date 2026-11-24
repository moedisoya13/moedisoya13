/* The sparring page's planner, in a worker of its own so that the page goes on drawing while a round is arranged
   (src/spar.mjs; the page arranges it itself, a piece each picture, where a worker cannot be had). Told { id, seed }, it
   makes that round (plan.mjs planner) and sends it as it goes: { id, head (the men, their health, who wins: once), beats (the
   beats committed since the last message), inputs (and their controls), done, ko, stats, reset (the round was arranged
   again from the start: what was sent before it is void) }. A new message starts a new round
   and the old one is dropped. */
import { planner } from './plan.mjs';

let job = null;
self.onmessage = e => {
  const { id, seed } = e.data || {};
  job = { id, p: planner(seed), beats: 0, inputs: 0, head: false, plan: null };
  setTimeout(work, 0);
};
function work() {
  const j = job;
  if (!j) return;
  let error = null;
  try {
    j.p.run(30);
  } catch (err) {
    error = String((err && err.message) || err);
  }
  if (j !== job) return;
  // (arranged again from the start with the seed's next dice: the page starts the round again from it)
  const reset = !!j.plan && j.plan !== j.p.plan;
  if (reset || !j.plan) (j.plan = j.p.plan), (j.beats = j.inputs = 0), (j.head = false);
  const plan = j.p.plan,
    log = j.p.log,
    msg = { id: j.id, reset, beats: plan.beats.slice(j.beats), inputs: log.slice(j.inputs), done: j.p.done, ko: plan.ko, stats: j.p.done ? plan.stats : null, error };
  if (!j.head) (msg.head = { seed: plan.seed, men: plan.men, hp: plan.hp, winner: plan.winner }), (j.head = true);
  j.beats = plan.beats.length;
  j.inputs = log.length;
  self.postMessage(msg);
  if (!j.p.done && !error) setTimeout(work, 0);
  else job = null;
}

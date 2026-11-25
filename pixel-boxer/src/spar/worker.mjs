/* The sparring page's planner, in a worker of its own so that the page goes on drawing while a round is arranged
   (src/spar.mjs; the page arranges it itself, a piece each picture, where a worker cannot be had). Told { id, seed }, it
   makes that round (plan.mjs planner) and sends it as it goes: { id, head (the men, their health, who is favoured: once),
   inputs (the controls of the steps arranged since the last message), rails and feet (both men's two lanes as far as they
   are arranged: rails.mjs),
   done, ko, steps, stats, reset (the round was arranged again from the start with the seed's next dice: what was sent before
   it is void) }. A new message starts a new round and the old one is dropped. */
import { planner } from './plan.mjs';

let job = null;
self.onmessage = e => {
  const { id, seed } = e.data || {};
  job = { id, p: planner(seed), inputs: 0, head: false, plan: null };
  setTimeout(work, 0);
};
function work() {
  const j = job;
  if (!j) return;
  let error = null;
  try {
    j.p.run(40);
  } catch (err) {
    error = String((err && err.message) || err);
  }
  if (j !== job) return;
  const reset = !!j.plan && j.plan !== j.p.plan;
  if (reset || !j.plan) (j.plan = j.p.plan), (j.inputs = 0), (j.head = false);
  const plan = j.p.plan,
    msg = { id: j.id, reset, inputs: plan.inputs.slice(j.inputs), rails: plan.rails, feet: plan.feet, done: j.p.done, ko: plan.ko, steps: plan.steps, stats: j.p.done ? plan.stats : null, error };
  if (!j.head) (msg.head = { seed: plan.seed, men: plan.men, hp: plan.hp, favoured: plan.favoured, target: plan.target }), (j.head = true);
  j.inputs = plan.inputs.length;
  self.postMessage(msg);
  if (!j.p.done && !error) setTimeout(work, 0);
  else job = null;
}

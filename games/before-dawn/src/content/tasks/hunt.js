// 사냥 (hunt) — GDD-V2 §5.4. Three chiefs in different zones — (0, 2), (2, 0) and beside the ring of
// (1, 1). A chief is an elite of the floor's type (BD.places.eliteKind) standing with a pack of six;
// the group moves when any of it comes into view. Marked on the minimap and the screen edge from the
// start. All three down → the guardian. Layout: ruin (planters, cubicles, rings and pillars).
const PACK = 6;

BD.tasks.register({
  id: 'hunt', name: '사냥', layout: 'ruin', icon: 'chief',
  // the middle chief stands beside the ruin's centre ring (4u off the zone centre on both axes)
  places() { return [{ kind: 'chief', zone: [0, 2] }, { kind: 'chief', zone: [2, 0] }, { kind: 'chief', zone: [1, 1], at: [4, 4] }]; },
  goal() { return 3; },
  start(w, task) {
    const P = BD.places, rng = w.rng.spawn, kind = P.eliteKind(w);
    task.chiefs = [];
    (w.floor.layout.targets || []).filter((t) => t.kind === 'chief').forEach((t, i) => {
      const group = 'hunt:' + i;
      const chief = BD.W.makeEnemy(w, kind, t.x, t.y, { via: 'placed', elite: true, dormant: { r: 7 }, flags: { keep: true, target: true, chief: true, wake: group } });
      task.chiefs.push(chief.id);
      const pack = [];
      for (let k = 0; k < PACK; k++) pack.push(P.fodder(w, rng));
      P.guard(w, t.x, t.y, pack.filter(Boolean), { r0: 1.4, r1: 3.4, group });
    });
  },
  on: { kill(ev, w, task) { if (task.chiefs && task.chiefs.includes(ev.enemyId)) BD.taskRt.progress(w, 1); } },
  label(task) { return '사냥 ' + task.value + '/' + task.goal; },
  numbers: { PACK },
});

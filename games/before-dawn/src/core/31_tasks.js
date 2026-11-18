// Floor tasks (과업, GDD-V2 §5.4) and the floor's end (§5.5): task → guardian at the stairs zone →
// floor clear → stairs. The task kinds are content (BD.tasks, src/content/tasks/*.js); this file
// runs whichever kind the floor was generated with.
//
//   BD.taskRt.start(w)            floor entry: w.task = {kind, name, value, goal, done}, def.start(w, task)
//   BD.taskRt.progress(w, n)      value += n (task_progress); at the goal → complete
//   BD.taskRt.set(w, value)       value = n (for tasks that measure rather than count)
//   BD.taskRt.complete(w)         task_clear, banner, the guardian appears at the stairs zone centre
//                                 (2 s warning) and waits until the hero comes within 10u
//   BD.taskRt.update(w, dt)       def.update(w, task, dt)
//   BD.taskRt.floorClear(w)       the guardian is down: floor_clear, the horde scatters, every shard
//                                 flies to the hero (called by flow.guardianKilled)
// A task def listens to events with on: {kill(ev, w, task) …}; the listeners live while its floor does.
// v2 task defs (src/content/tasks/): {id, name, layout (§5.3), icon?, places?(n) → [{kind, zone: [zx, zy],
// at?: [dx, dy]}] (where its sites / targets stand: the generator keeps their 5 × 5 clear), goal(n, w),
// start?, update?, on?, label?, wantMult?(w, task) → the director's want × this while it holds}.

const C = BD.C;
const W = BD.W;
const T = BD.taskRt = {};

T.start = function (w) {
  const kind = w.floor.task;
  if (w.task && w.task.owner) w.bus.offOwner(w.task.owner);
  if (!kind) { w.task = null; return; }
  const def = BD.tasks.get(kind);
  const task = { kind, name: def.name, value: 0, goal: def.goal(w.floorN, w), done: false, owner: {} };
  w.task = task;
  if (def.on) for (const ev of Object.keys(def.on)) w.bus.on(ev, (p) => { if (w.task === task) def.on[ev](p, w, task); }, task.owner);
  if (def.start) def.start(w, task);
};

T.set = function (w, value) {
  const t = w.task;
  if (!t || t.done) return;
  t.value = Math.max(0, Math.min(t.goal, value));
  W.emit(w, 'task_progress', { floor: w.floorN, task: t.kind, value: t.value, goal: t.goal });
  if (t.value >= t.goal) T.complete(w);
};
T.progress = function (w, n) { if (w.task && !w.task.done) T.set(w, w.task.value + (n === undefined ? 1 : n)); };

T.complete = function (w) {
  const t = w.task;
  if (!t || t.done) return;
  t.done = true;
  w.stats.tasks.push(t.kind);
  W.emit(w, 'task_clear', { floor: w.floorN, task: t.kind });
  W.banner(w, '수호자가 계단을 지킨다', 'task');
  const F = C.V2.floor, kind = w.floor.guardian;
  if (kind) {
    const [x, y] = BD.nav.resolve(w.grid, F.guardianAt[0], F.guardianAt[1], 0.6);
    W.spawnAt(w, kind, x, y, { guardian: true, via: 'door', warn: F.guardianWarn, dormant: { r: F.guardianWake } });
  }
};

T.update = function (w, dt) {
  const t = w.task;
  if (!t) return;
  if (BD.places) BD.places.wake(w); // dormant groups (a chest's guards, a chief's pack) wake together in view
  const def = BD.tasks.get(t.kind);
  if (def.update) def.update(w, t, dt);
};

T.floorClear = function (w) {
  W.emit(w, 'floor_clear', { floor: w.floorN });
  BD.director.clear(w);
  BD.growth.pullAll(w);
};

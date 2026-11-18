// 소탕 (purge) — GDD-V2 §5.4. Kill a number of enemies anywhere on the floor; no site. The
// reference task: every kill counts (fodder, threats, elites; the guardian comes after).
// Goal per floor: 200 / 260 / 330 / 400 / 470. Layout: plaza (§5.3).
const GOALS = [0, 200, 260, 330, 400, 470];

BD.tasks.register({
  id: 'purge', name: '소탕', layout: 'plaza',
  goal(n) { return GOALS[n] || GOALS[5]; },
  on: {
    kill(ev, w) { if (!ev.guardian && !ev.boss) BD.taskRt.progress(w, 1); },
  },
  label(task) { return '소탕 ' + task.value + '/' + task.goal; },
});

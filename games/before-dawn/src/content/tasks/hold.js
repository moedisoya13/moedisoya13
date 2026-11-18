// 수성 (hold) — GDD-V2 §5.4. The brazier in the middle room of the hall. Be inside its ring (3.5u)
// for 40 s in all (leaving stops the count, it never goes back): the beacon rises — every fodder on
// screen dies (their shards drop) — and the guardian comes. While he is in the ring the director
// wants 1.4 × as many enemies (they come in through the room's four doors), and at 20 s an elite
// comes out of a rift warning at one of the doors. Looks: cold → lit (from the first step in).
// Layout: hall (aisles and pillars round a walled room with four doors).
const NEED = 40, RING = 3.5, WANT = 1.4, ELITE_AT = 20;

BD.sites.register({
  id: 'brazier', name: '화로', stay: NEED, total: true, ring: RING, known: true, ringColor: '#ff9a3a', states: ['cold', 'lit'],
  first(w) { BD.W.banner(w, '화로에 불이 붙었다 — 지켜라', 'task'); },
  use(w, site) {
    for (const e of w.enemies.slice()) if (!e.dead && e.role === 'fodder' && BD.W.onScreen(w, e.x, e.y)) { e.lastSource = 'burst'; BD.combat.kill(w, e); }
    BD.W.emit(w, 'vfx', { kind: 'beacon', x: site.x, y: site.y, life: 1.6 });
    BD.W.banner(w, '봉화가 올랐다', 'task');
    return true;
  },
  look(w, s) { return s.entered || s.phase !== 'idle' ? 'lit' : 'cold'; },
});

// is the hero inside the idle brazier's ring now
const holding = (w) => w.sites.some((s) => s.kind === 'brazier' && s.phase === 'idle' && BD.math.dist(w.hero.x, w.hero.y, s.x, s.y) <= RING && !w.hero.dead);

BD.tasks.register({
  id: 'hold', name: '수성', layout: 'hall', icon: 'brazier',
  places() { return [{ kind: 'brazier', zone: [1, 1] }]; },
  goal() { return NEED; },
  // the director's want while he holds the ring (src/core/28_director.js reads task defs' wantMult)
  wantMult(w) { return holding(w) ? WANT : 1; },
  update(w, task) {
    const s = w.sites.find((x) => x.kind === 'brazier');
    if (!s || task.done) return;
    const v = Math.min(NEED, Math.floor(s.progress + 1e-6));
    if (v !== task.value && s.phase === 'idle') BD.taskRt.set(w, v);
    if (!s.mem.elite && s.progress >= ELITE_AT) {
      s.mem.elite = true;
      // at the door of the room farthest from the hero (the room's doors are mid-side, 6u out)
      const doors = [[s.x, s.y - 6], [s.x, s.y + 6], [s.x - 6, s.y], [s.x + 6, s.y]];
      doors.sort((a, b) => BD.math.dist(b[0], b[1], w.hero.x, w.hero.y) - BD.math.dist(a[0], a[1], w.hero.x, w.hero.y));
      BD.places.warn(w, doors[0][0], doors[0][1], [BD.places.eliteKind(w)], { r0: 0, r1: 0.6, elite: true, flags: { marker: 'threat' } });
      BD.W.toast(w, '정예가 온다');
    }
  },
  on: { site_clear(ev, w) { if (ev.kind === 'brazier') BD.taskRt.set(w, NEED); } },
  label(task) { return '수성 ' + task.value + '/' + task.goal + '초'; },
  numbers: { NEED, RING, WANT, ELITE_AT },
});

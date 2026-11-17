// One fixed 1/60 s simulation step of a world, in a fixed order:
//  hero stats → hero move/dash → distance field → auto-attack → timers → enemies →
//  hazards → statuses → rifts → waves/interactions/pickups → deaths → clock/dawn → cleanup → tick event
// The world does not advance while the altar overlay is open (the app also checks overlays).

const C = BD.C;
const W = BD.W;

BD.tick = function (w) {
  const dt = C.TICK;
  if (w.over || w.altarOpen) return;
  if (w.ending) {
    w.ending.t -= dt;
    if (w.ending.t <= 1e-9) {
      w.over = { result: w.ending.kind, cause: w.ending.cause, floor: w.floorN, t: w.t };
    }
    return;
  }
  if (w.blackoutT > 0) {
    w.blackoutT -= dt;
    if (w.blackoutT <= 1e-9) { w.blackoutT = 0; BD.flow.enterFloor(w, w.blackoutTo); }
    return;
  }
  w.ticks++;
  w.t += dt;
  BD.hero.computeStats(w);
  const moved = BD.hero.update(w, dt);
  W.updateField(w, dt);
  BD.hero.autoAttack(w, dt);
  W.runTimers(w);
  if (w.freezeT > 0) w.freezeT = Math.max(0, w.freezeT - dt);
  BD.ai.update(w, dt);
  BD.hazards.update(w, dt);
  BD.status.update(w, dt);
  W.updateRifts(w, dt);
  BD.flow.update(w, dt);
  BD.combat.resolveDeaths(w);
  BD.flow.updateDawn(w, dt);
  if (w.enemies.some((e) => e.dead)) w.enemies = w.enemies.filter((e) => !e.dead);
  let alive = 0;
  for (const e of w.enemies) if (!e.down) alive++;
  if (!w.over && !w.ending) W.emit(w, 'tick', { dt, moved: BD.math.round(moved, 4), enemiesAlive: alive });
};

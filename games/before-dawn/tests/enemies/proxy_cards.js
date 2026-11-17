// Stand-ins for the ten base cards the cards agent is writing (GDD §5.3–5.5, hooks per
// ARCHITECTURE §3.6), used ONLY to tune enemy numbers against a realistic base card pool
// before the real cards land. Loaded with load({extraFiles}); never built into the game.
// Ids carry a `proxy_` prefix so they cannot collide with the real cards.
const M = BD.math;
const reg = (d) => BD.cards.register(Object.assign({ unlock: 'base', desc: 'proxy', hud() { return {}; } }, d));

reg({ id: 'proxy_whirl', name: '회전베기*', family: 'shape',
  shapes(ctx) { return [{ kind: 'circle', r: ctx.hero.stats.reach, factor: 0.7, source: 'whirl' }]; } });
reg({ id: 'proxy_flame', name: '화염*', family: 'element', element: 'flame',
  onHit(ctx, e) { ctx.status(e, 'burn', { direct: true }); } });
reg({ id: 'proxy_lightning', name: '뇌전*', family: 'element', element: 'lightning',
  onHit(ctx, e, hit) {
    if (!ctx.swing || e.id !== ctx.swing.primaryId || ctx.swing.data.chained) return;
    ctx.swing.data.chained = true;
    const done = new Set(ctx.swing.hits.map((h) => h.e.id));
    let cur = e, wet = !!e.statuses.wet, max = 3;
    for (let i = 0; i < max; i++) {
      let best = null, bd = 3.0;
      for (const o of ctx.enemies()) { if (done.has(o.id)) continue; const d = M.dist(o.x, o.y, cur.x, cur.y) - o.r; if (d <= bd) { bd = d; best = o; } }
      if (!best) break;
      if (best.statuses.wet) { wet = true; max = 5; }
      done.add(best.id);
      ctx.damage(best, Math.max(1, Math.round(hit.dmg * (wet ? 1 : 0.6))), { source: 'chain', direct: false });
      cur = best;
    }
  } });
reg({ id: 'proxy_leech', name: '흡수*', family: 'trigger',
  init(ctx) { ctx.state.n = 0; },
  on: { kill(ev, ctx) {
    if (ev.guardian || ev.elite) { ctx.heal(10, 'leech'); return; }
    if (++ctx.state.n >= 4) { ctx.state.n = 0; ctx.heal(5, 'leech'); }
  } } });
reg({ id: 'proxy_riposte', name: '반격*', family: 'trigger',
  init(ctx) { ctx.state.cd = 0; },
  on: {
    tick(ev, ctx) { ctx.state.cd = Math.max(0, ctx.state.cd - ev.dt); },
    hurt(ev, ctx) {
      if (ctx.state.cd > 0) return;
      ctx.state.cd = 2.0;
      ctx.after(0.15, () => ctx.strike({ shapes: [{ kind: 'circle', r: 2.6 }], factorScale: 2, source: 'riposte' }));
    },
    dodge(ev, ctx) {
      if (ctx.state.cd > 0) return;
      ctx.state.cd = 2.0;
      ctx.strike({ shapes: [{ kind: 'circle', r: 2.6 }], factorScale: 3, source: 'riposte' });
      ctx.hero.dashCd = 0;
    },
  } });
reg({ id: 'proxy_holy_light', name: '성광*', family: 'target', targetType: 'undead',
  flat(ctx, e) { return e.type === 'undead' ? 8 : 0; },
  onHit(ctx, e) { if (e.type === 'undead') e.flags.noRevive = true; } });
reg({ id: 'proxy_armor_break', name: '갑옷 파쇄*', family: 'target', targetType: 'heavy',
  stats(ctx, s) { s.mods.ignoreGuard = true; },
  mult(ctx, e) { return e.statuses.sunder ? 1 + 0.15 * e.statuses.sunder.n : 1; },
  onHit(ctx, e) { if (e.type === 'heavy') ctx.status(e, 'sunder', { max: 5 }); } });
reg({ id: 'proxy_rest_of_dead', name: '망자의 안식*', family: 'quest', goal: 12,
  offerable: (i) => i.byType.undead >= 12,
  flat(ctx, e) { if (!ctx.state.awakened) return e.type === 'undead' ? 4 : 0; return e.type === 'undead' ? 10 : 3; },
  onHit(ctx, e) { if (ctx.state.awakened && e.type === 'undead') e.flags.noRevive = true; },
  on: { kill(ev, ctx) {
    if (ev.type !== 'undead') return;
    if (!ctx.state.awakened) ctx.addProgress(1);
    else for (const o of ctx.enemies()) if (M.dist(o.x, o.y, ev.x, ev.y) - o.r <= 1.8) ctx.damage(o, 20, { source: 'burst', direct: false });
  } } });
reg({ id: 'proxy_kings_hunt', name: '왕의 사냥*', family: 'quest', goal: 3,
  offerable: (i) => i.guardians >= 3,
  flat(ctx, e) { return !ctx.state.awakened && (e.guardian || e.elite || e.boss) ? 3 : 0; },
  mult(ctx, e) { return ctx.state.awakened && (e.guardian || e.elite || e.boss) ? 1.6 : 1; },
  on: {
    guardian_kill(ev, ctx) { if (!ctx.state.awakened) ctx.addProgress(1); },
    kill(ev, ctx) {
      if (!ctx.state.awakened) return;
      if (ev.guardian) ctx.heal(100, 'kings_hunt'); else if (ev.elite) ctx.heal(15, 'kings_hunt');
    },
  } });
reg({ id: 'proxy_flawless', name: '무결*', family: 'combo', maxStack: 6,
  init(ctx) { ctx.state.clean = true; },
  stats(ctx, s) { if (ctx.state.stack >= 2) s.interval *= 0.85; if (ctx.state.stack >= 4) s.reach += 0.4; },
  afterSwing(ctx) {
    if (ctx.state.stack < 6) return;
    const sw = ctx.swing;
    ctx.after(0.2, () => ctx.strike({ shapes: sw.shapes.map((s) => Object.assign({}, s, { source: 'echo' })), factorScale: 0.5 }));
  },
  on: {
    kill(ev, ctx) { if (ctx.state.stack < 6) ctx.setStack(ctx.state.stack + 1, 'gain'); },
    hurt(ev, ctx) { if (ctx.state.stack > 0) ctx.setStack(0, 'hurt'); },
  } });

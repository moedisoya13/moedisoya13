// Which GDD §10 sound plays on which event (card-state sounds are in 35_cardfx.js).
// Enemy attacks name their own sounds in their def (`attacks.<id>.sfx` when the blow lands,
// `sfxStart` when the warning starts); a `blink` style warning plays `blink`, every other
// warning the low `telegraph` tick.

const typeOf = (kind) => (BD.enemies.has(kind) ? BD.enemies.get(kind).type : null);

function attackSfx(w, kindOrNull, attack, key) {
  if (kindOrNull && BD.enemies.has(kindOrNull)) {
    const a = BD.enemies.get(kindOrNull).attacks || {};
    if (attack && a[attack] && a[attack][key]) return a[attack][key];
  }
  return null;
}

BD.ui.effects.register({
  id: 'sounds',
  on: {
    swing(ev, ui) { ui.sfxSafe('slash'); },
    strike(ev, ui) {
      const src = new Set(ev.shapes.map((s) => s.source));
      if (src.has('whirl')) ui.sfxSafe('whirl');
      if (src.has('pierce')) ui.sfxSafe('pierce');
    },
    projectile(ev, ui) {
      if (!ev.hostile) { if (ev.kind === 'wave') ui.sfxSafe('wave'); return; }
      ui.sfxSafe('arrow');
    },
    hit(ev, ui) {
      if (ev.source === 'chain') ui.sfxSafe('chain');
      else if (ev.direct) ui.sfxSafe('hit');
    },
    guard(ev, ui) { ui.sfxSafe('hit_guard'); },
    kill(ev, ui) { ui.sfxSafe('kill'); },
    status(ev, ui) {
      if (!ev.on) return;
      if (ev.status === 'burn') ui.sfxSafe('ignite');
      else if (ev.status === 'wet') ui.sfxSafe('splash');
    },
    steam(ev, ui) { ui.sfxSafe('steam'); },
    slam(ev, ui) { ui.sfxSafe('slam'); },
    dash(ev, ui) { ui.sfxSafe('dash'); },
    dodge(ev, ui) { ui.sfxSafe('dodge'); },
    hurt(ev, ui) { ui.sfxSafe('hurt'); },
    heal(ev, ui) {
      if (ev.source === 'flask') ui.sfxSafe('flask');
      else if (ev.source === 'altar') ui.sfxSafe('heal_small');
    },
    telegraph(ev, ui) {
      const own = attackSfx(ui.world, ev.ownerKind, ev.attack, 'sfxStart');
      if (own) return ui.sfxSafe(own);
      ui.sfxSafe(ev.style === 'blink' ? 'blink' : 'telegraph');
    },
    telegraph_fire(ev, ui) {
      const own = attackSfx(ui.world, ev.ownerKind, ev.attack, 'sfx');
      if (own) ui.sfxSafe(own);
    },
    rift(ev, ui) { if (!ev.guardian) ui.sfxSafe('spawn'); },
    spawn(ev, ui) {
      const e = BD.W.enemyById(ui.world, ev.enemyId);
      if (e && e.guardian) ui.sfxSafe('guardian_in');
    },
    guardian_kill(ev, ui) { ui.sfxSafe('guardian_down'); },
    stairs_open(ev, ui) { ui.sfxSafe('stairs_open'); },
    altar_open(ev, ui) { ui.sfxSafe('altar_open'); },
    trial_clear(ev, ui) { ui.sfxSafe('altar_open'); },
    boss_phase(ev, ui) { ui.sfxSafe('boss_roar'); },
    dawn(ev, ui) { ui.sfxSafe('dawn_bell'); },
    death(ev, ui) { ui.sfxSafe('death'); },
    win(ev, ui) { ui.sfxSafe('win'); },
  },
});
BD.ui.typeOf = typeOf;

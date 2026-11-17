// Enemy numbers that tuning changed but that the engine keeps in BD.C (GDD §6.3 guardian HP per
// floor, BD.C.GUARDIAN.hp). Until the lead moves the tuned row into BD.C (docs/requests/enemies.md,
// "tuning"), every guardian rescales itself from its guardian.create through BD.enemyTune.guardian:
// maxHp = guardianHp[floor] × the night-depth HP modifier, exactly as the engine computes it.
// Every other tuned number sits in its enemy's own file; tests/enemies/numbers.test.js lists them.

BD.enemyTune = {
  guardianHp: [0, 480, 660, 840, 1020, 1200], // GDD 160 / 220 / 280 / 340 / 400 (×3)
  guardian(e, w) {
    const row = BD.enemyTune.guardianHp;
    const hp = Math.round((row[w.floorN] || row[5]) * w.mods.enemyHp);
    e.hp = hp; e.maxHp = hp;
  },
};

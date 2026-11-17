// 샘 (spring) — GDD-V2 §4.6, §5.5. Stand 1.2 s in its ring: HP +40, once; it runs dry. At full HP
// the stay does not run (it is left for later). Looks: full → dry.
const HEAL = 40;

BD.sites.register({
  id: 'spring', name: '샘', stay: 1.2, optional: true, states: ['full', 'dry'],
  ready(w) { return w.hero.hp < w.hero.maxHp; },
  use(w) { BD.W.heal(w, HEAL, 'spring'); BD.W.toast(w, '샘 — HP +' + HEAL); return true; },
  look(w, s) { return s.phase === 'idle' ? 'full' : 'dry'; },
  heal: HEAL,
});

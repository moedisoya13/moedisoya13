// Spawn bundles for type `heavy` (GDD §7.4). Index = floor (1..5); index 0 unused.
// 1F is "—" in both tables: heavy is never dominant on 1F and sends nobody there. K = dark_knight.
BD.gen.bundles.register({
  id: 'heavy',
  dom: [null, null, { dark_knight: 3 }, { dark_knight: 4 }, { dark_knight: 5 }, { dark_knight: 6 }],
  nondom: [null, null, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }],
});

// v2 horde mix (GDD-V2 §3.3): 고블린 병졸 85 %, 고블린 15 %; dark knights, each counting as two threats.
BD.director.mixes.register({ id: 'heavy', fodder: { squire: 85, goblin: 15 }, threats: { dark_knight: 1 }, threatCost: { dark_knight: 2 } });

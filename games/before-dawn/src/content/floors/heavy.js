// Spawn bundles for type `heavy` (GDD §7.4). Index = floor (1..5); index 0 unused.
// 1F is "—" in both tables: heavy is never dominant on 1F and sends nobody there. K = dark_knight.
BD.gen.bundles.register({
  id: 'heavy',
  dom: [null, null, { dark_knight: 3 }, { dark_knight: 4 }, { dark_knight: 5 }, { dark_knight: 6 }],
  nondom: [null, null, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }, { dark_knight: 1 }],
});

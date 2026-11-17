// Spawn bundles for type `beast` (GDD §7.4). Index = floor (1..5); index 0 unused.
// dom = this type's bundle when it is the floor's dominant type, nondom otherwise.
BD.gen.bundles.register({
  id: 'beast',
  dom: [null, { goblin: 8, slime: 4 }, { goblin: 11, slime: 5 }, { goblin: 14, slime: 7 }, { goblin: 17, slime: 8 }, { goblin: 20, slime: 9 }],
  nondom: [null, { goblin: 2, slime: 1 }, { goblin: 3, slime: 1 }, { goblin: 4, slime: 1 }, { goblin: 3, slime: 2 }, { goblin: 4, slime: 2 }],
});

// v2 horde mix (GDD-V2 §3.3): fodder weights (share of the count) and threat weights.
BD.director.mixes.register({ id: 'beast', fodder: { goblin: 100 }, threats: { slime: 1 } });

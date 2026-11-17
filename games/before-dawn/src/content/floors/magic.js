// Spawn bundles for type `magic` (GDD §7.4). Index = floor (1..5); index 0 unused.
// dom[1] is null: magic is never dominant on 1F (§7.5 ①, §16 ⑥). M = mage.
BD.gen.bundles.register({
  id: 'magic',
  dom: [null, null, { mage: 8 }, { mage: 10 }, { mage: 12 }, { mage: 13 }],
  nondom: [null, { mage: 1 }, { mage: 2 }, { mage: 2 }, { mage: 2 }, { mage: 3 }],
});

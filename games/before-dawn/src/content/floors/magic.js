// Spawn bundles for type `magic` (GDD §7.4). Index = floor (1..5); index 0 unused.
// dom[1] is null: magic is never dominant on 1F (§7.5 ①, §16 ⑥). M = mage.
BD.gen.bundles.register({
  id: 'magic',
  // tuned (GDD §16 foresees it: fire zones covered the room): GDD M8 / M10 / M12 / M13
  dom: [null, null, { mage: 6 }, { mage: 7 }, { mage: 8 }, { mage: 9 }],
  nondom: [null, { mage: 1 }, { mage: 2 }, { mage: 2 }, { mage: 2 }, { mage: 3 }],
});

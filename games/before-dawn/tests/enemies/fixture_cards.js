// Test-only cards for the enemy tests (loaded with t.load({extraFiles})). Never shipped.
// They set exactly the flags ARCHITECTURE §3.6 assigns to armor_break / holy_light, so the
// enemy side can be checked before the cards agent's real cards exist.
BD.cards.register({
  id: 'etest_ignore_guard', name: '시험 갑옷 파쇄', family: 'target', targetType: 'heavy', unlock: () => false, desc: 'test',
  stats(ctx, s) { s.mods.ignoreGuard = true; },
});
BD.cards.register({
  id: 'etest_no_revive', name: '시험 성광', family: 'target', targetType: 'undead', unlock: () => false, desc: 'test',
  onHit(ctx, e) { if (e.type === 'undead') e.flags.noRevive = true; },
});

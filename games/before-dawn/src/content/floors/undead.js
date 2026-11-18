// Spawn bundles for type `undead` (GDD §7.4). Index = floor (1..5); index 0 unused.
// dom = this type's bundle when it is the floor's dominant type, nondom otherwise.
// A = skel_archer, H = ghoul.
BD.gen.bundles.register({
  id: 'undead',
  dom: [null, { skel_archer: 5, ghoul: 2 }, { skel_archer: 6, ghoul: 3 }, { skel_archer: 8, ghoul: 4 }, { skel_archer: 9, ghoul: 5 }, { skel_archer: 10, ghoul: 6 }],
  nondom: [null, { skel_archer: 2 }, { skel_archer: 1, ghoul: 1 }, { skel_archer: 2, ghoul: 1 }, { skel_archer: 2, ghoul: 1 }, { skel_archer: 3, ghoul: 1 }],
});

// v2 horde mix (GDD-V2 §3.3): 굶주린 망자 85 %, 고블린 15 %; archers and ghouls 2 : 1.
BD.director.mixes.register({ id: 'undead', fodder: { husk: 85, goblin: 15 }, threats: { skel_archer: 2, ghoul: 1 }, elite: 'ghoul' });

// Seeded randomness. One mulberry32 root per run, split into named streams.
// Logic may only use streams gen, spawn, ai (and fx for cosmetics). Never Math.random / Date.now.

BD.hashStr = function (s) {
  // FNV-1a 32-bit, returned as 8 hex chars.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
};

BD.hash32 = function (s) { return parseInt(BD.hashStr(s), 16) >>> 0; };

BD.Rng = function (seed) {
  let a = seed >>> 0;
  const r = {
    seed: a,
    next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(lo, hi) { return lo + (hi - lo) * r.next(); },
    int(lo, hi) { return lo + Math.floor(r.next() * (hi - lo + 1)); }, // inclusive
    chance(p) { return r.next() < p; },
    pick(arr) { if (!arr.length) BD.fail('rng.pick on empty array'); return arr[Math.floor(r.next() * arr.length)]; },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(r.next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
    // derive an independent child stream
    fork(name) { return BD.Rng(BD.hash32(a + ':' + name)); },
  };
  return r;
};

// Named stream derived from the run seed. Same (seed, name) → same stream.
BD.stream = function (seed, name) { return BD.Rng(BD.hash32('bd:' + (seed >>> 0) + ':' + name)); };
BD.STREAMS = ['gen', 'spawn', 'ai', 'fx'];

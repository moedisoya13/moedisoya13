// Shared set-up for the feel measurements (tools/feel/*.js). Node only, no game file is edited.
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'load'));

// Empty W×H arena on `floor`, no waves, hero in the middle, no cards unless given.
function arena(o) {
  o = o || {};
  const BD = o.BD || load();
  const H = BD.harness();
  H.start({ seed: o.seed || 7, hand: o.hand || [], floor: o.floor || 2, tier: 0, level: 1 }); // level 1: base swing (GDD-V2 §10.3 would start 2F at 6)
  const w = H.world();
  H.killAll(); w.wave.n = 3; w.freezeT = 0;
  const W = o.w || 16, Hh = o.h || 16;
  w.grid = o.cells ? BD.Grid.fromString(W, Hh, o.cells) : BD.Grid(W, Hh);
  w.field = null; w.fieldCell = -1; w.fieldCache = null;
  w.hero.x = o.hx !== undefined ? o.hx : W / 2; w.hero.y = o.hy !== undefined ? o.hy : Hh / 2;
  w.hero.atkTimer = o.noAttack ? 1e9 : 0;
  H.input({ mx: 0, my: 0 });
  return { BD, H, w };
}

function spawn(BD, w, kind, x, y, opts) {
  return BD.W.makeEnemy(w, kind, x, y, Object.assign({ noAttack: 0, via: 'placed' }, opts || {}));
}

// mulberry32, local to the tools (the sim's own streams are not touched)
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f = (v, d) => (typeof v === 'number' ? v.toFixed(d === undefined ? 2 : d) : String(v));

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2), v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    o[k] = v;
  }
  return o;
}

module.exports = { load, arena, spawn, rng, median, mean, f, args };

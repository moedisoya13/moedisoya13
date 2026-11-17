#!/usr/bin/env node
// Runs every tests/**/*.test.js (discovered by directory, sorted). A test file exports
// { 'name': (t) => {...} } (may be async); t = { load(opts), assert, eq, near, fixture, dist }.
// Throw to fail. Browser tests: require('playwright') and open t.dist (build first).
// Usage: node tools/test.js [filter]
'use strict';
const path = require('path');
const assert = require('assert');
const L = require('./layers');
const { load } = require('./load');

const filter = process.argv[2] || '';
const files = L.listFiles('tests').filter((f) => f.endsWith('.test.js') && f.includes(filter));
let pass = 0, fail = 0;
const t = {
  load,
  assert,
  eq: (a, b, msg) => assert.deepStrictEqual(a, b, msg),
  near: (a, b, eps, msg) => { if (Math.abs(a - b) > (eps || 1e-6)) throw new Error(`${msg || ''} expected ${b} ± ${eps}, got ${a}`); },
  fixture: (name) => 'tests/fixtures/' + name,
  dist: 'file://' + path.join(L.ROOT, 'dist/before-dawn.html'),
};
(async () => {
for (const f of files) {
  const mod = require(path.join(L.ROOT, f));
  for (const [name, fn] of Object.entries(mod)) {
    try { await fn(t); pass++; console.log(`ok   ${f} › ${name}`); } catch (err) { fail++; console.log(`FAIL ${f} › ${name}\n     ${String(err && err.stack || err).split('\n').slice(0, 4).join('\n     ')}`); }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();

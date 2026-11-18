// Node loader: evaluates the simulation layers (core, content, bot) exactly as the
// built HTML does, without any DOM. Usage:
//   const { load } = require('./tools/load'); const BD = load(); const h = BD.harness();
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('./layers');

function load(opts = {}) {
  const BD = {};
  BD.env = 'node';
  BD.assetMeta = L.assetMeta();
  BD.animMeta = opts.animMeta || L.animMeta().meta; // clip choice is presentation; tests may pass their own
  const files = L.simFiles().concat(opts.extraFiles || []);
  for (const rel of files) {
    const src = fs.readFileSync(path.join(L.ROOT, rel), 'utf8');
    const fn = vm.runInThisContext(`(function(BD){'use strict';${src}\n})`, { filename: path.join(L.ROOT, rel) });
    fn(BD);
  }
  BD.finalize();
  return BD;
}

module.exports = { load };

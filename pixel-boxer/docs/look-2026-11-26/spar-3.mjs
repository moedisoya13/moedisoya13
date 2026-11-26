// spar-3: the same seed is a different round in the browser than under node (tools/spar.mjs, the tests, docs/spar.md and the
// audit's seed numbers), because the planner's choices hang on the last bits of Math.sin/cos/atan2/exp..., which differ between
// JS engine builds; the round diverges within about a second and ends with another knockdown at another time. So a #s-N link
// is a different round in another browser engine (Safari's JavaScriptCore was not available here to try).
// Usage: node spar-3.cjs <pixel-boxer root> [seeds, comma]   (starts its own static server)
import { createRequire } from 'node:module'; import path from 'node:path'; import http from 'node:child_process';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = process.argv[2], seeds = (process.argv[3] || '29,7,1').split(',').map(Number), port = 8900 + Math.floor(Math.random() * 90);
(async () => {
  const srv = http.spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const { planOf } = await import(path.join(root, 'src/spar/plan.mjs'));
  const b = await chromium.launch(); let differ = 0, firstAt = [];
  try {
    for (const s of seeds) {
      const p = await b.newPage({ viewport: { width: 390, height: 844 } });
      await p.goto(`http://127.0.0.1:${port}/spar.html?capture#s-${s}`);
      await p.waitForFunction(() => globalThis.__spar && !document.getElementById('loading'), null, { timeout: 60000 });
      await p.evaluate(s => __spar.newRound(s), s);
      await p.waitForFunction(() => __spar.plan && __spar.plan.done, null, { timeout: 180000 });
      const web = await p.evaluate(() => ({ ko: __spar.plan.ko, men: __spar.plan.men.map(m => m.grade), hp: __spar.plan.hp, inputs: __spar.plan.inputs, rails: JSON.stringify([__spar.plan.rails, __spar.plan.feet]) }));
      await p.close();
      const node = planOf(s);
      let first = -1; for (let k = 0; k < Math.min(node.inputs.length, web.inputs.length); k++) if (JSON.stringify(node.inputs[k]) !== JSON.stringify(web.inputs[k])) { first = k; break; }
      const same = node.ko.step === web.ko.step && node.ko.J === web.ko.J && JSON.stringify([node.rails, node.feet]) === web.rails;
      if (!same) differ++; if (first >= 0) firstAt.push(first);
      console.log(`#${s}: men ${web.men.join('/')} hp ${web.hp} (node ${node.men.map(m => m.grade).join('/')} hp ${node.hp}); knockdown browser ${(web.ko.step / 60).toFixed(2)} s ${web.ko.name} ${web.ko.J} N·s by ${web.ko.by} | node ${(node.ko.step / 60).toFixed(2)} s ${node.ko.name} ${node.ko.J} N·s by ${node.ko.by}; controls first differ at step ${first}; four lanes the same: ${JSON.stringify([node.rails, node.feet]) === web.rails}`);
    }
    const probe = await (await b.newPage()).evaluate(() => [Math.sin(0.7), Math.atan2(0.3, 1.1), Math.exp(-1.37)]);
    const here = [Math.sin(0.7), Math.atan2(0.3, 1.1), Math.exp(-1.37)];
    console.log(`Math in the browser ${JSON.stringify(probe)} vs node ${process.version} ${JSON.stringify(here)}`);
  } finally { await b.close(); srv.kill(); }
  console.log(`REPRO: ${differ ? 'yes' : 'no'} ${differ} of ${seeds.length} seeds are another round in Chromium than under node (knockdown or lanes differ) (controls part at step ${firstAt.join(', ')})`);
})();

/* The recorded comparisons of the open-questions catalogue (src/open.clips.mjs, tools/openclips.mjs): what the registry names
   is there, and the clips of a group can stand side by side (one size, one length). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { GROUPS } from '../src/open.clips.mjs';

const at = name => new URL('../' + name, import.meta.url);

test('open clips: every clip of the registry has its video, its poster and the patch it names', () => {
  for (const [id, g] of Object.entries(GROUPS))
    for (const c of g.clips) {
      for (const f of [c.file, c.poster]) assert.ok(existsSync(at(f)) && statSync(at(f)).size > 0, `${id}/${c.id}: ${f}`);
      assert.equal(c.file, `docs/ref/open/${c.id}.webm`, c.id);
      assert.equal(c.poster, `docs/ref/open/${c.id}.jpg`, c.id);
      if (c.patch !== null) assert.ok(/^docs\/ref\/open\/patches\/[\w-]+\.patch$/.test(c.patch) && existsSync(at(c.patch)), `${id}/${c.id}: ${c.patch}`);
    }
});

test('open clips: the clips of a group share one size, one rate and one length, and every id is its own', () => {
  const ids = [];
  for (const [id, g] of Object.entries(GROUPS)) {
    if (!g.clips.length) continue;
    for (const k of ['fps', 'frames', 'w', 'h']) assert.ok(Number.isInteger(g[k]) && g[k] > 0, `${id}.${k}`);
    for (const c of g.clips) {
      for (const k of ['w', 'h', 'frames', 'fps']) if (k in c) assert.equal(c[k], g[k], `${id}/${c.id}.${k}`);
      assert.ok(c.say && typeof c.measure === 'string', `${id}/${c.id}: said and measured`);
      ids.push(c.id);
    }
  }
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
  assert.equal(new Set(Object.keys(GROUPS)).size, Object.keys(GROUPS).length);
});

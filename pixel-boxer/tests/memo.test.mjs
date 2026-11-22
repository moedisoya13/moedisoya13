/* The catalogue's notes (src/memo.mjs): what is kept of a note, and how the store's documents are sorted into rows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { group, note, MAX } from '../src/memo.mjs';

test('a note is trimmed, kept to its length, and nothing is kept of an empty one', () => {
  const now = new Date('2026-11-22T05:03:11.000Z');
  assert.deepEqual(note('jab', '  너무 빠름 \n', 'u_1', now), { item: 'jab', text: '너무 빠름', at: '2026-11-22T05:03:11.000Z', by: 'u_1' });
  assert.equal(note('jab', '   ', null, now), null);
  assert.equal(note('jab', 'x'.repeat(MAX + 50), undefined, now).text.length, MAX);
  assert.equal(note('jab', 'ok', undefined, now).by, null);
});

test('the notes go to their rows, oldest first; unknown rows and malformed documents are left out', () => {
  const docs = [
    { id: 'b', item: 'jab', text: '둘째', at: '2026-11-22T06:00:00.000Z', by: 'u_1' },
    { id: 'a', item: 'jab', text: '첫째', at: '2026-11-22T05:00:00.000Z', by: null },
    { id: 'c', item: 'hook', text: '훅', at: '2026-11-22T05:30:00.000Z' },
    { id: 'd', item: 'gone', text: '없는 줄', at: '2026-11-22T05:30:00.000Z' },
    { id: 'e', item: 'jab', text: '   ', at: '2026-11-22T07:00:00.000Z' },
    { id: 'f', item: 7, text: '틀린 줄' },
    null
  ];
  const out = group(docs, new Set(['jab', 'hook']));
  assert.deepEqual(Object.keys(out).sort(), ['hook', 'jab']);
  assert.deepEqual(out.jab.map(n => n.text), ['첫째', '둘째']);
  assert.equal(out.hook[0].by, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { results } from '../tools/feel.mjs';

for (const [rule, ok] of results) test('feel: ' + rule, () => assert.ok(ok));

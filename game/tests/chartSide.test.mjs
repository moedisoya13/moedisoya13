import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSide } from '../web/src/chartSide.js';

const H = 800;

test('auto: 하단 터치 → 차트 상단, 상단 터치 → 차트 하단', () => {
  assert.equal(decideSide('auto', 'bottom', 700, H), 'top');
  assert.equal(decideSide('auto', 'top', 100, H), 'bottom');
});

test('auto: 가운데 띠에서 시작한 터치는 현재 위치 유지', () => {
  assert.equal(decideSide('auto', 'top', 400, H), 'top');
  assert.equal(decideSide('auto', 'bottom', 430, H), 'bottom');
  assert.equal(decideSide('auto', 'bottom', 370, H), 'bottom');
});

test('고정 모드는 터치와 무관', () => {
  assert.equal(decideSide('top', 'bottom', 100, H), 'top');
  assert.equal(decideSide('bottom', 'top', 700, H), 'bottom');
});

test('터치 정보가 없으면 그대로', () => {
  assert.equal(decideSide('auto', 'top', null, H), 'top');
  assert.equal(decideSide('auto', 'bottom', 100, 0), 'bottom');
});

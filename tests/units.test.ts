/**
 * tests/units.test.ts —— 计量单位工具单元测试（node --test 直跑）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBase, dimensionCompatible, unitKind, unitLabel } from '../utils/units.ts';

test('toBase：重量单位归一到克', () => {
  assert.equal(toBase(1, 'kg'), 1000);
  assert.equal(toBase(1, 'jin'), 500);
  assert.equal(toBase(1, 'liang'), 50);
  assert.equal(toBase(250, 'g'), 250);
  assert.equal(toBase(1.8, 'kg'), 1800);
});

test('toBase：容量单位归一到毫升、按件保持件数', () => {
  assert.equal(toBase(1, 'L'), 1000);
  assert.equal(toBase(250, 'ml'), 250);
  assert.equal(toBase(3, 'piece'), 3);
});

test('dimensionCompatible：跨维度不可比', () => {
  // 重量 vs 容量 → false
  assert.equal(dimensionCompatible('kg', 'ml'), false);
  assert.equal(dimensionCompatible('g', 'L'), false);
  assert.equal(dimensionCompatible('piece', 'jin'), false);
});

test('dimensionCompatible：同维度可比', () => {
  assert.equal(dimensionCompatible('kg', 'jin'), true);
  assert.equal(dimensionCompatible('jin', 'liang'), true);
  assert.equal(dimensionCompatible('L', 'ml'), true);
  assert.equal(dimensionCompatible('piece', 'piece'), true);
});

test('unitKind / unitLabel：维度与中文标签', () => {
  assert.equal(unitKind('kg'), 'mass');
  assert.equal(unitKind('L'), 'volume');
  assert.equal(unitKind('piece'), 'count');
  assert.equal(unitLabel('jin'), '斤');
  assert.equal(unitLabel('L'), '升');
});

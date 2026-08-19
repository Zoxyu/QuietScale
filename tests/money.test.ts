/**
 * tests/money.test.ts —— 金额工具单元测试（node --test 直跑）
 *
 * 运行：npm test 或 node --test tests/
 * 约束：Node 24 type stripping，相对 import 必须带 .ts 扩展名，禁用 enum/namespace/参数属性。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yuanToFen, fenToYuan, formatYuan } from '../utils/money.ts';

test('yuanToFen：元字符串转分（基本换算）', () => {
  assert.equal(yuanToFen('39.9'), 3990);
  assert.equal(yuanToFen('0.1'), 10);
  assert.equal(yuanToFen('49.90'), 4990);
  assert.equal(yuanToFen('5'), 500);
  assert.equal(yuanToFen('0'), 0);
});

test('yuanToFen：非法输入返回 null', () => {
  assert.equal(yuanToFen(''), null);
  assert.equal(yuanToFen('   '), null);
  assert.equal(yuanToFen('abc'), null);
  assert.equal(yuanToFen('-1'), null);
  assert.equal(yuanToFen('1.2.3'), null);
  assert.equal(yuanToFen('3,9'), null);
});

test('fenToYuan：固定 2 位小数', () => {
  assert.equal(fenToYuan(3990), '39.90');
  assert.equal(fenToYuan(221), '2.21');
  assert.equal(fenToYuan(0), '0.00');
});

test('formatYuan：按指定位数四舍五入展示', () => {
  assert.equal(formatYuan(3990, 2), '39.90');
  assert.equal(formatYuan(221.67, 4), '2.2167');
  assert.equal(formatYuan(831.666, 2), '8.32');
  assert.equal(formatYuan(0, 2), '0.00');
});

test('0.1+0.2 浮点精度场景：先转整数分再相加，结果恰为 30 分', () => {
  const a = yuanToFen('0.1');
  const b = yuanToFen('0.2');
  assert.notEqual(a, null);
  assert.notEqual(b, null);
  // 浮点下 0.1+0.2 !== 0.3，但整数分运算精确
  assert.equal((a as number) + (b as number), 30);
});

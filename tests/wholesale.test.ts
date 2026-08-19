/**
 * tests/wholesale.test.ts —— 批发价 → 零售价估算单元测试（node --test 直跑）
 *
 * 覆盖：
 * - 城市表命中路径（上海/market/叶菜）；
 * - 城市缺失 → default 兜底路径；
 * - confidence 恒为 'low'、note 文案固定；
 * - 数值 = median × 系数，保留 2 位小数。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRetailRange } from '../services/wholesale.ts';
import type { MarkupTable } from '../types/models.ts';

/** 固定说明文案（与 services/wholesale.ts 保持一致） */
const EXPECTED_NOTE = '根据近期批发价格与渠道加价系数估算，仅供参考';

/** 测试用加价系数表：仅含上海与 default，便于分别验证命中与兜底 */
const MARKUPS: MarkupTable = {
  default: {
    market: {
      叶菜: [1.35, 1.55],
      根茎: [1.15, 1.3],
      猪肉: [1.12, 1.25]
    },
    supermarket: {
      叶菜: [1.55, 1.85]
    }
  },
  上海: {
    market: {
      叶菜: [1.4, 1.62],
      猪肉: [1.14, 1.28]
    }
  }
} as MarkupTable;

test('城市命中：上海/market/叶菜 按城市表系数折算', () => {
  // 批发中位价 4.0 元 → low = 4.0 × 1.4 = 5.6；high = 4.0 × 1.62 = 6.48
  const res = estimateRetailRange(4, '上海', 'market', '叶菜', MARKUPS);
  assert.equal(res.lowYuan, 5.6);
  assert.equal(res.highYuan, 6.48);
  assert.equal(res.confidence, 'low');
  assert.equal(res.note, EXPECTED_NOTE);
});

test('缺省兜底：城市不在表中 → 走 default 表系数', () => {
  // 杭州无城市表 → default.market.叶菜 [1.35, 1.55]
  // low = 4.0 × 1.35 = 5.4；high = 4.0 × 1.55 = 6.2
  const res = estimateRetailRange(4, '杭州', 'market', '叶菜', MARKUPS);
  assert.equal(res.lowYuan, 5.4);
  assert.equal(res.highYuan, 6.2);
  assert.equal(res.confidence, 'low');
  assert.equal(res.note, EXPECTED_NOTE);
});

test('数值精度：median × 系数保留 2 位小数', () => {
  // 3.33 × 1.4 = 4.662 → 4.66；3.33 × 1.62 = 5.3946 → 5.39
  const res = estimateRetailRange(3.33, '上海', 'market', '叶菜', MARKUPS);
  assert.equal(res.lowYuan, 4.66);
  assert.equal(res.highYuan, 5.39);
});

test('confidence 恒为 low、note 文案固定（多路径一致）', () => {
  const cases = [
    estimateRetailRange(4, '上海', 'market', '叶菜', MARKUPS), // 城市命中
    estimateRetailRange(4, '杭州', 'market', '叶菜', MARKUPS), // default 命中
    estimateRetailRange(4, '杭州', 'ecommerce', '叶菜', MARKUPS), // default 任意渠道兜底（supermarket 下有叶菜）
    estimateRetailRange(4, '杭州', 'market', '水产', MARKUPS), // 品类全缺失 → 内置 [1.15, 1.4]
    estimateRetailRange(4, '上海', 'market', '水产', {}) // 空表 → 内置兜底
  ];
  for (const res of cases) {
    assert.equal(res.confidence, 'low');
    assert.equal(res.note, EXPECTED_NOTE);
  }
});

test('内置保守兜底：表与品类均缺失时用 [1.15, 1.40]', () => {
  // 4.0 × 1.15 = 4.6；4.0 × 1.4 = 5.6
  const res = estimateRetailRange(4, '上海', 'market', '水产', MARKUPS);
  assert.equal(res.lowYuan, 4.6);
  assert.equal(res.highYuan, 5.6);
});

test('非法批发中位价：非正数按 0 处理，区间为 0', () => {
  const res = estimateRetailRange(-1, '上海', 'market', '叶菜', MARKUPS);
  assert.equal(res.lowYuan, 0);
  assert.equal(res.highYuan, 0);
  assert.equal(res.confidence, 'low');
});

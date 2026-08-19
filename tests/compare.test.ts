/**
 * tests/compare.test.ts —— 比价核心单元测试（node --test 直跑）
 *
 * 口径与 services/compare.ts 文件头注释一致：
 * - diffFenPerStandard = 两侧按标准展示口径各自 Math.round 到整数分后相减
 *   （mass → 每斤、volume → 每升、count → 每件）；
 * - diffPercent 用未取整 raw 值计算：|A−B| / 较贵者；
 * - 每斤/每两差额由 sides 的 unitPriceFenPerJin / unitPriceFenPerLiang 相减得到。
 *
 * 默认验收示例：A 1.8kg/39.9 元，B 2.5kg/49.9 元 + 赠品 500g。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProducts } from '../services/compare.ts';
import { formatYuan } from '../utils/money.ts';
import { formatPercent } from '../utils/format.ts';
import { CROSS_DIMENSION_MESSAGE } from '../utils/units.ts';
import type { ProductInput } from '../types/models.ts';

/** 默认单边输入骨架（与 pages/compare 的 defaultInput 一致） */
function baseInput(overrides: Partial<ProductInput>): ProductInput {
  return {
    name: '',
    unitCode: 'kg',
    quantityValue: '',
    originalPriceYuan: '',
    giftEnabled: false,
    giftUnitCode: 'g',
    giftQuantityValue: '',
    promoEnabled: false,
    promoType: 'none',
    promoValueYuan: '',
    secondItemRate: 0,
    bundleCount: 0,
    perUseAmountValue: '',
    ...overrides
  };
}

/** 默认示例 A：1.8kg / 39.9 元 */
function sampleA(): ProductInput {
  return baseInput({ name: 'A', quantityValue: '1.8', originalPriceYuan: '39.9' });
}

/** 默认示例 B：2.5kg / 49.9 元 + 赠品 500g */
function sampleB(): ProductInput {
  return baseInput({
    name: 'B',
    quantityValue: '2.5',
    originalPriceYuan: '49.9',
    giftEnabled: true,
    giftUnitCode: 'g',
    giftQuantityValue: '500'
  });
}

test('默认示例：A/B 标准单价展示值（per100g / 每斤 / 每两）', () => {
  const res = compareProducts(sampleA(), sampleB());
  assert.equal(res.ok, true);
  if (res.ok === false) {
    throw new Error('expected success');
  }
  // A：1800g / 3990 分 → raw 221.666… 分/100g
  assert.equal(formatYuan(res.sides.A.rawUnitFenPer100, 4), '2.2167');
  assert.equal(formatYuan(res.sides.A.unitPriceFenPerJin as number, 2), '11.08');
  assert.equal(formatYuan(res.sides.A.unitPriceFenPerLiang as number, 2), '1.11');
  // B：3000g（含赠品 500g）/ 4990 分 → raw 166.333… 分/100g
  assert.equal(formatYuan(res.sides.B.rawUnitFenPer100, 4), '1.6633');
  assert.equal(formatYuan(res.sides.B.unitPriceFenPerJin as number, 2), '8.32');
  assert.equal(formatYuan(res.sides.B.unitPriceFenPerLiang as number, 2), '0.83');
});

test('默认示例：胜者为 B，差额与百分比按文件头口径', () => {
  const res = compareProducts(sampleA(), sampleB());
  assert.equal(res.ok, true);
  if (res.ok === false) {
    throw new Error('expected success');
  }
  assert.equal(res.winner, 'B');
  // 差额（每斤）= 各自取整后相减：|1108 − 832| = 276 分 → 展示「每斤少花 2.76 元」
  assert.equal(res.diffFenPerStandard, 276);
  assert.equal(formatYuan(res.diffFenPerStandard, 2), '2.76');
  // 每斤差额交叉验证 = |1108 − 832| = 276 分
  const diffPerJinFen = Math.abs(
    (res.sides.A.unitPriceFenPerJin as number) - (res.sides.B.unitPriceFenPerJin as number)
  );
  assert.equal(diffPerJinFen, 276);
  assert.equal(formatYuan(diffPerJinFen, 2), '2.76');
  // 百分比用 raw 值：55.333… / 221.666… ≈ 24.96% → 展示「约便宜 25.0%」
  assert.equal(formatPercent(res.diffPercent), '25.0%');
  assert.equal(res.closeGap, false);
});

test('默认示例：赠品 0 元计入到手总量（B 有效总量 3000g）', () => {
  const res = compareProducts(sampleA(), sampleB());
  if (res.ok === false) {
    throw new Error('expected success');
  }
  assert.equal(res.sides.A.effectiveBaseValue, 1800);
  assert.equal(res.sides.B.effectiveBaseValue, 3000);
  assert.equal(res.sides.A.finalPriceFen, 3990);
  assert.equal(res.sides.B.finalPriceFen, 4990);
});

test('优惠：立减（instant-off）按原价 − 立减额计实付', () => {
  const a = baseInput({
    quantityValue: '1',
    originalPriceYuan: '20',
    promoEnabled: true,
    promoType: 'instant-off',
    promoValueYuan: '3'
  });
  const b = baseInput({ quantityValue: '1', originalPriceYuan: '20' });
  const res = compareProducts(a, b);
  if (res.ok === false) {
    throw new Error('expected success');
  }
  assert.equal(res.sides.A.finalPriceFen, 1700);
  assert.equal(res.winner, 'A');
  // 差额按每斤口径：A 1700/1kg → 850 分/斤；B 2000/1kg → 1000 分/斤；|850 − 1000| = 150
  assert.equal(res.diffFenPerStandard, 150);
});

test('优惠：优惠券（coupon）抵扣后实付', () => {
  const a = baseInput({
    quantityValue: '1',
    originalPriceYuan: '20',
    promoEnabled: true,
    promoType: 'coupon',
    promoValueYuan: '5'
  });
  const b = baseInput({ quantityValue: '1', originalPriceYuan: '20' });
  const res = compareProducts(a, b);
  if (res.ok === false) {
    throw new Error('expected success');
  }
  assert.equal(res.sides.A.finalPriceFen, 1500);
  assert.equal(res.winner, 'A');
});

test('优惠：满减后实付（final-pay）直接取实付价', () => {
  const a = baseInput({
    quantityValue: '1',
    originalPriceYuan: '25',
    promoEnabled: true,
    promoType: 'final-pay',
    promoValueYuan: '18'
  });
  const res = compareProducts(a, baseInput({ quantityValue: '1', originalPriceYuan: '25' }));
  if (res.ok === false) {
    throw new Error('expected success');
  }
  assert.equal(res.sides.A.finalPriceFen, 1800);
  assert.equal(res.winner, 'A');
});

test('优惠：第二件折扣（second-item-discount）按 2 件计算', () => {
  const a = baseInput({
    quantityValue: '1',
    originalPriceYuan: '10',
    promoEnabled: true,
    promoType: 'second-item-discount',
    secondItemRate: 0.5
  });
  const res = compareProducts(a, baseInput({ quantityValue: '2', originalPriceYuan: '20' }));
  if (res.ok === false) {
    throw new Error('expected success');
  }
  // 实付 = 1000 × (1 + 0.5) = 1500 分；有效总量 = 1000g × 2 = 2000g
  assert.equal(res.sides.A.finalPriceFen, 1500);
  assert.equal(res.sides.A.effectiveBaseValue, 2000);
  assert.equal(res.sides.A.unitPriceFenPer100, 75);
  assert.equal(res.winner, 'A');
});

test('优惠：买N件共X元（bundle-n-for-x）按 N 件总量与 X 元实付计算', () => {
  const a = baseInput({
    quantityValue: '1',
    originalPriceYuan: '12',
    promoEnabled: true,
    promoType: 'bundle-n-for-x',
    promoValueYuan: '30',
    bundleCount: 3
  });
  const res = compareProducts(a, baseInput({ quantityValue: '3', originalPriceYuan: '36' }));
  if (res.ok === false) {
    throw new Error('expected success');
  }
  assert.equal(res.sides.A.finalPriceFen, 3000);
  assert.equal(res.sides.A.effectiveBaseValue, 3000);
  assert.equal(res.sides.A.unitPriceFenPer100, 100);
  assert.equal(res.winner, 'A');
});

test('跨维度（kg vs L）：ok:false，reason cross-dimension，规定文案', () => {
  const a = baseInput({ unitCode: 'kg', quantityValue: '1', originalPriceYuan: '10' });
  const b = baseInput({ unitCode: 'L', quantityValue: '1', originalPriceYuan: '10' });
  const res = compareProducts(a, b);
  assert.equal(res.ok, false);
  if (res.ok === true) {
    throw new Error('expected failure');
  }
  assert.equal(res.reason, 'cross-dimension');
  assert.equal(res.message, CROSS_DIMENSION_MESSAGE);
});

test('无效输入：规格或价格未填/非法 → reason invalid-input', () => {
  const missingQty = compareProducts(
    baseInput({ quantityValue: '', originalPriceYuan: '10' }),
    baseInput({ quantityValue: '1', originalPriceYuan: '10' })
  );
  assert.equal(missingQty.ok, false);
  if (missingQty.ok === false) {
    assert.equal(missingQty.reason, 'invalid-input');
  }
  const badPrice = compareProducts(
    baseInput({ quantityValue: '1', originalPriceYuan: 'abc' }),
    baseInput({ quantityValue: '1', originalPriceYuan: '10' })
  );
  assert.equal(badPrice.ok, false);
  if (badPrice.ok === false) {
    assert.equal(badPrice.reason, 'invalid-input');
  }
});

test('差距小于 2%：closeGap = true', () => {
  const a = baseInput({ quantityValue: '1', originalPriceYuan: '10' });
  const b = baseInput({ quantityValue: '1', originalPriceYuan: '10.1' });
  const res = compareProducts(a, b);
  if (res.ok === false) {
    throw new Error('expected success');
  }
  // diffPercent = 1/101 ≈ 0.99% < 2%
  assert.ok(res.diffPercent < 0.02);
  assert.equal(res.closeGap, true);
  assert.equal(res.winner, 'A');
});

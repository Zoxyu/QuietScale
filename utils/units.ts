/**
 * utils/units.ts —— 计量单位工具（纯函数，零 wx 依赖）
 *
 * 归一规则：重量 → 克(g)，容量 → 毫升(ml)，按件 → 件(piece)。
 * 换算系数：kg=1000g、g=1、斤=500g、两=50g、L=1000ml、ml=1、件=1。
 */

import type { CategoryId, UnitCode, UnitKind } from '../types/models';

/** 单位 → 计量维度 */
const UNIT_KIND: Record<UnitCode, UnitKind> = {
  kg: 'mass',
  g: 'mass',
  jin: 'mass',
  liang: 'mass',
  L: 'volume',
  ml: 'volume',
  piece: 'count'
};

/** 单位 → 归一系数（到 g / ml / 件） */
const UNIT_FACTOR: Record<UnitCode, number> = {
  kg: 1000,
  g: 1,
  jin: 500,
  liang: 50,
  L: 1000,
  ml: 1,
  piece: 1
};

/** 单位 → 中文标签 */
const UNIT_LABEL: Record<UnitCode, string> = {
  kg: '千克',
  g: '克',
  jin: '斤',
  liang: '两',
  L: '升',
  ml: '毫升',
  piece: '件'
};

/** 取单位的计量维度 */
export function unitKind(unit: UnitCode): UnitKind {
  return UNIT_KIND[unit];
}

/** 取单位中文标签：千克/克/斤/两/升/毫升/件 */
export function unitLabel(unit: UnitCode): string {
  return UNIT_LABEL[unit];
}

/** 数量归一到基准单位（g / ml / 件） */
export function toBase(value: number, unit: UnitCode): number {
  return value * UNIT_FACTOR[unit];
}

/** 两个单位是否同维度可比（重量 vs 重量、容量 vs 容量、件 vs 件） */
export function dimensionCompatible(a: UnitCode, b: UnitCode): boolean {
  return UNIT_KIND[a] === UNIT_KIND[b];
}

/** 跨维度不可比时的规定提示文案 */
export const CROSS_DIMENSION_MESSAGE =
  '重量和容量不能直接换算。除非你输入商品密度，否则建议按相同单位比较。';

/* ---------- 标准单价展示标签（per100g / perJin 等概念由展示层组合） ---------- */

/** 每 100g 标签 */
export const basePer100gLabel = '每100克';
/** 每斤标签 */
export const basePerJinLabel = '每斤';
/** 每两标签 */
export const basePerLiangLabel = '每两';
/** 每 100ml 标签 */
export const basePer100mlLabel = '每100毫升';
/** 每升标签 */
export const basePerLLabel = '每升';
/** 每件标签 */
export const basePerPieceLabel = '每件';

/**
 * 分类 → 可选主规格单位集合。
 * 通用重量/米面粮油/生鲜蔬果用重量单位；液体容量用 L/ml；按件用 piece；
 * 洗护日化两者皆可（洗衣液按重量、洗发水按容量等）。
 */
export function standardUnitsFor(category: CategoryId): UnitCode[] {
  if (category === 'liquid') {
    return ['L', 'ml'];
  }
  if (category === 'piece') {
    return ['piece'];
  }
  if (category === 'daily-care') {
    return ['kg', 'g', 'jin', 'liang', 'L', 'ml'];
  }
  // weight / grain-oil / fresh 通用重量单位
  return ['kg', 'g', 'jin', 'liang'];
}

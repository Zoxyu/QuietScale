/**
 * services/seasonal.ts —— 时令判断（纯函数，零 wx 依赖）
 *
 * 数据来源：mock/seasonal-baselines.json（季节经验参考，非实时市场价）。
 *
 * 月份判定规则（与数据文件自洽）：
 * - month 在 item.months 内 → best（当季最佳）；
 * - month 在 item.stableMonths 内 → stable（供应稳定）；
 * - 其余 → off-season（反季）。
 * 文件中的 status 字段是按 8 月预先推导的快照，运行时一律按月份重新推导，
 * 保证任何月份调用都自洽。
 *
 * 说明：types/models.ts 中的 SeasonalItem 是展示层精简结构（name/status/note），
 * 与基线文件条目字段不同；SeasonalBaselineItem 契约定义在 types/models.ts，
 * 这里 re-export 以保持外部引用（从本文件 import）不变。
 */

import type { SeasonalBaselineItem, SeasonalStatus } from '../types/models';

/** 季节经验基线条目契约归位于 types/models.ts，此处 re-export 保持外部引用不变 */
export type { SeasonalBaselineItem } from '../types/models';

/** 三分类拆分结果 */
export interface SeasonalSplit {
  /** 当季最佳 */
  best: SeasonalBaselineItem[];
  /** 供应稳定 */
  stable: SeasonalBaselineItem[];
  /** 反季 */
  offSeason: SeasonalBaselineItem[];
}

/** 固定时令提示文案（正确表述，不得改写） */
const SEASONAL_TIP =
  '当季供应通常更充足，价格和风味往往更有优势；实际价格仍会受天气、产地和渠道影响。';

/** 月份是否合法（1-12 整数） */
function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

/** 按月份推导单条目的时令状态 */
function statusForMonth(item: SeasonalBaselineItem, month: number): SeasonalStatus {
  if (Array.isArray(item.months) && item.months.indexOf(month) >= 0) {
    return 'best';
  }
  if (Array.isArray(item.stableMonths) && item.stableMonths.indexOf(month) >= 0) {
    return 'stable';
  }
  return 'off-season';
}

/**
 * 查找条目：先精确匹配 productName，再退化为包含匹配（双向），
 * 便于用户输入「番茄」能命中「番茄」，输入「巨峰葡萄」能命中「葡萄」。
 */
function findItem(items: SeasonalBaselineItem[], productName: string): SeasonalBaselineItem | null {
  if (!Array.isArray(items) || typeof productName !== 'string' || productName.trim() === '') {
    return null;
  }
  const name = productName.trim();
  for (const item of items) {
    if (item.productName === name) {
      return item;
    }
  }
  for (const item of items) {
    if (name.indexOf(item.productName) >= 0 || item.productName.indexOf(name) >= 0) {
      return item;
    }
  }
  return null;
}

/**
 * 查询某个商品在指定月份的时令状态。
 * @param items 基线条目列表（seasonal-baselines.json 的 items）
 * @param month 月份 1-12
 * @param productName 商品名称（支持包含匹配）
 * @returns 时令状态；商品不在列表中或参数非法返回 null
 */
export function getSeasonalStatus(
  items: SeasonalBaselineItem[],
  month: number,
  productName: string
): SeasonalStatus | null {
  if (!isValidMonth(month)) {
    return null;
  }
  const item = findItem(items, productName);
  if (!item) {
    return null;
  }
  return statusForMonth(item, month);
}

/**
 * 按月份把全部条目拆分为三组：当季最佳 / 供应稳定 / 反季。
 * @param items 基线条目列表
 * @param month 月份 1-12；非法月份统一按反季归类
 */
export function splitSeasonalList(items: SeasonalBaselineItem[], month: number): SeasonalSplit {
  const result: SeasonalSplit = { best: [], stable: [], offSeason: [] };
  if (!Array.isArray(items)) {
    return result;
  }
  const valid = isValidMonth(month);
  for (const item of items) {
    const status = valid ? statusForMonth(item, month) : 'off-season';
    if (status === 'best') {
      result.best.push(item);
    } else if (status === 'stable') {
      result.stable.push(item);
    } else {
      result.offSeason.push(item);
    }
  }
  return result;
}

/**
 * 固定时令提示文案。
 */
export function getSeasonalTip(): string {
  return SEASONAL_TIP;
}

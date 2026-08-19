/**
 * services/wholesale.ts —— 批发价 → 零售价估算（纯函数，零 wx 依赖）
 *
 * 用「批发中位价 × 渠道加价系数」给出粗粒度零售参考区间。
 * 估算结果置信度恒为 low，仅用于量级参考。
 */

import type { MarkupTable } from '../types/models';

/** 加价系数区间 [低端倍率, 高端倍率] */
type MarkupRange = [number, number];

/** 批发折算结果 */
export interface WholesaleEstimate {
  /** 估算零售低端价（元，保留 2 位小数） */
  lowYuan: number;
  /** 估算零售高端价（元，保留 2 位小数） */
  highYuan: number;
  /** 置信度恒为 low */
  confidence: 'low';
  /** 固定说明文案 */
  note: string;
}

/** 固定说明文案 */
const ESTIMATE_NOTE = '根据近期批发价格与渠道加价系数估算，仅供参考';

/** 最终兜底系数：城市表与 default 表均缺失时使用的保守区间 */
const LAST_RESORT_RANGE: MarkupRange = [1.15, 1.4];

/** 金额保留 2 位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 城市表中按渠道取出品类系数表（channel 为任意字符串，做宽松索引） */
function pickChannel(
  cityTable: { [category: string]: MarkupRange } | undefined
): Record<string, MarkupRange> | undefined {
  return cityTable as Record<string, MarkupRange> | undefined;
}

/**
 * 由批发中位价估算零售价格区间。
 *
 * 查找顺序（逐级兜底）：
 * 1. markups[城市][渠道][品类]；
 * 2. markups.default[渠道][品类]；
 * 3. markups.default 任意渠道下的同品类系数；
 * 4. 内置保守系数 [1.15, 1.40]。
 *
 * @param wholesaleMedianYuan 批发中位价（元）
 * @param city 城市中文名（如 "上海"）
 * @param channel 目标零售渠道（market / community / supermarket / ecommerce）
 * @param category 品类（叶菜/根茎/茄果/豆类/猪肉/鸡蛋/水果/大米/食用油）
 * @param markups 加价系数表（来自 mock/markups.json 或远端）
 */
export function estimateRetailRange(
  wholesaleMedianYuan: number,
  city: string,
  channel: string,
  category: string,
  markups: MarkupTable
): WholesaleEstimate {
  let range: MarkupRange | undefined;

  // 1. 城市 → 渠道 → 品类
  const cityTable = markups[city];
  if (cityTable) {
    const channelTable = pickChannel((cityTable as any)[channel]);
    if (channelTable && Array.isArray(channelTable[category])) {
      range = channelTable[category];
    }
  }

  // 2. default → 渠道 → 品类
  const defaultTable = markups['default'];
  if (!range && defaultTable) {
    const channelTable = pickChannel((defaultTable as any)[channel]);
    if (channelTable && Array.isArray(channelTable[category])) {
      range = channelTable[category];
    }
  }

  // 3. default 任意渠道下的同品类系数
  if (!range && defaultTable) {
    for (const ch of Object.keys(defaultTable)) {
      const channelTable = pickChannel((defaultTable as any)[ch]);
      if (channelTable && Array.isArray(channelTable[category])) {
        range = channelTable[category];
        break;
      }
    }
  }

  // 4. 内置保守兜底
  if (!range) {
    range = LAST_RESORT_RANGE;
  }

  const safeMedian = Number.isFinite(wholesaleMedianYuan) && wholesaleMedianYuan > 0 ? wholesaleMedianYuan : 0;

  return {
    lowYuan: round2(safeMedian * range[0]),
    highYuan: round2(safeMedian * range[1]),
    confidence: 'low',
    note: ESTIMATE_NOTE
  };
}

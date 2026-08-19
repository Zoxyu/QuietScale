/**
 * utils/quantile.ts —— 分位数计算（纯函数，零依赖）
 * 用于参考价数据的 p25 / p50 / p75 / p90 计算与兜底校验。
 */

/**
 * 线性插值分位数（R-7 口径）。
 * @param sortedAsc 已升序排列的数值数组（调用方负责排序）
 * @param p 分位点，取值 0-1（如 0.25 / 0.5 / 0.75 / 0.9）
 * @returns 分位值；数组为空返回 null
 */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) {
    return null;
  }
  const clamped = Math.min(1, Math.max(0, p));
  const n = sortedAsc.length;
  if (n === 1) {
    return sortedAsc[0];
  }
  const index = clamped * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedAsc[lower];
  }
  // 相邻两位按小数部分线性插值
  return sortedAsc[lower] + (sortedAsc[upper] - sortedAsc[lower]) * (index - lower);
}

/** 中位数（等价于 percentile(sortedAsc, 0.5)） */
export function median(sortedAsc: number[]): number | null {
  return percentile(sortedAsc, 0.5);
}

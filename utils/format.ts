/**
 * utils/format.ts —— 展示格式化工具（纯函数，零 wx 依赖）
 */

/**
 * 比例 → 百分比字符串。
 * 示例：formatPercent(0.2496) → "25.0%"；formatPercent(0.018) → "1.8%"。
 * @param ratio 比例值（0.2496 表示 24.96%）
 * @param digits 小数位数，默认 1
 */
export function formatPercent(ratio: number, digits: number = 1): string {
  if (!Number.isFinite(ratio)) {
    return '0.0%';
  }
  return `${(ratio * 100).toFixed(digits)}%`;
}

/**
 * 本地日期键 'YYYY-MM-DD'（取设备本地时区）。
 */
export function todayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * ISO 日期串 → 更新标签。
 * 示例：formatDateLabel("2026-08-18T08:00:00Z") → "2026-08-18 更新"。
 * 解析失败时退回原始字符串拼接。
 */
export function formatDateLabel(iso: string): string {
  if (typeof iso !== 'string' || iso.trim() === '') {
    return '';
  }
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) {
    return `${iso} 更新`;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} 更新`;
}

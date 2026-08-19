/**
 * utils/money.ts —— 金额工具（纯函数，零 wx 依赖）
 *
 * 精度策略：
 * - 金额一律以「分」（整数）参与运算；
 * - 元字符串解析按小数点手工拆分整数/小数部分，全程整数运算；
 * - 禁止 parseFloat 参与金额乘法，避免二进制浮点误差
 *   （如 39.9 * 100 在浮点下得到 3989.999…）。
 */

/**
 * 元字符串 → 分（整数）。
 * 按小数点拆分：整数部分与小数部分（不足 2 位补零、超过 2 位截断）。
 * 示例："39.9" → 3990；"0.1" → 10；"49.90" → 4990；"5" → 500。
 * 非法输入（空串、含非数字、负号、多个小数点等）返回 null。
 */
export function yuanToFen(yuanStr: string): number | null {
  if (typeof yuanStr !== 'string') {
    return null;
  }
  const trimmed = yuanStr.trim();
  if (trimmed === '') {
    return null;
  }
  // 仅允许纯数字与至多一个小数点
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const dotIndex = trimmed.indexOf('.');
  const intPart = dotIndex === -1 ? trimmed : trimmed.slice(0, dotIndex);
  const decRaw = dotIndex === -1 ? '' : trimmed.slice(dotIndex + 1);
  // 小数部分补零或截断到 2 位
  const decPart = (decRaw + '00').slice(0, 2);
  const intNum = intPart === '' ? 0 : parseInt(intPart, 10);
  const decNum = parseInt(decPart, 10);
  return intNum * 100 + decNum;
}

/**
 * 分 → 元，固定返回 2 位小数字符串。
 * 示例：3990 → "39.90"；221 → "2.21"；0 → "0.00"。
 * 需要更多小数位时请使用 formatYuan。
 */
export function fenToYuan(fen: number): string {
  const safe = Number.isFinite(fen) ? fen : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(Math.round(safe));
  const intPart = Math.floor(abs / 100);
  const decPart = String(abs % 100).padStart(2, '0');
  return `${sign}${intPart}.${decPart}`;
}

/**
 * 分 → 元，按指定小数位四舍五入展示。
 * 示例：formatYuan(3990, 2) → "39.90"；formatYuan(221.67, 4) → "2.2167"。
 * 说明：/100 与 toFixed 仅用于最终展示，金额运算本身全部基于整数分。
 */
export function formatYuan(fen: number, decimals: number): string {
  if (!Number.isFinite(fen)) {
    return '0.00';
  }
  const digits = Math.max(0, Math.floor(decimals));
  const yuan = fen / 100;
  // 先用指数移位四舍五入到目标位数，消除 toFixed 的二进制浮点偏差
  const rounded = Number(`${Math.round(Number(`${yuan}e${digits}`))}e-${digits}`);
  return rounded.toFixed(digits);
}

/**
 * 整数分除法：numeratorFen / denominator，结果四舍五入到整数分。
 * denominator <= 0 返回 0（调用方应保证规格合法）。
 */
export function divRoundFen(numeratorFen: number, denominator: number): number {
  if (!Number.isFinite(numeratorFen) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Math.round(numeratorFen / denominator);
}

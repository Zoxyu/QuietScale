/**
 * services/portion.ts —— 份量换算与购买量示例（纯函数，零 wx 依赖）
 *
 * 提供：
 * - WEIGHT_REFERENCE：市制重量参照表（两/斤/公斤）；
 * - PORTION_EXAMPLES：常见食材的购买量经验示例（含免责声明）；
 * - gramsToJinLiang：克数 → 友好中文市制表述。
 */

/** 重量参照条目 */
export interface WeightReference {
  /** 市制表述，如 "半斤" */
  label: string;
  /** 对应克数 */
  grams: number;
  /** 补充说明（可选） */
  note?: string;
}

/** 份量示例条目 */
export interface PortionExample {
  /** 食材名称 */
  name: string;
  /** 估算说明文本 */
  estimateText: string;
  /** 免责声明 */
  disclaimer: string;
}

/** 份量示例统一免责声明 */
const PORTION_DISCLAIMER = '常见估算，实际受品种和大小影响';

/**
 * 市制重量参照表：
 * 1 两 = 50g；2 两 = 100g；半斤 = 250g；1 斤 = 500g；1 公斤 = 2 斤 = 1000g。
 */
export const WEIGHT_REFERENCE: WeightReference[] = [
  { label: '1 两', grams: 50 },
  { label: '2 两', grams: 100 },
  { label: '半斤', grams: 250 },
  { label: '1 斤', grams: 500 },
  { label: '2 斤', grams: 1000, note: '即 1 公斤（1kg）' }
];

/**
 * 常见食材购买量经验示例。
 */
export const PORTION_EXAMPLES: PortionExample[] = [
  {
    name: '生菜',
    estimateText: '一颗普通生菜约 250–400g，适合 1–2 人炒一顿。',
    disclaimer: PORTION_DISCLAIMER
  },
  {
    name: '长茄子',
    estimateText: '两根长茄子约 400–600g，可做一盘肉末茄子，另需搭配肉末约 150g。',
    disclaimer: PORTION_DISCLAIMER
  },
  {
    name: '叶菜',
    estimateText:
      '叶菜烹饪后体积会明显缩水，请按人数和菜品搭配购买：一道纯叶菜一般按每人 200–300g 生鲜估算即可。',
    disclaimer: PORTION_DISCLAIMER
  }
];

/**
 * 克数 → 友好中文市制表述。
 *
 * 示例：
 * - gramsToJinLiang(250) → "半斤"
 * - gramsToJinLiang(50)  → "1 两"
 * - gramsToJinLiang(500) → "1 斤"
 * - gramsToJinLiang(1000) → "2 斤（1 公斤）"
 * - gramsToJinLiang(600) → "1 斤 2 两"
 * - gramsToJinLiang(123) → "约 123 克（约 2.5 两）"
 * - gramsToJinLiang(0.4) → "不足 1 克"（(0, 0.5) 克四舍五入后为 0）
 *
 * @param grams 克数；非法或非正数返回 "0 克"
 */
export function gramsToJinLiang(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) {
    return '0 克';
  }
  const g = Math.round(grams);
  // 先取整再判断：(0, 0.5) 克取整后为 0，避免输出 "0 斤"
  if (g <= 0) {
    return '不足 1 克';
  }

  // 特判常用半斤表述
  if (g === 250) {
    return '半斤';
  }

  const jin = Math.floor(g / 500);
  const rest = g - jin * 500;

  // 整斤
  if (rest === 0) {
    return jin === 2 ? '2 斤（1 公斤）' : `${jin} 斤`;
  }

  // X 斤半（余 250g）
  if (rest === 250) {
    return jin === 0 ? '半斤' : `${jin} 斤半`;
  }

  // 整两（余数为 50g 的整数倍）
  if (rest % 50 === 0) {
    const liang = rest / 50;
    return jin === 0 ? `${liang} 两` : `${jin} 斤 ${liang} 两`;
  }

  // 其余按克展示，并给出近似的两数（1 位小数）
  const approxLiang = Math.round((g / 50) * 10) / 10;
  return `约 ${g} 克（约 ${approxLiang} 两）`;
}

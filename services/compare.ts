/**
 * services/compare.ts —— 比价核心（纯函数，零 wx 依赖，只依赖 types 与 utils）
 *
 * 金额口径：一律以「分」（整数）运算，禁止 parseFloat 参与金额乘法。
 *
 * 差额口径（重要，不可变更）：
 * diffFenPerStandard = 两侧按「标准展示口径」各自 Math.round 到整数分后相减，
 * 标准展示口径随计量维度取：mass → 每斤；volume → 每升；count → 每件。
 * 例：A 每斤 raw 1108.33 → 取整 1108；B 每斤 raw 831.67 → 取整 832；
 *     差额 = 1108 − 832 = 276 分 = 2.76 元（展示「每斤少花 2.76 元」）。
 * diffPercent 则用未取整 raw 值计算：|A−B| / 较贵者，
 *     如 276.67 / 1108.33 ≈ 24.96%（展示「约便宜 25.0%」）。
 * 两套口径各司其职：差额对展示负责（先取整再减），百分比对精度负责（raw 值）。
 */

import type { CompareResult, CompareSide, ProductInput, UnitCode } from '../types/models';
import { formatYuan, yuanToFen } from '../utils/money';
import { CROSS_DIMENSION_MESSAGE, dimensionCompatible, toBase, unitKind, unitLabel } from '../utils/units';

/** 输入无效时的规定提示文案 */
const INVALID_INPUT_MESSAGE = '请检查规格和价格是否填写完整，数字是否合法。';

/** 固定免责声明（notice 必含） */
const BASE_NOTICE = '仅按本次实付与到手总量计算，不含运费、会员费和凑单成本。';

/** 差距很小时的附加提示 */
const CLOSE_GAP_NOTICE = '单价差距很小，可按品牌、保质期、品质或便利度选择。';

/** 解析后的数字规格串（明细文本用） */
export interface ParsedProduct {
  /** 商品名称 */
  name: string;
  /** 主规格单位 */
  unitCode: UnitCode;
  /** 主规格数量 */
  quantity: number;
  /** 原价（分） */
  originalPriceFen: number;
  /** 是否含赠品 */
  giftEnabled: boolean;
  /** 赠品单位 */
  giftUnitCode: UnitCode;
  /** 赠品数量 */
  giftQuantity: number;
  /** 是否启用优惠 */
  promoEnabled: boolean;
  /** 优惠类型 */
  promoType: ProductInput['promoType'];
  /** 优惠金额 / 满减后实付价 / 买N件共X元的X（分） */
  promoValueFen: number;
  /** 第二件折扣率（0.5 = 第二件 5 折） */
  secondItemRate: number;
  /** 买 N 件的 N */
  bundleCount: number;
  /** 每次用量（基准单位数值）；未填写时为 null */
  perUseBaseValue: number | null;
}

/** 解析数量字符串：非有限数或 <= 0 返回 null */
function parseQuantity(value: string): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num;
}

/**
 * 解析商品原始输入为数值结构。
 * 校验规则：
 * - 主规格数量与原价必填且合法，否则返回 null；
 * - 赠品开关打开时，赠品单位必须与主规格同维度、数量合法；
 * - 优惠开关打开时，按类型校验金额/折扣率/件数：
 *   立减/优惠券：金额为分且不超过原价；满减后实付价：金额为分（允许 0）；
 *   第二件折扣：折扣率 (0, 1]；买N件共X元：N ≥ 2 且金额为分。
 * - 每次用量为可选项，填写非法时视为未填写（null）。
 */
export function parseProductInput(p: ProductInput): ParsedProduct | null {
  const quantity = parseQuantity(p.quantityValue);
  if (quantity === null) {
    return null;
  }
  const originalPriceFen = yuanToFen(p.originalPriceYuan);
  if (originalPriceFen === null || originalPriceFen <= 0) {
    return null;
  }

  // 赠品解析
  let giftEnabled = false;
  let giftQuantity = 0;
  if (p.giftEnabled) {
    const giftQty = parseQuantity(p.giftQuantityValue);
    if (giftQty === null || !dimensionCompatible(p.unitCode, p.giftUnitCode)) {
      return null;
    }
    giftEnabled = true;
    giftQuantity = giftQty;
  }

  // 优惠解析
  let promoType: ProductInput['promoType'] = 'none';
  let promoValueFen = 0;
  let secondItemRate = 0;
  let bundleCount = 0;
  if (p.promoEnabled) {
    promoType = p.promoType;
    if (promoType === 'instant-off' || promoType === 'coupon') {
      const amount = yuanToFen(p.promoValueYuan);
      if (amount === null || amount <= 0 || amount > originalPriceFen) {
        return null;
      }
      promoValueFen = amount;
    } else if (promoType === 'final-pay') {
      const amount = yuanToFen(p.promoValueYuan);
      if (amount === null || amount < 0) {
        return null;
      }
      promoValueFen = amount;
    } else if (promoType === 'second-item-discount') {
      if (!Number.isFinite(p.secondItemRate) || p.secondItemRate <= 0 || p.secondItemRate > 1) {
        return null;
      }
      secondItemRate = p.secondItemRate;
    } else if (promoType === 'bundle-n-for-x') {
      const amount = yuanToFen(p.promoValueYuan);
      if (
        amount === null ||
        amount <= 0 ||
        !Number.isFinite(p.bundleCount) ||
        p.bundleCount < 2 ||
        Math.floor(p.bundleCount) !== p.bundleCount
      ) {
        return null;
      }
      promoValueFen = amount;
      bundleCount = p.bundleCount;
    }
  }

  // 每次用量（可选）：与主规格同单位，填写非法时视为未填写
  let perUseBaseValue: number | null = null;
  const perUseQty = parseQuantity(p.perUseAmountValue);
  if (perUseQty !== null) {
    perUseBaseValue = toBase(perUseQty, p.unitCode);
  }

  return {
    name: p.name,
    unitCode: p.unitCode,
    quantity,
    originalPriceFen,
    giftEnabled,
    giftUnitCode: p.giftUnitCode,
    giftQuantity,
    promoEnabled: p.promoEnabled && promoType !== 'none',
    promoType,
    promoValueFen,
    secondItemRate,
    bundleCount,
    perUseBaseValue
  };
}

/**
 * 单边计算：有效总量、实付金额与标准单价。
 *
 * 规则 1：effectiveBaseValue = 主规格归一值 + 赠品归一值
 *         （赠品 0 元计入到手总量，不虚构赠品现金价值）。
 * 规则 2：实付金额（分）按优惠类型：
 *         none：原价；instant-off / coupon：原价 − 优惠金额（不低于 0）；
 *         final-pay：直接取满减后实付价；
 *         second-item-discount：按购买 2 件，实付 = 原价 + 原价 × 折扣率，
 *                               有效总量 = 主规格 × 2 + 赠品；
 *         bundle-n-for-x：实付 = X 元，有效总量 = 主规格 × N + 赠品。
 * 规则 3：标准单价保留未取整 raw 值，另存 Math.round 到整数分的展示值。
 * 规则 4：洗护日化每次用量 > 0 时计算 perUseCostFen =
 *         finalPriceFen / (effectiveBaseValue / 每次用量归一值)。
 */
export function computeSide(p: ParsedProduct): CompareSide | null {
  const mainBase = toBase(p.quantity, p.unitCode);
  const giftBase = p.giftEnabled ? toBase(p.giftQuantity, p.giftUnitCode) : 0;
  let effectiveBaseValue = mainBase + giftBase;
  let finalPriceFen = p.originalPriceFen;

  if (p.promoEnabled) {
    if (p.promoType === 'instant-off' || p.promoType === 'coupon') {
      finalPriceFen = Math.max(0, p.originalPriceFen - p.promoValueFen);
    } else if (p.promoType === 'final-pay') {
      finalPriceFen = p.promoValueFen;
    } else if (p.promoType === 'second-item-discount') {
      finalPriceFen = Math.round(p.originalPriceFen * (1 + p.secondItemRate));
      effectiveBaseValue = mainBase * 2 + giftBase;
    } else if (p.promoType === 'bundle-n-for-x') {
      finalPriceFen = p.promoValueFen;
      effectiveBaseValue = mainBase * p.bundleCount + giftBase;
    }
  }

  if (!(effectiveBaseValue > 0) || !Number.isFinite(effectiveBaseValue)) {
    return null;
  }

  // 每 100g / 100ml / 每件 的未取整分值
  // 注意：count 维度不乘 100 —— 每件分值 = 实付 ÷ 件数（语义即每件，见 CompareSide 注释）
  const kind = unitKind(p.unitCode);
  const perBaseFen = finalPriceFen / effectiveBaseValue;
  const rawUnitFenPer100 = kind === 'count' ? perBaseFen : perBaseFen * 100;

  const side: CompareSide = {
    effectiveBaseValue,
    finalPriceFen,
    unitPriceFenPer100: Math.round(rawUnitFenPer100),
    rawUnitFenPer100,
    unitPriceFenPerJin: null,
    unitPriceFenPerLiang: null,
    unitPriceFenPerL: null
  };

  if (kind === 'mass') {
    // 每斤 = 每 g 分值 × 500；每两 = × 50
    side.unitPriceFenPerJin = Math.round(perBaseFen * 500);
    side.unitPriceFenPerLiang = Math.round(perBaseFen * 50);
  } else if (kind === 'volume') {
    // 每升 = 每 ml 分值 × 1000
    side.unitPriceFenPerL = Math.round(perBaseFen * 1000);
  }

  // 每次使用成本：每次用量 <= 0 时不计算
  if (p.perUseBaseValue !== null && p.perUseBaseValue > 0) {
    const useCount = effectiveBaseValue / p.perUseBaseValue;
    if (Number.isFinite(useCount) && useCount > 0) {
      side.perUseCostFen = Math.round(finalPriceFen / useCount);
    }
  }

  return side;
}

/** 基准单位展示名：克 / 毫升 / 件 */
function baseUnitName(unit: UnitCode): string {
  const kind = unitKind(unit);
  if (kind === 'mass') {
    return '克';
  }
  if (kind === 'volume') {
    return '毫升';
  }
  return '件';
}

/** 标准单位计量名：斤 / 升 / 件（用于「元/斤」类文案，与差额口径一致） */
function standardUnitName(unit: UnitCode): string {
  const kind = unitKind(unit);
  if (kind === 'mass') {
    return '斤';
  }
  if (kind === 'volume') {
    return '升';
  }
  return '件';
}

/** 数量展示：直接转字符串（整数自然无小数点） */
function formatQty(value: number): string {
  return String(value);
}

/** 优惠构成描述 */
function describePromo(p: ParsedProduct): string {
  if (!p.promoEnabled || p.promoType === 'none') {
    return '无优惠';
  }
  if (p.promoType === 'instant-off') {
    return `立减${formatYuan(p.promoValueFen, 2)}元`;
  }
  if (p.promoType === 'coupon') {
    return `优惠券抵扣${formatYuan(p.promoValueFen, 2)}元`;
  }
  if (p.promoType === 'final-pay') {
    return `满减后实付${formatYuan(p.promoValueFen, 2)}元`;
  }
  if (p.promoType === 'second-item-discount') {
    // 支持半折：0.85 → "8.5"、0.5 → "5"（整数不带小数点）
    const discountTenths = Math.round(p.secondItemRate * 100) / 10;
    const discountLabel = Number.isInteger(discountTenths) ? String(discountTenths) : discountTenths.toFixed(1);
    return `第二件${discountLabel}折（按购买2件计算）`;
  }
  return `买${p.bundleCount}件共${formatYuan(p.promoValueFen, 2)}元`;
}

/** 实付构成描述：「原价39.90元 − 立减5.00元 → 实付34.90元」等 */
function describePay(p: ParsedProduct, finalPriceFen: number): string {
  const original = formatYuan(p.originalPriceFen, 2);
  const finalText = formatYuan(finalPriceFen, 2);
  if (!p.promoEnabled || p.promoType === 'none') {
    return `实付${finalText}元（原价${original}元，无优惠）`;
  }
  if (p.promoType === 'instant-off' || p.promoType === 'coupon') {
    const promoText = p.promoType === 'instant-off' ? '立减' : '优惠券抵扣';
    return `原价${original}元 − ${promoText}${formatYuan(p.promoValueFen, 2)}元 → 实付${finalText}元`;
  }
  if (p.promoType === 'final-pay') {
    return `原价${original}元，${describePromo(p)} → 实付${finalText}元`;
  }
  if (p.promoType === 'second-item-discount') {
    return `${describePromo(p)}：原价${original}元 × 2件（第二件折扣后）→ 实付${finalText}元`;
  }
  return `${describePromo(p)} → 实付${finalText}元`;
}

/** 有效总量描述：主规格 + 赠品 + 优惠件数说明 */
function describeQuantity(p: ParsedProduct, effectiveBaseValue: number, finalPriceFen: number): string {
  const baseName = baseUnitName(p.unitCode);
  const mainText = `${formatQty(p.quantity)}${unitLabel(p.unitCode)}（${formatQty(toBase(p.quantity, p.unitCode))}${baseName}）`;
  let text = `${mainText}`;

  if (p.promoEnabled && p.promoType === 'second-item-discount') {
    const mainBase = toBase(p.quantity, p.unitCode);
    text += ` × 2件（第二件折扣）= ${formatQty(mainBase * 2)}${baseName}`;
  } else if (p.promoEnabled && p.promoType === 'bundle-n-for-x') {
    const mainBase = toBase(p.quantity, p.unitCode);
    text += ` × ${p.bundleCount}件 = ${formatQty(mainBase * p.bundleCount)}${baseName}`;
  }

  if (p.giftEnabled) {
    const giftBase = toBase(p.giftQuantity, p.giftUnitCode);
    text += ` + 赠品${formatQty(p.giftQuantity)}${unitLabel(p.giftUnitCode)}（${formatQty(giftBase)}${baseName}）`;
  }

  return `到手总量 ${formatQty(effectiveBaseValue)}${baseName}（${text}），实付${formatYuan(finalPriceFen, 2)}元`;
}

/** 赠品计入说明 */
function describeGift(p: ParsedProduct): string {
  if (!p.giftEnabled) {
    return '';
  }
  const baseName = baseUnitName(p.unitCode);
  const giftBase = toBase(p.giftQuantity, p.giftUnitCode);
  return `赠品${formatQty(giftBase)}${baseName}按0元计入到手总量，未虚构赠品现金价值`;
}

/** 组装单边明细行 */
function buildSideLines(tag: string, p: ParsedProduct, side: CompareSide): string[] {
  const lines = [
    `${tag}｜${describeQuantity(p, side.effectiveBaseValue, side.finalPriceFen)}`,
    `${tag}｜${describePay(p, side.finalPriceFen)}`
  ];
  const giftText = describeGift(p);
  if (giftText !== '') {
    lines.push(`${tag}｜${giftText}`);
  }
  return lines;
}

/** 「每斤少花 2.76 元」类差额描述 */
function savingText(unit: UnitCode, diffFen: number): string {
  const kind = unitKind(unit);
  const amount = formatYuan(diffFen, 2);
  if (kind === 'mass') {
    return `每斤少花 ${amount} 元`;
  }
  if (kind === 'volume') {
    return `每升少花 ${amount} 元`;
  }
  return `每件少花 ${amount} 元`;
}

/**
 * 比较两个商品，返回判别联合结果。
 * - 主规格跨维度（一边重量一边容量）→ ok:false、reason:'cross-dimension'；
 * - 任一输入无效 → ok:false、reason:'invalid-input'；
 * - 成功时按标准单价定胜负，差额与百分比按文件头部说明的口径计算。
 */
export function compareProducts(a: ProductInput, b: ProductInput): CompareResult {
  // 跨维度检查（原始输入层即可判定）
  if (!dimensionCompatible(a.unitCode, b.unitCode)) {
    return { ok: false, reason: 'cross-dimension', message: CROSS_DIMENSION_MESSAGE };
  }

  const parsedA = parseProductInput(a);
  const parsedB = parseProductInput(b);
  if (parsedA === null || parsedB === null) {
    return { ok: false, reason: 'invalid-input', message: INVALID_INPUT_MESSAGE };
  }

  const sideA = computeSide(parsedA);
  const sideB = computeSide(parsedB);
  if (sideA === null || sideB === null) {
    return { ok: false, reason: 'invalid-input', message: INVALID_INPUT_MESSAGE };
  }

  // 胜负与差额：raw 值定胜负；差额按标准展示口径各自取整后相减
  //（mass → 每斤、volume → 每升、count → 每件）
  const kind = unitKind(a.unitCode);
  let rawA: number;
  let rawB: number;
  let roundedA: number;
  let roundedB: number;
  if (kind === 'mass') {
    // 每斤 raw = 每 100g raw × 5；取整值取 unitPriceFenPerJin
    rawA = sideA.rawUnitFenPer100 * 5;
    rawB = sideB.rawUnitFenPer100 * 5;
    roundedA = sideA.unitPriceFenPerJin as number;
    roundedB = sideB.unitPriceFenPerJin as number;
  } else if (kind === 'volume') {
    // 每升 raw = 每 100ml raw × 10；取整值取 unitPriceFenPerL
    rawA = sideA.rawUnitFenPer100 * 10;
    rawB = sideB.rawUnitFenPer100 * 10;
    roundedA = sideA.unitPriceFenPerL as number;
    roundedB = sideB.unitPriceFenPerL as number;
  } else {
    // count 维度：per100 字段语义即每件（未乘 100）
    rawA = sideA.rawUnitFenPer100;
    rawB = sideB.rawUnitFenPer100;
    roundedA = sideA.unitPriceFenPer100;
    roundedB = sideB.unitPriceFenPer100;
  }

  let winner: 'A' | 'B' | 'tie';
  if (rawA < rawB) {
    winner = 'A';
  } else if (rawB < rawA) {
    winner = 'B';
  } else {
    winner = 'tie';
  }

  const diffFenPerStandard = Math.abs(roundedA - roundedB);
  const expensiveRaw = Math.max(rawA, rawB);
  const diffPercent = expensiveRaw > 0 ? Math.abs(rawA - rawB) / expensiveRaw : 0;
  const closeGap = diffPercent < 0.02;

  // 明细文本
  const details: string[] = [];
  details.push(...buildSideLines('A', parsedA, sideA));
  details.push(...buildSideLines('B', parsedB, sideB));
  if (winner === 'tie') {
    details.push(`两者单价持平：${formatYuan(roundedA, 4)} 元/${standardUnitName(a.unitCode)}`);
  } else {
    const winnerTag = winner === 'A' ? 'A' : 'B';
    details.push(
      `${winnerTag} 更划算：${savingText(a.unitCode, diffFenPerStandard)}，约便宜 ${(diffPercent * 100).toFixed(1)}%`
    );
  }

  // 提示文本
  const notices: string[] = [BASE_NOTICE];
  if (closeGap) {
    notices.push(CLOSE_GAP_NOTICE);
  }
  if (sideA.perUseCostFen !== undefined && sideB.perUseCostFen !== undefined) {
    notices.push(
      `两边都填写了每次用量：A 每次约${formatYuan(sideA.perUseCostFen, 2)}元，` +
        `B 每次约${formatYuan(sideB.perUseCostFen, 2)}元，可结合每次使用成本选择。`
    );
  }

  return {
    ok: true,
    sides: { A: sideA, B: sideB },
    winner,
    diffFenPerStandard,
    diffPercent,
    closeGap,
    details,
    notice: notices.join(' ')
  };
}

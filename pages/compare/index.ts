/**
 * pages/compare/index.ts —— 「比一比」首页
 *
 * 职责：纯胶水层。事件转发 + setData + 调用 services/compare.ts。
 * 流程：组件 triggerEvent('change', {side, patch}) → 路径式 setData 合并输入
 *       → 120ms 防抖 → compareProducts → 组装展示结构 → 交给 result-card。
 */

import { compareProducts } from '../../services/compare';
import { APP_CONFIG } from '../../config/app.config';
import { fenToYuan, formatYuan } from '../../utils/money';
import { dimensionCompatible, unitKind } from '../../utils/units';
import type { CategoryId, CompareSide, ProductInput, UnitCode } from '../../types/models';

/** 运行时全局定时器的本地声明（lib ES2017 未含 DOM 定时器类型） */
declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): number;
declare function clearTimeout(handle?: number): void;

/** 输入防抖间隔（毫秒） */
const DEBOUNCE_MS = 120;

/** 分类展示顺序（与 CategoryId 一一对应） */
const CATEGORY_LIST: Array<{ id: CategoryId; name: string }> = [
  { id: 'weight', name: '通用重量' },
  { id: 'liquid', name: '液体容量' },
  { id: 'piece', name: '按件售卖' },
  { id: 'grain-oil', name: '米面粮油' },
  { id: 'daily-care', name: '洗护日化' },
  { id: 'fresh', name: '生鲜蔬果' }
];

/** 分类 → 结果卡主口径文案（每斤 / 每升 / 每件） */
const STANDARD_LABEL: Record<'mass' | 'volume' | 'count', string> = {
  mass: '每斤',
  volume: '每升',
  count: '每件'
};

/** 差额行的短单位（元 / 斤、元 / 升、元 / 件） */
const STANDARD_SHORT: Record<'mass' | 'volume' | 'count', string> = {
  mass: '斤',
  volume: '升',
  count: '件'
};

/** 洗护日化专属：浓缩度提示（追加在 compareProducts 返回的 notice 之后） */
const DAILY_CARE_NOTICE =
  '若两款洗衣液浓缩度、成分和单次建议用量不同，建议再比较每次使用成本，而不仅是重量单价。';

/** 默认单边输入骨架 */
function defaultInput(): ProductInput {
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
    perUseAmountValue: ''
  };
}

/**
 * 各分类预填充案例（A/B 一对；单位均为该分类合法单位）。
 * 切换分类时整体替换，保证案例与分类语义一致（如按件售卖用抽纸而非洗衣液）。
 */
const PRESET_CASES: Record<CategoryId, { a: Partial<ProductInput>; b: Partial<ProductInput> }> = {
  weight: {
    a: { name: '鲜鸡蛋', unitCode: 'jin', quantityValue: '2', originalPriceYuan: '19.9' },
    b: { name: '土鸡蛋', unitCode: 'jin', quantityValue: '1.5', originalPriceYuan: '24.9' }
  },
  liquid: {
    a: { name: '纯牛奶', unitCode: 'L', quantityValue: '1', originalPriceYuan: '12.9' },
    b: { name: '高钙奶', unitCode: 'ml', quantityValue: '950', originalPriceYuan: '15.9' }
  },
  piece: {
    a: { name: '抽纸', unitCode: 'piece', quantityValue: '24', originalPriceYuan: '49.9' },
    b: { name: '抽纸', unitCode: 'piece', quantityValue: '36', originalPriceYuan: '69.9' }
  },
  'grain-oil': {
    a: { name: '东北大米', unitCode: 'kg', quantityValue: '5', originalPriceYuan: '39.9' },
    b: { name: '泰国香米', unitCode: 'kg', quantityValue: '5', originalPriceYuan: '55.9' }
  },
  'daily-care': {
    a: { name: 'A 品牌洗衣液', unitCode: 'kg', quantityValue: '1.8', originalPriceYuan: '39.9' },
    b: {
      name: 'B 品牌洗衣液',
      unitCode: 'kg',
      quantityValue: '2.5',
      originalPriceYuan: '49.9',
      giftEnabled: true,
      giftUnitCode: 'g',
      giftQuantityValue: '500'
    }
  },
  fresh: {
    a: { name: '番茄', unitCode: 'jin', quantityValue: '2', originalPriceYuan: '7.9' },
    b: { name: '圣女果', unitCode: 'g', quantityValue: '500', originalPriceYuan: '6.9' }
  }
};

/** 金额展示：先 round 到整数分再转元（与 compare.ts 展示口径一致） */
function roundFen(v: number): number {
  return Math.round(v);
}

/** 归一总量 → 友好文案（如 3000g → "3000g / 6 斤"） */
function friendlyTotal(base: number, unit: UnitCode): string {
  const kind = unitKind(unit);
  const trim = (n: number): string => {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2);
  };
  if (kind === 'mass') {
    const jin = base / 500;
    if (base >= 1000) {
      return `${trim(base)}g / ${trim(base / 1000)}kg / ${trim(jin)}斤`;
    }
    return `${trim(base)}g / ${trim(jin)}斤`;
  }
  if (kind === 'volume') {
    return base >= 1000 ? `${trim(base)}ml / ${trim(base / 1000)}L` : `${trim(base)}ml`;
  }
  return `${trim(base)}件`;
}

/** 单侧单价展示行（主口径大字 + 次口径小字；主口径与差额口径一致：每斤/每升/每件） */
function buildSideView(s: CompareSide, unit: UnitCode): { label: string; priceFen: number; unitLines: Array<{ label: string; price: string }> } {
  const kind = unitKind(unit);
  const unitLines: Array<{ label: string; price: string }> = [];
  let mainPriceFen: number;
  if (kind === 'mass') {
    mainPriceFen = s.unitPriceFenPerJin as number;
    unitLines.push(
      { label: '元/100g', price: formatYuan(roundFen(s.rawUnitFenPer100), 2) },
      { label: '元/斤', price: formatYuan(s.unitPriceFenPerJin as number, 2) },
      { label: '元/两', price: formatYuan(s.unitPriceFenPerLiang as number, 2) }
    );
  } else if (kind === 'volume') {
    mainPriceFen = s.unitPriceFenPerL as number;
    unitLines.push(
      { label: '元/100ml', price: formatYuan(roundFen(s.rawUnitFenPer100), 2) },
      { label: '元/升', price: formatYuan(s.unitPriceFenPerL as number, 2) }
    );
  } else {
    // count 维度：rawUnitFenPer100 语义即每件分值（未乘 100）
    mainPriceFen = roundFen(s.rawUnitFenPer100);
    unitLines.push({ label: '元/件', price: formatYuan(mainPriceFen, 2) });
  }
  return { label: STANDARD_SHORT[kind], priceFen: mainPriceFen, unitLines };
}

/** 把 CompareSuccess 组装成 result-card 的展示结构（纯数据，组件负责动画与渲染） */
function buildResultSpec(result: Extract<ReturnType<typeof compareProducts>, { ok: true }>, a: ProductInput, b: ProductInput, category: CategoryId): Record<string, unknown> {
  const sides = result.sides;
  const winner = result.winner;
  const kind = unitKind(a.unitCode);
  const stdLabel = STANDARD_LABEL[kind];

  let headline: string;
  if (winner === 'tie' || result.closeGap) {
    headline = '单价差距很小，可按品牌、保质期、品质或便利度选择。';
  } else {
    headline = `选 ${winner}，${stdLabel}少花`;
  }

  const perUseA = sides.A.perUseCostFen;
  const perUseB = sides.B.perUseCostFen;
  const showPerUse = category === 'daily-care' && perUseA !== undefined && perUseB !== undefined;

  const sideA = buildSideView(sides.A, a.unitCode);
  const sideB = buildSideView(sides.B, b.unitCode);

  let notice = result.notice;
  if (category === 'daily-care') {
    notice = `${notice} ${DAILY_CARE_NOTICE}`;
  }

  return {
    winner,
    closeGap: result.closeGap,
    headline,
    showDiff: winner !== 'tie' && !result.closeGap,
    stdLabel,
    diffUnit: STANDARD_SHORT[kind],
    diffFen: result.diffFenPerStandard,
    percent: Math.round(result.diffPercent * 1000) / 10,
    sides: [
      { tag: 'A', win: winner === 'A', priceFen: sideA.priceFen, price: formatYuan(sideA.priceFen, 2), label: sideA.label, unitLines: sideA.unitLines, total: friendlyTotal(sides.A.effectiveBaseValue, a.unitCode), finalYuan: fenToYuan(sides.A.finalPriceFen) },
      { tag: 'B', win: winner === 'B', priceFen: sideB.priceFen, price: formatYuan(sideB.priceFen, 2), label: sideB.label, unitLines: sideB.unitLines, total: friendlyTotal(sides.B.effectiveBaseValue, b.unitCode), finalYuan: fenToYuan(sides.B.finalPriceFen) }
    ],
    details: result.details,
    notice,
    showPerUse,
    perUse: showPerUse
      ? {
          a: formatYuan(perUseA as number, 2),
          b: formatYuan(perUseB as number, 2),
          deltaTag:
            (perUseA as number) === (perUseB as number)
              ? '每次成本持平'
              : `${(perUseA as number) < (perUseB as number) ? 'A' : 'B'} 每次省 ${formatYuan(Math.abs((perUseA as number) - (perUseB as number)), 2)} 元`
        }
      : null
  };
}

Page({
  data: {
    categories: CATEGORY_LIST,
    category: 'daily-care' as CategoryId,
    inputA: { ...defaultInput(), ...PRESET_CASES['daily-care'].a } as ProductInput,
    inputB: { ...defaultInput(), ...PRESET_CASES['daily-care'].b } as ProductInput,
    editingA: false,
    editingB: false,
    swapping: false,
    noTrans: false,
    sheetOpen: false,
    resultStatus: 'none' as 'none' | 'invalid' | 'cross' | 'ok',
    resultSpec: null as Record<string, unknown> | null,
    resultMessage: '',
    resultTick: 0
  },

  /** 防抖计时器句柄 */
  _debounceTimer: 0 as number,
  /** 交换动画计时器句柄 */
  _swapTimer: 0 as number,
  /** 交换后移除 no-trans 类的计时器句柄 */
  _noTransTimer: 0 as number,

  onLoad(this: any): void {
    this.recompute();
  },

  /** 同步自定义 tabBar 选中态（比一比 = 0） */
  onShow(this: any): void {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onUnload(this: any): void {
    clearTimeout(this._debounceTimer);
    clearTimeout(this._swapTimer);
    clearTimeout(this._noTransTimer);
  },

  /** 打开/关闭「计算说明」Bottom Sheet */
  onSheet(this: any, e: any): void {
    this.setData({ sheetOpen: e.currentTarget.dataset.open === '1' });
  },

  /** 分类切换：整体替换为该分类的预填充案例后重算 */
  onCategoryChange(this: any, e: any): void {
    const category = e.detail.id as CategoryId;
    const preset = PRESET_CASES[category];
    this.setData({
      category,
      inputA: { ...defaultInput(), ...preset.a } as ProductInput,
      inputB: { ...defaultInput(), ...preset.b } as ProductInput
    });
    this.recompute();
  },

  /** 商品卡片输入上抛：路径式 setData 合并 patch 后防抖重算 */
  onProductChange(this: any, e: any): void {
    const { side, patch } = e.detail as { side: 'A' | 'B'; patch: Partial<ProductInput> };
    // 主规格单位跨维度变更时，赠品单位同步收敛，避免非法组合
    if (patch.unitCode !== undefined) {
      const current = side === 'A' ? this.data.inputA : this.data.inputB;
      if (!dimensionCompatible(patch.unitCode, current.giftUnitCode)) {
        patch.giftUnitCode = patch.unitCode;
      }
    }
    const key = side === 'A' ? 'inputA' : 'inputB';
    const updates: Record<string, unknown> = {};
    Object.keys(patch).forEach((field) => {
      updates[`${key}.${field}`] = (patch as Record<string, unknown>)[field];
    });
    this.setData(updates);
    this.scheduleRecompute();
  },

  /** 卡片聚焦/失焦上抛：控制抬升态 */
  onEditChange(this: any, e: any): void {
    const { side, editing } = e.detail as { side: 'A' | 'B'; editing: boolean };
    this.setData({ [side === 'A' ? 'editingA' : 'editingB']: editing });
  },

  /** A/B 交换：先加 class 做 300ms 位移动画，动画结束时交换数据并瞬时归零 transform（无回程） */
  onSwap(this: any): void {
    if (this.data.swapping) {
      return;
    }
    this.setData({ swapping: true });
    this._swapTimer = setTimeout(() => {
      const { inputA, inputB } = this.data;
      // 交换数据的同时移除位移 class 并临时禁用 transition（no-trans），
      // 让 transform 无过渡归零：滑过去 → 内容原地互换 → 无回程
      this.setData({ inputA: inputB, inputB: inputA, swapping: false, noTrans: true });
      // 下一帧恢复 transition，不影响后续动画
      this._noTransTimer = setTimeout(() => {
        this.setData({ noTrans: false });
      }, 24);
      wx.vibrateShort({ type: 'light' });
      this.recompute();
    }, APP_CONFIG.SWAP_ANIMATION_MS);
  },

  /** 120ms 防抖后重算 */
  scheduleRecompute(this: any): void {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.recompute(), DEBOUNCE_MS);
  },

  /** 调用 compareProducts 并写入结果展示结构 */
  recompute(this: any): void {
    const { inputA, inputB, category } = this.data;
    const result = compareProducts(inputA, inputB);
    if (result.ok) {
      this.setData({
        resultStatus: 'ok',
        resultSpec: buildResultSpec(result, inputA, inputB, category),
        resultMessage: '',
        resultTick: this.data.resultTick + 1
      });
      return;
    }
    if (result.reason === 'cross-dimension') {
      this.setData({ resultStatus: 'cross', resultSpec: null, resultMessage: result.message });
      return;
    }
    this.setData({ resultStatus: 'invalid', resultSpec: null, resultMessage: '请补全规格与价格' });
  }
});

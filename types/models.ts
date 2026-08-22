/**
 * types/models.ts —— 全局数据契约（单一真相源）
 *
 * 页面、组件、脚本与测试一律引用本文件的类型定义。
 * 约束：
 * - 全部使用字符串字面量联合类型（禁止 enum/namespace），
 *   保证可被 Node 24 type stripping 直接运行测试。
 * - 金额字段凡参与运算者一律以「分」（整数）表达；
 *   带 Yuan 后缀的字段为「元」字符串原始输入，由解析层转换。
 */

/** 计量维度：重量 / 容量 / 按件 */
export type UnitKind = 'mass' | 'volume' | 'count';

/** 支持的计量单位编码 */
export type UnitCode = 'kg' | 'g' | 'jin' | 'liang' | 'L' | 'ml' | 'piece';

/** 商品分类：通用重量 / 液体容量 / 按件售卖 / 米面粮油 / 洗护日化 / 生鲜蔬果 */
export type CategoryId = 'weight' | 'liquid' | 'piece' | 'grain-oil' | 'daily-care' | 'fresh';

/** 优惠类型：无优惠 / 立减 / 优惠券 / 满减后实付价 / 第二件折扣 / 买N件共X元 */
export type PromotionType =
  | 'none'
  | 'instant-off'
  | 'coupon'
  | 'final-pay'
  | 'second-item-discount'
  | 'bundle-n-for-x';

/** 比价页单边商品输入（数值均为字符串原始输入，由解析层校验转换） */
export interface ProductInput {
  /** 商品名称（可留空，不参与计算） */
  name: string;
  /** 主规格单位编码 */
  unitCode: UnitCode;
  /** 主规格数量原始输入，如 "1.8" */
  quantityValue: string;
  /** 原价原始输入（元），如 "39.9" */
  originalPriceYuan: string;
  /** 是否含赠品 */
  giftEnabled: boolean;
  /** 赠品单位编码 */
  giftUnitCode: UnitCode;
  /** 赠品数量原始输入 */
  giftQuantityValue: string;
  /** 是否启用优惠 */
  promoEnabled: boolean;
  /** 优惠类型 */
  promoType: PromotionType;
  /** 立减/优惠券金额，或满减后实付价，或买N件共X元的 X（元，字符串） */
  promoValueYuan: string;
  /** 第二件折扣率：0.5 表示第二件 5 折 */
  secondItemRate: number;
  /** 买 N 件共 X 元的 N */
  bundleCount: number;
  /** 洗护日化每次用量原始输入（供单次使用成本计算） */
  perUseAmountValue: string;
}

/** 商品单边计算结果（金额一律为整数分；raw* 为未取整中间量） */
export interface CompareSide {
  /** 有效到手总量，归一到 g / ml / 件 */
  effectiveBaseValue: number;
  /** 实付金额（分） */
  finalPriceFen: number;
  /**
   * 每 100g 或 100ml 的分值（已 Math.round 到整数分，用于展示与差额）；
   * count 维度语义为「每件」分值（未乘 100）
   */
  unitPriceFenPer100: number;
  /**
   * 每 100g / 100ml 的未取整分值（用于百分比等精确计算）；
   * count 维度语义为「每件」未取整分值（未乘 100）
   */
  rawUnitFenPer100: number;
  /** 每斤分值（整数分；非重量类为 null） */
  unitPriceFenPerJin: number | null;
  /** 每两分值（整数分；非重量类为 null） */
  unitPriceFenPerLiang: number | null;
  /** 每升分值（整数分；非容量类为 null） */
  unitPriceFenPerL: number | null;
  /** 每次使用成本（分）；仅洗护日化且填写了每次用量时有值 */
  perUseCostFen?: number;
}

/** 比价成功结果 */
export interface CompareSuccess {
  /** 成功判别 */
  ok: true;
  /** A / B 两侧明细 */
  sides: { A: CompareSide; B: CompareSide };
  /** 胜出方（标准单价更低者；tie 为持平） */
  winner: 'A' | 'B' | 'tie';
  /**
   * 差额（分/标准展示单位）= 两侧按标准展示口径各自 Math.round 到分后相减；
   * 口径随维度取：mass → 每斤、volume → 每升、count → 每件。
   * 例：A 每斤 1108.33→1108、B 831.67→832，差额 = 1108 − 832 = 276 分。
   */
  diffFenPerStandard: number;
  /** 差价百分比（用未取整 raw 值计算：|A−B| / 较贵者），如 0.2496 */
  diffPercent: number;
  /** 差距是否很小（diffPercent < 2%） */
  closeGap: boolean;
  /** 计算明细文本数组（有效总量 / 实付构成 / 赠品说明等） */
  details: string[];
  /** 提示文本（固定免责声明 + 场景化提示） */
  notice: string;
}

/** 比价失败结果 */
export interface CompareFailure {
  /** 失败判别 */
  ok: false;
  /** 失败原因：跨维度不可比 / 输入无效 */
  reason: 'cross-dimension' | 'invalid-input';
  /** 规定提示文案 */
  message: string;
}

/** 比价结果判别联合 */
export type CompareResult = CompareSuccess | CompareFailure;

/** 参考价渠道：菜市场 / 社区生鲜 / 商超 / 电商 / 批发 */
export type Channel = 'market' | 'community' | 'supermarket' | 'ecommerce' | 'wholesale';

/** 数据等级 */
export type DataLevel =
  | 'official_retail'
  | 'official_market'
  | 'wholesale'
  | 'seasonal_baseline'
  | 'estimated';

/** 数据置信度 */
export type Confidence = 'high' | 'medium' | 'low';

/** 参考价单条记录（字段与后端 schema 完全一致） */
export interface PriceRecord {
  /** 记录唯一 ID */
  id: string;
  /** 城市编码 */
  cityCode: string;
  /** 城市中文名 */
  cityName: string;
  /** 渠道 */
  channel: Channel;
  /** 品类名称 */
  category: string;
  /** 商品名称 */
  productName: string;
  /** 规格描述，如 "500g/份" */
  specification: string;
  /** 计量单位描述，如 "元/500g" */
  unit: string;
  /** 最低价（元） */
  low: number;
  /** 中位价（元） */
  median: number;
  /** 最高价（元） */
  high: number;
  /** 25 分位价（元） */
  p25: number;
  /** 75 分位价（元） */
  p75: number;
  /** 90 分位价（元） */
  p90: number;
  /** 样本数量 */
  sampleCount: number;
  /** 数据日期 YYYY-MM-DD */
  dataDate: string;
  /** 数据来源名称 */
  sourceName: string;
  /** 数据来源链接 */
  sourceUrl: string;
  /** 数据等级 */
  dataLevel: DataLevel;
  /** 置信度 */
  confidence: Confidence;
  /** 备注 */
  note: string;
  /** 是否由官方单均价展开而来（管线单均价分支置 true；可选，旧数据可能缺失该字段） */
  expandedFromSingleAverage?: boolean;
  /** 近 7 日数值（可选，用于趋势展示） */
  trend7d?: number[];
}

/** 参考价数据文件整体结构 */
export interface PricesFile {
  /** 数据文件版本号 */
  version: string;
  /** 生成时间 ISO 字符串 */
  generatedAt: string;
  /** 过期时间 ISO 字符串 */
  expiresAt: string;
  /** 参考价记录列表 */
  records: PriceRecord[];
  /** 数据是否已过期 */
  stale?: boolean;
}

/** 价格判断等级：低价 / 公道 / 略贵 / 明显贵 / 数据不足 */
export type JudgementLevel = 'low-price' | 'fair' | 'slightly-high' | 'too-high' | 'insufficient-data';

/** 价格判断结果 */
export interface JudgeResult {
  /** 判断等级 */
  level: JudgementLevel;
  /** 判断依据文本 */
  basis: string;
  /** 免责声明文本 */
  disclaimer: string;
  /** 置信度 */
  confidence: Confidence;
}

/** 时令状态：当季最佳 / 供应稳定 / 反季 */
export type SeasonalStatus = 'best' | 'stable' | 'off-season';

/**
 * 季节经验基线条目（与 mock/seasonal-baselines.json 的 items 结构逐字段对齐）。
 * 说明：SeasonalItem 是展示层精简结构（name/status/note），与本接口字段不同。
 */
export interface SeasonalBaselineItem {
  /** 商品名称 */
  productName: string;
  /** 品类（叶菜/根茎/茄果/豆类/水果/猪肉/鸡蛋 等） */
  category: string;
  /** 适用区域组："全国" | "北方" | "南方" | "西南" */
  cityGroup: string;
  /** 当季月份（1-12），命中为 best */
  months: number[];
  /** 供应稳定月份（1-12），命中为 stable；未命中两者则为 off-season */
  stableMonths?: number[];
  /** 按 8 月预推导的状态快照（运行时以月份重新推导为准） */
  status: SeasonalStatus;
  /** 计量单位描述，如 "元/斤" */
  unit: string;
  /** 当季典型低价（元） */
  typicalLow: number;
  /** 当季典型高价（元） */
  typicalHigh: number;
  /** 供应说明 */
  supplyNote: string;
  /** 最近修订日期 */
  lastRevised: string;
}

/** 时令单品 */
export interface SeasonalItem {
  /** 商品名称 */
  name: string;
  /** 所属品类 */
  category: CategoryId;
  /** 时令状态 */
  status: SeasonalStatus;
  /** 时令说明，如 "8 月正当季" */
  note: string;
}

/** 加价参考表：城市 → 渠道 → 品类 → [低价端, 高价端] 倍率区间 */
export interface MarkupTable {
  [city: string]: {
    [channel in Channel]?: {
      [category: string]: [number, number];
    };
  };
}

/** 数据等级：远端兜底 / 本地基线 */
export type DataGrade = 'remote' | 'local_baseline';

/** 城市键：全国兜底 + 示例城市 */
export type CityKey = 'national' | 'beijing' | 'shanghai' | 'guangzhou' | 'chengdu' | 'fuzhou';

/** 城市键 → 中文名映射 */
export const CITY_NAMES: Record<CityKey, string> = {
  national: '全国',
  beijing: '北京',
  shanghai: '上海',
  guangzhou: '广州',
  chengdu: '成都',
  fuzhou: '福州'
};

/** 城市键列表（供选择器遍历，保持展示顺序） */
export const CITY_KEYS: CityKey[] = ['national', 'beijing', 'shanghai', 'guangzhou', 'chengdu', 'fuzhou'];

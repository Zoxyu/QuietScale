/**
 * services/judge.ts —— 价格判断（纯函数，零 wx 依赖，可被 node --test 直接测试）
 *
 * 输入：用户看到的价格（元）、计价单位、匹配到的参考价记录、可选的今日日期键。
 * 输出：判断等级 + 依据文本 + 免责声明 + 置信度。
 *
 * 文案红线：严禁出现「宰客 / 一定买贵了 / 肯定不新鲜 / 不要买」类表述，
 * 一律使用中性、可解释、带免责的措辞。
 */

import type { Confidence, JudgeResult, JudgementLevel, PriceRecord } from '../types/models';

/** 判断输入 */
export interface JudgeInput {
  /** 用户看到的价格（元） */
  priceYuan: number;
  /** 用户的计价单位描述，如 "元/斤"、"元/公斤" */
  unit: string;
  /** 匹配到的参考价记录；null 表示没有可参考的数据 */
  record: PriceRecord | null;
  /** 今日日期键 YYYY-MM-DD（可注入，便于测试；缺省取设备日期） */
  today?: string;
}

/** 渠道 → 中文标签 */
const CHANNEL_LABEL: Record<string, string> = {
  market: '菜市场',
  community: '社区生鲜店',
  supermarket: '商超',
  ecommerce: '电商',
  wholesale: '批发'
};

/** 通用免责声明 */
const BASE_DISCLAIMER =
  '以上仅为价格参考，不构成对商品品质的判断；实际价格会受品质、产地、包装、规格与行情波动影响。';

/** 批发数据追加免责（强制文案） */
const WHOLESALE_DISCLAIMER = '这是批发环节参考，不能直接等同于菜市场或商超零售价。';

/** 高价区间通用免责（too-high / slightly-high 都带） */
const HIGH_PRICE_NOTE = '若为有机、精品包装、进口、特殊产地或非当季商品，价格可能仍然合理。';

/** 判断为数据不足的最低样本量阈值 */
const MIN_SAMPLE_COUNT = 8;

/** 参考数据最大滞后天数 */
const MAX_STALE_DAYS = 14;

/** 高置信度要求的数据新鲜天数 */
const FRESH_DAYS = 7;

/** 高置信度要求的最低样本量 */
const HIGH_CONFIDENCE_MIN_SAMPLES = 20;

/** 数字展示：保留 1 位小数（末尾 .0 不保留，如 61.9、4.2、12） */
function fmt1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Date → 'YYYY-MM-DD'（本地时区） */
function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 两个 YYYY-MM-DD 日期之间的天数差（to - from）。
 * 按本地零点计算，避免时区偏移；非法输入返回 null。
 */
function daysBetween(fromYmd: string, toYmd: string): number | null {
  const parse = (s: string): Date | null => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) {
      return null;
    }
    const parts = s.trim().split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
  };
  const from = parse(fromYmd);
  const to = parse(toYmd);
  if (!from || !to) {
    return null;
  }
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** 提取单位中的计量部分："元/斤" → "斤"；无斜杠原样返回（去空格） */
function unitDimension(unit: string): string {
  if (typeof unit !== 'string') {
    return '';
  }
  const idx = unit.indexOf('/');
  return (idx >= 0 ? unit.slice(idx + 1) : unit).trim();
}

/**
 * 计量维度同义归一：斤↔500g、公斤↔kg（千克）、升↔L、毫升↔ml；
 * 归一后相等的同义单位不提示口径差异，其余原样返回。
 */
function normalizeUnitDim(dim: string): string {
  const t = dim.trim();
  if (t === '斤' || t === '500g' || t === '500G') {
    return '斤';
  }
  if (t === '公斤' || t === '千克' || t.toLowerCase() === 'kg') {
    return '公斤';
  }
  if (t === '升' || t.toLowerCase() === 'l') {
    return '升';
  }
  if (t === '毫升' || t.toLowerCase() === 'ml') {
    return '毫升';
  }
  return t;
}

/** 构造数据不足结果；批发来源追加批发环节免责 */
function insufficient(basis: string, isWholesale: boolean): JudgeResult {
  const disclaimer = isWholesale ? BASE_DISCLAIMER + WHOLESALE_DISCLAIMER : BASE_DISCLAIMER;
  return { level: 'insufficient-data', basis, disclaimer, confidence: 'low' };
}

/**
 * 判断用户看到的价格相对本地参考价的水平。
 *
 * 规则：
 * - record 为 null / sampleCount<8 / dataDate 距今超 14 天 → insufficient-data；
 *   其中官方单均价展开记录（expandedFromSingleAverage===true；
 *   旧数据缺失该字段时回退 sampleCount===1 判别）使用专门的中性文案，
 *   引导对照参考价区间自行比较，不做分位判断；
 * - <= p25 → low-price；<= p75 → fair；<= p90 → slightly-high；> p90 → too-high；
 * - 用户单位与记录单位口径不同 → 依据文本追加口径差异提示（同义单位如 斤↔500g、
 *   公斤↔kg、升↔L、毫升↔ml 归一后比较，不提示差异）；
 * - 批发类数据 → 免责声明追加批发环节说明（含 insufficient-data 分支）；
 * - 百分比保留 1 位小数。
 */
export function judgeObservedPrice(input: JudgeInput): JudgeResult {
  const { record, priceYuan, unit } = input;
  const today =
    input.today && /^\d{4}-\d{2}-\d{2}$/.test(input.today) ? input.today : toDateKey(new Date());

  // 无匹配记录 → 数据不足
  if (!record) {
    return insufficient('没有找到可对应的本地参考价数据，数据不足，暂不判断。', false);
  }

  // 批发来源：数据不足分支也拼接批发环节免责
  const isWholesale = record.dataLevel === 'wholesale' || record.channel === 'wholesale';

  // 输入价格无效 → 数据不足分支（避免给出误导性判断）
  if (!Number.isFinite(priceYuan) || priceYuan <= 0) {
    return insufficient('价格输入无效，请检查后重新判断。', isWholesale);
  }

  // 数据滞后检查：距今超过 14 天 → 数据不足
  const ageDays = daysBetween(record.dataDate, today);
  if (ageDays === null || ageDays > MAX_STALE_DAYS) {
    return insufficient(
      `参考数据日期为 ${record.dataDate}，距今已超过 ${MAX_STALE_DAYS} 天，价格可能已发生变化，数据不足，暂不判断。`,
      isWholesale
    );
  }

  // 样本量检查：<8 → 数据不足；官方单均价展开记录用专门的中性文案，
  // 说明不做分位判断的原因，并引导对照参考区间自行比较（不输出恐慌性表述）。
  // 显式标记优先：expandedFromSingleAverage===true 才走单均价分支；
  // 缺失该字段的旧数据回退原逻辑（sampleCount===1）。
  if (record.sampleCount < MIN_SAMPLE_COUNT) {
    if (record.expandedFromSingleAverage === true || record.sampleCount === 1) {
      return insufficient(
        `该商品仅有官方单日均价参考（${record.dataDate} 发布），暂不做分位判断，可对照参考价区间（${fmt1(record.low)}–${fmt1(record.high)} ${record.unit}）自行比较。`,
        isWholesale
      );
    }
    return insufficient(
      `本地参考样本量较少（${record.sampleCount} 条，低于 ${MIN_SAMPLE_COUNT} 条），代表性有限，数据不足，暂不判断。`,
      isWholesale
    );
  }

  const refMedian = record.median;
  if (!Number.isFinite(refMedian) || refMedian <= 0) {
    return insufficient('参考数据异常，数据不足，暂不判断。', isWholesale);
  }

  // 单位口径一致性检查：同义单位归一后比较，维度不同才追加提示
  const userDim = normalizeUnitDim(unitDimension(unit));
  const refDim = normalizeUnitDim(unitDimension(record.unit));
  const unitMismatch =
    userDim !== '' && refDim !== '' && userDim !== refDim
      ? `注意：你的计价口径是「${unit}」，参考数据口径是「${record.unit}」，两者单位不同，请先换算到相同口径再比较。`
      : '';

  const channelLabel = CHANNEL_LABEL[record.channel] || '本地';
  /** 相对中位价的偏离百分比（保留 1 位小数的字符串） */
  const percentOverMedian = fmt1(((priceYuan - refMedian) / refMedian) * 100);
  const priceText = `${fmt1(priceYuan)} ${unit || '元'}`;

  let level: JudgementLevel;
  let basis: string;

  if (priceYuan <= record.p25) {
    // 低于下四分位 → 价格偏低
    level = 'low-price';
    basis = `你看到的 ${priceText}，低于本地近期参考区间的下四分位（约 ${fmt1(record.p25)} ${record.unit}），性价比可能不错。`;
  } else if (priceYuan <= record.p75) {
    // 落在 p25–p75 之间 → 合理区间
    level = 'fair';
    basis = `你看到的 ${priceText}，与本地${channelLabel}近期参考区间（约 ${fmt1(record.p25)}–${fmt1(record.p75)} ${record.unit}）相符，近 7 日中位价约 ${fmt1(refMedian)} ${record.unit}。`;
  } else if (priceYuan <= record.p90) {
    // 介于 p75–p90 → 略高，可再比较
    level = 'slightly-high';
    basis = `你看到的 ${priceText}，高于本地${channelLabel}近 7 日中位价 ${fmt1(refMedian)} ${record.unit}约 ${percentOverMedian}%，略高，可再比较。${HIGH_PRICE_NOTE}`;
  } else {
    // 高于 p90 → 明显高于近期参考
    level = 'too-high';
    basis = `你看到的 ${priceText}，高于本地${channelLabel}近 7 日中位价 ${fmt1(refMedian)} ${record.unit}约 ${percentOverMedian}%，明显高于近期参考。${HIGH_PRICE_NOTE}`;
  }

  if (unitMismatch) {
    basis += unitMismatch;
  }

  // 置信度：同城同渠道且新鲜足量 → high；同城轻微差异或样本 8–19 → medium；其余 low。
  // 记录由上游按城市/渠道匹配后传入，这里依据数据等级、样本量与新鲜度评定。
  const isOfficial = record.dataLevel === 'official_retail' || record.dataLevel === 'official_market';
  let confidence: Confidence;
  if (isOfficial && record.sampleCount >= HIGH_CONFIDENCE_MIN_SAMPLES && ageDays <= FRESH_DAYS) {
    confidence = 'high';
  } else if (isOfficial && record.sampleCount >= MIN_SAMPLE_COUNT) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // 免责声明：批发类数据强制追加批发环节说明
  let disclaimer = BASE_DISCLAIMER;
  if (isWholesale) {
    disclaimer += WHOLESALE_DISCLAIMER;
  }

  return { level, basis, disclaimer, confidence };
}

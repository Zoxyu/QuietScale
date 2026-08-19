/**
 * scripts/adapters/mock-adapter.ts —— 人工季节基准 Mock 数据源（完整实现）
 *
 * 特点：
 * - mulberry32 固定种子 PRNG（种子 20260818），输出完全可复现；
 * - 9 个品类基准价（元/斤 或 元/升）× 城市系数 × 8 月季节系数 × ±15% 噪声；
 * - 每品类每城市每渠道生成 20~40 条样本；
 * - status 'active'，priority 5，sourceName "人工维护季节基准（Mock）"。
 */

import { registerAdapter } from './adapter.ts';
import type { PriceAdapter, RawSample } from './adapter.ts';

/** 固定随机种子：保证每次生成结果一致，便于复现与 diff */
const MOCK_SEED = 20260818;

/**
 * mulberry32 PRNG：返回 [0, 1) 的伪随机数生成器。
 * 固定种子下序列确定，跨平台一致。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 品类基准价定义 */
interface CategoryBaseline {
  category: string;
  productName: string;
  specification: string;
  /** 计价单位描述 */
  unit: string;
  /** 全国基准价（元/单位） */
  basePriceYuan: number;
  /** 8 月季节系数（叶菜夏季供应偏紧略高，茄果当季偏低） */
  seasonalAugust: number;
  /** 主零售渠道（菜市场/社区生鲜/商超） */
  channel: string;
  /** 渠道系数（商超含租金人力成本偏高） */
  channelCoef: number;
}

/** 9 个品类基准价表（与 mock/prices.json 全国基线同量级） */
const BASELINES: CategoryBaseline[] = [
  { category: '叶菜', productName: '油麦菜', specification: '散装称重', unit: '元/斤', basePriceYuan: 3.8, seasonalAugust: 1.10, channel: 'market', channelCoef: 1.0 },
  { category: '根茎', productName: '土豆', specification: '散装称重', unit: '元/斤', basePriceYuan: 2.8, seasonalAugust: 1.00, channel: 'market', channelCoef: 1.0 },
  { category: '茄果', productName: '番茄', specification: '散装称重', unit: '元/斤', basePriceYuan: 3.8, seasonalAugust: 0.90, channel: 'community', channelCoef: 1.05 },
  { category: '豆类', productName: '豇豆', specification: '散装称重', unit: '元/斤', basePriceYuan: 5.0, seasonalAugust: 0.95, channel: 'market', channelCoef: 1.0 },
  { category: '猪肉', productName: '猪五花肉', specification: '散装称重', unit: '元/斤', basePriceYuan: 16.5, seasonalAugust: 1.00, channel: 'supermarket', channelCoef: 1.12 },
  { category: '鸡蛋', productName: '鲜鸡蛋', specification: '散装称重', unit: '元/斤', basePriceYuan: 5.0, seasonalAugust: 1.02, channel: 'supermarket', channelCoef: 1.12 },
  { category: '水果', productName: '西瓜', specification: '散装称重', unit: '元/斤', basePriceYuan: 2.0, seasonalAugust: 0.95, channel: 'market', channelCoef: 1.0 },
  { category: '大米', productName: '粳米（散装）', specification: '散装称重', unit: '元/斤', basePriceYuan: 3.0, seasonalAugust: 1.00, channel: 'supermarket', channelCoef: 1.12 },
  { category: '食用油', productName: '大豆油', specification: '5L/桶', unit: '元/升', basePriceYuan: 9.5, seasonalAugust: 1.00, channel: 'supermarket', channelCoef: 1.12 }
];

/** 城市定义：编码 / 中文名 / 价格系数 */
interface CityDef {
  cityCode: string;
  cityName: string;
  coef: number;
}

const CITIES: CityDef[] = [
  { cityCode: 'national', cityName: '全国参考', coef: 1.0 },
  { cityCode: '110000', cityName: '北京', coef: 1.05 },
  { cityCode: '310000', cityName: '上海', coef: 1.1 },
  { cityCode: '440100', cityName: '广州', coef: 1.05 },
  { cityCode: '510100', cityName: '成都', coef: 0.95 }
];

/** 每品类每城市样本数范围 */
const MIN_SAMPLES = 20;
const MAX_SAMPLES = 40;

/** 噪声幅度：基准 × (1 ± 15%) */
const NOISE_RATIO = 0.15;

/** 价格保留 2 位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Mock 季节基准 Adapter（priority 5，active） */
export const mockSeasonalAdapter: PriceAdapter = {
  id: 'seasonal-mock',
  name: '人工维护季节基准（Mock）',
  priority: 5,
  status: 'active',

  async fetchSamples(dateKey: string): Promise<RawSample[]> {
    const rand = mulberry32(MOCK_SEED);
    const samples: RawSample[] = [];

    for (const city of CITIES) {
      for (const baseline of BASELINES) {
        const count = MIN_SAMPLES + Math.floor(rand() * (MAX_SAMPLES - MIN_SAMPLES + 1));
        for (let i = 0; i < count; i += 1) {
          const noise = 1 + (rand() * 2 - 1) * NOISE_RATIO;
          const price =
            baseline.basePriceYuan *
            city.coef *
            baseline.seasonalAugust *
            baseline.channelCoef *
            noise;
          samples.push({
            cityCode: city.cityCode,
            cityName: city.cityName,
            channel: baseline.channel,
            category: baseline.category,
            productName: baseline.productName,
            specification: baseline.specification,
            unit: baseline.unit,
            priceYuan: round2(price),
            dataDate: dateKey,
            sourceName: '人工维护季节基准（Mock）'
          });
        }
      }
    }
    return samples;
  }
};

registerAdapter(mockSeasonalAdapter);

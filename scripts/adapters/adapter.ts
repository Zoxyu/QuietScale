/**
 * scripts/adapters/adapter.ts —— 价格数据源 Adapter 接口与注册表
 *
 * 设计约束：
 * - 与小程序运行时类型解耦：本文件内重新声明脚本所需的精简类型，
 *   字段含义与 types/models.ts 的 PriceRecord 保持一致；
 * - 本目录属于 Node 工具代码（Node 24 type stripping 直跑），
 *   禁止 enum / namespace / 参数属性，相对 import 必须带 .ts 扩展名。
 *
 * 来源优先级约定（priority 1-5，1 最高）：
 *   1 当地发改委/商务局/农业农村局零售参考
 *   2 商务部公开监测
 *   3 农业农村部/批发市场
 *   4 授权商超/电商平台
 *   5 人工季节基准
 */

/** 单条原始价格样本（Adapter 拉取结果的最小单元） */
export interface RawSample {
  /** 城市编码：national / 110000 / 310000 / 440100 / 510100 等 */
  cityCode: string;
  /** 城市中文名 */
  cityName: string;
  /** 渠道：market / community / supermarket / ecommerce / wholesale */
  channel: string;
  /** 品类：叶菜 / 根茎 / 茄果 / 豆类 / 猪肉 / 鸡蛋 / 水果 / 大米 / 食用油 */
  category: string;
  /** 商品名称 */
  productName: string;
  /** 规格描述，如 "散装称重"、"5L/桶" */
  specification: string;
  /** 计价单位描述，如 "元/斤"、"元/升" */
  unit: string;
  /** 样本价格（元） */
  priceYuan: number;
  /** 数据日期 YYYY-MM-DD */
  dataDate: string;
  /** 数据来源名称（展示用） */
  sourceName: string;
  /** 数据来源链接（可选） */
  sourceUrl?: string;
}

/** Adapter 授权状态：active 参与生成；pending-auth 为待授权占位 */
export type AdapterStatus = 'active' | 'pending-auth';

/** 价格数据源适配器接口 */
export interface PriceAdapter {
  /** 数据源唯一标识 */
  id: string;
  /** 中文来源名 */
  name: string;
  /** 优先级 1-5，1 最高 */
  priority: number;
  /** 授权状态：待授权占位用 pending-auth */
  status: AdapterStatus;
  /** 拉取指定日期键的样本；失败时抛错，由管线做超时/重试处理 */
  fetchSamples(dateKey: string): Promise<RawSample[]>;
}

/** Adapter 注册表（模块级单例） */
const registry: PriceAdapter[] = [];

/** 注册一个 Adapter（重复 id 视为覆盖更新） */
export function registerAdapter(adapter: PriceAdapter): void {
  if (!adapter || typeof adapter.id !== 'string' || adapter.id === '') {
    throw new Error('registerAdapter: adapter.id 不能为空');
  }
  const idx = registry.findIndex((a) => a.id === adapter.id);
  if (idx >= 0) {
    registry[idx] = adapter;
    return;
  }
  registry.push(adapter);
}

/** 获取全部已注册 Adapter 的快照副本 */
export function getAdapters(): PriceAdapter[] {
  return registry.slice();
}

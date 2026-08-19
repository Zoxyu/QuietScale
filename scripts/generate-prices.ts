/**
 * scripts/generate-prices.ts —— 参考价数据生成主管线（Node 24 直跑，零第三方依赖）
 *
 * 运行方式：在项目根目录执行 `node scripts/generate-prices.ts`
 *
 * 流程：
 * 1. 收集全部 active Adapter，Promise.allSettled 并行拉取（单源超时 8s + 1 次重试）；
 * 2. 单位归一（kg/g/斤/两/L/ml → 基准单位 g/ml 换算，校验维度一致性）；
 * 3. 异常清理：按品类分组，剔除负值与超出 Q1-1.5×IQR / Q3+1.5×IQR 的价格；
 * 4. 按 城市+渠道+品类 聚合：low/median/high/p25/p75/p90（线性插值）+ sampleCount；
 * 5. 无本地零售样本但有批发样本时：用 markups.json 系数折算估算零售区间（estimated/low）；
 * 6. 组装 PricesFile（version=当日 YYYY.MM.DD，generatedAt/expiresAt ISO+08:00）；
 * 7. 输出 dist/prices.json、dist/sources.json、dist/data-quality-report.json；
 * 8. 容错：records 为空 → 不覆盖已有数据，置 stale 标记后写回；无历史文件则退出码 1；
 * 9. 全部写入为先写 .tmp 再 rename 的原子方式，脚本不做任何删除操作。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdapters } from './adapters/adapter.ts';
import type { PriceAdapter, RawSample } from './adapters/adapter.ts';
import './adapters/mock-adapter.ts';
import './adapters/official-placeholder.ts';
import { percentile } from '../utils/quantile.ts';
import { estimateRetailRange } from '../services/wholesale.ts';
import type { Channel, Confidence, DataLevel, MarkupTable, PriceRecord, PricesFile } from '../types/models.ts';

/* ------------------------------ 常量与基础工具 ------------------------------ */

/** 单源拉取超时（毫秒） */
const FETCH_TIMEOUT_MS = 8000;

/** 北京时间偏移（毫秒） */
const BJ_OFFSET_MS = 8 * 3600 * 1000;

/** 全部Adapter失败的退出提示前缀 */
const LOG_PREFIX = '[generate-prices]';

/** 9 个规范品类（用于缺失品类统计） */
const CANONICAL_CATEGORIES = ['叶菜', '根茎', '茄果', '豆类', '猪肉', '鸡蛋', '水果', '大米', '食用油'];

/** 项目根目录（scripts/ 的上一级） */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 输出目录 */
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

/** 加价系数表路径 */
const MARKUPS_PATH = path.join(PROJECT_ROOT, 'mock', 'markups.json');

/** 进度日志（中文） */
function log(message: string): void {
  console.log(`${LOG_PREFIX} ${message}`);
}

/** 金额保留 2 位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 北京时区时间分量 */
interface BeijingParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/** 将时间戳换算为北京时间（+08:00）各分量 */
function beijingParts(ts: number): BeijingParts {
  const dt = new Date(ts + BJ_OFFSET_MS);
  return {
    year: String(dt.getUTCFullYear()),
    month: String(dt.getUTCMonth() + 1).padStart(2, '0'),
    day: String(dt.getUTCDate()).padStart(2, '0'),
    hour: String(dt.getUTCHours()).padStart(2, '0'),
    minute: String(dt.getUTCMinutes()).padStart(2, '0'),
    second: String(dt.getUTCSeconds()).padStart(2, '0')
  };
}

/** 北京时间 ISO 字符串（+08:00） */
function beijingIso(ts: number): string {
  const p = beijingParts(ts);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+08:00`;
}

/** 北京时间日期键 YYYY-MM-DD */
function beijingDateKey(ts: number): string {
  const p = beijingParts(ts);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 原子写文件：先写 xxx.tmp 再 rename 覆盖，避免半截文件 */
function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/* ------------------------------ 单位归一 ------------------------------ */

/** 单位换算信息：factor 为「1 个该单位 = 多少基准单位（g/ml）」 */
interface UnitInfo {
  factor: number;
  dimension: 'mass' | 'volume';
}

/** 支持的计量单位 → 归一系数表（kg/g/斤/两/L/ml 及常见中文别名） */
const UNIT_FACTORS: Record<string, UnitInfo> = {
  kg: { factor: 1000, dimension: 'mass' },
  '公斤': { factor: 1000, dimension: 'mass' },
  '千克': { factor: 1000, dimension: 'mass' },
  g: { factor: 1, dimension: 'mass' },
  '克': { factor: 1, dimension: 'mass' },
  '斤': { factor: 500, dimension: 'mass' },
  '两': { factor: 50, dimension: 'mass' },
  L: { factor: 1000, dimension: 'volume' },
  '升': { factor: 1000, dimension: 'volume' },
  ml: { factor: 1, dimension: 'volume' },
  '毫升': { factor: 1, dimension: 'volume' }
};

/**
 * 解析计价单位描述（如 "元/斤"、"元/升"），返回归一换算信息；无法识别返回 null。
 * 记录 unit 保留原样展示，内部换算仅用于一致性校验与聚合。
 */
function parseUnit(unit: string): UnitInfo | null {
  if (typeof unit !== 'string' || unit.trim() === '') {
    return null;
  }
  const idx = unit.indexOf('/');
  const token = (idx >= 0 ? unit.slice(idx + 1) : unit).trim();
  return UNIT_FACTORS[token] ?? null;
}

/* ------------------------------ 拉取与重试 ------------------------------ */

/** 带超时的 Promise 包装 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 超时（超过 ${ms}ms）`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** 单源拉取：失败重试 1 次，两次都失败则抛错 */
async function fetchWithRetry(adapter: PriceAdapter, dateKey: string): Promise<RawSample[]> {
  try {
    return await withTimeout(adapter.fetchSamples(dateKey), FETCH_TIMEOUT_MS, adapter.name);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`⚠ 来源「${adapter.name}」首次拉取失败（${reason}），重试一次…`);
    return await withTimeout(adapter.fetchSamples(dateKey), FETCH_TIMEOUT_MS, adapter.name);
  }
}

/* ------------------------------ 数据结构 ------------------------------ */

/** 归一化后的样本（附带来源元信息） */
interface NormalizedSample {
  sample: RawSample;
  adapterId: string;
  adapterName: string;
  priority: number;
  /** 计量维度 */
  dimension: 'mass' | 'volume';
  /** 单位归一因子（1 单位 = factor 基准单位） */
  factor: number;
  /** 折算到基准单位的价格（元/g 或 元/ml） */
  perBase: number;
}

/** 聚合分组（城市+渠道+品类） */
interface AggGroup {
  cityCode: string;
  cityName: string;
  channel: string;
  category: string;
  samples: NormalizedSample[];
}

/** 来源优先级 → 数据等级 / 置信度 / 备注 */
function levelInfo(priority: number): { dataLevel: DataLevel; confidence: Confidence; note: string } {
  if (priority === 1) {
    return { dataLevel: 'official_retail', confidence: 'high', note: '当地发改委/商务局/农业农村局零售参考' };
  }
  if (priority === 2) {
    return { dataLevel: 'official_market', confidence: 'medium', note: '商务部公开市场监测' };
  }
  if (priority === 3) {
    return { dataLevel: 'wholesale', confidence: 'medium', note: '农业农村部/批发市场行情监测' };
  }
  if (priority === 4) {
    return { dataLevel: 'official_retail', confidence: 'medium', note: '授权商超/电商平台公开价格' };
  }
  return { dataLevel: 'seasonal_baseline', confidence: 'low', note: '人工维护季节基准，仅供大致参考' };
}

/** 统计数组中出现次数最多的字符串 */
function mostFrequent(values: string[]): string {
  const counts = new Map<string, number>();
  let best = '';
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/* ------------------------------ 主管线 ------------------------------ */

async function main(): Promise<void> {
  const startTs = Date.now();
  const dateKey = beijingDateKey(startTs);
  const generatedAt = beijingIso(startTs);
  const expiresAt = beijingIso(startTs + 24 * 3600 * 1000);
  const version = `${dateKey.replace(/-/g, '.')}`;

  log(`开始生成参考价数据：数据日期 ${dateKey}，版本 ${version}`);

  /* ---- 0. 读取加价系数表（批发折算用） ---- */
  let markups: MarkupTable = {};
  try {
    markups = JSON.parse(fs.readFileSync(MARKUPS_PATH, 'utf8')) as MarkupTable;
    log('已读取加价系数表 mock/markups.json');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`⚠ 加价系数表读取失败（${reason}），批发折算将使用内置兜底系数`);
  }

  /* ---- 1. 并行拉取全部 active Adapter ---- */
  const adapters = getAdapters();
  const activeAdapters = adapters.filter((a) => a.status === 'active');
  const pendingAdapters = adapters.filter((a) => a.status === 'pending-auth');
  log(`已注册数据源 ${adapters.length} 个：active ${activeAdapters.length} 个，待授权占位 ${pendingAdapters.length} 个`);

  const settled = await Promise.allSettled(activeAdapters.map((a) => fetchWithRetry(a, dateKey)));

  const rawSamples: NormalizedSample[] = [];
  const samplesPerSource: Record<string, number> = {};
  const failedAdapters: string[] = [];
  settled.forEach((result, idx) => {
    const adapter = activeAdapters[idx];
    if (result.status === 'fulfilled') {
      samplesPerSource[adapter.name] = result.value.length;
      log(`✓ 来源「${adapter.name}」拉取成功：${result.value.length} 条样本`);
      for (const sample of result.value) {
        rawSamples.push({
          sample,
          adapterId: adapter.id,
          adapterName: adapter.name,
          priority: adapter.priority,
          dimension: 'mass',
          factor: 1,
          perBase: 0
        });
      }
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failedAdapters.push(adapter.name);
      log(`✗ 来源「${adapter.name}」两次拉取均失败：${reason}`);
    }
  });
  log(`原始样本合计 ${rawSamples.length} 条`);

  /* ---- 2. 单位归一与一致性校验 ---- */
  const normalized: NormalizedSample[] = [];
  let removedInvalid = 0;
  for (const item of rawSamples) {
    const info = parseUnit(item.sample.unit);
    if (info === null || !Number.isFinite(item.sample.priceYuan)) {
      removedInvalid += 1;
      continue;
    }
    item.dimension = info.dimension;
    item.factor = info.factor;
    item.perBase = item.sample.priceYuan / info.factor;
    normalized.push(item);
  }
  log(`单位归一完成：有效 ${normalized.length} 条，剔除单位/数值非法 ${removedInvalid} 条`);

  /* ---- 3. 异常清理：按品类分组，剔除负值与 IQR 栅栏外样本 ---- */
  const byCategory = new Map<string, NormalizedSample[]>();
  for (const item of normalized) {
    const list = byCategory.get(item.sample.category) ?? [];
    list.push(item);
    byCategory.set(item.sample.category, list);
  }

  const cleaned: NormalizedSample[] = [];
  let removedOutliers = 0;
  const removedOutliersByCategory: Record<string, number> = {};
  for (const [category, items] of byCategory) {
    const sortedPrices = items.map((s) => s.perBase).sort((a, b) => a - b);
    const q1 = percentile(sortedPrices, 0.25);
    const q3 = percentile(sortedPrices, 0.75);
    let lowerFence = -Infinity;
    let upperFence = Infinity;
    if (q1 !== null && q3 !== null) {
      const iqr = q3 - q1;
      lowerFence = q1 - 1.5 * iqr;
      upperFence = q3 + 1.5 * iqr;
    }
    let removed = 0;
    for (const item of items) {
      const price = item.sample.priceYuan;
      if (price < 0 || item.perBase < lowerFence || item.perBase > upperFence) {
        removed += 1;
        continue;
      }
      cleaned.push(item);
    }
    if (removed > 0) {
      removedOutliersByCategory[category] = removed;
    }
    removedOutliers += removed;
  }
  log(`异常清理完成：保留 ${cleaned.length} 条，剔除异常 ${removedOutliers} 条（负值或超出 Q1-1.5×IQR / Q3+1.5×IQR）`);

  /* ---- 4. 按 城市+渠道+品类 聚合 ---- */
  const groupMap = new Map<string, AggGroup>();
  for (const item of cleaned) {
    const s = item.sample;
    const key = `${s.cityCode}|${s.channel}|${s.category}`;
    const group = groupMap.get(key);
    if (group) {
      group.samples.push(item);
    } else {
      groupMap.set(key, {
        cityCode: s.cityCode,
        cityName: s.cityName,
        channel: s.channel,
        category: s.category,
        samples: [item]
      });
    }
  }

  const records: PriceRecord[] = [];
  let seq = 0;
  const nextId = (): string => {
    seq += 1;
    return `r-${String(seq).padStart(3, '0')}`;
  };

  for (const group of groupMap.values()) {
    const sorted = group.samples.slice().sort((a, b) => a.perBase - b.perBase);
    const perBases = sorted.map((s) => s.perBase);
    const q = (p: number): number => {
      const v = percentile(perBases, p);
      return v === null ? 0 : v;
    };
    // 组内优先级最高（数值最小）的来源决定数据等级
    const bestPriority = Math.min(...group.samples.map((s) => s.priority));
    const best = group.samples.find((s) => s.priority === bestPriority) as NormalizedSample;
    // unit 与 factor 同源：分位数按 best 样本的 factor 还原，unit 也取 best 样本，避免混单位错位
    const factor = best.factor;
    const unit = best.sample.unit;
    const level = levelInfo(bestPriority);

    records.push({
      id: nextId(),
      cityCode: group.cityCode,
      cityName: group.cityName,
      channel: group.channel as Channel,
      category: group.category,
      productName: mostFrequent(group.samples.map((s) => s.sample.productName)),
      specification: mostFrequent(group.samples.map((s) => s.sample.specification)),
      unit,
      low: round2(q(0) * factor),
      median: round2(q(0.5) * factor),
      high: round2(q(1) * factor),
      p25: round2(q(0.25) * factor),
      p75: round2(q(0.75) * factor),
      p90: round2(q(0.9) * factor),
      sampleCount: group.samples.length,
      dataDate: dateKey,
      sourceName: best.sample.sourceName || best.adapterName,
      sourceUrl: best.sample.sourceUrl ?? '',
      dataLevel: level.dataLevel,
      confidence: level.confidence,
      note: level.note
    });
  }
  log(`聚合完成：${groupMap.size} 个 城市+渠道+品类 分组 → ${records.length} 条零售样本记录`);

  /* ---- 5. 批发样本折算零售估算（无本地零售样本时） ---- */
  const hasRetail = new Set<string>();
  for (const group of groupMap.values()) {
    if (group.channel !== 'wholesale') {
      hasRetail.add(`${group.cityCode}|${group.category}`);
    }
  }
  let estimatedCount = 0;
  for (const group of groupMap.values()) {
    if (group.channel !== 'wholesale') {
      continue;
    }
    if (hasRetail.has(`${group.cityCode}|${group.category}`)) {
      continue;
    }
    const perBases = group.samples.map((s) => s.perBase).sort((a, b) => a - b);
    const medianPerBase = percentile(perBases, 0.5);
    if (medianPerBase === null) {
      continue;
    }
    const factor = group.samples[0].factor;
    const unit = group.samples[0].sample.unit;
    const medianYuan = round2(medianPerBase * factor);
    for (const retailChannel of ['market', 'supermarket']) {
      const est = estimateRetailRange(medianYuan, group.cityName, retailChannel, group.category, markups);
      records.push({
        id: nextId(),
        cityCode: group.cityCode,
        cityName: group.cityName,
        channel: retailChannel as Channel,
        category: group.category,
        productName: mostFrequent(group.samples.map((s) => s.sample.productName)),
        specification: mostFrequent(group.samples.map((s) => s.sample.specification)),
        unit,
        low: est.lowYuan,
        median: round2((est.lowYuan + est.highYuan) / 2),
        high: est.highYuan,
        p25: est.lowYuan,
        p75: est.highYuan,
        p90: est.highYuan,
        sampleCount: group.samples.length,
        dataDate: dateKey,
        sourceName: group.samples[0].sample.sourceName,
        sourceUrl: group.samples[0].sample.sourceUrl ?? '',
        dataLevel: 'estimated',
        confidence: 'low',
        note: est.note
      });
      estimatedCount += 1;
    }
  }
  if (estimatedCount > 0) {
    log(`批发折算：新增 ${estimatedCount} 条估算零售记录（dataLevel=estimated，confidence=low）`);
  }

  /* ---- 8. 容错：全部失败或 records 为空 ---- */
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const pricesPath = path.join(DIST_DIR, 'prices.json');

  if (records.length === 0) {
    log('✗ 本次未生成任何有效记录（全部数据源失败或样本为空）');
    if (fs.existsSync(pricesPath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(pricesPath, 'utf8')) as Record<string, unknown>;
        prev.stale = true;
        prev.note = '本次更新失败，展示最近有效参考';
        prev.generatedAt = generatedAt;
        writeFileAtomic(pricesPath, JSON.stringify(prev, null, 2));
        log('已将 dist/prices.json 标记为 stale（本次更新失败，展示最近有效参考）');
        return;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`${LOG_PREFIX} 读取历史 dist/prices.json 失败：${reason}`);
        process.exit(1);
      }
    }
    console.error(`${LOG_PREFIX} dist/prices.json 不存在且本次无有效数据，无法交付任何参考价，退出。`);
    process.exit(1);
  }

  /* ---- 6. 组装 PricesFile ---- */
  const pricesFile: PricesFile = {
    version,
    generatedAt,
    expiresAt,
    records
  };

  /* ---- 7. 输出 dist/ 三个文件 ---- */
  writeFileAtomic(pricesPath, JSON.stringify(pricesFile, null, 2));
  log(`✓ 已写入 dist/prices.json（${records.length} 条记录）`);

  const sourcesDoc = {
    generatedAt,
    sources: records.map((r) => ({
      recordId: r.id,
      cityCode: r.cityCode,
      channel: r.channel,
      category: r.category,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      collectedAt: generatedAt
    }))
  };
  writeFileAtomic(path.join(DIST_DIR, 'sources.json'), JSON.stringify(sourcesDoc, null, 2));
  log('✓ 已写入 dist/sources.json（每条记录的来源与采集时间）');

  // 缺失品类统计：每个城市 × 9 个规范品类是否被覆盖
  const covered = new Set(records.map((r) => `${r.cityCode}|${r.category}`));
  const cityCodes = Array.from(new Set([...groupMap.values()].map((g) => g.cityCode)));
  const missingCategories: string[] = [];
  for (const cityCode of cityCodes) {
    const cityName = [...groupMap.values()].find((g) => g.cityCode === cityCode)?.cityName ?? cityCode;
    for (const category of CANONICAL_CATEGORIES) {
      if (!covered.has(`${cityCode}|${category}`)) {
        missingCategories.push(`${cityName}/${category}`);
      }
    }
  }

  const qualityReport = {
    generatedAt,
    durationMs: Date.now() - startTs,
    totalSamplesRaw: rawSamples.length,
    totalSamplesClean: cleaned.length,
    samplesPerSource,
    removedInvalid,
    removedOutliers,
    removedOutliersByCategory,
    failedAdapters,
    recordCount: records.length,
    estimatedRecordCount: estimatedCount,
    missingCategories
  };
  writeFileAtomic(path.join(DIST_DIR, 'data-quality-report.json'), JSON.stringify(qualityReport, null, 2));
  log('✓ 已写入 dist/data-quality-report.json（数据质量报告）');

  log(`完成：耗时 ${qualityReport.durationMs}ms，记录 ${records.length} 条，缺失品类组合 ${missingCategories.length} 个`);
}

main().catch((err: unknown) => {
  const reason = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`${LOG_PREFIX} 管线执行失败：${reason}`);
  process.exit(1);
});

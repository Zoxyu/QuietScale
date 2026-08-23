/**
 * services/price-data-service.ts —— 参考价数据门面（五条取数规则的唯一收口）
 *
 * 职责：
 * 1. 模块级内存缓存 { file, grade, carryNote?, fetchedDayKey, failedAt? }，当日有效；
 * 2. USE_MOCK === true 时直接返回 mock/prices.json（grade = local_baseline）；
 * 3. USE_MOCK === false 时遵守「成功时每天最多拉取一次远端；失败后 60 分钟可自动重试」：
 *    - 内存缓存命中当日 → 直接返回（例外：沿用型缓存 remote_stale 的 failedAt
 *      超过 60 分钟时不短路，放行重新拉取）；
 *    - storage 标记 qs_fetch_meta 的 dateKey 为今日（重启场景，内存已丢失）：
 *      · 标记来自成功（无 failedAt）→ 不再发网络请求，优先沿用缓存 qs_prices_cache
 *        （即当日成功拉取的文件，grade = remote），缓存缺失才降级 mock；
 *      · 标记来自失败（有 failedAt）→ 距 failedAt 不足 FAIL_RETRY_INTERVAL_MS（60 分钟）
 *        时不再重试，优先沿用缓存，无可用缓存才降级本地基线；超过则放行再次拉取；
 *    - 否则 wx.request 拉取 REMOTE_PRICES_URL，成功且 expiresAt 未过期且未标记 stale
 *      → 写入内存缓存、成功标记（无 failedAt，grade = remote，透出文件的 carryNote），
 *      并把整个文件持久化到 storage 键 qs_prices_cache（公共参考价数据，供断更沿用）；
 *      stale 文件视同过期数据，走沿用/降级分支；
 *    - 拉取失败 / 超时 / 数据过期 → 先读沿用缓存 qs_prices_cache：存在且 generatedAt
 *      距今 ≤ 7 天 → 沿用该数据（grade = remote_stale，透出文件的 carryNote）；
 *      无可用缓存或超过 7 天 → 降级本地基线；
 *    - 任何失败 / 超时 / 数据过期均写入带 failedAt 的失败短时效标记（60 分钟内不重试，
 *      超过 60 分钟自动放行重试）。沿用层只把「过期降级」变成「过期沿用」，不改变节流逻辑。
 * 4. 并发去重：模块级 in-flight Promise 复用，并发调用共享同一次远端请求，
 *    完成或失败后清空，保证重试节流不被并发绕过。
 * 5. 返回值附 grade 与可选 carryNote，供页面展示数据等级徽标与沿用说明。
 *
 * 隐私红线：wx.setStorageSync 仅写入两类公共数据：
 * - 拉取标记 { dateKey, version, expiresAt, failedAt? }（<200B）；
 * - 公共参考价文件缓存（qs_prices_cache，仅公共参考价数据，用于断更沿用与离线降级）。
 * 绝不存储任何用户输入或选择状态。
 *
 * 本文件是全应用中唯一允许使用 wx API 的服务。
 */

import { APP_CONFIG } from '../config/app.config';
import { PRICES_FILE } from '../mock/prices';
import type { DataGrade, PricesFile } from '../types/models';
import { todayDateKey } from '../utils/format';

/** 本地 mock 参考价数据（原生小程序无法在运行时读取代码包内 JSON，故以 TS 模块形式提供） */
const MOCK_PRICES = PRICES_FILE;

/** storage 键：公共拉取标记（仅数据版本信息，不含任何用户数据） */
const FETCH_META_KEY = 'qs_fetch_meta';

/** storage 键：公共参考价文件缓存（最近一次成功拉取的完整文件，仅供断更沿用与离线降级） */
const PRICES_CACHE_KEY = 'qs_prices_cache';

/** 沿用层最大沿用窗口：缓存文件的 generatedAt 距今超过该天数则不再沿用 */
const CARRY_MAX_AGE_DAYS = 7;

/** 取数结果：文件 + 数据等级 + 可选沿用说明（仅沿用分支透出文件的 carryNote） */
interface DatasetResult {
  file: PricesFile;
  grade: DataGrade;
  carryNote?: string;
}

/**
 * 公共拉取标记结构（体积 <200B）。
 * - 无 failedAt：来自成功拉取，全天阻断当日重复拉取；
 * - 有 failedAt（毫秒时间戳）：来自失败/超时/数据过期，仅短时效节流，
 *   距 failedAt 超过 FAIL_RETRY_INTERVAL_MS 后放行重试。
 */
interface FetchMeta {
  /** 拉取当日日期键 YYYY-MM-DD */
  dateKey: string;
  /** 数据文件版本号 */
  version: string;
  /** 数据过期时间 ISO 字符串 */
  expiresAt: string;
  /** 失败时间戳（毫秒）；仅失败/超时/数据过期时写入，存在即代表失败标记 */
  failedAt?: number;
}

/**
 * 模块级内存缓存：当日有效，进程重启即失效。
 * failedAt 仅沿用型缓存（grade = remote_stale）写入，记录沿用命中时刻，
 * 供规则 3a 判断会话内 60 分钟冷却是否已过、是否放行重新拉取远端。
 */
let memCache: { file: PricesFile; grade: DataGrade; carryNote?: string; fetchedDayKey: string; failedAt?: number } | null = null;

/** 模块级 in-flight Promise：并发调用复用同一次拉取，完成/失败后清空 */
let inflight: Promise<DatasetResult> | null = null;

/** 读取 storage 中的公共拉取标记；任何异常都视为无标记 */
function readFetchMeta(): FetchMeta | null {
  try {
    const raw = wx.getStorageSync(FETCH_META_KEY);
    if (raw && typeof raw === 'object' && typeof raw.dateKey === 'string') {
      return raw as FetchMeta;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/** 写入公共拉取标记（仅 { dateKey, version, expiresAt, failedAt? }，失败静默） */
function writeFetchMeta(meta: FetchMeta): void {
  try {
    wx.setStorageSync(FETCH_META_KEY, meta);
  } catch (e) {
    // storage 写入失败不影响主流程，下次启动会重新走拉取判断
  }
}

/** 降级：返回本地 mock 数据 */
function fallbackMock(): DatasetResult {
  return { file: MOCK_PRICES, grade: 'local_baseline' };
}

/** 持久化最近一次成功拉取的完整文件到 storage（写失败仅打日志，不影响主流程） */
function writePricesCache(file: PricesFile): void {
  try {
    wx.setStorageSync(PRICES_CACHE_KEY, file);
  } catch (e) {
    console.warn('[参考价] 写入断更沿用缓存 qs_prices_cache 失败，不影响主流程', e);
  }
}

/** 读取沿用缓存；不存在或结构不合法返回 null */
function readPricesCache(): PricesFile | null {
  try {
    const raw = wx.getStorageSync(PRICES_CACHE_KEY);
    if (raw && typeof raw === 'object' && Array.isArray(raw.records) && typeof raw.generatedAt === 'string') {
      return raw as PricesFile;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 沿用层：远端不可用（失败/超时/数据过期）时，若存在最近一次成功拉取的文件且
 * generatedAt 距今 ≤ 7 天 → 沿用该数据（grade = remote_stale，覆盖周末与节假日断更）。
 * 命中时同步写入内存缓存（带 failedAt = 当前时间），当日后续调用直接复用；
 * 同一进程内 failedAt 超过 60 分钟后规则 3a 不再短路，放行重新尝试远端。
 */
function tryCarryStale(dayKey: string): DatasetResult | null {
  const cached = readPricesCache();
  if (!cached) {
    return null;
  }
  const genMs = Date.parse(cached.generatedAt);
  if (!Number.isFinite(genMs)) {
    return null;
  }
  const ageDays = (Date.now() - genMs) / (24 * 3600 * 1000);
  if (ageDays > CARRY_MAX_AGE_DAYS) {
    console.log(`[参考价] 沿用缓存已超 ${CARRY_MAX_AGE_DAYS} 天（generatedAt=${cached.generatedAt}），不再沿用`);
    return null;
  }
  console.log(`[参考价] 远端不可用，沿用 ${cached.generatedAt} 的参考数据`);
  const result: DatasetResult = { file: cached, grade: 'remote_stale', carryNote: cached.carryNote };
  memCache = { file: cached, grade: 'remote_stale', carryNote: cached.carryNote, fetchedDayKey: dayKey, failedAt: Date.now() };
  return result;
}

/** 远端拉取参考价文件；非 200 或结构不合法一律 reject */
function fetchRemote(): Promise<PricesFile> {
  return new Promise<PricesFile>((resolve, reject) => {
    wx.request({
      url: APP_CONFIG.REMOTE_PRICES_URL,
      method: 'GET',
      timeout: APP_CONFIG.FETCH_TIMEOUT_MS,
      success: (res: any) => {
        const data = res && res.data;
        if (res.statusCode === 200 && data && Array.isArray(data.records)) {
          resolve(data as PricesFile);
        } else {
          reject(new Error('远端参考价数据响应不合法'));
        }
      },
      fail: (err: any) => {
        reject(err || new Error('远端参考价数据拉取失败'));
      }
    });
  });
}

/**
 * 获取参考价数据集（唯一对外取数入口）。
 * @returns { file: 参考价数据文件, grade: 数据等级（remote / remote_stale / local_baseline）, carryNote?: 沿用说明 }
 */
export async function getPriceDataset(): Promise<DatasetResult> {
  // 规则 2：mock 模式直接返回本地数据
  if (APP_CONFIG.USE_MOCK) {
    return { file: MOCK_PRICES, grade: 'local_baseline' };
  }

  const dayKey = todayDateKey();

  // 规则 3a：内存缓存当日有效，直接返回（含沿用分支的 remote_stale 结果）；
  // 例外：沿用型缓存（grade = remote_stale）的 failedAt 距今已超过 60 分钟冷却期时不短路，
  // 放行重新走拉取流程，避免会话内超过 60 分钟也不会重新尝试远端。
  if (memCache && memCache.fetchedDayKey === dayKey) {
    const staleRetryable =
      memCache.grade === 'remote_stale' &&
      typeof memCache.failedAt === 'number' &&
      Date.now() - memCache.failedAt >= APP_CONFIG.FAIL_RETRY_INTERVAL_MS;
    if (!staleRetryable) {
      return { file: memCache.file, grade: memCache.grade, carryNote: memCache.carryNote };
    }
  }

  // 规则 3b：今天已有拉取标记（重启场景，内存已丢失）
  // - 成功标记（无 failedAt）→ 遵守「成功时每天最多拉一次」，不再发网络请求：
  //   优先沿用 qs_prices_cache（即当日成功拉取的文件，grade = remote），缓存缺失才降级 mock；
  // - 失败标记（有 failedAt）→ 距 failedAt 不足 FAIL_RETRY_INTERVAL_MS（60 分钟）不再重试，
  //   优先沿用缓存，无可用缓存才降级本地基线；超过则放行再次拉取。
  const meta = readFetchMeta();
  if (meta && meta.dateKey === dayKey) {
    if (typeof meta.failedAt !== 'number') {
      const cached = readPricesCache();
      if (cached) {
        console.log('[参考价] 今日已成功拉取过，直接沿用当日拉取的文件缓存（如需重新拉取请清除缓存）');
        memCache = { file: cached, grade: 'remote', carryNote: cached.carryNote, fetchedDayKey: dayKey };
        return { file: cached, grade: 'remote', carryNote: cached.carryNote };
      }
      console.log('[参考价] 今日已成功拉取过但沿用缓存缺失，使用本地基线数据（如需重新拉取请清除缓存）');
      return fallbackMock();
    }
    if (Date.now() - meta.failedAt < APP_CONFIG.FAIL_RETRY_INTERVAL_MS) {
      console.log('[参考价] 距上次拉取失败不足 60 分钟，不再重试，优先沿用缓存');
      return tryCarryStale(dayKey) ?? fallbackMock();
    }
    // 失败已超过 60 分钟 → 放行重试
  }

  // 并发去重：已有进行中的拉取时复用同一 Promise
  if (inflight) {
    return inflight;
  }

  // 规则 3c：今天尚未拉取 → 尝试远端（成功持久化到沿用缓存；失败/超时/过期先尝试沿用再降级）
  const task = (async (): Promise<DatasetResult> => {
    try {
      const file = await fetchRemote();
      const expiresMs = Date.parse(file.expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs > Date.now() && file.stale !== true) {
        // 成功且未过期：写内存缓存 + 更新公共拉取标记 + 持久化沿用缓存（断更沿用/离线降级用）
        memCache = { file, grade: 'remote', carryNote: file.carryNote, fetchedDayKey: dayKey };
        writeFetchMeta({ dateKey: dayKey, version: file.version, expiresAt: file.expiresAt });
        writePricesCache(file);
        return { file, grade: 'remote', carryNote: file.carryNote };
      }
      // 数据已过期或标记为 stale（管线全失败保旧文件，generatedAt 被刷新但数据非当日）
      // → 写入带 failedAt 的失败短时效标记（60 分钟后可自动重试），
      // 先尝试沿用最近一次成功数据（周末/断更场景），无可用缓存再降级本地基线。
      console.warn('[参考价] 远端数据不可用（已过期或标记 stale，expiresAt=' + file.expiresAt + '，stale=' + String(file.stale === true) + '），尝试沿用最近一次成功数据（60 分钟后可自动重试）');
      writeFetchMeta({ dateKey: dayKey, version: file.version, expiresAt: file.expiresAt, failedAt: Date.now() });
      return tryCarryStale(dayKey) ?? fallbackMock();
    } catch (e) {
      // 规则 3d：任何失败 / 超时 → 写入带 failedAt 的失败短时效标记（60 分钟内不重试，
      // 超过 60 分钟自动放行重试），先尝试沿用最近一次成功数据，无可用缓存再降级本地基线。
      console.warn('[参考价] 远端拉取失败，尝试沿用最近一次成功数据（60 分钟后可自动重试；常见原因：未勾选不校验合法域名/未配置 request 合法域名、网络超时）', e);
      writeFetchMeta({ dateKey: dayKey, version: '', expiresAt: '', failedAt: Date.now() });
      return tryCarryStale(dayKey) ?? fallbackMock();
    }
  })();
  inflight = task;
  try {
    return await task;
  } finally {
    inflight = null;
  }
}

/**
 * 清除缓存（调试用）：同时清掉内存缓存、storage 公共拉取标记与断更沿用缓存，
 * 保证清除后可以立即重新触发远端拉取。
 */
export function clearPriceCache(): void {
  memCache = null;
  try {
    wx.removeStorageSync(FETCH_META_KEY);
  } catch (e) {
    // storage 删除失败不影响主流程，下次进入会按现有标记继续判断
  }
  try {
    wx.removeStorageSync(PRICES_CACHE_KEY);
  } catch (e) {
    // 沿用缓存删除失败不影响主流程，最多导致下次断更时仍沿用旧数据
  }
}

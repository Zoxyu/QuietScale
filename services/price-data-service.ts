/**
 * services/price-data-service.ts —— 参考价数据门面（四条取数规则的唯一收口）
 *
 * 职责：
 * 1. 模块级内存缓存 { file, grade, fetchedDayKey }，当日有效；
 * 2. USE_MOCK === true 时直接返回 mock/prices.json（grade = local_baseline）；
 * 3. USE_MOCK === false 时遵守「每天最多拉取一次远端」：
 *    - 内存缓存命中当日 → 直接返回；
 *    - storage 标记 qs_fetch_meta 的 dateKey 为今日（重启场景：今天已拉过但内存无数据）
 *      → 直接用 mock（grade = local_baseline），不再发网络请求；
 *    - 否则 wx.request 拉取 REMOTE_PRICES_URL，成功且 expiresAt 未过期
 *      → 写入内存缓存并更新 storage 标记（grade = remote）；
 *    - 成功但 expiresAt 已过期 → 也写入当日拉取标记（语义：今天已尝试过拉取，
 *      不再重试）后降级 mock（grade = local_baseline）；
 *    - 任何失败 / 超时 → 也写入当日拉取标记（失败也视为当日已尝试拉取，
 *      当日不再重试，安全降级 mock）后降级 mock（grade = local_baseline）。
 * 4. 并发去重：模块级 in-flight Promise 复用，并发调用共享同一次远端请求，
 *    完成或失败后清空，保证「每天最多拉取一次」不被并发绕过。
 * 5. 返回值附 grade，供页面展示数据等级徽标。
 *
 * 隐私红线：wx.setStorageSync 仅写入公共拉取标记 { dateKey, version, expiresAt }（<200B），
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

/** 公共拉取标记结构（体积 <200B） */
interface FetchMeta {
  /** 拉取当日日期键 YYYY-MM-DD */
  dateKey: string;
  /** 数据文件版本号 */
  version: string;
  /** 数据过期时间 ISO 字符串 */
  expiresAt: string;
}

/** 模块级内存缓存：当日有效，进程重启即失效 */
let memCache: { file: PricesFile; grade: DataGrade; fetchedDayKey: string } | null = null;

/** 模块级 in-flight Promise：并发调用复用同一次拉取，完成/失败后清空 */
let inflight: Promise<{ file: PricesFile; grade: DataGrade }> | null = null;

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

/** 写入公共拉取标记（仅 { dateKey, version, expiresAt }，失败静默） */
function writeFetchMeta(meta: FetchMeta): void {
  try {
    wx.setStorageSync(FETCH_META_KEY, meta);
  } catch (e) {
    // storage 写入失败不影响主流程，下次启动会重新走拉取判断
  }
}

/** 降级：返回本地 mock 数据 */
function fallbackMock(): { file: PricesFile; grade: DataGrade } {
  return { file: MOCK_PRICES, grade: 'local_baseline' };
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
 * @returns { file: 参考价数据文件, grade: 数据等级（remote / local_baseline） }
 */
export async function getPriceDataset(): Promise<{ file: PricesFile; grade: DataGrade }> {
  // 规则 2：mock 模式直接返回本地数据
  if (APP_CONFIG.USE_MOCK) {
    return { file: MOCK_PRICES, grade: 'local_baseline' };
  }

  const dayKey = todayDateKey();

  // 规则 3a：内存缓存当日有效，直接返回
  if (memCache && memCache.fetchedDayKey === dayKey) {
    return { file: memCache.file, grade: memCache.grade };
  }

  // 规则 3b：今天已拉取过（重启场景，内存已丢失）→ 遵守每日一次限制，直接用 mock
  const meta = readFetchMeta();
  if (meta && meta.dateKey === dayKey) {
    console.log('[参考价] 今日已尝试过拉取，直接使用本地基线数据（如需重新拉取请清除缓存）');
    return fallbackMock();
  }

  // 并发去重：已有进行中的拉取时复用同一 Promise
  if (inflight) {
    return inflight;
  }

  // 规则 3c：今天尚未拉取 → 尝试远端
  const task = (async (): Promise<{ file: PricesFile; grade: DataGrade }> => {
    try {
      const file = await fetchRemote();
      const expiresMs = Date.parse(file.expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs > Date.now()) {
        // 成功且未过期：写内存缓存 + 更新公共拉取标记
        memCache = { file, grade: 'remote', fetchedDayKey: dayKey };
        writeFetchMeta({ dateKey: dayKey, version: file.version, expiresAt: file.expiresAt });
        return { file, grade: 'remote' };
      }
      // 数据已过期 → 也写入当日标记（今天已尝试过拉取，不再重试）后降级
      console.warn('[参考价] 远端数据已过期（expiresAt=' + file.expiresAt + '），降级本地基线');
      writeFetchMeta({ dateKey: dayKey, version: file.version, expiresAt: file.expiresAt });
      return fallbackMock();
    } catch (e) {
      // 规则 3d：任何失败 / 超时 → 失败也视为当日已尝试拉取，写入当日标记，
      // 当日不再重试，安全降级 mock（grade = local_baseline）
      console.warn('[参考价] 远端拉取失败，降级本地基线（今日不再重试；常见原因：未勾选不校验合法域名/未配置 request 合法域名、网络超时）', e);
      writeFetchMeta({ dateKey: dayKey, version: '', expiresAt: '' });
      return fallbackMock();
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
 * 清除内存缓存（调试用）。
 * 注意：不清除 storage 中的公共拉取标记，保证「每天最多拉取一次」语义不被绕过。
 */
export function clearPriceCache(): void {
  memCache = null;
}

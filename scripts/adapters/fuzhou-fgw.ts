/**
 * scripts/adapters/fuzhou-fgw.ts —— 福州市发改委「主副食品集超均价表」生产 Adapter
 *
 * 数据源：福州市发展和改革委员会官网公开栏目
 *   列表页：https://fgw.fuzhou.gov.cn/fgwzwgk/fzgggz/jgysf/msspjgxq/zfsp/
 *   （目录形 URL，勿用 index.htm 变体；列表按时间倒序，链接形如 ./202608/t{YYYYMMDD}_{id}.htm）
 *
 * 发布规律：工作日约 10:00-11:30 发布一期，周末/节假日不发布。
 * 滚动策略：取「日期 ≤ dateKey 的最新一条」——当天尚未发布、周末或节假日时，
 * 自动沿用最近一期数据，天然实现「T-1 滚动 + 周末继承」。
 *
 * 解析逻辑与试点脚本（scripts/pilot/fetch-two-days.ts）同源：
 * 静态 HTML（UTF-8）→ 5 列表格（类别|商品名称|规格等级|计量单位|今日集超均价），
 * 类别列 rowspan 向前填充，表头跳过，价格按 number 解析，失败行记入日志不静默丢弃。
 *
 * 礼貌抓取：请求间隔 ≥ 1 秒、可识别 User-Agent、单次请求 8 秒超时；
 * 失败由管线统一重试（最多 1 次），本文件内部不做任何额外重试，不绕过任何限制。
 *
 * 零第三方依赖：仅使用 Node 24 内置 fetch / URL / AbortController。
 */

import { registerAdapter } from './adapter.ts';
import type { PriceAdapter, RawSample } from './adapter.ts';

/* ------------------------------ 常量 ------------------------------ */

/** 列表页（目录形 URL，时间倒序） */
const LIST_URL = 'https://fgw.fuzhou.gov.cn/fgwzwgk/fzgggz/jgysf/msspjgxq/zfsp/';

/** 可识别的 User-Agent（与试点脚本同源，版本递进） */
const USER_AGENT = 'QuietScale-DataBot/0.2 (public price reference data; contact via project README)';

/** 请求间隔（毫秒）：列表页与详情页之间保持 ≥1 秒 */
const REQUEST_INTERVAL_MS = 1200;

/** 单次请求超时（毫秒） */
const REQUEST_TIMEOUT_MS = 8000;

/** 城市信息 */
const CITY_CODE = '350100';
const CITY_NAME = '福州';

/** 展示用来源名 */
const SOURCE_NAME = '福州市发展和改革委员会-主副食品集超均价表';

/** 日志前缀 */
const LOG_PREFIX = '[fuzhou-fgw]';

/* ------------------------------ 基础工具 ------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 带超时的 GET：非 200 或空响应一律抛错（由管线做统一重试） */
async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} —— ${url}`);
    }
    const text = await res.text();
    if (!text || text.trim().length === 0) {
      throw new Error(`响应内容为空 —— ${url}`);
    }
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`请求超时（>${REQUEST_TIMEOUT_MS}ms）—— ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 去除 HTML 标签、解码常见实体、归一化空白 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&middot;/gi, '·')
    .replace(/&#(\d+);/g, (_m, code) => {
      try { return String.fromCodePoint(Number(code)); } catch { return ''; }
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/* ------------------------------ 列表页 ------------------------------ */

/**
 * 提取列表页中所有 `./YYYYMM/tYYYYMMDD_编号.htm` 链接。
 * 返回 date(YYYYMMDD) → 详情页绝对 URL 的映射（同一日期仅保留首条）。
 */
function extractDateLinks(html: string, baseUrl: string): Map<string, string> {
  const found = new Map<string, string>();
  const re = /(?:\.\/)?(\d{6})\/t(\d{8})_(\d+)\.htm/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const date = m[2];
    if (!found.has(date)) {
      found.set(date, new URL(m[0].startsWith('./') ? m[0] : `./${m[1]}/t${m[2]}_${m[3]}.htm`, baseUrl).href);
    }
  }
  return found;
}

/* ------------------------------ 详情页 ------------------------------ */

/** 解析出的单行价格数据 */
interface PriceRow {
  category: string;
  productName: string;
  specification: string;
  unit: string;
  priceYuan: number;
  normalizedNote: string;
}

/** 解析失败行记录（记入日志，不静默丢弃） */
interface ParseError {
  location: string;
  reason: string;
  raw: string;
}

/** 详情页解析结果 */
interface DetailResult {
  sourceUrl: string;
  title: string;
  /** 详情页标题中的日期 YYYY-MM-DD；解析不到时回退列表链接日期 */
  dataDate: string;
  publishTime: string;
  items: PriceRow[];
  parseErrors: ParseError[];
}

/** 提取页面主标题（h1 → h2 → title） */
function extractTitle(html: string): string {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) {
    const t = htmlToText(h1[1]);
    if (t) return t;
  }
  const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  if (h2) {
    const t = htmlToText(h2[1]);
    if (t && t.length < 80) return t;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) return htmlToText(title[1]);
  return '';
}

/** 从标题文本中提取日期：「2026年8月13日福州市主副食品集超均价表」→ 2026-08-13 */
function extractTitleDate(title: string): string {
  const m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(title);
  if (!m) return '';
  const mm = String(Number(m[2])).padStart(2, '0');
  const dd = String(Number(m[3])).padStart(2, '0');
  return `${m[1]}-${mm}-${dd}`;
}

/** 提取发布时间（标注式优先，其次任意 "YYYY-MM-DD HH:mm" 形式） */
function extractPublishTime(html: string): string {
  const labeled = /(?:发布时间|发布日期|日\s*期)[：:\s]*<\/?[^>]*>?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)/i.exec(html);
  if (labeled) return htmlToText(labeled[1]);
  const any = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/.exec(html);
  if (any) return any[1].trim();
  return '';
}

/** 选出正文价格表：优先包含「商品名称」且行数最多的 table */
function extractMainTable(html: string): string | null {
  const tables: string[] = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    tables.push(m[0]);
  }
  if (tables.length === 0) return null;
  let best: string | null = null;
  let bestScore = -1;
  for (const t of tables) {
    const rowCount = (t.match(/<tr\b/gi) || []).length;
    const score = rowCount + (/商品名称/.test(t) ? 1000 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

interface RawCell {
  text: string;
  rowspan: number;
}

/** 解析表格单行的全部单元格（含 rowspan 属性） */
function parseTableRow(rowHtml: string): RawCell[] {
  const cells: RawCell[] = [];
  const re = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml)) !== null) {
    const attrs = m[1];
    const rs = /rowspan\s*=\s*["']?(\d+)/i.exec(attrs);
    cells.push({
      text: htmlToText(m[2]),
      rowspan: rs ? Math.max(1, Number(rs[1])) : 1
    });
  }
  return cells;
}

/** 原始单位的比价口径说明（保留原始单位，不折算） */
function unitNormalizedNote(unit: string): string {
  if (/500\s*克/.test(unit)) return '元/500克即元/斤';
  if (/斤/.test(unit)) return '已是元/斤';
  return `原始单位「${unit}」，非按斤计价，勿盲目折算`;
}

/**
 * 解析价格表全部数据行：
 * - 表头行（含「商品名称」等列名）跳过；
 * - 5 列 = 类别 + 4 数据列；4 列 = 类别列被 rowspan 合并，向前填充；
 * - 价格无法解析为数字的行记入 parseErrors，不静默丢弃。
 */
function parsePriceTable(tableHtml: string, dataDate: string): { items: PriceRow[]; parseErrors: ParseError[] } {
  const items: PriceRow[] = [];
  const parseErrors: ParseError[] = [];

  const rows: string[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    rows.push(rm[1]);
  }

  let lastCategory = '';
  let fillRemaining = 0;

  for (let i = 0; i < rows.length; i++) {
    const cells = parseTableRow(rows[i]);
    if (cells.length === 0) continue;

    const joined = cells.map(c => c.text).join('|');
    if (/商品名称|今日集超均价|计量单位/.test(joined) && /类别|品名/.test(joined)) {
      continue; // 表头行
    }
    if (i === 0 && /商品名称/.test(joined)) {
      continue; // 兜底：首行视为表头
    }

    let category: string;
    let rest: RawCell[];

    if (cells.length === 5) {
      category = cells[0].text;
      if (cells[0].rowspan > 1) fillRemaining = cells[0].rowspan - 1;
      lastCategory = category;
      rest = cells.slice(1);
    } else if (cells.length === 4) {
      // 类别列被 rowspan 合并，向前填充
      category = lastCategory;
      if (fillRemaining > 0) fillRemaining -= 1;
      rest = cells;
    } else {
      parseErrors.push({
        location: `${dataDate} 表格第 ${i + 1} 行`,
        reason: `异常列数 ${cells.length}（预期 5 或 4，可能含其他合并单元格）`,
        raw: joined
      });
      continue;
    }

    const productName = rest[0].text;
    const specification = rest[1].text;
    const unit = rest[2].text;
    const priceText = rest[3].text;

    if (!productName && !priceText) continue; // 空行

    const priceClean = priceText.replace(/[,，\s]/g, '');
    const priceYuan = Number(priceClean);
    if (priceClean === '' || !Number.isFinite(priceYuan)) {
      parseErrors.push({
        location: `${dataDate} 商品「${productName}」`,
        reason: `价格无法解析为数字：「${priceText}」`,
        raw: joined
      });
      continue;
    }

    items.push({
      category,
      productName,
      specification,
      unit,
      priceYuan,
      normalizedNote: unitNormalizedNote(unit)
    });
  }

  return { items, parseErrors };
}

/** 拉取并解析一期详情页（链接日期作为 dataDate 的回退值） */
async function fetchDetail(detailUrl: string, linkDateCompact: string): Promise<DetailResult> {
  const html = await fetchText(detailUrl);

  const fallbackDate = `${linkDateCompact.slice(0, 4)}-${linkDateCompact.slice(4, 6)}-${linkDateCompact.slice(6, 8)}`;
  const title = extractTitle(html);
  const dataDate = extractTitleDate(title) || fallbackDate;
  const publishTime = extractPublishTime(html);

  const parseErrors: ParseError[] = [];
  let items: PriceRow[] = [];

  const table = extractMainTable(html);
  if (!table) {
    parseErrors.push({ location: dataDate, reason: '未在详情页中找到任何 <table>', raw: '' });
  } else {
    const parsed = parsePriceTable(table, dataDate);
    items = parsed.items;
    parseErrors.push(...parsed.parseErrors);
    if (items.length === 0 && parseErrors.length === 0) {
      parseErrors.push({ location: dataDate, reason: '找到表格但未解析出任何数据行', raw: '' });
    }
  }

  return { sourceUrl: detailUrl, title, dataDate, publishTime, items, parseErrors };
}

/* ------------------------------ Adapter ------------------------------ */

/**
 * 福州市发改委主副食品集超均价 Adapter。
 *
 * fetchSamples(dateKey) 流程：
 * 1. 拉取列表页第 1 页，正则提取全部带日期链接；取「日期 ≤ dateKey 的最新一条」；
 * 2. 间隔 ≥1 秒后拉取该详情页，解析标题日期 / 发布时间 / 47 行价格表；
 * 3. 每个商品输出一条 RawSample（singleAverage 标记 + 原始单位说明），
 *    category 保留原始类别字符串（粮油/肉禽蛋/水产/蔬菜/水果/牛奶），不做九品类硬映射。
 *
 * 任何环节失败（列表无链接、无 ≤dateKey 的期数、表格解析 0 行）均抛错，
 * 由管线的超时 + 1 次重试与全失败保留旧数据（stale）机制兜底。
 */
export const fuzhouFgwAdapter: PriceAdapter = {
  id: 'fuzhou-fgw',
  name: '福州市发改委主副食品集超均价',
  priority: 1,
  status: 'active',

  async fetchSamples(dateKey: string): Promise<RawSample[]> {
    const targetCompact = dateKey.replace(/-/g, '');

    /* 1. 列表页：提取全部带日期链接 */
    const listHtml = await fetchText(LIST_URL);
    const links = extractDateLinks(listHtml, LIST_URL);
    if (links.size === 0) {
      throw new Error(`${LOG_PREFIX} 列表页未提取到任何带日期链接：${LIST_URL}`);
    }

    /* 取日期 ≤ dateKey 的最新一条（周末/节假日/发布延迟时自动沿用最近一期） */
    let bestDate = '';
    for (const date of links.keys()) {
      if (date <= targetCompact && date > bestDate) {
        bestDate = date;
      }
    }
    if (!bestDate) {
      throw new Error(`${LOG_PREFIX} 列表页没有日期 ≤ ${dateKey} 的期数（共 ${links.size} 条链接）`);
    }
    const detailUrl = links.get(bestDate) as string;
    console.log(`${LOG_PREFIX} 定位到期数 ${bestDate}（请求日期 ${dateKey}）：${detailUrl}`);

    /* 2. 礼貌间隔后拉取详情页 */
    await sleep(REQUEST_INTERVAL_MS);
    const detail = await fetchDetail(detailUrl, bestDate);

    if (detail.parseErrors.length > 0) {
      for (const e of detail.parseErrors) {
        console.warn(`${LOG_PREFIX} 解析告警 [${e.location}] ${e.reason}${e.raw ? ` —— 原始内容：${e.raw}` : ''}`);
      }
    }
    if (detail.items.length === 0) {
      throw new Error(`${LOG_PREFIX} 详情页未解析出任何有效价格行：${detailUrl}`);
    }
    console.log(`${LOG_PREFIX} 解析成功：${detail.items.length} 条（标题日期 ${detail.dataDate}，发布时间 ${detail.publishTime || '未提取到'}）`);

    /* 3. 输出样本：每商品一条，单均价标记，保留原始类别与单位 */
    return detail.items.map((it): RawSample => ({
      cityCode: CITY_CODE,
      cityName: CITY_NAME,
      channel: 'market',
      category: it.category,
      productName: it.productName,
      specification: it.specification,
      unit: it.unit,
      priceYuan: it.priceYuan,
      dataDate: detail.dataDate,
      sourceName: SOURCE_NAME,
      sourceUrl: detail.sourceUrl,
      unitNote: it.normalizedNote,
      singleAverage: true
    }));
  }
};

registerAdapter(fuzhouFgwAdapter);

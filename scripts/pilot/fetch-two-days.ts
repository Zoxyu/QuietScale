/**
 * 一次性试点爬取脚本：福州市发改委「主副食品集超均价表」
 *
 * 目标：抓取 2026-08-13 与 2026-08-14 两期公开价格表，
 * 解析后输出 JSON + CSV 到 scripts/pilot/output/，供人工审查。
 *
 * 约束：
 * - 仅抓取政府公开发布数据；请求间隔 >= 1 秒；总请求数 <= 4（列表 1-2 + 详情 2）
 * - 可识别 User-Agent；任何失败如实打印并退出，不重试、不绕过限制
 * - 零第三方依赖，Node 内置 fetch 直接运行：node scripts/pilot/fetch-two-days.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- 常量 ----------

const LIST_URL = 'https://fgw.fuzhou.gov.cn/fgwzwgk/fzgggz/jgysf/msspjgxq/zfsp/';
const TARGET_DATES = ['20260813', '20260814'];
const USER_AGENT = 'QuietScale-DataBot/0.1 (price reference research; contact via project README)';
const REQUEST_INTERVAL_MS = 1200;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

// ---------- 小工具 ----------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchText(url: string): Promise<string> {
  console.log(`[fetch] GET ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
    redirect: 'follow'
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} —— ${url}`);
  }
  const text = await res.text();
  if (!text || text.trim().length === 0) {
    throw new Error(`响应内容为空 —— ${url}`);
  }
  return text;
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

// ---------- 列表页：按日期定位详情链接 ----------

interface TargetLink {
  date: string;        // 形如 20260813
  detailUrl: string;   // 绝对 URL
}

/** 提取列表页中所有 `./YYYYMM/tYYYYMMDD_编号.htm` 链接 */
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

/** 在列表页中寻找第 2 页链接线索（常见 CMS 分页：index_1.htm 等） */
function findPageTwoUrl(html: string, baseUrl: string): string | null {
  const patterns = [
    /href\s*=\s*["']([^"']*index_\d+\.htm)["']/gi,
    /href\s*=\s*["']([^"']*_\d+\.htm)["']/gi
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      if (/index_1\.htm/i.test(href) || /_\d+\.htm$/i.test(href)) {
        return new URL(href, baseUrl).href;
      }
    }
  }
  return null;
}

async function locateTargets(): Promise<Map<string, TargetLink>> {
  const targets = new Map<string, TargetLink>();

  const pageOneHtml = await fetchText(LIST_URL);
  let links = extractDateLinks(pageOneHtml, LIST_URL);
  console.log(`[list] 第 1 页共提取 ${links.size} 条带日期链接`);

  for (const date of TARGET_DATES) {
    const url = links.get(date);
    if (url) targets.set(date, { date, detailUrl: url });
  }

  const missing = TARGET_DATES.filter(d => !targets.has(d));
  if (missing.length > 0) {
    const pageTwoUrl = findPageTwoUrl(pageOneHtml, LIST_URL);
    if (pageTwoUrl) {
      console.log(`[list] 第 1 页缺少 ${missing.join(', ')}，尝试第 2 页：${pageTwoUrl}`);
      await sleep(REQUEST_INTERVAL_MS);
      const pageTwoHtml = await fetchText(pageTwoUrl);
      links = extractDateLinks(pageTwoHtml, pageTwoUrl);
      console.log(`[list] 第 2 页共提取 ${links.size} 条带日期链接`);
      for (const date of missing) {
        const url = links.get(date);
        if (url) targets.set(date, { date, detailUrl: url });
      }
    } else {
      console.log(`[list] 第 1 页缺少 ${missing.join(', ')}，且未找到第 2 页链接线索`);
    }
  }

  return targets;
}

// ---------- 详情页：解析正文与表格 ----------

interface PriceRow {
  category: string;
  productName: string;
  specification: string;
  unit: string;
  priceYuan: number;
  normalizedNote: string;
}

interface ParseError {
  location: string;
  reason: string;
  raw: string;
}

interface DayResult {
  sourceUrl: string;
  title: string;
  dataDate: string;      // YYYY-MM-DD
  publishTime: string;
  fetchedAt: string;
  itemCount: number;
  items: PriceRow[];
  parseErrors: ParseError[];
}

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

function extractPublishTime(html: string): string {
  const labeled = /(?:发布时间|发布日期|日\s*期)[：:\s]*<\/?[^>]*>?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)/i.exec(html);
  if (labeled) return htmlToText(labeled[1]);
  const any = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/.exec(html);
  if (any) return any[1].trim();
  return '';
}

/** 选出正文价格表：优先包含"商品名称"且行数最多的 table */
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

function unitNormalizedNote(unit: string): string {
  if (/500\s*克/.test(unit)) return '元/500克 即 元/斤，可直接按斤比价';
  if (/斤/.test(unit)) return '已是元/斤';
  return '非按斤计价，保留原始单位，勿盲目折算';
}

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

async function fetchAndParseDay(target: TargetLink): Promise<DayResult> {
  const html = await fetchText(target.detailUrl);
  const yyyy = target.date.slice(0, 4);
  const mm = target.date.slice(4, 6);
  const dd = target.date.slice(6, 8);
  const dataDate = `${yyyy}-${mm}-${dd}`;

  const title = extractTitle(html);
  const publishTime = extractPublishTime(html);

  const parseErrors: ParseError[] = [];
  const table = extractMainTable(html);
  let items: PriceRow[] = [];
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

  return {
    sourceUrl: target.detailUrl,
    title,
    dataDate,
    publishTime,
    fetchedAt: new Date().toISOString(),
    itemCount: items.length,
    items,
    parseErrors
  };
}

// ---------- 输出 ----------

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(result: DayResult): string {
  const lines = ['类别,商品名称,规格等级,计量单位,今日集超均价'];
  for (const it of result.items) {
    lines.push([it.category, it.productName, it.specification, it.unit, String(it.priceYuan)]
      .map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

function writeFileUtf8(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf8');
}

function printSummary(result: DayResult, jsonPath: string, csvPath: string): void {
  console.log('');
  console.log(`================ ${result.dataDate} ================`);
  console.log(`标题     ：${result.title || '（未提取到）'}`);
  console.log(`发布时间 ：${result.publishTime || '（未提取到）'}`);
  console.log(`条目数   ：${result.itemCount}`);

  const categoryDist = new Map<string, number>();
  const unitDist = new Map<string, number>();
  for (const it of result.items) {
    categoryDist.set(it.category, (categoryDist.get(it.category) || 0) + 1);
    unitDist.set(it.unit, (unitDist.get(it.unit) || 0) + 1);
  }
  console.log(`品类分布 ：${[...categoryDist.entries()].map(([k, v]) => `${k}×${v}`).join('、') || '（无）'}`);
  console.log(`单位种类 ：${[...unitDist.entries()].map(([k, v]) => `${k}×${v}`).join('、') || '（无）'}`);
  console.log(`解析失败 ：${result.parseErrors.length} 行`);
  for (const e of result.parseErrors) {
    console.log(`  - [${e.location}] ${e.reason}`);
  }
  console.log(`输出 JSON：${jsonPath}`);
  console.log(`输出 CSV ：${csvPath}`);
}

// ---------- 主流程 ----------

async function main(): Promise<void> {
  console.log('[pilot] 福州市发改委「主副食品集超均价表」试点爬取');
  console.log(`[pilot] 目标日期：${TARGET_DATES.join(', ')}；UA：${USER_AGENT}`);

  const targets = await locateTargets();

  const notFound = TARGET_DATES.filter(d => !targets.has(d));
  if (notFound.length > 0) {
    console.log(`[warn] 以下日期未在列表页（含第 2 页尝试）中定位到：${notFound.join(', ')}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let anyData = false;
  for (const date of TARGET_DATES) {
    const target = targets.get(date);
    if (!target) continue;

    await sleep(REQUEST_INTERVAL_MS);
    const result = await fetchAndParseDay(target);
    if (result.itemCount > 0) anyData = true;

    const fileName = `fuzhou-fgw-${result.dataDate}`;
    const jsonPath = path.join(OUTPUT_DIR, `${fileName}.json`);
    const csvPath = path.join(OUTPUT_DIR, `${fileName}.csv`);
    writeFileUtf8(jsonPath, JSON.stringify(result, null, 2) + '\n');
    writeFileUtf8(csvPath, toCsv(result));

    printSummary(result, jsonPath, csvPath);
  }

  if (!anyData) {
    console.error('[fail] 未能抓取到任何一期数据，试点失败。');
    process.exit(1);
  }
  if (notFound.length > 0) {
    console.error(`[fail] 部分日期缺失：${notFound.join(', ')}（请人工核对列表页）。`);
    process.exit(1);
  }
  console.log('\n[pilot] 完成。');
}

main().catch(err => {
  console.error('[fail] 抓取或解析过程发生未处理错误，如实上报并退出：');
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

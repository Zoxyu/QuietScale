/**
 * pages/price-detail/index.ts —— 「价格详情」
 *
 * 职责：纯胶水层。onLoad 从 options.id 取记录 id，经 getPriceDataset()
 * 定位对应 PriceRecord；找不到则展示友好错误。趋势图交给 trend-chart 组件，
 * 批发记录追加批发免责文案。本页不写任何 storage。
 */

import { getPriceDataset } from '../../services/price-data-service';
import type { PriceRecord, PricesFile, DataLevel, Confidence, DataGrade } from '../../types/models';

/** 数据等级 → 中文标签 */
const DATA_LEVEL_NAME: Record<DataLevel, string> = {
  official_retail: '本地零售参考',
  official_market: '批发市场监测',
  wholesale: '批发参考',
  seasonal_baseline: '季节经验参考',
  estimated: '估算参考'
};

/** 置信度 → 中文标签 */
const CONFIDENCE_NAME: Record<Confidence, string> = {
  high: '高置信度',
  medium: '中置信度',
  low: '低置信度'
};

/** 批发环节追加免责（与 judge.ts 强制文案一致） */
const WHOLESALE_NOTE = '这是批发环节参考，不能直接等同于菜市场或商超零售价。';

/** 通用免责声明 */
const COMMON_DISCLAIMER = '参考区间仅供比价参考，实际价格受品质、产地与渠道影响。';

/** 数值 → 最多 2 位小数、去尾零的展示串 */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) {
    return '--';
  }
  return String(Math.round(n * 100) / 100);
}

/** 记录详情视图（交给 WXML 渲染） */
interface DetailView {
  productName: string;
  category: string;
  specification: string;
  unit: string;
  priceCaliber: string;
  low: string;
  median: string;
  high: string;
  sampleCount: number;
  dataDate: string;
  sourceName: string;
  sourceUrl: string;
  hasUrl: boolean;
  levelLabel: string;
  confidenceLabel: string;
  note: string;
  isWholesale: boolean;
  wholesaleNote: string;
  commonDisclaimer: string;
  hasTrend: boolean;
  trend7d: number[];
}

/** 记录 → 详情视图 */
function toView(r: PriceRecord): DetailView {
  const isWholesale = r.dataLevel === 'wholesale';
  const trend = Array.isArray(r.trend7d) ? r.trend7d.filter((v) => Number.isFinite(v)) : [];
  // 官方单均价展开记录：显式标记优先（expandedFromSingleAverage===true），
  // 缺失该字段的旧数据回退原逻辑（sampleCount===1）
  const isExpandedSingleAverage = r.expandedFromSingleAverage === true || r.sampleCount === 1;
  const priceCaliber = isExpandedSingleAverage
    ? `计价口径：${r.unit}，参考区间由官方单日均价按固定系数展开，详见下方备注。`
    : `计价口径：${r.unit}，参考区间按近 7 日样本由低到高整理。`;
  return {
    productName: r.productName,
    category: r.category,
    specification: r.specification,
    unit: r.unit,
    priceCaliber,
    low: fmtNum(r.low),
    median: fmtNum(r.median),
    high: fmtNum(r.high),
    sampleCount: r.sampleCount,
    dataDate: r.dataDate,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    hasUrl: typeof r.sourceUrl === 'string' && r.sourceUrl.trim() !== '',
    levelLabel: DATA_LEVEL_NAME[r.dataLevel] || r.dataLevel,
    confidenceLabel: CONFIDENCE_NAME[r.confidence] || r.confidence,
    note: r.note,
    isWholesale,
    wholesaleNote: isWholesale ? WHOLESALE_NOTE : '',
    commonDisclaimer: COMMON_DISCLAIMER,
    hasTrend: trend.length > 0,
    trend7d: trend
  };
}

Page({
  data: {
    loading: true,
    notFound: false,
    rec: null as DetailView | null
  },

  onLoad(this: any, options: Record<string, string>): void {
    const id = (options && options.id ? decodeURIComponent(options.id) : '').trim();
    if (!id) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.loadRecord(id);
  },

  /** 拉取数据集并定位记录 */
  loadRecord(this: any, id: string): void {
    this.setData({ loading: true });
    getPriceDataset()
      .then((res: { file: PricesFile; grade: DataGrade }) => {
        const records = (res.file && res.file.records) || [];
        let target: PriceRecord | null = null;
        for (const r of records) {
          if (r.id === id) {
            target = r;
            break;
          }
        }
        if (!target) {
          this.setData({ loading: false, notFound: true });
          return;
        }
        wx.setNavigationBarTitle({ title: target.productName });
        this.setData({ loading: false, notFound: false, rec: toView(target) });
      })
      .catch(() => {
        this.setData({ loading: false, notFound: true });
      });
  },

  /** 复制数据来源链接 */
  onCopySource(this: any): void {
    const rec = this.data.rec as DetailView | null;
    if (!rec || !rec.hasUrl) {
      return;
    }
    wx.setClipboardData({
      data: rec.sourceUrl,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'none' });
      }
    });
  }
});

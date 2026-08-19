/**
 * pages/market-guide/index.ts —— 「菜场指南」（TabBar 页）
 *
 * 职责：纯胶水层。负责城市 / 渠道过滤、参考价列表组装、价格判断与静态内容装载。
 *
 * 数据流：
 * 1. onLoad → getPriceDataset() 取全量 records 与数据等级 grade；
 * 2. 城市 / 渠道只存页面 data（内存态），严禁写 storage；
 * 3. applyFilter() 按「所选城市 + 所选渠道」过滤；无该渠道记录时放宽到
 *    该城市任意渠道并标注；城市整体无记录时回退全国参考；
 * 4. 「我看到的价格」经 200ms 防抖调用 judgeObservedPrice，结果按五档映射视觉。
 */

import { getPriceDataset } from '../../services/price-data-service';
import { judgeObservedPrice } from '../../services/judge';
import { splitSeasonalList, getSeasonalTip } from '../../services/seasonal';
import { SEASONAL_BASELINES } from '../../mock/seasonal-baselines';
import type { SeasonalBaselineItem } from '../../services/seasonal';
import { CITY_KEYS, CITY_NAMES } from '../../types/models';
import type {
  CityKey,
  Channel,
  PriceRecord,
  PricesFile,
  DataLevel,
  Confidence,
  JudgementLevel,
  DataGrade
} from '../../types/models';

/** 运行时全局定时器的本地声明（lib ES2017 未含 DOM 定时器类型） */
declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): number;
declare function clearTimeout(handle?: number): void;

/** 本地季节经验基线数据（原生小程序无法在运行时读取代码包内 JSON，故以 TS 模块形式提供） */
const SEASONAL_FILE = SEASONAL_BASELINES;

/** 判断输入防抖间隔（毫秒） */
const JUDGE_DEBOUNCE_MS = 200;

/** CityKey → 后端 cityCode 映射（全国为字符串，城市为行政区划码） */
const CITY_CODE: Record<CityKey, string> = {
  national: 'national',
  beijing: '110000',
  shanghai: '310000',
  guangzhou: '440100',
  chengdu: '510100'
};

/** 城市选择项（全国展示为「全国参考」） */
const CITY_OPTIONS = CITY_KEYS.map((key) => ({
  key,
  name: key === 'national' ? '全国参考' : CITY_NAMES[key]
}));

/** 渠道选择项（默认菜市场） */
const CHANNEL_OPTIONS: Array<{ key: Channel; name: string }> = [
  { key: 'market', name: '菜市场' },
  { key: 'community', name: '社区生鲜' },
  { key: 'supermarket', name: '商超' },
  { key: 'ecommerce', name: '电商' }
];

/** 渠道 → 中文名（含批发，用于记录展示） */
const CHANNEL_NAME: Record<string, string> = {
  market: '菜市场',
  community: '社区生鲜',
  supermarket: '商超',
  ecommerce: '电商',
  wholesale: '批发'
};

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

/** 数据等级 grade → 顶部徽标文案 */
const GRADE_NAME: Record<DataGrade, string> = {
  remote: '远程参考数据',
  local_baseline: '本地参考数据'
};

/** 9 大品类展示顺序 */
const CATEGORY_ORDER = ['叶菜', '根茎', '茄果', '豆类', '猪肉', '鸡蛋', '水果', '大米', '食用油'];

/** 判断等级 → 中文标签 / 符号 / 视觉主题 */
const JUDGE_META: Record<JudgementLevel, { label: string; symbol: string; theme: string }> = {
  'low-price': { label: '价格偏低', symbol: '▽', theme: 'judge-low' },
  fair: { label: '合理区间', symbol: '◉', theme: 'judge-fair' },
  'slightly-high': { label: '略高，可再比较', symbol: '△', theme: 'judge-high' },
  'too-high': { label: '明显高于近期参考', symbol: '▲', theme: 'judge-high' },
  'insufficient-data': { label: '数据不足，暂不判断', symbol: '…', theme: 'judge-muted' }
};

/** 参考价条目视图数据（交给 price-item 组件渲染） */
interface PriceItemView {
  id: string;
  productName: string;
  category: string;
  specification: string;
  unit: string;
  low: string;
  median: string;
  high: string;
  channelName: string;
  dateLabel: string;
  levelLabel: string;
  confidence: string;
  confidenceLabel: string;
  muted: boolean;
  isWholesale: boolean;
}

/** 新手挑选指南内容（看 / 避 / 买 / 提示 三段式，逐字文案） */
const GUIDE_CARDS = [
  {
    title: '叶菜',
    look: '叶片挺、梗部有水分、无大面积黄斑、无黏滑异味。',
    avoid: '软烂、发黏、明显腐败。',
    buy: '优先按当天或一两天内吃完的量购买。',
    tip: ''
  },
  {
    title: '土豆',
    look: '表皮紧实，无软烂和明显发芽。',
    avoid: '发芽或大面积变绿的土豆。',
    buy: '圆润、大小适中通常更易处理，但口感还与品种有关。',
    tip: ''
  },
  {
    title: '番茄',
    look: '果皮完整、有弹性、无裂口霉点，按生食或烹饪用途选成熟度。',
    avoid: '',
    buy: '',
    tip: '不能仅凭硬度、颜色或外形判断是否“催熟”；不同品种和储运条件都会影响口感。'
  },
  {
    title: '猪肉',
    look: '正规摊位、检疫合格标识、色泽自然、表面不发黏、气味正常。',
    avoid: '',
    buy: '按菜式选择部位，并注意冷藏条件。',
    tip: ''
  },
  {
    title: '鸡蛋',
    look: '蛋壳完整、生产日期、储存条件。',
    avoid: '破损蛋、异味蛋。',
    buy: '不必过度追求“外壳越亮越新鲜”。',
    tip: ''
  },
  {
    title: '水果',
    look: '成熟度、香气、软硬度、完整度和品种。',
    avoid: '',
    buy: '',
    tip: '大小不等于甜度。'
  },
  {
    title: '米和食用油',
    look: '生产日期、配料表、等级、保质期和包装完整性。',
    avoid: '',
    buy: '',
    tip: '比较每斤或每升价格，不要只看整袋或整桶价格。'
  }
];

/** 时令雷达可横滑选择的常见品类 */
const SEASONAL_PICKS = ['番茄', '黄瓜', '土豆', '菠菜', '豇豆', '毛豆', '茄子', '生菜', '西瓜', '桃子'];

/** 数值 → 最多 2 位小数、去尾零的展示串 */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) {
    return '--';
  }
  return String(Math.round(n * 100) / 100);
}

/** 品类排序权重；未知品类排在最后 */
function categoryRank(category: string): number {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx < 0 ? CATEGORY_ORDER.length : idx;
}

/** 单条记录 → 展示视图 */
function toItem(r: PriceRecord): PriceItemView {
  return {
    id: r.id,
    productName: r.productName,
    category: r.category,
    specification: r.specification,
    unit: r.unit,
    low: fmtNum(r.low),
    median: fmtNum(r.median),
    high: fmtNum(r.high),
    channelName: CHANNEL_NAME[r.channel] || r.channel,
    dateLabel: `${r.dataDate} 更新`,
    levelLabel: DATA_LEVEL_NAME[r.dataLevel] || r.dataLevel,
    confidence: r.confidence,
    confidenceLabel: CONFIDENCE_NAME[r.confidence] || r.confidence,
    muted: r.confidence === 'low' || r.dataLevel === 'seasonal_baseline' || r.dataLevel === 'estimated',
    isWholesale: r.dataLevel === 'wholesale'
  };
}

/**
 * 按城市 + 渠道过滤，逐级放宽：
 * 精确匹配 → 该城市任意渠道（标注）→ 全国参考兜底。
 */
function filterRecords(
  all: PriceRecord[],
  cityCode: string,
  channel: Channel,
  cityName: string,
  channelName: string
): { list: PriceRecord[]; note: string } {
  const exact = all.filter((r) => r.cityCode === cityCode && r.channel === channel);
  if (exact.length) {
    return { list: exact, note: '' };
  }
  const cityAny = all.filter((r) => r.cityCode === cityCode);
  if (cityAny.length) {
    return {
      list: cityAny,
      note: `${cityName}暂无「${channelName}」渠道的参考记录，已放宽为该城市全部渠道。`
    };
  }
  const national = all.filter((r) => r.cityCode === 'national');
  return { list: national, note: `${cityName}暂无参考记录，已切换为全国参考。` };
}

/** 时令三组 → 雷达组件结构（传全量品名，由组件按需截断/展开） */
function buildSeasonalGroups(items: SeasonalBaselineItem[], month: number): Record<string, unknown> {
  const split = splitSeasonalList(items, month);
  const toNames = (arr: SeasonalBaselineItem[]): Array<{ name: string }> =>
    arr.map((it) => ({ name: it.productName }));
  const best = toNames(split.best);
  const stable = toNames(split.stable);
  const off = toNames(split.offSeason);
  return {
    best,
    bestMore: Math.max(0, best.length - 8),
    stable,
    stableMore: Math.max(0, stable.length - 8),
    offSeason: off,
    offSeasonMore: Math.max(0, off.length - 8)
  };
}

Page({
  data: {
    /* A. 城市与渠道（仅内存态） */
    cityOptions: CITY_OPTIONS,
    channelOptions: CHANNEL_OPTIONS,
    cityKey: 'national' as CityKey,
    channel: 'market' as Channel,

    /* B. 今日参考价 */
    loading: true,
    gradeLabel: '',
    filterNote: '',
    items: [] as PriceItemView[],

    /* C. 我看到的价格 */
    observedPickerRange: [] as string[],
    observedIndex: 0,
    observedName: '',
    observedUnit: '',
    observedPriceInput: '',
    judgeView: null as Record<string, unknown> | null,

    /* D. 新手挑选指南 */
    guideCards: GUIDE_CARDS,

    /* F. 当季时令雷达 */
    seasonalItems: [] as SeasonalBaselineItem[],
    seasonalPicks: SEASONAL_PICKS,
    seasonalMonth: 1,
    seasonalTip: '',
    seasonalGroups: null as Record<string, unknown> | null
  },

  /** 全量记录（未按城市 / 渠道过滤） */
  _allRecords: [] as PriceRecord[],
  /** 当前过滤后的记录（判断价格时按 observedIndex 取用） */
  _filteredList: [] as PriceRecord[],
  /** 判断防抖计时器句柄 */
  _judgeTimer: 0 as number,

  onLoad(this: any): void {
    this.loadSeasonal();
    this.loadPrices();
  },

  /** 同步自定义 tabBar 选中态（菜场指南 = 1） */
  onShow(this: any): void {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  onUnload(this: any): void {
    clearTimeout(this._judgeTimer);
  },

  /** 装载季节基线数据（纯本地 JSON + 纯函数，不请求定位） */
  loadSeasonal(this: any): void {
    const items = (SEASONAL_FILE && SEASONAL_FILE.items) || [];
    const month = new Date().getMonth() + 1;
    this.setData({
      seasonalItems: items,
      seasonalMonth: month,
      seasonalTip: getSeasonalTip(),
      seasonalGroups: buildSeasonalGroups(items, month)
    });
  },

  /** 拉取参考价数据集（门面服务统一收口） */
  loadPrices(this: any): void {
    this.setData({ loading: true });
    getPriceDataset()
      .then((res: { file: PricesFile; grade: DataGrade }) => {
        this._allRecords = (res.file && res.file.records) || [];
        this.setData({ loading: false, gradeLabel: GRADE_NAME[res.grade] || '' });
        this.applyFilter();
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  /** 依据当前城市 / 渠道过滤并组装列表，同时重置判断表单 */
  applyFilter(this: any): void {
    const cityKey = this.data.cityKey as CityKey;
    const channel = this.data.channel as Channel;
    const cityCode = CITY_CODE[cityKey];
    const cityName = cityKey === 'national' ? '全国参考' : CITY_NAMES[cityKey];
    const channelName = CHANNEL_NAME[channel] || channel;

    const { list, note } = filterRecords(this._allRecords, cityCode, channel, cityName, channelName);
    const sorted = list.slice().sort((a, b) => {
      const rank = categoryRank(a.category) - categoryRank(b.category);
      if (rank !== 0) {
        return rank;
      }
      return a.productName.localeCompare(b.productName, 'zh');
    });

    this._filteredList = sorted;
    this.setData({
      filterNote: note,
      items: sorted.map(toItem),
      observedPickerRange: sorted.map((r) => r.productName),
      observedIndex: 0,
      observedName: sorted.length ? sorted[0].productName : '',
      observedUnit: sorted.length ? sorted[0].unit : '',
      observedPriceInput: '',
      judgeView: null
    });
  },

  /** 切换城市（仅存内存） */
  onCityTap(this: any, e: any): void {
    const key = e.currentTarget.dataset.key as CityKey;
    if (!key || key === this.data.cityKey) {
      return;
    }
    this.setData({ cityKey: key });
    this.applyFilter();
  },

  /** 切换渠道（仅存内存） */
  onChannelTap(this: any, e: any): void {
    const key = e.currentTarget.dataset.key as Channel;
    if (!key || key === this.data.channel) {
      return;
    }
    this.setData({ channel: key });
    this.applyFilter();
  },

  /** 参考价条目点击 → 详情页 */
  onItemOpen(this: any, e: any): void {
    const id = e.detail && e.detail.id;
    if (!id) {
      return;
    }
    wx.navigateTo({ url: `/pages/price-detail/index?id=${encodeURIComponent(id)}` });
  },

  /** 选择要判断的商品 */
  onObservedPick(this: any, e: any): void {
    const index = Number(e.detail.value);
    const rec = this._filteredList[index] || null;
    if (!rec) {
      return;
    }
    this.setData({
      observedIndex: index,
      observedName: rec.productName,
      observedUnit: rec.unit
    });
    this.scheduleJudge();
  },

  /** 价格输入：记录原值后防抖判断 */
  onPriceInput(this: any, e: any): void {
    this.setData({ observedPriceInput: e.detail.value });
    this.scheduleJudge();
  },

  /** 200ms 防抖后执行判断 */
  scheduleJudge(this: any): void {
    clearTimeout(this._judgeTimer);
    this._judgeTimer = setTimeout(() => this.runJudge(), JUDGE_DEBOUNCE_MS);
  },

  /** 调用 judgeObservedPrice 并按五档映射视觉 */
  runJudge(this: any): void {
    const rec = this._filteredList[this.data.observedIndex] || null;
    const raw = String(this.data.observedPriceInput || '').trim();
    if (!rec || raw === '') {
      this.setData({ judgeView: null });
      return;
    }
    const priceYuan = parseFloat(raw);
    const result = judgeObservedPrice({ priceYuan, unit: rec.unit, record: rec });
    const meta = JUDGE_META[result.level];
    this.setData({
      judgeView: {
        level: result.level,
        levelLabel: meta.label,
        symbol: meta.symbol,
        theme: meta.theme,
        basis: result.basis,
        disclaimer: result.disclaimer,
        confidenceLabel: CONFIDENCE_NAME[result.confidence] || ''
      }
    });
  }
});

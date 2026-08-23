/**
 * pages/market-guide/index.ts —— 「菜场指南」（TabBar 页）
 *
 * 职责：纯胶水层。负责城市（定位 + 手动选择）/ 渠道过滤、参考价列表组装、
 * 价格判断与静态内容装载。
 *
 * 数据流：
 * 1. onLoad → getPriceDataset() 取全量 records 与数据等级 grade；
 * 2. 城市选择 = 定位 + 手动两种方式：首次进入自动定位；用户手动选择后
 *    优先用户选择（不再自动定位），点「重新定位」可再次跟随定位；
 *    城市 / 渠道只存页面 data（内存态），严禁写 storage；
 * 3. applyFilter() 按「所选城市 + 所选渠道」过滤；无该渠道记录时放宽到
 *    该城市任意渠道并标注；城市无记录时展示空态（已移除全国参考的兜底回退）；
 *    过滤结果数据驱动按 category 分组（组内按品名排序），不硬编码品类；
 * 4. 「我看到的价格」经 200ms 防抖调用 judgeObservedPrice，结果按五档映射视觉。
 */

import { getPriceDataset } from '../../services/price-data-service';
import { judgeObservedPrice } from '../../services/judge';
import { splitSeasonalList, getSeasonalTip } from '../../services/seasonal';
import { SEASONAL_BASELINES } from '../../mock/seasonal-baselines';
import type { SeasonalBaselineItem } from '../../services/seasonal';
import { ACTIVE_PROVINCES, CITY_COORDS } from '../../config/regions';
import type { CityConfig } from '../../config/regions';
import type {
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

/** 定位匹配半径（km）：距最近有数据城市超过该距离视为「当前城市未接入」 */
const LOCATE_MATCH_RADIUS_KM = 150;

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

/** 数据等级 grade → 顶部徽标文案（remote_stale 为断更沿用，复用现有徽标弱化样式） */
const GRADE_NAME: Record<DataGrade, string> = {
  remote: '远程参考数据',
  remote_stale: '远程参考数据 · 沿用最近一期',
  local_baseline: '本地参考数据'
};

/** 9 大品类展示顺序（仅用于已知品类排序；数据中出现的新品类按首次出现顺序排在后面） */
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

/** 品类分组视图：每组一个分组标题 + 组内条目 */
interface CategoryGroupView {
  /** 稳定唯一键（品类名+组序号），供 wxml wx:key 使用，避免品类重名冲突 */
  key: string;
  /** 品类名（数据驱动，直接使用记录的 category，如 粮油/肉禽蛋/水产/蔬菜/水果/牛奶） */
  name: string;
  /** 组内条目数 */
  count: number;
  /** 组内条目（已按品名排序） */
  items: PriceItemView[];
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

/**
 * 品类排序权重：
 * - 已知品类（CATEGORY_ORDER 内）按表内下标排序；
 * - 未知品类（数据驱动新增，如福州源的 粮油/肉禽蛋/水产/牛奶）
 *   按其在当前数据中首次出现的顺序编号，统一排在已知品类之后，
 *   避免多个未知品类权重相同导致按品名交错、同品类不相邻。
 */
function categoryRank(category: string, unknownOrder: number): number {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx < 0 ? CATEGORY_ORDER.length + unknownOrder : idx;
}

/**
 * 过滤后记录 → 「先分桶再组内排序」：
 * 1. 用 Map 按 category 归拢（Map 保留品类在数据中首次出现的顺序）；
 * 2. 品类整体按「已知品类权重 → 未知品类首次出现编号」排序；
 * 3. 组内按品名（zh localeCompare）排序；
 * 4. 输出扁平有序列表（供商品选择器）与分组视图（含稳定唯一键）。
 */
function buildGroups(list: PriceRecord[]): { sorted: PriceRecord[]; groups: CategoryGroupView[] } {
  const buckets = new Map<string, PriceRecord[]>();
  for (const r of list) {
    const bucket = buckets.get(r.category);
    if (bucket) {
      bucket.push(r);
    } else {
      buckets.set(r.category, [r]);
    }
  }
  // buckets.keys() 即品类首次出现顺序，作为未知品类的编号依据
  const orderedCategories = Array.from(buckets.keys())
    .map((name, firstSeen) => ({ name, rank: categoryRank(name, firstSeen) }))
    .sort((a, b) => a.rank - b.rank)
    .map((e) => e.name);

  const sorted: PriceRecord[] = [];
  const groups: CategoryGroupView[] = [];
  orderedCategories.forEach((name, groupIdx) => {
    const recs = (buckets.get(name) || [])
      .slice()
      .sort((a, b) => a.productName.localeCompare(b.productName, 'zh'));
    sorted.push(...recs);
    groups.push({
      key: `${name}-${groupIdx + 1}`,
      name,
      count: recs.length,
      items: recs.map(toItem)
    });
  });
  return { sorted, groups };
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
 * 精确匹配 → 该城市任意渠道（标注）→ 空列表（空态由 wxml 展示）。
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
  return { list: [], note: '' };
}

/** 两点经纬度近似距离（km）：等距圆柱投影近似，城市尺度足够精确 */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** 定位坐标 → 最近的已启用城市（超出匹配半径返回 null） */
function matchCityByLocation(
  lat: number,
  lng: number
): { city: CityConfig; provinceIndex: number; cityIndex: number; distance: number } | null {
  let best: { city: CityConfig; provinceIndex: number; cityIndex: number; distance: number } | null = null;
  for (let p = 0; p < ACTIVE_PROVINCES.length; p += 1) {
    const province = ACTIVE_PROVINCES[p];
    for (let c = 0; c < province.cities.length; c += 1) {
      const city = province.cities[c];
      const coord = CITY_COORDS[city.cityCode];
      if (!coord) {
        continue;
      }
      const distance = distanceKm(lat, lng, coord.lat, coord.lng);
      if (!best || distance < best.distance) {
        best = { city, provinceIndex: p, cityIndex: c, distance };
      }
    }
  }
  if (!best || best.distance > LOCATE_MATCH_RADIUS_KM) {
    return null;
  }
  return best;
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
    /* A. 城市（省市两级 + 定位）与渠道（仅内存态） */
    provinces: ACTIVE_PROVINCES,
    provinceIndex: 0,
    cities: ACTIVE_PROVINCES.length ? ACTIVE_PROVINCES[0].cities : [],
    cityIndex: 0,
    /** 用户是否已手动选择城市（手动选择优先于定位） */
    userSelected: false,
    /** 定位中（按钮状态用） */
    locating: false,
    /** 定位结果提示（成功命中 / 未接入 / 失败） */
    locationHint: '',
    channelOptions: CHANNEL_OPTIONS,
    channel: 'market' as Channel,

    /* B. 今日参考价 */
    loading: true,
    gradeLabel: '',
    /** 断更沿用说明（数据服务透出，优先于徽标展示在顶部数据说明行，弱化字色） */
    carryNote: '',
    filterNote: '',
    groups: [] as CategoryGroupView[],

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
    // 首次进入自动定位（用户尚未手动选择）；定位结果仅用于匹配城市，不上传不保存
    this.locate(false);
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

  /** 拉取参考价数据集（门面服务统一收口；沿用分支附 carryNote） */
  loadPrices(this: any): void {
    this.setData({ loading: true });
    getPriceDataset()
      .then((res: { file: PricesFile; grade: DataGrade; carryNote?: string }) => {
        this._allRecords = (res.file && res.file.records) || [];
        this.setData({
          loading: false,
          gradeLabel: GRADE_NAME[res.grade] || '',
          carryNote: res.carryNote || ''
        });
        this.applyFilter();
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  /** 依据当前城市 / 渠道过滤并组装列表，同时重置判断表单 */
  applyFilter(this: any): void {
    const province = ACTIVE_PROVINCES[this.data.provinceIndex as number];
    const city: CityConfig | null =
      (province && province.cities[this.data.cityIndex as number]) || null;
    const channel = this.data.channel as Channel;
    const channelName = CHANNEL_NAME[channel] || channel;

    const filtered = city
      ? filterRecords(this._allRecords, city.cityCode, channel, city.name, channelName)
      : { list: [] as PriceRecord[], note: '' };
    // 先分桶再组内排序：同品类必然成组，不依赖「与上一条同品类」的脆弱合并
    const { sorted, groups } = buildGroups(filtered.list);

    this._filteredList = sorted;
    this.setData({
      filterNote: filtered.note,
      groups,
      observedPickerRange: sorted.map((r) => r.productName),
      observedIndex: 0,
      observedName: sorted.length ? sorted[0].productName : '',
      observedUnit: sorted.length ? sorted[0].unit : '',
      observedPriceInput: '',
      judgeView: null
    });
  },

  /** 切换省：城市重置为该省第一个可用城市（手动选择优先于定位） */
  onProvinceChange(this: any, e: any): void {
    const provinceIndex = Number(e.detail.value);
    const province = ACTIVE_PROVINCES[provinceIndex];
    if (!province || provinceIndex === this.data.provinceIndex) {
      return;
    }
    this.setData({
      provinceIndex,
      cities: province.cities,
      cityIndex: 0,
      userSelected: true,
      locationHint: ''
    });
    this.applyFilter();
  },

  /** 切换市（手动选择优先于定位） */
  onCityChange(this: any, e: any): void {
    const cityIndex = Number(e.detail.value);
    if (cityIndex === this.data.cityIndex) {
      return;
    }
    this.setData({ cityIndex, userSelected: true, locationHint: '' });
    this.applyFilter();
  },

  /** 重新定位：用户主动点击表示再次跟随定位，清除手动选择标记 */
  onRelocate(this: any): void {
    if (this.data.locating) {
      return;
    }
    this.locate(false);
  },

  /**
   * 获取定位并匹配最近的已启用城市。
   * 隐私约束：经纬度仅在本地用于城市匹配，不上传、不写 storage、不上报。
   * @param retried 是否已经隐私协议授权后重试（防止无限递归）
   */
  locate(this: any, retried: boolean): void {
    this.setData({ locating: true, locationHint: '' });
    wx.getLocation({
      type: 'wgs84',
      success: (res: any) => {
        const match = matchCityByLocation(res.latitude, res.longitude);
        if (match) {
          this.setData({
            locating: false,
            userSelected: false,
            provinceIndex: match.provinceIndex,
            cities: ACTIVE_PROVINCES[match.provinceIndex].cities,
            cityIndex: match.cityIndex,
            locationHint: `已定位：${match.city.name}`
          });
          this.applyFilter();
          return;
        }
        this.setData({
          locating: false,
          locationHint: '你所在的城市暂未接入参考数据，请手动选择城市'
        });
      },
      fail: (err: any) => {
        const errMsg = (err && err.errMsg) || '';
        // 详细失败原因仅输出到控制台供开发排查，页面对用户只展示简短提示
        console.warn('[定位] getLocation 失败：', errMsg);
        // 未同意隐私协议（基础库 2.32.3+ 强制）：弹出官方授权弹窗，同意后重新定位
        if (!retried && errMsg.indexOf('privacy') >= 0 && typeof wx.requirePrivacyAuthorize === 'function') {
          wx.requirePrivacyAuthorize({
            success: () => {
              this.locate(true);
            },
            fail: () => {
              this.setData({ locating: false, locationHint: '定位失败，请手动选择城市' });
            }
          });
          return;
        }
        this.setData({ locating: false, locationHint: '定位失败，请手动选择城市' });
        // 曾被拒绝授权时引导去设置页开启（仅提示，不强制）
        wx.getSetting({
          success: (s: any) => {
            if (s.authSetting && s.authSetting['scope.userLocation'] === false) {
              wx.showModal({
                title: '需要定位权限',
                content: '定位仅用于匹配你所在的城市，不上传不保存。请在设置中开启位置权限后，再点「重新定位」。',
                confirmText: '去设置',
                success: (r: any) => {
                  if (r.confirm) {
                    wx.openSetting();
                  }
                }
              });
            }
          }
        });
      }
    });
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

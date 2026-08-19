/**
 * components/seasonal-radar/index.ts —— 当季时令雷达（展示组件）
 *
 * 数据来自 mock/seasonal-baselines.json（页面 require 后传入 items）。
 * 月份命中规则与 services/seasonal.ts 一致：month ∈ item.months → 当季点亮，
 * 其余月份为暖灰；当前月份加竖线标记。选中品类可横滑切换。
 * 下方三组（当季优选 / 平稳供应 / 反季或供应偏少）由页面用
 * splitSeasonalList 预计算后经 groups 传入，组件只负责渲染。
 * 组件本身不请求定位、不写任何 storage。
 */

import type { SeasonalBaselineItem } from '../../services/seasonal';

/** 单个月份圆点的视图数据 */
interface MonthDot {
  m: number;
  active: boolean;
  isNow: boolean;
}

Component({
  properties: {
    /** 季节经验基线条目全集（与 JSON items 一致） */
    items: {
      type: Array,
      value: []
    },
    /** 可横滑选择的常见品类名列表 */
    picks: {
      type: Array,
      value: []
    },
    /** 当前月份 1-12 */
    month: {
      type: Number,
      value: 1
    },
    /** 固定时令提示文案（getSeasonalTip 返回） */
    tip: {
      type: String,
      value: ''
    },
    /**
     * 三组拆分结果（页面预计算）：
     * { best:[{name}], bestMore:number, stable:[...], stableMore, offSeason:[...], offSeasonMore }
     */
    groups: {
      type: Object,
      value: null
    }
  },

  data: {
    selectedIndex: 0,
    selectedName: '',
    dots: [] as MonthDot[]
  },

  observers: {
    /** 数据或选中项变化时重算 12 个月圆点 */
    'items, picks, month, selectedIndex'(this: any): void {
      this.rebuild();
    }
  },

  lifetimes: {
    attached(this: any): void {
      this.rebuild();
    }
  },

  methods: {
    /** 横滑品类点击：切换选中项 */
    onPick(this: any, e: any): void {
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isFinite(index) || index === this.data.selectedIndex) {
        return;
      }
      wx.vibrateShort({ type: 'light' });
      this.setData({ selectedIndex: index });
    },

    /** 依据选中品类重建 12 个月圆点 */
    rebuild(this: any): void {
      const picks = (this.data.picks as string[]) || [];
      const items = (this.data.items as SeasonalBaselineItem[]) || [];
      const month = this.data.month as number;
      const selectedIndex = this.data.selectedIndex as number;

      const name = picks[selectedIndex] || '';
      let target: SeasonalBaselineItem | null = null;
      for (const it of items) {
        if (it.productName === name) {
          target = it;
          break;
        }
      }
      const months = target && Array.isArray(target.months) ? target.months : [];

      const dots: MonthDot[] = [];
      for (let m = 1; m <= 12; m += 1) {
        dots.push({
          m,
          active: months.indexOf(m) >= 0,
          isNow: m === month
        });
      }
      this.setData({ dots, selectedName: name });
    }
  }
});

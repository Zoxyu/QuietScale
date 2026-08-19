/**
 * components/price-item/index.ts —— 参考价条目（展示组件）
 *
 * 接收页面组装好的单条参考价视图数据（item），负责排版与点击上抛。
 * item 字段由页面胶水层预计算：品名 / 规格 / 区间 / 中位价 / 单位 /
 * 渠道中文名 / 更新标签 / 数据等级中文 / 置信度中文 / muted（弱化态）/
 * isWholesale（批发条目）。
 */

/** 参考价条目视图数据 */
export interface PriceItemView {
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

Component({
  properties: {
    /** 页面组装的单条参考价视图数据 */
    item: {
      type: Object,
      value: null
    }
  },

  methods: {
    /** 点击条目：轻触反馈后上抛记录 id，由页面跳转详情 */
    onTap(this: any): void {
      const item = this.data.item as PriceItemView | null;
      if (!item || !item.id) {
        return;
      }
      wx.vibrateShort({ type: 'light' });
      this.triggerEvent('open', { id: item.id });
    }
  }
});

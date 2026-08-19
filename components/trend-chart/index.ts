/**
 * components/trend-chart/index.ts —— 近 7 日趋势柱状图（纯 WXML/WXSS）
 *
 * 接收 trend7d 数值数组与单位，归一为百分比柱高；最低柱豆绿、最高柱浅杏。
 * 生长动画：先置低柱高，下一帧写入目标高度，由 CSS transition 完成生长，
 * 每根柱用 transition-delay 错落进场。禁用 canvas 与 wx.createAnimation。
 */

/** 运行时全局定时器的本地声明（lib ES2017 未含 DOM 定时器类型） */
declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): number;
declare function clearTimeout(handle?: number): void;

/** 柱高归一下限 / 上限（%），保证最低柱也可见 */
const MIN_PCT = 26;
const MAX_PCT = 100;

/** 数值 → 1 位小数展示串（末尾 .0 不保留） */
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** 单根柱的视图数据 */
interface BarView {
  text: string;
  pct: number;
  cls: string;
  day: string;
  delay: number;
}

Component({
  properties: {
    /** 近 7 日数值（元） */
    values: {
      type: Array,
      value: []
    },
    /** 计价单位描述，如 "元/斤" */
    unit: {
      type: String,
      value: ''
    }
  },

  data: {
    bars: [] as BarView[],
    grown: false,
    showLegend: false,
    minText: '',
    maxText: ''
  },

  observers: {
    /** 数值变化：重建柱形并重新播放生长动画 */
    values(this: any, values: number[]): void {
      this.build(values || []);
    }
  },

  lifetimes: {
    attached(this: any): void {
      this._growTimer = 0;
      this.build((this.data.values as number[]) || []);
    },
    detached(this: any): void {
      clearTimeout(this._growTimer);
    }
  },

  methods: {
    /** 归一柱高并安排生长动画 */
    build(this: any, values: number[]): void {
      const vals = (values || []).filter((v) => Number.isFinite(v));
      if (!vals.length) {
        this.setData({ bars: [], showLegend: false, grown: false });
        return;
      }
      const min = Math.min.apply(null, vals);
      const max = Math.max.apply(null, vals);
      const range = max - min;
      const minIdx = range > 0 ? vals.indexOf(min) : -1;
      const maxIdx = range > 0 ? vals.indexOf(max) : -1;

      const bars: BarView[] = vals.map((v, i) => ({
        text: fmt(v),
        pct: range > 0 ? MIN_PCT + ((v - min) / range) * (MAX_PCT - MIN_PCT) : 62,
        cls: i === minIdx ? 'bar-low' : i === maxIdx ? 'bar-high' : 'bar-mid',
        day: i === vals.length - 1 ? '今日' : `前${vals.length - 1 - i}`,
        delay: i * 60
      }));

      this.setData({
        bars,
        showLegend: range > 0,
        minText: `${fmt(min)} ${this.data.unit}`,
        maxText: `${fmt(max)} ${this.data.unit}`,
        grown: false
      });

      // 下一帧再写入目标高度，触发 CSS transition 生长
      clearTimeout(this._growTimer);
      this._growTimer = setTimeout(() => {
        this.setData({ grown: true });
      }, 40);
    }
  }
});

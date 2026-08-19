/**
 * components/result-card/index.ts —— 实时结果卡（展示组件）
 *
 * 接收页面组装好的 spec（纯数据）与 tick（结果序号，用于入场动画重放）。
 * 数字滚动：对差额、百分比、两侧主口径单价做 ≤16 帧 easeOutCubic 缓动，
 * 每帧只 setData 单字段路径；任何异常直接赋目标值兜底。
 */

import { formatYuan } from '../../utils/money';

/** 运行时全局定时器的本地声明（lib ES2017 未含 DOM 定时器类型） */
declare function setInterval(handler: (...args: unknown[]) => void, timeout?: number): number;
declare function clearInterval(handle?: number): void;

/** 缓动帧数（≤16）与帧间隔（毫秒） */
const ANIM_FRAMES = 16;
const ANIM_FRAME_MS = 16;

/** easeOutCubic：起步快、收尾缓 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 整数分 → 元展示串（2 位小数） */
function fenText(fen: number): string {
  return formatYuan(Math.round(fen), 2);
}

/** 百分比数值 → 展示串（1 位小数） */
function percentText(percent: number): string {
  return `${(Math.round(percent * 10) / 10).toFixed(1)}%`;
}

Component({
  properties: {
    /** 页面组装的结果展示结构 */
    spec: {
      type: Object,
      value: null
    },
    /** 结果序号：每次新结果 +1，驱动入场动画重放 */
    tick: {
      type: Number,
      value: 0
    }
  },

  data: {
    showDiff: false,
    headline: '',
    stdLabel: '',
    diffUnit: '',
    diffText: '0.00',
    percentText: '0.0%',
    sides: [] as Array<Record<string, unknown>>,
    details: [] as string[],
    notice: '',
    showPerUse: false,
    perUse: null as Record<string, string> | null
  },

  observers: {
    /** spec 变化：同步静态文案并重跑数字滚动 */
    spec(this: any, spec: Record<string, unknown> | null): void {
      if (!spec) {
        return;
      }
      this.setData({
        showDiff: spec.showDiff,
        headline: spec.headline,
        stdLabel: spec.stdLabel,
        diffUnit: spec.diffUnit,
        sides: spec.sides,
        details: spec.details,
        notice: spec.notice,
        showPerUse: spec.showPerUse,
        perUse: spec.perUse
      });
      this.runNumbers(spec);
    }
  },

  lifetimes: {
    attached(this: any): void {
      this._anims = {};
    },
    detached(this: any): void {
      this.stopNumbers();
    }
  },

  methods: {
    /** 停止所有进行中的数字滚动 */
    stopNumbers(this: any): void {
      const anims = this._anims || {};
      Object.keys(anims).forEach((key) => {
        clearInterval(anims[key]);
      });
      this._anims = {};
    },

    /** 单字段缓动：每帧只 setData 一个路径，失败兜底直接赋值 */
    tween(this: any, path: string, from: number, to: number, format: (v: number) => string): void {
      try {
        if (this._anims && this._anims[path]) {
          clearInterval(this._anims[path]);
        }
        if (from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
          this.setData({ [path]: format(to) });
          return;
        }
        let frame = 0;
        const timer = setInterval(() => {
          frame += 1;
          const progress = easeOutCubic(frame / ANIM_FRAMES);
          const value = from + (to - from) * progress;
          try {
            this.setData({ [path]: format(frame >= ANIM_FRAMES ? to : value) });
          } catch (e) {
            clearInterval(timer);
          }
          if (frame >= ANIM_FRAMES) {
            clearInterval(timer);
            if (this._anims) {
              delete this._anims[path];
            }
          }
        }, ANIM_FRAME_MS);
        if (!this._anims) {
          this._anims = {};
        }
        this._anims[path] = timer;
      } catch (e) {
        // 兜底：任何异常直接赋目标值
        this.setData({ [path]: format(to) });
      }
    },

    /** 依据新 spec 滚动：差额、百分比、两侧主口径单价 */
    runNumbers(this: any, spec: Record<string, unknown>): void {
      try {
        const prev = this._targets || {};
        const sides = (spec.sides || []) as Array<{ priceFen: number }>;
        const targets = {
          diffText: (spec.diffFen as number) || 0,
          percentText: (spec.percent as number) || 0,
          priceA: sides[0] ? sides[0].priceFen : 0,
          priceB: sides[1] ? sides[1].priceFen : 0
        };
        this.tween('diffText', prev.diffText || 0, targets.diffText, fenText);
        this.tween('percentText', prev.percentText || 0, targets.percentText, percentText);
        this.tween('sides[0].price', prev.priceA || 0, targets.priceA, fenText);
        this.tween('sides[1].price', prev.priceB || 0, targets.priceB, fenText);
        this._targets = targets;
      } catch (e) {
        // 兜底：直接用目标值填充
        const sides = (spec.sides || []) as Array<{ priceFen: number }>;
        this.setData({
          diffText: fenText((spec.diffFen as number) || 0),
          percentText: percentText((spec.percent as number) || 0),
          'sides[0].price': fenText(sides[0] ? sides[0].priceFen : 0),
          'sides[1].price': fenText(sides[1] ? sides[1].priceFen : 0)
        });
      }
    },

    /** 轻触反馈 */
    onTap(): void {
      wx.vibrateShort({ type: 'light' });
    }
  }
});

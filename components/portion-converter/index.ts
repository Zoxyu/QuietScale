/**
 * components/portion-converter/index.ts —— 份量与重量换算器
 *
 * 直接复用 services/portion.ts 的纯函数与常量：
 * - WEIGHT_REFERENCE：市制重量速查表（1 两=50g 等）；
 * - PORTION_EXAMPLES：常见食材购买量经验示例（各带免责）；
 * - gramsToJinLiang：克数 → 友好中文市制表述。
 * 输入克数做 200ms 防抖后换算。组件不写任何 storage。
 */

import { WEIGHT_REFERENCE, PORTION_EXAMPLES, gramsToJinLiang } from '../../services/portion';

/** 运行时全局定时器的本地声明（lib ES2017 未含 DOM 定时器类型） */
declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): number;
declare function clearTimeout(handle?: number): void;

/** 输入防抖间隔（毫秒） */
const DEBOUNCE_MS = 200;

Component({
  data: {
    /** 市制重量速查表 */
    weightList: WEIGHT_REFERENCE,
    /** 常见食材购买量示例 */
    examples: PORTION_EXAMPLES,
    /** 用户输入的克数原始字符串 */
    gramsInput: '',
    /** 换算结果文案 */
    resultText: '',
    /** 是否有有效结果（控制展示态） */
    hasResult: false
  },

  lifetimes: {
    attached(this: any): void {
      this._timer = 0;
    },
    detached(this: any): void {
      clearTimeout(this._timer);
    }
  },

  methods: {
    /** 克数输入：200ms 防抖后换算 */
    onInput(this: any, e: any): void {
      const value = e.detail.value;
      this.setData({ gramsInput: value });
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.convert(value), DEBOUNCE_MS);
    },

    /** 解析克数并调用 gramsToJinLiang；非法输入清空结果 */
    convert(this: any, raw: string): void {
      const grams = parseFloat(raw);
      if (!Number.isFinite(grams) || grams <= 0) {
        this.setData({ resultText: '', hasResult: false });
        return;
      }
      this.setData({ resultText: gramsToJinLiang(grams), hasResult: true });
    },

    /** 点击速查表任一行：回填到输入框并立即换算 */
    onQuick(this: any, e: any): void {
      const grams = Number(e.currentTarget.dataset.grams);
      if (!Number.isFinite(grams) || grams <= 0) {
        return;
      }
      wx.vibrateShort({ type: 'light' });
      clearTimeout(this._timer);
      this.setData({ gramsInput: String(grams) });
      this.convert(String(grams));
    }
  }
});

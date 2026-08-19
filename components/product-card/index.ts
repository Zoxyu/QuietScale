/**
 * components/product-card/index.ts —— 单边商品输入卡（受控组件）
 *
 * 所有输入经 triggerEvent('change', { side, patch }) 上抛页面；
 * 聚焦状态经 triggerEvent('edit', { side, editing }) 上抛；
 * 组件自身不做任何计算，只维护 picker 下标等展示态。
 */

import { standardUnitsFor, unitLabel, unitKind } from '../../utils/units';
import type { CategoryId, PromotionType, UnitCode } from '../../types/models';

/** 优惠方式选项（不含 none；关闭优惠开关即代表 none） */
const PROMO_TYPES: Array<{ type: PromotionType; label: string }> = [
  { type: 'instant-off', label: '立减金额' },
  { type: 'coupon', label: '优惠券' },
  { type: 'final-pay', label: '满减后实付价' },
  { type: 'second-item-discount', label: '第二件折扣' },
  { type: 'bundle-n-for-x', label: '买N件共X元' }
];

/** 优惠类型 → picker 下标（none 时落回 0） */
function promoIndexOf(type: PromotionType): number {
  const index = PROMO_TYPES.findIndex((item) => item.type === type);
  return index < 0 ? 0 : index;
}

Component({
  properties: {
    /** 单边输入数据（ProductInput） */
    value: {
      type: Object,
      value: null
    },
    /** 所属侧：'A' | 'B' */
    side: {
      type: String,
      value: 'A'
    },
    /** 当前分类 */
    category: {
      type: String,
      value: 'weight'
    },
    /** 是否处于编辑（聚焦）态：卡片抬升 */
    editing: {
      type: Boolean,
      value: false
    }
  },

  data: {
    promoTypes: PROMO_TYPES,
    unitOptions: [] as Array<{ code: UnitCode; label: string }>,
    giftUnitOptions: [] as Array<{ code: UnitCode; label: string }>,
    unitIndex: 0,
    giftUnitIndex: 0,
    perUseUnitIndex: 0,
    promoIndex: 0
  },

  observers: {
    /** 输入或分类变化时，同步各 picker 下标与单位选项 */
    'value, category'(this: any): void {
      this.syncOptions();
    }
  },

  lifetimes: {
    attached(this: any): void {
      this.syncOptions();
    }
  },

  methods: {
    /** 重建单位选项与所有 picker 下标 */
    syncOptions(this: any): void {
      const value = this.data.value;
      if (!value) {
        return;
      }
      const category = this.data.category as CategoryId;
      const codes = standardUnitsFor(category);
      const unitOptions = codes.map((code) => ({ code, label: unitLabel(code) }));

      // 赠品/每次用量单位：与主规格同维度的单位集合
      const kind = unitKind(value.unitCode as UnitCode);
      const sameKind = (['kg', 'g', 'jin', 'liang', 'L', 'ml', 'piece'] as UnitCode[]).filter(
        (code) => unitKind(code) === kind
      );
      const giftUnitOptions = sameKind.map((code) => ({ code, label: unitLabel(code) }));

      const indexOf = (list: Array<{ code: UnitCode }>, code: UnitCode): number => {
        const index = list.findIndex((item) => item.code === code);
        return index < 0 ? 0 : index;
      };

      this.setData({
        unitOptions,
        giftUnitOptions,
        unitIndex: indexOf(unitOptions, value.unitCode),
        giftUnitIndex: indexOf(giftUnitOptions, value.giftUnitCode),
        perUseUnitIndex: indexOf(giftUnitOptions, value.unitCode),
        promoIndex: promoIndexOf(value.promoType)
      });
    },

    /** 文本输入：字段名取自 data-field，原样字符串上抛 */
    onInput(this: any, e: any): void {
      const field = e.currentTarget.dataset.field as string;
      this.triggerEvent('change', { side: this.data.side, patch: { [field]: e.detail.value } });
    },

    /** 数字输入转数值上抛（第二件折扣率 / 买N件数） */
    onNumInput(this: any, e: any): void {
      const field = e.currentTarget.dataset.field as string;
      const num = Number(e.detail.value);
      this.triggerEvent('change', {
        side: this.data.side,
        patch: { [field]: Number.isFinite(num) ? num : 0 }
      });
    },

    /** 主规格单位选择 */
    onUnitChange(this: any, e: any): void {
      const index = Number(e.detail.value);
      const option = (this.data.unitOptions as Array<{ code: UnitCode }>)[index];
      if (!option) {
        return;
      }
      this.setData({ unitIndex: index });
      this.triggerEvent('change', { side: this.data.side, patch: { unitCode: option.code } });
    },

    /** 赠品单位选择 */
    onGiftUnitChange(this: any, e: any): void {
      const index = Number(e.detail.value);
      const option = (this.data.giftUnitOptions as Array<{ code: UnitCode }>)[index];
      if (!option) {
        return;
      }
      this.setData({ giftUnitIndex: index });
      this.triggerEvent('change', { side: this.data.side, patch: { giftUnitCode: option.code } });
    },

    /** 优惠方式选择 */
    onPromoTypeChange(this: any, e: any): void {
      const index = Number(e.detail.value);
      const option = PROMO_TYPES[index];
      if (!option) {
        return;
      }
      this.setData({ promoIndex: index });
      this.triggerEvent('change', { side: this.data.side, patch: { promoType: option.type } });
    },

    /** 第二件折扣率输入：用户按「折」输入（5 折 → 5），换算为 0.5 上抛 */
    onRateInput(this: any, e: any): void {
      const zhe = Number(e.detail.value);
      const rate = Number.isFinite(zhe) ? zhe / 10 : 0;
      this.triggerEvent('change', { side: this.data.side, patch: { secondItemRate: rate } });
    },

    /** 赠品 / 优惠开关切换；开启优惠且类型为 none 时默认落回立减 */
    onSwitch(this: any, e: any): void {
      const field = e.currentTarget.dataset.field as string;
      const on = Boolean(e.detail.value);
      const patch: Record<string, unknown> = { [field]: on };
      if (field === 'promoEnabled' && on && this.data.value.promoType === 'none') {
        patch.promoType = 'instant-off';
      }
      this.triggerEvent('change', { side: this.data.side, patch });
    },

    /** 聚焦 / 失焦：上抛编辑态 */
    onFocus(this: any): void {
      this.triggerEvent('edit', { side: this.data.side, editing: true });
    },
    onBlur(this: any): void {
      this.triggerEvent('edit', { side: this.data.side, editing: false });
    }
  }
});

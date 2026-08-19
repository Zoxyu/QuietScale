/**
 * pages/mine/index.ts —— 「我的」
 *
 * 纯静态页面：产品理念、数据说明、隐私说明、品牌文案与版本号。
 * 无网络请求、无 storage、无 setData；所有文案在 data 中一次定义。
 */

import { APP_CONFIG } from '../../config/app.config';

Page({
  data: {
    appName: APP_CONFIG.appName,
    version: APP_CONFIG.version,

    /** 产品理念 */
    motto: '不替你决定买什么，只帮你看清单价。',

    /** 数据说明条目 */
    dataNotes: [
      {
        key: '数据来源',
        text: '公开部门参考价、市场监测、批发价折算与人工整理的季节基准，四类来源均标注数据等级与置信度。'
      },
      {
        key: '零售与批发',
        text: '批发价通常低于零售终端。标注「批发参考」的条目不能直接等同于菜市场或商超零售价，仅供方向参考。'
      },
      {
        key: '更新时间',
        text: '每条参考价标注数据日期（如「2026-08-18 更新」），价格区间按近 7 日样本整理。'
      },
      {
        key: '估算说明',
        text: '标注「估算参考」的条目根据近期批发价格与渠道加价系数估算，仅供参考。'
      }
    ],

    /** 隐私说明条目 */
    privacyNotes: [
      '不需要登录，也没有账号体系。',
      '不采集你的个人购买记录。',
      '你输入的价格只在当前页面用于即时对比，不会被保存或上传。',
      '公共参考价缓存每天最多更新一次，且不强制保留在本地。'
    ],

    /** 品牌文案（50 字内） */
    aboutText: '一杆秤，一把菜，一份明白的价钱。愿你在寻常烟火里，买得从容，吃得安心。'
  },

  /** 同步自定义 tabBar 选中态（我的 = 2） */
  onShow(this: any): void {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  }
});

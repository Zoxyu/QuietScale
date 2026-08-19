/**
 * custom-tab-bar/index.ts —— 自定义底部导航（悬浮胶囊式）
 *
 * 设计目标：
 * 1. 适配多机型：flex 等宽三等分 + rpx 单位 + env(safe-area-inset-bottom)
 *    安全区适配，任何屏宽 / 全面屏手势条机型下均不偏移、不遮挡；
 * 2. 选中态：图标与文字变墨绿，文字下方胶囊指示器淡入缩放；
 * 3. 零资源：图标全部用纯 CSS 线条绘制，无图片、无字体依赖。
 *
 * 选中态同步：各 Tab 页 onShow 中调用 this.getTabBar().setData({ selected: n })。
 */

Component({
  data: {
    /** 当前选中下标（0 比一比 / 1 菜场指南 / 2 我的） */
    selected: 0,
    /** 与 app.json tabBar.list 保持一致的导航项 */
    list: [
      { pagePath: '/pages/compare/index', text: '比一比' },
      { pagePath: '/pages/market-guide/index', text: '菜场指南' },
      { pagePath: '/pages/mine/index', text: '我的' }
    ]
  },

  methods: {
    /** 点击导航项：切换 Tab（重复点击当前项不重复跳转） */
    onTap(this: any, e: any): void {
      const index = Number(e.currentTarget.dataset.index);
      if (index === this.data.selected) {
        return;
      }
      const path = (this.data.list[index] as { pagePath: string }).pagePath;
      wx.switchTab({ url: path });
    }
  }
});

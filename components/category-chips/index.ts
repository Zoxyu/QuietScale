/**
 * components/category-chips/index.ts —— 分类 chips（受控组件）
 * 横排可滚动，选中态墨绿底白字；点击经 change 事件上抛，自身不改选中态。
 */

Component({
  options: {
    multipleSlots: false
  },

  properties: {
    /** 分类列表：[{ id: CategoryId, name: string }] */
    categories: {
      type: Array,
      value: []
    },
    /** 当前选中的分类 id */
    activeId: {
      type: String,
      value: ''
    }
  },

  data: {
    activeIndex: 0
  },

  observers: {
    /** activeId 变化时同步选中下标 */
    activeId(this: any, id: string) {
      const list = (this.data.categories as Array<{ id: string }>) || [];
      const index = list.findIndex((item) => item.id === id);
      this.setData({ activeIndex: index < 0 ? 0 : index });
    }
  },

  methods: {
    /** 点击 chip：与当前选中不同才上抛 */
    onTap(this: any, e: any): void {
      const index = Number(e.currentTarget.dataset.index);
      const list = (this.data.categories as Array<{ id: string; name: string }>) || [];
      const item = list[index];
      if (!item || index === this.data.activeIndex) {
        return;
      }
      this.triggerEvent('change', { id: item.id, name: item.name });
    }
  }
});

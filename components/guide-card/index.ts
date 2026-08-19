/**
 * components/guide-card/index.ts —— 新手挑选指南折叠卡
 *
 * 接收单条指南内容（看 / 避 / 买 / 提示，其中避、买、提示可缺省）。
 * 展开收起由内部 open 状态驱动，动画走 CSS max-height + transform transition，
 * 箭头随展开态旋转。
 */

Component({
  properties: {
    /** 序号（从 1 开始，仅展示用） */
    no: {
      type: Number,
      value: 1
    },
    /** 主题名，如 "叶菜" */
    title: {
      type: String,
      value: ''
    },
    /** 看什么 */
    look: {
      type: String,
      value: ''
    },
    /** 避什么（可缺省） */
    avoid: {
      type: String,
      value: ''
    },
    /** 怎么买更合适（可缺省） */
    buy: {
      type: String,
      value: ''
    },
    /** 补充提示（可缺省，与避/买并存） */
    tip: {
      type: String,
      value: ''
    }
  },

  data: {
    open: false
  },

  methods: {
    /** 切换展开/收起 */
    onToggle(this: any): void {
      this.setData({ open: !this.data.open });
    }
  }
});

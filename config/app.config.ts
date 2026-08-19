/**
 * config/app.config.ts —— 应用级配置常量
 * 页面与服务层统一从这里读取，禁止散落魔法数字。
 */
export const APP_CONFIG = {
  /** 应用中文名 */
  appName: '一秤清欢',
  /** 应用英文名 */
  appNameEn: 'QuietScale',
  /** 当前版本号 */
  version: '0.1.0',

  /**
   * 是否使用本地 mock 参考价数据。
   * true：读取 mock 数据（当前阶段）；false：从 REMOTE_PRICES_URL 拉取。
   */
  USE_MOCK: true,

  /**
   * 远程参考价数据文件地址（占位）。
   * 替换方式：部署静态 JSON 文件后，把该字符串改为真实 HTTPS 地址，
   * 并将 USE_MOCK 置为 false；地址需在微信公众平台 request 合法域名中配置。
   */
  REMOTE_PRICES_URL: 'https://example.com/quiet-scale/prices.json',

  /** 远程数据拉取超时（毫秒） */
  FETCH_TIMEOUT_MS: 8000,

  /** 结果卡片入场动画时长（毫秒） */
  RESULT_ANIMATION_MS: 220,

  /** A/B 交换动画时长（毫秒） */
  SWAP_ANIMATION_MS: 300,

  /** 「差距很小」阈值：差价百分比小于 2% 视为接近 */
  CLOSE_GAP_THRESHOLD: 0.02
};

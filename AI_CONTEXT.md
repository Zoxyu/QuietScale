# AI_CONTEXT.md

> 本文件是本项目所有 AI Coding Agent 共用的持久化项目上下文。
>
> This file is the shared persistent project context for all AI coding agents.
>
> 本文件应适用于不同的 AI Agent、Coding 软件、账号、Session 和设备。
>
> This file is intended to work across different AI agents, coding tools, accounts, sessions, and devices.
>
> 本文件只记录对未来 Agent 有长期价值的信息。
>
> Record only information that is likely to be useful to future agents.
>
> 不记录完整聊天记录，也不记录临时推理过程。
>
> Do not store conversation transcripts or temporary reasoning.
>
> 请保持本文件简洁、准确，并始终反映项目当前的有效状态。
>
> Keep this file concise, accurate, and representative of the current project state.

> 最近一次全面盘点日期：2026-08-26（按仓库实际代码盘点，与本文件冲突时以代码为准）。


---

# 1. 项目概览 / Project Overview

## 项目用途 / Purpose

「一秤清欢」（QuietScale）是一个**原生微信小程序**菜场比价工具，口号「买菜之前，先算清楚」。三大功能：

- **比一比**：两个商品按不同规格、不同优惠一键比出谁更划算，精确到每 100g / 每斤 / 每两的单价；
- **菜场指南**：按城市与渠道查看近期参考价区间（low / median / high、p25 / p75 / p90），含「我看到的价格」五档判断、新手挑选指南、份量换算、当季时令雷达；
- **价格详情**：单条参考价的完整信息、近 7 日趋势与来源说明。

产品定位：**公共参考价工具**——不登录、不采集用户数据、不做交易，只做克制的价格参考与计算。许可证：CC BY-NC-SA 4.0（非商业，见 `LICENSE`）。


## 当前阶段 / Current Stage

开发阶段（可演示的最小可用版本）：版本 0.1.0；小程序端已切换远端数据（`USE_MOCK=false`），福州官方数据源已接入并每日由 CI 生成，其余城市与官方源仍为待接入/占位状态。


## 技术栈 / Technology Stack

- 主要语言：TypeScript（strict）
- 前端框架：微信小程序原生框架（WXML/WXSS + 自定义组件），无 npm 运行时依赖
- Runtime：微信基础库（libVersion 3.17.1）；Node 24（脚本与测试，原生 type stripping 直跑 TS）
- 数据库：无（用户输入只存页面内存；本地仅缓存公共参考价数据）
- 基础设施：GitHub Actions（每日数据生成）+ GitHub Pages（dist/ 静态托管，`REMOTE_PRICES_URL` 指向 `https://zoxyu.github.io/QuietScale/dist/prices.json`）
- 其他：零第三方依赖原则——小程序侧无 npm 包；`scripts/`、`tests/` 只依赖 Node 内置模块；本地 mock 数据用 **TS 模块**（`mock/prices.ts`、`mock/seasonal-baselines.ts`）而非 JSON（原生小程序运行时无法读取代码包内 JSON；`mock/markups.json` 仅供管线脚本读取）


---

# 2. 项目架构 / Architecture

## 整体架构 / High-Level Architecture

三层 + 一条数据管线：

1. **页面/组件层（胶水层）**：`pages/` 四个页面只做事件转发、setData、组装视图；展示组件在 `components/`。
2. **服务层（纯函数）**：`services/` 的 compare / judge / wholesale / seasonal / portion 均为零 wx 依赖的纯函数，可被 `node --test` 直接测试；唯一例外是 `price-data-service.ts`（全应用唯一允许使用 wx API 的服务，收口五条取数规则）。
3. **数据契约层**：`types/models.ts` 是单一真相源（全部字符串字面量联合类型，禁 enum）；`config/app.config.ts`（应用配置）与 `config/regions.ts`（全国省市配置 + 定位坐标）禁止散落魔法数字。
4. **离线数据管线（Node）**：`scripts/generate-prices.ts` + `scripts/adapters/`（Adapter 模式）每日由 GitHub Actions 运行，拉取/清洗/聚合后产出 `dist/prices.json` 等，提交入库并经 GitHub Pages 对外提供；小程序端通过 `price-data-service.ts` 拉取该文件，失败走降级链。

## 主要模块 / Important Modules

| 模块 / Module | 作用 / Purpose | 当前状态 / Status |
| ------------- | -------------- | ----------------- |
| pages/compare | 比一比（Tab 0）：规格+优惠 → 标准单价与胜负 | 完成 |
| pages/market-guide | 菜场指南（Tab 1）：定位/省市选择、分组参考价、我看到的价格、挑选指南、份量换算、时令雷达、刷新数据按钮 | 完成 |
| pages/price-detail | 价格详情：单条记录详情、趋势图、单均价口径说明 | 完成 |
| pages/mine | 我的（Tab 2）：静态理念/数据/隐私说明 | 完成 |
| custom-tab-bar | 悬浮胶囊式自定义 tabBar（纯 CSS 图标，零资源） | 完成 |
| services/compare.ts | 比价核心（五种优惠、赠品、单次使用成本） | 完成，有测试 |
| services/judge.ts | 「我看到的价格」五档判断 | 完成，有测试 |
| services/wholesale.ts | 批发→零售区间折算（系数表查找链） | 完成，有测试 |
| services/seasonal.ts / portion.ts | 时令三组拆分 / 份量换算 | 完成 |
| services/price-data-service.ts | 参考价取数门面（五条规则、缓存、降级、并发去重） | 完成 |
| utils/（money/units/quantile/format） | 分单位金额运算、单位归一、线性插值分位数、日期格式化 | 完成，有测试 |
| mock/（prices.ts、seasonal-baselines.ts、markups.json） | 本地基线参考价 / 季节基线 / 批发加价系数表 | 完成 |
| config/regions.ts | 全国 34 省级行政区 + 地级市（未接入城市保持注释）、`ACTIVE_PROVINCES`、`CITY_COORDS` | 完成 |
| scripts/generate-prices.ts | 数据生成主管线（归一→IQR→聚合→单均价展开→批发折算→原子写） | 完成 |
| scripts/adapters/ | PriceAdapter 接口与注册表；fuzhou-fgw（active）、mock-adapter（active）、official-placeholder（pending-auth） | 福州已接入 |
| tests/ | node --test 单元测试（5 个文件，共 36 个用例） | 通过维护中 |
| .github/workflows/generate-prices.yml | 每日北京时间 12:30 生成数据并提交 dist/ | 运行中 |

## 重要依赖 / Important Dependencies

- 零第三方运行时依赖：小程序侧无任何 npm 包；`package.json` 的 devDependencies 仅 `typescript ^5.0.0`（类型检查用）。
- 微信开发者工具内置 TypeScript 编译插件（`useCompilerPlugins: ["typescript"]`）。
- 无后端服务器：数据托管完全依赖 GitHub Actions + GitHub Pages。


---

# 3. 项目开发规则 / Development Rules

- **禁 enum / namespace / 参数属性**：`types/`、`scripts/`、`tests/` 一律使用字符串字面量联合类型，保证 Node 24 type stripping 可直跑（见 `types/models.ts` 头注释）。
- **import 扩展名约定**：小程序侧（pages/components/services/utils/config/mock）相对 import **不带**扩展名；`scripts/` 与 `tests/` 相对 import **必须带** `.ts` 扩展名。
- **金额以「分」（整数）表达**：凡参与运算的金额字段一律为整数分（`utils/money.ts` 提供元↔分换算）；`...Yuan` 后缀字段为「元」字符串原始输入。
- **文案红线**：严禁「宰客 / 一定买贵了 / 肯定不新鲜 / 不要买」等恐慌式/煽动性表述；判断文案必须中性、可解释、带免责（`tests/judge.test.ts` 有黑名单用例）。
- **隐私红线**：`wx.setStorageSync` 仅允许写两类公共数据——拉取标记 `qs_fetch_meta`（<200B 元数据）与公共参考价文件缓存 `qs_prices_cache`；绝不存储任何用户输入或选择状态（城市/渠道等只存页面内存）。
- **礼貌抓取**：爬虫 Adapter 须带可识别 UA（`QuietScale-DataBot/0.2`）、请求间隔 ≥1 秒、单请求 8 秒超时、最多重试 1 次，不绕过任何反爬或验证码。
- **配置收口**：魔法数字统一进 `config/app.config.ts`；城市配置唯一真相源为 `config/regions.ts`（新增城市 = 取消注释 + 接数据，不改页面代码）。
- **打包排除**：`project.config.json` 的 packOptions 已排除 scripts/tests/dist/node_modules/.github/typings/.md 等，勿把运行时代码放进这些目录。
- 修改前先读 `AGENTS.md`（工作规则）与 `README.md`（接入手册）；与本文件冲突时以实际代码为准。


---

# 4. 当前项目状态 / Current Status

## 整体状态 / Overall Status

v0.1.0 功能完整、可演示。小程序端运行在**远端数据模式**（`USE_MOCK=false`，远端地址为 GitHub Pages 上的 `dist/prices.json`，由 CI 每日刷新；远端不可用时自动沿用/降级）。福州为唯一已接入真实官方数据源的城市。

## 已完成 / Completed

- 四页面 + 自定义悬浮胶囊 tabBar（app.json `custom: true`，三个 Tab：比一比 / 菜场指南 / 我的）；
- 比价核心：6 分类（通用重量/液体容量/按件/米面粮油/洗护日化/生鲜蔬果）、5 种优惠（立减/优惠券/满减后实付/第二件折扣/买N件共X元）+ 赠品 + 洗护单次使用成本；差额=两侧按标准口径各自 round 到分后相减，百分比用未取整 raw 值计算（`|A−B|/较贵者`），差距 <2% 视为「接近」（`CLOSE_GAP_THRESHOLD`）；
- 菜场指南：定位隐私授权流程（`wx.requirePrivacyAuthorize` + 拒绝后引导去设置页）、省市两级选择（`config/regions.ts` 派生 `ACTIVE_PROVINCES`）、定位匹配最近城市（150km 半径、`CITY_COORDS`）、手动选择优先于定位、参考价数据驱动按品类分组（先分桶再组内排序，未知品类按首次出现编号）、渠道过滤逐级放宽、「我看到的价格」200ms 防抖五档判断、新手挑选指南（7 张卡片）、份量换算器、当季时令雷达、顶部数据等级徽标（`GRADE_NAME`，含 `remote_stale` 沿用徽标）、断更沿用说明行（`carryNote`）、「刷新数据」按钮（清缓存强制重新拉取 + toast 反馈，`onRefreshTap`）、重新定位按钮；
- 价格详情：计价口径说明（单均价展开记录用专门文案）、近 7 日趋势（`trend7d`）、来源链接、批发免责；
- 数据服务五级取数链（见 §7）与并发去重；
- 数据管线：福州发改委 Adapter（列表页取「日期 ≤ 当日」最新一期 → 详情页解析 47 行表格）、IQR 清洗、单均价展开、批发折算、`stale` 保留、原子写；
- 测试：`node --test tests/`，5 个文件共 36 个用例（money/units/compare/judge/wholesale）。

## 进行中 / In Progress

- 无进行中的开发任务；当前以数据源扩展（新城市/新官方源）为主要演进方向。

## 阻塞问题 / Blocked

- 无 / None

## 已知问题 / Known Issues

- `official-placeholder.ts` 中优先级 2~4 的官方源（商务部监测 / 农业农村部批发 / 授权商超电商）均为 pending-auth 占位，确认使用许可后才接入；
- 除福州外所有城市未接入真实数据源（`config/regions.ts` 中保持注释；北京作为本地基线校验测试城市启用）；
- `app.ts` 头注释仍写「最小实现：不发起任何网络请求」，与实际不符（仅为注释过时，不影响运行）；
- `README.md` 目录结构一节把 `mock/prices.ts`、`mock/seasonal-baselines.ts` 写成 `.json`，与实际 TS 模块形态不符；
- 福州源在 `dist/data-quality-report.json` 的 missingCategories 中缺失多数规范品类（官方品类划分为 粮油/肉禽蛋/水产/蔬菜/牛奶 等，与 9 个规范品类不同名，属预期口径差异）。


---

# 5. 当前任务 / Active Tasks

无。已完成或已失效的任务不保留。

下一位 Agent 最合理的后续工作见 §9「下一步建议」。


---

# 6. 重要技术决策 / Important Decisions

## 决策 1：本地参考数据用 TS 模块而非 JSON

**日期 / Date:** 项目初期

**决定 / Decision:** `mock/prices.ts`、`mock/seasonal-baselines.ts` 以 TS 模块导出 `PRICES_FILE` / `SEASONAL_BASELINES`，不用代码包内 JSON 文件。

**原因 / Reason:** 原生小程序运行时无法可靠读取代码包内 JSON 文件。

**影响 / Impact:** 新增/修改本地基线数据必须改 TS 文件；`mock/markups.json` 例外（仅被 Node 管线读取）。


## 决策 2：单均价展开公式与置信度

**日期 / Date:** 福州发改委源接入时

**决定 / Decision:** 官方每期每商品只有 1 个均价时，按 `均价×0.9（low）/ ×0.97（p25）/ ×1.0（median）/ ×1.08（p75）/ ×1.2（p90）/ ×1.25（high）` 展开；`sampleCount=1`、`confidence=medium`（官方单均价展开记录固定 medium，属置信度规则的显式例外）、记录带 `expandedFromSingleAverage: true` 标记；「我看到的价格」对这类记录一律按「数据不足，暂不判断」处理（缺失标记的旧数据回退 `sampleCount===1` 判别）。

**原因 / Reason:** 单均价无法做 IQR 与分位数统计，展开区间为非实测分布，需显式降置信并避免误导性判断。

**影响 / Impact:** 管线（`generate-prices.ts` 单均价分支）、判断服务（`judge.ts`）、详情页（口径文案）三处联动，修改公式需同步三处与测试。


## 决策 3：菜场指南移除全国参考兜底

**决定 / Decision:** 城市无记录时展示空态，不再回退全国参考数据。

**原因 / Reason:** 数据真实性原则——跨城市数据会误导用户。


## 决策 4：周末/断更双层沿用

**决定 / Decision:** 管线侧 Adapter 取「日期 ≤ dateKey 的最新一期」并写入文件级 `carryNote`；小程序侧远端不可用时沿用最近一次成功拉取的文件（`generatedAt` ≤ 7 天，等级 `remote_stale`），均不可用才降级本地基线。

**原因 / Reason:** 官方源周末/节假日断更，避免用户掉回静态基线数据。


---

# 7. 重要约束 / Important Constraints

## 7.1 数据链路与降级策略（`services/price-data-service.ts` 五条规则）

1. `USE_MOCK=true` → 直接返回本地基线（`local_baseline`）；
2. 内存缓存当日有效（沿用型缓存 `remote_stale` 的 failedAt 超过 60 分钟不短路，放行重试）；
3. storage 标记 `qs_fetch_meta` 当日有效：成功标记（无 `failedAt`）→ 全天不再发请求，沿用 `qs_prices_cache`；失败标记 → 距 `failedAt` 不足 `FAIL_RETRY_INTERVAL_MS`（60 分钟）不重试，超过自动放行；
4. 拉取成功且未过期未 `stale` → grade `remote` + 持久化沿用缓存；拉取失败/超时/数据过期 → 先尝试沿用缓存（`generatedAt` ≤ 7 天 → `remote_stale` + 透出 `carryNote`），无可用缓存 → 降级本地基线；
5. 并发调用共享同一次 in-flight Promise。

隐私约束见 §3；调试清缓存入口：`clearPriceCache()`（被「刷新数据」与「重新定位」按钮调用）。

## 7.2 判断端保护（`services/judge.ts`）

- 样本量 < 8 或数据日期距今 > 14 天 → 一律「数据不足，暂不判断」；
- 分位判断：≤p25 偏低、≤p75 合理、≤p90 略高、>p90 明显高于近期参考；
- 置信度：官方零售参考 + 样本 ≥20 + 数据 ≤7 天 → high；官方 + 样本 ≥8 → medium；其余 low；
- 单位口径同义归一（斤↔500g、公斤↔kg、升↔L、毫升↔ml），维度不同才提示换算；批发来源强制追加批发环节免责。

## 7.3 数据生成管线与 CI

- 运行：`node scripts/generate-prices.ts`（Node 24 直跑，零依赖）；单源总预算 20s + 1 次重试（重试前礼貌间隔 1.5s），`Promise.allSettled` 并行；
- 流程：单位归一 → 按品类 IQR 剔除（负值与超出 Q1−1.5×IQR / Q3+1.5×IQR）→ 按「城市+渠道+品类」聚合分位数 → 单均价展开分支 → 批发折算（系数查找链：城市→default→任意渠道同品类→内置 `[1.15, 1.40]`）；
- 容错：全部失败或结果为空时**不覆盖已有产物**——存在 `dist/prices.json` 则置 `stale=true` 写回，否则退出码 1；写入均为先 `.tmp` 再 rename 的原子方式，脚本不做任何删除；
- CI：`.github/workflows/generate-prices.yml`，cron `30 4 * * *`（UTC 04:30 = 北京时间 12:30，官方源约 10:00–11:30 发布），Node 24，产物以 `github-actions[bot]` 提交 `dist/`（需仓库 Settings → Actions → Workflow permissions = Read and write）；
- 托管：GitHub Pages 从 main 分支部署，地址 `https://zoxyu.github.io/QuietScale/dist/prices.json`；需在微信公众平台 request 合法域名中加白 `https://zoxyu.github.io`（开发者工具调试可勾选不校验合法域名）。

## 7.4 小程序工程约束

- `tsconfig.json`：target ES2017、strict、exclude `tests/scripts/dist`（Node 工具不进小程序编译）；
- `app.json`：`__usePrivacyCheck__: true`、`requiredPrivateInfos: ["getLocation"]`、`permission.scope.userLocation` 声明用途；`lazyCodeLoading: requiredComponents`；
- 定位用 wgs84，经纬度仅本地匹配城市，不上传不保存；
- 隐私协议授权按基础库 2.32.3+ 规范（`wx.requirePrivacyAuthorize`）。


---

# 8. 最近的重要变化 / Recent Significant Changes

- 2026-08 — 小程序端切换远端数据模式（`USE_MOCK=false`），REMOTE_PRICES_URL 指向 GitHub Pages；
- 2026-08 — 菜场指南新增「刷新数据」按钮（清缓存强制拉取 + 结果 toast）与断更沿用说明行（`carryNote`）；
- 2026-08 — 福州市发改委数据源接入（47 条/期，单均价展开），CI cron 调整为北京时间 12:30；
- 2026-08 — 城市配置迁移至 `config/regions.ts`（全国省市 + 定位坐标，注释式激活机制）；
- 2026-08-25 — 最近一次成功的每日数据生成（`dist/data-quality-report.json`：92 条记录，其中单均价展开 47 条）。


---

# 9. 下一步建议 / Next Recommended Actions

1. **接入新城市/新官方数据源**：以 `scripts/adapters/fuzhou-fgw.ts` 为模板实现 `PriceAdapter`（列表页→详情页二级跳转、礼貌抓取参数一致），在 `config/regions.ts` 取消目标城市注释，手动触发 Actions 验证 `dist/data-quality-report.json`；
2. **修复文档/注释漂移**：`README.md` 目录结构中 `mock/*.json` 应改为 `prices.ts` / `seasonal-baselines.ts`；`app.ts` 头注释「不发起任何网络请求」已过时；
3. **官方源占位转正**：确认商务部监测 / 农业农村部批发 / 授权商超电商（`official-placeholder.ts`，pending-auth）的使用许可后逐个接入；
4. 提交 `AGENTS.md` 与 `AI_CONTEXT.md` 入库（当前为 untracked 文件）。


---

# 10. 上下文维护规则 / Context Maintenance

本文件描述的是：

> “项目现在是什么状态”

This file describes:

> "What is the current state of the project?"

而不是：

> “这个项目过去发生过什么”

It is not:

> "A complete history of what happened in the project."

当信息过期时：

When information becomes outdated:

- 更新它 / Update it
- 删除它 / Remove it
- 合并它 / Consolidate it

不要无限追加历史记录。

Do not continuously append historical information.

如果某项信息未知：

If information is unknown:

使用：

Use:

`UNKNOWN`

不要猜测。

Do not guess.

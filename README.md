# 一秤清欢（QuietScale）

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

> 买菜之前，先算清楚。

「一秤清欢」是一个**原生微信小程序**（TypeScript，无第三方 npm 依赖），帮你把菜市场的价格算明白：

- **比一比**：两个商品不同规格、不同优惠，一键比出谁更划算——精确到每 100g / 每斤 / 每两的单价；
- **菜场指南**：按城市与渠道查看近期参考价区间（低 / 中位 / 高、p25~p90），附带当季品类雷达；
- **价格详情**：把你实际看到的报价与参考价分布对照，给出「偏低 / 合理 / 略高 / 偏高」五档参考判断。

产品定位：**公共参考价工具**，不登录、不采集用户数据、不做交易，只做克制的价格参考与计算。所有判断文案均不含煽动性表述。

---

## 目录结构

```
project.5/
├── app.ts / app.json / app.wxss      # 小程序入口、页面与 tabBar 配置、全局样式
├── project.config.json               # 微信开发者工具项目配置
├── sitemap.json
├── config/
│   └── app.config.ts                 # 应用级配置：USE_MOCK、REMOTE_PRICES_URL、阈值等
├── types/
│   └── models.ts                     # 全部类型契约：PriceRecord/PricesFile/MarkupTable/JudgeResult…
├── utils/
│   ├── money.ts                      # 元↔分换算与金额格式化（整数分运算，避免浮点误差）
│   ├── units.ts                      # 计量单位归一与维度兼容判断（kg/g/斤/两/L/ml/件）
│   ├── quantile.ts                   # 分位数计算（线性插值）
│   └── format.ts                     # 百分比等通用格式化
├── services/
│   ├── compare.ts                    # 比价核心（纯函数）：规格+优惠 → 标准单价与胜负
│   ├── judge.ts                      # 实付价 vs 参考价分布的五档判断（纯函数）
│   ├── wholesale.ts                  # 批发价 → 零售价区间估算（置信度恒 low）
│   ├── price-data-service.ts         # 参考价数据加载：mock / 远端、缓存与降级
│   ├── seasonal.ts                   # 当季品类逻辑
│   └── portion.ts                    # 用量/份量换算
├── pages/
│   ├── compare/                      # 比一比（tab）
│   ├── market-guide/                 # 菜场指南（tab）
│   ├── price-detail/                 # 价格详情
│   └── mine/                         # 我的（tab）
├── components/
│   ├── product-card/                 # 商品输入卡片
│   ├── result-card/                  # 比价结果卡片
│   ├── price-item/                   # 参考价条目
│   ├── category-chips/               # 品类筛选条
│   ├── guide-card/                   # 指南卡片
│   ├── seasonal-radar/               # 当季雷达
│   ├── trend-chart/                  # 趋势图
│   └── portion-converter/            # 份量换算器
├── mock/
│   ├── prices.json                   # 本地参考价数据（PricesFile 结构）
│   ├── markups.json                  # 批发→零售加价系数表（MarkupTable 结构）
│   └── seasonal-baselines.json       # 季节基准说明
├── scripts/                          # Node 工具（不进小程序编译）
│   ├── generate-prices.ts            # 数据生成主管线（node 直接运行）
│   └── adapters/
│       ├── adapter.ts                # PriceAdapter 接口与注册表（RawSample 含 unitNote/singleAverage 可选字段）
│       ├── mock-adapter.ts           # 人工季节基准 Mock 适配器（固定种子可复现）
│       ├── fuzhou-fgw.ts             # 福州市发改委「主副食品集超均价表」（官方源，已验证接入）
│       └── official-placeholder.ts   # 官方数据源占位（pending-auth）
├── tests/                            # 单元测试（node --test 直跑）
│   ├── money.test.ts
│   ├── units.test.ts
│   ├── compare.test.ts
│   ├── judge.test.ts
│   └── wholesale.test.ts
├── .github/workflows/
│   └── generate-prices.yml           # 每日定时生成价格数据并提交 dist/
└── dist/                             # 生成产物（由 CI 维护，本地可运行脚本生成）
    ├── prices.json                   # 参考价数据（PricesFile）
    ├── sources.json                  # 每条记录的来源与采集时间
    └── data-quality-report.json      # 数据质量报告
```

---

## 本地运行

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)；
2. 「导入项目」选择**项目根目录**，AppID 使用测试号（或自有 appid）；
3. 直接编译预览即可。**无需 npm install、无需构建**——项目零第三方运行时依赖，TypeScript 由开发者工具直接编译。

> 说明：`tests/`、`scripts/`、`dist/` 已在 `tsconfig.json` 的 exclude 中，微信开发者工具不会编译这些 Node 工具文件。

## Mock 数据与远程数据切换

在 `config/app.config.ts` 中：

| 配置项 | 说明 |
| --- | --- |
| `USE_MOCK: true` | 读取 `mock/prices.json` 本地参考价（当前默认） |
| `USE_MOCK: false` | 从 `REMOTE_PRICES_URL` 拉取远端 `prices.json` |
| `REMOTE_PRICES_URL` | 远端数据地址（GitHub Pages 等，接入步骤见「真实数据源接入（福州示例）」）；替换为真实 HTTPS 地址后需在微信公众平台配置 request 合法域名 |
| `FETCH_TIMEOUT_MS` | 远端拉取超时（默认 8000ms），超时先沿用最近一次成功数据（≤7 天），无可用缓存再降级本地基线 |
| `FAIL_RETRY_INTERVAL_MS` | 远端拉取失败后的重试节流间隔（默认 60 分钟）：失败后 60 分钟内不重试，超过可自动重试；成功则当日不再重复拉取 |

## 运行测试

需要 **Node ≥ 23.6**（推荐 Node 24，原生 type stripping 可直接运行 TS）。零依赖，无需 npm install：

```bash
npm test
# 或
node --test tests/
```

覆盖：金额换算（money）、单位归一（units）、比价核心全部口径（compare）、五档价格判断与文案规范（judge）、批发折算（wholesale）。

> 约束：tests 与 scripts 内不使用 enum/namespace/参数属性，相对 import 一律带 `.ts` 扩展名，以兼容 Node 原生 TS 直跑。

---

## 数据方案

### 数据来源优先级（1 最高）

| 优先级 | 来源 | 状态 |
| --- | --- | --- |
| 1 | 当地发改委 / 商务局 / 农业农村局零售参考 | **福州已接入（active）**，其余城市待接入 |
| 2 | 商务部市场监测公开数据 | 待授权 |
| 3 | 农业农村部 / 批发市场行情 | 待授权 |
| 4 | 授权商超 / 电商平台 | 待授权 |
| 5 | 人工维护季节基准（Mock） | active |

福州发改委（优先级 1）已验证接入，与 Mock 适配器同为 active 来源；2~4 仍为占位适配器，确认使用许可后再接入，**绝不绕过任何反爬或验证码**。接入与配置全流程见下文「真实数据源接入（福州示例）」。

### prices.json 结构（PricesFile）

```jsonc
{
  "version": "2026.8.19",            // 数据版本（生成当日 YYYY.M.D）
  "generatedAt": "2026-08-19T06:00:00+08:00",
  "expiresAt": "2026-08-20T06:00:00+08:00",
  "stale": false,                    // true 表示数据更新失败，展示的是最近有效参考
  "carryNote": "周末/断更参考：沿用 2026-08-17 官方均价数据", // 可选：官方源数据日期早于生成当日时由管线写入；工作日正常更新时无此字段
  "note": "",
  "records": [                       // PriceRecord[]
    {
      "id": "...", "cityCode": "310000", "cityName": "上海",
      "channel": "market",           // market/community/supermarket/ecommerce/wholesale
      "category": "叶菜",
      "productName": "油麦菜", "specification": "散装称重", "unit": "元/斤",
      "low": 3.0, "median": 4.2, "high": 6.0,
      "p25": 3.5, "p75": 4.8, "p90": 5.4,   // 线性插值分位数，保留 2 位小数
      "sampleCount": 22, "dataDate": "2026-08-18",
      "sourceName": "...", "sourceUrl": "",
      "dataLevel": "official_retail",        // 数据等级
      "confidence": "high",                  // high/medium/low
      "note": ""
    }
  ]
}
```

### 每日拉取与降级策略

- 小程序端取数链：**远端正常 → 使用当日数据**（并把完整文件持久化到本地沿用缓存）；**远端过期/失败 → 沿用最近一次成功数据**（生成日期 ≤ 7 天，标注数据日期，等级 `remote_stale`，覆盖周末与节假日断更；文件带 `carryNote` 时页面顶部展示沿用说明）；**均不可用 → 本地基线**。成功拉取后当日不再重复拉取；拉取失败/超时/远端数据过期时写入失败短时效标记（含 `failedAt` 时间戳，仅公共元数据，不含任何用户数据），**失败后 60 分钟可自动重试**（间隔由 `FAIL_RETRY_INTERVAL_MS` 控制），沿用层不改变该节流逻辑；
- GitHub Actions 每日北京时间 12:30（UTC 04:30）运行 `node scripts/generate-prices.ts`，产物写入 `dist/` 并提交（选在该时间点是因为福州发改委等官方源约上午 10:00-11:30 发布当日价格表）；
- 单个适配器总超时预算 20s + 1 次重试（重试前礼貌间隔 1.5s；各 Adapter 内部已有单请求 8s 上限），`Promise.allSettled` 并行拉取，单源失败不影响整体；
- 样本按品类做 IQR 异常清理（剔除负值与超出 Q1−1.5×IQR / Q3+1.5×IQR 的价格）；
- **容错**：全部来源失败或结果为空时，**不覆盖已有产物**——若 `dist/prices.json` 存在，置 `stale=true` 并在 note 标注「本次更新失败，展示最近有效参考」后写回；若不存在则以退出码 1 报错；
- 文件写入均为原子方式（先写 `.tmp` 再 rename），脚本不做任何删除操作。

### 批发折算模型

无本地零售样本但有批发样本时，用 `mock/markups.json` 的加价系数折算零售区间：

```
估算零售区间 = 批发中位价 × [低端系数, 高端系数]（保留 2 位小数）
```

系数查找顺序：`markups[城市][渠道][品类]` → `markups.default[渠道][品类]` → `default` 任意渠道同品类 → 内置保守系数 `[1.15, 1.40]`。折算结果 `dataLevel='estimated'`、`confidence='low'`，note 固定为「根据近期批发价格与渠道加价系数估算，仅供参考」。

### 置信度规则

- `high`：当地官方零售参考（优先级 1）（例外：官方单均价展开记录固定为 medium，见「真实数据源接入」）；
- `medium`：商务部监测 / 批发市场 / 授权商超电商（优先级 2~4）；
- `low`：人工季节基准（优先级 5）与批发折算估算值。

判断端另有保护：样本量 < 8 或数据日期超过 14 天，一律按「数据不足」展示，不输出档位结论。

---

## 新增城市步骤（Mock 基线）

1. `types/models.ts`：在 `CityKey` / `CITY_NAMES` / `CITY_KEYS` 中加入新城市；
2. `pages/market-guide/index.ts`：`CITY_CODE` 映射补充该城市的行政区划码；
3. 若只需本地基线：`mock/prices.ts`、`mock/markups.json`、`scripts/adapters/mock-adapter.ts` 分别补充记录、加价系数与基准价系数；
4. 若要接真实数据源：按下方「真实数据源接入（福州示例）」实现该城市的 Adapter。前端参考价列表已改为数据驱动按品类分组展示，新城市数据接入后无需改动前端。

## 新增品类步骤

1. `types/models.ts`：在品类键集合中加入新品类；
2. `mock/markups.json`：为每个渠道补充该品类的加价系数区间；
3. `scripts/adapters/mock-adapter.ts`：在品类基准价表中加入基准价、主渠道与季节系数；
4. 如页面有品类枚举/文案映射（category-chips、seasonal-radar 等），同步补充。

## 真实数据源接入（福州示例）

福州市发改委「主副食品集超均价表」是本项目第一个已验证的真实官方数据源（优先级 1，`scripts/adapters/fuzhou-fgw.ts`）。以下为从代码到小程序上线的完整配置步骤。

### 1. 数据链路

```
GitHub Actions（每日北京时间 12:30）
  → 福州发改委 Adapter：列表页（正则提取带日期链接，取 ≤ 当日最新一期）→ 详情页（静态 HTML 表格解析 47 行）
  → 管线归一/清理/聚合（单均价按 ×0.9~×1.25 展开）
  → dist/prices.json / sources.json / data-quality-report.json（自动提交入库）
  → GitHub Pages（或 OSS/CDN）静态托管，对外提供 HTTPS 地址
  → 小程序：成功时每日最多拉一次，失败后 60 分钟可自动重试；远端不可用时沿用最近一次成功数据（≤7 天），均不可用才降级本地基线
```

### 2. GitHub 侧配置步骤（手工操作清单）

以下操作均在浏览器中的 GitHub 网页上完成，首次配置按顺序执行：

1. **创建仓库并推送代码**：登录 [github.com](https://github.com)，右上角 **+** → **New repository**，创建仓库（可私有可公开）；本地执行 `git remote add origin https://github.com/{用户名}/{仓库名}.git`，然后 `git add .`、`git commit`、`git push -u origin main`。
2. **开启 Actions 写入权限**（必须，否则定时任务无法把 `dist/` 提交回仓库）：仓库页 → **Settings** → 左侧 **Actions** → **General** → 滚动到 **Workflow permissions** → 勾选 **Read and write permissions** → 页面底部 **Save**。
3. **开启 GitHub Pages 静态托管**：仓库页 → **Settings** → 左侧 **Pages** → **Build and deployment** 下 **Source** 选择 **Deploy from a branch** → Branch 选择 `main`（目录选 `/`（root）或 `/docs`，确保能访问到 `dist/` 所在路径）→ **Save**。等待几分钟后，数据文件地址形如：`https://{用户名}.github.io/{仓库名}/dist/prices.json`（浏览器打开能看到 JSON 即配置成功）。若使用 OSS/CDN，则自行将 `dist/prices.json` 上传到可公开访问的 HTTPS 地址。
4. **手动触发一次工作流验证**：仓库页 → **Actions** 选项卡 → 左侧选择 **Daily price data generation** → 右侧 **Run workflow** → 选分支后点击绿色按钮。进入运行记录查看日志，确认出现「来源『福州市发改委主副食品集超均价』拉取成功：47 条样本」与「单均价展开：新增 47 条」；再回仓库查看 `dist/` 目录是否由 `github-actions[bot]` 提交了新文件，`dist/data-quality-report.json` 中 `singleAverageRecordCount` 应为 47。
5. **验证通过后再配置小程序端**：完成下面第 3、4 小节的域名白名单与应用配置切换。

### 3. 微信公众平台域名白名单

微信公众平台 → **开发** → **开发管理** → **开发设置** → **服务器域名** → `request 合法域名` 中添加托管域名（如 `https://{用户名}.github.io`）。未配置时真机与体验版无法请求该地址。

### 4. 小程序端切换真实数据

`config/app.config.ts`：

1. `USE_MOCK` 置为 `false`；
2. `REMOTE_PRICES_URL` 填第 2 步得到的托管地址（必须 HTTPS，如 `https://{用户名}.github.io/{仓库名}/dist/prices.json`）；
3. 开发者工具调试期可在「详情 → 本地设置」勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**，跳过域名校验；真机预览/上线必须已完成第 3 节白名单配置。

### 5. 数据机制说明

- **周末/节假日自动沿用最近一期**：官方约工作日上午 10:00-11:30 发布，周末与节假日不发布；Adapter 取列表页中「日期 ≤ 当日」的最新一期，页面展示对应数据日期，不会产生断档。管线侧检测到本期官方源数据日期早于生成当日时，在文件顶层写入 `carryNote`（如「周末/断更参考：沿用 2026-08-21 官方均价数据」）；小程序端远端失败/过期时沿用最近一次成功拉取的数据（生成日期 ≤ 7 天，等级 `remote_stale`，顶部展示 `carryNote`），避免周末/节假日断更时掉回本地基线；
- **单均价展开为区间**：官方每期每商品只有 1 个均价，管线按 `均价×0.9（low）/ ×0.97（p25）/ ×1.0（median）/ ×1.08（p75）/ ×1.2（p90）/ ×1.25（high）` 展开，`sampleCount=1`、`confidence=medium`，note 标注「官方集超均价展开区间（均价×0.9~×1.25），非实测分布」+ 单位说明（如元/500克即元/斤）；「我看到的价格」对这类记录一律按「数据不足，暂不判断」处理，并引导对照参考区间自行比较；
- **失败保留旧数据**：全部数据源失败或样本为空时，不覆盖已有 `dist/prices.json`，仅置 `stale=true` 标注「本次更新失败，展示最近有效参考」；
- **礼貌抓取**：可识别 User-Agent（`QuietScale-DataBot/0.2`）、请求间隔 ≥1 秒、单次请求 8 秒超时、失败最多重试 1 次，不绕过任何限制。

### 6. 新增其他城市/数据源的通用步骤（以福州为模板）

1. **找列表页**：在当地发改委/商务局官网找公开发布的价格栏目，要求：静态列表页（时间倒序、链接含日期）+ 静态详情页（表格），并确认允许公开引用；
2. **实现 Adapter**：在 `scripts/adapters/` 新建文件实现 `PriceAdapter`（`id/name/priority/status/fetchSamples`），`fetchSamples(dateKey)` 返回 `RawSample[]`；单位特殊（如元/盒）或单均价源，在样本上带 `unitNote` / `singleAverage: true` 标记；礼貌抓取参数与 `fuzhou-fgw.ts` 保持一致；
3. **注册与引入**：文件末尾调用 `registerAdapter(yourAdapter)`，并在 `scripts/generate-prices.ts` 顶部 import 该文件；
4. **前端登记城市**：`types/models.ts` 的 `CityKey/CITY_NAMES/CITY_KEYS` 与 `pages/market-guide/index.ts` 的 `CITY_CODE` 加入新城市（参考价列表已数据驱动，按品类自动分组，无需改前端）；
5. **验证**：GitHub Actions 手动触发一次，检查 `dist/data-quality-report.json` 中该源样本数与剔除情况。

---

## 隐私说明

- **不登录**：无账号体系，不收集任何身份信息；
- **不采集**：不上报用户输入的价格或行为数据；比价输入仅存于当前页面内存状态，页面销毁即消失，不持久化、不上报；位置信息仅在本地用于匹配所在城市（可拒绝，拒绝后手动选择城市），不上传、不保存；
- **公共缓存策略**：参考价数据为公共信息，本地持久化的仅为公共参考价数据缓存（用于断更沿用与离线降级），不含任何用户数据；本地持久化的沿用缓存以文件 `generatedAt` 计，超过 7 天不再沿用（`expiresAt` 仅用于远端数据新鲜度判断）；
- 价格判断仅为参考，不构成任何交易建议；文案避免「宰客 / 买贵了 / 不新鲜 / 不要买」等煽动性表述。

## GitHub Actions 说明

- 工作流：`.github/workflows/generate-prices.yml`（Daily price data generation）；
- 触发：`schedule: cron '30 4 * * *'`（UTC，即北京时间 12:30；福州发改委约上午 10:00-11:30 发布，中午抓取确保拿到当日数据）+ `workflow_dispatch` 手动触发；
- 流程：checkout → setup-node（Node 24）→ `node scripts/generate-prices.ts` → 若 `dist/` 有变更，以 `github-actions[bot]` 身份仅提交 `dist/` 目录并 push；无变更则跳过提交；
- 该流程只生成与提交**公共参考价数据**，不保存任何用户数据。

---

## 许可证

本项目采用 [CC BY-NC-SA 4.0（署名-非商业性使用-相同方式共享 4.0 国际）](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可证。

- ✅ **允许**：学习、参考、修改，以及非商业目的的使用与分享；
- ✅ **要求**：再分发或衍生作品须署名、附本许可证链接并说明修改；衍生作品须以相同协议分享；
- ❌ **禁止**：任何商业目的使用——包括但不限于上架为收费 / 含广告收入的小程序或应用、作为付费产品或课程出售、商业运营与转售。
- 💼 **商用授权**：如需商业使用，请联系作者获取书面授权（联系方式见 [LICENSE](./LICENSE)）。

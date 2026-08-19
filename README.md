# 一秤清欢（QuietScale）

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
│       ├── adapter.ts                # PriceAdapter 接口与注册表
│       ├── mock-adapter.ts           # 人工季节基准 Mock 适配器（固定种子可复现）
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
| `REMOTE_PRICES_URL` | 远端数据地址占位；替换为真实 HTTPS 地址后需在微信公众平台配置 request 合法域名 |
| `FETCH_TIMEOUT_MS` | 远端拉取超时（默认 8000ms），超时自动降级到缓存/本地 |

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
| 1 | 当地发改委 / 商务局 / 农业农村局零售参考 | 待授权（pending-auth） |
| 2 | 商务部市场监测公开数据 | 待授权 |
| 3 | 农业农村部 / 批发市场行情 | 待授权 |
| 4 | 授权商超 / 电商平台 | 待授权 |
| 5 | 人工维护季节基准（Mock，当前唯一 active 来源） | active |

当前阶段仅优先级 5 的 Mock 适配器产出数据；1~4 为占位适配器，确认使用许可后再接入，**绝不绕过任何反爬或验证码**。

### prices.json 结构（PricesFile）

```jsonc
{
  "version": "2026.8.19",            // 数据版本（生成当日 YYYY.M.D）
  "generatedAt": "2026-08-19T06:00:00+08:00",
  "expiresAt": "2026-08-20T06:00:00+08:00",
  "stale": false,                    // true 表示数据更新失败，展示的是最近有效参考
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

- GitHub Actions 每日（UTC 22:00 ≈ 北京时间次日 06:00）运行 `node scripts/generate-prices.ts`，产物写入 `dist/` 并提交；
- 单个适配器超时 8s + 1 次重试，`Promise.allSettled` 并行拉取，单源失败不影响整体；
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

- `high`：当地官方零售参考（优先级 1）；
- `medium`：商务部监测 / 批发市场 / 授权商超电商（优先级 2~4）；
- `low`：人工季节基准（优先级 5）与批发折算估算值。

判断端另有保护：样本量 < 8 或数据日期超过 14 天，一律按「数据不足」展示，不输出档位结论。

---

## 新增城市步骤

1. `types/models.ts`：在 `CITY_KEYS`（城市键集合）中加入新城市；
2. `mock/prices.json`：补充该城市的 PriceRecord 条目；
3. `mock/markups.json`：补充该城市各渠道 × 品类的加价系数（可先复制 default 再微调）；
4. `scripts/adapters/mock-adapter.ts`：在城市系数表中加入该城市的基准价系数（如 1.05）。

## 新增品类步骤

1. `types/models.ts`：在品类键集合中加入新品类；
2. `mock/markups.json`：为每个渠道补充该品类的加价系数区间；
3. `scripts/adapters/mock-adapter.ts`：在品类基准价表中加入基准价、主渠道与季节系数；
4. 如页面有品类枚举/文案映射（category-chips、seasonal-radar 等），同步补充。

## 接入真实数据源步骤

1. 确认该数据源的**使用许可**（公开协议 / 授权函），绝不绕过反爬或验证码；
2. 在 `scripts/adapters/` 新建适配器文件，实现 `PriceAdapter` 接口（`id/name/priority/status/fetchSamples`），`fetchSamples(dateKey)` 返回 `RawSample[]`；
3. 文件末尾调用 `registerAdapter(yourAdapter)` 注册；
4. 在 `scripts/generate-prices.ts` 顶部 import 该适配器文件；
5. CI（GitHub Actions）每日自动拉取、清洗、聚合并提交 `dist/`，无需改动小程序端；
6. 验证 `dist/data-quality-report.json` 中该源的样本数与剔除情况。

---

## 隐私说明

- **不登录**：无账号体系，不收集任何身份信息；
- **不采集**：不上报用户输入的价格、位置或行为数据；比价输入仅存于当前页面内存状态，页面销毁即消失，不持久化、不上报；
- **公共缓存策略**：参考价数据为公共信息，本地缓存仅用于离线与降级展示，带 `expiresAt` 过期时间；
- 价格判断仅为参考，不构成任何交易建议；文案避免「宰客 / 买贵了 / 不新鲜 / 不要买」等煽动性表述。

## GitHub Actions 说明

- 工作流：`.github/workflows/generate-prices.yml`（Daily price data generation）；
- 触发：`schedule: cron '0 22 * * *'`（UTC，即北京时间次日 06:00）+ `workflow_dispatch` 手动触发；
- 流程：checkout → setup-node（Node 24）→ `node scripts/generate-prices.ts` → 若 `dist/` 有变更，以 `github-actions[bot]` 身份仅提交 `dist/` 目录并 push；无变更则跳过提交；
- 该流程只生成与提交**公共参考价数据**，不保存任何用户数据。

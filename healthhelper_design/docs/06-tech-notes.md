# 技术建议

> 本文档是给开发同学（包括 Claude Code）的实现参考。所有【建议】字样表示可调整，所有【必须】字样表示是产品决策不能改。

---

## 1. 技术选型建议

## 1.0 微信小程序兼容性清单（重要 — 开发前必读）

线框稿采用的 UI 模式与小程序原生能力的对应关系。

### 1.0.1 完全可用（无风险）

| 设计元素 | 小程序对应 | 备注 |
|---------|-----------|------|
| 卡片 + 圆角 + 阴影 | CSS 完全支持 | — |
| 分段控件（segmented） | 自绘 view + tap | — |
| chip 筛选行（横滑） | `<scroll-view scroll-x>` | scrollbar 通过 CSS 隐藏 |
| 折叠分组 | view + 状态切换 | — |
| 复选框 / 单选框 / 开关 | `<switch>` / 自绘 view | switch 颜色用 color 属性 |
| 底部弹层（切换档案、操作菜单） | 自绘 view + 蒙层 + 动画 | 注意触摸穿透处理 |
| 横向滚动（曲线图、卡片） | `<scroll-view scroll-x>` | 曲线图 canvas 嵌入 scroll-view |
| 图片预览（放大） | `wx.previewImage` | 系统级，零开发成本 |
| 日期选择 | `<picker mode="date">` | iOS/Android 原生体验 |
| 拍照 / 相册 | `wx.chooseMedia` | 多选用 `sourceType: ['album'], count: 9` |
| 长按操作（删除待办等） | `bindlongpress` | — |
| 输入框 | `<input>` / `<textarea>` | textarea 在 iOS 会浮在最上层，需特殊处理 |
| 微信订阅消息 | `wx.requestSubscribeMessage` | 每条计划需要单独申请 |
| 微信登录 | `wx.login` | session_key 由后端管理 |

### 1.0.2 需要注意（不是不支持，需要正确实现）

| 设计元素 | 注意点 |
|---------|--------|
| **趋势曲线** | 必须用 `<canvas type="2d">`，**不要用 SVG**。小程序 SVG 支持有限。具体见 §2.1 |
| **悬浮提示气泡**（首次进入按指标的引导） | 用 `position: fixed` + 高 z-index 蒙层 |
| **缩略图带"曲别针"图标** | inline SVG 或图标字体；图标字体兼容性更好 |
| **拖动排序**（关注指标重排） | `<movable-view>` + `<movable-area>`；可行但开发量较大，v1.0 不做 |
| **复杂 SVG 图标** | 优先用图标字体或 png；inline SVG 需测试基础库版本 |
| **CSS `aspect-ratio`** | 较新属性，基础库 2.30+ 支持。**用 `padding-bottom: %` 兜底**（兼容老版本） |
| **CSS `gap`** | 基础库 2.20+ 才支持；目标版本若低于此，改用 margin |
| **CSS 变量 `var(--xxx)`** | 基础库 2.7+ 支持；推荐使用 |
| **首次气泡引导** | 用 localStorage 记 `hint.health.metricRow = dismissed` |

### 1.0.3 不支持 / 需替代方案

| 不支持元素 | 替代方案 |
|----------|----------|
| **iOS 设备框** | 线框稿展示用，开发时**忽略**，按手机全屏布局 |
| **CSS `position: sticky`** | 部分基础库支持不全。用 `scroll-view` + `bindscroll` 监听位置实现"吸顶" |
| **CSS `backdrop-filter`（毛玻璃）** | 用半透明实色背景代替（如 `rgba(255,255,255,0.85)`） |
| **`prompt()` / `alert()`** | 用 `wx.showModal` |
| **第三方 webfont** | 用系统字体（PingFang SC / HarmonyOS Sans / system）。设计稿用了 Caveat 仅用于画布注释，产品不需要 |
| **本地大图 OCR** | OCR 必须走云端 API，前端只负责上传 |

### 1.0.4 性能与体积建议

- 主包体积 ≤ 2MB，按分包加载策略：
  - 主包：首页、健康数据 Tab（最高频）
  - 分包 A：上传流程
  - 分包 B：复查 Tab
  - 分包 C：我的 + 档案管理
- 图片懒加载（`<image lazy-load>`）
- 长列表用 `recycle-view` 或自实现回收
- API 请求节流；首页启动时并发请求（profile / reports / recheck）

### 1.0.5 目标基础库版本建议

- **最低支持**：2.20.0（覆盖微信 8.0+）
- **推荐**：2.30.0+（支持 aspect-ratio、新 canvas 等）
- 开发时在 project.config.json 设置 `libVersion` 锁定测试版本

---

### 1.1 小程序前端

**【必须】** 微信小程序原生开发，**不要** uni-app / Taro / mpvue。理由：
- 公益项目，依赖最小化、维护性最重要
- 中老年用户对性能敏感，原生最稳

**目录结构建议**：

```
miniprogram/
├── app.js / app.json / app.wxss
├── pages/
│   ├── home/
│   ├── health/
│   │   ├── index.{js,wxml,wxss,json}
│   │   ├── report-detail.*
│   │   └── metric-detail.*
│   ├── recheck/
│   │   ├── index.*
│   │   └── new.*
│   ├── profile/
│   │   ├── index.*
│   │   └── archive.*
│   └── upload/
│       ├── index.*
│       └── confirm.*
├── components/      # 可复用组件
│   ├── pill/
│   ├── card/
│   ├── metric-row/
│   ├── trend-chart/  # 关键自定义组件，见下
│   └── ...
├── utils/
│   ├── api.js
│   ├── store.js     # 简单的全局状态（或用 mobx-miniprogram）
│   ├── date.js
│   └── trend.js     # 趋势计算逻辑
└── icons/           # SVG sprite
```

**状态管理**：

- 简单的全局 store（用 `getApp().globalData` 或单独的 store.js）
- 不引入 redux / mobx，除非真的需要
- 跨页面通信用 `wx.navigateBack` + `eventChannel` / `emitter`

**样式**：

- 使用 rpx 适配，设计稿基于 375px = 750rpx
- 主色等 token 写入 `app.wxss` 的 CSS 变量
- 不引入 weui / vant-weapp，避免视觉风格不一致；线框稿里的组件都是自绘的

### 1.2 后端

**【建议】**：

- Node.js + Fastify / Koa / NestJS
  - 或 Python + FastAPI
- PostgreSQL（数据有结构、需要 jsonb 字段、查询灵活）
- Redis（缓存 + 微信 access_token + 限流）
- 对象存储：腾讯云 COS（与微信生态匹配）
- OCR：腾讯云 OCR 通用印刷体识别 + 自训练医疗报告模型
- AI 解读：DeepSeek / 通义千问（中文 + 性价比）

### 1.3 部署

- 服务器：腾讯云 / 阿里云轻量服务器（公益项目，建议申请公益计划）
- 域名：备案 + HTTPS（微信小程序强制）
- 微信小程序后台需配置 request 合法域名

---

## 2. 关键自定义组件

### 2.1 `<trend-chart>` 趋势曲线图

**功能要求**：

- 接收 `points: [{date, value, tone}]`
- 等距分布数据点（不按真实日期映射），X 轴标签显示真实日期
- 当 `points.length > 6` 时启用横向滚动
- Y 轴 3-4 个刻度 + 横向虚网格
- 参考范围色带（绿色背景）
- 参考线（虚线 + 数值标签）
- 当前点（最右）半径 5px，历史点半径 3.5px
- 异常点用异常色，正常点用主色

**实现建议**：

- 用 `<canvas>` 而不是 SVG（小程序 SVG 支持有限）
- 横向滚动用 `<scroll-view scroll-x>` 包 canvas
- canvas 宽度动态计算：`paddingL + (n-1) * 50 + paddingR`

**注意**：

- 微信小程序 canvas 2 必须用 `type="2d"`，不要用旧 API
- 高分屏要适配 dpr

### 2.2 `<metric-row>` 指标行

可复用在：健康数据·按指标 / 首页·关注指标横滑 / 报告详情 / 异常预警卡

属性：
- `name`：指标名
- `value` / `unit`
- `tone`: ok | high | low | positive
- `lastDate`：YYYY-MM-DD
- `trendDirection` / `trendLabel`：可选，仅按指标视图显示
- `showTrendIcon`：可选，仅报告详情显示

### 2.3 `<empty-state>` 空状态

属性：
- `illustration`：插画文件名
- `title` / `description` / `cta`：文案
- `onCtaTap`：CTA 回调

---

## 3. 必要的微信小程序 API

| 功能 | API |
|------|-----|
| 登录 | `wx.login` |
| 用户信息 | `wx.getUserProfile`（一次性，缓存） |
| 拍照 | `wx.chooseMedia({sourceType: ['camera']})` |
| 相册 | `wx.chooseMedia({count: 9, sourceType: ['album']})` |
| 文件上传 | `wx.uploadFile` |
| 订阅消息 | `wx.requestSubscribeMessage` + 后端推送 |
| 日期选择 | `<picker mode="date">` |
| 存储 | `wx.setStorage*` |
| 网络 | `wx.request`（建议封装拦截器） |

---

## 4. OCR + AI 解读集成点

### 4.1 OCR

```
POST /api/ocr/parse
Body: { imageUrls: [...], batchId: uuid }
Response: {
  batchId,
  detected: {
    reportType: "blood_routine",  // OCR 推断
    reportTypeConfidence: 0.92,
    hospital: "...",
    reportDate: "2026-04-28",
    rows: [
      {
        metricKey: "wbc",          // 匹配到的预置指标
        metricName: "白细胞",       // 原始文本
        valueRaw: "3.2",
        valueNumeric: 3.2,
        unit: "×10⁹/L",
        refRange: "4.0-10.0",
        confidence: 0.95
      },
      ...
    ],
    unrecognized: [               // 没匹配到的行
      { rawText: "...", confidence: 0.3 }
    ]
  }
}
```

**【需确认】**：
- OCR 服务商选哪家？腾讯云有专用医疗报告识别 API
- 是否需要训练自定义模型？初期建议用通用 + 后处理映射

### 4.2 AI 解读（首页"异常预警"卡片中显示，可选功能）

用户进入首页时，后端可以基于最近一次报告生成解读：

```
POST /api/ai/interpret-report
Body: { reportId }
Response: {
  summary: "本次血常规显示白细胞偏低，可能与化疗影响有关，建议..."
  highlights: [...]
}
```

**【需确认】**：
- AI 解读是否必做？还是 v1.0 先不做
- 用什么模型：DeepSeek / 通义 / 文心
- 解读内容必须明确"不构成医疗建议，请咨询医生"

---

## 5. 微信订阅消息（提醒推送）

复查提醒依赖微信订阅消息：

1. 用户**新增复查计划**时，前端调用 `wx.requestSubscribeMessage` 申请一次性订阅
2. 后端定时任务扫描临近的计划，调用微信 API 发送消息
3. 用户每次需要重新授权（一次性），所以**每次新增计划都要重新申请**

**模板字段建议**：

```
复查提醒
您有一次复查即将到来：
检查类型：{{type}}
日期：{{date}}
医院：{{hospital}}
请提前安排时间
```

**【需确认】**：
- 模板由用户自己在微信公众平台申请，开发前需要先申请好
- 模板 ID 写入后端配置

---

## 6. 隐私与合规

### 6.1 必须

- 用户数据加密传输（HTTPS）
- 手机号加密存储
- 用户协议 + 隐私政策必须明示并允许用户拒绝
- 后端访问日志保留 6 个月以上
- 不收集用户用药数据用于商业用途
- 报告原图存储 30 天后用户可申请删除

### 6.2 建议

- 通过医疗类小程序备案（**需要提前办理**，否则上架审核会卡）
- 显著位置标注"本应用不提供诊断，仅供数据管理参考"
- 提供"数据导出"功能（用户拿回自己的数据）
- 提供"账号注销"功能

### 6.3 上架审核风险点

微信小程序对**医疗类**审核较严，可能要求：

- 主体资质：医疗机构 / 非盈利组织
- 类目：医疗 - 健康管理（不能用普通工具类）
- 不能出现"诊断 / 治疗 / 处方"字样
- 不能 PUSH 推送商业推荐

**【需确认】**：
- 公益主体是否已具备医疗类目资质
- 是否考虑挂靠某医院 / 公益基金会

---

## 7. 性能与体积

- **小程序包体积 ≤ 2MB**（单包），主包必要功能 + 分包加载剩余
  - 主包：首页、健康数据
  - 分包：复查、我的、上传流程
- 图片懒加载（`<image lazy-load>`）
- 列表用 `recycle-view`（长列表回收）
- API 请求合并 / 节流

---

## 8. 测试覆盖建议

| 类型 | 覆盖范围 |
|------|---------|
| 单元测试 | 趋势计算 trend.js / 异常判断 / 日期格式化 |
| 集成测试 | OCR 流程 / 报告 CRUD / 复查 CRUD |
| 端到端 | 首次登录 → 上传 → 看趋势 → 加复查 全流程 |
| 兼容性 | iOS 12+ / Android 8+ / 微信 8.0+ |
| 可用性 | 找 3-5 名目标用户（中老年）做可用性测试 |

---

## 9. 开发节奏建议

**MVP 阶段（4-6 周）**：

1. 周 1-2：登录 / 用户档案 / 数据库设计 / OCR 集成
2. 周 3-4：上传流程 + 报告 CRUD + 健康数据 Tab（按时间）
3. 周 4-5：指标详情（数值型 + 定性型） + 健康数据 Tab（按指标）
4. 周 5-6：复查 Tab + 我的 Tab + 联调 + 测试

**v1.1（2 周）**：

- AI 解读
- 关注指标 / 钉选机制
- 数据导出

**v1.2 及以后**：

- 子女代管理（家庭账户）
- 多语言（如果需要）

# 我的病例夹 · 开发交付包

> 一个面向慢性病患者的微信小程序，电子病例夹 · 公益免费。

## 📂 目录结构

```
healthhelper/
├── README.md                     ← 你正在看的文件
├── 我的病例夹 线框稿.html         ← 视觉线框稿主入口（浏览器打开）
├── docs/                         ← 设计与开发文档（先读这个）
│   ├── 01-overview.md            产品概述、目标用户
│   ├── 02-information-architecture.md   信息架构、路由
│   ├── 03-screens.md             每个页面的详细交互
│   ├── 04-flows.md               核心流程时序
│   ├── 05-data-model.md          数据模型
│   ├── 06-tech-notes.md          技术建议、API、合规
│   └── 07-open-questions.md      ⚠ 待确认事项（开发前请逐项明确）
├── ios-frame.jsx                 iOS 设备框组件
├── design-canvas.jsx             画布容器
├── wireframe-primitives.jsx      通用 UI 原语
├── screens-home.jsx              首页 3 状态
├── screens-health-data.jsx       健康数据 Tab
├── screens-metrics.jsx           指标详情（数值型 + 定性型）
├── screens-reports.jsx           报告详情
├── screens-schedule.jsx          复查计划
└── screens-profile.jsx           我的 + 个人档案
```

## 🚀 给开发同学的入门指引

### 第一步：理解产品

按顺序阅读：

1. `docs/01-overview.md` — 5 分钟了解产品定位
2. `docs/02-information-architecture.md` — 5 分钟了解 4 个 Tab 的关系
3. **在浏览器打开** `我的病例夹 线框稿.html` — 直观看每个页面
4. `docs/03-screens.md` — 每个页面的详细行为
5. `docs/04-flows.md` — 核心流程
6. `docs/05-data-model.md` — 数据结构
7. `docs/06-tech-notes.md` — 技术建议

### 第二步：确认开放问题

`docs/07-open-questions.md` 列了 19 个待确认问题。**开发动手前请与产品/设计沟通逐项确认**。

### 第三步：搭建开发环境

参考 `docs/06-tech-notes.md` 第 1 节。

## 🎨 视觉规范速查

| 项 | 值 |
|---|---|
| 主色 | `#5A7A5A` 橄榄绿 |
| 主色浅底 | `#E3EAE0` |
| 页面背景 | `#EDEAE4` |
| 卡片背景 | `#FFFFFF` |
| 文字主 / 次 / 弱 | `#3C3630` / `#7A7065` / `#9A9085` |
| 偏高异常 | `#C07060` |
| 偏低异常 | `#5A7AA8` |
| 卡片圆角 | 22px |
| 按钮圆角 | 16px |
| 主要 padding | 16px |
| 最小字号 | 13px |
| 关键信息字号 | ≥ 16px |

## 📐 4 个底部 Tab

```
🏠 首页        — 工作台、上传入口、复查提醒、关注指标、最近报告
📊 健康数据    — 报告 + 指标合并入口，[按指标] 默认 / [按时间] 切换
📅 复查        — 待办清单系统，主页可直接勾待办，新增独立页
👤 我的        — 个人中心 + 病历档案 + 工具菜单
```

## ⚠ 重点设计原则

1. **中老年友好** — 字号大、操作步骤短、术语白话化
2. **报告 / 指标双视图** — 同一份数据两种入口（时间 vs 维度），自由穿梭
3. **数值型 / 定性型分别渲染** — 数值型有曲线，定性型只有列表
4. **复查 = todolist** — 极简，不做项目管理 / 日历应用
5. **不做诊断结论** — 只展示数据，AI 解读必须明示"非医疗建议"

## 📞 联系

设计文档作者：Claude
项目负责人：[你的名字]

# 信息架构 与 路由

---

## 1. 顶层结构

底部 4 个 Tab：

```
┌──────────────────────────────────────────────────────┐
│  🏠 首页    📊 健康数据    📅 复查    👤 我的         │
│  Home       HealthData      Recheck    Profile        │
└──────────────────────────────────────────────────────┘
```

**报告 与 指标** 合并在"健康数据"Tab 内，用顶部分段控件 `[按指标 | 按时间]` 切换。报告和指标是同一份数据的两个视图（详见 05-data-model.md）。

---

## 2. 完整路由表

> 路由命名采用微信小程序约定：`pages/<group>/<page>`

| # | 路径 | 说明 | Tab | 参数 |
|---|------|------|-----|------|
| 1 | `pages/home/index` | 首页 / 工作台 | ✅ Tab 1 | — |
| 2 | `pages/health/index` | 健康数据主页 | ✅ Tab 2 | `view?=metric\|time`（默认 metric） |
| 3 | `pages/health/report-detail` | 报告详情 |  | `id`（必填，reportId） |
| 4 | `pages/health/metric-detail` | 指标详情（数值/定性自动判断） |  | `metricKey`（必填） |
| 5 | `pages/health/pinned-manage` | 关注指标管理（弹层形式，复用 ⑤ B 切换档案弹层 UI） |  | — |
| 6 | `pages/recheck/index` | 复查计划主页 | ✅ Tab 3 | — |
| 7 | `pages/recheck/new` | 新增复查计划 |  | — |
| 8 | `pages/recheck/detail` | 复查计划详情（完整编辑器） |  | `planId`（必填） |
| 9 | `pages/profile/index` | 我的 | ✅ Tab 4 | — |
| 10 | `pages/profile/archive` | 当前档案的病例资料编辑 |  | — （读 `currentProfileId`） |
| 11 | `pages/profile/onboard` | 首次创建档案选择（自己/亲属） |  | — |
| 12 | `pages/profile/add` | 添加新档案表单 |  | `relation?`（预填关系） |
| 13 | `pages/upload/pick` | 选图 + 曲别针分组（含放大预览） |  | — |
| 14 | `pages/upload/confirm` | 识别结果概览（多份报告卡片） |  | `taskId`（必填，OCR 任务 ID） |
| 15 | `pages/upload/edit-detail` | 单份报告编辑详情 |  | `taskId, reportIdx`（在 taskId 中的索引） |
| 16 | `pages/upload/conflict` | 冲突解决子页 |  | `taskId, reportIdx, metricKey` |

**说明**：
- 切换档案弹层、管理档案弹层不是独立路由，而是 `home/index` 上的浮层组件
- 注销登录、退出账号、删除档案等用 modal 确认，不跳路由

---

## 3. 路由关系图

```
┌─ 启动 ─┐
│         │
│ 检查 token + lastProfileId
│         │
├─ 无 token ─► home/index (A 未登录)
│                │ wx 登录成功，且无档案
│                ▼
│            profile/onboard (⑤ A 创建档案选择)
│                │
│                ▼
│            profile/add (⑤ D 添加新档案)
│                │ 保存
│                ▼ (redirectTo)
│            home/index (① B 有档案空数据)
│
└─ 有 token + 有档案 ─► home/index (① C/D 主页)

home/index (Tab 1)
  ├─ 上传 CTA ─────────────► upload/pick
  ├─ 复查提醒卡 ───────────► (switchTab) recheck/index
  ├─ 关注指标 (横滑) ──────► health/metric-detail
  ├─ 关注指标 "管理 ›" ───► health/pinned-manage (浮层)
  ├─ 最近报告卡 ───────────► health/report-detail
  ├─ "查看全部 ›" ─────────► (switchTab) health/index?view=time
  ├─ 异常预警卡指标 ───────► health/metric-detail
  ├─ 档案 chip ─────────────► [浮层] 切换档案弹层 (⑤ B)
  │                              ├─ 选档案 → 本页刷新 (setData)
  │                              ├─ "管理 ›" → 弹层切换为管理模式 (⑤ C)
  │                              │       ├─ 编辑 → profile/archive
  │                              │       └─ 删除 → modal 确认
  │                              └─ "+ 添加" → profile/add
  └─ 后台识别悬浮条 ──────► upload/confirm?taskId=...

health/index (Tab 2)
  ├─ 搜索框 ───────────────► [TBD：搜索页/弹层，v1.0 可暂时是空操作或 toast]
  ├─ 右上"上传" ───────────► upload/pick
  ├─ 异常优先卡片 ─────────► health/metric-detail
  ├─ [按指标] 行 ──────────► health/metric-detail
  └─ [按时间] 行 ──────────► health/report-detail

health/metric-detail
  ├─ NavBar ★ 星标 ───────► 原地切换 isPinned 状态 (PUT)
  ├─ 历史记录行 ───────────► health/report-detail
  └─ 返回 ─────────────────► navigateBack

health/report-detail
  ├─ 指标行 / 趋势小图标 ──► health/metric-detail
  ├─ 编辑 ─────────────────► 原地切换编辑态
  ├─ 删除 ─────────────────► modal 确认 → navigateBack
  └─ 返回 ─────────────────► navigateBack

recheck/index (Tab 3)
  ├─ + 新增 ───────────────► recheck/new
  ├─ 下次复查待办勾选 ─────► 原地更新
  ├─ "之后还有" 计划行 ────► recheck/detail
  ├─ 已完成 ───────────────► 展开内联列表 (本页状态)
  └─ "标记为已完成" ───────► modal 确认 → 原地更新

recheck/new
  ├─ 保存 ─────────────────► navigateBack 到 recheck/index
  └─ 取消 ─────────────────► 已填写时 modal 确认 → navigateBack

recheck/detail
  ├─ 编辑字段 / 待办 ──────► 原地更新
  ├─ "标记为已完成" ───────► modal 确认 → navigateBack
  ├─ 取消此次复查 ─────────► modal 确认 → status:cancelled → navigateBack
  └─ 删除此计划 ───────────► modal 确认 → 删除 → navigateBack

profile/index (Tab 4)
  ├─ 用户卡 ───────────────► 不可点（仅展示）
  ├─ "档案 · 当前 [资料 ›]" → profile/archive
  ├─ "档案管理" ───────────► (回到) home/index 并主动唤起切换档案弹层
  ├─ 工具菜单 ─────────────► 各自子页（v1.0 部分可为静态页）
  └─ 退出登录 ─────────────► modal 确认 → 清 token → home/index (A)

upload/pick
  ├─ 拍照 / 相册 ──────────► wx.chooseMedia 系统级
  ├─ 缩略图点击 ───────────► wx.previewImage 系统级
  ├─ 曲别针 ───────────────► 进入选择态 (本页状态)
  ├─ "完成合并" / "取消" ──► 退出选择态
  ├─ 删除单张 ─────────────► 本页 setData
  ├─ "开始识别 (N → M)" ──► POST /api/ocr/start → 拿 taskId
  │                          → redirectTo home/index (① D 悬浮条状态)
  └─ 取消 ─────────────────► modal 确认 → navigateBack

upload/confirm
  ├─ 卡片"查看 / 编辑详情" ► upload/edit-detail
  ├─ 卡片"拆分页面" ───────► modal 确认 → 本页 setData (撤销合并)
  ├─ 卡片"处理 ›"(冲突) ──► upload/conflict
  ├─ "全部保存到病例夹" ───► POST /api/reports/batch-create
  │                          → 单份 redirectTo report-detail
  │                          → 多份 redirectTo health/index?view=time
  └─ 取消 ─────────────────► modal 确认（数据丢失警告） → navigateBack

upload/edit-detail
  ├─ 编辑基本信息 / 指标行 ► 原地编辑（含 picker / input 弹层）
  ├─ 添加指标 ─────────────► 弹层选择
  ├─ "完成编辑" ───────────► navigateBack 到 upload/confirm
  └─ 返回 ─────────────────► navigateBack（不保存提示）

upload/conflict
  ├─ 单选保留 / 删除 ──────► 本页 setData
  ├─ "应用选择" ───────────► navigateBack 到 upload/confirm
  └─ 返回 ─────────────────► navigateBack（不应用提示）
```

---

## 4. 导航类型约定

| 场景 | 用什么 | 备注 |
|------|--------|------|
| 进入下一层页面（详情 / 表单） | `wx.navigateTo` | 保留栈，可返回 |
| Tab 切换 | `wx.switchTab` | 用于跳别的 Tab 入口页 |
| 流程完成后跳新页面 | `wx.redirectTo` | 替换当前页，无法返回到前一页（避免回到无效状态） |
| 返回上一页 | `wx.navigateBack({delta: 1})` | **永远不要硬编码目标页** |
| 跨流程跳 Tab（如上传完成跳 Tab 2） | `wx.reLaunch` 或 `wx.switchTab` | reLaunch 清整个栈，慎用 |

**关键规则**：

- 上传流程是高频长流程，识别完成跳报告详情用 `redirectTo`，**不让用户能"返回到识别中"的状态**
- 微信小程序页面栈最多 10 层，超过会失败。本设计最深 5 层：`home → health → metric-detail → report-detail → metric-detail`，安全
- 触发档案切换、登出、清空数据等会导致页面栈数据无效的操作时，先 `reLaunch` 到首页

---

## 5. 跨档案切换的路由处理

切换档案是状态变更，**不是路由变更**。但有几个特殊情况：

| 场景 | 处理 |
|------|------|
| 在 home/index 切换档案 | 本页 setData 刷新即可 |
| 在二级页面切换档案（如 metric-detail） | **不允许在二级页面切换档案**——档案切换器 chip 只在 home/index 显示 |
| 后台识别期间切换档案 | OCR 任务保留原档案绑定。识别完成后用户点悬浮条，进入 `upload/confirm?taskId=...`，**任务的 profileId 来自 taskId 关联记录**，与当前选中档案无关 |
| 当前档案被删除 | 自动切到第一个剩余档案，刷新 home/index；如果一个都没了，redirectTo `profile/onboard` |

---

## 6. Tab 切换的状态保持

- 用户在 Tab 内的滚动位置、筛选 chip 状态、segmented control 选项**需要保持**（切走再回来恢复）
- 离开小程序再回来，**保持上次 Tab**（用 localStorage 记 `lastTab`）
- 详情页通过 `wx.navigateBack` 返回，**返回时上一页状态不重置**
- 切换档案后，所有 Tab 的本地 cache 都失效，下次进入时重新拉数据

---

## 7. 页面"入口 / 出口"速查表

详细行为见各页面在 03-screens.md 的描述。这里列总览：

| 页面 | 主要入口 | 主要出口 |
|------|----------|----------|
| home/index | 启动 / Tab 切换 | upload / health/* / recheck / metric-detail / 档案弹层 |
| profile/onboard | 首次登录后 / 删完所有档案 | profile/add |
| profile/add | onboard / 切换档案弹层 / 我的 Tab | redirectTo home/index |
| health/index | Tab 切换 / 首页"查看全部" | metric-detail / report-detail / upload |
| health/metric-detail | 首页关注 / 健康数据·按指标 / 健康数据·需要关注 / report-detail 指标行 | report-detail / navigateBack |
| health/report-detail | 首页最近报告 / 健康数据·按时间 / metric-detail 历史记录 | metric-detail / navigateBack |
| recheck/index | Tab 切换 / 首页复查卡 | recheck/new / recheck/detail |
| recheck/new | recheck/index "+ 新增" | navigateBack |
| recheck/detail | recheck/index "之后还有"行 | navigateBack |
| profile/index | Tab 切换 | profile/archive / 我的菜单各项 |
| profile/archive | 我的 Tab / 切换档案管理模式·编辑 | navigateBack |
| upload/pick | 首页上传 CTA / 健康数据右上 | redirectTo home (识别中 ① D) |
| upload/confirm | 后台识别悬浮条点击 / 微信订阅消息点击 | upload/edit-detail / upload/conflict / redirectTo health\|report-detail |
| upload/edit-detail | upload/confirm 卡片"查看详情" | navigateBack 到 confirm |
| upload/conflict | upload/confirm 卡片"处理 ›" | navigateBack 到 confirm |

---

## 8. 深链 / 分享

- **不支持** 把单个报告 / 指标分享给他人（隐私考虑）
- **支持** 分享小程序入口（首页）给亲友推荐使用
- 微信订阅消息通知支持 deep link：识别完成 → 通知 → 直接打开 `upload/confirm?taskId=...`
- 复查提醒通知 → 直接打开 `recheck/index?focusPlanId=...`（首页 + 自动滚到该计划）

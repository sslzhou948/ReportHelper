# Backend Technical Plan

本文档定义 v1 后端技术方案。目标不是一次性做完整平台，而是先跑通最小生产闭环：结构化 OCR 草稿入库、确认保存、查重覆盖/跳过、报告查询、指标聚合、编辑回写。

## 1. v1 Scope

### In Scope

- 微信登录换取用户身份，建立 `users/profiles`。
- OCR fixture 旁路：先假定图片已经上传并识别完成，直接写入 `ocr_tasks/recognized_report_drafts`。
- 报告确认保存：创建 `reports/report_metric_values`。
- 重复报告检测：保存前返回候选项，必须由用户选择覆盖或跳过。
- 报告列表、报告详情、指标快照、指标历史查询。
- 报告编辑后重算异常数和指标快照。
- 复查计划和待办的基础增删改查。

### Deferred

- 真实图片上传和 OCR 服务商接入。
- 管理员后台 UI。
- 管理员映射审核发布和历史异步回填任务。
- 订阅消息模板和真实推送。
- 数据导出文件生成。
- 支付/计费。

## 2. Recommended Architecture

### Runtime

- API service: Node.js + TypeScript.
- Database: PostgreSQL.
- ORM/migration: Prisma or Drizzle. v1 推荐 Prisma，迁移和类型生成更直观。
- Object storage: 抽象 `StorageProvider`，v1 可先只保存 object key，不直接接真实上传。
- Background jobs: v1 可先用 API 内同步重算快照；后续接队列处理 OCR、回填、导出。

### Service Boundaries

- `AuthService`: 微信登录、token/refresh token。
- `ProfileService`: 档案管理。
- `OcrTaskService`: OCR 任务、草稿、fixture 旁路。
- `ReportService`: 报告保存、编辑、删除、查重。
- `MetricService`: 指标归一、异常判断、快照和历史。
- `RecheckService`: 复查计划和待办。
- `MappingService`: 主数据和映射规则读取；v1 使用静态 seed。

## 3. Data Ownership

- 所有业务数据必须带 `profile_id`。
- 所有需要审计的写操作带 `user_id`。
- API 层不得接受客户端传入的 `userId` 作为信任来源，只从 token 解析。
- 查询报告、指标、复查计划时必须校验 `profile.user_id === current_user.id`。

## 4. Minimum Backend Loop

### Step 1: Schema And Seed

- 建表按 `docs/database-schema.md`。
- seed 基础数据：
  - report types
  - metric categories
  - metric definitions
  - mapping rules
- seed 测试用户和档案仅用于本地开发，不进入生产迁移。

### Step 2: Fixture OCR Task

实现 `POST /api/ocr/tasks` 的 fixture 模式：

- 请求可带 `fixtureCaseIds`，仅本地/测试环境允许。
- 后端从 `miniprogram/data/ocr-fixtures.js` 等价结构生成 OCR task 和 drafts。
- task 状态直接为 `needs_confirmation`。
- 不上传图片，不调用 OCR。

### Step 3: Confirm And Save

实现：

- `GET /api/ocr/tasks/{taskId}`
- `PATCH /api/ocr/tasks/{taskId}/drafts/{draftId}`
- `POST /api/reports/duplicate-check`
- `POST /api/reports/batch-create`

保存事务要求：

1. 校验 task 属于当前用户的 profile。
2. 校验 unresolved conflicts 已处理。
3. 重新执行 duplicate check。
4. 若存在候选但无决策，返回 `409 DUPLICATE_REPORT_REQUIRES_DECISION`。
5. 对 `replace` 的旧报告软删除或写入 `replaced_by_report_id`。
6. 对 `skip` 的 draft 不创建报告。
7. 创建报告和指标值。
8. 重算相关 profile 的 metric snapshots。
9. task 状态更新为 `confirmed`。

### Step 4: Read Loop

实现：

- `GET /api/profiles/{profileId}/reports`
- `GET /api/reports/{reportId}`
- `GET /api/profiles/{profileId}/metrics/snapshots`
- `GET /api/profiles/{profileId}/metrics/{metricKey}/history`

约束：

- `analysis_policy=view_only` 的报告不进入指标快照。
- `mapping_status=pending/conflicted` 的指标不进入快照和趋势。
- 删除或覆盖报告后必须重算快照。

### Step 5: Edit Loop

实现：

- `PATCH /api/reports/{reportId}`
- `DELETE /api/reports/{reportId}`

编辑后必须：

- 保留原始 OCR 字段。
- 标记用户编辑字段。
- 重算 abnormal count。
- 重算相关 metric snapshots。

## 5. Duplicate Detection

v1 强重复核心：

- same `profile_id`
- same `report_date`
- same `type_key`
- same `exam_part`
- same `exam_method`
- same or highly consistent result values

医院名称：

- 先做归一化，例如去掉地区、医院、院区、总院、分院等通用词。
- 医院归一后相同可增强为 strong。
- 医院不同不能单独阻止查重；如果日期、typeKey、部位/方法、结果都一致，仍应判重复。

实验室报告：

- 用 `metric_key + value_type + value + unit` 比较结果。
- `sameResultRatio >= 0.8` 可判 strong。
- `metricOverlapRatio >= 0.8` 但结果不完全一致时判 possible。

影像报告：

- v1 不做语义结果比对。
- 用 `type_key + exam_part + exam_method + report_date` 判同类。
- 不同 `exam_part` 不判重复。

## 6. API Adapter Strategy

小程序端已经通过 `miniprogram/utils/api.js` 隔离 mock/backend：

- mock adapter 继续用于视觉和业务验收。
- backend adapter 必须完全遵守 `docs/api-contract.md`。
- 页面层不应直接感知 mock/backend 差异。

后端联调时优先替换：

1. auth/profile
2. OCR fixture task
3. report save/read
4. metric snapshots/history
5. report edit/delete
6. recheck plans

## 7. Security And Compliance Baseline

- 全量 HTTPS。
- JWT access token + refresh token。
- 对象存储只返回短期签名 URL。
- 日志不输出完整报告指标、身份证、手机号、AppSecret。
- AppSecret 只放服务端环境变量，永不进入小程序端和仓库。
- 生产环境关闭 fixture OCR 入口。

## 8. Acceptance Gates

最小后端闭环完成标准：

- 7 份真实 fixture 可写入真实数据库。
- 第二次保存同批 fixture 必须触发重复检测。
- 选择覆盖后旧报告不再出现在有效列表。
- 选择跳过后不新增重复报告。
- 首页、健康数据、报告详情、指标趋势均从真实 API 返回。
- 编辑报告指标后 abnormal count 和 metric snapshots 正确更新。
- `npm.cmd test` 通过。
- `npm.cmd run devtools:preview` 通过。

## 9. First Implementation Slice

建议第一个后端实现 slice：

1. 新建 backend 目录和 TypeScript 项目。
2. 添加 PostgreSQL schema migration。
3. 添加 fixture seed/import 脚本。
4. 实现 profiles、ocr tasks、reports batch-create、duplicate-check。
5. 写 API contract tests，直接用 realcase fixture 验证保存两次。


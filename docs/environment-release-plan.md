# Environment And Release Plan

Updated: 2026-05-29

本文档用于说明“我的病例夹”小程序从本地开发、联调测试、体验版试运行到正式上线后的环境、账号、部署和持续迭代规划。它面向后续长期维护，不只服务当前开发阶段。

## 1. Core Principles

- 同一套代码，区分不同运行环境。
- 测试数据和生产数据必须隔离。
- 小程序正式版必须连接生产后端，禁止 mock、fixture、localhost。
- AppSecret、数据库密码、JWT 密钥、OCR 密钥等只放在后端环境变量或密钥管理系统中，不能进入小程序端代码和仓库。
- 真实图片上传和 OCR 可以继续与下游业务逻辑解耦，测试阶段优先用 fixture 跑通保存、查重、归档、趋势、编辑等核心链路。
- 所有上线前检查都要可重复执行，尽量用自动化测试减少人工回归成本。

## 2. Environment Matrix

| Stage | WeChat Version | Mini Program API Mode | Backend | Database | Purpose |
| --- | --- | --- | --- | --- | --- |
| Local development | develop / DevTools preview | mock, hybrid-upload, or backend | local backend or memory backend | mock, memory, or local PostgreSQL | UI 调试、组件交互、fixture 业务闭环 |
| Integration test | develop / trial | backend | test backend | test PostgreSQL | 真实 API 联调、体验版试运行、回归测试 |
| Production | release | backend only | production backend | production PostgreSQL | 线上真实用户使用 |

当前代码已经具备一个重要保护：`miniprogram/utils/api-config.js` 会在微信 `envVersion === 'release'` 时强制使用 backend 模式。上线前还需要补齐不同环境的后端域名配置，避免正式版仍然使用本地默认地址。

## 3. Account Strategy

### One WeChat Account Is Enough For Development

开发者只有一个微信号也可以同时完成开发调试和真实体验测试。切换方式不是换微信号，而是进入不同的小程序版本：

- 在微信开发者工具里运行或扫码预览：开发版。
- 上传代码后设为体验版：体验版。
- 审核发布后从正式入口打开：正式版。

同一个微信号在测试后端和生产后端里会形成不同的数据记录，因为数据库隔离。这样可以用同一个微信号验证真实用户体验，同时不会污染生产数据。

### Test Accounts

测试账号建议包括：

- 开发者本人微信号：用于开发、真机预览、体验版试运行。
- 体验成员微信号：用于接近真实用户的测试。
- 后端自动化测试用户：仅存在于 development/test 环境，由测试代码生成或重置。

测试账号的数据进入 test database，可清空、重建、导入 fixture。

### Production Accounts

生产账号以微信 `openid/unionid` 为身份来源。生产环境不允许 dev-session fallback，也不允许 fixture OCR 入口。生产用户数据不得被测试脚本清理或覆盖。

## 4. Mini Program Project Strategy

短期建议使用一个微信小程序 AppID，通过微信自身版本体系区分：

- develop：开发者工具本地开发。
- trial：体验版试运行。
- release：正式线上版本。

开发者工具里通常打开同一个本地项目，不需要为测试和生产创建两个本地项目。真正需要区分的是后端地址、数据库和环境变量。

如果未来出现以下情况，可以考虑申请第二个测试 AppID：

- 支付、订阅消息、服务类目、审核配置需要强隔离。
- 有较多外部测试人员，需要避免误进正式小程序。
- 生产小程序已经有真实用户，测试流程频繁影响体验版管理。

## 5. Backend Deployment Strategy

建议至少部署两套后端：

| Backend | Example URL | NODE_ENV | Database | OCR Provider | Storage |
| --- | --- | --- | --- | --- | --- |
| test backend | `https://api-test.example.com` | `test` or `staging` equivalent | test DB | fixture or OCR sandbox | test bucket |
| production backend | `https://api.example.com` | `production` | prod DB | real OCR provider | prod bucket |

当前后端 `NODE_ENV` 支持 `development/test/production`。如果后续需要更明确的预发布环境，可以在部署层使用 `NODE_ENV=production` 保持生产行为，同时增加 `APP_ENV=staging` 来区分测试部署和生产部署。

生产环境必须满足：

- `NODE_ENV=production`
- 使用真实 `WECHAT_APP_ID`
- 使用真实 `WECHAT_APP_SECRET`
- 使用强随机 `JWT_SECRET`
- 使用生产 `DATABASE_URL`
- fixture OCR 禁用
- dev-session fallback 禁用
- HTTPS 域名已配置到微信小程序后台合法域名

## 6. Mini Program API Routing

目标配置：

| envVersion | Meaning | API Base URL |
| --- | --- | --- |
| develop | 开发版 | local backend or test backend |
| trial | 体验版 | test backend |
| release | 正式版 | production backend |

上线前需要补充：

1. 在小程序配置层明确 `develop/trial/release` 的默认 base URL。
2. 静态检查禁止 release 使用 `localhost`、`127.0.0.1`、mock、fixture。
3. 开发者工具中允许临时覆盖 base URL，但正式版忽略本地覆盖。

## 7. Data Isolation

测试和生产必须至少做到数据库隔离：

- test database 可重置，可导入 `realtestcase/` 对应 fixture。
- production database 只允许迁移、备份、受控修复，不允许测试脚本清库。
- 测试对象存储 bucket 与生产 bucket 分开。
- OCR 原始文本、上传图片、用户编辑后的字段都属于敏感健康数据，日志里不能输出完整内容。

如果未来迁移到 Supabase，仍建议保持同样隔离：

- Supabase test project。
- Supabase production project。
- 认证继续以微信登录和自有后端 JWT 为主。

## 8. Local Development Flow

推荐日常开发流程：

1. 小程序默认 mock 模式，用于快速 UI 和交互调试。
2. 需要验证上传后业务闭环时，切到 `hybrid-upload` 或 backend。
3. 使用 memory backend 或本地 PostgreSQL 跑 fixture OCR。
4. 用微信开发者工具真机预览验证关键路径。
5. 提交前执行自动化检查。

常用检查：

```bash
npm.cmd test
npm.cmd run visual:check
npm.cmd run fixtures:check
npm.cmd --prefix backend run migration:check
npm.cmd --prefix backend run build
npm.cmd --prefix backend test
```

完整检查：

```bash
npm.cmd run check:all
```

需要微信开发者工具的检查单独执行：

```bash
npm.cmd run devtools:flow
npm.cmd run devtools:hybrid-flow
```

## 9. Trial Run Flow

体验版试运行建议流程：

1. 合并代码到主线或 release candidate 分支。
2. 部署 test backend。
3. 迁移 test database。
4. 小程序构建配置指向 test backend。
5. 上传代码到微信公众平台。
6. 设置为体验版。
7. 用开发者本人微信和体验成员微信扫码测试。
8. 执行核心手工验收：
   - 首次登录和创建档案。
   - 新增健康记录。
   - fixture OCR 确认保存。
   - 重复报告覆盖/跳过。
   - 报告详情查看与编辑。
   - 手动录入检查结果。
   - 个人自定义检查模板。
   - 健康数据、趋势、关注指标。
   - 复查计划和待办。
   - 我的页面档案资料维护。
9. 记录问题，修复后重新上传体验版。

体验版所有数据必须进入 test database。

## 10. Production Release Flow

正式上线前检查：

- 所有自动化检查通过。
- 体验版核心路径验收通过。
- 生产后端部署完成。
- 生产数据库迁移完成并已备份。
- 微信后台合法域名配置完成。
- 用户协议、隐私政策、医疗免责声明确认完成。
- 小程序类目、资质、服务内容符合微信审核要求。
- release 构建确认连接 production backend。
- AppSecret 未出现在小程序代码、前端包、日志和仓库历史中。

上线步骤：

1. 标记 release candidate。
2. 部署 production backend。
3. 执行 production migration。
4. 运行 production health check。
5. 上传小程序代码。
6. 提交微信审核。
7. 审核通过后发布正式版。
8. 发布后验证登录、首页、档案、报告列表、健康数据、复查计划等只读和轻写路径。
9. 观察错误日志、API 延迟、数据库连接、OCR 队列、上传成功率。

## 11. Rollback And Hotfix

小程序端：

- 微信公众平台支持回退到上一稳定线上版本时，应优先使用平台能力。
- 若问题只影响后端兼容性，优先后端热修复，避免重新审核。

后端：

- 每次生产数据库 migration 前备份。
- migration 必须可审计，避免破坏性字段删除。
- 数据修复脚本需要 dry-run 输出。
- 管理员映射调整和指标回填不能覆盖 OCR 原始文本和用户编辑后的值。

## 12. Continuous Iteration

建议长期采用如下节奏：

1. 本地开发和自动化测试。
2. 合并到测试分支或主线。
3. 部署 test backend。
4. 发布体验版。
5. 体验版验收。
6. 提交审核。
7. 正式发布。
8. 线上监控和问题回收。
9. 下一轮迭代。

每轮迭代都要维护：

- `docs/development-status.md`：当前完成和剩余事项。
- `docs/api-contract.md`：前后端接口变化。
- `docs/database-schema.md`：数据库结构和迁移策略。
- `docs/edge-case-matrix.md`：边界情况和产品决策。
- 本文档：环境、部署、上线流程变化。

## 13. Open Items

- 开发阶段真实图片可先保存到项目根目录 `local-object-storage/`；该目录必须保持 git 忽略，禁止真实报告图片进入仓库。
- 开发阶段 OCR provider 可以先使用 GPT 视觉能力，后续通过同一 provider 接口替换为专业 OCR API。
- 增加正式的 `develop/trial/release` base URL 配置。
- 增加 release 静态检查，禁止生产版连接 mock、fixture、localhost 或测试后端。
- 明确 test backend 和 production backend 的实际域名。
- 明确测试库重置脚本和 fixture seed 流程。
- 增加生产健康检查文档和告警策略。
- 增加微信订阅消息、OCR provider、对象存储的测试/生产环境配置。
- 后续管理员 portal 完成后，补充管理员发布映射、处理冲突、回填数据、查看系统健康状态的运维流程。

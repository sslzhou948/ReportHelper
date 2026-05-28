# Edge Case Matrix

本文档定义 v1 功能开发必须处理的边界场景。优先级含义：

- P0：必须在 MVP 上线前实现并测试。
- P1：开发时预留结构，MVP 可用简化处理。
- P2：进入 backlog，不阻塞核心功能。

## 1. 登录与档案

| 场景 | 优先级 | 触发条件 | UI 行为 | 数据/接口约束 | 测试方式 |
| --- | --- | --- | --- | --- | --- |
| 微信登录失败 | P0 | `wx.login` 或后端登录失败 | 按钮恢复可点，toast“登录失败，请重试” | 不写 token | mock 500/timeout |
| 用户拒绝授权/协议 | P0 | 未同意协议或拒绝必要授权 | 停留在登录页，提示无法继续 | 不创建用户 | 交互测试 |
| token 过期 | P0 | API 返回 401 | 尝试 refresh；失败回登录页 | 清理 token | API 单测 |
| 档案列表为空 | P0 | 登录成功但无 profile | 进入创建档案 | 不展示空首页数据 | 页面状态测试 |
| 当前档案被删除 | P0 | `lastProfileId` 失效 | 自动切到第一份档案；无档案则创建 | 更新 `lastProfileId` | store 单测 |
| 切换档案时有 OCR 任务 | P0 | pending task 存在 | 悬浮条仍显示，点击进入原档案任务 | task 绑定原 `profileId` | 集成测试 |
| 多档案重名 | P1 | 用户创建同名档案 | 允许，但展示关系/摘要区分 | profileId 唯一 | 表单测试 |

## 2. 上传与选图

| 场景 | 优先级 | 触发条件 | UI 行为 | 数据/接口约束 | 测试方式 |
| --- | --- | --- | --- | --- | --- |
| 未选择图片点击识别 | P0 | photos.length = 0 | 按钮禁用或 toast | 不创建任务 | 页面测试 |
| 超过最大张数 | P0 | 选择超过 9 张 | 截断并提示 | 前后端都校验 max 9 | 单测 |
| 图 1+2 合并，其余独立 | P0 | 4 张图，1/2 同组 | 显示 4 张 -> 3 份报告 | 一组只生成一份报告 | 已有单测，继续保留 |
| 同图重复入组 | P0 | 用户重复点同一图 | 只保留一次 | group 内 photoId 唯一 | 单测 |
| 取消合并 | P0 | 点击拆分/取消合并 | 组内图片恢复独立报告 | 重算 reportCount | 单测 |
| 选图后退出 | P1 | 未开始识别时返回 | 有草稿时弹确认 | 可存 `uploadDraft` | 交互测试 |
| 上传中断网 | P0 | uploadFile 失败 | 保留草稿，显示重试 | 不创建半任务 | mock 网络失败 |
| 图片格式不支持 | P1 | 非 jpg/png/heic 或过大 | 提示重新选择 | 前后端校验 mime/size | API 测试 |

## 3. OCR 任务

| 场景 | 优先级 | 触发条件 | UI 行为 | 数据/接口约束 | 测试方式 |
| --- | --- | --- | --- | --- | --- |
| OCR 任务创建成功 | P0 | `/ocr/tasks` 返回 task | 回首页，显示识别中 | 写 `pendingOcrTasks` | 集成测试 |
| OCR 任务轮询超时 | P0 | 超过预期仍 processing | 显示“识别较慢，请稍候” | 继续保留 task | fake timer |
| OCR 完全失败 | P0 | task.status = failed | 确认页显示失败卡片，提供重试/手动填写 | failed reason 必填 | API mock |
| 单张图片无法识别 | P0 | 某 report result empty | 卡片显示“未识别到内容” | 该 report 可手动填写 | fixture 测试 |
| OCR 部分不确定 | P0 | confidence 低 | 编辑详情行黄色高亮 `!` | 返回 `uncertain: true` | fixture 测试 |
| 非报告图片 | P0 | OCR 判断非检查报告 | 卡片显示“未识别到检查报告” | `reportLike=false` | fixture 测试 |
| 未知指标或未知报告类型 | P1 | 映射库无可靠匹配 | 报告可保存，提示部分指标待系统确认 | 保存 `mappingStatus=pending`，创建审核项，不进入趋势 | fixture/API 测试 |
| 映射规则冲突 | P1 | rawName 命中多个可能标准指标 | 报告可保存，指标显示待确认 | 保存 `mappingStatus=conflicted`，创建管理员审核项 | API 测试 |
| 多 OCR 任务并发 | P1 | pending tasks > 1 | 首页显示“识别中（N 个任务）” | task list API 支持 | 集成测试 |
| 任务属于其他档案 | P0 | 当前档案与 task profile 不同 | 确认页提示并绑定原档案 | 保存用 task.profileId | 集成测试 |

## 4. OCR 结果确认

| 场景 | 优先级 | 触发条件 | UI 行为 | 数据/接口约束 | 测试方式 |
| --- | --- | --- | --- | --- | --- |
| 同 key 同值 | P0 | 组内重复指标值一致 | 静默去重 | 保留 confidence 高者 | 单元测试 |
| 同 key 不同值 | P0 | 组内重复指标值不同 | 卡片显示冲突，保存按钮禁用 | 返回 conflict list | 单元测试/页面测试 |
| 未处理冲突点击保存 | P0 | conflicts unresolved | toast“请先处理 N 个冲突” | 不调用保存 API | 交互测试 |
| 基础信息不一致 | P0 | 同组医院/日期/type 不同 | 弹确认；默认第一页为准 | 保留 alternatives | 单元测试 |
| 未知指标 | P1 | metricKey 未匹配 | 显示新指标提示，可调分类 | status=pending | fixture 测试 |
| 管理员未及时处理未知指标 | P1 | review item 长期 pending | 用户报告正常可查，指标标记“待系统确认” | 不阻塞报告归档；不进入趋势/汇总 | API 测试 |
| 管理员发布新映射后回填 | P1 | pending 指标被确认 | 用户无感更新或详情状态变为已归类 | 只更新标准化字段和快照，不覆盖原始 OCR/用户编辑 | 后台任务测试 |
| 手动编辑数值 | P0 | 用户修改 OCR 值 | 标记 manuallyEdited | 后端保存 `isManuallyEdited` | 表单测试 |
| 保存时命中重复报告 | P0 | 同档案下日期/医院/标准类型/部位等匹配已有报告 | 弹窗让用户选择覆盖旧报告、仍保存为新报告或跳过 | 未带 `duplicateDecisions` 时返回 `409 DUPLICATE_REPORT_REQUIRES_DECISION` | API/页面测试 |
| 保存为覆盖旧报告 | P0 | 用户选择覆盖 | 提示将替换旧报告，确认后保存 | 旧报告软删除或写入 `replacedByReportId`，重算 snapshot | API 测试 |
| 疑似重复但用户保留 | P1 | 命中 possible duplicate | 允许保存为新报告，但记录用户选择 | 写入 duplicate candidate ignored，避免持续重复提示 | API 测试 |
| 用户取消保存 | P0 | 确认页返回/取消 | 弹“识别数据将丢失” | 确认后取消 task/draft | 交互测试 |

## 5. 报告与指标

| 场景 | 优先级 | 触发条件 | UI 行为 | 数据/接口约束 | 测试方式 |
| --- | --- | --- | --- | --- | --- |
| 无报告 | P0 | reports 空 | 空状态 + 上传 CTA | API 返回空数组 | 页面测试 |
| 报告删除 | P0 | 用户确认删除 | 返回列表并提示 | 软删除，重算 snapshot | API 测试 |
| 报告编辑后异常数变化 | P0 | metric 值变化 | 页面刷新 abnormalCount | 后端重算 | 集成测试 |
| 定性指标详情 | P0 | valueType=qualitative | 不显示趋势曲线，显示提示 | 不调用趋势图数据 | 单元/页面 |
| 趋势只有 1 个点 | P0 | measureCount=1 | 显示“首次记录” | 不画误导性线段 | 单元测试 |
| 参考范围缺失 | P0 | refRange null | 显示“参考 --”，tone unknown/ok | 算法兜底 | 单元测试 |
| 医院参考范围不同 | P0 | history ref 不同 | 点颜色按各自 ref，参考线按最新 ref | 保留每次 ref | 单元测试 |
| 影像报告无量化指标 | P0 | CT/MRI/超声等报告 | 只展示报告详情和影像所见，不进入趋势分析 | `modality=imaging`, `analysisPolicy=view_only` | fixture 测试 |
| 同名影像检查不同部位 | P1 | 两份“胸腹盆CT平扫”分别对应胸部/腹盆 | 确认页显示部位，可人工校准 | 保存 `examPart/examMethod`，同 typeKey 下按部位区分 | fixture 测试 |
| 同名影像报告重复判断 | P0 | 两份影像报告原始名称相同但 `examPart` 不同 | 不提示覆盖；按不同部位分别归档 | duplicate check 必须比较 `examPart/examMethod` | fixture/API 测试 |
| 长指标名/长医院名 | P1 | 文本过长 | 单行截断或换行不挤压 | 前端样式约束 | 视觉测试 |

## 6. 关注指标

| 场景 | 优先级 | 触发条件 | UI 行为 | 数据/接口约束 | 测试方式 |
| --- | --- | --- | --- | --- | --- |
| 关注指标 | P0 | 点击“关注” | 状态变“已关注” | PATCH snapshot.isPinned | API mock |
| 取消关注 | P0 | 点击“已关注” | 状态变“关注” | PATCH snapshot.isPinned=false | API mock |
| 首页关注为空 | P0 | 无 pinned metrics | 展示管理入口/空提示 | 不自动造数据 | 页面测试 |
| 关注太多 | P1 | pinned > 5 | 首页横滑展示，异常优先 | 排序规则固定 | 单元测试 |

## 7. 复查计划

| 场景 | 优先级 | 触发条件 | UI 行为 | 数据/接口约束 | 测试方式 |
| --- | --- | --- | --- | --- | --- |
| 日期早于今天 | P0 | 保存过去日期 | 阻止保存，提示 | 前后端校验 | 表单/API |
| 必填缺失 | P0 | type/date/hospital 空 | 阻止保存，标出字段 | 400 返回 field errors | 表单/API |
| 订阅消息拒绝 | P0 | 用户拒绝授权 | 计划照常保存，提示无提醒 | 保存 reminder disabled | 交互测试 |
| 全部待办完成 | P0 | todos all done | 显示完成按钮 | 可 PATCH done | 页面测试 |
| 取消计划 | P0 | 用户确认取消 | status=cancelled | 不物理删除 | API 测试 |
| 删除计划 | P1 | 用户确认删除 | 从列表移除 | 软删除或 cancelled | API 测试 |
| 多端编辑冲突 | P2 | version 不一致 | 提示已有更新 | 乐观锁 version | 后续 |

## 8. 网络与系统错误

| 场景 | 优先级 | UI 行为 | 接口约束 |
| --- | --- | --- | --- |
| 网络断开 | P0 | 顶部横条“网络断开”，提供重试 | 失败请求可重放 |
| 5xx | P0 | toast“服务暂时不可用”，可重试 | 返回 requestId |
| 400 | P0 | modal 展示校验错误 | 返回 fieldErrors |
| 401 | P0 | refresh token，失败登出 | 错误码统一 |
| 403 | P0 | toast“权限不足” | 不泄露资源存在性 |
| 404 | P0 | 列表项消失并提示 | 幂等删除 |
| loading 超 10 秒 | P1 | 显示“加载较慢”+ 取消 | 前端 timeout |

## 9. 验收门槛

功能进入“完成”前必须满足：

- P0 场景有实现或明确的降级方案。
- P0 场景至少有单元测试、接口 mock 测试或人工验收记录之一。
- OCR 相关 P0 场景必须能用 `realtestcase/` 或 mock fixture 复现。
- 微信开发者工具预览编译通过。

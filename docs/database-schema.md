# Database Schema

本文档定义 v1 后端数据库落库模型。API 可使用 camelCase；数据库字段建议使用 snake_case。所有主表必须有 `id`、`created_at`、`updated_at`，需要软删除的业务表加 `deleted_at`。

## 1. Design Principles

- 系统内部关联使用稳定 ID/key，不使用中文名或别名做主键。
- OCR 原文、用户编辑值、原始图片引用必须保留，管理员映射回填不得覆盖原始数据。
- 报告和指标分层存储：一份报告可以包含多个指标类别。
- 影像报告 `analysis_policy=view_only`，只归档查看，不进入指标趋势。
- `mapping_status=pending/conflicted` 的指标可保存和展示，但不进入趋势、首页异常汇总和关注推荐。
- 写接口使用幂等键；批量保存报告必须支持重复报告检测和用户确认覆盖。

## 2. Core Tables

### users

| field | type | note |
| --- | --- | --- |
| id | uuid | 用户 ID |
| wx_openid | varchar(128) unique | 微信 openid |
| wx_unionid | varchar(128) nullable | 微信 unionid |
| phone_encrypted | text nullable | 加密手机号 |
| status | varchar(32) | active/disabled |

### profiles

| field | type | note |
| --- | --- | --- |
| id | uuid | 档案 ID |
| user_id | uuid | owner user |
| relation | varchar(32) | 妈妈/爸爸/自己等 |
| real_name | varchar(64) | 档案姓名 |
| gender | varchar(16) nullable | F/M/unknown |
| birth_date | date nullable | 出生日期 |
| disease_type | varchar(128) nullable | 疾病类型 |
| diagnosed_at | date nullable | 确诊日期 |
| stage | varchar(64) nullable | 分期 |
| treatment_phase | varchar(64) nullable | 治疗阶段 |
| primary_hospital | varchar(128) nullable | 常用医院 |
| primary_doctor | varchar(64) nullable | 常用医生 |
| primary_department | varchar(64) nullable | 常用科室 |
| deleted_at | timestamptz nullable | 软删除 |

Indexes:

- `(user_id, deleted_at)`

### report_types

报告类型主数据。别名只进入映射表，不作为业务主键。

| field | type | note |
| --- | --- | --- |
| id | uuid | 主数据 ID |
| type_key | varchar(128) unique | 稳定业务编码，如 `thyroid_function` |
| canonical_name | varchar(128) | 标准名 |
| modality | varchar(32) | laboratory/imaging/pathology/other |
| default_analysis_policy | varchar(32) | metric_analysis/view_only |
| status | varchar(32) | active/inactive |

### metric_categories

| field | type | note |
| --- | --- | --- |
| id | uuid | 分类 ID |
| category_key | varchar(128) unique | 如 `blood_lipid` |
| name_cn | varchar(128) | 血脂 |
| sort_order | int | 展示排序 |
| status | varchar(32) | active/inactive |

### metric_definitions

| field | type | note |
| --- | --- | --- |
| id | uuid | 指标主数据 ID |
| metric_key | varchar(128) unique | 稳定业务编码，如 `tc` |
| name_cn | varchar(128) | 标准指标名 |
| name_en | varchar(128) nullable | 英文名/缩写 |
| category_id | uuid | 指标分类 |
| value_type | varchar(32) | quantitative/qualitative |
| default_unit | varchar(64) nullable | 标准单位 |
| status | varchar(32) | active/pending/inactive |

Indexes:

- `(category_id, status)`

### mapping_rules

已发布映射规则，生产归集只使用这里的规则。

| field | type | note |
| --- | --- | --- |
| id | uuid | 规则 ID |
| rule_type | varchar(32) | report_type_alias/metric_alias/unit_alias |
| raw_name | varchar(256) | OCR 原文或别名 |
| raw_unit | varchar(64) nullable | 原始单位 |
| hospital_scope | varchar(128) nullable | 可按医院限定 |
| report_type_id | uuid nullable | 命中的报告类型 |
| metric_id | uuid nullable | 命中的指标 |
| category_id | uuid nullable | 建议分类 |
| normalized_unit | varchar(64) nullable | 标准单位 |
| confidence | numeric(5,4) | 规则置信度 |
| version | int | 发布版本 |
| status | varchar(32) | published/retired |

Indexes:

- `(rule_type, raw_name, raw_unit, status)`
- `(version, status)`

### mapping_review_items

未知项、冲突项、低置信度项的管理员审核队列。

| field | type | note |
| --- | --- | --- |
| id | uuid | 审核项 ID |
| kind | varchar(32) | metric_alias/report_type_alias/unit_alias/conflict |
| raw_name | varchar(256) | OCR 原文 |
| raw_unit | varchar(64) nullable | 原始单位 |
| report_original_type | varchar(256) nullable | 报告原始类型 |
| suggested_metric_id | uuid nullable | 系统建议 |
| suggested_report_type_id | uuid nullable | 系统建议 |
| suggested_category_id | uuid nullable | 系统建议 |
| mapping_status | varchar(32) | pending/conflicted/resolved/ignored |
| confidence | numeric(5,4) | 建议置信度 |
| sample_count | int | 出现次数 |
| first_seen_at | timestamptz | 首次出现 |
| last_seen_at | timestamptz | 最近出现 |
| resolved_by | uuid nullable | 管理员 |
| resolved_at | timestamptz nullable | 处理时间 |

Indexes:

- `(mapping_status, last_seen_at)`
- `(kind, raw_name, raw_unit)`

### report_photos

| field | type | note |
| --- | --- | --- |
| id | uuid | 图片 ID |
| profile_id | uuid | 档案 ID |
| user_id | uuid | 上传用户 |
| object_key | varchar(512) | 对象存储 key |
| thumbnail_object_key | varchar(512) nullable | 缩略图 key |
| mime_type | varchar(64) | image/jpeg 等 |
| size_bytes | bigint | 文件大小 |
| sha256 | varchar(128) nullable | 去重辅助 |
| status | varchar(32) | uploaded/ocr_used/deleted |

Indexes:

- `(profile_id, created_at)`
- `(sha256)`

### ocr_tasks

| field | type | note |
| --- | --- | --- |
| id | uuid | OCR 任务 ID |
| profile_id | uuid | 档案 ID |
| user_id | uuid | 发起用户 |
| status | varchar(32) | queued/processing/needs_confirmation/confirmed/failed/cancelled |
| photo_count | int | 图片数 |
| report_count | int | 识别报告数 |
| error_code | varchar(64) nullable | 失败码 |
| error_message | text nullable | 失败信息 |
| idempotency_key | varchar(128) nullable | 幂等键 |

Indexes:

- `(profile_id, status, created_at)`
- unique `(user_id, idempotency_key)` where `idempotency_key is not null`

### ocr_task_photos

| field | type | note |
| --- | --- | --- |
| id | uuid | 关联 ID |
| ocr_task_id | uuid | OCR 任务 |
| photo_id | uuid | 图片 |
| group_id | varchar(128) | 前端分组 |
| sort_order | int | 组内顺序 |

Indexes:

- `(ocr_task_id, group_id, sort_order)`

### recognized_report_drafts

保存 OCR 识别后、用户确认前的草稿。用户编辑 OCR 结果时更新这里。

| field | type | note |
| --- | --- | --- |
| id | uuid | draft ID |
| ocr_task_id | uuid | OCR 任务 |
| profile_id | uuid | 档案 ID |
| source_photo_ids | jsonb | 来源图片 ID 列表 |
| page_count | int | 页数 |
| basic_info | jsonb | type/originalType/typeKey/hospital/reportDate/source 等 |
| metrics | jsonb | 识别指标草稿 |
| findings | jsonb | 影像所见 |
| conflicts | jsonb | 待用户处理冲突 |
| warnings | jsonb | 低置信度/推测字段等提示 |
| status | varchar(32) | needs_review/has_conflict/ready_to_save/saved |
| version | int | 乐观锁 |

Indexes:

- `(ocr_task_id, status)`
- `(profile_id, created_at)`

### reports

| field | type | note |
| --- | --- | --- |
| id | uuid | 报告 ID |
| profile_id | uuid | 档案 ID |
| user_id | uuid | 创建用户 |
| ocr_task_id | uuid nullable | 来源 OCR 任务 |
| draft_id | uuid nullable | 来源草稿 |
| type | varchar(128) | 展示类型，保留医院名称 |
| original_type | varchar(256) | OCR 原始报告名 |
| report_type_id | uuid nullable | 报告类型主数据 |
| type_key | varchar(128) | 稳定编码冗余 |
| canonical_type_name | varchar(128) | 标准名冗余 |
| modality | varchar(32) | laboratory/imaging/pathology/other |
| exam_part | varchar(128) nullable | 胸部/腹部盆腔等 |
| exam_method | varchar(128) nullable | 平扫/增强等 |
| analysis_policy | varchar(32) | metric_analysis/view_only |
| hospital | varchar(128) | 医院 |
| hospital_source | varchar(32) | ocr/inferred_from_batch/user_edited/unknown |
| report_date | date | 报告日期 |
| report_date_source | varchar(32) | ocr/inferred_from_batch/user_edited/unknown |
| findings | jsonb | 影像所见 |
| warnings | jsonb | 保存后的提示 |
| abnormal_count | int | 异常指标数 |
| note | text nullable | 用户备注 |
| duplicate_group_id | uuid nullable | 重复报告组 |
| replaced_by_report_id | uuid nullable | 被覆盖时指向新报告 |
| deleted_at | timestamptz nullable | 软删除 |

Indexes:

- `(profile_id, report_date desc, deleted_at)`
- `(profile_id, type_key, report_date, hospital)`
- `(ocr_task_id)`
- `(duplicate_group_id)`

### report_metric_values

| field | type | note |
| --- | --- | --- |
| id | uuid | 指标值 ID |
| report_id | uuid | 报告 ID |
| profile_id | uuid | 档案 ID |
| metric_id | uuid nullable | 指标主数据 |
| metric_key | varchar(128) | 稳定编码冗余 |
| metric_name | varchar(128) | 标准名/展示名 |
| original_metric_name | varchar(256) | OCR 原始名 |
| category_id | uuid nullable | 分类主数据 |
| category | varchar(128) | 分类编码冗余 |
| category_cn | varchar(128) | 分类名冗余 |
| mapping_status | varchar(32) | confirmed/suggested/pending/conflicted |
| value_type | varchar(32) | quantitative/qualitative |
| value_numeric | numeric nullable | 数值 |
| value_qualitative | varchar(64) nullable | 阳性/阴性等 |
| unit | varchar(64) nullable | 原始/展示单位 |
| normalized_unit | varchar(64) nullable | 标准单位 |
| ref_range_low | numeric nullable | 下限 |
| ref_range_high | numeric nullable | 上限 |
| ref_qualitative | varchar(64) nullable | 定性参考 |
| ref_text | text nullable | 复杂参考范围原文 |
| tone | varchar(32) | ok/low/high/positive/unknown |
| ocr_confidence | numeric(5,4) nullable | OCR 置信度 |
| is_manually_edited | boolean | 用户是否编辑 |
| source_photo_ids | jsonb nullable | 来源图片 |

Indexes:

- `(profile_id, metric_key, report_date)` 其中 `report_date` 可冗余或通过 report join。
- `(report_id)`
- `(mapping_status)`

### user_metric_snapshots

| field | type | note |
| --- | --- | --- |
| id | uuid | 快照 ID |
| profile_id | uuid | 档案 |
| metric_key | varchar(128) | 指标 |
| metric_id | uuid nullable | 指标主数据 |
| metric_name | varchar(128) | 展示名 |
| category | varchar(128) | 分类 |
| category_cn | varchar(128) | 分类名 |
| value_type | varchar(32) | quantitative/qualitative |
| last_value_numeric | numeric nullable | 最新数值 |
| last_value_qualitative | varchar(64) nullable | 最新定性 |
| unit | varchar(64) nullable | 单位 |
| last_date | date | 最新报告日期 |
| last_report_id | uuid | 最新报告 |
| last_tone | varchar(32) | ok/low/high/positive |
| trend_direction | varchar(32) | up/down/flat/new/none |
| trend_label | varchar(64) | 趋势文案 |
| measure_count | int | 有效记录数 |
| is_pinned | boolean | 用户关注 |

Constraints:

- unique `(profile_id, metric_key)`

Snapshot excludes:

- `reports.analysis_policy = view_only`
- `report_metric_values.mapping_status in ('pending', 'conflicted')`
- deleted reports

### duplicate_report_candidates

保存前检测出的疑似重复报告。用于前端提示覆盖或跳过。

| field | type | note |
| --- | --- | --- |
| id | uuid | 候选 ID |
| profile_id | uuid | 档案 |
| ocr_task_id | uuid nullable | 来源任务 |
| draft_id | uuid nullable | 草稿 |
| existing_report_id | uuid | 已存在报告 |
| match_level | varchar(32) | strong/possible |
| match_reason | jsonb | hospital/date/type/metrics/photoHash 等 |
| status | varchar(32) | pending/resolved/ignored |

Indexes:

- `(profile_id, status, created_at)`
- `(draft_id, existing_report_id)`

### recheck_plans

| field | type | note |
| --- | --- | --- |
| id | uuid | 复查计划 |
| profile_id | uuid | 档案 |
| type | varchar(128) | 复查类型 |
| date | date | 复查日期 |
| time_of_day | varchar(32) nullable | 上午/下午 |
| hospital | varchar(128) | 医院 |
| department | varchar(128) nullable | 科室 |
| doctor | varchar(64) nullable | 医生 |
| status | varchar(32) | pending/done/cancelled |
| reminder_config | jsonb | 提醒配置 |

### recheck_todos

| field | type | note |
| --- | --- | --- |
| id | uuid | todo |
| plan_id | uuid | 复查计划 |
| text | varchar(256) | 待办文案 |
| sort_order | int | 排序 |
| is_done | boolean | 是否完成 |
| is_template | boolean | 是否模板项 |

## 3. Duplicate Detection

保存 OCR 草稿前，后端对每份 draft 检测是否可能重复：

Strong duplicate:

- 同一 `profile_id`
- `report_date` 相同
- `type_key + exam_part + exam_method` 相同
- 检查结果相同或高度一致；数值/定性指标以 `metric_key + value + unit` 比较
- `hospital` 相同、归一化后相似，或医院不同但检查结果高度一致
- 且已有报告未删除

Possible duplicate:

- 日期相同且报告类型相同，但医院缺失/推测。
- 图片 hash 相同。
- 指标集合高度重叠，例如 metricKey 重合率超过 80%，但结果值不完全一致。

默认策略：

- API 返回重复候选，不直接覆盖。
- 前端提示用户“已存在相似报告，请选择覆盖旧报告或跳过重复报告”。
- 用户选择 `replace` 时：旧报告软删除或标记 `replaced_by_report_id`，新报告成为有效版本。
- 普通用户 v1 不提供 `keep_both` 入口；该能力仅为后续管理员/高级纠错保留。
- 用户未确认时：返回 409 或 `requiresDuplicateDecision=true`，不写入正式报告。

## 4. Backfill Safety

管理员发布新映射后的回填只允许更新标准化字段：

- reports: `report_type_id/type_key/canonical_type_name/analysis_policy`
- report_metric_values: `metric_id/metric_key/metric_name/category_id/category/category_cn/mapping_status/normalized_unit`
- user_metric_snapshots: 重新计算

不得覆盖：

- `original_type`
- `original_metric_name`
- `value_numeric/value_qualitative`
- `unit`
- `ref_text`
- `ocr_confidence`
- `is_manually_edited=true` 的用户校准字段
- 原图和 OCR 原始草稿

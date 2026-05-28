# API Contract

本文档定义 v1 前后端接口合约。字段默认使用 camelCase；后端如使用 snake_case，应在 API 边界统一转换。所有响应均为 JSON。

## 1. 通用约定

### 1.1 Base URL

- 开发：`https://dev-api.example.com`
- 生产：待域名备案与小程序合法域名配置后确定。

### 1.2 鉴权

除登录和公开协议页面外，请求头必须带：

```http
Authorization: Bearer <token>
X-Request-Id: <uuid>
```

### 1.3 通用成功响应

```json
{
  "data": {},
  "requestId": "req_123"
}
```

列表响应：

```json
{
  "data": [],
  "page": {
    "cursor": "next_cursor_or_null",
    "hasMore": false
  },
  "requestId": "req_123"
}
```

### 1.4 通用错误响应

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "请检查输入内容",
    "details": {
      "fieldErrors": {
        "hospital": "医院不能为空"
      }
    }
  },
  "requestId": "req_123"
}
```

标准错误码：

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | 参数或业务校验失败 |
| 401 | `UNAUTHORIZED` | token 缺失/过期 |
| 403 | `FORBIDDEN` | 无权访问 |
| 404 | `NOT_FOUND` | 资源不存在或已删除 |
| 409 | `CONFLICT` | 版本冲突或重复提交 |
| 409 | `DUPLICATE_REPORT_REQUIRES_DECISION` | 疑似重复报告，需要用户选择覆盖或跳过 |
| 413 | `PAYLOAD_TOO_LARGE` | 文件过大 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 文件格式不支持 |
| 429 | `RATE_LIMITED` | 请求过于频繁 |
| 500 | `INTERNAL_ERROR` | 服务异常 |

### 1.5 幂等

写接口支持：

```http
Idempotency-Key: <uuid>
```

必须支持幂等的接口：

- 创建 OCR 任务。
- 批量保存报告。
- 检测重复报告。
- 创建复查计划。
- 删除报告。

## 2. 核心类型

### 2.1 Profile

```json
{
  "id": "profile_mom",
  "relation": "妈妈",
  "realName": "王芳",
  "gender": "F",
  "birthDate": "1968-03-12",
  "phone": "138****1234",
  "diseaseType": "乳腺癌",
  "diagnosedAt": "2024-05-01",
  "stage": "IIA",
  "treatmentPhase": "treating",
  "primaryHospital": "协和医院",
  "primaryDoctor": "李医生",
  "primaryDepartment": "肿瘤科",
  "createdAt": "2026-05-27T00:00:00+08:00",
  "updatedAt": "2026-05-27T00:00:00+08:00"
}
```

### 2.2 Report

```json
{
  "id": "report_1",
  "profileId": "profile_mom",
  "type": "血常规",
  "originalType": "血常规",
  "typeKey": "blood_routine",
  "canonicalTypeName": "血常规",
  "modality": "laboratory",
  "examPart": "",
  "examMethod": "",
  "hospital": "协和医院",
  "hospitalSource": "ocr",
  "reportDate": "2026-04-28",
  "reportDateSource": "ocr",
  "thumbnailUrls": ["https://..."],
  "imageUrls": ["https://signed-url..."],
  "ocrTaskId": "ocr_1",
  "draftId": "draft_1",
  "note": "",
  "abnormalCount": 2,
  "analysisPolicy": "metric_analysis",
  "duplicateGroupId": null,
  "replacedByReportId": null,
  "createdAt": "2026-05-27T00:00:00+08:00",
  "updatedAt": "2026-05-27T00:00:00+08:00"
}
```

影像报告示例：

```json
{
  "id": "report_ct_1",
  "profileId": "profile_mom",
  "type": "胸腹盆CT平扫",
  "originalType": "胸腹盆CT平扫",
  "typeKey": "ct_plain",
  "canonicalTypeName": "CT平扫",
  "modality": "imaging",
  "examPart": "胸部",
  "examMethod": "平扫",
  "hospital": "北京协和医院",
  "reportDate": "2025-12-24",
  "findings": ["双肺多发微、小结节，大致同前。"],
  "metrics": [],
  "analysisPolicy": "view_only"
}
```

### 2.3 ReportMetricValue

```json
{
  "id": "rmv_1",
  "reportId": "report_1",
  "metricKey": "wbc",
  "metricName": "白细胞",
  "originalMetricName": "白细胞",
  "category": "blood_routine",
  "categoryCn": "血常规",
  "mappingStatus": "confirmed",
  "valueType": "quantitative",
  "valueNumeric": 3.2,
  "valueQualitative": null,
  "unit": "×10⁹/L",
  "refRangeLow": 3.5,
  "refRangeHigh": 10.0,
  "refQualitative": null,
  "refText": null,
  "tone": "low",
  "ocrConfidence": 0.92,
  "isManuallyEdited": false
}
```

### 2.4 MetricSnapshot

```json
{
  "profileId": "profile_mom",
  "metricKey": "wbc",
  "metricName": "白细胞",
  "category": "blood_routine",
  "categoryCn": "血常规",
  "valueType": "quantitative",
  "lastValueNumeric": 3.2,
  "lastValueQualitative": null,
  "unit": "×10⁹/L",
  "lastDate": "2026-04-28",
  "lastReportId": "report_1",
  "lastTone": "low",
  "trendDirection": "down",
  "trendLabel": "持续下降",
  "measureCount": 4,
  "isPinned": true,
  "updatedAt": "2026-05-27T00:00:00+08:00"
}
```

### 2.5 OcrTask

```json
{
  "id": "ocr_1",
  "profileId": "profile_mom",
  "status": "processing",
  "photoCount": 4,
  "reportCount": 3,
  "progress": {
    "processedReports": 1,
    "totalReports": 3
  },
  "createdAt": "2026-05-27T00:00:00+08:00",
  "updatedAt": "2026-05-27T00:00:05+08:00"
}
```

### 2.6 RecognizedReportDraft

```json
{
  "draftId": "draft_1",
  "sourcePhotoIds": ["photo_1", "photo_2"],
  "pageCount": 2,
  "basicInfo": {
    "type": "甲功1",
    "originalType": "甲功1",
    "typeKey": "thyroid_function",
    "canonicalTypeName": "甲状腺功能",
    "hospital": "协和医院",
    "hospitalSource": "ocr",
    "reportDate": "2026-04-28",
    "reportDateSource": "ocr",
    "modality": "laboratory",
    "examPart": "",
    "examMethod": "",
    "confidence": 0.88
  },
  "metrics": [],
  "conflicts": [],
  "warnings": [
    {
      "code": "BASIC_INFO_MISMATCH",
      "message": "合并页面的医院或日期不一致"
    }
  ],
  "status": "needs_review"
}
```

### 2.7 MappingStatus and FieldSource

报告类型和指标名不以展示文案作为归集依据，必须使用标准化 key。

`mappingStatus`:

- `confirmed`: 已由系统规则或管理员确认。
- `suggested`: 系统有较高置信度建议，但仍允许用户/管理员校准。
- `pending`: 暂无可靠映射，先保存但默认不进入跨报告趋势。
- `conflicted`: 存在多个可能映射或历史规则冲突，等待管理员处理。

`FieldSource`:

- `ocr`: OCR 直接识别。
- `inferred_from_batch`: 根据同批上传报告推测。
- `user_edited`: 用户在确认页编辑。
- `unknown`: 缺失或无法确定。

### 2.8 MappingReviewItem

当 OCR 或保存流程发现未知指标、未知报告类型、低置信度映射或规则冲突时，后端创建审核项。审核项用于完善映射库，不阻塞用户报告归档。

```json
{
  "id": "review_1",
  "kind": "metric_alias",
  "rawName": "促肾上腺皮质激素",
  "rawUnit": "pg/ml",
  "reportOriginalType": "血浆ACTH (8AM)",
  "suggestedMetricKey": "acth",
  "suggestedCategory": "endocrine",
  "mappingStatus": "pending",
  "confidence": 0.82,
  "sampleCount": 3,
  "firstSeenAt": "2026-05-28T00:00:00+08:00",
  "lastSeenAt": "2026-05-28T00:00:00+08:00",
  "exampleReportMetricValueIds": ["rmv_1", "rmv_2"]
}
```

管理员发布映射后的回填任务必须遵守：

- 保留 `originalType`、`originalMetricName`、原始单位、原始数值、OCR 置信度和用户编辑记录。
- 只更新 `typeKey`、`canonicalTypeName`、`metricKey`、`category`、`categoryCn`、`mappingStatus` 等标准化字段。
- 回填后重算相关 `UserMetricSnapshot`、趋势、异常聚合。
- 对已 `user_edited` 的字段不得静默覆盖；需要管理员确认或保留用户值优先。

## 3. Auth

### POST `/api/auth/wx-login`

请求：

```json
{
  "code": "wx_login_code"
}
```

响应：

```json
{
  "data": {
    "token": "jwt",
    "refreshToken": "refresh_jwt",
    "userId": "user_1",
    "isNewUser": false
  },
  "requestId": "req_123"
}
```

### POST `/api/auth/refresh`

请求：

```json
{
  "refreshToken": "refresh_jwt"
}
```

响应同登录。

### POST `/api/auth/logout`

响应：

```json
{
  "data": { "ok": true },
  "requestId": "req_123"
}
```

## 4. Profiles

### GET `/api/profiles`

响应：

```json
{
  "data": [
    {
      "id": "profile_mom",
      "relation": "妈妈",
      "realName": "王芳",
      "summary": "乳腺癌 · 治疗中",
      "avatarText": "芳"
    }
  ],
  "requestId": "req_123"
}
```

### POST `/api/profiles`

请求：

```json
{
  "relation": "妈妈",
  "realName": "王芳",
  "gender": "F",
  "birthDate": "1968-03-12",
  "diseaseType": "乳腺癌",
  "diagnosedAt": "2024-05-01"
}
```

响应：`Profile`。

### GET `/api/profiles/{profileId}`

响应：`Profile`。

### PATCH `/api/profiles/{profileId}`

请求：Profile 的局部字段。

响应：`Profile`。

### DELETE `/api/profiles/{profileId}`

软删除档案。若后端因存在有效数据不允许删除，返回 409。

## 5. Upload And OCR

### POST `/api/uploads/sign`

为前端直传图片生成签名 URL。

请求：

```json
{
  "profileId": "profile_mom",
  "files": [
    {
      "clientFileId": "local_1",
      "fileName": "report1.jpg",
      "mimeType": "image/jpeg",
      "size": 1234567
    }
  ]
}
```

响应：

```json
{
  "data": {
    "uploads": [
      {
        "clientFileId": "local_1",
        "photoId": "photo_1",
        "uploadUrl": "https://cos-upload-url",
        "headers": {},
        "expiresAt": "2026-05-27T01:00:00+08:00"
      }
    ]
  },
  "requestId": "req_123"
}
```

### POST `/api/uploads/complete`

客户端直传图片成功后调用本接口，把图片状态从 `signed` 标记为 `uploaded`。后续创建 OCR 任务应使用已完成上传的 `photoId`。

请求：
```json
{
  "profileId": "profile_mom",
  "uploads": [
    {
      "photoId": "photo_1",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```

响应：
```json
{
  "data": {
    "photos": [
      {
        "photoId": "photo_1",
        "objectKey": "profiles/profile_mom/reports/...",
        "status": "uploaded",
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  },
  "requestId": "req_123"
}
```

### POST `/api/ocr/tasks`

请求：

```json
{
  "profileId": "profile_mom",
  "photos": [
    { "photoId": "photo_1", "groupId": "group_1", "sortOrder": 1 },
    { "photoId": "photo_2", "groupId": "group_1", "sortOrder": 2 },
    { "photoId": "photo_3", "groupId": "photo_3", "sortOrder": 1 },
    { "photoId": "photo_4", "groupId": "photo_4", "sortOrder": 1 }
  ]
}
```

说明：
- 正常上传链路使用 `profileId + photos`，其中 `photoId` 来自 `/api/uploads/sign`，并必须先通过 `/api/uploads/complete` 标记完成；仍处于 `signed` 状态的图片不能创建 OCR 任务。
- Fixture 旁路可使用 `fixtureCaseIds` 创建结构化 OCR 草稿，用于本地回归和业务闭环测试；生产环境应关闭或限制该入口。

响应：

```json
{
  "data": {
    "id": "ocr_1",
    "profileId": "profile_mom",
    "status": "queued",
    "photoCount": 4,
    "reportCount": 3
  },
  "requestId": "req_123"
}
```

### GET `/api/ocr/tasks`

查询当前用户未完成任务。

参数：

- `profileId` 可选。
- `status` 可选，逗号分隔。

响应：`OcrTask[]`。

### GET `/api/ocr/tasks/{taskId}`

响应：

```json
{
  "data": {
    "id": "ocr_1",
    "profileId": "profile_mom",
    "status": "needs_confirmation",
    "photoCount": 4,
    "reportCount": 3,
    "drafts": []
  },
  "requestId": "req_123"
}
```

### POST `/api/ocr/tasks/{taskId}/retry`

重试失败任务或失败图片。

请求：

```json
{
  "draftId": "draft_1",
  "photoIds": ["photo_1"]
}
```

响应：`OcrTask`。

### POST `/api/ocr/tasks/{taskId}/cancel`

取消任务并清理未保存草稿。

响应：

```json
{
  "data": { "ok": true },
  "requestId": "req_123"
}
```

### PATCH `/api/ocr/tasks/{taskId}/drafts/{draftId}`

确认页编辑 OCR 草稿。后端只更新草稿，不创建正式报告。

请求：

```json
{
  "basicInfo": {
    "type": "甲功1",
    "hospital": "北京协和医院",
    "hospitalSource": "user_edited",
    "reportDate": "2025-12-22",
    "reportDateSource": "user_edited",
    "examPart": "",
    "examMethod": ""
  },
  "metrics": [
    {
      "metricKey": "ft3",
      "valueType": "quantitative",
      "valueNumeric": 3.65,
      "unit": "pg/ml",
      "refRangeLow": 1.8,
      "refRangeHigh": 4.1,
      "isManuallyEdited": true
    }
  ],
  "findings": [],
  "version": 3
}
```

响应：`RecognizedReportDraft`。

错误：

- `409 CONFLICT`: draft version 已变化，前端应重新加载。

## 6. Reports

### GET `/api/profiles/{profileId}/reports`

参数：

- `limit` 默认 20。
- `cursor` 分页游标。
- `view=time|recent` 可选。

响应：`Report[]`。

### GET `/api/reports/{reportId}`

响应：

```json
{
  "data": {
    "report": {},
    "groups": [
      {
        "category": "blood_routine",
        "categoryCn": "血常规",
        "items": []
      }
    ]
  },
  "requestId": "req_123"
}
```

### POST `/api/reports/duplicate-check`

保存前检测 OCR 草稿是否与已有报告重复。前端在调用批量保存前应先调用本接口；若返回候选项，需要弹窗让用户选择覆盖或跳过。

请求：

```json
{
  "profileId": "profile_mom",
  "ocrTaskId": "ocr_1",
  "reports": [
    {
      "draftId": "draft_1",
      "basicInfo": {
        "type": "甲功1",
        "typeKey": "thyroid_function",
        "hospital": "北京协和医院",
        "reportDate": "2025-12-22",
        "modality": "laboratory",
        "examPart": "",
        "examMethod": ""
      },
      "sourcePhotoIds": ["photo_1"],
      "metrics": [
        { "metricKey": "ft3", "valueNumeric": 3.65, "unit": "pg/ml" }
      ]
    }
  ]
}
```

响应：

```json
{
  "data": {
    "hasDuplicates": true,
    "candidates": [
      {
        "draftId": "draft_1",
        "existingReportId": "report_old_1",
        "matchLevel": "strong",
        "matchReason": {
          "sameProfile": true,
          "sameReportDate": true,
          "sameHospital": true,
          "sameTypeKey": true,
          "metricOverlapRatio": 0.9
        },
        "suggestedDecision": "replace"
      }
    ]
  },
  "requestId": "req_123"
}
```

重复判断规则：

- `strong`: 同档案、同日期、同 `typeKey/examPart/examMethod`，且检查结果相同或高度一致；医院名称归一化后相同可增强判断，但不能因为“协和/北京协和医院”这类别名漏判。
- `possible`: 日期和类型相同但结果值不完全一致，或图片 hash/指标集合高度重叠。
- 影像报告使用 `typeKey + examPart + examMethod + reportDate + hospital` 判断；不同部位不视为重复。

### POST `/api/reports/batch-create`

请求：

```json
{
  "profileId": "profile_mom",
  "ocrTaskId": "ocr_1",
  "duplicateDecisions": [
    {
      "draftId": "draft_1",
      "decision": "replace",
      "existingReportId": "report_old_1"
    }
  ],
  "reports": [
    {
      "draftId": "draft_1",
      "basicInfo": {
        "type": "血常规",
        "originalType": "血常规",
        "typeKey": "blood_routine",
        "canonicalTypeName": "血常规",
        "modality": "laboratory",
        "examPart": "",
        "examMethod": "",
        "analysisPolicy": "metric_analysis",
        "hospital": "协和医院",
        "hospitalSource": "ocr",
        "reportDate": "2026-04-28",
        "reportDateSource": "ocr",
        "note": ""
      },
      "sourcePhotoIds": ["photo_1", "photo_2"],
      "metrics": [
        {
          "metricKey": "wbc",
          "metricName": "白细胞",
          "originalMetricName": "白细胞",
          "category": "blood_routine",
          "categoryCn": "血常规",
          "mappingStatus": "confirmed",
          "valueType": "quantitative",
          "valueNumeric": 3.2,
          "valueQualitative": null,
          "unit": "×10⁹/L",
          "refRangeLow": 3.5,
          "refRangeHigh": 10.0,
          "refQualitative": null,
          "refText": null,
          "ocrConfidence": 0.92,
          "isManuallyEdited": false
        }
      ],
      "findings": [],
      "warnings": []
    }
  ]
}
```

响应：

```json
{
  "data": {
    "reports": [
      {
        "draftId": "draft_1",
        "reportId": "report_1",
        "action": "created",
        "replacedReportId": null
      }
    ]
  },
  "requestId": "req_123"
}
```

`duplicateDecisions.decision`:

- `replace`: 覆盖旧报告。后端软删除旧报告或设置 `replacedByReportId`，创建新报告并重算快照。
- `keep_both`: 另存一份。后端可保留该能力给管理员/高级纠错场景；普通用户 v1 不展示该选项。
- `skip`: 不保存该 draft。

如果后端检测到重复但请求未提供对应决策，返回：

```json
{
  "error": {
    "code": "DUPLICATE_REPORT_REQUIRES_DECISION",
    "message": "发现相似报告，请选择覆盖旧报告或跳过重复报告",
    "details": {
      "candidates": []
    }
  },
  "requestId": "req_123"
}
```

### PATCH `/api/reports/{reportId}`

编辑报告基础信息、备注和指标。

请求：

```json
{
  "basicInfo": {
    "hospital": "协和医院",
    "reportDate": "2026-04-28",
    "note": "用户备注"
  },
  "metrics": []
}
```

响应：更新后的报告详情。

### DELETE `/api/reports/{reportId}`

软删除报告，并触发 snapshot 重算。

响应：

```json
{
  "data": { "ok": true },
  "requestId": "req_123"
}
```

## 7. Metrics

### GET `/api/profiles/{profileId}/metrics/snapshots`

参数：

- `filter=all|abnormal|pinned`。
- `category` 可选。

响应：`MetricSnapshot[]`。

### GET `/api/profiles/{profileId}/metrics/{metricKey}/history`

响应：

```json
{
  "data": {
    "metricKey": "wbc",
    "metricName": "白细胞",
    "valueType": "quantitative",
    "history": [
      {
        "reportId": "report_1",
        "reportDate": "2026-04-28",
        "hospital": "协和医院",
        "valueNumeric": 3.2,
        "unit": "×10⁹/L",
        "refRangeLow": 3.5,
        "refRangeHigh": 10.0,
        "tone": "low"
      }
    ]
  },
  "requestId": "req_123"
}
```

### PATCH `/api/profiles/{profileId}/metrics/{metricKey}/pin`

请求：

```json
{
  "isPinned": true
}
```

响应：`MetricSnapshot`。

### GET `/api/metrics/definitions`

查询预置指标定义，用于搜索、未知指标归类和指标说明。

参数：

- `keyword` 可选。
- `category` 可选。
- `status=active|pending` 可选。

## 8. Recheck Plans

### GET `/api/profiles/{profileId}/recheck-plans`

参数：

- `status=pending|done|cancelled` 可选。

响应：

```json
{
  "data": {
    "nextPlan": {},
    "otherPlans": [],
    "doneCount": 0
  },
  "requestId": "req_123"
}
```

### POST `/api/profiles/{profileId}/recheck-plans`

请求：

```json
{
  "type": "常规复查",
  "date": "2026-06-01",
  "timeOfDay": "上午",
  "hospital": "协和医院",
  "department": "肿瘤科",
  "todos": [
    { "text": "预约挂号", "sortOrder": 1, "isTemplate": true }
  ],
  "reminderConfig": {
    "advanceDays": [3, 1, 0],
    "subscribeAccepted": true
  }
}
```

响应：RecheckPlan。

### PATCH `/api/recheck-plans/{planId}`

编辑计划基础信息或状态。

请求：
```json
{
  "type": "常规复查",
  "date": "2026-06-20",
  "hospital": "协和东院",
  "department": "影像科"
}
```

日期必须为今天或未来日期；否则返回 `400 VALIDATION_FAILED`。

### PATCH `/api/recheck-plans/{planId}/todos/{todoId}`

请求：

```json
{
  "isDone": true
}
```

响应：更新后的 RecheckPlan。

### POST `/api/recheck-plans/{planId}/todos`

新增一条复查待办。

请求：
```json
{
  "text": "准备影像资料",
  "isDone": false,
  "isTemplate": false
}
```

响应：更新后的 RecheckPlan。

### POST `/api/recheck-plans/{planId}/complete`

标记完成。

### POST `/api/recheck-plans/{planId}/cancel`

取消计划。

## 9. Export

### POST `/api/profiles/{profileId}/exports`

v1 最小闭环生成 JSON 导出文件并返回 `ready` 状态；后续接对象存储时保持 `exportId/status/downloadUrl/expiresAt` 响应字段不变。

请求：

```json
{
  "includeReports": true,
  "includeMetrics": true,
  "includeRecheckPlans": true,
  "format": "zip"
}
```

响应：

```json
{
  "data": {
    "exportId": "export_1",
    "status": "processing"
  },
  "requestId": "req_123"
}
```

### GET `/api/exports/{exportId}`

响应：

```json
{
  "data": {
    "exportId": "export_1",
    "status": "ready",
    "downloadUrl": "https://signed-download-url",
    "expiresAt": "2026-05-28T00:00:00+08:00"
  },
  "requestId": "req_123"
}
```

## 10. Subscription Messages

### POST `/api/recheck-plans/{planId}/subscription`

记录用户是否授权订阅消息。

请求：

```json
{
  "templateId": "template_x",
  "accepted": true
}
```

响应：

```json
{
  "data": { "ok": true },
  "requestId": "req_123"
}
```

## 11. 前端开发顺序建议

1. 先实现 `utils/api.js`：鉴权、错误处理、requestId、refresh token、重试。
2. 再实现 mock adapter：让页面先按本文字段跑通。
3. 实现 OCR task mock：覆盖 processing、needs_confirmation、failed。
4. 接真实后端时保持页面数据结构不变，只替换 adapter。

## 12. 尚待后端确认

- JWT 有效期和 refresh token 有效期。
- 对象存储 provider、单图大小上限、图片保留周期。
- OCR task 是否通过轮询、订阅消息或 websocket 更新；v1 默认轮询 + 订阅消息。
- 数据库乐观锁字段是否采用 `version` 或 `updatedAt`。
- 导出文件格式和保留时间。

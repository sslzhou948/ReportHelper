# 数据模型

> 字段命名采用 camelCase（前端）/ snake_case（后端可自行转换）。所有 ID 用 string（snowflake / uuid）。

---

## 1. 实体关系总览

```
User (1) ──── (N) Report
              │
              └── (N) ReportMetricValue ── (1) Metric (定义表)

User (1) ──── (N) RecheckPlan
                  │
                  └── (N) RecheckTodo

User (1) ──── (1) UserProfile (病情、用药等档案)
                  │
                  └── (N) Medication
```

**关键关系**：

- 一个 User 有多个 Report
- 一个 Report 包含多个 ReportMetricValue（行）
- 多个 Report 的 ReportMetricValue 通过 metricKey 关联到同一个 Metric 定义，形成趋势

---

## 2. 实体定义

### 2.1 User

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 主键 |
| openid | string | 微信 openid，唯一 |
| unionid | string? | 微信 unionid（如果有） |
| nickname | string | 微信昵称（首次登录拿，可改） |
| avatarUrl | string | 微信头像 |
| createdAt | timestamp |  |
| lastActiveAt | timestamp |  |

### 2.2 UserProfile（个人档案）

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | string (FK) |  |
| realName | string |  |
| gender | enum | M / F / U |
| birthDate | date |  |
| phone | string | 加密存储 |
| diseaseType | string | "乳腺癌" 等 |
| diagnosedAt | date |  |
| stage | string | "IIA 期" 等 |
| treatmentPhase | enum | treating / recovery / other |
| primaryHospital | string |  |
| primaryDoctor | string |  |
| primaryDepartment | string |  |
| updatedAt | timestamp |  |

### 2.3 Medication

| 字段 | 类型 |
|------|------|
| id | string |
| userId | string (FK) |
| name | string | "他莫昔芬" |
| dosage | string | "10mg" |
| frequency | string | "每日 2 次" |
| startedAt | date |
| endedAt | date? | 仍在服用为 null |

### 2.4 Report（检查报告）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string |  |
| userId | string (FK) |  |
| type | string | "血常规" / "CT 胸部" / "肝功能" / ... |
| typeKey | string | 标准化键："blood_routine" / "ct_chest" / ... 见附录 |
| hospital | string | "协和医院" |
| reportDate | date | 检查日期 |
| imageUrls | string[] | 原始拍照图（最多 5 张） |
| ocrBatchId | string? | 关联到 OCR 会话 |
| note | string? | 用户备注 |
| abnormalCount | int | 异常项数（计算字段） |
| createdAt | timestamp |  |
| updatedAt | timestamp |  |

### 2.5 ReportMetricValue（报告中的指标值）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string |  |
| reportId | string (FK) |  |
| metricKey | string (FK → Metric.key) | 如 "wbc" / "hgb" |
| valueType | enum | quantitative / qualitative |
| valueNumeric | float? | 数值型时使用 |
| valueQualitative | string? | 定性型时使用："阴性" / "阳性" / "+" / "++" |
| unit | string? | 单位（数值型才有），如 "×10⁹/L" |
| refRangeLow | float? |  |
| refRangeHigh | float? |  |
| refQualitative | string? | 定性参考："阴性" |
| tone | enum | ok / high / low / positive |
| ocrConfidence | float? | OCR 置信度 0-1 |
| isManuallyEdited | bool | 用户是否手动改过 |
| createdAt | timestamp |  |

**注意**：数值/定性二选一，由 valueType 决定。

### 2.5.1 多类别报告的存储逻辑（重要）

**一份报告可以包含多种分类的指标**。例如医院的"综合生化"报告会同时含血常规、肝功能、肾功能、血脂等多个类别的指标。

存储规则：

- 报告本身只是"纸"的容器（Report 表），没有自己的"分类"
- 每个指标行（ReportMetricValue）通过 `metricKey` 关联到 Metric 定义表
- Metric 定义表里每个指标都有固定的 `category`（科学分类，不可变）
- 在"按指标"视图聚合时，按 `Metric.category` 分组，**与报告本身无关**

举例：
- 一份"综合生化"报告含 白细胞 + ALT + 肌酐
- 白细胞.category = blood_routine → 出现在"血常规"主题下
- ALT.category = liver_function → 出现在"肝功能"主题下
- 肌酐.category = kidney_function → 出现在"肾功能"主题下
- 三个指标都引用回同一份"综合生化"报告

**关键：永远不要把指标的分类继承自报告类型，必须从 Metric 定义表读取。**

---

### 2.5.2 参考范围的存储与异常判断（重要）

**不同医院的同一项指标，参考范围可能不同。** 例如：
- 协和医院 白细胞 参考 4.0-10.0
- 社区医院 白细胞 参考 3.5-9.5

**处理原则：遵从事实 + 单一异常判断标准的混合方案**

| 数据 | 来源 |
|------|------|
| 存储的参考范围 | **每次报告的原始值**，存在 `ReportMetricValue.refRangeLow/refRangeHigh` |
| 异常判断（tone 字段） | **按该次报告自己的参考范围**计算 |
| 曲线图的参考线 | **最新一次报告的参考范围**画一条虚线（不画色带） |
| 异常点颜色 | 按该次报告参考范围判断（每个点独立判断） |

**为什么这样**：

- 患者拿着原报告看时，UI 显示的异常/正常判断必须与医院一致（忠实）
- 曲线图避免"参考范围楼梯感"（不同次范围不同导致色带忽宽忽窄）
- 历史记录列表每行显示该次报告的具体参考范围

**视觉示例**（曲线图）：

```
   Y 轴刻度
   6 ───────────────────────
   5 ───────────────────────
        ●━━●━━●
   4 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   ← 单条参考线（最新一次的 4.0）
                ●━━●
                     ●━━●     ← 异常点（每个按自己参考范围染色）
   3 ───────────────────────
      11月  12月  1月  4月
```

**曲线图下方加小字注释**：
> 参考范围可能因医院不同有差异，每次报告的参考值见下方历史记录

**历史记录列表每行显示参考范围**：

```
4·28  3.2 ↓  参考 3.5-10.0
3·15  3.5 ↓  参考 4.0-10.0
2·10  3.8 ↓  参考 4.0-10.0
1·05  4.5    参考 4.0-10.0
```

---

### 2.5.3 未知指标 / 同义词 / 分类冲突处理（重要）

不同医院的报告中，**同一项指标可能用不同名字**（"红细胞" / "红细胞计数" / "RBC"），**或某些指标系统库里没有**。

**Metric 表新增字段**：

| 字段 | 说明 |
|------|------|
| `aliases` | 同义词数组：`["红细胞计数", "RBC", "红细胞"]` |
| `status` | `active`（正式入库）/ `pending`（待管理员审核） |
| `defaultCategory` | 科学分类（首次入库后稳定不变） |

**OCR 后的指标匹配流程**：

1. **匹配现有 `metricKey`**（精确名 + aliases 列表）→ 自动归类（最常见，95%+）
2. **完全不认识**：
   - 看报告里该指标印在哪个"栏目"下（如"肝功能"栏目）
   - 自动建议归类到该栏目对应的 category
   - 在确认页（上传 Step 3）显示提示："识别到 1 项新指标'血氨'，将归入'肝功能'主题，[调整分类]"
   - 用户可点"调整分类"改归到其他主题
   - 该指标以 `status: pending` 写入 Metric 表（保留用户选的 category）
3. **管理员后台审核**：定期把高频 pending 指标转为 active

**分类冲突的处理**：

A 医院把"中性粒细胞%"印在"白细胞分类"栏目，B 医院印在"血常规"栏目：

- **首次入库时**决定 category（比如选 blood_routine）
- **后续遇到同一指标**：**不改变已有分类**（保持稳定，避免"按指标"视图乱跳）
- 仅记录"跨医院分类差异"作为运营观察数据
- 用户视角：该指标始终在同一主题下

**未知指标的运行时显示**：

- 首次见到、且无法判断归属 → 暂归"其他"主题
- 数据保留，但不参与跨报告趋势分析（因为可能是 OCR 误识）
- 用户可手动调整归类

---

### 2.6 Metric（指标定义，预置 + 后端管理）

| 字段 | 类型 | 说明 |
|------|------|------|
| key | string (PK) | "wbc" / "hgb" / "cea" |
| nameCn | string | "白细胞" |
| nameEn | string? | "WBC" |
| category | string | "blood_routine" 主题分类 |
| categoryCn | string | "血常规" |
| valueType | enum | quantitative / qualitative |
| defaultUnit | string? | "×10⁹/L" |
| defaultRefLow | float? |  |
| defaultRefHigh | float? |  |
| defaultRefQualitative | string? |  |
| clinicalMeaning | text? | 临床意义（用于"指标说明"页面） |

**[需确认]**：

- 预置多少个指标？建议先覆盖常用 100-200 个，OCR 识别到未知指标时记为"其他"
- 是否允许用户提交新指标请求？

### 2.7 UserMetricSnapshot（指标快照，用于性能优化）

> 这是个聚合表，**可选实现**。每次 Report 写入时同步更新该表，避免每次进健康数据页都跑聚合查询。

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | string (FK) |  |
| metricKey | string (FK) |  |
| lastValueNumeric | float? |  |
| lastValueQualitative | string? |  |
| lastDate | date |  |
| lastReportId | string |  |
| lastTone | enum |  |
| trendDirection | enum | up / down / flat / new |
| trendLabel | string | "持续下降" / "略上升" / "平稳" |
| measureCount | int | 总测量次数 |
| isPinned | bool | 是否被用户钉在首页 |
| updatedAt | timestamp |  |

### 2.8 RecheckPlan（复查计划）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string |  |
| userId | string (FK) |  |
| type | string | "常规复查" / "CT 检查" / "血检" / ... |
| date | date | 复查日期 |
| timeOfDay | string? | "上午" / "下午" / 具体时间 |
| hospital | string |  |
| department | string? |  |
| doctor | string? |  |
| status | enum | pending / done / cancelled |
| completedAt | timestamp? |  |
| reminderConfig | jsonb | { advance: [3, 1, 0] } 提前几天提醒 |
| createdAt | timestamp |  |

### 2.9 RecheckTodo（复查待办）

| 字段 | 类型 |
|------|------|
| id | string |
| planId | string (FK) |
| text | string |
| isDone | bool |
| doneAt | timestamp? |
| sortOrder | int |
| isTemplate | bool | true = 由模板生成；false = 用户自定义 |

---

## 3. 数据生命周期

### 3.1 Report 的生命周期

```
草稿（未保存）   localStorage / batchId  ─┐
                                           │ 用户点保存
已保存          DB.reports.status = active ◄┘
                                           │ 用户删除
已删除          软删除：deletedAt 字段     ─┘
```

- 软删除保留 30 天可恢复
- 30 天后物理删除（包括原图）

### 3.2 UserMetricSnapshot 的更新

每次 Report 保存 / 编辑 / 删除时触发：

1. 找出该 report 涉及的所有 metricKey
2. 对每个 metricKey 重算：
   - 最新值（取该 user 该 metric 中 date 最大的）
   - 趋势：基于最近 3 次值算
3. 更新或插入 snapshot

### 3.3 RecheckPlan 状态机

```
pending ─── 用户勾完待办 + 点完成 ───► done
   │
   └── 用户取消 ───► cancelled (软删除)
```

---

## 4. 索引建议

| 表 | 索引 |
|----|------|
| reports | (userId, reportDate desc) — 按时间列表查询 |
| report_metric_values | (reportId), (metricKey, userId) — 指标趋势查询 |
| user_metric_snapshot | (userId, isPinned, lastDate desc) — 首页关注指标 |
| recheck_plans | (userId, status, date asc) — 计划列表 |

---

## 5. 隐私与加密

- **手机号** 加密存储（AES-256，密钥不入库）
- **报告原图** 存对象存储（OSS / COS），URL 用临时签名（1 小时有效）
- **用户档案**（病种、用药）不做字段级加密，但访问需 token + userId 双校验
- **OCR 调用** 走专用通道，OCR 服务方不存图片

---

## 6. 附录：报告类型 typeKey 建议清单

```
blood_routine       血常规
liver_function      肝功能
kidney_function     肾功能
tumor_markers       肿瘤标志物
ct_chest            CT 胸部
ct_abdomen          CT 腹部
mri_*               MRI（按部位）
ultrasound_*        超声（按部位）
ecg                 心电图
urinalysis          尿常规
stool_routine       便常规
endocrine           内分泌
immunology          免疫
pathology           病理（仅用于记录，不展示详细指标）
other               其他
```

**[需确认：覆盖范围是否合理，是否需要扩展或精简]**

---

## 7. 附录：常用 Metric 预置示例（部分）

| key | nameCn | category | valueType | unit | refLow | refHigh |
|-----|--------|----------|-----------|------|--------|---------|
| wbc | 白细胞 | blood_routine | quantitative | ×10⁹/L | 4.0 | 10.0 |
| hgb | 血红蛋白 | blood_routine | quantitative | g/L | 120 | 160 |
| plt | 血小板 | blood_routine | quantitative | ×10⁹/L | 125 | 350 |
| rbc | 红细胞 | blood_routine | quantitative | ×10¹²/L | 4.0 | 5.5 |
| alt | ALT 谷丙转氨酶 | liver_function | quantitative | U/L | 0 | 40 |
| ast | AST 谷草转氨酶 | liver_function | quantitative | U/L | 0 | 40 |
| cea | CEA 癌胚抗原 | tumor_markers | quantitative | ng/mL | 0 | 5.0 |
| afp | AFP 甲胎蛋白 | tumor_markers | quantitative | ng/mL | 0 | 20 |
| ca153 | CA15-3 | tumor_markers | quantitative | U/mL | 0 | 31.3 |
| hbsag | HBsAg 乙肝表面抗原 | immunology | qualitative | — | — | 阴性 |

完整清单建议由临床顾问审核后补充，最终入库前**[需确认]**。

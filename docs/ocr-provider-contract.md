# OCR Provider Contract

Updated: 2026-05-30

本文档定义 OCR provider 的输入、输出和替换边界。当前开发阶段可以用 GPT 视觉能力实现 provider；未来购买专业 OCR API 后，只替换 provider adapter，不改小程序页面、确认页、报告保存、查重和健康数据聚合逻辑。

## 1. Design Goal

- 小程序端不直接调用 GPT、OCR API 或对象存储。
- 小程序端只调用后端 `/api/ocr/tasks`。
- 后端通过 `OcrProvider` 抽象调用具体识别能力。
- provider 输出必须转换为系统内部 `RecognizedReportDraft` 草稿结构。
- GPT provider、商业 OCR provider、fixture provider 都必须遵守同一份 `ocr_draft_v1` schema。
- OCR 只负责“读图和结构化”，不做医学诊断，不给治疗建议。

## 2. Provider Choices

| Provider | Usage | Status |
| --- | --- | --- |
| `fixture` | 本地回归、业务闭环、自动化测试 | 已有 |
| `gpt_vision` | 真实图片识别、结构化输出、当前主路线 | 已接入 |

OpenAI 视觉模型支持图片输入分析；结构化输出可约束模型返回 JSON schema。GPT provider 应使用结构化输出，而不是依赖自由文本解析。

## 3. Provider Input

TypeScript source of truth:

```text
backend/src/services/ocr-provider.ts
```

Provider input:

```ts
type OcrProviderInput = {
  taskId?: string;
  profileId: string;
  groups: OcrProviderReportGroup[];
  context: OcrProviderContext;
  schemaVersion: 'ocr_draft_v1';
};
```

Report group:

```ts
type OcrProviderReportGroup = {
  groupId: string;
  photos: OcrProviderPhoto[];
};
```

Photo:

```ts
type OcrProviderPhoto = {
  photoId: string;
  objectKey: string;
  localPath?: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  groupId: string;
  sortOrder: number;
};
```

Context:

```ts
type OcrProviderContext = {
  profileId: string;
  patientNameHint?: string;
  hospitalHint?: string;
  reportDateHint?: string;
  language: 'zh-CN';
};
```

Input rules:

- One `groupId` represents one expected report draft.
- Multi-page reports must be placed in the same group before OCR.
- Photos in one group must be processed in ascending `sortOrder`.
- A group with multiple photos should produce one merged draft, not one draft per photo.
- Provider must preserve `sourcePhotoIds` in output.
- Provider may use hints to fill missing fields, but inferred fields must be marked with `FieldSource = inferred_from_batch`.
- Provider must not trust client supplied `profileId` without backend ownership validation. Route layer validates ownership before calling provider.
- For local storage, `localPath` is available only in development/test and must not be returned to the client.

## 4. Provider Output

Provider result:

```ts
type OcrProviderResult = {
  provider: 'fixture' | 'gpt_vision';
  schemaVersion: 'ocr_draft_v1';
  drafts: OcrDraft[];
  warnings?: Array<{ code: string; message: string }>;
};
```

Each `OcrDraft` must match the system draft shape:

```ts
type OcrDraft = {
  sourcePhotoIds: string[];
  pageCount: number;
  basicInfo: OcrDraftBasicInfo;
  metrics: OcrDraftMetric[];
  findings: string[];
  conflicts: OcrDraftConflict[];
  warnings: OcrDraftWarning[];
  status: 'needs_review' | 'needs_manual_input' | 'not_report';
};
```

Provider may include its own temporary ids internally, but the database creates the authoritative `draftId`.

## 5. Basic Info Schema

```ts
type OcrDraftBasicInfo = {
  type: string;
  originalType?: string;
  typeKey: string;
  canonicalTypeName?: string;
  modality: 'laboratory' | 'imaging' | 'electrophysiology' | 'pathology' | 'other';
  analysisPolicy: 'metric_analysis' | 'view_only';
  hospital: string;
  hospitalSource: 'ocr' | 'inferred_from_batch' | 'user_edited' | 'unknown';
  reportDate: string;
  reportDateSource: 'ocr' | 'inferred_from_batch' | 'user_edited' | 'unknown';
  examDate?: string;
  patientName?: string;
  department?: string;
  orderNo?: string;
  examPart?: string;
  examMethod?: string;
  reportLike?: boolean;
  confidence: number;
};
```

Rules:

- Missing `hospital` or `reportDate` is allowed at OCR stage, but source must be `unknown` and a warning must be emitted.
- `type` is the visible report name from the original report.
- `type` must prefer the original examination item or package name, such as `甲功`, `甲功1`, `甲状腺功能`, or `血常规`; generic names such as `检验报告` should be used only when no specific item can be read.
- `typeKey` is the normalized system key. If uncertain, use a stable pending key such as `unknown_laboratory` and set relevant mapping status/warning.
- When multiple dates are present, `reportDate` should prefer `申请日期`; if absent, fall back to sampling/collection/test/report date in that order. Other dates can be preserved in provider-specific basic info fields for later review.
- CT/MRI/B ultrasound/pathology/electrophysiology reports usually use `analysisPolicy = view_only` unless they contain structured numeric metrics we intentionally support.
- Laboratory reports usually use `analysisPolicy = metric_analysis`.

## 6. Metric Schema

```ts
type OcrDraftMetric = {
  metricKey: string;
  metricName: string;
  originalMetricName?: string;
  category: string;
  categoryCn: string;
  mappingStatus: 'confirmed' | 'suggested' | 'pending' | 'conflicted';
  valueType: 'quantitative' | 'qualitative' | 'text';
  valueNumeric?: number | null;
  valueQualitative?: string | null;
  valueText?: string | null;
  unit?: string | null;
  refRangeLow?: number | null;
  refRangeHigh?: number | null;
  refQualitative?: string | null;
  refText?: string | null;
  tone: 'low' | 'ok' | 'high' | 'abnormal' | 'unknown';
  ocrConfidence: number;
};
```

Rules:

- Unit must preserve the original report text. Do not normalize units in OCR provider.
- Numeric conversion for charts belongs to later metric logic, not OCR provider.
- Complex reference ranges should preserve `refText`; provider may also fill simple low/high when obvious.
- Markers to the left of an item name, such as a triangle used by some hospitals, mean the item is highlighted/key in that report and must not be interpreted as high or low.
- Abnormal direction comes from markers beside the result value: `↑`, `H`, and high markers map to `high`; `↓`, `L`, and low markers map to `low`; when no directional marker exists, compare the value against the reference range and map in-range values to `ok`.
- A future schema version can add an item-level key marker field, such as `isKeyMetric` or `reportMarker`, so the UI can distinguish hospital-highlighted metrics from abnormal results.
- Qualitative results such as positive/negative use `valueType = qualitative`.
- Narrative-only items use `valueType = text`.
- Unknown public metrics should be saved with `mappingStatus = pending`, not forced into public mapping.
- User custom templates can bypass public mapping, but OCR provider should not create user custom templates by itself.

## 7. Findings Schema

`findings` is a string array for v1 compatibility:

```ts
findings: string[];
```

Rules:

- Imaging/pathology/electrophysiology reports may produce findings.
- Laboratory reports should normally return an empty `findings` array.
- Findings are view-only in v1 and do not enter metric trends.
- Provider should preserve original wording as much as possible and avoid summarizing away clinically relevant text.

## 8. Warnings And Conflicts

Warning:

```ts
type OcrDraftWarning = {
  code: string;
  message: string;
};
```

Recommended warning codes:

| code | Meaning |
| --- | --- |
| `LOW_CONFIDENCE` | Overall confidence is low |
| `PARTIAL_SCREENSHOT` | Top/basic info may be missing |
| `MISSING_HOSPITAL` | Hospital is missing |
| `MISSING_REPORT_DATE` | Report date is missing |
| `UNKNOWN_REPORT_TYPE` | Report type mapping is pending |
| `UNKNOWN_METRIC` | Metric mapping is pending |
| `NOT_MEDICAL_REPORT` | Image does not look like a medical report |
| `OCR_EMPTY_RESULT` | No usable content was recognized |
| `MULTIPAGE_INCONSISTENT` | Grouped pages contain inconsistent basic info |

Conflict:

```ts
type OcrDraftConflict = {
  code: string;
  field?: string;
  message: string;
  candidates?: Array<{
    label: string;
    value: string;
    confidence: number;
  }>;
};
```

Rules:

- Conflicts should block blind saving only when they affect report identity or metric value safety.
- Low confidence alone should ask user to review, but should not necessarily block saving.
- Multi-photo groups with inconsistent hospital, patient, report date, report type, exam part, or metric values should emit `MULTIPAGE_INCONSISTENT` and return conflicts instead of silently merging.

## 9. Multi-photo Merge Rules

Provider behavior:

- One `groupId` maps to one expected draft.
- `sourcePhotoIds` must include every photo used by the draft.
- `pageCount` must equal the number of photos in the group.
- Basic info may be completed from later pages only when the field is visible or strongly supported by same-group evidence.
- Repeated page headers, footers, table headers, and duplicated rows should be removed.
- If the same metric appears on two pages with the same value/unit/reference, keep one metric and preserve the stronger evidence/confidence.
- If the same metric appears with conflicting values, create a conflict and do not pick a value silently.
- Historical comparison columns must not be saved as current results.
- If one image contains two independent reports, provider may return multiple drafts only when the evidence clearly separates them; otherwise return a warning and require user review.

User experience rules:

- Correctly bound multi-photo reports should appear as one card on the confirmation page.
- Wrongly bound groups should ask the user to return to upload grouping or resolve conflicts before saving.
- Future UI may suggest merging unbound adjacent photos, but MVP should not auto-merge without user confirmation.

Detailed merge rules are documented in `docs/ocr-multiphoto-merge-spec.md`.

## 10. Status Rules

Draft status:

| status | Meaning |
| --- | --- |
| `needs_review` | Recognized and ready for user confirmation |
| `needs_manual_input` | Looks like a report, but useful fields are too incomplete |
| `not_report` | Image does not appear to be a medical report |

Task status:

| status | Meaning |
| --- | --- |
| `queued` | Task created, waiting for provider |
| `processing` | Provider is running |
| `needs_confirmation` | Drafts are ready for user review |
| `ready_to_save` | Conflicts resolved and ready to save |
| `failed` | Provider failed or timed out |
| `confirmed` | Reports saved |
| `cancelled` | User cancelled |

## 11. GPT Provider Prompt Contract

GPT provider should send:

- System instruction: extract structured medical report data only; do not diagnose; do not invent missing values.
- Image inputs: one report group at a time, sorted by `sortOrder`.
- Context hints: patient/hospital/date hints when available.
- Output format: strict `ocr_draft_v1` JSON schema.

GPT provider must:

- Return empty strings/nulls for missing fields.
- Add warnings for missing or uncertain fields.
- Preserve original units and reference text.
- Mark inferred fields explicitly.
- Merge multi-photo groups by `sortOrder`, deduplicate repeated headers/rows, and return conflicts for inconsistent values.
- Never output treatment advice.
- Never return raw local filesystem paths.

Implementation notes:

- Prefer the official Responses API when the provider supports structured JSON schema output.
- OpenAI-compatible gateways may not implement Responses API. The adapter may fall back to `/chat/completions` with `response_format: { type: "json_object" }`.
- If a gateway returns a successful Responses response without standard `output_text`, the adapter should retry through Chat Completions before treating the OCR as empty.
- The selected OCR model must support image input. Text-only models are not acceptable even if normal chat completion works.
- API keys, raw base64 images, and full OCR response text must not be logged.

## 12. Commercial OCR Adapter Contract

When replacing GPT with a vendor OCR API:

1. Keep `/api/ocr/tasks` unchanged.
2. Implement a new `OcrProvider` adapter.
3. Convert vendor response into `ocr_draft_v1`.
4. Keep fixture tests and golden comparison.
5. Do not expose vendor field names to the mini program.
6. Do not change report save payload unless the internal draft schema intentionally changes.

## 13. Acceptance Tests

Minimum provider acceptance:

- One photo group creates exactly one draft.
- A two-photo linked report creates one draft with two `sourcePhotoIds`.
- A multi-page linked report merges repeated headers and duplicate rows.
- A linked report with conflicting duplicate metric values returns a conflict before save.
- Wrongly linked reports return `MULTIPAGE_INCONSISTENT` instead of silently merging.
- Four photos with one linked pair create three drafts.
- CT chest and abdomen/pelvis can be distinguished by `examPart` or `typeKey`.
- Laboratory reports produce metrics and no findings.
- Imaging reports produce findings and `analysisPolicy = view_only`.
- Missing hospital/date produces warnings and editable fields.
- Non-report image returns `not_report`.
- Empty or unreadable report returns `needs_manual_input`.
- Output validates against `ocr_draft_v1`.

## 14. Privacy And Logging

- OCR image bytes and recognized raw text are sensitive health data.
- Do not log full image paths, base64 data, report text, AppSecret, or provider API keys.
- Local uploaded images must stay under `local-object-storage/` and remain git-ignored.
- Production storage must use short-lived signed URLs or object keys, not permanent public URLs.

## 15. Production OCR Direction

Production OCR should follow the architecture in `docs/ocr-hybrid-architecture.md`:

- A dedicated OCR layer extracts raw text, tables, layout blocks, page evidence, and confidence.
- An LLM structuring layer converts that evidence into `ocr_draft_v1`.
- Backend deterministic logic applies master-data mapping, date priority, abnormal direction, duplicate detection, and user confirmation rules.
- Provider replacement must not change `/api/ocr/tasks`, the confirmation page, report save APIs, or downstream health-data aggregation.
- Current `gpt_vision` combines extraction and structuring behind one provider boundary; keep the boundary stable so future provider changes do not affect mini program pages or saved report contracts.
- Inferred metadata is allowed only when evidence supports it and must be marked as inferred; metric values, qualitative results, units, and reference ranges must never be invented.

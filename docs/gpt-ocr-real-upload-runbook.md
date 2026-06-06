# Real OCR Upload Runbook

Updated: 2026-05-30

This runbook verifies the development loop:

```text
mini program upload -> local object storage -> real OCR provider -> confirmation page -> saved health data
```

## 1. Configure Local Backend Env

Create `backend/.env` if it does not exist:

```bash
npm.cmd run backend:env:init
```

Edit `backend/.env` locally. Do not commit it.

Recommended for real-photo reports: use a vision language model directly.

```env
OCR_PROVIDER="gpt_vision"
UPLOAD_STORAGE_PROVIDER="local"
OPENAI_API_KEY="your-development-key"
OPENAI_OCR_MODEL="gpt-4.1-mini"
OPENAI_API_BASE_URL="https://api.openai.com/v1"
```

For OpenAI-compatible gateways, use a model that accepts image input through
`/chat/completions` `image_url` content. Text-only chat models can pass a simple
chat probe but still fail the OCR smoke because they cannot read uploaded
photos. The current local dev endpoint is configured through `OPENAI_API_BASE_URL`
and `OPENAI_OCR_MODEL`.

Recommended before manually running the backend outside smoke scripts:

```env
JWT_SECRET="replace-with-a-long-local-random-secret"
WECHAT_APP_SECRET="put-the-real-secret-in-local-env-only"
```

## 2. Readiness Check

Run:

```bash
npm.cmd run gpt-ocr:readiness
```

Warnings can remain for production-like auth tests, but the real OCR upload smoke
requires `OPENAI_API_KEY` to be configured.

The readiness command reports two levels:

- `Integration readiness`: the local upload/OCR/DevTools chain can run.
- `Real-photo product readiness`: the GPT vision route is configured and the
  real-photo smoke gates below still need to pass.

## 3. Mini Program Real Upload Smoke

Privacy-safe synthetic image smoke:

```powershell
$env:HEALTHHELPER_USE_REAL_OPENAI='1'
$env:HEALTHHELPER_REAL_UPLOAD_IMAGE_PATH='tests\fixtures\synthetic-ocr\images\synthetic_acth.png'
npm.cmd run devtools:real-upload-flow
```

This still calls the configured real OCR provider, but the uploaded image is a
deidentified synthetic fixture.

For backend-only golden checks against the real provider:

```powershell
$env:REALCASE_MANIFEST='tests\fixtures\synthetic-ocr\manifest.json'
$env:REALCASE_IDS='synthetic_acth'
npm.cmd --prefix backend run smoke:gpt-ocr

$env:REALCASE_IDS='synthetic_biochem_lipid'
npm.cmd --prefix backend run smoke:gpt-ocr
```

For a full Mini Program upload/review/save/readback proof with the wider
biochem/lipid synthetic image:

```powershell
$env:HEALTHHELPER_USE_REAL_OPENAI='1'
$env:HEALTHHELPER_REAL_UPLOAD_IMAGE_PATH='tests\fixtures\synthetic-ocr\images\synthetic_biochem_lipid.png'
npm.cmd run devtools:real-upload-flow
```

For a low-cost batch upload smoke that does not call the external OCR provider,
leave `HEALTHHELPER_USE_REAL_OPENAI` unset or set it to `0`. The local mock
provider is still exercised through the same upload/sign/complete/task/save
path:

```powershell
$env:HEALTHHELPER_USE_REAL_OPENAI='0'
$env:HEALTHHELPER_REAL_UPLOAD_IMAGE_PATHS='tests\fixtures\synthetic-ocr\images\synthetic_acth.png;tests\fixtures\synthetic-ocr\images\synthetic_chest_ct.png'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_MIN_REPORTS='2'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_MIN_METRICS='1'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_OCR_REQUESTS='2'
npm.cmd run devtools:real-upload-flow
```

For a privacy-safe real OCR batch smoke, use two deidentified synthetic images.
This calls the configured GPT OCR provider once per image, and proves the
same upload task can save multiple reports into the case list:

```powershell
$env:HEALTHHELPER_USE_REAL_OPENAI='1'
$env:HEALTHHELPER_REAL_UPLOAD_IMAGE_PATHS='tests\fixtures\synthetic-ocr\images\synthetic_acth.png;tests\fixtures\synthetic-ocr\images\synthetic_chest_ct.png'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_MIN_REPORTS='2'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_MIN_METRICS='1'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_OCR_REQUESTS='2'
npm.cmd run devtools:real-upload-flow
```

For an imaging report proof where saved reports are expected but metric
snapshots are not:

```powershell
$env:HEALTHHELPER_USE_REAL_OPENAI='1'
$env:HEALTHHELPER_REAL_UPLOAD_IMAGE_PATH='tests\fixtures\synthetic-ocr\images\synthetic_chest_ct.png'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_MIN_METRICS='0'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_REPORT_TYPE='胸腹盆CT平扫'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_REPORT_TYPE_KEY='ct_plain'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_REPORT_MODALITY='imaging'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_ANALYSIS_POLICY='view_only'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_EXAM_PART='胸部/腹部/盆腔'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_EXAM_METHOD='CT平扫'
$env:HEALTHHELPER_REAL_UPLOAD_EXPECT_FINDING_INCLUDES='微、小结节'
npm.cmd run devtools:real-upload-flow
```

Run from the repository root:

```bash
npm.cmd run devtools:gpt-real-upload-flow
```

This command:

- Starts the memory backend.
- Uses local object storage under `tmp/`.
- Opens WeChat DevTools automation.
- Enters upload from the home page.
- Writes `realtestcase/ACTH.jpg` into the mini program simulator file system.
- Uploads it through `wx.uploadFile`.
- Calls the configured real OCR provider.
- Opens the confirmation page.
- Saves the report.
- Verifies health data can read at least one report and one metric.

## 4. Manual Testing In The Mini Program

Development and trial builds show a developer-only switch under:

```text
我的 -> 开发调试
```

Modes:

- `Mock`: front-end visual and interaction testing. It does not read real image content.
- `真实上传`: recommended during the current stage. Upload, OCR, report save, reports, and health data use the backend; other areas can still use mock fallback when no backend profile is bound.
- `全后端`: production-like backend mode for later auth/database integration.

Before choosing `真实上传`, start a local backend with GPT OCR enabled:

```bash
npm.cmd run backend:gpt-memory
```

For a background helper that survives after the terminal command returns, use:

```bash
npm.cmd run backend:gpt-memory:detached
```

Both commands read `backend/.env`, start the memory backend on
`http://127.0.0.1:18788`, use local object storage, and enable the GPT OCR
provider. Then in the developer panel choose `自动化后端 18788` and tap reconnect.
If the backend is not running, real photo uploads will remain in draft/failure
state instead of producing OCR results.

## 5. Optional Backend-Only GPT Smoke

Run:

```bash
npm.cmd --prefix backend run smoke:gpt-ocr
```

By default it runs only `acth`.

To run all real test cases:

```bash
REALCASE_IDS=all npm.cmd --prefix backend run smoke:gpt-ocr
```

## 6. Completion Criteria

This goal can be considered complete when all production-readiness gates are true:

- `npm.cmd run devtools:gpt-real-upload-flow` passes with a real OCR provider key.
- `npm.cmd --prefix backend run smoke:gpt-ocr` passes for `REALCASE_IDS=all`.
- Risky OCR drafts are shown as warnings but are not hard-blocked; `missing_basic_info`
  and empty-content failures must remain failing recognition issues, not be auto-filled by the smoke.
- `OCR_COMPARE_STRICT=1` passes for the intended real-photo provider route.
- `OCR_COMPARE_REQUIRE_PASS=1` is used when measuring OCR accuracy success;
  `MANUAL_SAFE`/`BASIC_INFO_GAP` are counted as safe degradation, not accuracy success.
- The command output reports saved health data, for example `reports=1, metrics=1`.

The privacy-safe synthetic command is useful for external OCR integration checks,
but it is not enough by itself to close the real-photo product readiness gate.

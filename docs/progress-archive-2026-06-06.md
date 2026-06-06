# Progress Archive - 2026-06-06

## Current Product State

- Real upload OCR is now using the `gpt_vision` route with the configured `gpt-5.4-mini` OpenAI-compatible endpoint.
- DeepSeek/WCode OCR is no longer the recommended or active recognition route.
- The upload -> OCR -> review/edit -> save -> health report/metric list flow is functional enough for continued real-report testing.
- OCR result quality improved significantly on real photos after switching to GPT vision and adding backend normalization.
- Quantitative metrics with comparator values such as `<104`, `<=5.6`, `>10`, and `>=2` are normalized as numeric metrics while preserving original text.
- Complex reference ranges are supported as text for quantitative metrics, while numeric range/high/low references still drive automatic abnormal tone calculation.
- Trend charts draw only computable numeric reference limits and bands; complex text ranges are displayed in history instead of guessed.
- OCR risk review is advisory rather than an overly strict save blocker, while truly unsafe or empty drafts still require manual handling.

## Recently Completed

- GPT OCR prompt and backend normalization improvements for real laboratory and imaging reports.
- Duplicate/conflict handling fixes for OCR draft conflicts and delete-resolution flows.
- Report detail/edit stability fixes, including editable reference range modes and manual tone handling.
- Removal of stale DeepSeek comparison commands and provider comparison scripts from the development toolchain.
- Documentation and readiness checks now point at the current GPT vision route instead of the retired DeepSeek/hybrid route.
- Local memory backends on `8787` and `18788` were verified healthy after the latest service restart.

## Current Verification Baseline

- `npm test`
- `node tests/static-check.js`
- `npm --prefix backend run build`
- `npm --prefix backend test`
- `GET http://127.0.0.1:8787/api/health`
- `GET http://127.0.0.1:18788/api/health`

## Low-Risk Cleanup Done In This Archive Pass

- Removed public tooling references to retired DeepSeek provider comparison and replay commands.
- Removed the untracked DeepSeek provider comparison source files.
- Narrowed readiness and env-init messaging to `OCR_PROVIDER="gpt_vision"`.
- Narrowed DevTools real-upload provider normalization to `gpt_vision`.
- Narrowed memory backend provider selection to `gpt_vision` or `fixture`.
- Converted the old OCR hybrid architecture document into a retired-note stub.

## Identified But Deferred Cleanup

- `backend/src/services/ocr-provider.ts` still contains `CommercialOcrProvider`, `ProviderFallbackOcrProvider`, and fallback helpers.
- `backend/src/config/env.ts` still accepts `commercial_ocr` and fallback env fields.
- `backend/src/backend-smoke.test.ts` still has extensive commercial/fallback smoke coverage.

These are intentionally not removed in this pass because deleting them requires a larger coordinated change across env schema, provider factory, backend smoke tests, and type assumptions. The active GPT OCR route does not depend on them.

## Next Safe Slice

- After the current OCR flow remains stable through more real uploads, remove the commercial provider branch in one dedicated change:
  - delete provider classes and fallback helpers,
  - narrow `OcrProviderName` and env schema,
  - delete commercial/fallback backend smoke sections,
  - rerun backend smoke and DevTools upload checks.

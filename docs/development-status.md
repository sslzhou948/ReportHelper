# Development Status

Updated: 2026-06-06

Latest archive: `docs/progress-archive-2026-06-06.md`

## Closed In Current Loop

- Real upload OCR is now on the `gpt_vision` route with the configured GPT vision model; DeepSeek/WCode comparison tooling is retired from the active development path.
- OCR normalization now keeps comparator numeric results such as `<104` as quantitative metrics while preserving original display text.
- Quantitative reference ranges now support simple ranges, upper/lower bounds, complex text, and no-reference modes without changing the existing quantitative/qualitative/text result-type split.
- Current cleanup pass removed low-risk DeepSeek/hybrid tooling references and archived high-risk commercial-provider removal for a later dedicated change.
- Home visual and interaction baseline is stable in normal mode.
- Empty archive states no longer ship mock report placeholders.
- Upload grouping creates one report per linked photo group and keeps upload drafts after failures.
- Real report fixtures can bypass physical upload/OCR and drive confirmation, save, duplicate detection, report detail, metric snapshot, and recheck flows.
- Duplicate report handling offers only replace or skip to normal users; keep-both remains backend-only for future admin or advanced correction.
- Duplicate detection accounts for hospital aliases and CT exam part/method differences.
- Imaging reports are view-only for analysis and do not enter metric trend charts.
- Report detail edit entry navigates to edit mode instead of auto-saving.
- API errors are normalized across main pages, upload flows, report detail, metric pinning, profile forms, and recheck forms.
- Network offline and slow-loading recovery states are available on the four main tabs.
- Multiple pending OCR tasks are summarized on home and prioritized by ready, failed, then processing state.
- Full local verification is available through `npm run check:all`; WeChat DevTools smoke remains a separate explicit check.
- Hybrid-upload DevTools smoke now runs without local Docker/Postgres by starting an in-memory Fastify backend, saving seven realcase fixture reports through backend APIs, and reading them back from the mini program health page.
- Backend OCR task creation now goes through an OCR provider boundary, so the real OCR provider can replace the fixture provider without changing route contracts.
- Backend upload signing now goes through a storage provider boundary, so object storage signing can replace the local upload provider without changing mini program API contracts.
- Local development upload can now issue an HTTP upload URL and write image bytes into `local-object-storage/` before `/api/uploads/complete`.
- Non-fixture OCR tasks now call the configured OCR provider. `gpt_vision` is wired through the provider contract and returns structured `ocr_draft_v1` drafts when `OPENAI_API_KEY` is configured.
- Backend smoke tests now cover the development real-image path with a mocked OpenAI Responses endpoint: local upload, GPT-shaped OCR draft creation, report save, report list, and metric snapshot generation.
- `npm --prefix backend run smoke:gpt-ocr` provides an optional real GPT vision smoke against `realtestcase/`; it skips safely without `OPENAI_API_KEY`.
- `npm run devtools:real-upload-flow` now verifies the mini program path from home to upload picker, writes `realtestcase/ACTH.jpg` into the simulator file system, uploads it through `wx.uploadFile` to local object storage, runs the GPT provider boundary against a mocked OpenAI endpoint, opens confirmation, saves, and reads the saved report/metric from health data.
- `npm run devtools:gpt-real-upload-flow` is available as the opt-in real GPT version of the same simulator path; it skips safely when `OPENAI_API_KEY` is not configured.
- `docs/gpt-ocr-real-upload-runbook.md` documents the final real GPT upload/OCR verification steps and completion criteria.
- Login onboarding now exposes tappable user agreement and privacy policy pages, with a clear medical disclaimer before account/profile creation.
- Prisma now has an initial PostgreSQL migration and a drift check that compares the committed migration against the current schema without requiring a running database.
- Backend health check now reports database readiness when a real Prisma client is available, giving the future admin system-health page a reusable API signal.
- Backend local database scripts now expose `db:up`, `db:down`, and `db:reset` around the checked-in PostgreSQL compose service.
- Onboarding now separates WeChat login from first-profile creation; returning users can log in directly, and backend auth no longer creates a silent default profile.
- OCR provider contract now has a hybrid architecture spec, including provider evidence, LLM structuring, deterministic backend normalization, conflict handling, and provider replacement rules.
- Multi-photo OCR grouping now completes source photo IDs, deduplicates repeated rows, and flags conflicting repeated metric values instead of silently choosing one.
- GPT OCR prompt now handles report-type inference, application-date priority, key-marker triangles versus high/low arrows, laboratory metrics, and imaging findings separately.
- Synthetic deidentified OCR fixtures now generate ACTH, thyroid, biochemistry/lipid, and chest CT report images plus golden JSON files under `tests/fixtures/synthetic-ocr/`.
- GPT OCR golden smoke can point at either realcase or synthetic manifests, making external model validation possible without sending sensitive source fixtures.
- OCR provider failures are now classified as `OCR_RATE_LIMITED`, `OCR_AUTH_FAILED`, `OCR_PROVIDER_TEMPORARY`, `OCR_PROVIDER_BAD_RESPONSE`, or `OCR_PROVIDER_FAILED`, so mini program tasks can show actionable failure states instead of one generic 500-style message.
- GPT OCR provider now retries short transient failures with bounded backoff and returns long quota windows as retryable task failures instead of blocking the request.
- Recognized report drafts now persist minimal `ocrEvidence` and `providerMetadata`, including source photo IDs, object keys, page count, field source hints, model/provider metadata, endpoint, and attempt count.
- Backend smoke tests now cover OCR evidence persistence, provider retry after a transient 500, rate-limit classification, duplicate metric conflict, and `MULTIPAGE_INCONSISTENT` wrong-binding conflict propagation.
- DevTools upload smoke now follows the current product UX: Home -> Add record -> Photo recognition -> Upload picker. The mock OCR real-upload flow and hybrid fixture flow both pass through WeChat DevTools automation.
- DevTools automation scripts now set an isolated `LOCALAPPDATA` and use the WeChat DevTools automation port so Windows AppData/IDE-port issues are easier to recover from.

## Verified Commands

- `npm.cmd test`
- `npm.cmd run visual:check`
- `npm.cmd run fixtures:check`
- `npm.cmd --prefix backend run migration:check`
- `npm.cmd run check:all`
- `npm.cmd run devtools:flow`
- `npm.cmd run devtools:hybrid-flow`
- `npm.cmd run devtools:real-upload-flow`
- `npm.cmd run devtools:gpt-real-upload-flow` (skips without `OPENAI_API_KEY`)
- `npm.cmd run build` in `backend/`
- `npm.cmd test` in `backend/`
- `npm.cmd run synthetic:ocr-fixtures`
- `npm.cmd --prefix backend run build`
- `npm.cmd --prefix backend test`
- `npm.cmd --prefix backend run smoke:gpt-ocr` against synthetic ACTH passed; a broader synthetic run is currently limited by external provider quota.
- `npm.cmd run check:all`
- `npm.cmd run devtools:real-upload-flow`
- `npm.cmd run devtools:hybrid-flow`

## Remaining Product / Engineering Items

- Expand the OCR evidence layer when a commercial OCR provider is selected: raw OCR text, raw tables, layout blocks, per-field coordinates, and row-level evidence should be filled from the provider instead of the current GPT-direct minimal evidence.
- Add deterministic wrong-binding detection after OCR evidence exists, so the backend can detect obvious hospital/date/type/page conflicts even if the model forgets to emit `MULTIPAGE_INCONSISTENT`.
- Complete synthetic golden smoke once the external OCR provider quota is available again, especially the imaging/CT case.
- Manual execution of real GPT OCR smoke with a configured development key, followed by DevTools confirmation-page validation, after legal/provider policy and test data scope are explicit. Current automated `devtools:gpt-real-upload-flow` is intentionally not run by Codex because it may send `realtestcase/` images to an external provider.
- Add a synthetic-image-only GPT DevTools smoke if we want Codex to test the external provider without touching real report fixtures.
- Production upload storage, signed object URLs, legal HTTPS domain configuration, and WeChat allowed-domain setup.
- WeChat subscription message template ID and production reminder delivery.
- Mini program category/qualification confirmation and final legal review of user agreement/privacy copy.
- Admin portal for mapping review, conflict handling, mapping publish/rollback, audit logs, system health, API status, and future billing.
- Mapping backfill job after admin approval, with dry-run and no overwrite of OCR raw text or user-edited values.
- Senior / large text display mode as a backlog display setting, implemented by global style variables rather than duplicate pages.
- Family sharing and role permissions.
- More complete report archive management: restore, batch move, and retention policy UI.

## Next Recommended Slice

Start hardening the real backend integration loop:

1. Keep `npm run devtools:hybrid-flow` as the no-Postgres downstream business-loop gate.
2. Add the same fixture loop against a real PostgreSQL database once local Docker/Postgres is available.
3. Keep physical image upload and real OCR provider integration decoupled until the downstream data loop is stable.
4. Use `npm --prefix backend run db:up`, `npm --prefix backend run prisma:migrate`, and `npm --prefix backend run db:reset` for repeatable local product testing once Docker or another local PostgreSQL runtime is installed.

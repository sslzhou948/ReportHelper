# HealthHelper Backend

This is the self-managed backend for the mini program. v1 uses local PostgreSQL with a Supabase-compatible schema and a custom WeChat-based auth service.

## Decisions

- Do not depend on Supabase Auth in v1.
- Keep schema portable to Supabase/PostgreSQL.
- WeChat AppSecret must stay in backend environment variables only.
- Development storage can write uploaded images into `../local-object-storage`; production object storage remains a provider swap.
- OCR providers are behind `OcrProvider`: fixture for regression, GPT vision for development real-image OCR, and a future commercial OCR adapter.
- Auth routes use a local-development `code -> openid` mapping outside production. In production they call WeChat `jscode2session` with `WECHAT_APP_ID` and `WECHAT_APP_SECRET` from backend environment variables, then issue backend JWTs.
- Business routes require `Authorization: Bearer <token>` in production. Development and test keep a dev-session fallback so fixture smoke tests remain fast.

## First Loop

1. Sign image uploads and persist report photo metadata.
2. Mark signed uploads as completed after the client upload succeeds.
3. Create OCR task from completed photos or fixture drafts.
4. List, retry, or cancel unfinished OCR tasks.
5. Confirm/edit drafts.
6. Run duplicate check.
7. Save reports with replace/skip decisions.
8. Query reports, details, metric snapshots, and metric history.
9. Edit reports and recompute snapshots.
10. Create/update/complete/cancel recheck plans.

## Local Setup

Install dependencies from this directory:

```bash
npm install
```

Create `.env` from `.env.example`, then run:

```bash
npm run backend:env:init
npm run db:up
npm run prisma:migrate
npm run dev
```

Run `npm run backend:env:init` from the repository root. It will not overwrite an
existing `backend/.env`.

When you need a clean local database for repeatable product testing:

```bash
npm run db:reset
```

`db:up` uses the PostgreSQL service in `docker-compose.yml`. If Docker is not installed, use any local PostgreSQL instance and keep `DATABASE_URL` aligned with `.env`.

Before committing schema changes, verify that the initial migration still matches the Prisma schema:

```bash
npm run migration:check
```

The backend contract must stay aligned with:

- `../docs/api-contract.md`
- `../docs/database-schema.md`
- `../docs/backend-technical-plan.md`

## Mini Program Fixture Link

During local mini program debugging, keep the app in mock mode by default for visual checks. To enable the upload-to-report loop against the backend:

```js
wx.setStorageSync('healthhelperApiMode', 'hybrid-upload')
wx.setStorageSync('healthhelperBackendBaseUrl', 'http://127.0.0.1:8787')
```

In this mode, upload signing/completion, fixture OCR task creation/list/cancel, duplicate check, batch save, report list/detail/edit/delete, metric snapshots/history/pinning, and recheck plans use the backend after a backend profile is established. Full `backend` mode also routes profiles through the backend.

## Local Real-Image OCR Loop

For development real-image OCR, configure backend `.env` with the GPT vision route:

```bash
BACKEND_PUBLIC_BASE_URL="http://127.0.0.1:8787"
UPLOAD_STORAGE_PROVIDER="local"
LOCAL_OBJECT_STORAGE_DIR="../local-object-storage"
OCR_PROVIDER="gpt_vision"
OPENAI_API_KEY="..."
OPENAI_OCR_MODEL="gpt-4.1-mini"
OCR_MAX_RETRIES="1"
OCR_RETRY_BASE_MS="250"
OCR_REQUEST_TIMEOUT_MS="120000"
```

`BACKEND_PUBLIC_BASE_URL` must be reachable by the mini program runtime. The simulator can usually use `127.0.0.1`; a physical phone may need the computer LAN IP or a tunnel. Uploaded report images are written under `local-object-storage/`, which is git-ignored.

The OCR provider contract is documented in `../docs/ocr-provider-contract.md`.
Provider failures are classified before they reach the mini program: rate limits become
`OCR_RATE_LIMITED`, request timeouts become `OCR_TIMEOUT`, temporary network/provider failures become `OCR_PROVIDER_TEMPORARY`,
authentication or key issues become `OCR_AUTH_FAILED`, and malformed model output becomes
`OCR_PROVIDER_BAD_RESPONSE`. The retry settings above only cover short transient failures;
long quota windows are returned to the client as retryable task failures instead of blocking
the request for a minute.

To run a repeatable smoke test against the real GPT vision provider and the checked-in
`realtestcase/` images:

```bash
npm run smoke:gpt-ocr
```

By default the smoke uses only `acth` to limit provider cost. To run more cases:

```bash
REALCASE_IDS=acth,thyroid npm run smoke:gpt-ocr
REALCASE_IDS=all npm run smoke:gpt-ocr
```

If `OPENAI_API_KEY` is missing, the command exits safely after printing a skipped
message. When configured, it performs local upload, GPT OCR, draft save, report
query, and metric snapshot checks through the same backend routes used by the mini
program.

To verify the same provider through the mini program simulator and `wx.uploadFile`:

```bash
npm run gpt-ocr:readiness
npm run devtools:gpt-real-upload-flow
```

Run those commands from the repository root. The readiness command checks the local
configuration without printing secrets and expects `OCR_PROVIDER=gpt_vision`.
The DevTools smoke starts the memory backend,
uploads `realtestcase/ACTH.jpg` from the mini program runtime into local object
storage, calls the configured real OCR provider when `OPENAI_API_KEY` is configured,
opens the confirmation page, saves the report, and checks that health data can read
the saved report and metric. The command reads `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`,
and `OPENAI_OCR_MODEL` from the shell environment first, then from `backend/.env`.
Without `OPENAI_API_KEY`, it skips safely.

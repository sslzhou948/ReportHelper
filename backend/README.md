# HealthHelper Backend

This is the self-managed backend for the mini program. v1 uses local PostgreSQL with a Supabase-compatible schema and a custom WeChat-based auth service.

## Decisions

- Do not depend on Supabase Auth in v1.
- Keep schema portable to Supabase/PostgreSQL.
- WeChat AppSecret must stay in backend environment variables only.
- Real storage and OCR provider calls are deferred; the first loop supports upload signing/completion metadata plus structured fixture OCR drafts.
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
npm run db:up
npm run prisma:migrate
npm run dev
```

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

# HealthHelper Backend

This is the self-managed backend for the mini program. v1 uses local PostgreSQL with a Supabase-compatible schema and a custom WeChat-based auth service.

## Decisions

- Do not depend on Supabase Auth in v1.
- Keep schema portable to Supabase/PostgreSQL.
- WeChat AppSecret must stay in backend environment variables only.
- Real upload/OCR is deferred; the first loop uses structured fixture OCR drafts.
- Auth routes use a local-development `code -> openid` mapping outside production. In production they call WeChat `jscode2session` with `WECHAT_APP_ID` and `WECHAT_APP_SECRET` from backend environment variables, then issue backend JWTs.
- Business routes require `Authorization: Bearer <token>` in production. Development and test keep a dev-session fallback so fixture smoke tests remain fast.

## First Loop

1. Sign image uploads and persist report photo metadata.
2. Create OCR task from fixture drafts.
3. List or cancel unfinished OCR tasks.
4. Confirm/edit drafts.
5. Run duplicate check.
6. Save reports with replace/skip decisions.
7. Query reports, details, metric snapshots, and metric history.
8. Edit reports and recompute snapshots.
9. Create/update/complete/cancel recheck plans.

## Local Setup

Install dependencies from this directory:

```bash
npm install
```

Create `.env` from `.env.example`, then run:

```bash
npm run prisma:migrate
npm run dev
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

In this mode, upload signing, fixture OCR task creation/list/cancel, duplicate check, batch save, report list/detail/edit/delete, metric snapshots/history/pinning, and recheck plans use the backend after a backend profile is established. Full `backend` mode also routes profiles through the backend.

# HealthHelper Backend

This is the self-managed backend for the mini program. v1 uses local PostgreSQL with a Supabase-compatible schema and a custom WeChat-based auth service.

## Decisions

- Do not depend on Supabase Auth in v1.
- Keep schema portable to Supabase/PostgreSQL.
- WeChat AppSecret must stay in backend environment variables only.
- Real upload/OCR is deferred; the first loop uses structured fixture OCR drafts.

## First Loop

1. Create OCR task from fixture drafts.
2. Confirm/edit drafts.
3. Run duplicate check.
4. Save reports with replace/skip decisions.
5. Query reports, details, metric snapshots, and metric history.
6. Edit reports and recompute snapshots.

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

During local mini program debugging, keep the app in mock mode by default and enable only the upload confirmation loop against the backend:

```js
wx.setStorageSync('healthhelperApiMode', 'hybrid-upload')
wx.setStorageSync('healthhelperBackendBaseUrl', 'http://127.0.0.1:8787')
```

In this mode, fixture OCR task creation, duplicate check, and batch save use the backend. Other pages still use the mock adapter until their backend list/detail/snapshot routes are implemented.

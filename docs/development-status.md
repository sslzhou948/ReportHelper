# Development Status

Updated: 2026-05-29

## Closed In Current Loop

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
- Login onboarding now exposes tappable user agreement and privacy policy pages, with a clear medical disclaimer before account/profile creation.
- Prisma now has an initial PostgreSQL migration and a drift check that compares the committed migration against the current schema without requiring a running database.
- Backend health check now reports database readiness when a real Prisma client is available, giving the future admin system-health page a reusable API signal.
- Backend local database scripts now expose `db:up`, `db:down`, and `db:reset` around the checked-in PostgreSQL compose service.
- Onboarding now separates WeChat login from first-profile creation; returning users can log in directly, and backend auth no longer creates a silent default profile.

## Verified Commands

- `npm.cmd test`
- `npm.cmd run visual:check`
- `npm.cmd run fixtures:check`
- `npm.cmd --prefix backend run migration:check`
- `npm.cmd run check:all`
- `npm.cmd run devtools:flow`
- `npm.cmd run devtools:hybrid-flow`
- `npm.cmd run build` in `backend/`
- `npm.cmd test` in `backend/`

## Remaining Product / Engineering Items

- Real OCR provider integration and golden comparison against `realtestcase/`.
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

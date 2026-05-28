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

## Verified Commands

- `npm.cmd test`
- `npm.cmd run visual:check`
- `npm.cmd run fixtures:check`
- `npm.cmd run check:all`
- `npm.cmd run devtools:flow`
- `npm.cmd run build` in `backend/`
- `npm.cmd test` in `backend/`

## Remaining Product / Engineering Items

- Real OCR provider integration and golden comparison against `realtestcase/`.
- Production upload storage, signed object URLs, legal HTTPS domain configuration, and WeChat allowed-domain setup.
- WeChat subscription message template ID and production reminder delivery.
- User agreement, privacy policy, medical disclaimer, and mini program category/qualification confirmation.
- Admin portal for mapping review, conflict handling, mapping publish/rollback, audit logs, system health, API status, and future billing.
- Mapping backfill job after admin approval, with dry-run and no overwrite of OCR raw text or user-edited values.
- Senior / large text display mode as a backlog display setting, implemented by global style variables rather than duplicate pages.
- Family sharing and role permissions.
- More complete report archive management: restore, batch move, and retention policy UI.

## Next Recommended Slice

Start the real backend integration loop behind feature flags:

1. Run the mini program in `hybrid-upload` mode against local backend.
2. Use fixture OCR to save reports into the backend and browse them from the mini program.
3. Add a DevTools smoke path that toggles backend mode for this fixture loop.
4. Keep physical image upload and real OCR provider integration decoupled until the downstream data loop is stable.

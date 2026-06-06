# HealthHelper Mini Program Implementation Plan

## Current Goal

Build a production-grade WeChat mini program for "我的病例夹", starting from the provided product and UI/UX documents. The first native implementation focuses on the core user journey: profile selection, report upload, OCR confirmation, health data browsing, report detail, metric trend detail, recheck plans, and personal archive.

## Development Contracts

Before implementing feature logic, use these local contracts as the source of truth:

- `docs/product-logic-contract.md`: product rules, state machines, upload/OCR behavior, metric/trend rules, profile ownership, and v1 decisions.
- `docs/ocr-provider-contract.md`: OCR provider input/output schema, GPT vision adapter rules, future commercial OCR replacement boundary, and acceptance tests.
- `docs/edge-case-matrix.md`: P0/P1/P2 boundary scenarios, expected UI behavior, API constraints, and test expectations.
- `docs/api-contract.md`: frontend/backend request and response shapes, error format, idempotency, and endpoint list.
- `docs/database-schema.md`: backend data model, stable IDs/keys, OCR draft/report persistence, duplicate-save decisions, and backfill safety rules.
- `docs/backend-technical-plan.md`: backend architecture, implementation slices, duplicate detection rules, and minimum production loop.
- `docs/environment-release-plan.md`: local development, test, trial run, production release, account isolation, deployment, rollback, and continuous iteration plan.
- `docs/wechat-console-checklist.md`: WeChat mini program console, AppID, member permission, domain, privacy, and release blocker checklist.
- `docs/development-status.md`: current implementation status, verified commands, remaining product items, and next recommended slice.

If code behavior and these contracts diverge, update the contract first, then update code and tests.

## Quality Strategy

- Keep domain ownership explicit: every report, recheck plan, and metric snapshot belongs to a `profileId`.
- Treat the real report screenshots in `realtestcase/` as the future OCR regression suite.
- Put deterministic logic in `miniprogram/utils/` and cover it with Node tests before binding it to WXML.
- Avoid complex WXML expressions when state can be precomputed in page JS.
- Use WeChat DevTools CLI for compile/smoke checks after feature changes.
- Use normal-mode visual proportions as the product baseline. Senior / large-text mode is a backlog item and should be implemented later through global style variables, not duplicate pages.
- Start frontend feature development against an API adapter that matches `docs/api-contract.md`; keep the mock adapter and real backend adapter interchangeable.
- Treat duplicate report detection as a save-time P0 rule. The backend must reject ambiguous duplicates until the frontend provides an explicit user decision.

## Test Layers

- `npm test`: syntax, JSON parsing, date/trend/report/upload utility checks.
- `npm run visual:check`: normal-mode visual contract checks for wireframe-derived spacing, top safe area, card sizing rules, and selected page-level visual constraints.
- `npm run fixtures:check`: verifies all real screenshot fixtures and golden placeholder files are present.
- `npm run devtools:cli-check`: checks whether the local WeChat DevTools CLI can be invoked.
- `npm run devtools:preview`: compiles the real mini program project in WeChat DevTools and generates preview output.
- `npm run devtools:hybrid-flow`: starts an in-memory backend and verifies the mini program `hybrid-upload` fixture loop through WeChat DevTools without requiring local Postgres.
- `npm --prefix backend run migration:check`: verifies the committed initial PostgreSQL migration still matches `backend/prisma/schema.prisma` without requiring a running database.
- `npm run check:all`: runs mini program unit/static checks, visual checks, fixture checks, backend build, and backend smoke tests. WeChat DevTools checks remain separate because they require local DevTools access.
- Manual/interactive testing: open the project in WeChat DevTools, use it like a patient family member, and test upload grouping, OCR confirmation, health data switching, report detail editing, recheck todo completion, and profile switching.

## WeChat DevTools

The DevTools CLI is invoked with a workspace-local `LOCALAPPDATA` override at `.wechat-localappdata/`. This avoids the local Windows AppData startup issue and lets `npm.cmd run devtools:open` open the correct project folder.

`npm.cmd run devtools:preview` currently succeeds with the configured mini program AppID. Keep using it as the final compile/smoke check after feature changes.

## OCR Baseline Policy

The golden files under `tests/golden/` now contain a first structured baseline extracted from the real report screenshots in `realtestcase/`. The mini program mock API can create OCR tasks from `miniprogram/data/ocr-fixtures.js`, so upload and OCR can be bypassed while testing the downstream business loop: confirmation, save, report list, metric snapshots, trends, and report detail. When backend OCR is introduced, compare its output against this baseline before replacing the fixture path.

For local product testing, open `/pages/upload/pick?fixture=realcase` in DevTools to show the fixture-only entry. This route is intentionally query-gated so the normal upload page remains empty and does not ship sample reports into regular user flows.

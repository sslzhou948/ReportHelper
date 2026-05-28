# Backlog

## Senior View / Large Text Mode

Status: deferred.

The current product baseline uses the normal wireframe proportions. A future senior view can be added as a global display mode, controlled from “我的 → 显示设置”.

Implementation direction:

- Store `displayMode = normal | senior` in local storage and backend preferences.
- Use global style variables for font size, row height, button height, and card padding.
- Keep one page structure; do not create separate senior pages.
- Regression-test both modes on home, health data, report detail, metric detail, recheck, and profile pages.

## Post-MVP Product / Platform Items

- Admin portal:
  - Field mapping management for report type aliases, metric aliases, unit normalization, and category rules.
  - Unknown metric / pending mapping review queue.
  - Human-reviewed self-learning workflow: aggregate candidate rules from real user reports, publish only after admin approval.
  - Mapping conflict modal / task queue when a raw name maps to multiple possible standard fields.
  - Mapping version publish / rollback flow, with audit log.
  - Historical backfill jobs after mapping publish, with dry-run preview and data-loss protection.
  - System health dashboard for OCR service, API availability, storage, queue latency, and error rate.
  - Future billing and usage management: plan configuration, quota, invoice/payment status, and abuse controls.
- Family sharing and role permissions: owner / editor / viewer.
- Admin review workflow for high-frequency pending metrics.
- Reminder frequency customization beyond the v1 default T-3 / T-1 / T-0.
- Drag sorting for pinned metrics.
- AI interpretation of reports, with strict medical disclaimer and review.
- Real-time multi-device sync and conflict resolution beyond silent refresh.
- Data export format refinement after backend storage is finalized.

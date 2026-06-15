# UI Refresh Rollout

Status: draft checkpoint

## Milestones

| Step | Scope | Output | Requires user confirmation |
| --- | --- | --- | --- |
| 1 | Extract design system | `design/ui-refresh-spec.md` | Yes |
| 2 | Build shared UI foundation | Token WXSS and minimal shared components | Yes |
| 3 | Implement benchmark page | `pages/home/index` | Yes |
| 4 | Implement tab dashboards | Health, recheck, profile | Yes, one page at a time |
| 5 | Implement core flows | Upload, report detail, metric detail, search, pinned metrics | Yes, one page or pair at a time |
| 6 | Implement support pages | Archive, guide, export, metric help, manual entry, new record | Yes, one page or pair at a time |
| 7 | Refresh visual checks | Update visual contracts after new baseline is accepted | Yes |

## Proposed Order

1. `pages/home/index`
2. `pages/health/index`
3. `pages/recheck/index`
4. `pages/profile/index`
5. `pages/record/new`
6. `pages/upload/pick` and `pages/upload/confirm`
7. `pages/health/report-detail`
8. `pages/health/metric-detail`
9. `pages/upload/edit-detail` and `pages/upload/conflict`
10. `pages/recheck/new` and `pages/recheck/detail`
11. `pages/health/search` and `pages/health/pinned-manage`
12. `pages/record/manual-entry` and `pages/profile/custom-metrics`
13. `pages/profile/reports-archive` and `pages/profile/guide`
14. `pages/profile/export` and `pages/profile/metric-help`

## Confirmation Template

After each page is completed, report:

- Files changed
- Business logic touched: yes or no
- JS touched: yes or no
- Visual target reference
- What changed visually
- Verification run
- State coverage checked
- Known gaps

Then wait for user confirmation before continuing.

## Page Acceptance Checklist

A page is not ready for confirmation until these are true:

- Existing primary user actions still call the same handlers.
- Navigation targets and query parameters are unchanged.
- Empty, loading, error, warning, and long-text states have been considered.
- Custom nav, capsule spacing, tab bar spacing, and safe-area bottom are checked where relevant.
- No layout element relies on one-off magic spacing if the same pattern appears elsewhere.
- Any visual contract failure is classified as either a real regression or an accepted baseline mismatch.

## Stop Conditions

Stop and ask for review before continuing if:

- A page needs business JS changes.
- A reference image conflicts with existing product behavior.
- Existing data cannot support a visible element in the reference design.
- The first implemented page drifts from the design thesis.
- A platform limitation prevents a high-fidelity miniprogram implementation.
- A destructive, medical, OCR, export, or archive flow would become less explicit than before.

## Current Checkpoint

- Reference images exist in `design/ui-refresh-reference`.
- Legacy UI source exists in `healthhelper_design`.
- Current global miniprogram styling exists in `miniprogram/app.wxss` and already has an older token layer.
- The home benchmark page has been implemented in `pages/home/index` and is awaiting final visual confirmation before the next page starts.
- Home visual contracts have been updated to the refreshed baseline; broader page contracts should be updated page by page after acceptance.

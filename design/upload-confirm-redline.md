# Upload And Confirm Redline

Source: `design/ui-refresh-reference/05-upload-confirm.png`

## Scope

Target routes:

- `pages/upload/pick`
- `pages/upload/confirm`

Preserve existing behavior:

- keep photo selection, preview, removal, page grouping, split, draft restore, and quality warning behavior
- keep OCR task creation, polling, retry, cancellation, report edit, manual fill, conflict handling, draft removal, splitting, and save-all behavior
- do not change upload storage keys, API calls, OCR state logic, or route query parameters

## Visual Structure

### Upload Picker

1. Secondary page shell with warm background and compact white custom title area.
2. Top recognition-quality tip uses a white bordered card with an icon, bold green title, and two-line helper copy.
3. Camera and album actions are two equal white cards with line icons, compact height, and no dashed oversized blocks.
4. Selected-photo section uses a clear count line, three-column thumbnails, rounded photo cards, delete affordance, index pill, and bottom-right merge affordance.
5. Empty and warning states stay reachable but must use the same warm card language.
6. Bottom CTA is a fixed full-width green button inside a warm safe-area footer.

### OCR Confirmation

1. Top informational notice and OCR caution notice are separate soft cards, matching the reference hierarchy.
2. Report cards are white, rounded, and bordered, with a left source thumbnail and right report metadata.
3. Report type, hospital/date, tags, metric count, abnormal count, and pending review tags are visible without forcing users into the detail page.
4. Main report action is an inline outline pill: `查看/编辑详情` or `手动补录`.
5. Destructive and split actions live in a single bottom operation bar with one divider, avoiding stacked button weight.
6. Recognition, failed, and empty states reuse the refreshed card, progress, and button rhythm.

## Fidelity Notes

- The two pages should feel like the same flow: same title treatment, page padding, card radius, icon style, and bottom CTA.
- Long report names, hospital names, and warning text must truncate or wrap within the card, never push the action pill out.
- Source thumbnails must be real images when available, with a document fallback only when no preview exists.
- Keep the WeChat capsule zone empty on the right.

# UI Refresh Design Spec

Version: draft 0.1
Status: review checkpoint, home benchmark implementation in progress

## Scope Boundary

The visual source of truth is `design/ui-refresh-reference`.

Legacy UI files, including `healthhelper_design` and the current `tests/visual/layout-contract.json` source references, are legacy context only. They can help identify existing page scope, but they must not influence the refreshed visual direction.

The implementation must preserve existing business behavior. Page JS, API calls, data contracts, event handler names, routing paths, validation rules, OCR conflict handling, upload flow, export behavior, and recheck logic should stay unchanged unless a page-level review explicitly approves a behavior change.

## Non-Negotiable Principles

1. Reference images define visual intent, not production structure. Do not translate image layers directly into WXML.
2. Existing page JS is the behavior contract. WXML may be reorganized, but existing handlers and data bindings must be preserved unless a specific exception is approved.
3. Design tokens come before page tuning. If the same color, spacing, radius, or shadow appears on three surfaces, it belongs in the shared UI layer.
4. One page is the benchmark before broad rollout. The home page must prove the visual language, shared tokens, tab spacing, and card system before other pages are migrated.
5. Every page must include normal, empty, loading, long-content, and error or warning states where the original page supports them.
6. The WeChat runtime is the target renderer. HTML may be used as a spec artifact only, never as the source for production code.
7. Confirmation gates are mandatory. After each page or paired flow, stop for review before moving on.

## Visual Thesis

Warm clinical companion UI with soft paper surfaces, restrained medical green, high readability Chinese typography, and card-based task flows. The interface should feel calm and trustworthy, not decorative, and it should preserve operational clarity for health reports, abnormal metrics, and recheck tasks.

## Reference Screens

| Reference | Target route or surface | Primary purpose |
| --- | --- | --- |
| `01-home.png` | `pages/home/index` | Home dashboard, greeting, add record CTA, next recheck, pinned metrics, recent reports |
| `02-health-data.png` | `pages/health/index` | Health data index, segmented views by metric and by time |
| `03-recheck-plan.png` | `pages/recheck/index` | Recheck plan dashboard, next appointment, todo checklist, future plans |
| `04-profile.png` | `pages/profile/index` | Profile center, archive/data/tools/about sections |
| `05-upload-confirm.png` | `pages/upload/pick`, `pages/upload/confirm` | Upload entry and OCR confirmation result |
| `06-report-metric-detail.png` | `pages/health/report-detail`, `pages/health/metric-detail` | Report detail and metric trend detail |
| `07-edit-conflict.png` | `pages/upload/edit-detail`, `pages/upload/conflict` | OCR edit form and duplicate-recognition conflict resolution |
| `08-recheck-detail.png` | `pages/recheck/new`, `pages/recheck/detail` | Recheck creation and detail management |
| `09-search-pinned.png` | `pages/health/search`, `pages/health/pinned-manage` | Search and pinned metric management |
| `10-manual-entry-template.png` | `pages/record/manual-entry`, `pages/profile/custom-metrics` | Manual entry and custom metric template management |
| `11-archive-guide.png` | `pages/profile/reports-archive`, `pages/profile/guide` | Report archive management and usage guide |
| `12-export-metric-help.png` | `pages/profile/export`, `pages/profile/metric-help` | Data export and metric help |
| `13-new-record.png` | `pages/record/new` | Add health record entry |

## Design Tokens Draft

These values are a first-pass extraction from the reference images and current miniprogram constraints. They should be validated on the first implemented page before being frozen.

### Color

| Token | Draft value | Use |
| --- | --- | --- |
| `--ui-bg` | `#F3F0EA` | Global warm page background |
| `--ui-surface` | `#FFFFFF` | Card and list surfaces |
| `--ui-surface-tint` | `#EEF3EC` | Soft green hero panels and icon backgrounds |
| `--ui-ink` | `#222222` | Main text |
| `--ui-ink-muted` | `#6F6A64` | Secondary text |
| `--ui-ink-soft` | `#9A948D` | Tertiary text, inactive icons |
| `--ui-border` | `#E3DED6` | Dividers and card borders |
| `--ui-border-strong` | `#D6D0C8` | Inputs, selected borders |
| `--ui-primary` | `#527858` | Main medical green |
| `--ui-primary-dark` | `#3F6848` | Pressed state and dark gradient stop |
| `--ui-primary-soft` | `#E7EEE5` | Green pills and icon discs |
| `--ui-danger` | `#D84D43` | Abnormal and destructive actions |
| `--ui-danger-soft` | `#F8E7E4` | Abnormal pills |
| `--ui-warning` | `#A96724` | OCR warning and caution text |
| `--ui-warning-soft` | `#FFF2DE` | Warning notice background |
| `--ui-low` | `#2F6DB3` | Low metric value state |

### Typography

Use the platform Chinese system stack already present in `miniprogram/app.wxss`: `-apple-system`, `BlinkMacSystemFont`, `PingFang SC`, `Microsoft YaHei`, `sans-serif`.

| Role | rpx | Weight | Notes |
| --- | ---: | ---: | --- |
| Page title | `36` | `700` | Custom nav title |
| Hero greeting | `48` to `56` | `700` | Home only, never inside compact cards |
| Section title | `32` | `700` | Major sections such as pinned metrics |
| Card title | `30` to `34` | `700` | Report names, metric names |
| Body | `28` | `400` | Default text |
| Secondary | `24` to `26` | `400` | Dates, hospital, descriptions |
| Caption | `22` | `400` | Pills and helper text |
| Metric value | `44` to `60` | `700` | Numeric focus areas |

### Layout

| Token | Draft rpx | Use |
| --- | ---: | --- |
| Page horizontal padding | `32` | Standard pages |
| Card radius | `32` to `40` | Most content cards |
| Hero radius | `48` to `56` | Top green panels |
| Card padding | `28` to `32` | Standard cards |
| Dense row padding | `24` to `28` | Lists and forms |
| Section gap | `28` to `36` | Between cards and sections |
| In-card row min height | `96` | Form and list rows |
| Report/list row min height | `120` | Report summaries and cross-tab list rows; keep consistent across tab dashboards |
| Dense metric row min height | `72` | Multi-column metric rows where values, units, and status indicators share one row |
| Home action card height | `128` | Add record and next recheck cards; keep both CTAs aligned and below hero scale |
| Primary button height | `88` to `96` | Bottom CTAs |
| Icon disc | `72` to `104` | Context-specific icon containers |
| Pill radius | `18` to `24` | Status tags and filters |

### Depth

Cards use real borders plus soft shadows. Avoid strong floating cards.

Recommended shadow:

```css
box-shadow: 0 8rpx 28rpx rgba(40, 35, 28, 0.06);
```

Dense form/list cards may use a lighter shadow:

```css
box-shadow: 0 2rpx 12rpx rgba(40, 35, 28, 0.035);
```

## Component Rules

### App Shell

- Custom top areas must respect the WeChat capsule and safe area.
- Tab pages use a warm background and reserve native tab bar space.
- Secondary pages use a white or near-white custom nav with a centered title and left back action.
- The green hero/header treatment appears on tab dashboards, not every secondary page.

### Cards

- Cards are white, rounded, lightly bordered, and softly shadowed.
- Cards should not be nested inside other cards.
- List groups can be one card with internal dividers.
- Hero cards may use a soft green tint or green gradient, but content must remain readable.

### Buttons

- Primary CTA: filled green, full width in bottom action areas.
- Secondary CTA: white surface, green border, green text.
- Danger CTA: red border or red text for destructive secondary actions. Use filled red only when the destructive action is the committed primary action.
- Button text and icons should stay vertically centered with a fixed height.

### Lists And Forms

- Form rows keep a stable height, left label with icon, right value with chevron when editable.
- Dense OCR and metric editing forms can use smaller row rhythm, but they must not reduce tap targets below practical miniprogram touch size.
- Avoid truncating medically important names or values without a path to view full content.

### Status And Notices

- Normal state: soft green pill.
- Abnormal state: soft red pill and red value.
- Warning or OCR uncertainty: warm yellow notice.
- Informational tips: soft green or neutral notice.
- Medical disclaimer surfaces must remain visible where currently present.

### Iconography

- Use line icons or current icon assets where available.
- Icon discs are soft green-tinted circles or rounded squares.
- Avoid adding purely decorative icons that do not clarify the row meaning.

## State Coverage

Each refreshed surface should account for these states before it is considered complete:

| State | Requirement |
| --- | --- |
| Normal data | Matches reference hierarchy and spacing with representative real data |
| Empty data | Provides a useful next action and does not collapse the layout awkwardly |
| Loading or slow loading | Keeps existing loading behavior visible and legible |
| Error or offline | Keeps existing retry and error messaging reachable |
| Long Chinese text | Hospital names, report names, metric names, and profile names must not break layout |
| Abnormal metric | Red warning semantics remain prominent without overwhelming the page |
| Disabled or pending action | Buttons and form rows must show clear non-ready states where applicable |
| Destructive action | Delete, clear, logout, and archive-related actions must stay visually and interactionally explicit |

## Mini Program Platform Constraints

- Prefer `rpx` for layout tokens and component sizing.
- Avoid CSS that is fragile or expensive in the WeChat WebView, especially heavy blur and backdrop effects.
- Keep native input, picker, image, scroll-view, and tab bar behavior in mind when redesigning layout.
- Custom navigation must continue to respect `wx.getMenuButtonBoundingClientRect` based spacing where the current page depends on it.
- Do not assume browser fonts, viewport units, or web-only CSS behavior will match the miniprogram renderer.
- Tab icons and icon assets should be checked on actual miniprogram rendering, not only by file inspection.

## Verification Matrix

For each implemented page, use the strongest available verification path:

| Verification | Purpose |
| --- | --- |
| `npm run static:check` | Catch broken page references, handlers, and static miniprogram issues |
| `npm run visual:check` | Preserve layout contracts until the new baseline is accepted |
| WeChat DevTools preview or automator flow | Verify miniprogram runtime rendering and navigation |
| Screenshot comparison against the relevant reference image | Check high-level fidelity and hierarchy |
| Manual smoke test of primary actions | Confirm behavior survived the visual rewrite |

If an automated visual contract still points to legacy `healthhelper_design`, do not treat failures as proof that the new UI is wrong. Treat them as baseline-update candidates after the new page is approved.

## Implementation Guardrails

For each page:

1. Read the existing `.js`, `.wxml`, `.wxss`, and `.json`.
2. Identify event handlers and data fields used by the current WXML.
3. Preserve handler names, data field names, route targets, and existing conditional states.
4. Replace WXML structure only where required for layout.
5. Apply shared tokens and components first, then page-specific WXSS.
6. Run static checks and page-level smoke checks.
7. Show a checkpoint summary before moving to the next page.

Allowed changes:

- WXML layout changes
- WXSS visual changes
- Shared UI component extraction
- Token and helper class additions
- Minor display-only computed fields if existing data cannot support the new visual layout

Restricted changes:

- API request/response contracts
- Storage schema
- OCR task state machine
- Recheck reminder logic
- Export file behavior
- Auth/session flow
- Form validation semantics
- Route names and query parameters

## Per-Page Change Budget

Default expectation:

- `.wxss`: expected to change
- `.wxml`: expected to change
- `.json`: only when component registration or navigation title requires it
- `.js`: avoid changes. If unavoidable, keep them display-only, document the reason, and list every touched handler or data field in the page checkpoint.

Any page requiring business JS changes must pause for review before implementation continues.

## Page Review Loop

Each page must go through this loop:

1. Implement one page or one paired surface from the mapping table.
2. Run automated checks available for this repo.
3. Capture or provide the best available visual evidence.
4. Stop and ask for confirmation.
5. Only after confirmation, continue to the next page.

Suggested first page: `pages/home/index`, because it defines the core visual language and touches the tab bar, hero, cards, metric tiles, and report rows.

## HTML Spec Position

HTML is optional and should not be the implementation source. If created, it should live under `design/ui-refresh-html` and be labeled as visual spec only.

The primary source for production implementation should be miniprogram tokens, WXML/WXSS, and reusable miniprogram components.

# Health Data Redline

Reference: `design/ui-refresh-reference/02-health-data.png`
Target: `miniprogram/pages/health/index`

## Source Structure

The reference is a two-state composite. The left viewport shows `view=metric`; the right viewport shows `view=time`.

Detected phone crops:

| State | Crop | Size |
| --- | --- | --- |
| Metric | `tmp/ref-health-metric.png` | `758 x 868` |
| Time | `tmp/ref-health-time.png` | `761 x 871` |

Treat the crop width as the 750rpx design width. Pixel values below are close enough to use as rpx starting values.

## Shared Layout

- Page background: warm off-white `#F7F5F2` / `#F3F0EA`.
- Header: green gradient panel, full width, rounded bottom corners around `46-52rpx`.
- Header height: about `160rpx` in the cropped reference before the content background begins.
- Title: centered, white, `34-36rpx`, weight `800`.
- Right action: `新增`, white, stacked under the WeChat capsule area.
- Search: white rounded field, x about `25rpx`, y about `97rpx`, w about `704rpx`, h about `48rpx`.
- Main content top: segment control begins about `14rpx` below the header.
- Native tab bar starts around y `763rpx`; page content must keep `page-tab` safe-area padding.

## Metric State

- Segmented control: x `23rpx`, y `177rpx`, w `714rpx`, h `69rpx`, outer background warm translucent. Active metric half is white with soft shadow.
- Range chips: y `268rpx`, h `35rpx`, gap about `16rpx`; active `全部` is green.
- Scope hint: y `325rpx`, font `24rpx`, color muted brown.
- Category chips: y `365rpx`, h `36rpx`; active is green, abnormal badge is a red circle.
- Group card: x `22rpx`, y `416rpx`, w `714rpx`, radius about `18rpx`, white, subtle border and shadow.
- Group header row: min height about `72rpx`; includes green icon disc, bold group title, gray item count pill, red abnormal pill, latest date, chevron.
- Metric rows: about `45rpx` high, name left, numeric value centered-right, unit fixed column, status dot/arrow at right.
- Abnormal row: warning icon at left, red value, red upward indicator. Normal rows use green dot.

## Time State

- Segment active state moves to the right half and becomes filled green.
- No category chip row in this state.
- Month headers: x `31rpx`, y `370rpx` for first section, title `32rpx` bold, count right aligned.
- Report list card: x `22rpx`, w `714rpx`, radius `18rpx`.
- Report row: min height about `88rpx`; date block `65rpx x 65rpx`, title bold, hospital muted, status pill near right, chevron.
- Normal report status uses soft green pill; abnormal uses soft red pill.

## Implementation Notes

- Preserve handlers: `goSearch`, `goRecord`, `switchView`, `switchRange`, `switchFilter`, `goMetric`, `goReport`.
- JS changes should remain display-only: layout, category icon mapping, report/metric row decoration.
- Do not alter API calls, query range semantics, storage keys, or navigation targets.

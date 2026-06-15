# Recheck Plan Redline

Source: `design/ui-refresh-reference/03-recheck-plan.png`

## Scope

Target route: `pages/recheck/index`

Preserve existing behavior:

- load recheck plans through `api.listRecheckPlans`
- navigate to new/detail pages through existing handlers
- toggle, add, swipe-delete, and complete todos through existing handlers
- keep network and slow-loading banners

## Visual Structure

1. Green custom top band with centered title and right aligned `+ 新增`.
2. Main content begins on the warm background, with 28-32rpx side padding.
3. First card: `下次复查`
   - large calendar icon in a soft square
   - oversized date line, hospital/type below
   - orange remaining-days pill
   - progress rail with readiness copy
   - two equal CTA buttons separated from content by a dashed divider
4. Second card: `待办事项`
   - card header contains title and total count
   - rows use one consistent list rhythm, approx 120rpx
   - checkbox state is visual, row tap still toggles existing todo state
   - inline add-todo row remains
5. Third card: `之后还有`
   - compact date badge, icon disc, title/hospital, weekday, chevron
   - row height aligns with refreshed report rows, approx 120rpx
6. Centered completed link above native tab bar.

## Fidelity Notes

- Buttons, list rows, and cards should use the same warm paper surface as Home and Health Data.
- The `+ 新增` affordance must stay below the WeChat capsule safe area to avoid overlap.
- Long todo text, hospital names, and plan names must stay inside the card using one-line truncation.
- Empty state should not collapse the page into a blank warm background.

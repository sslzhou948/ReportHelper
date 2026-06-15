# Profile Redline

Source: `design/ui-refresh-reference/04-profile.png`

## Scope

Target route: `pages/profile/index`

Preserve existing behavior:

- load profile, archive list, reports, metrics, and recheck counts through existing APIs
- keep archive edit, profile switcher, static route navigation, developer runtime controls, and logout handlers
- keep network and slow-loading banners
- do not change auth/session, export, archive, template, feedback, guide, or metric-help business flows

## Visual Structure

1. Green compact top band with centered `我的` title, respecting the WeChat capsule safe area.
2. Warm off-white content shell overlaps the green band with large top corner radii.
3. First card: profile identity
   - soft circular avatar illustration
   - name, treatment summary, and current relation stacked on the left
   - compact green edit action on the top-right
   - three equal stats with vertical dividers: reports, metrics, rechecks
4. Menu sections: `档案`, `数据`, `工具`, `关于`
   - each section has a bold heading and one white rounded list card
   - rows use one stable settings-list rhythm, about `88rpx`
   - left line icon, label, right aligned secondary text, chevron
   - destructive clear-data row uses red icon and text but keeps the existing blocked modal behavior
5. Logout is a standalone white rounded action card with red icon and text.
6. Developer runtime controls stay available only under the existing runtime condition, moved below the product-facing profile content.

## Fidelity Notes

- The page should feel closer to the reference than the legacy generic card list: top green band, floating profile card, line icons, and grouped menu cards are the primary fidelity anchors.
- Long profile names, hospital-style summaries, and menu secondary values must truncate inside the card rather than pushing chevrons or icons out of alignment.
- The menu row height should stay consistent within settings-style lists while staying compact enough for the full profile page hierarchy.
- Do not place any action in the top-right capsule zone.

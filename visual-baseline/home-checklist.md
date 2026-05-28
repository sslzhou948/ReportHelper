# Home Visual Closure Checklist

Current baseline: normal mode.

## Must Match

- Top banner avoids the WeChat capsule and keeps the normal wireframe density.
- Profile chip and bell stay in one row; neither overlaps the capsule.
- Upload CTA is a full-width green block, left aligned, normal height.
- Recheck card is a full-width white card, left aligned, normal height.
- Concerned metric cards are fixed-width horizontal cards with compact trend visuals.
- Recent report rows keep a horizontal layout: report type, hospital/date, abnormal count, arrow.
- Report hospital text must never become vertical because of horizontal compression.

## Automated Coverage

Run:

```powershell
npm.cmd test
npm.cmd run visual:check
```

The visual contract currently checks home card sizing, native-button avoidance, fixed metric card width, and report-row anti-compression rules.


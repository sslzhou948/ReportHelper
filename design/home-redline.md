# Home Redline

Source: `design/ui-refresh-reference/01-home.png`
Source size: `853 x 1844`
Scale for miniprogram implementation: `750 / 853 = 0.879rpx per source pixel`
Status: draft measurement for high-fidelity homepage rebuild

## Golden State

The homepage visual QA state should match the source content, not live user data:

- Profile chip: `妈妈 · 王芬`
- Greeting: `晚上好，愿您早日康复`
- Summary: `最近30天 · 6项需关注 · 3份报告`
- Recheck: `距下次复查还有 5 天`, `6月14日 · 协和医院 · 常规复查`
- Pinned metrics: `白细胞 3.97 10^9/L`, `血红蛋白 132 g/L`, `红细胞压积 40.5 %`
- Recent reports: `全血细胞分析`, `肝功能`, `尿常规`
- Report statuses: `5项异常`, `1项异常`, `正常`

## Layout Measurements

Measurements are from the source image and converted to rpx. They are targets, not vague inspiration.

| Region | Source px `x y w h` | Target rpx `x y w h` | Notes |
| --- | --- | --- | --- |
| Hero | `0 0 853 371` | `0 0 750 326` | Full width green header with large bottom radius |
| Profile chip | `47 88 287 69` | `41 77 252 61` | Includes avatar, label, chevron |
| Greeting | `52 209 468 54` | `46 184 411 47` | Large bold white text |
| Summary | `52 299 418 30` | `46 263 368 26` | White text at lower opacity |
| Upload card | `34 400 781 170` | `30 352 687 149` | Full-width green CTA |
| Recheck card | `33 599 782 169` | `29 527 688 149` | White card with soft shadow |
| Metric header | `42 818 764 30` | `37 719 672 26` | Section title and right action |
| Metric card 1 | `42 879 258 263` | `37 773 227 231` | First pinned metric |
| Metric card 2 | `319 879 238 263` | `280 773 209 231` | Second pinned metric |
| Metric card 3 | `574 879 239 263` | `505 773 210 231` | Third pinned metric |
| Reports header | `42 1191 761 30` | `37 1047 669 26` | Section title and right action |
| Reports card | `33 1252 782 411` | `29 1101 688 361` | Three rows visible above tab bar |
| Tab bar | `0 1671 853 173` | `0 1469 750 152` | Native tab bar reserve area |

## Token Samples

| Token | Sample | Use |
| --- | --- | --- |
| Hero green | `#5F8362` | Header base |
| Hero mid green | `#638864` | Header gradient/tint |
| Page background | `#F7F5F2` | Warm body background |
| CTA green | `#5D8261` | Add record card |
| White text | `#F5F8F6` | Hero text |
| Danger pill sample | `#E39F95` | Abnormal badge tint |
| Tab background | `#FEFEFE` | Bottom tab bar |

## Implementation Notes

- Build against the golden state first. Live data can vary later, but QA needs one fixed visual state.
- Preserve existing homepage event handlers and route behavior.
- Do not continue to other pages until homepage comparison passes or is explicitly accepted with known deviations.
- If WeChat DevTools adds simulator chrome not present in the source image, compare the content area and record the crop mismatch in `design-qa.md`.

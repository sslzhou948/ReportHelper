# Visual Baseline

This folder defines the visual QA baseline for the HealthHelper mini program.

The source of truth is the original wireframe package in `healthhelper_design/`.
The executable contract is `tests/visual/layout-contract.json`, checked by:

```powershell
npm.cmd run visual:check
```

The current product baseline is **normal mode**. Senior / large-text mode is a backlog item and must not drive the default proportions.

The baseline covers three widths:

- 360px compact phones
- 375px mainstream iPhone simulator
- 414px large phones

Key acceptance rules:

- Custom top layout must avoid the WeChat capsule.
- Cards and primary actions must fill the 16px content grid.
- No major block may shrink to text width.
- Major home layout blocks use `view + bindtap`, not native `button`, to avoid mini program button intrinsic layout differences.
- Tab pages must reserve the native tab bar and safe-area bottom.
- Horizontal cards must keep fixed width and scroll instead of compressing.
- Default proportions should match the wireframe's normal information density, not senior-mode density.

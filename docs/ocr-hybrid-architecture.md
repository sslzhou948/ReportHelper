# Retired OCR Hybrid Architecture Note

Updated: 2026-06-06

This document used to describe a DeepSeek/commercial-OCR first pass with a GPT vision fallback.

That route has been retired for the current product because real-photo and double-column reports were more reliable with the direct GPT vision route. The active implementation target is:

```text
upload photos -> backend OCR task -> gpt_vision provider -> backend normalization -> review/save -> health data
```

See `docs/progress-archive-2026-06-06.md` for the current progress archive and deferred cleanup list.

Keep this file only as historical context. Do not use it as an implementation guide unless the OCR provider strategy is explicitly reopened.

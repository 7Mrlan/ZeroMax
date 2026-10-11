# Runtime performance benchmark contract

This repository currently has no connected Android device or emulator. No FPS, TTI, jank, memory, or database throughput percentage is claimed until this contract is executed.

Build Zero `d7725cd`, Zerox `a21abd6`, and the candidate with the same release Hermes/Fabric settings on the same Android device/API. Use fixtures with 100, 1,000, and 10,000 records distributed across 1 and 100 days. Collect at least 30 samples per metric and store median/P95 plus raw samples in `performance/latest.json`.

Required metrics for every baseline are `coldStartTtiMs`, `bootCopyMs`, `tabSwitchP95Ms`, `entrySwitchP95Ms`, `scrollJankPercent`, `peakRssMb`, and `dbQueryP95Ms`. The report must contain baselines named `zero-d7725cd`, `zerox-a21abd`, and `candidate`, the exact device/build/fixture metadata, and the collection command.

Only the candidate report may claim a performance improvement. A candidate P95 regression over 5% against the Zero baseline blocks release; a claim of improvement requires the same input/device/build and statistically comparable repeated samples. Static FlashList counts, bundle size, test count, or a successful APK build are not performance evidence.

# Runtime performance benchmark contract

API35 emulator-5554 is connected, but this contract has not produced a repeatable benchmark yet. No FPS, TTI, jank, memory, or database throughput percentage is claimed.

## Baseline artifact readiness (2026-10-12)

The baseline build probe used isolated checkouts and the same JDK17/SDK37
host. Zero `d7725cd` installed its locked dependencies and produced a debug
APK with `assembleDebug` (437 tasks):

- APK: `/tmp/zero-baseline-d7725cd/android/app/build/outputs/apk/debug/app-debug.apk`
- SHA-256: `e2854bbd5b50bbac79e5f3d476b0cfd11019ab8f73c9acc66f9a0a17d7241354`
- Size: 226,302,610 bytes; package `com.anotherwhy.zero`, version `2.6.6`,
  compile/target SDK 36, min SDK 24.

Zero release packaging did not reach compilation because Gradle could not
download `org.eclipse.jgit:org.eclipse.jgit:7.5.0.202512021534-r` from
`plugins.gradle.org` (TLS handshake EOF); it also had no production
`keystore.properties`. The debug artifact is therefore a build smoke, not a
release performance baseline.

Zerox `a21abd6` is not a valid reproducible dependency baseline: its committed
`bun.lock` still declares `react-native-worklets` `^0.7.4`, while
`package.json` declares `^0.8.0` beside Reanimated `4.2.2`. Frozen install
fails on that mismatch; a non-frozen install resolves Worklets `0.8.3`, and
Gradle then fails the real `assertWorkletsVersionTask` because Reanimated
4.2.2 only supports Worklets 0.7.x or older. No Zerox APK or performance
sample was produced. This dependency contradiction must remain visible in any
comparison; silently changing the lock would no longer measure the published
`a21abd6` baseline.

Build Zero `d7725cd`, Zerox `a21abd6`, and the candidate with the same release Hermes/Fabric settings on the same Android device/API. Use fixtures with 100, 1,000, and 10,000 records distributed across 1 and 100 days. Collect at least 30 samples per metric and store median/P95 plus raw samples in `performance/latest.json`.

Required metrics for every baseline are `coldStartTtiMs`, `bootCopyMs`, `tabSwitchP95Ms`, `entrySwitchP95Ms`, `scrollJankPercent`, `peakRssMb`, and `dbQueryP95Ms`. The report must contain baselines named `zero-d7725cd`, `zerox-a21abd`, and `candidate`, the exact device/build/fixture metadata, and the collection command.

The validator expects `device` and `build` to be non-empty metadata objects,
`fixtures` to be a non-empty array of `{records, days}` entries, and
`collectionCommand` to identify the exact collector invocation. Every metric
stores `p50`, `p95`, `samples`, and a finite numeric `raw` array whose length
equals `samples` (at least 30). A report with missing raw samples is invalid;
summary percentiles without the underlying observations are not reproducible
evidence. The candidate P95 for every required metric must be no more than
5% above `zero-d7725cd`; the validator rejects a larger regression as a
release block. This check is a guardrail only and does not create measurements.

Only the candidate report may claim a performance improvement. A candidate P95 regression over 5% against the Zero baseline blocks release; a claim of improvement requires the same input/device/build and statistically comparable repeated samples. Static FlashList counts, bundle size, test count, or a successful APK build are not performance evidence.

## Opt-in trace instrumentation

The candidate now has an Android `ZeroPerformance` bridge behind the Gradle
property `-PzeroPerf=true`. It stores bounded, PII-free mark/measure events in
memory and flushes them as `ZeroPerf` logcat JSON only when the benchmark flag
is enabled. The default build uses `ZERO_PERF_ENABLED=false`; an API35 runtime
check produced no `ZeroPerf` lines in the default debug package, while the
benchmark debug package emitted `process.start`, `boot.initBackend` and
`boot.ready` records. This proves the switch and bridge, not a performance
result. Frame sessions, query metrics, release Hermes collection and the raw
30-sample report are still pending.

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

The candidate at code commit `81b278a` now has an Android `ZeroPerformance` bridge behind the Gradle
property `-PzeroPerf=true`. It stores bounded, PII-free mark/measure events in
memory and flushes them as `ZeroPerf` logcat JSON only when the benchmark flag
is enabled. The default build uses `ZERO_PERF_ENABLED=false`; an API35 runtime
check produced no `ZeroPerf` lines in the default debug package, while the
benchmark debug package emitted `process.start`, `boot.initBackend` and
`boot.ready` records. This proves the switch and bridge, not a performance
result. Frame sessions, query metrics, release Hermes collection and the raw
30-sample report are still pending.

The benchmark debug smoke ran on API35 `zero-api35` and emitted a single
`boot.initBackend` duration of `414.857359ms` plus process/app/ready marks.
That one debug observation only proves the trace path; it is not a TTI sample,
baseline comparison, or performance claim.

## 集中 release/Hermes/Fabric smoke（2026-10-12，代码 `1941c92`）

按“完整大模块集中构建”规则，本轮在 JDK 17.0.20、SDK 37/Build Tools 35.0.0、NDK 28 环境完成两次 release `assembleRelease`：

- `-PzeroPerf=false`：740 actionable tasks 成功；test-signed APK 102,061,107 bytes，SHA-256 `f96dc3faa8206d117f8378041f90eeb6fd72c1741e36a7a32b112fd890b6616c`。
- `-PzeroPerf=true`：740 actionable tasks 成功；APK 102,061,107 bytes，SHA-256 `3f32340bce24cc7cd25931a3125082a2b39d87bfbe03adfefc7cee29e1d1d1a8`；`apksigner verify --verbose` 通过 v2；`check-android-artifact.js` 通过。
- 临时 test keystore 只用于本次本地 smoke，已清理；这不是生产签名 AAB/商店发布证据。Gradle 输出了既有 AGP legacy variant API deprecation warnings，但构建未失败。

trace-on 包在 API35 `zero-api35` fresh install 后无 Metro 启动，logcat 产生 `process.start`、`app.module_start`、`boot.init_start`、`boot.initBackend.start`、`boot.initBackend`（本次单次 debug/release smoke `durationMs=64.78384000000369`）和 `boot.ready`。这只证明 release bundle、开关和启动 trace 路径；本轮没有完成 tab/entry 交互，因此没有 frame session、query P50/P95 或 TTI 样本，也没有性能百分比结论。

### API35 trace-on interaction smoke（2026-10-12）

在同一 trace-on test-signed release APK（SHA `3f32340bce24cc7cd25931a3125082a2b39d87bfbe03adfefc7cee29e1d1d1a8`）fresh install 后，API35 `zero-api35` 无 Metro 完成 onboarding，并执行 Home → Reports → Categories → Home 和 AddEntry 支出/收入往返。`ZeroPerf` 产生了：

- tab session：duration `133.333328ms` / `16` frames / `0` long frames；`16.666666ms` / `9` / `0`；`166.666660ms` / `15` / `1`。
- entry session：duration `66.666664ms` / `8` / `1`，以及三次 `249.999990ms` / `16` / `0`。
- transaction month query duration observations：`52.891074ms`、`17.983448ms`、`1.449500ms`、`1.406081ms`、`2.093581ms`。

这些是一次 debug-like emulator interaction smoke 的原始 trace 摘要，样本不足 30 次、没有 Zero/Zerox 同设备对照，也没有 TTI/RSS/scroll jank 报告；因此不能宣称 60fps、性能提升或比上游更快。

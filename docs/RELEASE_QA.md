# Release QA checklist

Run this before every release, against the **actual release artifact** (`.aab` /
`.ipa`), on **real hardware**. Debug builds and simulators hide production-only
failures: Hermes behaviour, `console.*` suppression, storage permissions,
low-memory kills, and R8/ProGuard differences.

Zero ships no crash reporter and no analytics by design — the only signals that
a build is sound are the automated gate below and this manual pass.

## 1. Automated gate (must be green before building)

```bash
pnpm run format:check # prettier
pnpm run typecheck    # tsc --strict
pnpm run lint         # eslint (flat config, ESLint 9)
pnpm run test:ci      # jest — full suite incl. App render smoke test
cd android && ./gradlew assembleDebug
```

The GitHub Actions `android-debug-artifact` job repeats the Android debug
build in a clean JDK 17 environment, runs `pnpm run android:artifact:check`,
and uploads the APK for manual QA. This is a static artifact gate only: it
does not prove device startup, database migration/recovery, frame pacing,
16 KB page runtime behaviour, release signing, or iOS compatibility. Those
checks remain in the device and platform sections below and must not be
marked complete from a green CI build alone.

The local reproducible toolchain used for the latest clean build was JDK
17.0.20.1, Android platform 37.0, Build Tools 37.0.0 and NDK 28.0.12916984.
It produced a debug APK successfully; API35 emulator-5554 is connected and has
provided JSI/fresh-start smoke evidence, but this still does not provide
release signing or runtime performance evidence.

On 2026-10-12, a one-day temporary local keystore was used only to exercise the
release packaging path. `:app:assembleRelease` completed successfully (740
tasks); the 98 MB APK passed `apksigner verify` with APK Signature Scheme v2,
and `aapt2 dump permissions` showed INTERNET plus storage permissions capped at
API 32. The temporary keystore and `android/keystore.properties` were deleted
afterward. This is test-signing evidence, not a production signing or store
readiness result.

The same test-signed release APK was installed on the API35 `zero-api35`
emulator without Metro. After a fresh app install, logcat showed the embedded
Hermes app starting, WatermelonDB JSI registration, `watermelon_v4.db` opening,
and schema version 4 setup with no FATAL/JSI fallback. This is a release
startup smoke only; migration crash recovery, performance, real hardware and
production signing remain open.

## 2. Build the real artifact

- [ ] `pnpm run version:set` — versionName and versionCode both bumped
- [ ] `cd android && ./gradlew bundleRelease`
- [ ] iOS: `bundle exec pod install` then Archive from Xcode
- [ ] Install the release build on device (not Metro, not debug)

Run `pnpm run release:identity:check` before building. It keeps the Android
applicationId, iOS bundle identifier, marketing/version name and build number
aligned; it does not prove that an artifact is signed or installable.

`pnpm run e2e:contract:check` validates Maestro flow selectors against source.
On 2026-10-12, all five flows also ran successfully on the API35
`zero-api35` emulator against the test-signed release APK; see
[`E2E_QA.md`](./E2E_QA.md) for the commit and SHA-256. This is emulator
evidence for the covered screens only, not a substitute for physical-device,
accessibility, migration-recovery, network, performance or iOS validation.

## 3. Privacy verification (Lossless Protocol claims)

- [ ] `aapt dump permissions <release apk>` includes `android.permission.INTERNET`
      for the explicitly opt-in AI path; storage permissions remain capped at
      `maxSdkVersion="32"`
- [ ] With AI disabled (the default), a fresh install makes no network request;
      with AI enabled, only the configured HTTPS/allow-listed endpoint is used
- [ ] Play Console pre-launch report and device capture match the privacy copy
      for optional AI network access
- [ ] Settings → "What leaves this device" renders and reads correctly
- [ ] `src/backend/ai/network.ts` remains the only fetch boundary and its
      HTTPS, host allowlist, timeout, cancellation and response-size tests pass

## 4. Critical flows (both platforms)

- [ ] Fresh install → onboarding → name → categories → currency → first expense
- [ ] Add / edit / delete an expense; confirm the daily-budget line is right
      **when editing** (it must not double-count the amount being edited)
- [ ] Delete a transaction and let the 3s undo window elapse → stays deleted
- [ ] Delete a transaction, then **scroll the row off-screen** within 3s →
      the delete still commits and the row does not come back
- [ ] Delete a transaction, then **background/kill the app** within 3s →
      no resurrection
- [ ] Category create / edit / soft-delete (with confirmation)
- [ ] Verify a soft-deleted category still resolves on old transactions
- [ ] Debtor + debts: create, edit, settle, delete debtor (deletes their debts)
- [ ] Reports: donut renders, centre total matches the legend sum, tapping a
      legend row opens that category
- [ ] Reports: empty month, single-category month, many-category month
- [ ] Month navigation across a year boundary; no flicker

## 5. Backup / restore

- [ ] Export → wipe → restore: expenses, categories, debts, **budgets**, and
      soft-delete statuses all return
- [ ] Restore a backup with duplicate category names → merged, not duplicated
- [ ] Cancel the "replace all data" dialog → existing data untouched
- [ ] Restore on **Android 10, 11 or 12** specifically (storage permission path)
- [ ] After restore, the month/year picker shows the restored data's years

## 6. Locale, theme, accessibility

- [ ] Switch theme (light / dark / system) — including a system-level change
      while the app is open
- [ ] Switch language, then re-open the month picker: month names update and
      previously-saved months still resolve (no empty month)
- [ ] Non-Latin name in onboarding (e.g. `हिंदी`, `José`) is accepted
- [ ] Currency formatting: an INR device shows lakh grouping for INR but
      **not** for USD/RUB/HUF
- [ ] Screen reader: swipe actions announce Edit/Delete; the budget
      "every month" row announces as a switch with its state
- [ ] Large system font / display size does not clip the home header or sheets

## 7. Edge and adversarial

- [ ] Airplane mode throughout (the app must not care)
- [ ] **API <= 32 device:** deny READ/WRITE external storage → clear message, offer to open settings
- [ ] Force-kill mid-write (add an expense and kill immediately) → no corruption
- [ ] Very long titles, very large amounts, rapid double-taps on Continue
      during onboarding (must not create duplicate categories/currencies)
- [ ] Low storage
- [ ] Cold start time and list scroll feel unchanged vs the previous release
- [ ] Settings → Diagnostics lists recorded errors and clears them

The local API32 emulator request path was exercised on 2026-10-12, but Android
12 re-granted both legacy storage permissions when the targetSdk 36 app called
`requestMultiple`; this is recorded in `ANDROID_LOCAL_BUILD.md` and does not
close the denied-permission item.

## 8. Sign-off

- [ ] Automated gate green
- [ ] Sections 3–7 walked on at least one recent iPhone and one mid/low-end Android
- [ ] Note the OS versions and devices used in the release notes

## 2026-10-12 集中 release smoke

代码 `1941c92` 在本地主机使用临时 test keystore 完成 trace-off/trace-on 两次 `:app:assembleRelease`（各 740 actionable tasks）。trace-on APK SHA-256 为 `3f32340bce24cc7cd25931a3125082a2b39d87bfbe03adfefc7cee29e1d1d1a8`，v2 签名和 Android artifact contract 通过；安装到 API35 `zero-api35` 后无 Metro 启动并产生 ZeroPerf boot marks。临时 keystore 已清理，正式签名、AAB、物理设备、TalkBack、网络和真实性能仍未通过。

## Current-code rebuild (2026-10-12)

After `9590e2a` (durable AI queue, OpenAI envelope, Chinese copy), trace-off and trace-on `assembleRelease` both completed with 740 actionable tasks. The latest trace-on APK SHA-256 is `67fd6cc8b9e31aa9343355c80312e8947075347824f41574cb98e595137892c3`; v2 signing and artifact checks passed. This remains temporary test signing; latest language/AI/accessibility device flows and production signing are pending.

## Current-code offline AI smoke (2026-10-12)

After installing the current `9590e2a` release APK on API35, Home's AI quick
entry accepted `lunch` offline and displayed a persisted `Queued` task with a
cancel control. AI remained disabled and no request was sent. Network,
restart, key lifecycle, TalkBack and production signing remain open.

- [ ] Run `ai-offline-queue.yaml` on the current-code release artifact and record the Maestro output; the equivalent API35 adb smoke is documented above but is not a Maestro pass.

## Current HEAD concentrated release build (2026-10-12)

For current HEAD `cf5f53e`, trace-off and trace-on `:app:assembleRelease`
were invoked in one concentrated build module with temporary JDK17/SDK37/NDK28
and a local test keystore. The final trace-on APK is 102,067,727 bytes,
SHA-256 `37f6b50803394bcaba1faea96af55ccd234e128ec553ff0fc1443670b2b01c9a`;
APK Signature Scheme v2 verification passed, and the temporary keystore plus
`android/keystore.properties` were removed. This is packaging evidence only.

The concentrated build itself is packaging evidence; the API35 adb runtime
smoke for this artifact is recorded below. Maestro, TalkBack, production
signing/AAB and physical-device validation remain open.

## Current HEAD API35 adb smoke (2026-10-12)

The current `cf5f53e` trace-on artifact was installed after removing the prior
test-signed package on API35 `zero-api35`. A no-Metro cold start reached fresh
v4/Home and logcat showed WatermelonDB JSI, schema v4, BootGate ready, and
ZeroPerf boot marks. Manual adb taps then completed 30 four-tab round trips and
30 expense/income mode round trips. Raw traces are linked from
[`PERFORMANCE_BENCHMARK.md`](./PERFORMANCE_BENCHMARK.md); this is not a Maestro
pass and does not cover TalkBack, language switching, AI network/restart,
physical devices, or a comparative performance claim.

The same current API35 manual session also opened Home → AI, queued `lunch`
while AI was disabled, and cancelled it to `Cancelled`; no cloud request was
made. This is recorded as an adb smoke only, not a Maestro/network/restart
pass.

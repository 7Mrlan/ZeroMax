# Changelog

## Unreleased — Zero × Zerox candidate

This candidate keeps Zero `d7725cd` as the maintenance baseline and rewrites
selected Zerox `a21abd6` capabilities onto the approved latest stack.

- Upgraded target stack: React Native 0.87.1, React 19.3.0, TypeScript 7.0.2,
  Reanimated 4.7.1/Worklets 0.13.0, Navigation 7.5/7.20, Redux Toolkit
  2.13.0, FlashList 2.3.3, WatermelonDB 0.28.0, MMKV 4.3.2 and Zod 4.6.5.
- Added fail-closed Android v3 migration preflight, WAL-aware backup, v4
  target verification and interrupted-target recovery.
- Added income records, hierarchical categories, export v5 and unified
  expense/income transaction records.
- Added single-route expense/income entry, UI-thread tab/entry animations,
  privacy-gated AI parser/network/queue contracts and stable E2E identifiers.

This is not a release sign-off. Android device migration, signed artifacts,
iOS Pods/device validation, Maestro execution and real performance samples are
still required; see [Release QA](docs/RELEASE_QA.md).

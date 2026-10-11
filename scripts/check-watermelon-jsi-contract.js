'use strict';

const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const packageJson = JSON.parse(read('package.json'));
const settings = read('android/settings.gradle');
const appGradle = read('android/app/build.gradle');
const application = read('android/app/src/main/java/com/anotherwhy/zero/MainApplication.kt');
const readonly = read('android/app/src/main/java/com/anotherwhy/zero/readonly/ReadOnlySqliteModule.java');
const database = read('src/watermelondb/database.ts');
const cmake = read(require.resolve('@nozbe/watermelondb/native/android-jsi/src/main/cpp/CMakeLists.txt'));

const checks = [
  [packageJson.dependencies?.['@nozbe/sqlite'] === '3.46.0', 'package.json must pin @nozbe/sqlite 3.46.0'],
  [
    packageJson.scripts?.postinstall === 'node scripts/patch-watermelon-jsi-cmake.js',
    'postinstall must patch Watermelon JSI CMake paths',
  ],
  [
    settings.includes("include ':nozbe_watermelondb_jsi'") && settings.includes('native/android-jsi'),
    'Gradle settings must include Watermelon JSI',
  ],
  [appGradle.includes("implementation project(':nozbe_watermelondb_jsi')"), 'app Gradle must link Watermelon JSI'],
  [
    application.includes('WatermelonDBJSIPackage') && application.includes('add(WatermelonDBJSIPackage())'),
    'MainApplication must register Watermelon JSI',
  ],
  [
    readonly.includes('claimFreshTargetArtifact') &&
      readonly.includes('ATOMIC_MOVE') &&
      readonly.includes('targetMarkerClaimFile'),
    'native target markers must use atomic ownership writes',
  ],
  [
    readonly.includes('writeTargetSnapshot') && readonly.includes('insertOrThrow'),
    'native target writer must validate and commit normalized rows',
  ],
  [
    database.includes("prop === '$$typeof'") && database.includes('Symbol.toStringTag'),
    'database proxy must ignore React Refresh metadata probes',
  ],
  [
    cmake.includes('# ZERO_PNPM_NATIVE_PATHS') && cmake.includes('NODE_MODULES_PATH_WM'),
    'Watermelon JSI CMake paths must be patched',
  ],
];

for (const [ok, message] of checks) {
  if (!ok) {
    console.error(`Watermelon JSI contract failed: ${message}`);
    process.exit(1);
  }
}

console.log('Watermelon JSI contract validated');

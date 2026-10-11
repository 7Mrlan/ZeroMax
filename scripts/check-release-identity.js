'use strict';

const fs = require('node:fs');

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const android = fs.readFileSync('android/app/build.gradle', 'utf8');
const ios = fs.readFileSync('ios/zero.xcodeproj/project.pbxproj', 'utf8');

const match = (source, pattern, label) => {
  const result = source.match(pattern);
  if (!result) throw new Error(`Release identity is missing ${label}`);
  return result[1];
};

const displayName = String(app.displayName ?? '').trim();
const androidId = match(android, /applicationId\s+"([^"]+)"/, 'Android applicationId');
const androidVersionCode = Number(match(android, /versionCode\s+(\d+)/, 'Android versionCode'));
const androidVersionName = match(android, /versionName\s+"([^"]+)"/, 'Android versionName');
const iosBundleIds = [...ios.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)].map(value => value[1].trim());
const iosVersions = [...ios.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map(value => value[1].trim());
const iosBuilds = [...ios.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/g)].map(value => Number(value[1].trim()));

if (!displayName) throw new Error('Release identity needs a non-empty app.json displayName');
if (androidId !== 'com.anotherwhy.zero') throw new Error(`Unexpected Android applicationId: ${androidId}`);
if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1)
  throw new Error('Android versionCode must be positive');
if (!/^\d+\.\d+\.\d+$/.test(androidVersionName)) throw new Error(`Invalid Android versionName: ${androidVersionName}`);
if (iosBundleIds.length === 0 || iosBundleIds.some(value => value !== androidId)) {
  throw new Error('Android and iOS bundle identifiers do not match');
}
if (iosVersions.length === 0 || iosVersions.some(value => value !== androidVersionName)) {
  throw new Error('Android and iOS marketing versions do not match');
}
if (iosBuilds.length === 0 || iosBuilds.some(value => value !== androidVersionCode)) {
  throw new Error('Android versionCode and iOS CURRENT_PROJECT_VERSION do not match');
}

console.log(`Release identity validated: ${displayName} ${androidVersionName} (${androidVersionCode}) ${androidId}`);

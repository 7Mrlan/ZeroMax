'use strict';

const fs = require('node:fs');
const {execFileSync} = require('node:child_process');

const artifact = process.argv[2] ?? 'android/app/build/outputs/apk/debug/app-debug.apk';
if (!fs.existsSync(artifact)) {
  console.error(`Android artifact not found: ${artifact}`);
  process.exit(1);
}

const listing = execFileSync('unzip', ['-Z1', artifact], {encoding: 'utf8'}).split('\n');
for (const entry of ['AndroidManifest.xml', 'classes.dex']) {
  if (!listing.includes(entry)) {
    console.error(`Android artifact is missing ${entry}`);
    process.exit(1);
  }
}
if (!listing.some(entry => entry.includes('lib/arm64-v8a/'))) {
  console.error('Android artifact has no arm64-v8a native library');
  process.exit(1);
}
if (listing.some(entry => entry.endsWith('.keystore') || entry.endsWith('.jks'))) {
  console.error('Android artifact unexpectedly contains a keystore file');
  process.exit(1);
}
console.log(`Android artifact validated: ${artifact}`);

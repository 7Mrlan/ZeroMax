'use strict';

const fs = require('node:fs');

const path = process.argv[2] ?? 'performance/latest.json';
if (!fs.existsSync(path)) {
  console.error(`Performance report not found: ${path}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`Performance report is not valid JSON: ${error.message}`);
  process.exit(1);
}

const required = ['device', 'build', 'fixtures', 'baselines', 'metrics'];
const missing = required.filter(key => report[key] === undefined);
if (missing.length > 0 || !Array.isArray(report.baselines) || report.baselines.length < 3) {
  console.error(
    `Performance report is incomplete. Required fields: ${required.join(', ')}; baselines must include Zero, Zerox, candidate.`,
  );
  process.exit(1);
}

const baselineNames = report.baselines.map(item => item.name);
for (const name of ['zero-d7725cd', 'zerox-a21abd', 'candidate']) {
  if (!baselineNames.includes(name)) {
    console.error(`Missing comparable baseline: ${name}`);
    process.exit(1);
  }
}

const metricNames = [
  'coldStartTtiMs',
  'bootCopyMs',
  'tabSwitchP95Ms',
  'entrySwitchP95Ms',
  'scrollJankPercent',
  'peakRssMb',
  'dbQueryP95Ms',
];
for (const baseline of report.baselines) {
  for (const metric of metricNames) {
    const value = baseline.metrics?.[metric];
    if (!value || !Number.isFinite(value.p50) || !Number.isFinite(value.p95) || value.samples < 30) {
      console.error(`${baseline.name}.${metric} needs finite p50/p95 and at least 30 samples`);
      process.exit(1);
    }
  }
}

console.log(`Performance report validated: ${path}`);

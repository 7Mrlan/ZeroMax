'use strict';

const fs = require('node:fs');

const REQUIRED_BASELINES = ['zero-d7725cd', 'zerox-a21abd', 'candidate'];
const METRIC_NAMES = [
  'coldStartTtiMs',
  'bootCopyMs',
  'tabSwitchP95Ms',
  'entrySwitchP95Ms',
  'scrollJankPercent',
  'peakRssMb',
  'dbQueryP95Ms',
];

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNonNegative = value => Number.isFinite(value) && value >= 0;

const validateMetadata = (report, errors) => {
  if (!isRecord(report.device) || Object.keys(report.device).length === 0) {
    errors.push('device metadata must be a non-empty object');
  }
  if (!isRecord(report.build) || Object.keys(report.build).length === 0) {
    errors.push('build metadata must be a non-empty object');
  }
  if (typeof report.collectionCommand !== 'string' || report.collectionCommand.trim() === '') {
    errors.push('collectionCommand must be a non-empty string');
  }
  if (!Array.isArray(report.fixtures) || report.fixtures.length === 0) {
    errors.push('fixtures must be a non-empty array');
    return;
  }
  report.fixtures.forEach((fixture, index) => {
    if (!isRecord(fixture) || !Number.isInteger(fixture.records) || fixture.records <= 0) {
      errors.push(`fixtures[${index}].records must be a positive integer`);
    }
    if (!isRecord(fixture) || !Number.isInteger(fixture.days) || fixture.days <= 0) {
      errors.push(`fixtures[${index}].days must be a positive integer`);
    }
  });
};

const validateMetric = (baselineName, metricName, metric, errors) => {
  const prefix = `${baselineName}.${metricName}`;
  if (!isRecord(metric)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  if (!isFiniteNonNegative(metric.p50) || !isFiniteNonNegative(metric.p95)) {
    errors.push(`${prefix} needs finite non-negative p50/p95`);
  } else if (metric.p95 < metric.p50) {
    errors.push(`${prefix} p95 cannot be lower than p50`);
  }
  if (!Number.isInteger(metric.samples) || metric.samples < 30) {
    errors.push(`${prefix}.samples must be an integer of at least 30`);
  }
  if (!Array.isArray(metric.raw) || metric.raw.length < 30) {
    errors.push(`${prefix}.raw needs at least 30 observations`);
    return;
  }
  if (metric.samples !== metric.raw.length) {
    errors.push(`${prefix}.samples must equal raw.length`);
  }
  if (metric.raw.some(value => !isFiniteNonNegative(value))) {
    errors.push(`${prefix}.raw must contain only finite non-negative numbers`);
  }
};

const validateReport = report => {
  const errors = [];
  if (!isRecord(report)) {
    return {ok: false, errors: ['performance report must be an object']};
  }

  const required = ['device', 'build', 'fixtures', 'baselines', 'metrics', 'collectionCommand'];
  const missing = required.filter(key => report[key] === undefined || report[key] === null);
  if (missing.length > 0) {
    errors.push(`missing required fields: ${missing.join(', ')}`);
  }
  validateMetadata(report, errors);

  if (!Array.isArray(report.baselines) || report.baselines.length < REQUIRED_BASELINES.length) {
    errors.push(
      `baselines must contain at least ${REQUIRED_BASELINES.length} entries: ${REQUIRED_BASELINES.join(', ')}`,
    );
  }
  const baselinesByName = new Map();
  if (Array.isArray(report.baselines)) {
    report.baselines.forEach((baseline, index) => {
      if (!isRecord(baseline) || typeof baseline.name !== 'string' || baseline.name.trim() === '') {
        errors.push(`baselines[${index}].name must be a non-empty string`);
        return;
      }
      if (baselinesByName.has(baseline.name)) {
        errors.push(`duplicate baseline: ${baseline.name}`);
      }
      baselinesByName.set(baseline.name, baseline);
      METRIC_NAMES.forEach(metricName =>
        validateMetric(baseline.name, metricName, baseline.metrics?.[metricName], errors),
      );
    });
  }
  REQUIRED_BASELINES.forEach(name => {
    if (!baselinesByName.has(name)) {
      errors.push(`missing comparable baseline: ${name}`);
    }
  });

  const zero = baselinesByName.get('zero-d7725cd');
  const candidate = baselinesByName.get('candidate');
  if (zero && candidate) {
    METRIC_NAMES.forEach(metricName => {
      const zeroP95 = zero.metrics?.[metricName]?.p95;
      const candidateP95 = candidate.metrics?.[metricName]?.p95;
      if (!isFiniteNonNegative(zeroP95) || !isFiniteNonNegative(candidateP95)) return;
      const allowedP95 = zeroP95 === 0 ? 0 : zeroP95 * 1.05;
      if (candidateP95 > allowedP95) {
        errors.push(
          `release blocked: candidate.${metricName}.p95 (${candidateP95}) exceeds ` +
            `zero-d7725cd by more than 5% (allowed ${allowedP95})`,
        );
      }
    });
  }

  return {ok: errors.length === 0, errors};
};

const main = () => {
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

  const result = validateReport(report);
  if (!result.ok) {
    console.error('Performance report is invalid:');
    result.errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log(`Performance report validated: ${path}`);
};

if (require.main === module) main();

module.exports = {METRIC_NAMES, REQUIRED_BASELINES, validateReport};

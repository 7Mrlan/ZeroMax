const {METRIC_NAMES, validateReport} = require('../validate-performance-report');

const observations = value => Array.from({length: 30}, () => value);
const metric = (p95 = 100) => ({p50: p95 / 2, p95, samples: 30, raw: observations(p95)});

// This is an in-memory schema fixture only. It is not a device measurement and
// must never be copied to performance/latest.json as benchmark evidence.
const validReport = () => ({
  device: {model: 'fixture-device', apiLevel: 36},
  build: {variant: 'release', hermes: true, fabric: true, commit: 'fixture'},
  fixtures: [
    {records: 100, days: 1},
    {records: 1000, days: 100},
    {records: 10000, days: 100},
  ],
  collectionCommand: 'node collect-performance.js --device fixture-device',
  metrics: {names: METRIC_NAMES},
  baselines: ['zero-d7725cd', 'zerox-a21abd', 'candidate'].map(name => ({
    name,
    metrics: Object.fromEntries(METRIC_NAMES.map(metricName => [metricName, metric()])),
  })),
});

const clone = value => JSON.parse(JSON.stringify(value));

describe('validate-performance-report', () => {
  it('accepts comparable metadata and complete raw observations', () => {
    expect(validateReport(validReport())).toEqual({ok: true, errors: []});
  });

  it('rejects missing or non-finite raw observations', () => {
    const report = validReport();
    delete report.baselines[0].metrics.coldStartTtiMs.raw;
    report.baselines[1].metrics.bootCopyMs.raw[0] = Number.NaN;

    const result = validateReport(report);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'zero-d7725cd.coldStartTtiMs.raw needs at least 30 observations',
        'zerox-a21abd.bootCopyMs.raw must contain only finite non-negative numbers',
      ]),
    );
  });

  it('rejects incomplete collection metadata', () => {
    const report = validReport();
    report.device = {};
    report.fixtures[0].days = 0;
    report.collectionCommand = '  ';

    const result = validateReport(report);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'device metadata must be a non-empty object',
        'fixtures[0].days must be a positive integer',
        'collectionCommand must be a non-empty string',
      ]),
    );
  });

  it('blocks a candidate P95 regression above five percent of Zero', () => {
    const report = validReport();
    const candidate = report.baselines.find(item => item.name === 'candidate');
    candidate.metrics.coldStartTtiMs = metric(106);

    const result = validateReport(report);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'release blocked: candidate.coldStartTtiMs.p95 (106) exceeds zero-d7725cd by more than 5% (allowed 105)',
    );
  });

  it('accepts a candidate exactly at the five percent release boundary', () => {
    const report = clone(validReport());
    const candidate = report.baselines.find(item => item.name === 'candidate');
    candidate.metrics.coldStartTtiMs = metric(105);

    expect(validateReport(report)).toEqual({ok: true, errors: []});
  });
});

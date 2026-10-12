import {isPerformanceTraceEnabled, measurePerformance, markPerformance, recordPerformance} from '../performanceTrace';

describe('performanceTrace', () => {
  it('keeps normal JS semantics when the native benchmark flag is off', async () => {
    await expect(measurePerformance('boot.test', async () => 42)).resolves.toBe(42);
    expect(isPerformanceTraceEnabled).toBe(false);
  });

  it('rejects invalid metric names without throwing', () => {
    expect(() => markPerformance('user-id/secret')).not.toThrow();
    expect(() => recordPerformance('db.test', Number.NaN)).not.toThrow();
  });
});

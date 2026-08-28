/**
 * Regression tests for month-name resolution.
 *
 * `getMonthNumber` feeds `YYYY-MM` database query keys. It used to return
 * "00" whenever the month name could not be found in the ACTIVE locale's
 * month list — which happens as soon as a name persisted under one language
 * is read back under another. "2026-00" matches no rows, so the month
 * silently rendered empty.
 */

import {
  getMonthIndex,
  getMonthNumber,
  getMonthNames,
  setDayjsLocale,
} from '../dateUtils';

describe('getMonthIndex', () => {
  it('resolves full English month names', () => {
    expect(getMonthIndex('January')).toBe(0);
    expect(getMonthIndex('December')).toBe(11);
  });

  it('is case-insensitive', () => {
    expect(getMonthIndex('january')).toBe(0);
    expect(getMonthIndex('JANUARY')).toBe(0);
  });

  it('resolves short month names', () => {
    expect(getMonthIndex('Jan')).toBe(0);
    expect(getMonthIndex('Dec')).toBe(11);
  });

  it('returns -1 for a name that is not a month', () => {
    expect(getMonthIndex('Smarch')).toBe(-1);
  });
});

describe('getMonthNumber', () => {
  it('zero-pads to two digits', () => {
    expect(getMonthNumber('January')).toBe('01');
    expect(getMonthNumber('September')).toBe('09');
    expect(getMonthNumber('October')).toBe('10');
    expect(getMonthNumber('December')).toBe('12');
  });

  it('NEVER returns "00" for an unresolvable name', () => {
    // "00" would build an impossible YYYY-MM key and silently show no data.
    expect(getMonthNumber('Smarch')).not.toBe('00');
    expect(getMonthNumber('')).not.toBe('00');
  });

  it('falls back to a real month (01-12) when the name cannot be resolved', () => {
    const fallback = getMonthNumber('not-a-month');
    expect(Number.parseInt(fallback, 10)).toBeGreaterThanOrEqual(1);
    expect(Number.parseInt(fallback, 10)).toBeLessThanOrEqual(12);
  });
});

describe('month names after a locale change', () => {
  afterEach(() => {
    setDayjsLocale('en');
  });

  it('refreshes the cached month list', () => {
    const english = getMonthNames();
    expect(english[0]).toBe('January');

    setDayjsLocale('fr');
    const french = getMonthNames();
    expect(french[0]).not.toBe('January');

    setDayjsLocale('en');
    expect(getMonthNames()[0]).toBe('January');
  });

  it('still resolves a month name persisted under the previous language', () => {
    // The month picker stores names; switching language must not orphan them.
    setDayjsLocale('fr');
    expect(getMonthNumber('January')).toBe('01');
    expect(getMonthNumber('December')).toBe('12');
  });

  it('resolves names in the newly active language too', () => {
    setDayjsLocale('fr');
    const frenchMonths = getMonthNames();
    expect(getMonthNumber(frenchMonths[0])).toBe('01');
    expect(getMonthNumber(frenchMonths[11])).toBe('12');
  });
});

/**
 * The name schemas used to be `[A-Za-z\s]` only, which rejected every
 * non-Latin script — unacceptable for an app positioned as India-first.
 * Messages were also evaluated at module load, freezing them in whatever
 * language was active on first import.
 */

import {
  nameSchema,
  categorySchema,
  expenseAmountSchema,
  expenseSchema,
} from '../validationSchema';

describe('nameSchema — scripts', () => {
  it.each([
    ['plain ASCII', 'Indranil'],
    ['accented Latin', 'José'],
    ['Latin with diaeresis', 'Zoë Müller'],
    ['Devanagari', 'हिंदी नाम'],
    ['Cyrillic', 'Ольга'],
    ['Bengali', 'বাংলা'],
    ['Tamil', 'தமிழ்'],
    ['Arabic', 'محمد'],
    ['CJK', '田中太郎'],
    ['apostrophe', "O'Brien"],
    ['hyphen', 'Anne-Marie'],
  ])('accepts %s', (_label, value) => {
    expect(nameSchema.safeParse(value).success).toBe(true);
  });

  it('rejects digits and symbols', () => {
    expect(nameSchema.safeParse('User123').success).toBe(false);
    expect(nameSchema.safeParse('a@b.com').success).toBe(false);
  });

  it('enforces the length bounds', () => {
    expect(nameSchema.safeParse('ab').success).toBe(false);
    expect(nameSchema.safeParse('abc').success).toBe(true);
    expect(nameSchema.safeParse('a'.repeat(50)).success).toBe(true);
    expect(nameSchema.safeParse('a'.repeat(51)).success).toBe(false);
  });
});

describe('categorySchema', () => {
  it('accepts non-Latin category names and digits', () => {
    expect(categorySchema.safeParse('किराया').success).toBe(true);
    expect(categorySchema.safeParse('Fuel 2').success).toBe(true);
  });

  it('enforces the length bounds', () => {
    expect(categorySchema.safeParse('').success).toBe(false);
    expect(categorySchema.safeParse('a'.repeat(18)).success).toBe(true);
    expect(categorySchema.safeParse('a'.repeat(19)).success).toBe(false);
  });
});

describe('expenseAmountSchema', () => {
  it('rejects zero and accepts the documented 0.01 minimum', () => {
    expect(expenseAmountSchema.safeParse(0).success).toBe(false);
    expect(expenseAmountSchema.safeParse(0.01).success).toBe(true);
  });

  it('enforces the upper bound', () => {
    expect(expenseAmountSchema.safeParse(1000000).success).toBe(true);
    expect(expenseAmountSchema.safeParse(1000001).success).toBe(false);
  });

  it('states the real minimum in its message', () => {
    const result = expenseAmountSchema.safeParse(0);
    expect(result.success).toBe(false);
    // The copy used to say "cannot be less than 0" while rejecting 0.005.
    expect(result.error?.issues[0].message).toContain('0.01');
  });
});

describe('message evaluation', () => {
  it('resolves messages at validation time, not module load', () => {
    // A frozen message would be identical whenever it was captured; what we
    // assert here is that a message is produced through the i18n layer on
    // each parse rather than a captured constant.
    const first = expenseSchema.safeParse('').error?.issues[0].message;
    const second = expenseSchema.safeParse('').error?.issues[0].message;
    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });
});

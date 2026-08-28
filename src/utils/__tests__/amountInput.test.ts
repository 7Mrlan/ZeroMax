import {normalizeAmountInput} from '../amountInput';

describe('normalizeAmountInput', () => {
  it('treats a comma from a European numeric keyboard as the decimal point', () => {
    // BudgetSheet used to strip the comma and store 1250 instead of 12.50.
    expect(normalizeAmountInput('12,50')).toBe('12.50');
    expect(Number(normalizeAmountInput('12,50'))).toBe(12.5);
  });

  it('leaves dot-decimal input untouched', () => {
    expect(normalizeAmountInput('12.50')).toBe('12.50');
    expect(normalizeAmountInput('1234')).toBe('1234');
  });

  it('keeps only the first separator instead of rejecting the edit', () => {
    expect(normalizeAmountInput('12.5.0')).toBe('12.50');
    expect(normalizeAmountInput('12,5,0')).toBe('12.50');
    expect(normalizeAmountInput('1..5')).toBe('1.5');
  });

  it('drops anything that is not a digit or a separator', () => {
    expect(normalizeAmountInput('₹1234')).toBe('1234');
    expect(normalizeAmountInput('12 34')).toBe('1234');
    expect(normalizeAmountInput('-40')).toBe('40');
    expect(normalizeAmountInput('abc')).toBe('');
  });

  it('supports partial input while typing', () => {
    expect(normalizeAmountInput('')).toBe('');
    expect(normalizeAmountInput('12,')).toBe('12.');
    expect(normalizeAmountInput('.')).toBe('.');
  });

  it('never produces a string Number() cannot parse', () => {
    const samples = ['12,50', '1.2.3', '₹9,99', '0,01', '1000000', '12,', ''];
    for (const sample of samples) {
      const normalized = normalizeAmountInput(sample);
      if (normalized === '' || normalized === '.') {
        continue;
      }
      expect(Number.isNaN(Number(normalized))).toBe(false);
    }
  });
});

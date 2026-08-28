import {expensesToCsv} from '../csv';
import type {ExportData} from '../validate';

const expense = (
  overrides: Partial<ExportData['expenses'][number]> = {},
): ExportData['expenses'][number] => ({
  title: 'Chai',
  amount: 20,
  description: '',
  category: {name: 'Food'},
  date: '2026-07-15T10:30:00',
  ...overrides,
});

const lines = (csv: string) => csv.replace('﻿', '').split('\r\n');

describe('expensesToCsv', () => {
  it('starts with a UTF-8 BOM so Excel decodes ₹ and non-Latin text', () => {
    expect(expensesToCsv([expense()]).startsWith('﻿')).toBe(true);
  });

  it('uses CRLF line endings and a header row', () => {
    const csv = expensesToCsv([expense()]);
    expect(csv).toContain('\r\n');
    expect(lines(csv)[0]).toBe('Date,Title,Description,Category,Amount');
  });

  it('writes the date portion only and a plain dot-decimal amount', () => {
    const csv = expensesToCsv([expense({amount: 1234.56})]);
    expect(lines(csv)[1]).toBe('2026-07-15,Chai,,Food,1234.56');
  });

  it('quotes fields containing commas', () => {
    const csv = expensesToCsv([expense({title: 'Lunch, with friends'})]);
    expect(lines(csv)[1]).toContain('"Lunch, with friends"');
  });

  it('doubles inner quotes per RFC 4180', () => {
    const csv = expensesToCsv([expense({title: 'The "best" chai'})]);
    expect(lines(csv)[1]).toContain('"The ""best"" chai"');
  });

  it('quotes fields containing newlines', () => {
    const csv = expensesToCsv([expense({description: 'line one\nline two'})]);
    expect(csv).toContain('"line one\nline two"');
  });

  it('keeps non-Latin text intact', () => {
    const csv = expensesToCsv([expense({title: 'चाय', category: {name: 'खाना'}})]);
    expect(csv).toContain('चाय');
    expect(csv).toContain('खाना');
  });

  it('sorts rows by date ascending regardless of input order', () => {
    const csv = expensesToCsv([
      expense({date: '2026-07-20T09:00:00', title: 'Later'}),
      expense({date: '2026-07-01T09:00:00', title: 'Earlier'}),
    ]);
    const body = lines(csv);
    expect(body[1]).toContain('Earlier');
    expect(body[2]).toContain('Later');
  });

  it('produces just the header (and trailing newline) for no expenses', () => {
    const csv = expensesToCsv([]);
    expect(lines(csv)).toEqual(['Date,Title,Description,Category,Amount', '']);
  });

  it('never throws on missing description', () => {
    const noDescription = expense();
    delete (noDescription as {description?: string}).description;
    expect(() => expensesToCsv([noDescription])).not.toThrow();
  });
});

describe('formula injection', () => {
  const row = (title: string) => ({
    title,
    amount: 1,
    description: '',
    category: {name: 'X'},
    date: '2026-08-01',
  });

  it('neutralises fields a spreadsheet would execute as a formula', () => {
    const csv = expensesToCsv([row('=HYPERLINK("http://x","click")')]);
    // The apostrophe makes the cell literal text; spreadsheets do not show it.
    expect(csv).toContain("'=HYPERLINK");
  });

  it('covers every dangerous leading character', () => {
    for (const prefix of ['=', '+', '-', '@']) {
      const csv = expensesToCsv([row(`${prefix}danger`)]);
      expect(csv).toContain(`'${prefix}danger`);
    }
  });

  it('still quotes a neutralised field that also contains a comma', () => {
    const csv = expensesToCsv([row('=A1,B1')]);
    expect(csv).toContain('"\'=A1,B1"');
  });

  it('leaves ordinary text and amounts alone', () => {
    const csv = expensesToCsv([row('Coffee')]);
    expect(csv).toContain('Coffee');
    expect(csv).not.toContain("'Coffee");
    // Amounts are not text columns: a negative value must stay parseable.
    expect(csv).not.toContain("'1");
  });
});


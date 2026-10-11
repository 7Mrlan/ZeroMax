import {buildAiParserPrompt, normalizeAiEndpoint, parseAiResponse} from '../parser';

describe('AI parser boundary', () => {
  it('parses fenced JSON and normalizes string amounts', () => {
    expect(
      parseAiResponse(
        '```json\n{"items":[{"type":"income","title":"Salary","amount":"₹1,200","categoryName":"Salary","categoryHint":"","date":"2026-01-01","description":""}]}\n```',
      ),
    ).toEqual({
      items: [
        {
          type: 'income',
          title: 'Salary',
          amount: 1200,
          categoryName: 'Salary',
          categoryHint: '',
          date: '2026-01-01',
          description: '',
        },
      ],
    });
  });

  it('rejects extra fields and oversized item batches', () => {
    expect(() =>
      parseAiResponse(
        JSON.stringify({
          items: [
            {
              type: 'expense',
              title: 'x',
              amount: 1,
              categoryName: '',
              categoryHint: '',
              date: '2026',
              description: '',
              extra: true,
            },
          ],
        }),
      ),
    ).toThrow('schema');
    const items = Array.from({length: 51}, () => ({
      type: 'expense',
      title: 'x',
      amount: 1,
      categoryName: '',
      categoryHint: '',
      date: '2026',
      description: '',
    }));
    expect(() => parseAiResponse(JSON.stringify({items}))).toThrow('schema');
  });

  it('requires HTTPS and an allowlisted host', () => {
    expect(normalizeAiEndpoint('https://api.example.com/v1', ['api.example.com'])).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(() => normalizeAiEndpoint('http://api.example.com/v1', ['api.example.com'])).toThrow('HTTPS');
    expect(() => normalizeAiEndpoint('https://evil.example.com/v1', ['api.example.com'])).toThrow('not allowed');
  });

  it('bounds prompt input', () => {
    expect(buildAiParserPrompt('hello', {expense: ['Food'], income: ['Salary']}, '2026-01-01')).toContain('Food');
    expect(buildAiParserPrompt('x'.repeat(20000), {expense: [], income: []}, '2026-01-01').length).toBeLessThan(11000);
  });
});

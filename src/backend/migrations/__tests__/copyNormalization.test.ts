import {normalizeLegacyRows} from '../copyNormalization';
import type {CopyDataset} from '../copyVerification';

const common = {
  users: [{id: 'u1', username: 'Ada', email: '', _status: 'synced', _changed: ''}],
  currencies: [],
  debtors: [],
  debts: [],
};

describe('normalizeLegacyRows', () => {
  it('normalizes Zero v3 without changing category or transaction IDs', () => {
    const input: CopyDataset = {
      ...common,
      categories: [{id: 'c1', name: 'Food', user_id: 'u1', _status: 'synced', _changed: ''}],
      expenses: [
        {
          id: 'e1',
          title: 'Lunch',
          amount: 10,
          category_id: 'c1',
          user_id: 'u1',
          date: '2026-01-01',
          _status: 'synced',
          _changed: '',
        },
      ],
      budgets: [],
    };
    const result = normalizeLegacyRows('zero-v3', input);
    expect(result.dataset.incomes).toEqual([]);
    expect(result.dataset.categories?.[0]).toEqual(
      expect.objectContaining({id: 'c1', kind: 'expense', parent_id: null}),
    );
    expect(result.dataset.expenses?.[0]).toEqual(expect.objectContaining({id: 'e1', category_id: 'c1'}));
  });

  it('normalizes Zerox v3 by preserving income hierarchy and adding budgets/description defaults', () => {
    const input: CopyDataset = {
      ...common,
      categories: [
        {id: 'c1', name: 'Salary', user_id: 'u1', kind: 'income', parent_id: null, _status: 'synced', _changed: ''},
      ],
      expenses: [
        {
          id: 'e1',
          title: 'Coffee',
          amount: 3,
          category_id: 'c1',
          user_id: 'u1',
          date: '2026-01-01',
          _status: 'synced',
          _changed: '',
        },
      ],
      incomes: [
        {
          id: 'i1',
          title: 'Pay',
          amount: 100,
          category_id: 'c1',
          user_id: 'u1',
          date: '2026-01-01',
          _status: 'synced',
          _changed: '',
        },
      ],
    };
    const result = normalizeLegacyRows('zerox-v3', input);
    expect(result.dataset.budgets).toEqual([]);
    expect(result.dataset.expenses?.[0]).toEqual(expect.objectContaining({id: 'e1', description: null}));
    expect(result.dataset.incomes?.[0]).toEqual(expect.objectContaining({id: 'i1', category_id: 'c1'}));
  });

  it('fails closed for a Zerox category with missing kind', () => {
    expect(() =>
      normalizeLegacyRows('zerox-v3', {
        ...common,
        categories: [{id: 'c1', name: 'Unknown', user_id: 'u1', _status: 'synced', _changed: ''}],
      }),
    ).toThrow('no valid kind');
  });
});

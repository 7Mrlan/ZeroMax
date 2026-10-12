jest.mock('../../database', () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
    batch: jest.fn(),
  },
}));

import {database} from '../../database';
import {importAllData} from '../importService';

const makeCollection = (table: string, created: Array<{table: string; record: Record<string, unknown>}>) => ({
  query: jest.fn().mockReturnValue({fetch: jest.fn().mockResolvedValue([])}),
  prepareCreate: jest.fn((mutate: (record: {_raw: Record<string, unknown>}) => void) => {
    const record = {_raw: {id: `${table}-${created.length}`, kind: '', parent_id: null}} as Record<string, unknown>;
    mutate(record as unknown as {_raw: Record<string, unknown>});
    const prepared = {table, record};
    created.push(prepared);
    return prepared;
  }),
});

describe('importAllData category relationships', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps kind-aware parent links when importing v5 income and expense data', async () => {
    const created: Array<{table: string; record: Record<string, unknown>}> = [];
    const collections = new Map<string, ReturnType<typeof makeCollection>>();
    (database.get as jest.Mock).mockImplementation((table: string) => {
      if (!collections.has(table)) collections.set(table, makeCollection(table, created));
      return collections.get(table);
    });
    (database.write as jest.Mock).mockImplementation(async (work: () => Promise<void>) => work());
    (database.batch as jest.Mock).mockResolvedValue(undefined);

    await importAllData({
      users: [{username: 'Ada', email: ''}],
      categories: [
        {name: 'Salary', kind: 'income', parentName: null},
        {name: 'Bonus', kind: 'income', parentName: 'Salary'},
        {name: 'Other', kind: 'expense', parentName: null},
      ],
      expenses: [{title: 'Coffee', amount: 3, category: {name: 'Other'}, date: '2026-01-01'}],
      incomes: [
        {
          title: 'Bonus',
          amount: 100,
          category: {name: 'Bonus', kind: 'income', parentName: 'Salary'},
          date: '2026-01-01',
        },
      ],
      currencies: [],
      debtors: [],
      debts: [],
      budgets: [],
    });

    const categoryRecords = created.filter(item => item.table === 'categories').map(item => item.record);
    const salary = categoryRecords.find(record => record.name === 'Salary');
    const bonus = categoryRecords.find(record => record.name === 'Bonus');
    expect(salary).toEqual(expect.objectContaining({kind: 'income'}));
    expect(bonus).toEqual(
      expect.objectContaining({kind: 'income', parentId: salary?._raw && (salary._raw as {id: string}).id}),
    );
    expect(created.filter(item => item.table === 'incomes')[0]?.record).toEqual(
      expect.objectContaining({categoryId: bonus?._raw && (bonus._raw as {id: string}).id}),
    );
  });
});

jest.mock('../../database', () => ({
  database: {
    get: jest.fn(),
  },
}));

import {database} from '../../database';
import {buildImportPlan} from '../../../backend/import/planner';
import {getAllData} from '../getService';

describe('getAllData v5 readback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps income parent links, kind identity, amounts, and round-trip stats', async () => {
    const rows: Record<string, unknown[]> = {
      users: [{username: 'Ada', email: 'ada@example.com'}],
      categories: [
        {
          id: 'income-root',
          name: 'Salary',
          categoryStatus: true,
          userId: 'u1',
          icon: 'wallet',
          color: '#111111',
          kind: 'income',
          parentId: undefined,
        },
        {
          id: 'income-child',
          name: 'Bonus',
          categoryStatus: true,
          userId: 'u1',
          icon: 'gift',
          color: '#222222',
          kind: 'income',
          parentId: 'income-root',
        },
        {
          id: 'expense-other',
          name: 'Other',
          categoryStatus: true,
          userId: 'u1',
          icon: 'shapes',
          color: '#333333',
          kind: 'expense',
          parentId: undefined,
        },
      ],
      expenses: [
        {
          id: 'expense-1',
          title: 'Coffee',
          amount: 3,
          description: 'Morning',
          categoryId: 'expense-other',
          userId: 'u1',
          date: '2026-10-12',
        },
      ],
      incomes: [
        {
          id: 'income-1',
          title: 'Bonus',
          amount: 100,
          categoryId: 'income-child',
          userId: 'u1',
          date: '2026-10-12',
        },
      ],
      currencies: [],
      debtors: [],
      debts: [],
      budgets: [],
    };
    (database.get as jest.Mock).mockImplementation((table: string) => ({
      query: jest.fn().mockReturnValue({fetch: jest.fn().mockResolvedValue(rows[table] ?? [])}),
    }));

    const exported = await getAllData();
    expect(exported).not.toBeNull();
    expect(exported?.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'Bonus', kind: 'income', parentName: 'Salary'}),
        expect.objectContaining({name: 'Other', kind: 'expense', parentName: null}),
      ]),
    );
    expect(exported?.incomes).toEqual([
      expect.objectContaining({
        title: 'Bonus',
        amount: 100,
        category: {name: 'Bonus', kind: 'income', parentName: 'Salary'},
      }),
    ]);

    const plan = buildImportPlan(exported!);
    expect(plan.stats).toMatchObject({categories: 3, expenses: 1, incomes: 1});
    expect(plan.incomes[0]).toMatchObject({title: 'Bonus', amount: 100, categoryParentName: 'Salary'});
    expect(plan.expenses[0]).toMatchObject({title: 'Coffee', amount: 3, categoryName: 'Other'});
  });
});

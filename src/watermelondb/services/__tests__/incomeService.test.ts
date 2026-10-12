jest.mock('../../database', () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
  },
}));

import {database} from '../../database';
import {getAllIncomesByMonth, updateIncomeById} from '../incomeService';

describe('incomeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates the income fields through one Watermelon writer', async () => {
    const updated: Record<string, unknown> = {};
    const record = {update: jest.fn(async (mutate: (value: Record<string, unknown>) => void) => mutate(updated))};
    (database.get as jest.Mock).mockReturnValue({find: jest.fn().mockResolvedValue(record)});
    (database.write as jest.Mock).mockImplementation(async (work: (writer: unknown) => Promise<void>) => work({}));

    await updateIncomeById('income-1', 'income-category-2', 'Salary', 3200, '2026-10-12');

    expect(database.write).toHaveBeenCalledTimes(1);
    expect(record.update).toHaveBeenCalledTimes(1);
    expect(updated).toEqual({categoryId: 'income-category-2', title: 'Salary', amount: 3200, date: '2026-10-12'});
  });

  it('keeps parent labels for income rows even when the parent is soft-deleted', async () => {
    const income = {
      id: 'income-1',
      title: 'Bonus',
      amount: 100,
      categoryId: 'income-child',
      userId: 'u1',
      date: '2026-10-12',
    };
    const categories = [
      {id: 'income-root', name: 'Salary', parentId: undefined, icon: 'wallet', color: '#111', categoryStatus: false},
      {id: 'income-child', name: 'Bonus', parentId: 'income-root', icon: 'gift', color: '#222', categoryStatus: true},
    ];
    (database.get as jest.Mock).mockImplementation((table: string) => ({
      query: jest
        .fn()
        .mockReturnValue({fetch: jest.fn().mockResolvedValue(table === 'incomes' ? [income] : categories)}),
    }));

    await expect(getAllIncomesByMonth('u1', '2026-10')).resolves.toEqual([
      expect.objectContaining({
        id: 'income-1',
        category: expect.objectContaining({name: 'Bonus', parentName: 'Salary'}),
      }),
    ]);
  });
});

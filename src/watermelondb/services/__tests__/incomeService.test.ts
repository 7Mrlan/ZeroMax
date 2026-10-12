jest.mock('../../database', () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
  },
}));

import {database} from '../../database';
import {updateIncomeById} from '../incomeService';

describe('incomeService', () => {
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
});

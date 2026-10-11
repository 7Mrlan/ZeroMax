import {createTransactionRepository} from '../transactionRepository';
import {transactionRecordKey} from '../transactionRecord';

const expense = {
  id: 'e1',
  title: 'Lunch',
  amount: 10,
  description: '',
  categoryId: 'c1',
  userId: 'u1',
  date: '2026-01-01',
};
const income = {
  id: 'i1',
  title: 'Salary',
  amount: 100,
  categoryId: 'c2',
  userId: 'u1',
  date: '2026-01-02',
  transactionType: 'income' as const,
};

describe('transaction repository', () => {
  it('combines both tables with stable kind-prefixed keys and newest-first order', async () => {
    const repository = createTransactionRepository({
      getExpenses: async () => [expense],
      getIncomes: async () => [income],
    });
    const records = await repository.getByMonth('u1', '2026-01');
    expect(records.map(record => transactionRecordKey(record))).toEqual(['income:i1', 'expense:e1']);
    expect(records[0].description).toBe('');
  });

  it('propagates a source read failure instead of returning partial data', async () => {
    const repository = createTransactionRepository({
      getExpenses: async () => [expense],
      getIncomes: async () => {
        throw new Error('income table unavailable');
      },
    });
    await expect(repository.getByMonth('u1', '2026-01')).rejects.toThrow('income table unavailable');
  });
});

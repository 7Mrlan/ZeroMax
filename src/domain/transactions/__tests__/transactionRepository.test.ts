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

  it('queries only the requested kind for category detail', async () => {
    const getExpensesByCategory = jest.fn(async () => [expense]);
    const getIncomesByCategory = jest.fn(async () => [income]);
    const repository = createTransactionRepository({getExpensesByCategory, getIncomesByCategory});

    const incomeRecords = await repository.getByCategory('u1', 'c2', '2026-01', 'income', ['c2', 'c3']);
    expect(incomeRecords.map(record => transactionRecordKey(record))).toEqual(['income:i1']);
    expect(getIncomesByCategory).toHaveBeenCalledWith('u1', ['c2', 'c3'], '2026-01');
    expect(getExpensesByCategory).not.toHaveBeenCalled();

    const expenseRecords = await repository.getByCategory('u1', 'c1', '2026-01', 'expense');
    expect(expenseRecords.map(record => transactionRecordKey(record))).toEqual(['expense:e1']);
    expect(getExpensesByCategory).toHaveBeenCalledWith('u1', ['c1'], '2026-01');
  });
});

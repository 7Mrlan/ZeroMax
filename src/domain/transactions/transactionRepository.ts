import {
  getAllExpensesByCategoriesAndMonth,
  getAllExpensesByMonth,
  type ExpenseWithCategory,
} from '../../watermelondb/services/expenseService';
import {
  getAllIncomesByCategoriesAndMonth,
  getAllIncomesByMonth,
  type IncomeWithCategory,
} from '../../watermelondb/services/incomeService';
import {fromExpenseRecord, fromIncomeRecord, sortTransactionRecords, type TransactionRecord} from './transactionRecord';
import {measurePerformance} from '../../utils/performanceTrace';

export interface TransactionRepository {
  getByMonth: (userId: string, yearMonth: string) => Promise<TransactionRecord[]>;
  getByCategory: (
    userId: string,
    categoryId: string,
    yearMonth: string,
    kind: 'expense' | 'income',
    categoryIds?: readonly string[],
  ) => Promise<TransactionRecord[]>;
}

export interface TransactionRepositoryDependencies {
  getExpenses?: (userId: string, yearMonth: string) => Promise<ExpenseWithCategory[]>;
  getIncomes?: (userId: string, yearMonth: string) => Promise<IncomeWithCategory[]>;
  getExpensesByCategory?: (
    userId: string,
    categoryIds: readonly string[],
    yearMonth: string,
  ) => Promise<ExpenseWithCategory[]>;
  getIncomesByCategory?: (
    userId: string,
    categoryIds: readonly string[],
    yearMonth: string,
  ) => Promise<IncomeWithCategory[]>;
}

export const createTransactionRepository = ({
  getExpenses = getAllExpensesByMonth,
  getIncomes = getAllIncomesByMonth,
  getExpensesByCategory = getAllExpensesByCategoriesAndMonth,
  getIncomesByCategory = getAllIncomesByCategoriesAndMonth,
}: TransactionRepositoryDependencies = {}): TransactionRepository => ({
  getByMonth: async (userId, yearMonth) => {
    return measurePerformance('query.transactions.month', async () => {
      const [expenses, incomes] = await Promise.all([getExpenses(userId, yearMonth), getIncomes(userId, yearMonth)]);
      return sortTransactionRecords([...expenses.map(fromExpenseRecord), ...incomes.map(fromIncomeRecord)]);
    });
  },
  getByCategory: async (userId, categoryId, yearMonth, kind, categoryIds = [categoryId]) => {
    return measurePerformance(`query.transactions.category.${kind}`, async () => {
      if (kind === 'income') {
        const incomes = await getIncomesByCategory(userId, categoryIds, yearMonth);
        return sortTransactionRecords(incomes.map(fromIncomeRecord));
      }
      const expenses = await getExpensesByCategory(userId, categoryIds, yearMonth);
      return sortTransactionRecords(expenses.map(fromExpenseRecord));
    });
  },
});

export const transactionRepository = createTransactionRepository();

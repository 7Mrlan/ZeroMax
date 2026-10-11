import {getAllExpensesByMonth, type ExpenseWithCategory} from '../../watermelondb/services/expenseService';
import {getAllIncomesByMonth, type IncomeWithCategory} from '../../watermelondb/services/incomeService';
import {fromExpenseRecord, fromIncomeRecord, sortTransactionRecords, type TransactionRecord} from './transactionRecord';

export interface TransactionRepository {
  getByMonth: (userId: string, yearMonth: string) => Promise<TransactionRecord[]>;
}

export interface TransactionRepositoryDependencies {
  getExpenses?: (userId: string, yearMonth: string) => Promise<ExpenseWithCategory[]>;
  getIncomes?: (userId: string, yearMonth: string) => Promise<IncomeWithCategory[]>;
}

export const createTransactionRepository = ({
  getExpenses = getAllExpensesByMonth,
  getIncomes = getAllIncomesByMonth,
}: TransactionRepositoryDependencies = {}): TransactionRepository => ({
  getByMonth: async (userId, yearMonth) => {
    const [expenses, incomes] = await Promise.all([getExpenses(userId, yearMonth), getIncomes(userId, yearMonth)]);
    return sortTransactionRecords([...expenses.map(fromExpenseRecord), ...incomes.map(fromIncomeRecord)]);
  },
});

export const transactionRepository = createTransactionRepository();

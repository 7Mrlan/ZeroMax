import type {ExpenseWithCategory} from '../../watermelondb/services/expenseService';
import type {IncomeWithCategory} from '../../watermelondb/services/incomeService';

export type TransactionKind = 'expense' | 'income';

export interface TransactionRecord {
  id: string;
  kind: TransactionKind;
  title: string;
  amount: number;
  description: string;
  categoryId: string;
  userId: string;
  date: string;
  category?: {id: string; name: string; icon?: string; color: string};
}

export const transactionRecordKey = (record: Pick<TransactionRecord, 'kind' | 'id'>): string =>
  `${record.kind}:${record.id}`;

export const fromExpenseRecord = (expense: ExpenseWithCategory): TransactionRecord => ({
  id: expense.id,
  kind: 'expense',
  title: expense.title,
  amount: expense.amount,
  description: expense.description ?? '',
  categoryId: expense.categoryId,
  userId: expense.userId,
  date: expense.date,
  category: expense.category,
});

export const fromIncomeRecord = (income: IncomeWithCategory): TransactionRecord => ({
  id: income.id,
  kind: 'income',
  title: income.title,
  amount: income.amount,
  description: '',
  categoryId: income.categoryId,
  userId: income.userId,
  date: income.date,
  category: income.category,
});

/** Stable newest-first ordering; id breaks ties so virtualization keys stay deterministic. */
export const sortTransactionRecords = (records: readonly TransactionRecord[]): TransactionRecord[] =>
  [...records].sort((left, right) => {
    const dateOrder = right.date < left.date ? -1 : right.date > left.date ? 1 : 0;
    if (dateOrder) return dateOrder;
    const leftKey = transactionRecordKey(left);
    const rightKey = transactionRecordKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

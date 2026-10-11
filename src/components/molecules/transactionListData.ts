import {formatDate} from '../../utils/dateUtils';

export type TransactionKind = 'expense' | 'income';

export interface TransactionListCategory {
  id?: string;
  name?: string;
  icon?: string;
  color?: string;
  parentId?: string;
  parentName?: string;
  parentIcon?: string;
  parentColor?: string;
}

/**
 * The list deliberately accepts the common fields shared by the expense and
 * income services instead of importing either service's row type. This keeps
 * the virtualized list usable while the two-table repository remains the
 * source of truth.
 */
export interface TransactionListTransaction {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  userId: string;
  date: string;
  description?: string;
  category?: TransactionListCategory;
  /** Zerox uses transactionType; the repository uses kind. Accept both. */
  transactionType?: TransactionKind;
  kind?: TransactionKind;
}

export type TransactionListItem<T extends TransactionListTransaction> =
  | {itemType: 'header'; id: string; date: string; total: number}
  | {itemType: 'transaction'; id: string; transaction: T}
  | {itemType: 'pendingDelete'; id: string; transaction: T};

export const getTransactionKind = (
  transaction: Pick<TransactionListTransaction, 'kind' | 'transactionType'>,
): TransactionKind => transaction.kind ?? transaction.transactionType ?? 'expense';

export const transactionListKey = (
  transaction: Pick<TransactionListTransaction, 'id' | 'kind' | 'transactionType'>,
): string => `${getTransactionKind(transaction)}:${String(transaction.id)}`;

const compareTransactions = <T extends TransactionListTransaction>(left: T, right: T): number => {
  // ISO timestamps sort lexicographically and avoid constructing a Date for
  // every row. The composite key makes equal timestamps deterministic.
  if (right.date !== left.date) {
    return right.date < left.date ? -1 : 1;
  }
  const leftKey = transactionListKey(left);
  const rightKey = transactionListKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

/**
 * Creates the one-dimensional data source consumed by FlashList.
 *
 * Pending rows replace their source row by key. A pending row that is no
 * longer present in Redux is still rendered from the pending map, which keeps
 * the three-second undo affordance visible while a refresh is in flight.
 */
export const flattenTransactionList = <T extends TransactionListTransaction>(
  transactions: readonly T[] | null | undefined,
  pendingDeletes: ReadonlyMap<string, T> = new Map(),
): TransactionListItem<T>[] => {
  const byKey = new Map<string, T>();
  for (const transaction of transactions ?? []) {
    byKey.set(transactionListKey(transaction), transaction);
  }
  for (const [key, transaction] of pendingDeletes) {
    byKey.set(key, transaction);
  }

  const byDate = new Map<string, T[]>();
  for (const transaction of byKey.values()) {
    const date = formatDate(transaction.date, 'YYYY-MM-DD');
    const group = byDate.get(date);
    if (group) {
      group.push(transaction);
    } else {
      byDate.set(date, [transaction]);
    }
  }

  const dates = Array.from(byDate.keys()).sort((left, right) => (right < left ? -1 : right > left ? 1 : 0));
  const result: TransactionListItem<T>[] = [];
  for (const date of dates) {
    const rows = byDate.get(date) ?? [];
    rows.sort(compareTransactions);
    const total = rows.reduce(
      (sum, transaction) => (pendingDeletes.has(transactionListKey(transaction)) ? sum : sum + transaction.amount),
      0,
    );
    result.push({itemType: 'header', id: `header:${date}`, date, total});
    for (const transaction of rows) {
      const id = transactionListKey(transaction);
      result.push({
        itemType: pendingDeletes.has(id) ? 'pendingDelete' : 'transaction',
        id,
        transaction,
      });
    }
  }
  return result;
};

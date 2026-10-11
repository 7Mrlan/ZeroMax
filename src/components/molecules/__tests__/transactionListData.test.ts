import {
  flattenTransactionList,
  getTransactionKind,
  transactionListKey,
  type TransactionListTransaction,
} from '../transactionListData';

const transaction = (overrides: Partial<TransactionListTransaction> = {}): TransactionListTransaction => ({
  id: 'expense-1',
  title: 'Coffee',
  amount: 4,
  categoryId: 'food',
  userId: 'user-1',
  date: '2026-10-12T09:00:00.000Z',
  ...overrides,
});

describe('transaction list data', () => {
  it('returns no rows for an empty source', () => {
    expect(flattenTransactionList([])).toEqual([]);
  });

  it('emits one header and one row per transaction in newest-first order', () => {
    const rows = flattenTransactionList([
      transaction({id: 'old', date: '2026-10-10T08:00:00.000Z'}),
      transaction({id: 'new', date: '2026-10-12T08:00:00.000Z'}),
      transaction({id: 'same-later', date: '2026-10-12T09:00:00.000Z'}),
    ]);

    expect(rows.map(row => row.id)).toEqual([
      'header:2026-10-12',
      'expense:same-later',
      'expense:new',
      'header:2026-10-10',
      'expense:old',
    ]);
    expect(rows.filter(row => row.itemType === 'header')).toHaveLength(2);
  });

  it('uses kind in keys so equal IDs across the two tables never collide', () => {
    const expense = transaction({id: 'same-id'});
    const income = transaction({id: 'same-id', kind: 'income', transactionType: 'income', title: 'Salary'});
    const rows = flattenTransactionList([expense, income]);

    expect(transactionListKey(expense)).toBe('expense:same-id');
    expect(transactionListKey(income)).toBe('income:same-id');
    expect(rows.filter(row => row.itemType !== 'header').map(row => row.id)).toEqual([
      'expense:same-id',
      'income:same-id',
    ]);
  });

  it('replaces a source row with pending delete and retains it after refresh removes it', () => {
    const pending = transaction({id: 'pending'});
    const key = transactionListKey(pending);
    const pendingDeletes = new Map([[key, pending]]);

    const replaced = flattenTransactionList([pending], pendingDeletes);
    expect(replaced).toEqual([
      {itemType: 'header', id: 'header:2026-10-12', date: '2026-10-12', total: 0},
      {itemType: 'pendingDelete', id: key, transaction: pending},
    ]);
    expect(flattenTransactionList([], pendingDeletes)).toEqual(replaced);
  });

  it('does not mutate source order or infer income from a category name', () => {
    const source = [
      transaction({id: 'b', date: '2026-10-12T10:00:00.000Z'}),
      transaction({id: 'a', date: '2026-10-12T11:00:00.000Z'}),
    ];
    const originalIds = source.map(item => item.id);
    flattenTransactionList(source);

    expect(source.map(item => item.id)).toEqual(originalIds);
    expect(getTransactionKind(transaction({category: {name: 'income'}}))).toBe('expense');
  });
});

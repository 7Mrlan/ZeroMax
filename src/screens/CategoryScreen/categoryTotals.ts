import type {TransactionRecord} from '../../domain/transactions';
import type {CategoryData} from '../../watermelondb/services';

/**
 * Returns current-period totals for each category, including descendant rows
 * in every ancestor. Propagating each direct amount once keeps a two-level or
 * deeper tree correct and the visited set prevents malformed imported cycles
 * from looping or double-counting.
 */
export const buildCategoryTotals = (
  categories: readonly Pick<CategoryData, 'id' | 'parentId'>[],
  transactions: readonly Pick<TransactionRecord, 'categoryId' | 'amount'>[],
): Map<string, number> => {
  const parentById = new Map(categories.map(category => [category.id, category.parentId || null]));
  const directTotals = new Map<string, number>();

  for (const transaction of transactions) {
    if (!Number.isFinite(transaction.amount)) continue;
    directTotals.set(transaction.categoryId, (directTotals.get(transaction.categoryId) ?? 0) + transaction.amount);
  }

  const totals = new Map(directTotals);
  for (const [categoryId, amount] of directTotals) {
    const visited = new Set([categoryId]);
    let parentId = parentById.get(categoryId) ?? null;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      totals.set(parentId, (totals.get(parentId) ?? 0) + amount);
      parentId = parentById.get(parentId) ?? null;
    }
  }

  return totals;
};

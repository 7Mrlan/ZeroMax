/**
 * Describes the SQLite shape observed before the unified schema is opened.
 * This is intentionally pure so a migration can inspect a legacy database and
 * choose a safe copy plan before WatermelonDB is pointed at the target schema.
 */
export interface LegacySchemaSnapshot {
  version: number;
  tables: Record<string, string[]>;
}

export type LegacyDatabaseSource = 'zero-v3' | 'zerox-v3' | 'target-v4' | 'unknown';

export type LegacyMigrationAction =
  'create-incomes' | 'create-budgets' | 'add-category-kind-parent' | 'add-expense-description';

export interface LegacyMigrationPlan {
  source: LegacyDatabaseSource;
  actions: LegacyMigrationAction[];
  requiresBackup: true;
}

const hasTable = (snapshot: LegacySchemaSnapshot, table: string): boolean => table in snapshot.tables;

const hasColumn = (snapshot: LegacySchemaSnapshot, table: string, column: string): boolean =>
  snapshot.tables[table]?.includes(column) ?? false;

/**
 * Detects only shapes that have an explicit, tested migration path. Similar or
 * future schemas fail closed so startup can preserve the old database rather
 * than guessing and silently dropping columns.
 */
export const detectLegacyDatabaseSource = (snapshot: LegacySchemaSnapshot): LegacyDatabaseSource => {
  const hasIncomeCategories =
    hasColumn(snapshot, 'categories', 'parent_id') && hasColumn(snapshot, 'categories', 'kind');
  const hasIncomeTable = hasTable(snapshot, 'incomes');
  const hasBudgetTable = hasTable(snapshot, 'budgets');
  const hasExpenseDescription = hasColumn(snapshot, 'expenses', 'description');

  if (snapshot.version === 3 && hasBudgetTable && !hasIncomeTable && !hasIncomeCategories && hasExpenseDescription) {
    return 'zero-v3';
  }

  if (snapshot.version === 3 && hasIncomeTable && !hasBudgetTable && hasIncomeCategories && !hasExpenseDescription) {
    return 'zerox-v3';
  }

  if (snapshot.version >= 4 && hasIncomeTable && hasBudgetTable && hasIncomeCategories && hasExpenseDescription) {
    return 'target-v4';
  }

  return 'unknown';
};

export const planLegacyMigration = (snapshot: LegacySchemaSnapshot): LegacyMigrationPlan => {
  const source = detectLegacyDatabaseSource(snapshot);
  const actions: LegacyMigrationAction[] = [];

  if (source === 'zero-v3') {
    actions.push('create-incomes', 'add-category-kind-parent');
  } else if (source === 'zerox-v3') {
    actions.push('create-budgets', 'add-expense-description');
  }

  return {source, actions, requiresBackup: true};
};

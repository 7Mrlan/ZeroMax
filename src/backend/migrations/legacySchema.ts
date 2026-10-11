/**
 * Describes the SQLite shape observed before the unified schema is opened.
 * This is intentionally pure so a migration can inspect a legacy database and
 * choose a safe copy plan before WatermelonDB is pointed at the target schema.
 */
export interface LegacySchemaSnapshot {
  version: number;
  tables: Record<string, string[]>;
  /** Index names/columns are supplied by the native probe for exact v4 checks. */
  indexes?: Record<string, string[]>;
  /** Native probes must report every non-Watermelon user table. */
  unknownTables?: string[];
  /** Native probes must report columns outside the known union schema. */
  unknownColumns?: Record<string, string[]>;
}

export type LegacyDatabaseSource = 'zero-v3' | 'zerox-v3' | 'target-v4' | 'unknown';

export type LegacyMigrationAction =
  'create-incomes' | 'create-budgets' | 'add-category-kind-parent' | 'add-expense-description';

export interface LegacyMigrationPlan {
  source: LegacyDatabaseSource;
  actions: LegacyMigrationAction[];
  requiresBackup: true;
}

const hasTable = (snapshot: LegacySchemaSnapshot, table: string): boolean => Array.isArray(snapshot.tables[table]);

const hasColumn = (snapshot: LegacySchemaSnapshot, table: string, column: string): boolean =>
  snapshot.tables[table]?.includes(column) ?? false;

const hasCoreTables = (snapshot: LegacySchemaSnapshot): boolean =>
  ['users', 'categories', 'expenses', 'currencies', 'debtors', 'debts'].every(table => hasTable(snapshot, table));

const COMMON_INDEXES: Record<string, string[]> = {
  users: ['sqlite_autoindex_users_1', 'users__status'],
  expenses: [
    'sqlite_autoindex_expenses_1',
    'expenses__status',
    'expenses_category_id',
    'expenses_date',
    'expenses_user_id',
  ],
  currencies: ['sqlite_autoindex_currencies_1', 'currencies__status', 'currencies_user_id'],
  debtors: ['sqlite_autoindex_debtors_1', 'debtors__status', 'debtors_debtor_status', 'debtors_user_id'],
  debts: ['sqlite_autoindex_debts_1', 'debts__status', 'debts_date', 'debts_debtor_id', 'debts_user_id'],
};

const expectedIndexes = (source: Exclude<LegacyDatabaseSource, 'unknown'>): Record<string, string[]> => {
  const indexes = {...COMMON_INDEXES};
  indexes.categories = [
    'sqlite_autoindex_categories_1',
    'categories__status',
    'categories_category_status',
    'categories_user_id',
    ...(source === 'zerox-v3' || source === 'target-v4' ? ['categories_kind', 'categories_parent_id'] : []),
  ];
  if (source === 'zero-v3' || source === 'target-v4') {
    indexes.budgets = [
      'sqlite_autoindex_budgets_1',
      'budgets__status',
      'budgets_category_id',
      'budgets_month',
      'budgets_user_id',
    ];
  }
  if (source === 'zerox-v3' || source === 'target-v4') {
    indexes.incomes = [
      'sqlite_autoindex_incomes_1',
      'incomes__status',
      'incomes_category_id',
      'incomes_date',
      'incomes_user_id',
    ];
  }
  return indexes;
};

const indexesMatch = (snapshot: LegacySchemaSnapshot, source: Exclude<LegacyDatabaseSource, 'unknown'>): boolean => {
  if (!snapshot.indexes || Object.keys(snapshot.indexes).length === 0) return true;
  const expected = expectedIndexes(source);
  const actualTables = Object.keys(snapshot.indexes).sort();
  const expectedTables = Object.keys(expected).sort();
  if (actualTables.join('|') !== expectedTables.join('|')) return false;
  return expectedTables.every(
    table => [...(snapshot.indexes?.[table] ?? [])].sort().join('|') === [...expected[table]].sort().join('|'),
  );
};

/**
 * Detects only shapes that have an explicit, tested migration path. Similar or
 * future schemas fail closed so startup can preserve the old database rather
 * than guessing and silently dropping columns.
 */
export const detectLegacyDatabaseSource = (snapshot: LegacySchemaSnapshot): LegacyDatabaseSource => {
  if (
    !Number.isInteger(snapshot.version) ||
    !hasCoreTables(snapshot) ||
    (snapshot.unknownTables?.length ?? 0) > 0 ||
    Object.values(snapshot.unknownColumns ?? {}).some(columns => columns.length > 0)
  ) {
    return 'unknown';
  }

  const hasIncomeCategories =
    hasColumn(snapshot, 'categories', 'parent_id') && hasColumn(snapshot, 'categories', 'kind');
  const hasIncomeTable = hasTable(snapshot, 'incomes');
  const hasBudgetTable = hasTable(snapshot, 'budgets');
  const hasExpenseDescription = hasColumn(snapshot, 'expenses', 'description');

  if (snapshot.version === 3 && hasBudgetTable && !hasIncomeTable && !hasIncomeCategories && hasExpenseDescription) {
    return indexesMatch(snapshot, 'zero-v3') ? 'zero-v3' : 'unknown';
  }

  if (snapshot.version === 3 && hasIncomeTable && !hasBudgetTable && hasIncomeCategories && !hasExpenseDescription) {
    return indexesMatch(snapshot, 'zerox-v3') ? 'zerox-v3' : 'unknown';
  }

  if (snapshot.version === 4 && hasIncomeTable && hasBudgetTable && hasIncomeCategories && hasExpenseDescription) {
    return indexesMatch(snapshot, 'target-v4') ? 'target-v4' : 'unknown';
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

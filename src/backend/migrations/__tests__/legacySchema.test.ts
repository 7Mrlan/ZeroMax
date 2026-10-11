import {detectLegacyDatabaseSource, planLegacyMigration, type LegacySchemaSnapshot} from '../legacySchema';

const zeroV3: LegacySchemaSnapshot = {
  version: 3,
  tables: {
    users: ['username', 'email'],
    categories: ['name', 'category_status', 'user_id', 'icon', 'color'],
    expenses: ['title', 'amount', 'description', 'category_id', 'user_id', 'date'],
    currencies: ['code', 'symbol', 'name', 'user_id'],
    debtors: ['title', 'type', 'debtor_status', 'user_id', 'icon', 'color'],
    debts: ['description', 'amount', 'debtor_id', 'user_id', 'date', 'type'],
    budgets: ['user_id', 'category_id', 'amount', 'month', 'budget_type'],
  },
};

const zeroxV3: LegacySchemaSnapshot = {
  version: 3,
  tables: {
    users: ['username', 'email'],
    categories: ['name', 'category_status', 'user_id', 'icon', 'color', 'parent_id', 'kind'],
    expenses: ['title', 'amount', 'category_id', 'user_id', 'date'],
    incomes: ['title', 'amount', 'category_id', 'user_id', 'date'],
    currencies: ['code', 'symbol', 'name', 'user_id'],
    debtors: ['title', 'type', 'debtor_status', 'user_id', 'icon', 'color'],
    debts: ['description', 'amount', 'debtor_id', 'user_id', 'date', 'type'],
  },
};

const targetV4: LegacySchemaSnapshot = {
  version: 4,
  tables: {
    ...zeroxV3.tables,
    expenses: [...zeroxV3.tables.expenses, 'description'],
    budgets: ['user_id', 'category_id', 'amount', 'month', 'budget_type'],
  },
};

describe('legacy database source detection', () => {
  it('plans Zero v3 to add income support and category metadata', () => {
    expect(detectLegacyDatabaseSource(zeroV3)).toBe('zero-v3');
    expect(planLegacyMigration(zeroV3)).toEqual({
      source: 'zero-v3',
      actions: ['create-incomes', 'add-category-kind-parent'],
      requiresBackup: true,
    });
  });

  it('plans Zerox v3 to add budgets and preserve an optional description', () => {
    expect(detectLegacyDatabaseSource(zeroxV3)).toBe('zerox-v3');
    expect(planLegacyMigration(zeroxV3)).toEqual({
      source: 'zerox-v3',
      actions: ['create-budgets', 'add-expense-description'],
      requiresBackup: true,
    });
  });

  it('recognizes a complete target shape', () => {
    expect(detectLegacyDatabaseSource(targetV4)).toBe('target-v4');
    expect(planLegacyMigration(targetV4)).toEqual({source: 'target-v4', actions: [], requiresBackup: true});
  });

  it('fails closed for ambiguous or incomplete schemas', () => {
    const ambiguous = {...zeroV3, tables: {...zeroV3.tables, incomes: zeroxV3.tables.incomes}};
    expect(detectLegacyDatabaseSource(ambiguous)).toBe('unknown');
    expect(planLegacyMigration(ambiguous).actions).toEqual([]);

    const tablesWithoutExpenses = {...zeroV3.tables};
    delete tablesWithoutExpenses.expenses;
    expect(detectLegacyDatabaseSource({...zeroV3, tables: tablesWithoutExpenses})).toBe('unknown');

    expect(detectLegacyDatabaseSource({...zeroV3, version: 2})).toBe('unknown');
    expect(detectLegacyDatabaseSource({...targetV4, tables: {...targetV4.tables, expenses: ['title']}})).toBe(
      'unknown',
    );
  });
});

import {decideDatabasePreflight, type DatabaseProbeResult} from '../preflight';
import type {LegacySchemaSnapshot} from '../legacySchema';

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

const targetV4: LegacySchemaSnapshot = {
  version: 4,
  tables: {
    users: ['username', 'email'],
    categories: ['name', 'category_status', 'user_id', 'icon', 'color', 'parent_id', 'kind'],
    expenses: ['title', 'amount', 'description', 'category_id', 'user_id', 'date'],
    incomes: ['title', 'amount', 'category_id', 'user_id', 'date'],
    currencies: ['code', 'symbol', 'name', 'user_id'],
    debtors: ['title', 'type', 'debtor_status', 'user_id', 'icon', 'color'],
    debts: ['description', 'amount', 'debtor_id', 'user_id', 'date', 'type'],
    budgets: ['user_id', 'category_id', 'amount', 'month', 'budget_type'],
  },
};

const metadata = (snapshot: LegacySchemaSnapshot, integrity: 'ok' | 'failed' = 'ok'): DatabaseProbeResult => ({
  kind: 'metadata',
  snapshot,
  integrity,
});

describe('decideDatabasePreflight', () => {
  it('allows a genuinely missing legacy file to initialize as fresh', () => {
    expect(decideDatabasePreflight('watermelon', {kind: 'missing'})).toEqual({
      kind: 'fresh',
      databaseName: 'watermelon',
    });
  });

  it('copies known Zero and Zerox v3 files before opening a target adapter', () => {
    expect(decideDatabasePreflight('watermelon', metadata(zeroV3))).toEqual({kind: 'copy-legacy', source: 'zero-v3'});

    const zeroxTables = {...zeroV3.tables};
    delete zeroxTables.budgets;
    const zeroxV3 = {
      ...zeroV3,
      tables: {
        ...zeroxTables,
        categories: [...zeroV3.tables.categories, 'parent_id', 'kind'],
        expenses: zeroV3.tables.expenses.filter(column => column !== 'description'),
        incomes: ['title', 'amount', 'category_id', 'user_id', 'date'],
      },
    };
    expect(decideDatabasePreflight('watermelon', metadata(zeroxV3))).toEqual({kind: 'copy-legacy', source: 'zerox-v3'});
  });

  it('opens only an exact target schema behind the target pointer', () => {
    expect(decideDatabasePreflight('watermelon_v4', metadata(targetV4))).toEqual({
      kind: 'open-target',
      databaseName: 'watermelon_v4',
    });
  });

  it('blocks unknown, future, corrupt, and pointer-mismatched files', () => {
    expect(decideDatabasePreflight('watermelon', metadata({...targetV4, version: 5})).kind).toBe('blocked');
    expect(decideDatabasePreflight('watermelon', metadata(targetV4)).kind).toBe('blocked');
    expect(decideDatabasePreflight('watermelon_v4', metadata(zeroV3)).kind).toBe('blocked');
    expect(decideDatabasePreflight('watermelon_v4', metadata(targetV4, 'failed')).kind).toBe('blocked');
    expect(decideDatabasePreflight('watermelon', {kind: 'error', error: new Error('locked')}).kind).toBe('blocked');
    expect(decideDatabasePreflight('watermelon_v4', {kind: 'missing'}).kind).toBe('blocked');
  });

  it('does not classify an existing empty file as fresh', () => {
    expect(decideDatabasePreflight('watermelon', metadata({version: 0, tables: {}}))).toEqual({
      kind: 'blocked',
      reason: 'The active database schema is unknown or unsupported',
    });
  });
});

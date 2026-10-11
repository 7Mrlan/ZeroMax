import {runDatabasePreflight} from '../runPreflight';

describe('runDatabasePreflight', () => {
  it('routes a missing legacy file to the fresh v4 target', async () => {
    const probe = jest.fn(async () => ({kind: 'missing'}) as const);
    await expect(runDatabasePreflight('watermelon', probe)).resolves.toEqual({
      kind: 'fresh-target',
      databaseName: 'watermelon_v4',
    });
    expect(probe).toHaveBeenNthCalledWith(1, 'watermelon');
    expect(probe).toHaveBeenNthCalledWith(2, 'watermelon_v4');
  });

  it('blocks an inactive target left behind by an interrupted attempt', async () => {
    await expect(
      runDatabasePreflight('watermelon', async databaseName =>
        databaseName === 'watermelon'
          ? {kind: 'missing'}
          : {
              kind: 'metadata',
              integrity: 'ok',
              snapshot: {version: 4, tables: {}, indexes: {}},
            },
      ),
    ).resolves.toEqual({
      kind: 'blocked',
      reason: 'An inactive target database exists and requires durable migration recovery',
    });
  });

  it('resumes an empty exact-v4 target left by a fresh-install crash', async () => {
    const targetSnapshot = {
      users: [],
      categories: [],
      expenses: [],
      incomes: [],
      currencies: [],
      debtors: [],
      debts: [],
      budgets: [],
    };
    await expect(
      runDatabasePreflight(
        'watermelon',
        async databaseName =>
          databaseName === 'watermelon'
            ? {kind: 'missing'}
            : {
                kind: 'metadata',
                integrity: 'ok',
                snapshot: {
                  version: 4,
                  tables: {
                    users: ['username'],
                    categories: ['name', 'category_status', 'user_id', 'icon', 'color', 'parent_id', 'kind'],
                    expenses: ['title', 'amount', 'description', 'category_id', 'user_id', 'date'],
                    incomes: ['title', 'amount', 'category_id', 'user_id', 'date'],
                    currencies: ['code', 'symbol', 'name', 'user_id'],
                    debtors: ['title', 'type', 'debtor_status', 'user_id', 'icon', 'color'],
                    debts: ['description', 'amount', 'debtor_id', 'user_id', 'date', 'type'],
                    budgets: ['user_id', 'category_id', 'amount', 'month', 'budget_type'],
                  },
                },
              },
        async () => targetSnapshot,
      ),
    ).resolves.toEqual({kind: 'fresh-target', databaseName: 'watermelon_v4'});
  });

  it('routes known legacy metadata to copy without constructing an adapter', async () => {
    await expect(
      runDatabasePreflight('watermelon', async () => ({
        kind: 'metadata',
        integrity: 'ok',
        snapshot: {
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
        },
      })),
    ).resolves.toEqual({kind: 'copy-legacy', source: 'zero-v3'});
  });

  it('blocks an unavailable or invalid native probe', async () => {
    await expect(
      runDatabasePreflight('watermelon', async () => ({kind: 'error', error: new Error('bridge unavailable')})),
    ).resolves.toEqual({
      kind: 'blocked',
      reason: 'The active database could not be inspected',
      error: new Error('bridge unavailable'),
    });
  });
});

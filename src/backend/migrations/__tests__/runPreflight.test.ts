import {runDatabasePreflight} from '../runPreflight';
import {clearFreshTargetOwnership, persistFreshTargetOwnership} from '../activeDatabase';
import {FRESH_TARGET_FINGERPRINT, FRESH_TARGET_SOURCE_FINGERPRINT} from '../activeDatabase';

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

  it('blocks an empty exact-v4 target without owned recovery evidence', async () => {
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
        async () => ({}),
      ),
    ).resolves.toEqual({
      kind: 'blocked',
      reason: 'An inactive target database exists and requires durable migration recovery',
    });
  });

  it('recovers an owned empty target left between fresh init and activation', async () => {
    const ownership = {
      attemptId: 'fresh-1-test',
      generation: 1,
      sourceFingerprint: FRESH_TARGET_SOURCE_FINGERPRINT,
      targetFingerprint: FRESH_TARGET_FINGERPRINT,
    } as const;
    persistFreshTargetOwnership(ownership);
    const probe = jest.fn(async databaseName =>
      databaseName === 'watermelon'
        ? ({kind: 'missing'} as never)
        : ({
            kind: 'metadata',
            integrity: 'ok' as const,
            snapshot: {
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
              indexes: {},
            },
          } as never),
    );
    const inspectFreshTarget = async () => ({
      status: 'present',
      database: {size: 4, lastModified: 1},
      wal: null,
      shm: null,
      marker: {...ownership, status: 'writing'},
    });
    try {
      await expect(
        runDatabasePreflight(
          'watermelon',
          probe,
          async () => ({}),
          async () => ({kind: 'missing'}),
          inspectFreshTarget,
        ),
      ).resolves.toEqual({kind: 'fresh-target', databaseName: 'watermelon_v4'});
    } finally {
      clearFreshTargetOwnership();
    }
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

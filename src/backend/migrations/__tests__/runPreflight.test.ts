import {runDatabasePreflight} from '../runPreflight';

describe('runDatabasePreflight', () => {
  it('routes a missing legacy file to the fresh v4 target', async () => {
    await expect(runDatabasePreflight('watermelon', async () => ({kind: 'missing'}))).resolves.toEqual({
      kind: 'fresh-target',
      databaseName: 'watermelon_v4',
    });
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

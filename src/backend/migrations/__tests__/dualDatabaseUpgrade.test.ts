import {runDualDatabaseUpgrade, type DualDatabaseUpgradeDriver, type UpgradeState} from '../dualDatabaseUpgrade';
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

const passedVerification = {
  ok: true,
  rowCountsMatch: true,
  amountSumsMatch: true,
  idsAndRelationsMatch: true,
};

const makeDriver = (overrides: Partial<DualDatabaseUpgradeDriver> = {}): DualDatabaseUpgradeDriver => ({
  inspectLegacySchema: async () => zeroV3,
  persistState: jest.fn(async (_state: UpgradeState) => undefined),
  copyToTarget: jest.fn(async () => undefined),
  verifyTarget: jest.fn(async () => passedVerification),
  activateTarget: jest.fn(async () => undefined),
  ...overrides,
});

describe('runDualDatabaseUpgrade', () => {
  it('activates only after copy and complete verification', async () => {
    const driver = makeDriver();
    await expect(runDualDatabaseUpgrade(driver)).resolves.toEqual({source: 'zero-v3', finalState: 'activated'});
    expect(driver.persistState).toHaveBeenCalledWith('pending');
    expect(driver.persistState).toHaveBeenCalledWith('copying');
    expect(driver.persistState).toHaveBeenCalledWith('verified');
    expect(driver.persistState).toHaveBeenCalledWith('activated');
    expect(driver.activateTarget).toHaveBeenCalledTimes(1);
  });

  it('keeps the old database active when verification fails', async () => {
    const driver = makeDriver({
      verifyTarget: jest.fn(async () => ({...passedVerification, amountSumsMatch: false})),
    });
    await expect(runDualDatabaseUpgrade(driver)).rejects.toThrow('verification failed');
    expect(driver.activateTarget).not.toHaveBeenCalled();
    expect(driver.persistState).toHaveBeenLastCalledWith('failed');
  });

  it('fails closed for an unknown source before copying', async () => {
    const driver = makeDriver({inspectLegacySchema: async () => ({version: 2, tables: {}})});
    await expect(runDualDatabaseUpgrade(driver)).rejects.toThrow('Unsupported legacy database source');
    expect(driver.copyToTarget).not.toHaveBeenCalled();
    expect(driver.activateTarget).not.toHaveBeenCalled();
    expect(driver.persistState).toHaveBeenLastCalledWith('failed');
  });
});

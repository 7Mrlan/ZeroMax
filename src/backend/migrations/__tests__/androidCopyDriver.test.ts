import {createAndroidCopyDriver} from '../androidCopyDriver';
import type {CopyDataset} from '../copyVerification';

const snapshot: CopyDataset = {
  users: [],
  categories: [],
  expenses: [],
  incomes: [],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [],
};

describe('createAndroidCopyDriver', () => {
  it('reads the fixed legacy database through the readonly bridge', async () => {
    const probe = jest.fn(async () => ({
      users: [],
      categories: [],
      expenses: [],
      incomes: [],
      currencies: [],
      debtors: [],
      debts: [],
      budgets: [],
    }));
    const driver = createAndroidCopyDriver({
      bridge: {probe: jest.fn(), readSnapshot: probe},
      ensureBackup: jest.fn(async () => undefined),
      createTarget: jest.fn(() => ({database: {} as never, initializingPromise: Promise.resolve()})),
    });

    await expect(driver.readSourceSnapshot()).resolves.toEqual(snapshot);
    expect(probe).toHaveBeenCalledWith('watermelon');
  });

  it('requires target preparation before running a transaction', async () => {
    const driver = createAndroidCopyDriver({
      bridge: {probe: jest.fn(), readSnapshot: async () => snapshot},
      ensureBackup: jest.fn(async () => undefined),
      createTarget: jest.fn(() => ({database: {} as never, initializingPromise: Promise.resolve()})),
    });

    await expect(driver.runTargetTransaction(snapshot, () => ({ok: true}) as never)).rejects.toThrow(
      'has not been prepared',
    );
  });
});

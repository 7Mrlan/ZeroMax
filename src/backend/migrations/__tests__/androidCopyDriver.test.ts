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
    const readBackupSnapshot = jest.fn(async () => ({
      users: [],
      categories: [],
      expenses: [],
      incomes: [],
      currencies: [],
      debtors: [],
      debts: [],
      budgets: [],
    }));
    const backupDatabase = jest.fn(async () => ({
      status: 'backed-up',
      backupId: 'migration-1',
      files: [{name: 'watermelon.db', size: 1, lastModified: 1, sha256: 'a'.repeat(64)}],
    }));
    const driver = createAndroidCopyDriver({
      bridge: {probe: jest.fn(), backupDatabase, readBackupSnapshot},
      backupId: 'migration-1',
      createTarget: jest.fn(() => ({database: {} as never, initializingPromise: Promise.resolve()})),
    });

    await expect(driver.readSourceSnapshot()).rejects.toThrow('backup has not been created');
    await driver.ensureBackup();
    await expect(driver.readSourceSnapshot()).resolves.toEqual(snapshot);
    expect(readBackupSnapshot).toHaveBeenCalledWith('migration-1');
    expect(driver.getPreparedTargetDatabase?.()).toBeNull();
  });

  it('requires target preparation before running a transaction', async () => {
    const driver = createAndroidCopyDriver({
      bridge: {probe: jest.fn(), backupDatabase: jest.fn(), readBackupSnapshot: async () => snapshot},
      backupId: 'migration-1',
      createTarget: jest.fn(() => ({database: {} as never, initializingPromise: Promise.resolve()})),
    });

    await expect(driver.runTargetTransaction(snapshot, () => ({ok: true}) as never)).rejects.toThrow(
      'has not been prepared',
    );
    expect(driver.getPreparedTargetDatabase?.()).toBeNull();
  });

  it('closes the isolated JSI adapter before a retry can discard its files', async () => {
    const unsafeClose = jest.fn();
    const database = {
      adapter: {underlyingAdapter: {_dispatcher: {_db: {unsafeClose}}}},
    };
    const driver = createAndroidCopyDriver({
      bridge: {probe: jest.fn(), backupDatabase: jest.fn(), readBackupSnapshot: async () => snapshot},
      backupId: 'migration-1',
      createTarget: jest.fn(() => ({database: database as never, initializingPromise: Promise.resolve()})),
    });

    await driver.prepareTarget();
    await driver.closePreparedTarget?.();

    expect(unsafeClose).toHaveBeenCalledTimes(1);
    expect(driver.getPreparedTargetDatabase?.()).toBeNull();
  });

  it('fails closed when the prepared adapter has no close lifecycle', async () => {
    const driver = createAndroidCopyDriver({
      bridge: {probe: jest.fn(), backupDatabase: jest.fn(), readBackupSnapshot: async () => snapshot},
      backupId: 'migration-1',
      createTarget: jest.fn(() => ({database: {} as never, initializingPromise: Promise.resolve()})),
    });

    await driver.prepareTarget();
    await expect(driver.closePreparedTarget?.()).rejects.toThrow('close lifecycle is unavailable');
    expect(driver.getPreparedTargetDatabase?.()).not.toBeNull();
  });
});

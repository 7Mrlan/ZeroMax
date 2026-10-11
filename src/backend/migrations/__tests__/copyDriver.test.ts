import {copyLegacyRows, type LegacyCopyDriver} from '../copyDriver';
import type {CopyDataset, CopyRow, CopyTable} from '../copyVerification';

const source: CopyDataset = {
  users: [{id: 'u1', username: 'Ada', email: '', _status: 'synced', _changed: ''}],
  categories: [{id: 'c1', name: 'Food', user_id: 'u1', _status: 'synced', _changed: ''}],
  expenses: [
    {
      id: 'e1',
      title: 'Lunch',
      amount: 10,
      category_id: 'c1',
      user_id: 'u1',
      date: '2026-01-01',
      _status: 'synced',
      _changed: '',
    },
  ],
  budgets: [],
};

const normalizedTarget = (): CopyDataset => ({
  users: [...source.users!],
  categories: [{...source.categories![0], kind: 'expense', parent_id: null}],
  expenses: [...source.expenses!],
  incomes: [],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [],
});

const makeDriver = (overrides: Partial<LegacyCopyDriver> = {}): LegacyCopyDriver => {
  const writes: Partial<Record<CopyTable, ReadonlyArray<CopyRow>>> = {};
  return {
    readSourceSnapshot: jest.fn(async () => source),
    ensureBackup: jest.fn(async () => undefined),
    prepareTarget: jest.fn(async () => undefined),
    beginTargetTransaction: jest.fn(async () => undefined),
    writeTargetRows: jest.fn(async (table, rows) => {
      writes[table] = rows;
    }),
    readTargetSnapshot: jest.fn(async () => normalizedTarget()),
    commitTargetTransaction: jest.fn(async () => undefined),
    rollbackTargetTransaction: jest.fn(async () => undefined),
    ...overrides,
  };
};

describe('copyLegacyRows', () => {
  it('normalizes, writes parent-first tables, verifies, and commits', async () => {
    const driver = makeDriver();
    const result = await copyLegacyRows('zero-v3', driver);
    expect(result.verification.ok).toBe(true);
    expect((driver.ensureBackup as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (driver.readSourceSnapshot as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((driver.prepareTarget as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (driver.beginTargetTransaction as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(driver.writeTargetRows).toHaveBeenCalledTimes(8);
    expect(driver.commitTargetTransaction).toHaveBeenCalledTimes(1);
    expect(driver.rollbackTargetTransaction).not.toHaveBeenCalled();
  });

  it('rolls back when a target write fails', async () => {
    const driver = makeDriver({
      writeTargetRows: jest.fn(async table => {
        if (table === 'expenses') {
          throw new Error('disk full');
        }
      }),
    });
    await expect(copyLegacyRows('zero-v3', driver)).rejects.toThrow('disk full');
    expect(driver.rollbackTargetTransaction).toHaveBeenCalledTimes(1);
    expect(driver.commitTargetTransaction).not.toHaveBeenCalled();
  });

  it('rolls back when read-back verification fails', async () => {
    const driver = makeDriver({
      readTargetSnapshot: jest.fn(async () => ({...normalizedTarget(), expenses: []})),
    });
    await expect(copyLegacyRows('zero-v3', driver)).rejects.toThrow('Target copy verification failed');
    expect(driver.rollbackTargetTransaction).toHaveBeenCalledTimes(1);
    expect(driver.commitTargetTransaction).not.toHaveBeenCalled();
  });
});

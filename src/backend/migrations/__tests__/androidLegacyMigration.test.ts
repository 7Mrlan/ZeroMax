jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {getItemSync: jest.fn(() => null), setItemSync: jest.fn(), removeItemSync: jest.fn()},
}));

import {runAndroidLegacyMigration} from '../androidLegacyMigration';
import type {LegacyCopyDriver} from '../copyDriver';

const source = {
  users: [{id: 'u1', username: 'Ada', email: '', _status: 'synced', _changed: ''}],
  categories: [
    {id: 'c1', name: 'Food', user_id: 'u1', kind: 'expense', parent_id: null, _status: 'synced', _changed: ''},
  ],
  expenses: [],
  incomes: [],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [],
};

const makeDriver = (): LegacyCopyDriver => ({
  ensureBackup: jest.fn(async () => undefined),
  readSourceSnapshot: jest.fn(async () => source),
  prepareTarget: jest.fn(async () => undefined),
  runTargetTransaction: jest.fn(async () => ({ok: true}) as never),
  getPreparedTargetDatabase: () => ({target: true}),
});

describe('runAndroidLegacyMigration', () => {
  it('copies from a stable backup and activates only after verification', async () => {
    const driver = makeDriver();
    const copyRows = jest.fn(async () => ({
      source: 'zero-v3' as const,
      sourceFingerprint: 'source-fingerprint',
      targetFingerprint: 'target-fingerprint',
      normalization: {dataset: source, transforms: []},
      verification: {
        ok: true,
        tablesPresent: true,
        rowCountsMatch: true,
        amountSumsMatch: true,
        idsMatch: true,
        relationsMatch: true,
        existingValuesMatch: true,
        statusAndChangedMatch: true,
        errors: [],
      },
    }));
    const bridge = {
      probe: jest.fn(),
      readSnapshot: jest.fn(async () => source),
      backupDatabase: jest.fn(),
      readBackupSnapshot: jest.fn(),
      inspectTargetArtifact: jest.fn(),
      claimTargetArtifact: jest.fn(async () => undefined),
      updateTargetArtifactMarker: jest.fn(async () => undefined),
    };
    await expect(
      runAndroidLegacyMigration({
        bridge,
        source: 'zero-v3',
        backupId: 'migration-1',
        createDriver: () => driver,
        copyRows,
        setActiveDatabaseName: jest.fn(),
        adoptDatabase: jest.fn(),
      }),
    ).resolves.toMatchObject({checkpoint: {state: 'activated'}, copy: {targetFingerprint: 'target-fingerprint'}});
    expect(copyRows).toHaveBeenCalledWith('zero-v3', driver);
  });

  it('stops before target claim when live and backup fingerprints differ', async () => {
    const driver = {...makeDriver(), readSourceSnapshot: jest.fn(async () => ({...source, users: []}))};
    const claimTargetArtifact = jest.fn();
    const bridge = {
      probe: jest.fn(),
      readSnapshot: jest
        .fn()
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce({...source, users: []}),
      backupDatabase: jest.fn(),
      readBackupSnapshot: jest.fn(),
      inspectTargetArtifact: jest.fn(),
      claimTargetArtifact,
      updateTargetArtifactMarker: jest.fn(),
    };
    await expect(
      runAndroidLegacyMigration({
        bridge,
        source: 'zero-v3',
        backupId: 'migration-1',
        createDriver: () => driver,
        setActiveDatabaseName: jest.fn(),
        adoptDatabase: jest.fn(),
      }),
    ).rejects.toThrow('Source changed between readonly snapshot and backup');
    expect(claimTargetArtifact).not.toHaveBeenCalled();
  });
});

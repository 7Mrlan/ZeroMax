jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {getItemSync: jest.fn(() => null), setItemSync: jest.fn(), removeItemSync: jest.fn()},
}));

import {
  activateAndroidLegacyMigration,
  runAndroidLegacyMigration,
  type AndroidLegacyMigrationResult,
} from '../androidLegacyMigration';
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
  it('copies from a stable backup and leaves activation at verified state', async () => {
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
      }),
    ).resolves.toMatchObject({
      checkpoint: {state: 'verified'},
      copy: {targetFingerprint: 'target-fingerprint'},
      targetDatabase: {target: true},
    });
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
      }),
    ).rejects.toThrow('Source changed between readonly snapshot and backup');
    expect(claimTargetArtifact).not.toHaveBeenCalled();
  });

  it('activates a verified result only after pointer and adoption succeed', async () => {
    const bridge = {
      probe: jest.fn(),
      readSnapshot: jest.fn(),
      backupDatabase: jest.fn(),
      readBackupSnapshot: jest.fn(),
      inspectTargetArtifact: jest.fn(),
      claimTargetArtifact: jest.fn(),
      updateTargetArtifactMarker: jest.fn(async () => undefined),
    };
    const result: AndroidLegacyMigrationResult = {
      checkpoint: {
        schemaVersion: 1,
        generation: 1,
        state: 'verified' as const,
        source: 'zero-v3' as const,
        sourceFingerprint: 'source-a',
        backup: {status: 'ready' as const, descriptor: 'migration-1'},
        target: {
          databaseName: 'watermelon_v4' as const,
          attemptId: '1:source-a',
          status: 'verified' as const,
          fingerprint: 'target-a',
        },
      },
      copy: {
        source: 'zero-v3' as const,
        sourceFingerprint: 'source-a',
        targetFingerprint: 'target-a',
        normalization: {dataset: source, transforms: []},
        verification: {} as never,
      },
      targetDatabase: {target: true},
    };
    const setActiveDatabaseName = jest.fn();
    const adoptDatabase = jest.fn();
    await expect(
      activateAndroidLegacyMigration(result, {bridge, setActiveDatabaseName, adoptDatabase}),
    ).resolves.toMatchObject({checkpoint: {state: 'activated'}});
    expect(setActiveDatabaseName).toHaveBeenCalledWith('watermelon_v4');
    expect(adoptDatabase).toHaveBeenCalledWith({target: true});
  });
});

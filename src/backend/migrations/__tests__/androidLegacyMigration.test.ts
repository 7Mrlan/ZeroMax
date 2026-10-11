jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {getItemSync: jest.fn(() => null), setItemSync: jest.fn(), removeItemSync: jest.fn()},
}));

import {
  reconcileExistingTarget,
  assertLiveSourceFingerprint,
  reopenVerifiedTarget,
  activateAndroidLegacyMigration,
  runAndroidLegacyMigration,
  type AndroidLegacyMigrationResult,
} from '../androidLegacyMigration';
import type {MigrationCheckpoint} from '../migrationCheckpoint';
import type {LegacyCopyDriver} from '../copyDriver';
import {fingerprintCopyDataset} from '../copyFingerprint';

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

const checkpoint = (status: 'writing' | 'verified' = 'writing'): MigrationCheckpoint => ({
  schemaVersion: 1,
  generation: 1,
  state: status === 'verified' ? 'verified' : 'copying',
  source: 'zero-v3',
  sourceFingerprint: 'source-fingerprint',
  backup: {status: 'ready', descriptor: 'migration-1'},
  target: {
    databaseName: 'watermelon_v4',
    attemptId: '1:source-fingerprint',
    status,
    ...(status === 'verified' ? {fingerprint: 'target-fingerprint'} : {}),
  },
});

const verifiedSnapshot = {
  users: [],
  categories: [],
  expenses: [],
  incomes: [],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [],
};

const targetProbe = {
  status: 'ready' as const,
  version: 4,
  integrity: 'ok' as const,
  indexes: {},
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

describe('runAndroidLegacyMigration', () => {
  it('discards a matched writing target before rebuilding', async () => {
    const discardTargetArtifact = jest.fn(async () => undefined);
    await expect(
      reconcileExistingTarget(checkpoint(), {
        probe: jest.fn(),
        readSnapshot: jest.fn(),
        backupDatabase: jest.fn(),
        readBackupSnapshot: jest.fn(),
        inspectTargetArtifact: jest.fn(async () => ({
          status: 'present',
          database: {size: 10, lastModified: 20},
          wal: null,
          shm: null,
          marker: {
            attemptId: '1:source-fingerprint',
            generation: 1,
            sourceFingerprint: 'source-fingerprint',
            status: 'writing',
          },
        })),
        discardTargetArtifact,
      }),
    ).resolves.toEqual({kind: 'rebuild'});
    expect(discardTargetArtifact).toHaveBeenCalledWith('1:source-fingerprint', 1, 'source-fingerprint');
  });

  it('blocks a target marker that has no durable checkpoint owner', async () => {
    const bridge = {
      inspectTargetArtifact: jest.fn(async () => ({
        status: 'present',
        database: {size: 10, lastModified: 20},
        wal: null,
        shm: null,
        marker: {
          attemptId: '7:foreign',
          generation: 7,
          sourceFingerprint: 'foreign',
          status: 'writing',
        },
      })),
    };
    await expect(
      runAndroidLegacyMigration({bridge: bridge as never, source: 'zero-v3', backupId: 'migration-1'}),
    ).rejects.toThrow('without a durable migration checkpoint');
  });

  it('reuses a verified target only after exact schema and row fingerprint checks', async () => {
    const verified = checkpoint('verified');
    const targetFingerprint = fingerprintCopyDataset(verifiedSnapshot);
    const result = await reconcileExistingTarget(
      {
        ...verified,
        target: {...verified.target, fingerprint: targetFingerprint},
      },
      {
        probe: jest.fn(async () => targetProbe),
        readSnapshot: jest.fn(async () => verifiedSnapshot),
        backupDatabase: jest.fn(),
        readBackupSnapshot: jest.fn(),
        inspectTargetArtifact: jest.fn(async () => ({
          status: 'present',
          database: {size: 10, lastModified: 20},
          wal: null,
          shm: null,
          marker: {
            attemptId: '1:source-fingerprint',
            generation: 1,
            sourceFingerprint: 'source-fingerprint',
            status: 'verified',
            targetFingerprint,
          },
        })),
      },
    );
    expect(result).toEqual({
      kind: 'reuse',
      checkpoint: expect.objectContaining({state: 'verified'}),
      observation: {
        kind: 'artifact',
        attemptId: '1:source-fingerprint',
        status: 'verified',
        fingerprint: targetFingerprint,
      },
    });
  });

  it('blocks verified recovery when the legacy source fingerprint changed', () => {
    expect(() => assertLiveSourceFingerprint(source, fingerprintCopyDataset(source))).not.toThrow();
    expect(() => assertLiveSourceFingerprint({...source, users: []}, fingerprintCopyDataset(source))).toThrow(
      'Legacy source changed before verified target recovery',
    );
  });

  it('reuses one verified JSI adapter for repeated same-attempt recovery', async () => {
    const createTarget = jest.fn(() => ({
      database: {instance: 'target'} as never,
      initializingPromise: Promise.resolve(),
    }));
    const verified = checkpoint('verified');
    const observation = {
      kind: 'artifact' as const,
      attemptId: verified.target.attemptId,
      status: 'verified' as const,
      fingerprint: 'target-fingerprint',
    };
    const first = await reopenVerifiedTarget(verified, observation, createTarget);
    const second = await reopenVerifiedTarget(verified, observation, createTarget);

    expect(second.targetDatabase).toBe(first.targetDatabase);
    expect(createTarget).toHaveBeenCalledTimes(1);
  });

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
      inspectTargetArtifact: jest.fn(async () => ({status: 'missing'})),
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

  it('closes the prepared target when post-copy verification state cannot be persisted', async () => {
    const closePreparedTarget = jest.fn(async () => undefined);
    const driver = {...makeDriver(), closePreparedTarget};
    const copyRows = jest.fn(async () => ({
      source: 'zero-v3' as const,
      sourceFingerprint: 'source-fingerprint',
      targetFingerprint: 'target-fingerprint',
      normalization: {dataset: source, transforms: []},
      verification: {} as never,
    }));
    const bridge = {
      probe: jest.fn(),
      readSnapshot: jest.fn(async () => source),
      backupDatabase: jest.fn(),
      readBackupSnapshot: jest.fn(),
      inspectTargetArtifact: jest.fn(async () => ({status: 'missing'})),
      claimTargetArtifact: jest.fn(async () => undefined),
      updateTargetArtifactMarker: jest.fn(async () => {
        throw new Error('marker write failed');
      }),
    };

    await expect(
      runAndroidLegacyMigration({
        bridge,
        source: 'zero-v3',
        backupId: 'migration-1',
        createDriver: () => driver,
        copyRows,
      }),
    ).rejects.toThrow('marker write failed');
    expect(closePreparedTarget).toHaveBeenCalledTimes(1);
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
      inspectTargetArtifact: jest.fn(async () => ({status: 'missing'})),
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
      inspectTargetArtifact: jest.fn(async () => ({status: 'missing'})),
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

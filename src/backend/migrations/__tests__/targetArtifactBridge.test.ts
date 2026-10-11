import {discardOwnedTargetArtifact, inspectTargetRecovery, normalizeTargetArtifact} from '../targetArtifactBridge';
import type {MigrationCheckpoint} from '../migrationCheckpoint';
import {fingerprintCopyDataset} from '../copyFingerprint';

const checkpoint = (overrides: Partial<MigrationCheckpoint> = {}): MigrationCheckpoint => ({
  schemaVersion: 1,
  generation: 1,
  state: 'copying',
  source: 'zero-v3',
  sourceFingerprint: 'source-a',
  backup: {status: 'ready', descriptor: 'backup-a'},
  target: {databaseName: 'watermelon_v4', attemptId: '1:source-a', status: 'writing'},
  ...overrides,
});

describe('target artifact bridge', () => {
  it('validates native artifact metadata', () => {
    expect(
      normalizeTargetArtifact({
        status: 'present',
        database: {size: 10, lastModified: 20},
        wal: null,
        shm: null,
      }),
    ).toEqual({
      status: 'present',
      database: {size: 10, lastModified: 20},
      wal: null,
      shm: null,
    });
    expect(() => normalizeTargetArtifact({status: 'present', database: {size: -1, lastModified: 20}})).toThrow(
      'invalid result',
    );
  });

  it('blocks a present target when its durable marker is missing', async () => {
    await expect(
      inspectTargetRecovery(null, {
        inspectTargetArtifact: async () => ({
          status: 'present',
          database: {size: 10, lastModified: 20},
          wal: null,
          shm: null,
        }),
      }),
    ).resolves.toEqual({kind: 'unknown', reason: 'Target file exists without a durable migration checkpoint'});
  });

  it('does not infer ownership for a partial writing target from the checkpoint alone', async () => {
    await expect(
      inspectTargetRecovery(checkpoint(), {
        inspectTargetArtifact: async () => ({
          status: 'present',
          database: {size: 10, lastModified: 20},
          wal: null,
          shm: null,
        }),
      }),
    ).resolves.toEqual({kind: 'unknown', reason: 'Writing target ownership marker is unavailable'});
  });

  it('returns missing without requiring a checkpoint', async () => {
    await expect(
      inspectTargetRecovery(null, {
        inspectTargetArtifact: async () => ({status: 'missing'}),
      }),
    ).resolves.toEqual({kind: 'missing'});
  });

  it('fingerprints a verified target through the readonly row bridge', async () => {
    const bridge = {
      inspectTargetArtifact: async () => ({
        status: 'present',
        database: {size: 10, lastModified: 20},
        wal: null,
        shm: null,
      }),
      readSnapshot: async () => ({
        users: [],
        categories: [],
        expenses: [],
        incomes: [],
        currencies: [],
        debtors: [],
        debts: [],
        budgets: [],
      }),
    };
    const snapshot = {
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
      inspectTargetRecovery(
        checkpoint({
          state: 'verified',
          target: {...checkpoint().target, status: 'verified', fingerprint: fingerprintCopyDataset(snapshot)},
        }),
        {...bridge, readSnapshot: async () => snapshot},
      ),
    ).resolves.toEqual({
      kind: 'artifact',
      status: 'verified',
      attemptId: '1:source-a',
      fingerprint: fingerprintCopyDataset(snapshot),
    });
  });

  it('refuses to discard a writing artifact without a native ownership marker', async () => {
    const discardTargetArtifact = jest.fn(async () => undefined);
    const bridge = {inspectTargetArtifact: async () => ({status: 'missing'}), discardTargetArtifact};
    const owned = checkpoint({target: {...checkpoint().target, status: 'writing'}});
    await expect(
      discardOwnedTargetArtifact(owned, {kind: 'artifact', attemptId: '1:source-a', status: 'writing'}, bridge),
    ).rejects.toThrow('target is recoverable');
    expect(discardTargetArtifact).not.toHaveBeenCalled();
    await expect(
      discardOwnedTargetArtifact(owned, {kind: 'artifact', attemptId: '2:source-b', status: 'writing'}, bridge),
    ).rejects.toThrow('different migration attempt');
    expect(discardTargetArtifact).not.toHaveBeenCalled();
  });
});

import {
  claimTargetArtifact,
  discardOwnedTargetArtifact,
  inspectTargetRecovery,
  normalizeTargetArtifact,
  updateTargetArtifactMarker,
  verifyFreshTargetOwnership,
} from '../targetArtifactBridge';
import type {MigrationCheckpoint} from '../migrationCheckpoint';
import {fingerprintCopyDataset} from '../copyFingerprint';

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
        marker: null,
      }),
    ).toEqual({
      status: 'present',
      database: {size: 10, lastModified: 20},
      wal: null,
      shm: null,
      marker: null,
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
          marker: {
            attemptId: '1:source-a',
            generation: 1,
            sourceFingerprint: 'source-a',
            status: 'writing',
          },
        }),
      }),
    ).resolves.toEqual({kind: 'unknown', reason: 'Target file exists without a durable migration checkpoint'});
  });

  it('returns a discardable writing artifact only after marker identity matches', async () => {
    await expect(
      inspectTargetRecovery(checkpoint(), {
        inspectTargetArtifact: async () => ({
          status: 'present',
          database: {size: 10, lastModified: 20},
          wal: null,
          shm: null,
          marker: {
            attemptId: '1:source-a',
            generation: 1,
            sourceFingerprint: 'source-a',
            status: 'writing',
          },
        }),
      }),
    ).resolves.toEqual({kind: 'artifact', attemptId: '1:source-a', status: 'writing'});
  });

  it('blocks a marker with a matching attempt id but a different generation or source', async () => {
    await expect(
      inspectTargetRecovery(checkpoint(), {
        inspectTargetArtifact: async () => ({
          status: 'present',
          database: {size: 10, lastModified: 20},
          wal: null,
          shm: null,
          marker: {
            attemptId: '1:source-a',
            generation: 2,
            sourceFingerprint: 'source-b',
            status: 'writing',
          },
        }),
      }),
    ).resolves.toEqual({kind: 'unknown', reason: 'Target artifact marker belongs to another attempt'});
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
        marker: {
          attemptId: '1:source-a',
          generation: 1,
          sourceFingerprint: 'source-a',
          status: 'verified',
          targetFingerprint: fingerprintCopyDataset(snapshot),
        },
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
      probe: async () => targetProbe,
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

  it('blocks verified recovery when the exact target schema probe is unavailable', async () => {
    await expect(
      inspectTargetRecovery(
        checkpoint({state: 'verified', target: {...checkpoint().target, status: 'verified', fingerprint: 'target-a'}}),
        {
          inspectTargetArtifact: async () => ({
            status: 'present',
            database: {size: 10, lastModified: 20},
            wal: null,
            shm: null,
            marker: {
              attemptId: '1:source-a',
              generation: 1,
              sourceFingerprint: 'source-a',
              status: 'verified',
              targetFingerprint: 'target-a',
            },
          }),
          readSnapshot: async () => ({}),
        },
      ),
    ).resolves.toEqual({kind: 'unknown', reason: 'Target schema probe is unavailable for verified recovery'});
  });

  it('passes the durable identity to native claim and monotonic marker updates', async () => {
    const claim = jest.fn(async () => ({status: 'claimed'}));
    const update = jest.fn(async () => undefined);
    const bridge = {
      inspectTargetArtifact: async () => ({status: 'missing'}),
      claimTargetArtifact: claim,
      updateTargetArtifactMarker: update,
    };
    const current = checkpoint();
    await expect(claimTargetArtifact(current, bridge)).resolves.toBeUndefined();
    expect(claim).toHaveBeenCalledWith('1:source-a', 1, 'source-a');
    await expect(updateTargetArtifactMarker('1:source-a', 'verified', 'target-a', bridge)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith('1:source-a', 'verified', 'target-a');
  });

  it('verifies a fresh target marker against the MMKV ownership record', async () => {
    const ownership = {
      attemptId: 'fresh-1-test',
      generation: 1,
      sourceFingerprint: 'fresh-install-v1' as const,
      targetFingerprint: 'fresh-target-v1' as const,
    };
    const bridge = {
      inspectTargetArtifact: async () => ({
        status: 'present' as const,
        database: {size: 10, lastModified: 20},
        wal: null,
        shm: null,
        marker: {...ownership, status: 'activated' as const},
      }),
    };
    await expect(verifyFreshTargetOwnership(ownership, bridge)).resolves.toBe(true);
    await expect(verifyFreshTargetOwnership({...ownership, attemptId: 'foreign'}, bridge)).resolves.toBe(false);
  });

  it('refuses to discard a writing artifact without a native ownership marker', async () => {
    const bridge = {inspectTargetArtifact: async () => ({status: 'missing'})};
    const owned = checkpoint({target: {...checkpoint().target, status: 'writing'}});
    await expect(
      discardOwnedTargetArtifact(owned, {kind: 'artifact', attemptId: '1:source-a', status: 'writing'}, bridge),
    ).rejects.toThrow('discard bridge is unavailable');
    await expect(
      discardOwnedTargetArtifact(owned, {kind: 'artifact', attemptId: '2:source-b', status: 'writing'}, bridge),
    ).rejects.toThrow('different migration attempt');
  });
});

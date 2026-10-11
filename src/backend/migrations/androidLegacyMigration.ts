import {readDatabaseSnapshotReadOnly, type ReadOnlySqliteBridge} from './nativePreflight';
import {fingerprintCopyDataset} from './copyFingerprint';
import {copyLegacyRows, type LegacyCopyDriver, type LegacyCopyResult} from './copyDriver';
import {
  beginMigrationCheckpoint,
  readMigrationCheckpoint,
  updateMigrationCheckpoint,
  type MigrationCheckpoint,
} from './migrationCheckpoint';
import {
  claimTargetArtifact,
  discardOwnedTargetArtifact,
  inspectTargetRecovery,
  updateTargetArtifactMarker,
  type TargetArtifactBridge,
} from './targetArtifactBridge';
import {decideTargetRecovery, type TargetObservation} from './targetArtifact';
import {createAndroidCopyDriver, type AndroidCopyDriverDependencies} from './androidCopyDriver';
import type {AndroidBackupBridge} from './backupBridge';
import type {LegacyDatabaseSource} from './legacySchema';
import type {ActiveDatabaseName} from './activeDatabase';
import {createTargetDatabase} from '../../watermelondb/targetDatabase';

export type AndroidLegacyMigrationBridge = ReadOnlySqliteBridge & AndroidBackupBridge & TargetArtifactBridge;

export interface AndroidLegacyMigrationDependencies {
  bridge: AndroidLegacyMigrationBridge;
  source: Extract<LegacyDatabaseSource, 'zero-v3' | 'zerox-v3'>;
  backupId: string;
  createDriver?: (dependencies: AndroidCopyDriverDependencies) => LegacyCopyDriver;
  copyRows?: typeof copyLegacyRows;
  createTarget?: typeof createTargetDatabase;
}

export interface AndroidLegacyMigrationResult {
  checkpoint: MigrationCheckpoint;
  copy: LegacyCopyResult;
  targetDatabase: unknown;
}

// A failed activation can be retried in the same JS runtime. Keep the
// verified adapter by attempt identity so recovery never opens a second JSI
// adapter against the same SQLite file. A process restart naturally clears
// this map and reopens only after native read-only verification.
const verifiedTargetInstances = new Map<string, unknown>();

export type ExistingTargetRecovery =
  | {kind: 'rebuild'}
  | {kind: 'reuse'; checkpoint: MigrationCheckpoint; observation: Extract<TargetObservation, {kind: 'artifact'}>};

export const assertLiveSourceFingerprint = (
  snapshot: Parameters<typeof fingerprintCopyDataset>[0],
  expected: string,
): void => {
  if (fingerprintCopyDataset(snapshot) !== expected) {
    throw new Error('Legacy source changed before verified target recovery');
  }
};

/**
 * Reconciles an old target before a new migration generation can claim the
 * fixed v4 path. A matched writing marker is discarded and rebuilt; a
 * matched verified marker is never copied again and is returned for reuse.
 * Any missing, malformed, or foreign marker remains fail-closed.
 */
export const reconcileExistingTarget = async (
  checkpoint: MigrationCheckpoint,
  bridge: AndroidLegacyMigrationBridge,
): Promise<ExistingTargetRecovery> => {
  const observation = await inspectTargetRecovery(checkpoint, bridge);
  if (observation.kind === 'missing') {
    const decision = decideTargetRecovery(checkpoint, observation);
    if (decision.kind === 'create-fresh') {
      return {kind: 'rebuild'};
    }
    throw new Error(decision.kind === 'blocked' ? decision.reason : 'Target recovery decision is unsupported');
  }

  const decision = decideTargetRecovery(checkpoint, observation);
  if (decision.kind === 'discard-owned') {
    await discardOwnedTargetArtifact(checkpoint, observation, bridge);
    return {kind: 'rebuild'};
  }
  if (decision.kind === 'open-verified' && observation.kind === 'artifact' && observation.status === 'verified') {
    return {kind: 'reuse', checkpoint, observation};
  }
  throw new Error(decision.kind === 'blocked' ? decision.reason : 'Target recovery decision is unsupported');
};

/**
 * A verified target has already passed native exact-schema/integrity and
 * row-fingerprint checks. Reopen it once for adoption; do not run the copy
 * writer or create a second adapter for the same target file.
 */
export const reopenVerifiedTarget = async (
  checkpoint: MigrationCheckpoint,
  observation: Extract<TargetObservation, {kind: 'artifact'}>,
  createTarget: typeof createTargetDatabase,
): Promise<AndroidLegacyMigrationResult> => {
  if (observation.status !== 'verified' || observation.fingerprint === undefined) {
    throw new Error('Verified target recovery is missing its fingerprint');
  }
  let targetDatabase = verifiedTargetInstances.get(checkpoint.target.attemptId);
  if (!targetDatabase) {
    const target = createTarget();
    await target.initializingPromise;
    targetDatabase = target.database;
    verifiedTargetInstances.set(checkpoint.target.attemptId, targetDatabase);
  }
  return {
    checkpoint,
    copy: {
      source: checkpoint.source,
      sourceFingerprint: checkpoint.sourceFingerprint,
      targetFingerprint: observation.fingerprint,
      normalization: {dataset: {}, transforms: ['reused verified target after interrupted activation']},
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
    },
    targetDatabase,
  };
};

/** Runs legacy migration from a stable backup and adopts the verified target instance. */
export const runAndroidLegacyMigration = async ({
  bridge,
  source,
  backupId,
  createDriver = createAndroidCopyDriver,
  copyRows = copyLegacyRows,
  createTarget = createTargetDatabase,
}: AndroidLegacyMigrationDependencies): Promise<AndroidLegacyMigrationResult> => {
  const previous = readMigrationCheckpoint();
  if (previous.kind === 'invalid') {
    throw previous.error;
  }
  if (previous.kind === 'valid') {
    if (previous.checkpoint.source !== source) {
      throw new Error('Migration checkpoint source changed while the upgrade was in progress');
    }
    const recovery = await reconcileExistingTarget(previous.checkpoint, bridge);
    if (recovery.kind === 'reuse') {
      const liveSnapshot = await readDatabaseSnapshotReadOnly('watermelon', bridge);
      assertLiveSourceFingerprint(liveSnapshot, previous.checkpoint.sourceFingerprint);
      return reopenVerifiedTarget(recovery.checkpoint, recovery.observation, createTarget);
    }
  } else {
    const orphan = await inspectTargetRecovery(null, bridge);
    if (orphan.kind !== 'missing') {
      throw new Error(
        orphan.kind === 'unknown' ? orphan.reason : 'Target artifact exists without a durable migration checkpoint',
      );
    }
  }

  const liveSnapshot = await readDatabaseSnapshotReadOnly('watermelon', bridge);
  const liveFingerprint = fingerprintCopyDataset(liveSnapshot);
  const driver = createDriver({bridge, backupId});
  await driver.ensureBackup();
  const backupSnapshot = await driver.readSourceSnapshot();
  if (liveFingerprint !== fingerprintCopyDataset(backupSnapshot)) {
    throw new Error('Source changed between readonly snapshot and backup');
  }

  const checkpoint = beginMigrationCheckpoint({source, sourceFingerprint: liveFingerprint});
  await claimTargetArtifact(checkpoint, bridge);
  let currentCheckpoint = updateMigrationCheckpoint(checkpoint, current => ({
    ...current,
    state: 'copying',
    backup: {status: 'ready', descriptor: backupId},
    target: {...current.target, status: 'writing'},
  }));

  let copy: LegacyCopyResult;
  try {
    copy = await copyRows(source, driver);
  } catch (error) {
    // A failed copy can leave a JSI adapter holding the target file. Close it
    // before the next retry's marker-guarded discard; never delete an SQLite
    // artifact while its writer may still be alive.
    try {
      await driver.closePreparedTarget?.();
    } catch {
      // Preserve the copy error. The durable writing marker remains so a
      // later process can fail closed or reconcile it with native ownership.
    }
    throw error;
  }
  await updateTargetArtifactMarker(currentCheckpoint.target.attemptId, 'verified', copy.targetFingerprint, bridge);
  currentCheckpoint = updateMigrationCheckpoint(currentCheckpoint, current => ({
    ...current,
    state: 'verified',
    target: {...current.target, status: 'verified', fingerprint: copy.targetFingerprint},
  }));

  const targetDatabase = driver.getPreparedTargetDatabase?.();
  if (!targetDatabase) {
    throw new Error('Verified target database instance is unavailable for adoption');
  }
  verifiedTargetInstances.set(currentCheckpoint.target.attemptId, targetDatabase);
  return {checkpoint: currentCheckpoint, copy, targetDatabase};
};

export interface AndroidLegacyActivationDependencies {
  bridge: AndroidLegacyMigrationBridge;
  setActiveDatabaseName: (databaseName: ActiveDatabaseName) => void;
  adoptDatabase: (database: unknown) => void;
}

/** Activates a verified result; failures leave the verified checkpoint recoverable. */
export const activateAndroidLegacyMigration = async (
  result: AndroidLegacyMigrationResult,
  {bridge, setActiveDatabaseName, adoptDatabase}: AndroidLegacyActivationDependencies,
): Promise<AndroidLegacyMigrationResult> => {
  setActiveDatabaseName('watermelon_v4');
  adoptDatabase(result.targetDatabase);
  await updateTargetArtifactMarker(
    result.checkpoint.target.attemptId,
    'activated',
    result.copy.targetFingerprint,
    bridge,
  );
  const checkpoint = updateMigrationCheckpoint(result.checkpoint, current => ({
    ...current,
    state: 'activated',
    target: {...current.target, status: 'activated'},
  }));
  return {...result, checkpoint};
};

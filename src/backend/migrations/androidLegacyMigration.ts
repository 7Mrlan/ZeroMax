import {readDatabaseSnapshotReadOnly, type ReadOnlySqliteBridge} from './nativePreflight';
import {fingerprintCopyDataset} from './copyFingerprint';
import {copyLegacyRows, type LegacyCopyDriver, type LegacyCopyResult} from './copyDriver';
import {beginMigrationCheckpoint, updateMigrationCheckpoint, type MigrationCheckpoint} from './migrationCheckpoint';
import {claimTargetArtifact, updateTargetArtifactMarker, type TargetArtifactBridge} from './targetArtifactBridge';
import {createAndroidCopyDriver, type AndroidCopyDriverDependencies} from './androidCopyDriver';
import type {AndroidBackupBridge} from './backupBridge';
import type {LegacyDatabaseSource} from './legacySchema';
import type {ActiveDatabaseName} from './activeDatabase';

export type AndroidLegacyMigrationBridge = ReadOnlySqliteBridge & AndroidBackupBridge & TargetArtifactBridge;

export interface AndroidLegacyMigrationDependencies {
  bridge: AndroidLegacyMigrationBridge;
  source: Extract<LegacyDatabaseSource, 'zero-v3' | 'zerox-v3'>;
  backupId: string;
  createDriver?: (dependencies: AndroidCopyDriverDependencies) => LegacyCopyDriver;
  copyRows?: typeof copyLegacyRows;
}

export interface AndroidLegacyMigrationResult {
  checkpoint: MigrationCheckpoint;
  copy: LegacyCopyResult;
  targetDatabase: unknown;
}

/** Runs legacy migration from a stable backup and adopts the verified target instance. */
export const runAndroidLegacyMigration = async ({
  bridge,
  source,
  backupId,
  createDriver = createAndroidCopyDriver,
  copyRows = copyLegacyRows,
}: AndroidLegacyMigrationDependencies): Promise<AndroidLegacyMigrationResult> => {
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

  const copy = await copyRows(source, driver);
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

import {NativeModules} from 'react-native';
import {resetMigrationFailureForRetry, runMigrations} from './migrations/runner';
import {appendErrorLog} from '../utils/errorLog';
import {adoptDatabaseInstance, resetDatabaseInstance, waitForDatabase} from '../watermelondb/database';
import {createTargetDatabase} from '../watermelondb/targetDatabase';
import {
  beginFreshTargetOwnership,
  clearFreshTargetOwnership,
  getActiveDatabaseName,
  persistFreshTargetOwnership,
  readFreshTargetOwnership,
  setActiveDatabaseName,
} from './migrations/activeDatabase';
import {runDatabasePreflight} from './migrations/runPreflight';
import {runBootGate} from './migrations/bootGate';
import {
  activateAndroidLegacyMigration,
  runAndroidLegacyMigration,
  type AndroidLegacyMigrationBridge,
  type AndroidLegacyMigrationResult,
} from './migrations/androidLegacyMigration';
import {probeDatabaseReadOnly, readDatabaseSnapshotReadOnly} from './migrations/nativePreflight';
import {detectLegacyDatabaseSource} from './migrations/legacySchema';
import {COPY_TABLES} from './migrations/copyVerification';
import {normalizeTargetArtifact} from './migrations/targetArtifactBridge';

const verifyFreshTargetReady = async (bridge: AndroidLegacyMigrationBridge): Promise<void> => {
  const probe = await probeDatabaseReadOnly('watermelon_v4', bridge);
  if (
    probe.kind !== 'metadata' ||
    probe.integrity !== 'ok' ||
    detectLegacyDatabaseSource(probe.snapshot) !== 'target-v4'
  ) {
    throw new Error('Fresh target failed exact v4 schema or integrity verification');
  }
  const snapshot = await readDatabaseSnapshotReadOnly('watermelon_v4', bridge);
  if (!COPY_TABLES.every(table => (snapshot[table] ?? []).length === 0)) {
    throw new Error('Fresh target must be empty before onboarding ownership activation');
  }
};

/**
 * Initialize the backend layer.
 * Called once on app startup before any screens render.
 *
 * Responsibilities:
 * - Run pending data migrations (sequential, versioned, idempotent)
 * - Future: cache warmup, integrity checks, etc.
 */
export type BackendInitResult =
  {ok: true} | {ok: false; kind: 'migration' | 'database'; retryable: boolean; error: Error};

let initializationPromise: Promise<BackendInitResult> | null = null;

const performInitialization = async (): Promise<BackendInitResult> => {
  try {
    let preparedLegacyMigration: AndroidLegacyMigrationResult | null = null;
    let adoptedByMigration = false;
    const bootResult = await runBootGate({
      preflight: () => runDatabasePreflight(getActiveDatabaseName()),
      createFreshTarget: async () => {
        const bridge = NativeModules.ZeroReadOnlySqlite as AndroidLegacyMigrationBridge;
        const existingOwnership = readFreshTargetOwnership();
        const existingArtifact = normalizeTargetArtifact(await bridge.inspectTargetArtifact());
        const ownership = existingOwnership ?? beginFreshTargetOwnership();
        if (typeof bridge.claimFreshTargetArtifact !== 'function') {
          throw new Error('Fresh target claim bridge is unavailable');
        }
        const ownsExistingTarget =
          existingOwnership !== null &&
          existingArtifact.status === 'present' &&
          existingArtifact.marker !== null &&
          existingArtifact.marker.attemptId === ownership.attemptId &&
          existingArtifact.marker.generation === ownership.generation &&
          existingArtifact.marker.sourceFingerprint === ownership.sourceFingerprint &&
          existingArtifact.marker.targetFingerprint === ownership.targetFingerprint &&
          ['writing', 'verified', 'activated'].includes(existingArtifact.marker.status);
        const ownsOrphanedTarget =
          existingOwnership !== null &&
          existingArtifact.status === 'orphaned' &&
          existingArtifact.marker !== undefined &&
          existingArtifact.marker.attemptId === ownership.attemptId &&
          existingArtifact.marker.generation === ownership.generation &&
          existingArtifact.marker.sourceFingerprint === ownership.sourceFingerprint &&
          existingArtifact.marker.targetFingerprint === ownership.targetFingerprint &&
          ['writing', 'verified', 'activated'].includes(existingArtifact.marker.status);
        if (ownsOrphanedTarget) {
          await bridge.discardTargetArtifact?.(ownership.attemptId, ownership.generation, ownership.sourceFingerprint);
        }
        persistFreshTargetOwnership(ownership);
        if (!ownsExistingTarget) {
          await bridge.claimFreshTargetArtifact(
            ownership.attemptId,
            ownership.generation,
            ownership.sourceFingerprint,
            ownership.targetFingerprint,
          );
        }
        const target = createTargetDatabase();
        try {
          await target.initializingPromise;
          await verifyFreshTargetReady(bridge);
          const artifact = normalizeTargetArtifact(await bridge.inspectTargetArtifact());
          const markerStatus = artifact.status === 'present' ? artifact.marker?.status : undefined;
          if (typeof bridge.updateTargetArtifactMarker !== 'function') {
            throw new Error('Fresh target marker update bridge is unavailable');
          }
          if (markerStatus === 'writing') {
            await bridge.updateTargetArtifactMarker(ownership.attemptId, 'verified', ownership.targetFingerprint);
            await bridge.updateTargetArtifactMarker(ownership.attemptId, 'activated', ownership.targetFingerprint);
          } else if (markerStatus === 'verified') {
            await bridge.updateTargetArtifactMarker(ownership.attemptId, 'activated', ownership.targetFingerprint);
          } else if (markerStatus !== 'activated') {
            throw new Error('Fresh target marker is not owned by this installation');
          }
          setActiveDatabaseName('watermelon_v4');
          return target.database;
        } catch (error) {
          try {
            target.close?.();
          } catch {
            // Preserve the initialization error; the marker remains fail-closed.
          }
          if (!ownsExistingTarget) {
            try {
              await bridge.discardTargetArtifact?.(
                ownership.attemptId,
                ownership.generation,
                ownership.sourceFingerprint,
              );
            } catch {
              // Preserve the initialization error; recovery remains fail-closed.
            }
          }
          throw error;
        }
      },
      migrateLegacy: async source => {
        const bridge = NativeModules.ZeroReadOnlySqlite as AndroidLegacyMigrationBridge;
        const backupId = `migration-${Date.now()}`;
        preparedLegacyMigration = await runAndroidLegacyMigration({
          bridge,
          source,
          backupId,
        });
        await activateAndroidLegacyMigration(preparedLegacyMigration, {
          bridge,
          setActiveDatabaseName,
          adoptDatabase: database => {
            adoptDatabaseInstance(database as Parameters<typeof adoptDatabaseInstance>[0]);
            adoptedByMigration = true;
          },
        });
        clearFreshTargetOwnership();
        return preparedLegacyMigration.targetDatabase;
      },
      adoptDatabase: database => {
        // The legacy coordinator activates and adopts its verified instance so
        // pointer and JSI ownership remain one ordered operation.
        if (!adoptedByMigration) {
          adoptDatabaseInstance(database as Parameters<typeof adoptDatabaseInstance>[0]);
        }
      },
      openActiveDatabase: waitForDatabase,
    });
    if (!bootResult.ok) {
      return {ok: false, kind: 'migration', retryable: true, error: bootResult.error ?? new Error(bootResult.reason)};
    }
    const migrationResult = await runMigrations();
    if (!migrationResult.ok) {
      const error = migrationResult.error ?? new Error('Data migration failed');
      return {ok: false, kind: 'migration', retryable: true, error};
    }
    return {ok: true};
  } catch (error) {
    const initError = error instanceof Error ? error : new Error(String(error));
    if (__DEV__) {
      console.error('Backend initialization failed:', initError);
    }
    appendErrorLog(initError, true);
    return {ok: false, kind: 'database', retryable: true, error: initError};
  }
};

/** Single-flight startup; duplicate roots cannot run database writers twice. */
export const initBackend = (): Promise<BackendInitResult> => {
  initializationPromise ??= performInitialization();
  return initializationPromise;
};

/** Starts a fresh attempt after the boot recovery surface requests a retry. */
export const retryBackend = (): Promise<BackendInitResult> => {
  initializationPromise = null;
  resetMigrationFailureForRetry();
  resetDatabaseInstance();
  return initBackend();
};

import type {Database} from '@nozbe/watermelondb';
import {createAndroidSourceBackup, readAndroidBackupSnapshot, type AndroidBackupBridge} from './backupBridge';
import {fingerprintCopyDataset} from './copyFingerprint';
import type {CopyDataset} from './copyVerification';
import type {ReadOnlySqliteBridge} from './nativePreflight';
import type {LegacyCopyDriver} from './copyDriver';
import {createTargetDatabase} from '../../watermelondb/targetDatabase';
import {
  createWatermelonTargetTransaction,
  verifyWatermelonTargetSnapshot,
  type TargetDatabaseLike,
} from '../../watermelondb/targetWriter';

export interface AndroidCopyDriverDependencies {
  bridge?: ReadOnlySqliteBridge &
    AndroidBackupBridge & {
      writeTargetSnapshot?: (
        snapshotJson: string,
        targetFingerprint: string,
        attemptId: string,
        generation: number,
        sourceFingerprint: string,
      ) => Promise<unknown>;
    };
  backupId: string;
  createBackup?: (backupId: string, bridge: AndroidBackupBridge) => Promise<{backupId: string}>;
  readBackupSnapshot?: (backupId: string, bridge: AndroidBackupBridge) => Promise<CopyDataset>;
  closeTarget?: () => Promise<void>;
  discardTargetArtifact?: () => Promise<void>;
  createTarget?: typeof createTargetDatabase;
}

/**
 * Composes the Android readonly source bridge with the isolated v4 writer.
 * BootGate and pointer activation remain outside this factory until backup,
 * target freshness, and recovery persistence are supplied by the caller.
 */
export const createAndroidCopyDriver = ({
  bridge,
  backupId,
  createBackup = createAndroidSourceBackup,
  readBackupSnapshot = readAndroidBackupSnapshot,
  closeTarget,
  discardTargetArtifact,
  createTarget = createTargetDatabase,
}: AndroidCopyDriverDependencies): LegacyCopyDriver => {
  let targetDatabase: Database | null = null;
  let targetAdapterClose: (() => void) | null = null;
  let backup: {backupId: string} | null = null;
  let nativeTargetWrite:
    | ((
        snapshotJson: string,
        targetFingerprint: string,
        attemptId: string,
        generation: number,
        sourceFingerprint: string,
      ) => Promise<unknown>)
    | undefined;
  let nativeMarkerActivated = false;
  let targetMarkerIdentity: {
    attemptId: string;
    generation: number;
    sourceFingerprint: string;
  } | null = null;

  const closePreparedTarget = async (): Promise<void> => {
    if (!targetDatabase) {
      return;
    }
    if (closeTarget) {
      await closeTarget();
      targetDatabase = null;
      targetAdapterClose = null;
      return;
    }

    if (targetAdapterClose) {
      targetAdapterClose();
      targetDatabase = null;
      targetAdapterClose = null;
      return;
    }

    // WatermelonDB's JSI adapter exposes the native close operation only as
    // an internal unsafeClose method. Migration recovery must close this
    // isolated adapter before the marker-guarded native file deletion; if
    // the runtime cannot provide it, fail closed instead of deleting a file
    // that may still be held by SQLite.
    const adapter = (
      targetDatabase as unknown as {
        adapter?: {underlyingAdapter?: {_dispatcher?: {_db?: {unsafeClose?: () => void}}}};
      }
    ).adapter;
    const unsafeClose = adapter?.underlyingAdapter?._dispatcher?._db?.unsafeClose;
    if (typeof unsafeClose !== 'function') {
      throw new Error('Prepared target adapter close lifecycle is unavailable');
    }
    unsafeClose();
    targetDatabase = null;
    targetAdapterClose = null;
  };

  return {
    readSourceSnapshot: async () => {
      if (!backup) {
        throw new Error('Android source backup has not been created');
      }
      return readBackupSnapshot(backup.backupId, bridge as AndroidBackupBridge);
    },
    ensureBackup: async () => {
      if (backup?.backupId === backupId) {
        return;
      }
      backup = await createBackup(backupId, bridge as AndroidBackupBridge);
    },
    prepareTarget: async () => {
      if (targetDatabase) {
        throw new Error('Android copy target has already been prepared');
      }
      nativeTargetWrite = (bridge as AndroidCopyDriverDependencies['bridge'])?.writeTargetSnapshot;
      if (nativeTargetWrite) return;
      const target = createTarget();
      await target.initializingPromise;
      targetDatabase = target.database;
      targetAdapterClose = target.close ?? null;
    },
    closePreparedTarget,
    runTargetTransaction: async (expectedTarget, verify) => {
      if (!targetDatabase && !nativeTargetWrite) {
        throw new Error('Android copy target has not been prepared');
      }
      const discardTarget = async (): Promise<void> => {
        if (!discardTargetArtifact) {
          throw new Error('Target close and marker-aware discard lifecycle is unavailable');
        }
        await closePreparedTarget();
        if (targetDatabase) {
          throw new Error('Prepared target adapter is still open');
        }
        await discardTargetArtifact();
      };
      if (nativeTargetWrite) {
        if (!targetMarkerIdentity) {
          throw new Error('Native target writer marker identity has not been bound');
        }
        await nativeTargetWrite(
          JSON.stringify(expectedTarget),
          fingerprintCopyDataset(expectedTarget),
          targetMarkerIdentity.attemptId,
          targetMarkerIdentity.generation,
          targetMarkerIdentity.sourceFingerprint,
        );
        const reopened = createTarget();
        await reopened.initializingPromise;
        targetDatabase = reopened.database;
        targetAdapterClose = reopened.close ?? null;
        try {
          return await verifyWatermelonTargetSnapshot(targetDatabase as unknown as TargetDatabaseLike, verify);
        } catch (error) {
          try {
            await discardTarget();
          } catch {
            // Preserve the read-back/verification error. The marker remains
            // durable so the next boot can reconcile it safely.
          }
          throw error;
        }
      }
      const runTransaction = createWatermelonTargetTransaction(
        targetDatabase as unknown as TargetDatabaseLike,
        discardTarget,
      );
      return runTransaction(expectedTarget, verify);
    },
    setTargetMarkerIdentity: identity => {
      targetMarkerIdentity = identity;
    },
    getPreparedTargetDatabase: () => targetDatabase,
    get targetMarkerActivated() {
      return nativeMarkerActivated;
    },
  };
};

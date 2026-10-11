import type {Database} from '@nozbe/watermelondb';
import {createAndroidSourceBackup, readAndroidBackupSnapshot, type AndroidBackupBridge} from './backupBridge';
import type {CopyDataset} from './copyVerification';
import type {ReadOnlySqliteBridge} from './nativePreflight';
import type {LegacyCopyDriver} from './copyDriver';
import {createTargetDatabase} from '../../watermelondb/targetDatabase';
import {createWatermelonTargetTransaction, type TargetDatabaseLike} from '../../watermelondb/targetWriter';

export interface AndroidCopyDriverDependencies {
  bridge?: ReadOnlySqliteBridge & AndroidBackupBridge;
  backupId: string;
  createBackup?: (backupId: string, bridge: AndroidBackupBridge) => Promise<{backupId: string}>;
  readBackupSnapshot?: (backupId: string, bridge: AndroidBackupBridge) => Promise<CopyDataset>;
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
  createTarget = createTargetDatabase,
}: AndroidCopyDriverDependencies): LegacyCopyDriver => {
  let targetDatabase: Database | null = null;
  let backup: {backupId: string} | null = null;

  return {
    readSourceSnapshot: async () => {
      if (!backup) {
        throw new Error('Android source backup has not been created');
      }
      return readBackupSnapshot(backup.backupId, bridge as AndroidBackupBridge);
    },
    ensureBackup: async () => {
      backup = await createBackup(backupId, bridge as AndroidBackupBridge);
    },
    prepareTarget: async () => {
      if (targetDatabase) {
        throw new Error('Android copy target has already been prepared');
      }
      const target = createTarget();
      await target.initializingPromise;
      targetDatabase = target.database;
    },
    runTargetTransaction: async (expectedTarget, verify) => {
      if (!targetDatabase) {
        throw new Error('Android copy target has not been prepared');
      }
      const discardTarget = async (): Promise<void> => {
        await targetDatabase?.unsafeResetDatabase();
      };
      const runTransaction = createWatermelonTargetTransaction(
        targetDatabase as unknown as TargetDatabaseLike,
        discardTarget,
      );
      return runTransaction(expectedTarget, verify);
    },
  };
};

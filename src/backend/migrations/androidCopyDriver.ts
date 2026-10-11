import type {Database} from '@nozbe/watermelondb';
import {readDatabaseSnapshotReadOnly, type ReadOnlySqliteBridge} from './nativePreflight';
import type {LegacyCopyDriver} from './copyDriver';
import {createTargetDatabase} from '../../watermelondb/targetDatabase';
import {createWatermelonTargetTransaction, type TargetDatabaseLike} from '../../watermelondb/targetWriter';

export interface AndroidCopyDriverDependencies {
  bridge?: ReadOnlySqliteBridge;
  ensureBackup: () => Promise<void>;
  createTarget?: typeof createTargetDatabase;
}

/**
 * Composes the Android readonly source bridge with the isolated v4 writer.
 * BootGate and pointer activation remain outside this factory until backup,
 * target freshness, and recovery persistence are supplied by the caller.
 */
export const createAndroidCopyDriver = ({
  bridge,
  ensureBackup,
  createTarget = createTargetDatabase,
}: AndroidCopyDriverDependencies): LegacyCopyDriver => {
  let targetDatabase: Database | null = null;

  return {
    readSourceSnapshot: () => readDatabaseSnapshotReadOnly('watermelon', bridge),
    ensureBackup,
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

import {NativeModules} from 'react-native';
import {z} from 'zod';
import {normalizeNativeSnapshot} from './nativePreflight';
import type {CopyDataset} from './copyVerification';

const BackupFileSchema = z
  .object({
    name: z.string().min(1),
    size: z.number().nonnegative(),
    lastModified: z.number().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const BackupResultSchema = z
  .object({
    status: z.literal('backed-up'),
    backupId: z.string().min(1),
    files: z.array(BackupFileSchema).min(1),
  })
  .strict();

export interface AndroidBackupBridge {
  backupDatabase: (databaseName: 'watermelon', backupId: string) => Promise<unknown>;
  readBackupSnapshot: (backupId: string) => Promise<unknown>;
}

export type BackupDescriptor = z.infer<typeof BackupResultSchema>;

export const normalizeBackupDescriptor = (value: unknown): BackupDescriptor => {
  const parsed = BackupResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Native backup returned an invalid descriptor');
  }
  return parsed.data;
};

export const createAndroidSourceBackup = async (
  backupId: string,
  bridge: AndroidBackupBridge = NativeModules.ZeroReadOnlySqlite as AndroidBackupBridge,
): Promise<BackupDescriptor> => {
  if (!bridge || typeof bridge.backupDatabase !== 'function') {
    throw new Error('Native source backup bridge is unavailable');
  }
  return normalizeBackupDescriptor(await bridge.backupDatabase('watermelon', backupId));
};

export const readAndroidBackupSnapshot = async (
  backupId: string,
  bridge: Pick<AndroidBackupBridge, 'readBackupSnapshot'> = NativeModules.ZeroReadOnlySqlite,
): Promise<CopyDataset> => {
  if (!bridge || typeof bridge.readBackupSnapshot !== 'function') {
    throw new Error('Native backup snapshot bridge is unavailable');
  }
  return normalizeNativeSnapshot(await bridge.readBackupSnapshot(backupId));
};

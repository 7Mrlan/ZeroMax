import StorageService from '../../utils/asyncStorageService';
import {nanoid} from 'nanoid';
import {z} from 'zod';

export const LEGACY_DATABASE_NAME = 'watermelon';
export const TARGET_DATABASE_NAME = 'watermelon_v4';
export type ActiveDatabaseName = typeof LEGACY_DATABASE_NAME | typeof TARGET_DATABASE_NAME;

const ACTIVE_DATABASE_NAME_KEY = 'active_database_name';
const FRESH_TARGET_OWNERSHIP_KEY = 'fresh_target_ownership_v1';
export const FRESH_TARGET_SOURCE_FINGERPRINT = 'fresh-install-v1';
export const FRESH_TARGET_FINGERPRINT = 'fresh-target-v1';

const FreshTargetOwnershipSchema = z
  .object({
    attemptId: z.string().min(1),
    generation: z.number().int().positive(),
    sourceFingerprint: z.literal(FRESH_TARGET_SOURCE_FINGERPRINT),
    targetFingerprint: z.literal(FRESH_TARGET_FINGERPRINT),
  })
  .strict();

export type FreshTargetOwnership = z.infer<typeof FreshTargetOwnershipSchema>;

/** Returns the database file selected only after a verified copy is activated. */
export const getActiveDatabaseName = (): ActiveDatabaseName => {
  const value = StorageService.getItemSync(ACTIVE_DATABASE_NAME_KEY);
  return value === TARGET_DATABASE_NAME ? TARGET_DATABASE_NAME : LEGACY_DATABASE_NAME;
};

/**
 * Switches the active database pointer. Callers must verify the target and
 * retain the legacy file before changing this MMKV value.
 */
export const setActiveDatabaseName = (databaseName: ActiveDatabaseName): void => {
  StorageService.setItemSync(ACTIVE_DATABASE_NAME_KEY, databaseName);
};

export const readFreshTargetOwnership = (): FreshTargetOwnership | null => {
  const raw = StorageService.getItemSync(FRESH_TARGET_OWNERSHIP_KEY);
  if (raw === null) return null;
  try {
    const parsed = FreshTargetOwnershipSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const beginFreshTargetOwnership = (): FreshTargetOwnership => {
  const previous = readFreshTargetOwnership();
  const generation = (previous?.generation ?? 0) + 1;
  return {
    attemptId: `fresh-${generation}-${nanoid(16)}`,
    generation,
    sourceFingerprint: FRESH_TARGET_SOURCE_FINGERPRINT,
    targetFingerprint: FRESH_TARGET_FINGERPRINT,
  };
};

export const persistFreshTargetOwnership = (ownership: FreshTargetOwnership): void => {
  const parsed = FreshTargetOwnershipSchema.safeParse(ownership);
  if (!parsed.success) throw new Error('Refusing to persist invalid fresh target ownership');
  StorageService.setItemSync(FRESH_TARGET_OWNERSHIP_KEY, JSON.stringify(parsed.data));
};

export const clearFreshTargetOwnership = (): void => {
  StorageService.removeItemSync(FRESH_TARGET_OWNERSHIP_KEY);
};

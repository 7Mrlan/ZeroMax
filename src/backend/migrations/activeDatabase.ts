import StorageService from '../../utils/asyncStorageService';

export const LEGACY_DATABASE_NAME = 'watermelon';
export const TARGET_DATABASE_NAME = 'watermelon_v4';

const ACTIVE_DATABASE_NAME_KEY = 'active_database_name';

/** Returns the database file selected only after a verified copy is activated. */
export const getActiveDatabaseName = (): string =>
  StorageService.getItemSync(ACTIVE_DATABASE_NAME_KEY) ?? LEGACY_DATABASE_NAME;

/**
 * Switches the active database pointer. Callers must verify the target and
 * retain the legacy file before changing this MMKV value.
 */
export const setActiveDatabaseName = (databaseName: string): void => {
  StorageService.setItemSync(ACTIVE_DATABASE_NAME_KEY, databaseName);
};

import StorageService from '../../utils/asyncStorageService';

export const LEGACY_DATABASE_NAME = 'watermelon';
export const TARGET_DATABASE_NAME = 'watermelon_v4';
export type ActiveDatabaseName = typeof LEGACY_DATABASE_NAME | typeof TARGET_DATABASE_NAME;

const ACTIVE_DATABASE_NAME_KEY = 'active_database_name';

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

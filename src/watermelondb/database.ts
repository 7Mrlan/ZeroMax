import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import {getActiveDatabaseName} from '../backend/migrations/activeDatabase';
import {selectDatabase} from './databaseSelection';

let _database: Database | null = null;
let _databaseError: Error | null = null;
let _databaseReadyPromise: Promise<void> | null = null;
let _databaseOwnership: 'none' | 'opened' | 'adopted' = 'none';

/**
 * Returns the database setup error if initialization failed.
 * Check this in App.tsx to show a user-facing fallback.
 */
export const getDatabaseError = (): Error | null => _databaseError;

const getDatabase = (): Database => {
  if (_databaseError) {
    throw _databaseError;
  }

  if (!_database) {
    try {
      // The selection prevents a verified v4 pointer from being opened with
      // v3 models. BootGate must still run the native readonly preflight
      // before this function so a missing or stale target cannot be created.
      const databaseName = getActiveDatabaseName();
      const selection = selectDatabase(databaseName);
      const adapter = new SQLiteAdapter({
        dbName: databaseName,
        schema: selection.schema,
        ...(selection.migrations ? {migrations: selection.migrations} : {}),
        jsi: true,
        onSetUpError: error => {
          _databaseError = error instanceof Error ? error : new Error(String(error));
          if (__DEV__) {
            console.error('WatermelonDB setup error:', error);
          }
        },
      });

      // WatermelonDB 0.28 starts SQLite setup asynchronously. Await its
      // public setup promise so screens never race schema migration or a late
      // setup failure.
      _databaseReadyPromise = adapter.initializingPromise;

      _database = new Database({
        adapter,
        modelClasses: selection.modelClasses,
      });
      _databaseOwnership = 'opened';
    } catch (error) {
      _databaseError = error instanceof Error ? error : new Error(String(error));
      throw _databaseError;
    }
  }
  return _database;
};

export const database = new Proxy({} as Database, {
  get(_target, prop) {
    const db = getDatabase();
    const value = db[prop as keyof Database];
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  },
});

export const waitForDatabase = async (): Promise<void> => {
  getDatabase();
  await _databaseReadyPromise;
  if (_databaseError) {
    throw _databaseError;
  }
};

/**
 * Drops only the JS singleton after setup has settled. The SQLite file stays
 * intact, so a boot retry never deletes user data or bypasses migrations.
 */
export const resetDatabaseInstance = (options: {force?: boolean} = {}): void => {
  // An adopted target may still own a live JSI SQLite connection after a
  // marker/pointer failure. A normal boot retry must reuse it instead of
  // constructing a second adapter against the same file; tests or an
  // explicit process-reset path can pass force=true.
  if (_databaseOwnership === 'adopted' && !options.force) {
    return;
  }
  _database = null;
  _databaseError = null;
  _databaseReadyPromise = null;
  _databaseOwnership = 'none';
};

/**
 * Adopts a verified target instance produced before BootGate mounted the app.
 * This avoids opening a second JSI adapter against the same SQLite file.
 */
export const adoptDatabaseInstance = (verifiedDatabase: Database): void => {
  if (_database) {
    throw new Error('Cannot adopt a database after the production singleton has been opened');
  }
  _databaseError = null;
  _database = verifiedDatabase;
  _databaseReadyPromise = Promise.resolve();
  _databaseOwnership = 'adopted';
};

export {getDatabase};
export default database;

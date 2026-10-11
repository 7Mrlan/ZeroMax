import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import {schema} from './schema';
import {migrations} from './migrations';
import {User, Category, Expense, Currency, Debtor, Debt, Budget} from './models';
import {getActiveDatabaseName} from '../backend/migrations/activeDatabase';

let _database: Database | null = null;
let _databaseError: Error | null = null;
let _databaseReadyPromise: Promise<void> | null = null;

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
      const adapter = new SQLiteAdapter({
        dbName: getActiveDatabaseName(),
        schema,
        migrations,
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
        modelClasses: [User, Category, Expense, Currency, Debtor, Debt, Budget],
      });
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
export const resetDatabaseInstance = (): void => {
  _database = null;
  _databaseError = null;
  _databaseReadyPromise = null;
};

export {getDatabase};
export default database;

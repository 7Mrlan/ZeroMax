import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import {TARGET_DATABASE_NAME} from '../backend/migrations/activeDatabase';
import {targetSchema} from './targetSchema';
import {Budget, Currency, Debt, Debtor, Expense} from './models';
import Income from './models/Income';
import {TargetCategory, TargetUser} from './targetModels';

/**
 * Creates the isolated v4 database used by the copy driver.
 *
 * This factory is intentionally not imported by production database.ts yet:
 * callers must run native read-only preflight, create/backup the target, and
 * only then open this adapter. Opening it on an arbitrary legacy file would
 * reintroduce the reset risk this migration is designed to remove.
 */
export const createTargetDatabase = (
  dbName = 'watermelon_v4',
): {
  database: Database;
  initializingPromise: Promise<void>;
} => {
  if (dbName !== TARGET_DATABASE_NAME) {
    throw new Error('Target database factory only accepts the fixed v4 database name');
  }

  const adapter = new SQLiteAdapter({
    dbName,
    schema: targetSchema,
    jsi: true,
  });
  const database = new Database({
    adapter,
    modelClasses: [TargetUser, TargetCategory, Expense, Income, Currency, Debtor, Debt, Budget],
  });
  return {database, initializingPromise: adapter.initializingPromise};
};

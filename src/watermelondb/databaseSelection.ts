import type {AppSchema, Model, SchemaMigrations} from '@nozbe/watermelondb';
import type {Class} from '@nozbe/watermelondb/types';
import type {ActiveDatabaseName} from '../backend/migrations/activeDatabase';
import {schema} from './schema';
import {migrations} from './migrations';
import {targetSchema} from './targetSchema';
import {Budget, Currency, Debt, Debtor, Expense, User, Category} from './models';
import Income from './models/Income';
import {TargetCategory, TargetUser} from './targetModels';

export interface DatabaseSelection {
  schema: AppSchema;
  migrations?: SchemaMigrations;
  modelClasses: Class<Model>[];
}

/**
 * Selects the schema and model graph that belongs to the durable active
 * pointer. A v4 target must never be opened with the legacy v3 model set.
 */
export const selectDatabase = (databaseName: ActiveDatabaseName): DatabaseSelection => {
  if (databaseName === 'watermelon_v4') {
    return {
      schema: targetSchema,
      modelClasses: [TargetUser, TargetCategory, Expense, Income, Currency, Debtor, Debt, Budget],
    };
  }

  return {
    schema,
    migrations,
    modelClasses: [User, Category, Expense, Currency, Debtor, Debt, Budget],
  };
};

import {Q} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import type {SerializedQuery} from '@nozbe/watermelondb/Query';
import {INSPECTED_TABLES, type LegacySqlReader} from './legacyInspection';
import {legacyInspectionSchema} from './legacyInspectionSchema';
import {migrations as legacyMigrations} from '../../watermelondb/migrations';
import {LEGACY_DATABASE_NAME} from './activeDatabase';

interface AdapterResult<T> {
  value?: T;
  error?: Error;
}

export interface WatermelonLegacyReader extends LegacySqlReader {
  adapter: SQLiteAdapter;
}

/**
 * Opens an existing v3 database with the union inspection schema. It does not
 * create target tables or mutate rows; callers must run inspection before any
 * copy/activation operation.
 */
export const createWatermelonLegacyReader = (dbName = LEGACY_DATABASE_NAME): WatermelonLegacyReader => {
  if (dbName !== LEGACY_DATABASE_NAME) {
    throw new Error('Legacy inspection is restricted to the legacy database');
  }

  const adapter = new SQLiteAdapter({
    dbName,
    schema: legacyInspectionSchema,
    migrations: legacyMigrations,
    jsi: true,
  });

  const queryRaw = (sql: string): Promise<ReadonlyArray<Record<string, unknown>>> => {
    const normalized = sql.trim();
    const tableInfoMatch = normalized.match(/^PRAGMA table_info\("([a-z_]+)"\);$/);
    const isVersionQuery = normalized === 'PRAGMA user_version;';
    const isAllowedTableQuery =
      tableInfoMatch && INSPECTED_TABLES.includes(tableInfoMatch[1] as (typeof INSPECTED_TABLES)[number]);
    if (!isVersionQuery && !isAllowedTableQuery) {
      return Promise.reject(new Error('Legacy reader only allows schema metadata queries'));
    }

    return new Promise((resolve, reject) => {
      const query: SerializedQuery = {
        table: 'users',
        description: Q.buildQueryDescription([Q.unsafeSqlQuery(sql)]),
        associations: [],
      };
      adapter.unsafeQueryRaw(query, (result: AdapterResult<ReadonlyArray<Record<string, unknown>>>) => {
        if (result.error) {
          reject(result.error);
          return;
        }
        resolve(result.value ?? []);
      });
    });
  };

  return {adapter, initializingPromise: adapter.initializingPromise, queryRaw};
};

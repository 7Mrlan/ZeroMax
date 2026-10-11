import type {LegacySchemaSnapshot} from './legacySchema';

export const INSPECTED_TABLES = [
  'users',
  'categories',
  'expenses',
  'incomes',
  'currencies',
  'debtors',
  'debts',
  'budgets',
] as const;

export interface LegacySqlReader {
  initializingPromise: Promise<void>;
  queryRaw: (sql: string) => Promise<ReadonlyArray<Record<string, unknown>>>;
}

const quoteTableName = (table: string): string => `"${table.replaceAll('"', '""')}"`;

const readVersion = (rows: ReadonlyArray<Record<string, unknown>>): number => {
  const raw = rows[0]?.user_version;
  const version = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(version) ? version : -1;
};

/**
 * Reads only SQLite metadata. Table names come from the fixed allow-list above;
 * no user input is interpolated into SQL. The adapter must be initialized
 * before inspection so a setup failure cannot be mistaken for an empty schema.
 */
export const inspectLegacySqliteSchema = async (reader: LegacySqlReader): Promise<LegacySchemaSnapshot> => {
  await reader.initializingPromise;
  const versionRows = await reader.queryRaw('PRAGMA user_version;');
  const tables: Record<string, string[]> = {};

  for (const table of INSPECTED_TABLES) {
    const rows = await reader.queryRaw(`PRAGMA table_info(${quoteTableName(table)});`);
    if (rows.length > 0) {
      tables[table] = rows.map(row => row.name).filter((name): name is string => typeof name === 'string');
    }
  }

  return {version: readVersion(versionRows), tables};
};

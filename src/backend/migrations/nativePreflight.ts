import {NativeModules} from 'react-native';
import {z} from 'zod';
import type {ActiveDatabaseName} from './activeDatabase';
import {COPY_TABLES, type CopyDataset} from './copyVerification';
import type {DatabaseProbeResult} from './preflight';

/**
 * Contract implemented by the platform bridge in the next native step.
 * `probe` must open the Watermelon database path with SQLite READONLY flags;
 * it must never construct a Watermelon SQLiteAdapter or create a missing file.
 */
export interface ReadOnlySqliteBridge {
  probe: (databaseName: ActiveDatabaseName) => Promise<unknown>;
  readSnapshot?: (databaseName: ActiveDatabaseName) => Promise<unknown>;
}

const NativeProbeResultSchema = z.discriminatedUnion('status', [
  z.object({status: z.literal('missing')}),
  z.object({
    status: z.literal('ready'),
    version: z.number().int().nonnegative(),
    tables: z.record(z.string(), z.array(z.string())),
    indexes: z.record(z.string(), z.array(z.string())),
    integrity: z.enum(['ok', 'failed']),
  }),
]);

// A legacy source may legitimately omit incomes or budgets. The target
// read-back verifier remains strict about all COPY_TABLES being present; this
// boundary only validates that every returned table is allow-listed and every
// returned row has a stable string id.
const NativeRowsSchema = z
  .object(Object.fromEntries(COPY_TABLES.map(table => [table, z.array(z.object({id: z.string()}).passthrough())])))
  .partial()
  .strict();

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * Validates untrusted native output before it reaches migration decisions.
 * Invalid output fails closed instead of being interpreted as an empty file.
 */
export const normalizeNativeProbeResult = (value: unknown): DatabaseProbeResult => {
  const parsed = NativeProbeResultSchema.safeParse(value);
  if (!parsed.success) {
    return {kind: 'error', error: new Error('Read-only SQLite probe returned an invalid result')};
  }

  if (parsed.data.status === 'missing') {
    return {kind: 'missing'};
  }

  return {
    kind: 'metadata',
    snapshot: {version: parsed.data.version, tables: parsed.data.tables, indexes: parsed.data.indexes},
    integrity: parsed.data.integrity,
  };
};

/**
 * Calls the native read-only probe. There is intentionally no WatermelonDB
 * fallback: an unavailable bridge must block startup rather than risk opening
 * an unknown database with a writable adapter.
 */
export const probeDatabaseReadOnly = async (
  databaseName: ActiveDatabaseName,
  bridge: ReadOnlySqliteBridge | undefined = NativeModules.ZeroReadOnlySqlite as ReadOnlySqliteBridge | undefined,
): Promise<DatabaseProbeResult> => {
  if (databaseName !== 'watermelon' && databaseName !== 'watermelon_v4') {
    return {kind: 'error', error: new Error('Unsupported database name for read-only probe')};
  }

  if (!bridge || typeof bridge.probe !== 'function') {
    return {kind: 'error', error: new Error('ZeroReadOnlySqlite native module is unavailable')};
  }

  try {
    return normalizeNativeProbeResult(await bridge.probe(databaseName));
  } catch (error) {
    return {kind: 'error', error: asError(error)};
  }
};

/** Validates the row snapshot returned by the Android/iOS read-only bridge. */
export const normalizeNativeSnapshot = (value: unknown): CopyDataset => {
  const parsed = NativeRowsSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Read-only SQLite snapshot returned invalid rows');
  }
  return parsed.data as CopyDataset;
};

/** Reads source rows without constructing a writable Watermelon adapter. */
export const readDatabaseSnapshotReadOnly = async (
  databaseName: ActiveDatabaseName,
  bridge: ReadOnlySqliteBridge | undefined = NativeModules.ZeroReadOnlySqlite as ReadOnlySqliteBridge | undefined,
): Promise<CopyDataset> => {
  if (!bridge || typeof bridge.readSnapshot !== 'function') {
    throw new Error('ZeroReadOnlySqlite snapshot method is unavailable');
  }
  return normalizeNativeSnapshot(await bridge.readSnapshot(databaseName));
};

import {NativeModules} from 'react-native';
import {z} from 'zod';
import type {ActiveDatabaseName} from './activeDatabase';
import type {DatabaseProbeResult} from './preflight';

/**
 * Contract implemented by the platform bridge in the next native step.
 * `probe` must open the Watermelon database path with SQLite READONLY flags;
 * it must never construct a Watermelon SQLiteAdapter or create a missing file.
 */
export interface ReadOnlySqliteBridge {
  probe: (databaseName: ActiveDatabaseName) => Promise<unknown>;
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

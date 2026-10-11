import {COPY_TABLES, type CopyDataset, type CopyRow, type CopyTable} from '../backend/migrations/copyVerification';
import type {LegacyCopyDriver} from '../backend/migrations/copyDriver';

interface RawCollection {
  prepareCreateFromDirtyRaw: (raw: Record<string, unknown>) => unknown;
  query: () => {unsafeFetchRaw: () => Promise<ReadonlyArray<CopyRow>>};
}

interface WriterLike {
  batch: (records: ReadonlyArray<unknown>) => Promise<void>;
}

export interface TargetDatabaseLike {
  write: (work: (writer: WriterLike) => Promise<unknown>, description?: string) => Promise<unknown>;
  get: (table: string) => RawCollection;
}

const WRITE_ORDER: ReadonlyArray<CopyTable> = [
  'users',
  'categories',
  'currencies',
  'debtors',
  'expenses',
  'incomes',
  'debts',
  'budgets',
];

const readTargetSnapshot = async (database: TargetDatabaseLike): Promise<CopyDataset> => {
  const snapshot: CopyDataset = {};
  for (const table of COPY_TABLES) {
    snapshot[table] = await database.get(table).query().unsafeFetchRaw();
  }
  return snapshot;
};

/**
 * Adapts the isolated v4 Watermelon database to the copy driver.
 *
 * Watermelon's public writer commits one `batch()` transaction. If the
 * subsequent read-back verifier fails, the target is discarded/reset while it
 * is still inactive; JavaScript cannot roll back a batch after it resolves.
 */
export const createWatermelonTargetTransaction =
  (database: TargetDatabaseLike, discardTarget: () => Promise<void>): LegacyCopyDriver['runTargetTransaction'] =>
  async (expectedTarget, verify) => {
    try {
      await database.write(async writer => {
        const records: unknown[] = [];
        for (const table of WRITE_ORDER) {
          const collection = database.get(table);
          for (const row of expectedTarget[table] ?? []) {
            records.push(collection.prepareCreateFromDirtyRaw({...row}));
          }
        }
        if (records.length > 0) {
          await writer.batch(records);
        }

        return undefined;
      }, 'copy v4 target rows');

      const actualTarget = await readTargetSnapshot(database);
      return verify(actualTarget);
    } catch (error) {
      try {
        await discardTarget();
      } catch {
        // Preserve the original write/verification error. The migration state
        // machine will keep the legacy pointer active and retry recovery later.
      }
      throw error;
    }
  };

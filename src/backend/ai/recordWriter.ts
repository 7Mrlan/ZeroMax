import {database as productionDatabase} from '../../watermelondb/database';
import {completeAiTask, revertAiTask, type AiTask} from './taskQueue';

export interface AiRecordInput {
  localId: string;
  type: 'expense' | 'income';
  title: string;
  amount: number;
  categoryId: string;
  userId: string;
  date: string;
  description?: string;
}

interface RawCollection {
  find: (id: string) => Promise<unknown>;
  prepareCreateFromDirtyRaw: (raw: Record<string, unknown>) => unknown;
}

interface WriterLike {
  batch: (records: ReadonlyArray<unknown>) => Promise<void>;
}

export interface AiDatabaseLike {
  get: (table: string) => RawCollection;
  write: (work: (writer: WriterLike) => Promise<void>, description?: string) => Promise<void>;
}

const stableRecordId = (task: AiTask, item: AiRecordInput): string =>
  `${task.idempotencyKey}-${item.type}-${item.localId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);

export const writeAiRecords = async (
  task: AiTask,
  items: readonly AiRecordInput[],
  database: AiDatabaseLike = productionDatabase as unknown as AiDatabaseLike,
): Promise<string[]> => {
  const recordIds = items.map(item => stableRecordId(task, item));
  await database.write(async writer => {
    const prepared: unknown[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const id = recordIds[index];
      const collection = database.get(item.type === 'income' ? 'incomes' : 'expenses');
      try {
        await collection.find(id);
        continue;
      } catch {
        // Missing stable id means this item has not been committed yet.
      }
      prepared.push(
        collection.prepareCreateFromDirtyRaw({
          id,
          title: item.title,
          amount: item.amount,
          category_id: item.categoryId,
          user_id: item.userId,
          date: item.date,
          ...(item.type === 'expense' ? {description: item.description ?? ''} : {}),
        }),
      );
    }
    if (prepared.length > 0) await writer.batch(prepared);
  }, 'ai idempotent record write');

  // Keep the table kind with each key. The stable ID alone cannot prove which
  // of the two tables is safe to undo if a legacy/imported database reuses an
  // ID, while the kind-prefixed key remains deterministic and PII-free.
  completeAiTask(
    task.taskId,
    items.map((item, index) => `${item.type}:${recordIds[index]}`),
  );
  return recordIds;
};

export const aiRecordId = stableRecordId;

const parseRecordKey = (key: string): {table: 'expenses' | 'incomes'; id: string} | null => {
  const separator = key.indexOf(':');
  if (separator <= 0 || separator === key.length - 1) return null;
  const kind = key.slice(0, separator);
  if (kind !== 'expense' && kind !== 'income') return null;
  return {table: kind === 'income' ? 'incomes' : 'expenses', id: key.slice(separator + 1)};
};

const isMissingRecordError = (error: unknown): boolean =>
  error instanceof Error && /(?:not found|does not exist|missing)/i.test(error.message);

/**
 * Removes all records created by one completed AI task in one writer. Missing
 * rows are treated as already undone, which makes a retry after a crash safe.
 * Raw legacy keys without a kind prefix are searched in both collections only
 * as a migration fallback; new tasks always persist the explicit prefix.
 */
export const undoAiRecords = async (
  task: AiTask,
  database: AiDatabaseLike = productionDatabase as unknown as AiDatabaseLike,
): Promise<AiTask | null> => {
  if (task.status === 'reverted') return task;
  if (task.status !== 'created') throw new Error('Only a completed AI task can be undone');

  await database.write(async writer => {
    const prepared: unknown[] = [];
    const keys = [...new Set(task.createdRecordKeys)];
    for (const key of keys) {
      const parsed = parseRecordKey(key);
      const candidates = parsed ? [parsed] : (['expenses', 'incomes'] as const).map(table => ({table, id: key}));
      for (const candidate of candidates) {
        try {
          const record = (await database.get(candidate.table).find(candidate.id)) as {
            prepareDestroyPermanently?: () => unknown;
          };
          if (typeof record.prepareDestroyPermanently !== 'function') {
            throw new Error('AI record does not support permanent deletion');
          }
          prepared.push(record.prepareDestroyPermanently());
          break;
        } catch (error) {
          // A missing row is already undone. Surface adapter errors and
          // malformed records so an incomplete undo cannot be marked done.
          if (error instanceof Error && error.message === 'AI record does not support permanent deletion') {
            throw error;
          }
          if (!isMissingRecordError(error)) throw error;
        }
      }
    }
    if (prepared.length > 0) await writer.batch(prepared);
  }, 'ai undo records');

  return revertAiTask(task.taskId);
};

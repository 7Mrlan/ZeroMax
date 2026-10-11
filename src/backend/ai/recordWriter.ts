import {database as productionDatabase} from '../../watermelondb/database';
import {completeAiTask, type AiTask} from './taskQueue';

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

interface AiDatabaseLike {
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

  completeAiTask(task.taskId, recordIds);
  return recordIds;
};

export const aiRecordId = stableRecordId;

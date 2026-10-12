let mockStored: string | null = null;

jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn(() => mockStored),
    setItemSync: jest.fn((_key: string, value: string) => {
      mockStored = value;
    }),
  },
}));

import {createAiTask} from '../taskQueue';
import {aiRecordId, undoAiRecords, writeAiRecords} from '../recordWriter';
import {claimNextAiTask, completeAiTask} from '../taskQueue';
import StorageService from '../../../utils/asyncStorageService';

const makeDatabase = () => {
  const existing = new Set<string>();
  const prepared: unknown[] = [];
  const database = {
    get: jest.fn((table: string) => ({
      find: jest.fn(async (id: string) => {
        if (!existing.has(`${table}:${id}`)) throw new Error('not found');
        return {id};
      }),
      prepareCreateFromDirtyRaw: jest.fn((raw: Record<string, unknown>) => ({table, raw})),
    })),
    write: jest.fn(
      async (work: (writer: {batch: (records: ReadonlyArray<unknown>) => Promise<void>}) => Promise<void>) =>
        work({
          batch: async records => {
            prepared.push(...records);
          },
        }),
    ),
  };
  return {database, existing, prepared};
};

const storage = StorageService as jest.Mocked<typeof StorageService>;

describe('AI idempotent record writer', () => {
  beforeEach(() => {
    mockStored = null;
  });

  it('uses stable IDs and writes expense/income in one writer', async () => {
    const task = createAiTask('lunch and salary', 'prompt');
    const {database, prepared} = makeDatabase();
    const items = [
      {
        localId: 'a',
        type: 'expense' as const,
        title: 'Lunch',
        amount: 10,
        categoryId: 'c1',
        userId: 'u1',
        date: '2026-01-01',
      },
      {
        localId: 'b',
        type: 'income' as const,
        title: 'Salary',
        amount: 100,
        categoryId: 'c2',
        userId: 'u1',
        date: '2026-01-01',
      },
    ];
    const ids = await writeAiRecords(task, items, database);
    expect(ids).toEqual([aiRecordId(task, items[0]), aiRecordId(task, items[1])]);
    expect(prepared).toHaveLength(2);
    expect(database.write).toHaveBeenCalledWith(expect.any(Function), 'ai idempotent record write');
  });

  it('does not prepare an already committed stable id', async () => {
    const task = createAiTask('lunch', 'prompt');
    const item = {
      localId: 'a',
      type: 'expense' as const,
      title: 'Lunch',
      amount: 10,
      categoryId: 'c1',
      userId: 'u1',
      date: '2026-01-01',
    };
    const {database, existing, prepared} = makeDatabase();
    existing.add(`expenses:${aiRecordId(task, item)}`);
    await writeAiRecords(task, [item], database);
    expect(prepared).toHaveLength(0);
  });

  it('persists the manifest before the database writer runs', async () => {
    const task = createAiTask('lunch', 'prompt');
    claimNextAiTask();
    const writes: string[] = [];
    storage.setItemSync.mockImplementation((_key, value) => {
      writes.push(value);
      mockStored = value;
    });
    const {database} = makeDatabase();
    await writeAiRecords(
      task,
      [
        {
          localId: '0:expense',
          type: 'expense',
          title: 'Lunch',
          amount: 10,
          categoryId: 'c1',
          userId: 'u1',
          date: '2026-01-01',
        },
      ],
      database,
    );
    const committed = writes
      .map(value => JSON.parse(value) as Array<{status: string; recordsManifest?: unknown[]}>)
      .flat()
      .find(taskState => taskState.status === 'committing');
    expect(committed?.recordsManifest).toHaveLength(1);
  });

  it('undoes all task records in one writer and is safe to retry', async () => {
    const task = createAiTask('lunch and salary', 'prompt');
    claimNextAiTask();
    const expenseId = aiRecordId(task, {
      localId: 'a',
      type: 'expense',
      title: 'Lunch',
      amount: 10,
      categoryId: 'c1',
      userId: 'u1',
      date: '2026-01-01',
    });
    const incomeId = aiRecordId(task, {
      localId: 'b',
      type: 'income',
      title: 'Salary',
      amount: 100,
      categoryId: 'c2',
      userId: 'u1',
      date: '2026-01-01',
    });
    const recordKeys = [`expense:${expenseId}`, `income:${incomeId}`];
    completeAiTask(task.taskId, recordKeys);
    const taskWithRecords = {...task, status: 'created' as const, createdRecordKeys: recordKeys};
    const destroyed: string[] = [];
    const database = {
      get: jest.fn((table: string) => ({
        find: jest.fn(async (id: string) => ({
          prepareDestroyPermanently: () => {
            destroyed.push(`${table}:${id}`);
            return `${table}:${id}`;
          },
        })),
        prepareCreateFromDirtyRaw: jest.fn(),
      })),
      write: jest.fn(
        async (work: (writer: {batch: (records: ReadonlyArray<unknown>) => Promise<void>}) => Promise<void>) =>
          work({batch: async () => undefined}),
      ),
    };

    const reverted = await undoAiRecords(taskWithRecords, database);
    expect(reverted?.status).toBe('reverted');
    expect(destroyed).toEqual([`expenses:${expenseId}`, `incomes:${incomeId}`]);
    await expect(undoAiRecords(reverted!, database)).resolves.toEqual(reverted);
    expect(database.write).toHaveBeenCalledTimes(1);
  });

  it('does not mark an undo complete when the writer cannot delete a record', async () => {
    const task = createAiTask('lunch', 'prompt');
    const completed = {...task, status: 'created' as const, createdRecordKeys: ['expense:stable-id']};
    const database = {
      get: () => ({find: async () => ({}), prepareCreateFromDirtyRaw: () => undefined}),
      write: async (work: (writer: {batch: (records: ReadonlyArray<unknown>) => Promise<void>}) => Promise<void>) =>
        work({batch: async () => undefined}),
    };
    await expect(undoAiRecords(completed, database)).rejects.toThrow('does not support permanent deletion');
  });
});

jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {getItemSync: jest.fn(() => null), setItemSync: jest.fn()},
}));

import {createAiTask} from '../taskQueue';
import {aiRecordId, writeAiRecords} from '../recordWriter';

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

describe('AI idempotent record writer', () => {
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
});

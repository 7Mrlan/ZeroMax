jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    setBoolean: jest.fn(),
    getBoolean: jest.fn(() => true),
  },
}));

import {runAiTask} from '../coordinator';
import {claimNextAiTask, createAiTask} from '../taskQueue';
import StorageService from '../../../utils/asyncStorageService';

const storage = StorageService as jest.Mocked<typeof StorageService>;
let stored: string | null;

const category = (kind: 'expense' | 'income', name: string) => ({
  id: `${kind}-category`,
  name,
  categoryStatus: true,
  userId: 'u1',
  icon: '',
  color: '#fff',
  parentId: '',
  kind,
});

const database = {
  get: (table: string) => ({
    find: async () => {
      throw new Error('not found');
    },
    prepareCreateFromDirtyRaw: (raw: Record<string, unknown>) => ({table, raw}),
  }),
  write: async (work: (writer: {batch: (records: ReadonlyArray<unknown>) => Promise<void>}) => Promise<void>) =>
    work({batch: async () => undefined}),
};

describe('AI task coordinator', () => {
  beforeEach(() => {
    stored = null;
    jest.clearAllMocks();
    storage.getBoolean.mockReturnValue(true);
    storage.getItemSync.mockImplementation(key => {
      if (key === 'ai.apiBaseUrl') return 'https://api.example.com/v1';
      if (key === 'ai.modelName') return 'test';
      return stored;
    });
    storage.setItemSync.mockImplementation((_key, value) => {
      stored = value;
    });
  });

  it('parses, resolves categories, and writes through the idempotent writer', async () => {
    const task = createAiTask('lunch', 'prompt');
    claimNextAiTask();
    const result = await runAiTask(task, {
      userId: 'u1',
      categories: async () => [category('expense', 'Food')],
      secretStore: {get: () => 'secret', set: jest.fn(), clear: jest.fn()},
      allowedHosts: ['api.example.com'],
      database,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: {get: () => null},
        text: async () =>
          '{"items":[{"type":"expense","title":"Lunch","amount":10,"categoryName":"Food","categoryHint":"","date":"2026-01-01","description":""}]}',
      }),
    });
    expect(result.status).toBe('created');
  });

  it('marks a task failed when category resolution is unsafe', async () => {
    const task = createAiTask('lunch', 'prompt');
    claimNextAiTask();
    await expect(
      runAiTask(task, {
        userId: 'u1',
        categories: async () => [],
        secretStore: {get: () => 'secret', set: jest.fn(), clear: jest.fn()},
        allowedHosts: ['api.example.com'],
        database,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: {get: () => null},
          text: async () =>
            '{"items":[{"type":"expense","title":"Lunch","amount":10,"categoryName":"Food","categoryHint":"","date":"2026-01-01","description":""}]}',
        }),
      }),
    ).rejects.toThrow('category');
  });
});

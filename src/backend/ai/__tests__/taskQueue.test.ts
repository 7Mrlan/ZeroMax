jest.mock('../../../utils/asyncStorageService', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
  },
}));

import StorageService from '../../../utils/asyncStorageService';
import {
  claimNextAiTask,
  cancelQueuedAiTask,
  completeAiTask,
  createAiTask,
  recordIdempotencyKey,
  requeueInterruptedAiTasks,
} from '../taskQueue';

const storage = StorageService as jest.Mocked<typeof StorageService>;
let stored: string | null;

describe('AI task queue', () => {
  beforeEach(() => {
    stored = null;
    jest.clearAllMocks();
    storage.getItemSync.mockImplementation(() => stored);
    storage.setItemSync.mockImplementation((_key, value) => {
      stored = value;
    });
  });

  it('creates a task, claims it, and requeues an interrupted run', () => {
    const task = createAiTask(' lunch  ', 'prompt');
    expect(task.status).toBe('queued');
    expect(claimNextAiTask()?.status).toBe('running');
    expect(requeueInterruptedAiTasks()[0].status).toBe('queued');
  });

  it('makes completion idempotent and deduplicates created records', () => {
    const task = createAiTask('salary', 'prompt');
    claimNextAiTask();
    const completed = completeAiTask(task.taskId, ['expense:e1', 'expense:e1', 'income:i1']);
    expect(completed?.createdRecordKeys).toEqual(['expense:e1', 'income:i1']);
    expect(completeAiTask(task.taskId, ['expense:other'])).toEqual(completed);
  });

  it('uses the task idempotency key instead of raw user input', () => {
    const task = createAiTask('same text', 'prompt');
    expect(recordIdempotencyKey(task, 'item-1')).toMatch(/^ai-[^:]+:item-1$/);
    expect(storage.setItemSync).toHaveBeenCalled();
  });

  it('cancels a queued task without changing a claimed task', () => {
    const queued = createAiTask('queued', 'prompt');
    expect(cancelQueuedAiTask(queued.taskId)?.status).toBe('cancelled');

    const running = createAiTask('running', 'prompt');
    claimNextAiTask();
    expect(cancelQueuedAiTask(running.taskId)?.status).toBe('running');
  });
});

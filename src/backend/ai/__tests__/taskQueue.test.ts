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
  getAiTaskStoreError,
  getAiTasks,
  prepareAiTaskCommit,
  recordIdempotencyKey,
  requeueInterruptedAiTasks,
  revertAiTask,
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

  it('reverts a completed task once and keeps the transition idempotent', () => {
    const task = createAiTask('lunch', 'prompt');
    claimNextAiTask();
    completeAiTask(task.taskId, ['expense:e1']);

    expect(revertAiTask(task.taskId)?.status).toBe('reverted');
    expect(revertAiTask(task.taskId)?.status).toBe('reverted');
  });

  it('returns a stable external-store snapshot and rejects the 21st task', () => {
    for (let index = 0; index < 20; index += 1) createAiTask(`task-${index}`, 'prompt');
    expect(getAiTasks()).toBe(getAiTasks());
    expect(() => createAiTask('task-over-capacity', 'prompt')).toThrow('full');
  });

  it('persists a manifest before writing and requeues committing work after restart', () => {
    const task = createAiTask('lunch', 'prompt');
    claimNextAiTask();
    const manifest = [
      {
        recordId: 'ai-record-1',
        localId: '0:expense',
        type: 'expense' as const,
        title: 'Lunch',
        amount: 10,
        categoryId: 'c1',
        userId: 'u1',
        date: '2026-01-01',
      },
    ];
    expect(prepareAiTaskCommit(task.taskId, manifest)?.status).toBe('committing');
    expect(requeueInterruptedAiTasks().find(item => item.taskId === task.taskId)?.status).toBe('queued');
    const claimed = claimNextAiTask();
    expect(claimed?.recordsManifest).toEqual(manifest);
    expect(completeAiTask(task.taskId, manifest)?.status).toBe('created');
  });

  it('preserves corrupted storage and refuses to overwrite it implicitly', () => {
    stored = '{not-json';
    expect(getAiTasks()).toEqual([]);
    expect(getAiTaskStoreError()).toContain('corrupted');
    expect(() => createAiTask('must-not-overwrite', 'prompt')).toThrow('corrupted');
    expect(storage.setItemSync).not.toHaveBeenCalled();
  });
});

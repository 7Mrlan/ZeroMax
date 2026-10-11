import {nanoid} from 'nanoid';
import {z} from 'zod';
import StorageService from '../../utils/asyncStorageService';

export type AiTaskStatus = 'queued' | 'running' | 'created' | 'failed' | 'cancelled';

export interface AiTask {
  version: 1;
  taskId: string;
  idempotencyKey: string;
  input: string;
  prompt: string;
  status: AiTaskStatus;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  createdRecordKeys: string[];
}

const TASKS_KEY = 'ai.tasks.v1';
const MAX_TASKS = 20;
const listeners = new Set<() => void>();
const TaskSchema = z
  .object({
    version: z.literal(1),
    taskId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(128),
    input: z.string().max(10_000),
    prompt: z.string().max(50_000),
    status: z.enum(['queued', 'running', 'created', 'failed', 'cancelled']),
    createdAt: z.string(),
    updatedAt: z.string(),
    errorMessage: z.string().max(1_000).optional(),
    createdRecordKeys: z.array(z.string().max(256)).max(100),
  })
  .strict();
const TasksSchema = z.array(TaskSchema).max(MAX_TASKS);

const now = (): string => new Date().toISOString();

const readTasks = (): AiTask[] => {
  const raw = StorageService.getItemSync(TASKS_KEY);
  if (!raw) return [];
  try {
    const parsed = TasksSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const writeTasks = (tasks: AiTask[]): void => {
  StorageService.setItemSync(TASKS_KEY, JSON.stringify(tasks.slice(0, MAX_TASKS)));
  listeners.forEach(listener => listener());
};

export const subscribeAiTasks = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getAiTasks = (): AiTask[] =>
  [...readTasks()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

export const createAiTask = (input: string, prompt: string): AiTask => {
  const trimmedInput = input.trim();
  if (!trimmedInput) throw new Error('AI task input cannot be empty');
  const timestamp = now();
  const task: AiTask = {
    version: 1,
    taskId: `ai-task-${nanoid(16)}`,
    idempotencyKey: `ai-${nanoid(24)}`,
    input: trimmedInput,
    prompt,
    status: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
    createdRecordKeys: [],
  };
  writeTasks([task, ...readTasks()]);
  return task;
};

export const claimNextAiTask = (): AiTask | null => {
  const tasks = readTasks();
  const next = tasks.find(task => task.status === 'queued');
  if (!next) return null;
  const claimed = {...next, status: 'running' as const, updatedAt: now()};
  writeTasks(tasks.map(task => (task.taskId === next.taskId ? claimed : task)));
  return claimed;
};

export const requeueInterruptedAiTasks = (): AiTask[] => {
  const tasks = readTasks();
  const timestamp = now();
  const updated = tasks.map(task =>
    task.status === 'running' ? {...task, status: 'queued' as const, updatedAt: timestamp} : task,
  );
  writeTasks(updated);
  return getAiTasks();
};

export const completeAiTask = (taskId: string, createdRecordKeys: string[]): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current) return null;
  if (current.status === 'created') return current;
  const completed = {
    ...current,
    status: 'created' as const,
    createdRecordKeys: [...new Set(createdRecordKeys)],
    updatedAt: now(),
  };
  writeTasks(tasks.map(task => (task.taskId === taskId ? completed : task)));
  return completed;
};

export const failAiTask = (taskId: string, errorMessage: string): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current) return null;
  const failed = {...current, status: 'failed' as const, errorMessage: errorMessage.slice(0, 1_000), updatedAt: now()};
  writeTasks(tasks.map(task => (task.taskId === taskId ? failed : task)));
  return failed;
};

export const retryAiTask = (taskId: string): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current || current.status !== 'failed') return current ?? null;
  const retried = {...current, status: 'queued' as const, errorMessage: undefined, updatedAt: now()};
  writeTasks(tasks.map(task => (task.taskId === taskId ? retried : task)));
  return retried;
};

/** Cancels only a queued task; a running request needs an AbortSignal owner. */
export const cancelQueuedAiTask = (taskId: string): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current || current.status !== 'queued') return current ?? null;
  const cancelled = {...current, status: 'cancelled' as const, updatedAt: now()};
  writeTasks(tasks.map(task => (task.taskId === taskId ? cancelled : task)));
  return cancelled;
};

/** Marks a queued or running task cancelled; the coordinator's AbortSignal stops active I/O. */
export const cancelAiTask = (taskId: string): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current || current.status === 'created' || current.status === 'failed' || current.status === 'cancelled') {
    return current ?? null;
  }
  const cancelled = {...current, status: 'cancelled' as const, updatedAt: now()};
  writeTasks(tasks.map(task => (task.taskId === taskId ? cancelled : task)));
  return cancelled;
};

export const recordIdempotencyKey = (task: Pick<AiTask, 'idempotencyKey'>, itemLocalId: string): string =>
  `${task.idempotencyKey}:${itemLocalId}`;

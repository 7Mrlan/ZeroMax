import {nanoid} from 'nanoid';
import {z} from 'zod';
import StorageService from '../../utils/asyncStorageService';

export type AiRecordType = 'expense' | 'income';
export type AiTaskStatus = 'queued' | 'running' | 'committing' | 'created' | 'failed' | 'cancelled' | 'reverted';

export interface AiRecordManifest {
  recordId: string;
  localId: string;
  type: AiRecordType;
  title: string;
  amount: number;
  categoryId: string;
  userId: string;
  date: string;
  description?: string;
}

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
  recordsManifest?: AiRecordManifest[];
}

const TASKS_KEY = 'ai.tasks.v1';
const MAX_TASKS = 20;
const listeners = new Set<() => void>();
const ManifestSchema = z
  .object({
    recordId: z.string().min(1).max(180),
    localId: z.string().min(1).max(180),
    type: z.enum(['expense', 'income']),
    title: z.string().min(1).max(200),
    amount: z.number().finite().positive(),
    categoryId: z.string().min(1).max(256),
    userId: z.string().min(1).max(256),
    date: z.string().min(1).max(64),
    description: z.string().max(500).optional(),
  })
  .strict();
const TaskSchema = z
  .object({
    version: z.literal(1),
    taskId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(128),
    input: z.string().max(10_000),
    prompt: z.string().max(50_000),
    status: z.enum(['queued', 'running', 'committing', 'created', 'failed', 'cancelled', 'reverted']),
    createdAt: z.string(),
    updatedAt: z.string(),
    errorMessage: z.string().max(1_000).optional(),
    createdRecordKeys: z.array(z.string().max(256)).max(100),
    recordsManifest: z.array(ManifestSchema).max(100).optional(),
  })
  .strict();
const TasksSchema = z.array(TaskSchema).max(MAX_TASKS);

const now = (): string => new Date().toISOString();

let cachedRaw: string | null | undefined;
let cachedTasks: AiTask[] = [];
let cachedError: string | null = null;
let cachedSnapshotRaw: string | null | undefined;
let cachedSnapshot: AiTask[] = [];

const readTasks = (): AiTask[] => {
  const raw = StorageService.getItemSync(TASKS_KEY);
  if (raw === cachedRaw) return cachedTasks;
  cachedRaw = raw;
  cachedError = null;
  if (!raw) {
    cachedTasks = [];
    cachedSnapshotRaw = undefined;
    return cachedTasks;
  }
  try {
    const parsed = TasksSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      cachedTasks = [];
      cachedError = 'AI task storage is corrupted and needs recovery';
    } else {
      cachedTasks = parsed.data;
    }
  } catch {
    cachedTasks = [];
    cachedError = 'AI task storage is corrupted and needs recovery';
  }
  cachedSnapshotRaw = undefined;
  return cachedTasks;
};

const writeTasks = (tasks: AiTask[]): void => {
  if (tasks.length > MAX_TASKS) throw new Error('AI task queue is full');
  const serialized = JSON.stringify(tasks);
  StorageService.setItemSync(TASKS_KEY, serialized);
  cachedRaw = serialized;
  cachedTasks = tasks;
  cachedError = null;
  cachedSnapshotRaw = undefined;
  listeners.forEach(listener => listener());
};

const recordKey = (manifest: Pick<AiRecordManifest, 'type' | 'recordId'>): string =>
  `${manifest.type}:${manifest.recordId}`;

const manifestEqual = (left: readonly AiRecordManifest[], right: readonly AiRecordManifest[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const subscribeAiTasks = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Stable snapshot required by useSyncExternalStore; it changes only after a write. */
export const getAiTasks = (): AiTask[] => {
  readTasks();
  if (cachedSnapshotRaw === cachedRaw) return cachedSnapshot;
  cachedSnapshot = Object.freeze(
    [...cachedTasks].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  ) as unknown as AiTask[];
  cachedSnapshotRaw = cachedRaw;
  return cachedSnapshot;
};

export const getAiTaskStoreError = (): string | null => {
  readTasks();
  return cachedError;
};

export const createAiTask = (input: string, prompt: string): AiTask => {
  const tasks = readTasks();
  if (cachedError) throw new Error(cachedError);
  if (tasks.length >= MAX_TASKS) throw new Error('AI task queue is full');
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
  writeTasks([task, ...tasks]);
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
  const interrupted = tasks.some(task => task.status === 'running' || task.status === 'committing');
  if (!interrupted) return getAiTasks();
  const timestamp = now();
  const updated = tasks.map(task =>
    task.status === 'running' || task.status === 'committing'
      ? {...task, status: 'queued' as const, updatedAt: timestamp}
      : task,
  );
  writeTasks(updated);
  return getAiTasks();
};

export const prepareAiTaskCommit = (taskId: string, manifest: readonly AiRecordManifest[]): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current) return null;
  if (current.status === 'created') return current;
  if (current.status === 'committing') {
    if (!current.recordsManifest || !manifestEqual(current.recordsManifest, manifest)) {
      throw new Error('AI commit manifest changed during recovery');
    }
    return current;
  }
  if (current.status !== 'running' && current.status !== 'queued') {
    throw new Error(`AI task cannot commit from ${current.status} state`);
  }
  const recordsManifest = [...manifest];
  const committing: AiTask = {
    ...current,
    status: 'committing',
    recordsManifest,
    createdRecordKeys: recordsManifest.map(recordKey),
    updatedAt: now(),
  };
  writeTasks(tasks.map(task => (task.taskId === taskId ? committing : task)));
  return committing;
};

export const completeAiTask = (
  taskId: string,
  createdRecordKeysOrManifest: readonly string[] | readonly AiRecordManifest[],
): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current) return null;
  if (current.status === 'created') return current;
  const first = createdRecordKeysOrManifest[0];
  const manifest =
    typeof first === 'string' ? current.recordsManifest : (createdRecordKeysOrManifest as AiRecordManifest[]);
  const createdRecordKeys =
    typeof first === 'string'
      ? [...new Set(createdRecordKeysOrManifest as string[])]
      : (createdRecordKeysOrManifest as AiRecordManifest[]).map(recordKey);
  const completed: AiTask = {
    ...current,
    status: 'created' as const,
    recordsManifest: manifest ? [...manifest] : current.recordsManifest,
    createdRecordKeys,
    updatedAt: now(),
  };
  writeTasks(tasks.map(task => (task.taskId === taskId ? completed : task)));
  return completed;
};

/** Removes only terminal tasks whose records are no longer active. */
export const removeAiTask = (taskId: string): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current || !['failed', 'cancelled', 'reverted'].includes(current.status)) return null;
  writeTasks(tasks.filter(task => task.taskId !== taskId));
  return current;
};

/**
 * Marks a completed task as reverted after its stable records have been removed.
 * The state transition is deliberately idempotent so a retry after a process
 * interruption cannot make a successful undo look like a new failure.
 */
export const revertAiTask = (taskId: string): AiTask | null => {
  const tasks = readTasks();
  const current = tasks.find(task => task.taskId === taskId);
  if (!current || current.status === 'reverted') return current ?? null;
  if (current.status !== 'created') return current;
  const reverted = {...current, status: 'reverted' as const, updatedAt: now()};
  writeTasks(tasks.map(task => (task.taskId === taskId ? reverted : task)));
  return reverted;
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
  if (
    !current ||
    current.status === 'created' ||
    current.status === 'failed' ||
    current.status === 'cancelled' ||
    current.status === 'reverted'
  ) {
    return current ?? null;
  }
  const cancelled = {...current, status: 'cancelled' as const, updatedAt: now()};
  writeTasks(tasks.map(task => (task.taskId === taskId ? cancelled : task)));
  return cancelled;
};

export const recordIdempotencyKey = (task: Pick<AiTask, 'idempotencyKey'>, itemLocalId: string): string =>
  `${task.idempotencyKey}:${itemLocalId}`;

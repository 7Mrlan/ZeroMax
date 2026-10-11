import {getAiSettings, type AiSecretStore} from './settings';
import {buildAiParserPrompt, type AiParserResponse} from './parser';
import {requestAiCompletion, type AiFetch} from './network';
import {claimNextAiTask, failAiTask, getAiTasks, type AiTask} from './taskQueue';
import {writeAiRecords, type AiDatabaseLike, type AiRecordInput} from './recordWriter';
import type {CategoryData} from '../../watermelondb/services';

export interface AiTaskCoordinatorDependencies {
  userId: string;
  categories: () => Promise<CategoryData[]>;
  secretStore: AiSecretStore;
  allowedHosts: readonly string[];
  fetchImpl?: AiFetch;
  database?: AiDatabaseLike;
}

const findCategory = (categories: CategoryData[], type: 'expense' | 'income', name: string): CategoryData | null => {
  const normalized = name.trim().toLowerCase();
  return (
    categories.find(
      category =>
        category.categoryStatus &&
        category.kind === type &&
        (category.name.toLowerCase() === normalized ||
          `${category.parentId ?? ''}·${category.name}`.toLowerCase() === normalized),
    ) ?? null
  );
};

const toRecordInputs = (response: AiParserResponse, categories: CategoryData[], userId: string): AiRecordInput[] => {
  const records: AiRecordInput[] = [];
  for (const item of response.items) {
    if (item.amount === null) throw new Error(`AI item ${item.title} has no valid amount`);
    const category = findCategory(categories, item.type, item.categoryName);
    if (!category) throw new Error(`AI item ${item.title} has no matching ${item.type} category`);
    records.push({
      localId: `${item.type}:${item.date}:${item.title}:${item.amount}`,
      type: item.type,
      title: item.title,
      amount: item.amount,
      categoryId: category.id,
      userId,
      date: item.date,
      description: item.description,
    });
  }
  return records;
};

export const runAiTask = async (task: AiTask, dependencies: AiTaskCoordinatorDependencies): Promise<AiTask> => {
  try {
    const settings = getAiSettings();
    const categories = await dependencies.categories();
    const categoryNames = {
      expense: categories.filter(category => category.kind === 'expense').map(category => category.name),
      income: categories.filter(category => category.kind === 'income').map(category => category.name),
    };
    const prompt = task.prompt || buildAiParserPrompt(task.input, categoryNames, task.createdAt);
    const response = await requestAiCompletion(
      {...settings, enabled: true},
      dependencies.secretStore,
      prompt,
      dependencies.allowedHosts,
      dependencies.fetchImpl,
    );
    const records = toRecordInputs(response, categories, dependencies.userId);
    await writeAiRecords(task, records, dependencies.database);
    return getAiTasks().find(current => current.taskId === task.taskId) ?? task;
  } catch (error) {
    failAiTask(task.taskId, error instanceof Error ? error.message : String(error));
    throw error;
  }
};

export const runNextAiTask = async (dependencies: AiTaskCoordinatorDependencies): Promise<AiTask | null> => {
  const task = claimNextAiTask();
  if (!task) return null;
  return runAiTask(task, dependencies);
};

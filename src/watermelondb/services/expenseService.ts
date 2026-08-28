import {Q} from '@nozbe/watermelondb';
import {database} from '../database';
import Expense from '../models/Expense';
import Category from '../models/Category';

// Type for expense data
export interface ExpenseData {
  id: string;
  title: string;
  amount: number;
  description?: string;
  categoryId: string;
  userId: string;
  date: string;
}

// Extended expense type with populated category
export interface ExpenseWithCategory extends ExpenseData {
  category?: {
    id: string;
    name: string;
    icon?: string;
    color: string;
  };
}

type CategoryInfo = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

const buildCategoryMap = async (userId: string): Promise<Map<string, CategoryInfo>> => {
  // Intentionally queries ALL categories (no category_status filter) so that
  // expenses under soft-deleted categories still resolve their name/icon/color.
  // Do NOT add a status filter here — it would break historical categorization.
  const categories = await database
    .get<Category>('categories')
    .query(Q.where('user_id', userId))
    .fetch();
  return new Map(
    categories.map(cat => [
      cat.id,
      {id: cat.id, name: cat.name, icon: cat.icon ?? '', color: cat.color ?? '#808080'},
    ]),
  );
};

const mapExpenseWithCategory = (
  e: Expense,
  categoryMap: Map<string, CategoryInfo>,
): ExpenseWithCategory => ({
  id: e.id,
  title: e.title,
  amount: e.amount,
  description: e.description ?? '',
  categoryId: e.categoryId,
  userId: e.userId,
  date: e.date,
  category: categoryMap.get(e.categoryId),
});

const mapExpenseToData = (e: Expense): ExpenseData => ({
  id: e.id,
  title: e.title,
  amount: e.amount,
  description: e.description ?? '',
  categoryId: e.categoryId,
  userId: e.userId,
  date: e.date,
});

/**
 * Creates a new expense
 */
export const createExpense = async (
  userId: string,
  title: string,
  amount: number,
  description: string,
  categoryId: string,
  date: string,
): Promise<string> => {
  let expenseId = '';
  await database.write(async () => {
    // Uses WatermelonDB auto-generated ID (library default). This is intentional;
    // other services use nanoid(24) for historical reasons. Both are valid.
    const expense = await database.get<Expense>('expenses').create(exp => {
      exp.title = title;
      exp.amount = amount;
      exp.description = description || '';
      exp.categoryId = categoryId;
      exp.userId = userId;
      exp.date = date;
    });
    expenseId = expense.id;
  });
  return expenseId;
};

/**
 * Updates an expense by ID
 */
export const updateExpenseById = async (
  expenseId: string,
  categoryId?: string,
  newTitle?: string,
  newAmount?: number,
  newDescription?: string,
  newDate?: string,
): Promise<void> => {
  await database.write(async () => {
    const expense = await database.get<Expense>('expenses').find(expenseId);
    await expense.update(exp => {
      if (newTitle !== undefined) {
        exp.title = newTitle;
      }
      if (newAmount !== undefined) {
        exp.amount = newAmount;
      }
      if (newDescription !== undefined) {
        exp.description = newDescription;
      }
      if (newDate !== undefined) {
        exp.date = newDate;
      }
      if (categoryId !== undefined) {
        exp.categoryId = categoryId;
      }
    });
  });
};

/**
 * Deletes an expense by ID
 */
export const deleteExpenseById = async (expenseId: string): Promise<void> => {
  await database.write(async () => {
    const expense = await database.get<Expense>('expenses').find(expenseId);
    await expense.destroyPermanently();
  });
};

/**
 * Gets all expenses by user ID
 */
export const getAllExpensesByUserId = async (
  userId: string,
): Promise<ExpenseData[]> => {
  const expenses = await database
    .get<Expense>('expenses')
    .query(Q.where('user_id', userId))
    .fetch();
  return expenses.map(mapExpenseToData);
};

/**
 * Gets all expenses by user ID with category data populated
 */
export const getAllExpensesByUserIdWithCategory = async (
  userId: string,
): Promise<ExpenseWithCategory[]> => {
  const expenses = await database
    .get<Expense>('expenses')
    .query(Q.where('user_id', userId))
    .fetch();

  const categoryMap = await buildCategoryMap(userId);
  return expenses.map(e => mapExpenseWithCategory(e, categoryMap));
};

/**
 * Gets all expenses by user ID and date with category data
 */
export const getAllExpensesByDate = async (
  userId: string,
  targetDate: string,
): Promise<ExpenseWithCategory[]> => {
  const expenses = await database
    .get<Expense>('expenses')
    .query(
      Q.where('user_id', userId),
      Q.where('date', Q.like(`${Q.sanitizeLikeString(targetDate)}%`)),
    )
    .fetch();

  const categoryMap = await buildCategoryMap(userId);
  return expenses.map(e => mapExpenseWithCategory(e, categoryMap));
};

/**
 * Gets all expenses for a user in a specific month (YYYY-MM prefix match)
 */
export const getAllExpensesByMonth = async (
  userId: string,
  yearMonth: string,
): Promise<ExpenseWithCategory[]> => {
  const expenses = await database
    .get<Expense>('expenses')
    .query(
      Q.where('user_id', userId),
      Q.where('date', Q.like(`${Q.sanitizeLikeString(yearMonth)}%`)),
    )
    .fetch();

  const categoryMap = await buildCategoryMap(userId);
  return expenses.map(e => mapExpenseWithCategory(e, categoryMap));
};

/**
 * Gets all expenses for a user in a specific month filtered by category ID
 */
export const getAllExpensesByCategoryAndMonth = async (
  userId: string,
  categoryId: string,
  yearMonth: string,
): Promise<ExpenseWithCategory[]> => {
  const expenses = await database
    .get<Expense>('expenses')
    .query(
      Q.where('user_id', userId),
      Q.where('category_id', categoryId),
      Q.where('date', Q.like(`${Q.sanitizeLikeString(yearMonth)}%`)),
    )
    .fetch();

  const categoryMap = await buildCategoryMap(userId);
  return expenses.map(e => mapExpenseWithCategory(e, categoryMap));
};

/**
 * Gets distinct years that have expense data for a user.
 * Uses unsafeFetchRaw to avoid hydrating full model objects.
 */
/**
 * Distinct years that have expenses.
 *
 * This scans the user's expense rows, but via `unsafeFetchRaw` — no models are
 * hydrated, so it reads plain objects straight from SQLite. On a personal
 * expense database (hundreds to a few thousand rows) that is cheap, and the
 * result is cached per user in `utils/availableYearsCache`, so it runs once
 * per session rather than per render.
 *
 * A `SELECT DISTINCT substr(date,1,4)` via `Q.unsafeSqlQuery` would read fewer
 * rows, but it is SQLite-adapter-specific and only pays off at a dataset size
 * this app does not reach. Revisit only if profiling on a real database shows
 * this in a hot path.
 */
export const getAvailableExpenseYears = async (
  userId: string,
): Promise<number[]> => {
  const raws = await database
    .get<Expense>('expenses')
    .query(Q.where('user_id', userId))
    .unsafeFetchRaw();

  const years = new Set<number>();
  for (const r of raws) {
    const dateStr = (r as {date?: string}).date;
    if (dateStr) {
      const year = Number.parseInt(dateStr.substring(0, 4), 10);
      if (!Number.isNaN(year)) {
        years.add(year);
      }
    }
  }

  return Array.from(years).sort((a, b) => a - b);
};


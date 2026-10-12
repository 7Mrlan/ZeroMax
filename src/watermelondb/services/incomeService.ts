import {Q} from '@nozbe/watermelondb';
import {database} from '../database';
import Income from '../models/Income';
import Category from '../models/Category';

export interface IncomeData {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  userId: string;
  date: string;
}

export interface IncomeWithCategory extends IncomeData {
  transactionType: 'income';
  category?: {id: string; name: string; icon?: string; color: string};
}

const categoryMapForUser = async (userId: string): Promise<Map<string, IncomeWithCategory['category']>> => {
  const categories = await database
    .get<Category>('categories')
    .query(Q.where('user_id', userId), Q.where('kind', 'income'))
    .fetch();
  return new Map(
    categories.map(category => [
      category.id,
      {id: category.id, name: category.name, icon: category.icon ?? '', color: category.color ?? '#808080'},
    ]),
  );
};

const mapIncome = (income: Income, categories?: Map<string, IncomeWithCategory['category']>): IncomeWithCategory => ({
  id: income.id,
  title: income.title,
  amount: income.amount,
  categoryId: income.categoryId,
  userId: income.userId,
  date: income.date,
  transactionType: 'income',
  category: categories?.get(income.categoryId),
});

export const createIncome = async (
  userId: string,
  title: string,
  amount: number,
  categoryId: string,
  date: string,
): Promise<string> => {
  let incomeId = '';
  await database.write(async () => {
    const income = await database.get<Income>('incomes').create(record => {
      record.title = title;
      record.amount = amount;
      record.categoryId = categoryId;
      record.userId = userId;
      record.date = date;
    });
    incomeId = income.id;
  });
  return incomeId;
};

export const updateIncomeById = async (
  incomeId: string,
  categoryId?: string,
  newTitle?: string,
  newAmount?: number,
  newDate?: string,
): Promise<void> => {
  await database.write(async () => {
    const income = await database.get<Income>('incomes').find(incomeId);
    await income.update(record => {
      if (categoryId !== undefined) record.categoryId = categoryId;
      if (newTitle !== undefined) record.title = newTitle;
      if (newAmount !== undefined) record.amount = newAmount;
      if (newDate !== undefined) record.date = newDate;
    });
  });
};

export const deleteIncomeById = async (incomeId: string): Promise<void> => {
  await database.write(async () => {
    const income = await database.get<Income>('incomes').find(incomeId);
    await income.destroyPermanently();
  });
};

export const getAllIncomesByMonth = async (userId: string, yearMonth: string): Promise<IncomeWithCategory[]> => {
  const incomes = await database
    .get<Income>('incomes')
    .query(Q.where('user_id', userId), Q.where('date', Q.like(`${Q.sanitizeLikeString(yearMonth)}%`)))
    .fetch();
  const categories = await categoryMapForUser(userId);
  return incomes.map(income => mapIncome(income, categories));
};

/** Gets income rows for one category and month without touching expense state. */
export const getAllIncomesByCategoryAndMonth = async (
  userId: string,
  categoryId: string,
  yearMonth: string,
): Promise<IncomeWithCategory[]> => {
  return getAllIncomesByCategoriesAndMonth(userId, [categoryId], yearMonth);
};

/** Gets income rows for a category subtree in one indexed `IN` query. */
export const getAllIncomesByCategoriesAndMonth = async (
  userId: string,
  categoryIds: readonly string[],
  yearMonth: string,
): Promise<IncomeWithCategory[]> => {
  if (categoryIds.length === 0) return [];
  const incomes = await database
    .get<Income>('incomes')
    .query(
      Q.where('user_id', userId),
      Q.where('category_id', Q.oneOf([...new Set(categoryIds)])),
      Q.where('date', Q.like(`${Q.sanitizeLikeString(yearMonth)}%`)),
    )
    .fetch();
  const categories = await categoryMapForUser(userId);
  return incomes.map(income => mapIncome(income, categories));
};

export const getIncomeById = async (incomeId: string): Promise<IncomeData | null> => {
  try {
    return mapIncome(await database.get<Income>('incomes').find(incomeId));
  } catch {
    return null;
  }
};

export const getAvailableIncomeYears = async (userId: string): Promise<number[]> => {
  const incomes = await database.get<Income>('incomes').query(Q.where('user_id', userId)).fetch();
  return Array.from(
    new Set(incomes.map(income => Number.parseInt(income.date.slice(0, 4), 10)).filter(year => Number.isInteger(year))),
  ).sort((left, right) => left - right);
};

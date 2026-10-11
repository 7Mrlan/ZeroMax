import {database} from '../database';
import User from '../models/User';
import Category from '../models/Category';
import Expense from '../models/Expense';
import Currency from '../models/Currency';
import Debtor from '../models/Debtor';
import Debt from '../models/Debt';
import Budget from '../models/Budget';

/**
 * Deletes all data from all collections
 */
export const deleteAllData = async (): Promise<void> => {
  try {
    // Read before opening the writer. Fetching collections from inside a
    // Watermelon writer can keep a fresh JSI database's write queue pending,
    // which blocks the Welcome → Personalize transition on an empty target.
    // Keep reads serial: one Watermelon JSI adapter is not a safe target for
    // concurrent collection fetches during the first native frame.
    const users = await database.get<User>('users').query().fetch();
    const categories = await database.get<Category>('categories').query().fetch();
    const expenses = await database.get<Expense>('expenses').query().fetch();
    const currencies = await database.get<Currency>('currencies').query().fetch();
    const debtors = await database.get<Debtor>('debtors').query().fetch();
    const debts = await database.get<Debt>('debts').query().fetch();
    const budgets = await database.get<Budget>('budgets').query().fetch();
    const allRecords = [...users, ...categories, ...expenses, ...currencies, ...debtors, ...debts, ...budgets];

    if (allRecords.length === 0) return;

    await database.write(async () => {
      await database.batch(...allRecords.map(record => record.prepareDestroyPermanently()));
    });
  } catch (error) {
    if (__DEV__) {
      console.error('Error deleting all data:', error);
    }
    throw error;
  }
};

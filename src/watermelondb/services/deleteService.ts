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
    await database.write(async () => {
      // Get all records from each collection
      const users = await database.get<User>('users').query().fetch();
      const categories = await database.get<Category>('categories').query().fetch();
      const expenses = await database.get<Expense>('expenses').query().fetch();
      const currencies = await database.get<Currency>('currencies').query().fetch();
      const debtors = await database.get<Debtor>('debtors').query().fetch();
      const debts = await database.get<Debt>('debts').query().fetch();
      const budgets = await database.get<Budget>('budgets').query().fetch();

      // Batch delete all records
      const allRecords = [
        ...users,
        ...categories,
        ...expenses,
        ...currencies,
        ...debtors,
        ...debts,
        ...budgets,
      ];

      await database.batch(
        ...allRecords.map(record => record.prepareDestroyPermanently()),
      );
    });
  } catch (error) {
    if (__DEV__) {
      console.error('Error deleting all data:', error);
    }
    throw error;
  }
};


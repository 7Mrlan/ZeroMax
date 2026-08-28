import {nanoid} from 'nanoid';
import {database} from '../database';
import User from '../models/User';
import Category from '../models/Category';
import Expense from '../models/Expense';
import Currency from '../models/Currency';
import Debtor from '../models/Debtor';
import Debt from '../models/Debt';
import Budget from '../models/Budget';
import {buildImportPlan, type ImportStats} from '../../backend/import/planner';
import {sanitizeString} from '../../backend/sanitize';
import type {ExportData} from '../../backend/export/format';

export interface ImportResult {
  userId: string;
  stats: ImportStats;
}

/**
 * Restores a backup ATOMICALLY: wipe-existing + recreate-everything happen in
 * ONE database.write with ONE database.batch. If anything fails, the write
 * rolls back and the data that was on the device stays untouched — which is
 * what makes retrying an import safe.
 *
 * Do not replace the inlined wipe with deleteAllData(): WatermelonDB writers
 * do not nest, and a separate wipe-write would reintroduce the
 * half-imported-state bug this service exists to fix.
 */
export const importAllData = async (data: ExportData): Promise<ImportResult> => {
  const plan = buildImportPlan(data);
  const {username, email} = data.users[0];
  const userId = nanoid(24);

  await database.write(async () => {
    const [users, categories, expenses, currencies, debtors, debts, budgets] =
      await Promise.all([
        database.get<User>('users').query().fetch(),
        database.get<Category>('categories').query().fetch(),
        database.get<Expense>('expenses').query().fetch(),
        database.get<Currency>('currencies').query().fetch(),
        database.get<Debtor>('debtors').query().fetch(),
        database.get<Debt>('debts').query().fetch(),
        database.get<Budget>('budgets').query().fetch(),
      ]);

    const destroys = [
      ...users,
      ...categories,
      ...expenses,
      ...currencies,
      ...debtors,
      ...debts,
      ...budgets,
    ].map(record => record.prepareDestroyPermanently());

    const newUser = database.get<User>('users').prepareCreate(user => {
      user._raw.id = userId;
      user.username = sanitizeString(username, 'User');
      user.email = sanitizeString(email, '');
    });

    const categoryIdByName = new Map<string, string>();
    const newCategories = plan.categories.map(planned => {
      const id = nanoid(24);
      categoryIdByName.set(planned.name, id);
      return database.get<Category>('categories').prepareCreate(cat => {
        cat._raw.id = id;
        cat.name = planned.name;
        cat.categoryStatus = planned.status;
        cat.userId = userId;
        cat.icon = planned.icon;
        cat.color = planned.color;
      });
    });

    const debtorIdByTitle = new Map<string, string>();
    const newDebtors = plan.debtors.map(planned => {
      const id = nanoid(24);
      debtorIdByTitle.set(planned.title, id);
      return database.get<Debtor>('debtors').prepareCreate(debtor => {
        debtor._raw.id = id;
        debtor.title = planned.title;
        debtor.type = planned.type;
        debtor.debtorStatus = planned.status;
        debtor.userId = userId;
        debtor.icon = planned.icon;
        debtor.color = planned.color;
      });
    });

    const newCurrencies = plan.currencies.map(planned =>
      database.get<Currency>('currencies').prepareCreate(currency => {
        currency._raw.id = nanoid(24);
        currency.code = planned.code;
        currency.symbol = planned.symbol;
        currency.name = planned.name;
        currency.userId = userId;
      }),
    );

    // The planner auto-creates every referenced category/debtor, so these
    // lookups cannot miss; the fallback only satisfies the type system.
    const newExpenses = plan.expenses.map(planned =>
      database.get<Expense>('expenses').prepareCreate(expense => {
        expense.title = planned.title;
        expense.amount = planned.amount;
        expense.description = planned.description;
        expense.categoryId = categoryIdByName.get(planned.categoryName) ?? '';
        expense.userId = userId;
        expense.date = planned.date;
      }),
    );

    const newDebts = plan.debts.map(planned =>
      database.get<Debt>('debts').prepareCreate(debt => {
        debt.amount = planned.amount;
        debt.description = planned.description;
        debt.debtorId = debtorIdByTitle.get(planned.debtorTitle) ?? '';
        debt.userId = userId;
        debt.date = planned.date;
        debt.type = planned.type;
      }),
    );

    const newBudgets = plan.budgets.map(planned =>
      database.get<Budget>('budgets').prepareCreate(budget => {
        budget.userId = userId;
        budget.categoryId = '';
        budget.amount = planned.amount;
        budget.month = planned.month;
        budget.budgetType = planned.budgetType;
      }),
    );

    await database.batch(
      ...destroys,
      newUser,
      ...newCategories,
      ...newDebtors,
      ...newCurrencies,
      ...newExpenses,
      ...newDebts,
      ...newBudgets,
    );
  });

  return {userId, stats: plan.stats};
};

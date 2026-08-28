import {database} from '../database';
import User from '../models/User';
import Category from '../models/Category';
import Expense from '../models/Expense';
import Currency from '../models/Currency';
import Debtor from '../models/Debtor';
import Debt from '../models/Debt';
import Budget from '../models/Budget';
import {sanitizeString, DEFAULTS} from '../../backend/sanitize';
import type {ExportData} from '../../backend/export/format';

export type {ExportData} from '../../backend/export/format';

/**
 * Gets all data from the database in a format suitable for export/import.
 * Sanitizes all values before returning.
 */
export const getAllData = async (): Promise<ExportData | null> => {
  try {
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

    const categoryMap = new Map<string, string>();
    categories.forEach(c => {
      categoryMap.set(c.id, c.name);
    });

    const debtorMap = new Map<string, string>();
    debtors.forEach(d => {
      debtorMap.set(d.id, d.title);
    });

    return {
      users: users.map(u => ({
        username: u.username,
        email: u.email,
      })),
      categories: categories.map(c => ({
        name: c.name,
        categoryStatus: c.categoryStatus,
        icon: sanitizeString(c.icon, DEFAULTS.icon),
        color: sanitizeString(c.color, DEFAULTS.color),
      })),
      expenses: expenses.map(e => ({
        title: e.title,
        amount: e.amount,
        description: e.description ?? '',
        category: {name: categoryMap.get(e.categoryId) ?? 'Unknown'},
        date: e.date,
      })),
      currencies: currencies.map(c => ({
        code: c.code,
        symbol: c.symbol,
        name: c.name,
      })),
      debtors: debtors.map(d => ({
        title: d.title,
        debtorStatus: d.debtorStatus,
        icon: sanitizeString(d.icon, DEFAULTS.icon),
        type: d.type ?? DEFAULTS.type,
        color: sanitizeString(d.color, DEFAULTS.color),
      })),
      debts: debts.map(d => ({
        amount: d.amount,
        description: d.description,
        debtor: {title: debtorMap.get(d.debtorId) ?? 'Unknown'},
        date: d.date,
        type: d.type,
      })),
      budgets: budgets.map(b => ({
        amount: b.amount,
        month: b.month,
        budgetType: b.budgetType,
      })),
    };
  } catch (error) {
    if (__DEV__) {
      console.error('Error getting all data:', error);
    }
    return null;
  }
};


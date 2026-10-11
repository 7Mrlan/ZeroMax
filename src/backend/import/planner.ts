import type {ExportData} from '../export/validate';
import {DEFAULTS, sanitizeString} from '../sanitize';

export interface PlannedCategory {
  name: string;
  parentName: string | null;
  kind: 'expense' | 'income';
  status: boolean;
  icon: string;
  color: string;
  autoCreated: boolean;
}
export interface PlannedDebtor {
  title: string;
  status: boolean;
  icon: string;
  type: string;
  color: string;
  autoCreated: boolean;
}
export interface PlannedCurrency {
  code: string;
  symbol: string;
  name: string;
}
export interface PlannedBudget {
  amount: number;
  month: string;
  budgetType: string;
}
export interface PlannedExpense {
  title: string;
  amount: number;
  description: string;
  categoryName: string;
  categoryParentName: string | null;
  categoryKind: 'expense';
  date: string;
}
export interface PlannedIncome {
  title: string;
  amount: number;
  categoryName: string;
  categoryParentName: string | null;
  date: string;
}
export interface PlannedDebt {
  amount: number;
  description: string;
  debtorTitle: string;
  date: string;
  type: string;
}
export interface ImportStats {
  categories: number;
  debtors: number;
  currencies: number;
  expenses: number;
  debts: number;
  budgets: number;
  autoCreatedCategories: number;
  autoCreatedDebtors: number;
  incomes?: number;
}
export interface ImportPlan {
  categories: PlannedCategory[];
  debtors: PlannedDebtor[];
  currencies: PlannedCurrency[];
  budgets: PlannedBudget[];
  expenses: PlannedExpense[];
  incomes: PlannedIncome[];
  debts: PlannedDebt[];
  stats: ImportStats;
}

const AUTO_CREATED_DEBTOR_TYPE = 'Other';
const categoryKey = (name: string, kind: 'expense' | 'income', parentName: string | null): string =>
  `${kind}|${parentName ?? ''}|${name}`;

export const buildImportPlan = (data: ExportData): ImportPlan => {
  const categoriesByKey = new Map<string, PlannedCategory>();
  for (const category of data.categories) {
    const planned: PlannedCategory = {
      name: category.name,
      parentName: category.parentName ?? null,
      kind: category.kind ?? 'expense',
      status: category.categoryStatus ?? true,
      icon: sanitizeString(category.icon, DEFAULTS.icon),
      color: sanitizeString(category.color, DEFAULTS.color),
      autoCreated: false,
    };
    const key = categoryKey(planned.name, planned.kind, planned.parentName);
    const existing = categoriesByKey.get(key);
    if (!existing || (!existing.status && planned.status)) categoriesByKey.set(key, planned);
  }

  const debtorsByTitle = new Map<string, PlannedDebtor>();
  for (const debtor of data.debtors) {
    const planned: PlannedDebtor = {
      title: debtor.title,
      status: debtor.debtorStatus ?? true,
      icon: sanitizeString(debtor.icon, DEFAULTS.icon),
      type: sanitizeString(debtor.type, AUTO_CREATED_DEBTOR_TYPE),
      color: sanitizeString(debtor.color, DEFAULTS.color),
      autoCreated: false,
    };
    const existing = debtorsByTitle.get(planned.title);
    if (!existing || (!existing.status && planned.status)) debtorsByTitle.set(planned.title, planned);
  }

  const currenciesByCode = new Map<string, PlannedCurrency>();
  for (const currency of data.currencies) {
    if (!currenciesByCode.has(currency.code)) currenciesByCode.set(currency.code, currency);
  }
  const budgetsByKey = new Map<string, PlannedBudget>();
  for (const budget of data.budgets) {
    const key = `${budget.month}|${budget.budgetType}`;
    if (!budgetsByKey.has(key)) budgetsByKey.set(key, budget);
  }

  const expenses: PlannedExpense[] = data.expenses.map(expense => ({
    title: expense.title,
    amount: expense.amount,
    description: expense.description ?? '',
    categoryName: expense.category.name,
    categoryParentName: expense.category.parentName ?? null,
    categoryKind: 'expense',
    date: expense.date,
  }));
  const incomes: PlannedIncome[] = (data.incomes ?? []).map(income => ({
    title: income.title,
    amount: income.amount,
    categoryName: income.category.name,
    categoryParentName: income.category.parentName ?? null,
    date: income.date,
  }));
  const debts: PlannedDebt[] = data.debts.map(debt => ({
    amount: debt.amount,
    description: debt.description,
    debtorTitle: debt.debtor.title,
    date: debt.date,
    type: debt.type,
  }));

  let autoCreatedCategories = 0;
  for (const transaction of [
    ...expenses.map(item => ({...item, kind: 'expense' as const})),
    ...incomes.map(item => ({...item, kind: 'income' as const})),
  ]) {
    const key = categoryKey(transaction.categoryName, transaction.kind, transaction.categoryParentName);
    if (!categoriesByKey.has(key)) {
      categoriesByKey.set(key, {
        name: transaction.categoryName,
        parentName: transaction.categoryParentName,
        kind: transaction.kind,
        status: true,
        icon: DEFAULTS.icon,
        color: DEFAULTS.color,
        autoCreated: true,
      });
      autoCreatedCategories++;
    }
  }

  let autoCreatedDebtors = 0;
  for (const debt of debts) {
    if (!debtorsByTitle.has(debt.debtorTitle)) {
      debtorsByTitle.set(debt.debtorTitle, {
        title: debt.debtorTitle,
        status: true,
        icon: DEFAULTS.icon,
        type: AUTO_CREATED_DEBTOR_TYPE,
        color: DEFAULTS.color,
        autoCreated: true,
      });
      autoCreatedDebtors++;
    }
  }

  const categories = Array.from(categoriesByKey.values());
  const debtors = Array.from(debtorsByTitle.values());
  const currencies = Array.from(currenciesByCode.values());
  const budgets = Array.from(budgetsByKey.values());
  const stats: ImportStats = {
    categories: categories.length,
    debtors: debtors.length,
    currencies: currencies.length,
    expenses: expenses.length,
    debts: debts.length,
    budgets: budgets.length,
    autoCreatedCategories,
    autoCreatedDebtors,
  };
  if (data.incomes !== undefined) stats.incomes = incomes.length;
  return {categories, debtors, currencies, budgets, expenses, incomes, debts, stats};
};

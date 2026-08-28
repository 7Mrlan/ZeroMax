import {buildImportPlan} from '../planner';
import type {ExportData} from '../../export/validate';

const emptyData: ExportData = {
  users: [{username: 'Test', email: ''}],
  categories: [],
  expenses: [],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [],
};

const category = (
  name: string,
  overrides: Partial<ExportData['categories'][number]> = {},
): ExportData['categories'][number] => ({name, ...overrides});

describe('buildImportPlan — category dedupe', () => {
  it('collapses duplicate names to a single planned category (real backups contain "Fuel" twice)', () => {
    const plan = buildImportPlan({
      ...emptyData,
      categories: [
        category('Fuel', {icon: 'fuel', color: '#111111'}),
        category('Fuel', {icon: 'car', color: '#222222'}),
        category('Food'),
      ],
    });
    expect(plan.categories.map(c => c.name).sort()).toEqual(['Food', 'Fuel']);
    // first occurrence wins when statuses are equal
    expect(plan.categories.find(c => c.name === 'Fuel')?.icon).toBe('fuel');
    expect(plan.stats.categories).toBe(2);
  });

  it('prefers the ACTIVE duplicate over an inactive one, regardless of order', () => {
    const plan = buildImportPlan({
      ...emptyData,
      categories: [
        category('Fuel', {categoryStatus: false, icon: 'dead'}),
        category('Fuel', {categoryStatus: true, icon: 'alive'}),
      ],
    });
    const fuel = plan.categories.find(c => c.name === 'Fuel');
    expect(fuel?.status).toBe(true);
    expect(fuel?.icon).toBe('alive');
  });

  it('preserves soft-delete status instead of resurrecting everything', () => {
    const plan = buildImportPlan({
      ...emptyData,
      categories: [category('Old', {categoryStatus: false})],
    });
    expect(plan.categories[0].status).toBe(false);
  });

  it('sanitizes poisoned icon/color values to defaults', () => {
    const plan = buildImportPlan({
      ...emptyData,
      categories: [category('Food', {icon: 'null', color: 'undefined'})],
    });
    expect(plan.categories[0].icon).toBe('');
    expect(plan.categories[0].color).toBe('#758595');
  });
});

describe('buildImportPlan — auto-create instead of dropping transactions', () => {
  it('auto-creates a missing category referenced by an expense (nothing is skipped)', () => {
    const plan = buildImportPlan({
      ...emptyData,
      expenses: [
        {title: 'Chai', amount: 20, category: {name: 'Unknown'}, date: '2026-07-01'},
      ],
    });
    const unknown = plan.categories.find(c => c.name === 'Unknown');
    expect(unknown).toBeDefined();
    expect(unknown?.autoCreated).toBe(true);
    expect(unknown?.status).toBe(true);
    expect(plan.expenses).toHaveLength(1);
    expect(plan.stats.autoCreatedCategories).toBe(1);
  });

  it('auto-creates a missing debtor referenced by a debt', () => {
    const plan = buildImportPlan({
      ...emptyData,
      debts: [
        {amount: 500, description: 'Lunch', debtor: {title: 'Ghost'}, date: '2026-07-01', type: 'Borrow'},
      ],
    });
    const ghost = plan.debtors.find(d => d.title === 'Ghost');
    expect(ghost?.autoCreated).toBe(true);
    expect(ghost?.type).toBe('Other');
    expect(plan.debts).toHaveLength(1);
    expect(plan.stats.autoCreatedDebtors).toBe(1);
  });

  it('does not auto-create when the referenced entity exists (even soft-deleted)', () => {
    const plan = buildImportPlan({
      ...emptyData,
      categories: [category('Food', {categoryStatus: false})],
      expenses: [
        {title: 'Chai', amount: 20, category: {name: 'Food'}, date: '2026-07-01'},
      ],
    });
    expect(plan.categories).toHaveLength(1);
    expect(plan.stats.autoCreatedCategories).toBe(0);
  });
});

describe('buildImportPlan — expenses/debts are never deduplicated', () => {
  it('keeps identical expense rows (legit repeated transactions)', () => {
    const expense = {title: 'Chai', amount: 20, category: {name: 'Food'}, date: '2026-07-01'};
    const plan = buildImportPlan({
      ...emptyData,
      categories: [category('Food')],
      expenses: [expense, {...expense}],
    });
    expect(plan.expenses).toHaveLength(2);
  });

  it('normalizes missing expense description to empty string', () => {
    const plan = buildImportPlan({
      ...emptyData,
      categories: [category('Food')],
      expenses: [{title: 'Chai', amount: 20, category: {name: 'Food'}, date: '2026-07-01'}],
    });
    expect(plan.expenses[0].description).toBe('');
  });
});

describe('buildImportPlan — currencies and budgets', () => {
  it('dedupes currencies by code, first wins', () => {
    const plan = buildImportPlan({
      ...emptyData,
      currencies: [
        {code: 'INR', symbol: '₹', name: 'Indian Rupee'},
        {code: 'INR', symbol: 'Rs', name: 'Rupee (dup)'},
        {code: 'USD', symbol: '$', name: 'US Dollar'},
      ],
    });
    expect(plan.currencies).toHaveLength(2);
    expect(plan.currencies.find(c => c.code === 'INR')?.symbol).toBe('₹');
  });

  it('dedupes budgets by (month, budgetType) and keeps distinct months', () => {
    const plan = buildImportPlan({
      ...emptyData,
      budgets: [
        {amount: 60000, month: '2026-07', budgetType: 'monthly'},
        {amount: 99999, month: '2026-07', budgetType: 'monthly'},
        {amount: 50000, month: 'recurring:2026-01', budgetType: 'monthly'},
      ],
    });
    expect(plan.budgets).toHaveLength(2);
    expect(plan.budgets.find(b => b.month === '2026-07')?.amount).toBe(60000);
    expect(plan.stats.budgets).toBe(2);
  });
});

describe('buildImportPlan — empty payload', () => {
  it('returns an empty plan with zeroed stats', () => {
    const plan = buildImportPlan(emptyData);
    expect(plan.categories).toHaveLength(0);
    expect(plan.stats).toEqual({
      categories: 0,
      debtors: 0,
      currencies: 0,
      expenses: 0,
      debts: 0,
      budgets: 0,
      autoCreatedCategories: 0,
      autoCreatedDebtors: 0,
    });
  });
});

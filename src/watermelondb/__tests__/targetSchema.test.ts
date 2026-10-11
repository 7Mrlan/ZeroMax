import {targetSchema} from '../targetSchema';

describe('target schema', () => {
  it('contains the unified v4 tables and columns without changing production schema', () => {
    expect(targetSchema.version).toBe(4);
    expect(Object.keys(targetSchema.tables).sort()).toEqual([
      'budgets',
      'categories',
      'currencies',
      'debtors',
      'debts',
      'expenses',
      'incomes',
      'users',
    ]);
    expect(Object.keys(targetSchema.tables.categories.columns)).toEqual(expect.arrayContaining(['parent_id', 'kind']));
    expect(Object.keys(targetSchema.tables.expenses.columns)).toContain('description');
  });
});

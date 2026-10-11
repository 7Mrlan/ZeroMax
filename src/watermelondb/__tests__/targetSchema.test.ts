import {targetSchema} from '../targetSchema';
import Income from '../models/Income';
import {TargetCategory, TargetUser} from '../targetModels';
import {createTargetDatabase} from '../targetDatabase';

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

  it('keeps v4-only models out of the production model registry', () => {
    expect(Income.table).toBe('incomes');
    expect(TargetCategory.table).toBe('categories');
    expect(TargetUser.table).toBe('users');
    expect(Object.keys(TargetCategory.associations)).toEqual(expect.arrayContaining(['expenses', 'incomes', 'users']));
    expect(Object.keys(TargetUser.associations)).toEqual(
      expect.arrayContaining(['categories', 'expenses', 'incomes', 'budgets']),
    );
  });

  it('rejects opening a target adapter under a non-target filename', () => {
    expect(() => createTargetDatabase('watermelon')).toThrow('fixed v4 database name');
  });
});

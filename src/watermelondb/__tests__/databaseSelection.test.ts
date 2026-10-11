import {selectDatabase} from '../databaseSelection';
import Model from '@nozbe/watermelondb/Model';

const tableNames = (selection: ReturnType<typeof selectDatabase>): string[] =>
  selection.modelClasses.map(model => (model as typeof Model).table);

describe('selectDatabase', () => {
  it('keeps the legacy pointer on schema v3 and legacy migrations/models', () => {
    const selection = selectDatabase('watermelon');
    expect(selection.schema.version).toBe(3);
    expect(selection.migrations).toBeDefined();
    expect(tableNames(selection)).not.toContain('incomes');
  });

  it('opens the target pointer with schema v4 and income-aware models', () => {
    const selection = selectDatabase('watermelon_v4');
    expect(selection.schema.version).toBe(4);
    expect(selection.migrations).toBeUndefined();
    expect(tableNames(selection)).toEqual(expect.arrayContaining(['users', 'categories', 'expenses', 'incomes']));
  });
});

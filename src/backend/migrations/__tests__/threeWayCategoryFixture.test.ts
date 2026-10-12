import {buildImportPlan} from '../../import/planner';
import {normalizeLegacyRows} from '../copyNormalization';
import {verifyCopiedRows, type CopyDataset} from '../copyVerification';

const baseRows = (): CopyDataset => ({
  users: [{id: 'u1', username: 'Ada', _status: 'synced', _changed: ''}],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [{id: 'b1', amount: 500, user_id: 'u1', category_id: null, _status: 'synced', _changed: ''}],
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const verifyNormalized = (source: CopyDataset, normalized: CopyDataset) =>
  verifyCopiedRows({source, expectedTarget: normalized, actualTarget: clone(normalized)});

describe('Zero/Zerox/fresh category migration fixtures', () => {
  it('keeps Zero v3 English defaults and expense references stable', () => {
    const source: CopyDataset = {
      ...baseRows(),
      categories: [{id: 'c-food', name: 'Food', user_id: 'u1', _status: 'synced', _changed: ''}],
      expenses: [
        {
          id: 'e-food',
          title: 'Lunch',
          amount: 12,
          category_id: 'c-food',
          user_id: 'u1',
          date: '2026-01-01',
          _status: 'synced',
          _changed: '',
        },
      ],
    };
    const normalized = normalizeLegacyRows('zero-v3', source).dataset;
    expect(normalized.categories?.[0]).toEqual(
      expect.objectContaining({name: 'Food', kind: 'expense', parent_id: null}),
    );
    expect(normalized.expenses?.[0]).toEqual(expect.objectContaining({category_id: 'c-food'}));
    expect(verifyNormalized(source, normalized).ok).toBe(true);
  });

  it('keeps Zerox Chinese income hierarchy and income references stable', () => {
    const source: CopyDataset = {
      ...baseRows(),
      budgets: [],
      categories: [
        {id: 'c-salary', name: '工资', user_id: 'u1', kind: 'income', parent_id: null, _status: 'synced', _changed: ''},
        {
          id: 'c-bonus',
          name: '奖金',
          user_id: 'u1',
          kind: 'income',
          parent_id: 'c-salary',
          _status: 'synced',
          _changed: '',
        },
      ],
      expenses: [],
      incomes: [
        {
          id: 'i-bonus',
          title: '年终奖',
          amount: 1000,
          category_id: 'c-bonus',
          user_id: 'u1',
          date: '2026-01-01',
          _status: 'synced',
          _changed: '',
        },
      ],
    };
    const normalized = normalizeLegacyRows('zerox-v3', source).dataset;
    expect(normalized.categories?.[1]).toEqual(
      expect.objectContaining({name: '奖金', kind: 'income', parent_id: 'c-salary'}),
    );
    expect(normalized.incomes?.[0]).toEqual(expect.objectContaining({category_id: 'c-bonus'}));
    expect(verifyNormalized(source, normalized).ok).toBe(true);
  });

  it('accepts a fresh v4 fixture with expense and income kinds', () => {
    const fixture: CopyDataset = {
      ...baseRows(),
      categories: [
        {id: 'c-food', name: '餐饮', user_id: 'u1', kind: 'expense', parent_id: null, _status: 'created', _changed: ''},
        {
          id: 'c-income',
          name: '工资',
          user_id: 'u1',
          kind: 'income',
          parent_id: null,
          _status: 'created',
          _changed: '',
        },
      ],
      expenses: [
        {
          id: 'e1',
          title: '午餐',
          amount: 20,
          category_id: 'c-food',
          user_id: 'u1',
          date: '2026-01-01',
          _status: 'created',
          _changed: '',
        },
      ],
      incomes: [
        {
          id: 'i1',
          title: '工资',
          amount: 5000,
          category_id: 'c-income',
          user_id: 'u1',
          date: '2026-01-01',
          _status: 'created',
          _changed: '',
        },
      ],
    };
    expect(verifyCopiedRows({source: fixture, expectedTarget: fixture, actualTarget: clone(fixture)}).ok).toBe(true);
  });

  it('keeps localized defaults and same-name income/expense keys separate in v5 planning', () => {
    const plan = buildImportPlan({
      users: [{username: 'Ada', email: ''}],
      categories: [
        {name: '其他', kind: 'expense', parentName: null},
        {name: '其他', kind: 'income', parentName: '工资'},
      ],
      expenses: [{title: '午餐', amount: 20, category: {name: '其他', kind: 'expense'}, date: '2026-01-01'}],
      incomes: [
        {title: '奖金', amount: 100, category: {name: '其他', kind: 'income', parentName: '工资'}, date: '2026-01-01'},
      ],
      currencies: [],
      debtors: [],
      debts: [],
      budgets: [],
    });
    expect(plan.categories).toHaveLength(2);
    expect(plan.stats.incomes).toBe(1);
    expect(plan.expenses[0].categoryParentName).toBeNull();
    expect(plan.incomes[0].categoryParentName).toBe('工资');
  });
});

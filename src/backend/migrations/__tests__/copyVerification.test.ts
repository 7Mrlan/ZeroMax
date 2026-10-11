import {verifyCopiedRows, type CopyDataset} from '../copyVerification';

type MutableCopyDataset = Partial<Record<keyof CopyDataset, Array<{id: string; [key: string]: unknown}>>>;

const source: CopyDataset = {
  users: [{id: 'u1', username: 'Ada', _status: 'created', _changed: ''}],
  categories: [{id: 'c1', name: 'Food', user_id: 'u1', _status: 'created', _changed: ''}],
  expenses: [
    {id: 'e1', title: 'Lunch', amount: 12.5, category_id: 'c1', user_id: 'u1', _status: 'synced', _changed: 'a'},
  ],
  incomes: [],
  currencies: [],
  debtors: [],
  debts: [],
  budgets: [{id: 'b1', amount: 100, user_id: 'u1', category_id: null, _status: 'created', _changed: ''}],
};

const cloneSource = (): MutableCopyDataset => JSON.parse(JSON.stringify(source)) as MutableCopyDataset;

const cloneExpectedTarget = (): MutableCopyDataset => {
  const target = cloneSource();
  target.categories = target.categories!.map(category => ({...category, parent_id: null, kind: 'expense'}));
  return target;
};

const verify = (actualTarget: MutableCopyDataset) =>
  verifyCopiedRows({source, expectedTarget: cloneExpectedTarget(), actualTarget});

describe('verifyCopiedRows', () => {
  it('accepts an exact normalized copy including IDs, relations, amounts and sync metadata', () => {
    expect(verify(cloneExpectedTarget())).toEqual({
      ok: true,
      tablesPresent: true,
      rowCountsMatch: true,
      amountSumsMatch: true,
      idsMatch: true,
      relationsMatch: true,
      existingValuesMatch: true,
      statusAndChangedMatch: true,
      errors: [],
    });
  });

  it('accepts SQLite numeric booleans after Watermelon raw decoding', () => {
    const target = cloneExpectedTarget();
    target.categories![0] = {...target.categories![0], category_status: true};
    target.debtors = [{id: 'd1', title: 'Bank', user_id: 'u1', debtor_status: true, _status: 'created', _changed: ''}];
    const expected = cloneExpectedTarget();
    expected.categories![0] = {...expected.categories![0], category_status: 1};
    expected.debtors = [{id: 'd1', title: 'Bank', user_id: 'u1', debtor_status: 1, _status: 'created', _changed: ''}];
    expect(
      verifyCopiedRows({source: {...source, debtors: expected.debtors}, expectedTarget: expected, actualTarget: target})
        .ok,
    ).toBe(true);
  });

  it('rejects a copy that changes an amount or Watermelon metadata', () => {
    const target = cloneExpectedTarget();
    target.expenses![0] = {...target.expenses![0], amount: 13, _changed: 'b'};
    const result = verify(target);
    expect(result.ok).toBe(false);
    expect(result.amountSumsMatch).toBe(false);
    expect(result.existingValuesMatch).toBe(false);
    expect(result.statusAndChangedMatch).toBe(false);
  });

  it('rejects duplicate IDs and broken foreign keys', () => {
    const target = cloneExpectedTarget();
    target.categories = [...target.categories!, target.categories![0]];
    target.expenses![0] = {...target.expenses![0], category_id: 'missing'};
    const result = verify(target);
    expect(result.ok).toBe(false);
    expect(result.idsMatch).toBe(false);
    expect(result.relationsMatch).toBe(false);
    expect(result.errors.join('\n')).toContain('missing categories');
  });

  it('rejects a same-ID copy that changes a non-financial field', () => {
    const target = cloneExpectedTarget();
    target.expenses![0] = {...target.expenses![0], title: 'Changed'};
    const result = verify(target);
    expect(result.ok).toBe(false);
    expect(result.existingValuesMatch).toBe(false);
  });

  it('rejects missing tables and invalid category kinds', () => {
    const target = cloneExpectedTarget();
    delete target.incomes;
    target.categories![0] = {...target.categories![0], kind: 'unknown'};
    const result = verify(target);
    expect(result.ok).toBe(false);
    expect(result.tablesPresent).toBe(false);
    expect(result.errors.join('\n')).toContain('missing tables');
  });

  it('rejects category parent cycles and cross-user parents', () => {
    const target = cloneExpectedTarget();
    target.users = [...target.users!, {id: 'u2', username: 'Grace', _status: 'created', _changed: ''}];
    target.categories = [
      {...target.categories![0], parent_id: 'c2'},
      {id: 'c2', name: 'Parent', user_id: 'u2', kind: 'expense', parent_id: 'c1', _status: 'created', _changed: ''},
    ];
    const result = verify(target);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('crosses users');
    expect(result.errors.join('\n')).toContain('cycle');
  });

  it('does not treat a missing optional budget category as a broken relation', () => {
    expect(verify(cloneExpectedTarget()).relationsMatch).toBe(true);
  });

  it('fails closed for non-finite or missing amounts', () => {
    const target = cloneExpectedTarget();
    target.expenses![0] = {...target.expenses![0], amount: Number.NaN};
    expect(verify(target).amountSumsMatch).toBe(false);
  });
});

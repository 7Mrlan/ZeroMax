import reducer, {fetchIncomesByMonth} from '../incomeDataSlice';

const income = (id: string) => ({
  id,
  title: id,
  amount: 10,
  categoryId: 'c1',
  userId: 'u1',
  date: '2026-01-01',
  transactionType: 'income' as const,
});

describe('income month cache', () => {
  it('keeps month data isolated and gates stale request completion', () => {
    let state = reducer(undefined, {type: 'init'});
    state = reducer(state, fetchIncomesByMonth.pending('jan', '2026-01'));
    state = reducer(state, fetchIncomesByMonth.pending('feb', '2026-02'));
    state = reducer(
      state,
      fetchIncomesByMonth.fulfilled({incomes: [income('feb')], yearMonth: '2026-02'}, 'feb', '2026-02'),
    );
    state = reducer(
      state,
      fetchIncomesByMonth.fulfilled({incomes: [income('jan')], yearMonth: '2026-01'}, 'jan', '2026-01'),
    );

    expect(state.monthCache['2026-02'].incomes.map(item => item.id)).toEqual(['feb']);
    expect(state.monthCache['2026-01'].incomes.map(item => item.id)).toEqual(['jan']);
    expect(state.ids).toEqual(['feb']);
  });
});

import reducer, {fetchExpensesByMonth} from '../expenseDataSlice';

const expense = (id: string) => ({
  id,
  title: id,
  amount: 1,
  description: '',
  categoryId: 'c1',
  userId: 'u1',
  date: '2026-01-01',
});

describe('expense month cache', () => {
  it('keeps month results isolated and ignores stale request completions', () => {
    let state = reducer(undefined, {type: 'init'});
    state = reducer(state, fetchExpensesByMonth.pending('request-jan', '2026-01'));
    state = reducer(state, fetchExpensesByMonth.pending('request-feb', '2026-02'));
    state = reducer(
      state,
      fetchExpensesByMonth.fulfilled({expenses: [expense('feb')], yearMonth: '2026-02'}, 'request-feb', '2026-02'),
    );
    state = reducer(
      state,
      fetchExpensesByMonth.fulfilled({expenses: [expense('jan')], yearMonth: '2026-01'}, 'request-jan', '2026-01'),
    );

    expect(state.monthCache['2026-02'].expenses.map(item => item.id)).toEqual(['feb']);
    expect(state.monthCache['2026-01'].expenses.map(item => item.id)).toEqual(['jan']);
    expect(state.ids).toEqual(['feb']);
  });

  it('does not allow an older request id to overwrite a pending month entry', () => {
    let state = reducer(undefined, {type: 'init'});
    state = reducer(state, fetchExpensesByMonth.pending('request-new', '2026-03'));
    state = reducer(
      state,
      fetchExpensesByMonth.fulfilled({expenses: [expense('old')], yearMonth: '2026-03'}, 'request-old', '2026-03'),
    );
    expect(state.monthCache['2026-03'].status).toBe('pending');
    expect(state.monthCache['2026-03'].expenses).toEqual([]);
  });
});

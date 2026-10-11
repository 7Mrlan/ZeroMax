import {createAsyncThunk, createEntityAdapter, createSlice} from '@reduxjs/toolkit';
import {RootState} from '../rootReducer';
import {
  ExpenseWithCategory,
  getAllExpensesByUserIdWithCategory,
  getAllExpensesByMonth,
  getAllExpensesByDate,
  getAllExpensesByCategoryAndMonth,
} from '../../watermelondb/services';
import {selectUserId} from './userIdSlice';

const expensesAdapter = createEntityAdapter<ExpenseWithCategory>();

type MonthCacheEntry = {
  status: 'pending' | 'fulfilled' | 'rejected';
  requestId: string;
  expenses: ExpenseWithCategory[];
  error: string | null;
};

type MonthCache = Record<string, MonthCacheEntry>;

const initialState = expensesAdapter.getInitialState({
  isLoading: false,
  error: null as string | null,
  cachedYearMonth: null as string | null,
  monthCache: {} as MonthCache,
  filteredExpenses: [] as ExpenseWithCategory[],
  filterKey: null as string | null,
  filteredLoading: false,
  filteredError: null as string | null,
});

export const fetchExpenses = createAsyncThunk<ExpenseWithCategory[], void, {state: RootState}>(
  'expense/fetchAll',
  async (_, {getState, rejectWithValue}) => {
    try {
      const userId = selectUserId(getState());
      const expenses = await getAllExpensesByUserIdWithCategory(userId);
      return expenses;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch expenses');
    }
  },
);

export const fetchExpensesByMonth = createAsyncThunk<
  {expenses: ExpenseWithCategory[]; yearMonth: string},
  string,
  {state: RootState}
>(
  'expense/fetchByMonth',
  async (yearMonth: string, {getState, rejectWithValue}) => {
    try {
      const userId = selectUserId(getState());
      const expenses = await getAllExpensesByMonth(userId, yearMonth);
      return {expenses, yearMonth};
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch expenses');
    }
  },
  {
    condition: (yearMonth, {getState}) => {
      const entry = getState().expense.monthCache[yearMonth];
      return entry?.status !== 'pending' && entry?.status !== 'fulfilled';
    },
  },
);

export const fetchEverydayExpenses = createAsyncThunk<ExpenseWithCategory[], string, {state: RootState}>(
  'expense/fetchByDate',
  async (date: string, {getState, rejectWithValue}) => {
    try {
      const userId = selectUserId(getState());
      const expenses = await getAllExpensesByDate(userId, date);
      return expenses;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch everyday expenses');
    }
  },
);

export const fetchExpensesByCategory = createAsyncThunk<
  ExpenseWithCategory[],
  {categoryId: string; yearMonth: string},
  {state: RootState}
>('expense/fetchByCategory', async ({categoryId, yearMonth}, {getState, rejectWithValue}) => {
  try {
    const userId = selectUserId(getState());
    const expenses = await getAllExpensesByCategoryAndMonth(userId, categoryId, yearMonth);
    return expenses;
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch category expenses');
  }
});

const expenseDataSlice = createSlice({
  name: 'expense',
  initialState,
  reducers: {
    invalidateExpenseCache: state => {
      state.cachedYearMonth = null;
      state.monthCache = {};
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchExpenses.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchExpenses.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.cachedYearMonth = null;
        expensesAdapter.setAll(state, action.payload);
      })
      .addCase(fetchExpenses.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchExpensesByMonth.pending, (state, action) => {
        state.cachedYearMonth = action.meta.arg;
        state.monthCache[action.meta.arg] = {
          status: 'pending',
          requestId: action.meta.requestId,
          expenses: state.monthCache[action.meta.arg]?.expenses ?? [],
          error: null,
        };
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchExpensesByMonth.fulfilled, (state, action) => {
        const entry = state.monthCache[action.payload.yearMonth];
        if (!entry || entry.requestId !== action.meta.requestId) {
          return;
        }
        state.monthCache[action.payload.yearMonth] = {
          status: 'fulfilled',
          requestId: action.meta.requestId,
          expenses: action.payload.expenses,
          error: null,
        };
        if (state.cachedYearMonth === action.payload.yearMonth || state.cachedYearMonth === null) {
          state.isLoading = false;
          state.error = null;
          state.cachedYearMonth = action.payload.yearMonth;
          expensesAdapter.setAll(state, action.payload.expenses);
        }
      })
      .addCase(fetchExpensesByMonth.rejected, (state, action) => {
        const yearMonth = action.meta.arg;
        const entry = state.monthCache[yearMonth];
        if (!entry || entry.requestId !== action.meta.requestId) {
          return;
        }
        const error = action.payload as string;
        state.monthCache[yearMonth] = {
          ...entry,
          status: 'rejected',
          error,
        };
        if (state.cachedYearMonth === yearMonth || state.cachedYearMonth === null) {
          state.isLoading = false;
          state.error = error;
        }
      })
      .addCase(fetchEverydayExpenses.pending, state => {
        state.filteredLoading = true;
        state.filteredError = null;
      })
      .addCase(fetchEverydayExpenses.fulfilled, (state, action) => {
        state.filteredLoading = false;
        state.filteredError = null;
        state.filterKey = action.meta.arg;
        state.filteredExpenses = action.payload;
      })
      .addCase(fetchEverydayExpenses.rejected, (state, action) => {
        state.filteredLoading = false;
        state.filteredError = action.payload as string;
      })
      .addCase(fetchExpensesByCategory.pending, state => {
        state.filteredLoading = true;
        state.filteredError = null;
      })
      .addCase(fetchExpensesByCategory.fulfilled, (state, action) => {
        state.filteredLoading = false;
        state.filteredError = null;
        state.filterKey = `${action.meta.arg.categoryId}:${action.meta.arg.yearMonth}`;
        state.filteredExpenses = action.payload;
      })
      .addCase(fetchExpensesByCategory.rejected, (state, action) => {
        state.filteredLoading = false;
        state.filteredError = action.payload as string;
      });
  },
});

const expenseSelectors = expensesAdapter.getSelectors<RootState>(state => state.expense);

export const selectExpenseData = expenseSelectors.selectAll;
export const selectExpenseDataById = expenseSelectors.selectById;
export const selectExpenseIds = expenseSelectors.selectIds;
export const selectExpenseEntities = expenseSelectors.selectEntities;
export const selectExpenseTotal = expenseSelectors.selectTotal;

export const selectExpenseLoading = (state: RootState) => state.expense.isLoading;
export const selectExpenseError = (state: RootState) => state.expense.error;
export const selectCachedYearMonth = (state: RootState) => state.expense.cachedYearMonth;

export const selectFilteredExpenses = (state: RootState) => state.expense.filteredExpenses;
export const selectFilteredExpenseIds = (state: RootState) => state.expense.filteredExpenses.map(e => e.id);
export const selectFilteredExpenseLoading = (state: RootState) => state.expense.filteredLoading;
export const selectFilteredExpenseError = (state: RootState) => state.expense.filteredError;
export const selectFilterKey = (state: RootState) => state.expense.filterKey;

export const {invalidateExpenseCache} = expenseDataSlice.actions;

export default expenseDataSlice.reducer;

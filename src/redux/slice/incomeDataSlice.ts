import {createAsyncThunk, createEntityAdapter, createSlice} from '@reduxjs/toolkit';
import type {RootState} from '../rootReducer';
import {getAllIncomesByMonth, type IncomeWithCategory} from '../../watermelondb/services';
import {selectUserId} from './userIdSlice';

type MonthEntry = {
  status: 'pending' | 'fulfilled' | 'rejected';
  requestId: string;
  incomes: IncomeWithCategory[];
  error: string | null;
};

const incomesAdapter = createEntityAdapter<IncomeWithCategory>();
const initialState = incomesAdapter.getInitialState({
  isLoading: false,
  error: null as string | null,
  activeYearMonth: null as string | null,
  monthCache: {} as Record<string, MonthEntry>,
});

export const fetchIncomesByMonth = createAsyncThunk<
  {incomes: IncomeWithCategory[]; yearMonth: string},
  string,
  {state: RootState}
>(
  'income/fetchByMonth',
  async (yearMonth, {getState, rejectWithValue}) => {
    try {
      const incomes = await getAllIncomesByMonth(selectUserId(getState()), yearMonth);
      return {incomes, yearMonth};
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch incomes');
    }
  },
  {
    condition: (yearMonth, {getState}) => {
      const entry = getState().income.monthCache[yearMonth];
      return entry?.status !== 'pending' && entry?.status !== 'fulfilled';
    },
  },
);

const incomeDataSlice = createSlice({
  name: 'income',
  initialState,
  reducers: {
    invalidateIncomeCache: state => {
      state.activeYearMonth = null;
      state.monthCache = {};
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchIncomesByMonth.pending, (state, action) => {
        state.activeYearMonth = action.meta.arg;
        state.isLoading = true;
        state.error = null;
        state.monthCache[action.meta.arg] = {
          status: 'pending',
          requestId: action.meta.requestId,
          incomes: state.monthCache[action.meta.arg]?.incomes ?? [],
          error: null,
        };
      })
      .addCase(fetchIncomesByMonth.fulfilled, (state, action) => {
        const entry = state.monthCache[action.payload.yearMonth];
        if (!entry || entry.requestId !== action.meta.requestId) return;
        state.monthCache[action.payload.yearMonth] = {
          status: 'fulfilled',
          requestId: action.meta.requestId,
          incomes: action.payload.incomes,
          error: null,
        };
        if (state.activeYearMonth === action.payload.yearMonth) {
          state.isLoading = false;
          state.error = null;
          incomesAdapter.setAll(state, action.payload.incomes);
        }
      })
      .addCase(fetchIncomesByMonth.rejected, (state, action) => {
        const yearMonth = action.meta.arg;
        const entry = state.monthCache[yearMonth];
        if (!entry || entry.requestId !== action.meta.requestId) return;
        const error = action.payload as string;
        state.monthCache[yearMonth] = {...entry, status: 'rejected', error};
        if (state.activeYearMonth === yearMonth) {
          state.isLoading = false;
          state.error = error;
        }
      });
  },
});

const selectors = incomesAdapter.getSelectors<RootState>(state => state.income);
export const selectIncomeData = selectors.selectAll;
export const selectIncomeDataById = selectors.selectById;
export const selectIncomeLoading = (state: RootState) => state.income.isLoading;
export const selectIncomeError = (state: RootState) => state.income.error;
export const selectIncomeActiveYearMonth = (state: RootState) => state.income.activeYearMonth;
export const {invalidateIncomeCache} = incomeDataSlice.actions;
export default incomeDataSlice.reducer;

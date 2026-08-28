import {createAsyncThunk, createEntityAdapter, createSlice} from '@reduxjs/toolkit';
import {RootState} from '../rootReducer';
import {DebtData as Debt, getAllDebtsByUserIdAndDebtorId, getAllDebtsByUserId} from '../../watermelondb/services';
import {selectUserId} from './userIdSlice';

const debtsAdapter = createEntityAdapter<Debt>();

const initialState = debtsAdapter.getInitialState({
  isLoading: false,
  error: null as string | null,
  allDebts: [] as Debt[],
  allDebtsLoading: false,
  allDebtsError: null as string | null,
});

export const fetchDebtsByDebtor = createAsyncThunk<Debt[], string, {state: RootState}>(
  'debt/fetchByDebtor',
  async (debtorId: string, {getState, rejectWithValue}) => {
    try {
      const userId = selectUserId(getState());
      const debts = await getAllDebtsByUserIdAndDebtorId(userId, debtorId);
      return debts;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch debts');
    }
  },
);

export const fetchAllDebts = createAsyncThunk<Debt[], void, {state: RootState}>('debt/fetchAll', async (_, {getState, rejectWithValue}) => {
  try {
    const userId = selectUserId(getState());
    // getAllDebtsByUserId returns plain debts; the old DebtWithDebtor cast
    // promised a `debtor` relation that was never populated or read.
    return await getAllDebtsByUserId(userId);
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch all debts');
  }
});

const debtDataSlice = createSlice({
  name: 'debt',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchDebtsByDebtor.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDebtsByDebtor.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        debtsAdapter.setAll(state, action.payload);
      })
      .addCase(fetchDebtsByDebtor.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchAllDebts.pending, state => {
        state.allDebtsLoading = true;
        state.allDebtsError = null;
      })
      .addCase(fetchAllDebts.fulfilled, (state, action) => {
        state.allDebtsLoading = false;
        state.allDebtsError = null;
        state.allDebts = action.payload;
      })
      .addCase(fetchAllDebts.rejected, (state, action) => {
        state.allDebtsLoading = false;
        state.allDebtsError = action.payload as string;
      });
  },
});

const debtSelectors = debtsAdapter.getSelectors<RootState>(state => state.debt);

export const selectDebtData = debtSelectors.selectAll;
export const selectDebtDataById = debtSelectors.selectById;
export const selectDebtIds = debtSelectors.selectIds;
export const selectDebtEntities = debtSelectors.selectEntities;

export const selectDebtLoading = (state: RootState) => state.debt.isLoading;
export const selectDebtError = (state: RootState) => state.debt.error;

export const selectAllDebts = (state: RootState) => state.debt.allDebts;
export const selectAllDebtsLoading = (state: RootState) => state.debt.allDebtsLoading;
export const selectAllDebtsError = (state: RootState) => state.debt.allDebtsError;

export default debtDataSlice.reducer;

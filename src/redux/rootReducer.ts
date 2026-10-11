import {combineReducers} from 'redux';
import userOnboardingReducer from './slice/isOnboardedSlice';
import currencyDataReducer from './slice/currencyDataSlice';
import userNameReducer from './slice/userNameSlice';
import userIdReducer from './slice/userIdSlice';
import categoryReducer from './slice/categoryDataSlice';
import expenseReducer from './slice/expenseDataSlice';
import debtorReducer from './slice/debtorDataSlice';
import debtReducer from './slice/debtDataSlice';
import allDataReducer from './slice/allDataSlice';
import individualDebtorReducer from './slice/IndividualDebtorSlice';
import monthSelectionReducer from './slice/monthSelectionSlice';
import budgetReducer from './slice/budgetDataSlice';
import incomeReducer from './slice/incomeDataSlice';

const rootReducer = combineReducers({
  userOnboarding: userOnboardingReducer,
  currencyData: currencyDataReducer,
  userName: userNameReducer,
  userId: userIdReducer,
  category: categoryReducer,
  expense: expenseReducer,
  debtor: debtorReducer,
  debt: debtReducer,
  allData: allDataReducer,
  individualDebtor: individualDebtorReducer,
  monthSelection: monthSelectionReducer,
  budget: budgetReducer,
  income: incomeReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export default rootReducer;

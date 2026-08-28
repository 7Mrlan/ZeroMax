import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import useThemeColors from '../../hooks/useThemeColors';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  getCurrentYear,
  getWeekdayShortNames,
  getDaysInMonth,
  getMonthNumber,
  getMonthNames,
  formatDate,
} from '../../utils/dateUtils';

const MONTHS = getMonthNames();

import {useFocusEffect} from '@react-navigation/native';
import {getWeekStartDay, rotateWeekdays, type WeekStartDay} from '../../utils/weekStart';
import {fetchExpensesByMonth, selectExpenseData} from '../../redux/slice/expenseDataSlice';
import {selectMonthIndex, selectYear, setMonthSelection} from '../../redux/slice/monthSelectionSlice';
import {selectCurrencyCode, selectCurrencySymbol} from '../../redux/slice/currencyDataSlice';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {fetchBudgetsByMonth, selectCurrentBudget} from '../../redux/slice/budgetDataSlice';
import {upsertBudget, deleteBudget} from '../../watermelondb/services/budgetService';
import {ExpenseData as ExpenseDocType} from '../../watermelondb/services';
import {loadAvailableYears} from '../../utils/availableYearsCache';

interface TransactionWithCategory extends ExpenseDocType {
  category?: {
    name?: string;
    icon?: string;
    color?: string;
  };
}

const CURRENT_YEAR = getCurrentYear();
const CURRENT_MONTH_INDEX = new Date().getMonth();

const useReports = () => {
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const [availableYears, setAvailableYears] = useState<number[]>([CURRENT_YEAR]);

  const selectedMonthIndex = useAppSelector(selectMonthIndex);
  const selectedYear = useAppSelector(selectYear);
  const selectedMonth = MONTHS[selectedMonthIndex];

  const filteredTransactions = useAppSelector(selectExpenseData) as TransactionWithCategory[];
  const currencySymbol = useAppSelector(selectCurrencySymbol);
  const currencyCode = useAppSelector(selectCurrencyCode);

  // Week-start preference. Re-read on focus: this screen stays mounted while
  // Settings is pushed on top, so a plain module read would go stale after
  // the user changes the option and navigates back.
  const [weekStart, setWeekStart] = useState<WeekStartDay>(getWeekStartDay);
  useFocusEffect(
    useCallback(() => {
      setWeekStart(getWeekStartDay());
    }, []),
  );
  const dayNames = useMemo(() => rotateWeekdays(getWeekdayShortNames(), weekStart), [weekStart]);
  const userId = useAppSelector(selectUserId);

  const yearMonth = `${selectedYear}-${getMonthNumber(selectedMonth)}`;

  useEffect(() => {
    if (userId) {
      loadAvailableYears(userId).then(years => {
        if (years.length > 0) {
          setAvailableYears(years);
        }
      });
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      dispatch(fetchExpensesByMonth(yearMonth));
      dispatch(fetchBudgetsByMonth(yearMonth));
    }
  }, [dispatch, userId, yearMonth]);

  const currentBudget = useAppSelector(selectCurrentBudget);

  const handleMonthYearSelect = useCallback(
    (monthIndex: number, year: number) => {
      dispatch(setMonthSelection({monthIndex, year}));
    },
    [dispatch],
  );

  const totalAmountForMonth = useMemo(
    () => (filteredTransactions ?? []).reduce((sum: number, transaction: TransactionWithCategory) => sum + transaction.amount, 0),
    [filteredTransactions],
  );

  const daysInMonth = useMemo(() => getDaysInMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  const todayTotal = useMemo(() => {
    const isCurrentMonth = selectedYear === CURRENT_YEAR && selectedMonthIndex === CURRENT_MONTH_INDEX;
    if (!isCurrentMonth) {return 0;}
    const todayStr = formatDate(new Date(), 'YYYY-MM-DD');
    return (filteredTransactions ?? []).reduce(
      (sum: number, t: TransactionWithCategory) => (t.date.startsWith(todayStr) ? sum + t.amount : sum), 0,
    );
  }, [filteredTransactions, selectedYear, selectedMonthIndex]);

  const handleBudgetSave = useCallback(
    async (amount: number, everyMonth: boolean) => {
      if (!userId) {return;}
      const month = everyMonth ? `recurring:${yearMonth}` : yearMonth;
      await upsertBudget(userId, amount, month);
      dispatch(fetchBudgetsByMonth(yearMonth));
    },
    [userId, yearMonth, dispatch],
  );

  const handleBudgetRemove = useCallback(async () => {
    if (!currentBudget) {return;}
    await deleteBudget(currentBudget.id);
    dispatch(fetchBudgetsByMonth(yearMonth));
  }, [currentBudget, yearMonth, dispatch]);

  return {
    colors,
    selectedYear,
    selectedMonth,
    filteredTransactions,
    currencySymbol,
    currencyCode,
    dayNames,
    weekStart,
    availableYears,
    handleMonthYearSelect,
    totalAmountForMonth,
    daysInMonth,
    todayTotal,
    isCurrentMonth: selectedYear === CURRENT_YEAR && selectedMonthIndex === CURRENT_MONTH_INDEX,
    currentBudget,
    handleBudgetSave,
    handleBudgetRemove,
  };
};

export default useReports;

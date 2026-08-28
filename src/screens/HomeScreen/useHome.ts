import {useCallback, useEffect, useMemo, useState} from 'react';
import useThemeColors from '../../hooks/useThemeColors';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {
  fetchExpensesByMonth,
  invalidateExpenseCache,
  selectExpenseData,
} from '../../redux/slice/expenseDataSlice';
import {selectMonthIndex, selectYear, setMonthSelection} from '../../redux/slice/monthSelectionSlice';
import {selectUserName} from '../../redux/slice/userNameSlice';
import {fetchUserData, selectUserId} from '../../redux/slice/userIdSlice';
import {fetchCurrency} from '../../redux/slice/currencyDataSlice';
import {fetchCategories} from '../../redux/slice/categoryDataSlice';
import {fetchBudgetsByMonth, selectCurrentBudget} from '../../redux/slice/budgetDataSlice';
import {getCurrentYear, getMonthNumber, getMonthNames, getDaysInMonth, sortByDateDesc, formatDate} from '../../utils/dateUtils';
import {ExpenseData as Expense} from '../../watermelondb/services';
import {loadAvailableYears} from '../../utils/availableYearsCache';
import {useFocusEffect} from '@react-navigation/native';

const MONTHS = getMonthNames();
const CURRENT_YEAR = getCurrentYear();
const CURRENT_MONTH_INDEX = new Date().getMonth();

const useHome = () => {
  const colors = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([CURRENT_YEAR]);

  const dispatch = useAppDispatch();

  const selectedMonthIndex = useAppSelector(selectMonthIndex);
  const selectedYear = useAppSelector(selectYear);

  const allTransactions = useAppSelector(selectExpenseData);
  const sortedTransactions = useMemo(() => sortByDateDesc(allTransactions as Expense[]), [allTransactions]);

  const userName = useAppSelector(selectUserName);
  const userId = useAppSelector(selectUserId);

  const selectedMonthName = MONTHS[selectedMonthIndex];
  const yearMonth = `${selectedYear}-${getMonthNumber(selectedMonthName)}`;

  useEffect(() => {
    dispatch(fetchUserData());
  }, [dispatch]);

  useEffect(() => {
    if (userId) {
      dispatch(fetchCurrency());
      dispatch(fetchCategories());
      loadAvailableYears(userId).then(years => {
        if (years.length > 0) {
          setAvailableYears(years);
        }
      });
    }
  }, [dispatch, userId]);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        dispatch(invalidateExpenseCache());
        dispatch(fetchExpensesByMonth(yearMonth));
        dispatch(fetchBudgetsByMonth(yearMonth));
      }
    }, [dispatch, userId, yearMonth]),
  );

  const currentBudget = useAppSelector(selectCurrentBudget);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  useEffect(() => {
    if (!refreshing) return;

    dispatch(invalidateExpenseCache());
    dispatch(fetchExpensesByMonth(yearMonth)).finally(() => {
      setRefreshing(false);
    });
  }, [dispatch, refreshing, yearMonth]);

  const isCurrentMonth = selectedYear === CURRENT_YEAR && selectedMonthIndex === CURRENT_MONTH_INDEX;

  const {totalSpent, transactionCount, todayTotal} = useMemo(() => {
    const total = (allTransactions ?? []).reduce((sum: number, t: Expense) => sum + t.amount, 0);
    const count = (allTransactions ?? []).length;

    const todayStr = formatDate(new Date(), 'YYYY-MM-DD');
    const today = isCurrentMonth
      ? (allTransactions ?? []).reduce((sum: number, t: Expense) => (t.date.startsWith(todayStr) ? sum + t.amount : sum), 0)
      : 0;

    return {totalSpent: total, transactionCount: count, todayTotal: today};
  }, [allTransactions, isCurrentMonth]);

  const daysInMonth = useMemo(() => getDaysInMonth(selectedYear, selectedMonthName), [selectedYear, selectedMonthName]);

  const handleMonthYearSelect = useCallback(
    (monthIndex: number, year: number) => {
      dispatch(setMonthSelection({monthIndex, year}));
    },
    [dispatch],
  );

  return {
    colors,
    refreshing,
    allTransactions,
    userName,
    userId,
    onRefresh,
    sortedTransactions,
    selectedYear,
    selectedMonthIndex,
    selectedMonthName,
    yearMonth,
    availableYears,
    totalSpent,
    transactionCount,
    todayTotal,
    isCurrentMonth,
    daysInMonth,
    currentBudget,
    handleMonthYearSelect,
  };
};

export default useHome;

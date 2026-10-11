import {formatDate} from '../../utils/dateUtils';
import useThemeColors from '../../hooks/useThemeColors';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {RouteProp, useFocusEffect} from '@react-navigation/native';
import {ExpenseData as Expense} from '../../watermelondb/services';
import {useCallback, useMemo} from 'react';
import {fetchEverydayExpenses, selectFilterKey, selectFilteredExpenses} from '../../redux/slice/expenseDataSlice';
import {fetchIncomesByMonth, selectIncomeActiveYearMonth, selectIncomeData} from '../../redux/slice/incomeDataSlice';
export type EverydayTransactionRouteProp = RouteProp<
  {
    EverydayTransaction: {
      dayTransactions: Array<Expense>;
      isDate: string;
    };
  },
  'EverydayTransaction'
>;

const useEverydayTransaction = (route: EverydayTransactionRouteProp) => {
  const dispatch = useAppDispatch();
  const filteredExpenses = useAppSelector(selectFilteredExpenses) as Expense[];
  const monthIncomes = useAppSelector(selectIncomeData);
  const filterKey = useAppSelector(selectFilterKey);
  const expenseDate = route.params?.isDate ?? '';
  const incomeYearMonth = formatDate(expenseDate, 'YYYY-MM');
  const activeIncomeYearMonth = useAppSelector(selectIncomeActiveYearMonth);
  const formattedDate = formatDate(expenseDate, 'MMM Do YY');
  const colors = useThemeColors();

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchEverydayExpenses(expenseDate));
      dispatch(fetchIncomesByMonth(incomeYearMonth));
    }, [dispatch, expenseDate, incomeYearMonth]),
  );

  /**
   * `filteredExpenses` is ONE slot shared with CategoryTransactionScreen, so
   * between navigating here and this day's fetch resolving it still holds the
   * previous screen's rows. The slice has always written a `filterKey` for
   * exactly this — it just was never read, so the stale list flashed anyway.
   *
   * Gate on it: until the store's key matches the day we asked for, this
   * screen has no data rather than the wrong data.
   */
  const allEverydayTransactions = useMemo(
    () => [
      ...(filterKey === expenseDate ? filteredExpenses : []),
      ...(activeIncomeYearMonth === incomeYearMonth
        ? monthIncomes.filter(income => income.date.startsWith(expenseDate.slice(0, 10)))
        : []),
    ],
    [activeIncomeYearMonth, expenseDate, filterKey, filteredExpenses, incomeYearMonth, monthIncomes],
  );

  const totalAmountForTheDay = useMemo(
    () =>
      allEverydayTransactions.reduce(
        (sum, transaction) => ('transactionType' in transaction ? sum : sum + transaction.amount),
        0,
      ),
    [allEverydayTransactions],
  );

  return {
    formattedDate,
    colors,
    expenseDate,
    allEverydayTransactions,
    totalAmountForTheDay,
  };
};

export default useEverydayTransaction;

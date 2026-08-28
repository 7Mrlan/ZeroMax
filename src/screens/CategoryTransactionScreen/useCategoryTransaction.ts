import useThemeColors from '../../hooks/useThemeColors';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {RouteProp, useFocusEffect} from '@react-navigation/native';
import {ExpenseData as Expense} from '../../watermelondb/services';
import {useCallback, useMemo} from 'react';
import {fetchExpensesByCategory, selectFilterKey, selectFilteredExpenses} from '../../redux/slice/expenseDataSlice';
export type CategoryTransactionRouteProp = RouteProp<
  {
    CategoryTransactionScreen: {
      categoryId: string;
      categoryName: string;
      categoryColor: string;
      categoryIcon?: string;
      yearMonth: string;
      monthLabel: string;
    };
  },
  'CategoryTransactionScreen'
>;

const useCategoryTransaction = (route: CategoryTransactionRouteProp) => {
  const dispatch = useAppDispatch();
  const filteredExpenses = useAppSelector(selectFilteredExpenses) as Expense[];
  const filterKey = useAppSelector(selectFilterKey);
  const colors = useThemeColors();

  const {
    categoryId = '',
    categoryName = '',
    categoryColor = '#808080',
    categoryIcon,
    yearMonth = '',
    monthLabel = '',
  } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchExpensesByCategory({categoryId, yearMonth}));
    }, [dispatch, categoryId, yearMonth]),
  );

  /**
   * Same shared-slot problem as EverydayTransactionScreen: until the store's
   * `filterKey` matches the category+month we asked for, the rows in it belong
   * to whichever screen ran last. Render nothing rather than someone else's
   * expenses. (The slice wrote this key from the start; nothing read it.)
   */
  const transactions = useMemo(
    () => (filterKey === `${categoryId}:${yearMonth}` ? filteredExpenses : []),
    [filterKey, categoryId, yearMonth, filteredExpenses],
  );

  const totalAmount = useMemo(
    () => transactions.reduce((sum: number, t: Expense) => sum + t.amount, 0),
    [transactions],
  );

  return {
    colors,
    transactions,
    totalAmount,
    categoryName,
    categoryColor,
    categoryIcon,
    monthLabel,
    categoryId,
    yearMonth,
  };
};

export default useCategoryTransaction;

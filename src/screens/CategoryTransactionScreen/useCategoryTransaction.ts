import useThemeColors from '../../hooks/useThemeColors';
import {RouteProp, useFocusEffect} from '@react-navigation/native';
import type {HomeStackParamList} from '../../navigation/types';
import {transactionRepository, type TransactionRecord} from '../../domain/transactions';
import {useAppSelector} from '../../redux/hooks';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {useCallback, useMemo, useRef, useState} from 'react';

export type CategoryTransactionRouteProp = RouteProp<HomeStackParamList, 'CategoryTransactionScreen'>;

const useCategoryTransaction = (route: CategoryTransactionRouteProp) => {
  const colors = useThemeColors();
  const userId = useAppSelector(selectUserId);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [error, setError] = useState(false);
  const requestRef = useRef(0);

  const {
    categoryId = '',
    categoryName = '',
    categoryColor = '#808080',
    categoryIcon,
    kind = 'expense',
    categoryIds,
    yearMonth = '',
    monthLabel = '',
  } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      const request = ++requestRef.current;
      setTransactions([]);
      setError(false);
      if (!userId || !categoryId || !yearMonth) return undefined;

      void transactionRepository
        .getByCategory(userId, categoryId, yearMonth, kind, categoryIds)
        .then(records => {
          if (request === requestRef.current) setTransactions(records);
        })
        .catch(() => {
          if (request === requestRef.current) {
            setTransactions([]);
            setError(true);
          }
        });

      return () => {
        requestRef.current += 1;
      };
    }, [categoryId, categoryIds, kind, userId, yearMonth]),
  );

  const totalAmount = useMemo(
    () => transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    [transactions],
  );

  return {
    colors,
    transactions,
    totalAmount,
    error,
    categoryName,
    categoryColor,
    categoryIcon,
    kind,
    monthLabel,
    categoryId,
    yearMonth,
  };
};

export default useCategoryTransaction;

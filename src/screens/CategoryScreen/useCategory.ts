import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import useThemeColors from '../../hooks/useThemeColors';
import {
  fetchCategories,
  selectActiveCategories,
  selectCategoryData,
  selectDeletedCategories,
} from '../../redux/slice/categoryDataSlice';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {selectMonthIndex, selectYear} from '../../redux/slice/monthSelectionSlice';
import {getMonthNames, getMonthNumber} from '../../utils/dateUtils';
import {transactionRepository} from '../../domain/transactions';
import {buildCategoryTotals} from './categoryTotals';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {navigate} from '../../utils/navigationUtils';
import {restoreCategoryById, softDeleteCategoryById} from '../../watermelondb/services';
import {useDialog} from '../../context/DialogContext';
import {useTranslation} from 'react-i18next';

const useCategory = () => {
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const {showDialog} = useDialog();
  const {t} = useTranslation();
  const categories = useAppSelector(selectActiveCategories);
  const allCategories = useAppSelector(selectCategoryData);
  const deletedCategories = useAppSelector(selectDeletedCategories);
  const userId = useAppSelector(selectUserId);
  const monthIndex = useAppSelector(selectMonthIndex);
  const selectedYear = useAppSelector(selectYear);
  const selectedMonth = getMonthNames()[monthIndex] ?? getMonthNames()[0];
  const yearMonth = `${selectedYear}-${getMonthNumber(selectedMonth)}`;
  const [categoryTotals, setCategoryTotals] = useState<ReadonlyMap<string, number>>(new Map());
  const [totalsRevision, setTotalsRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const totalsRequestRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchCategories());
      setTotalsRevision(current => current + 1);
    }, [dispatch]),
  );

  useEffect(() => {
    if (!userId) {
      setCategoryTotals(new Map());
      return;
    }
    const request = ++totalsRequestRef.current;
    let active = true;
    void transactionRepository
      .getByMonth(userId, yearMonth)
      .then(records => {
        if (active && request === totalsRequestRef.current) {
          setCategoryTotals(buildCategoryTotals(allCategories, records));
        }
      })
      .catch(() => {
        if (active && request === totalsRequestRef.current) setCategoryTotals(new Map());
      });
    return () => {
      active = false;
    };
  }, [allCategories, totalsRevision, userId, yearMonth]);

  useEffect(() => {
    if (!refreshing) return;

    dispatch(fetchCategories()).finally(() => {
      setRefreshing(false);
      setTotalsRevision(current => current + 1);
    });
  }, [refreshing, dispatch]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  const handleEdit = useCallback(
    (categoryId: string, categoryName: string, categoryIcon: string, categoryColor: string) => {
      const category = categories.find(item => item.id === categoryId);
      navigate('UpdateCategoryScreen', {
        categoryId,
        categoryName,
        categoryIcon,
        categoryColor,
        categoryKind: category?.kind,
        categoryParentId: category?.parentId || null,
      });
    },
    [categories],
  );

  const handleOpen = useCallback(
    (
      categoryId: string,
      categoryName: string,
      categoryIcon: string,
      categoryColor: string,
      kind: 'expense' | 'income',
    ) => {
      const categoryIds = new Set([categoryId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const category of allCategories) {
          if (category.parentId && categoryIds.has(category.parentId) && !categoryIds.has(category.id)) {
            categoryIds.add(category.id);
            changed = true;
          }
        }
      }
      navigate('CategoryTransactionScreen', {
        categoryId,
        categoryName,
        categoryIcon,
        categoryColor,
        kind,
        categoryIds: Array.from(categoryIds),
        yearMonth,
        monthLabel: `${selectedMonth} ${selectedYear}`,
      });
    },
    [allCategories, selectedMonth, selectedYear, yearMonth],
  );

  const handleRestore = useCallback(
    async (categoryId: string) => {
      if (!userId) return;
      try {
        await restoreCategoryById(categoryId, userId);
        dispatch(fetchCategories());
      } catch (error) {
        if (__DEV__) console.error('Error restoring category:', categoryId, error);
      }
    },
    [dispatch, userId],
  );

  const handleDelete = useCallback(
    async (categoryId: string) => {
      // Soft delete keeps historical expenses intact, but there is no in-app way
      // to bring a category back — so confirm before removing it.
      const confirmed = await showDialog({
        type: 'warning',
        message: t('category.deleteConfirm'),
      });
      if (!confirmed) {
        return;
      }
      try {
        await softDeleteCategoryById(categoryId);
        dispatch(fetchCategories());
      } catch (error) {
        if (__DEV__) {
          console.error('Error deleting category:', categoryId, error);
        }
      }
    },
    [dispatch, showDialog, t],
  );

  return {
    colors,
    refreshing,
    onRefresh,
    categories,
    allCategories,
    deletedCategories,
    categoryTotals,
    handleEdit,
    handleOpen,
    handleDelete,
    handleRestore,
  };
};

export default useCategory;

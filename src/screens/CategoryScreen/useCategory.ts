import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import useThemeColors from '../../hooks/useThemeColors';
import {fetchCategories, selectActiveCategories} from '../../redux/slice/categoryDataSlice';
import {useCallback, useEffect, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {navigate} from '../../utils/navigationUtils';
import {softDeleteCategoryById} from '../../watermelondb/services';
import {useDialog} from '../../context/DialogContext';
import {useTranslation} from 'react-i18next';

const useCategory = () => {
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const {showDialog} = useDialog();
  const {t} = useTranslation();
  const categories = useAppSelector(selectActiveCategories);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchCategories());
    }, [dispatch]),
  );

  useEffect(() => {
    if (!refreshing) return;

    dispatch(fetchCategories()).finally(() => {
      setRefreshing(false);
    });
  }, [refreshing, dispatch]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  const handleEdit = useCallback((
    categoryId: string,
    categoryName: string,
    categoryIcon: string,
    categoryColor: string,
  ) => {
    navigate('UpdateCategoryScreen', {
      categoryId,
      categoryName,
      categoryIcon,
      categoryColor,
    });
  }, []);

  const handleDelete = useCallback(async (categoryId: string) => {
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
  }, [dispatch, showDialog, t]);

  return {
    colors,
    refreshing,
    onRefresh,
    categories,
    handleEdit,
    handleDelete,
  };
};

export default useCategory;

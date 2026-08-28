import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import useThemeColors from '../../hooks/useThemeColors';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {fetchUserData, selectUserId} from '../../redux/slice/userIdSlice';
import {navigate} from '../../utils/navigationUtils';
import {createCategory} from '../../watermelondb/services';
interface CategorySelection {
  name: string;
  icon?: string;
  color?: string;
}

const useOnboarding = () => {
  const colors = useThemeColors();
  const [selectedCategories, setSelectedCategories] = useState<Array<CategorySelection>>([]);

  const selectedCategoryNames = useMemo(() => new Set(selectedCategories.map(c => c.name)), [selectedCategories]);

  const userId = useAppSelector(selectUserId);

  const dispatch = useAppDispatch();
  const handleSkip = useCallback(() => {
    navigate('ChooseCurrencyScreen');
  }, []);

  useEffect(() => {
    dispatch(fetchUserData());
  }, [dispatch]);

  // Guards a double-tap, which would otherwise create the whole default
  // category set twice.
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      for (const category of selectedCategories) {
        await createCategory(category.name, userId, category.icon ?? null, category.color ?? null);
      }
      navigate('ChooseCurrencyScreen');
    } catch (error) {
      if (__DEV__) {
        console.error('Error creating default categories:', error);
      }
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [selectedCategories, userId]);

  const toggleCategorySelection = useCallback(
    (category: CategorySelection) => {
      if (selectedCategoryNames.has(category.name)) {
        setSelectedCategories(prev => prev.filter(item => item.name !== category.name));
      } else {
        setSelectedCategories(prev => [...prev, category]);
      }
    },
    [selectedCategoryNames],
  );

  const isCategorySelected = useCallback(
    (categoryName: string): boolean => {
      return selectedCategoryNames.has(categoryName);
    },
    [selectedCategoryNames],
  );

  return {
    colors,
    selectedCategories,
    setSelectedCategories,
    userId,
    handleSkip,
    handleSubmit,
    isSubmitting,
    toggleCategorySelection,
    isCategorySelected,
  };
};

export default useOnboarding;

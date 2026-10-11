import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import useThemeColors from '../../hooks/useThemeColors';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {fetchUserData, selectUserId} from '../../redux/slice/userIdSlice';
import {createCategory} from '../../watermelondb/services';
import type {OnboardingStackParamList} from '../../navigation/types';
import {appendErrorLog} from '../../utils/errorLog';

type OnboardingNavigation = NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingScreen'>;
interface CategorySelection {
  name: string;
  icon?: string;
  color?: string;
}

const useOnboarding = () => {
  const colors = useThemeColors();
  const navigation = useNavigation<OnboardingNavigation>();
  const [selectedCategories, setSelectedCategories] = useState<Array<CategorySelection>>([]);

  const selectedCategoryNames = useMemo(() => new Set(selectedCategories.map(c => c.name)), [selectedCategories]);

  const userId = useAppSelector(selectUserId);

  const dispatch = useAppDispatch();
  const handleSkip = useCallback(() => {
    navigation.push('ChooseCurrencyScreen');
  }, [navigation]);

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
      navigation.push('ChooseCurrencyScreen');
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      appendErrorLog(normalized);
      console.error('Onboarding category submit failed:', normalized);
      if (__DEV__) {
        console.error('Error creating default categories:', normalized);
      }
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [navigation, selectedCategories, userId]);

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

import React, {memo, useCallback, useEffect, useState} from 'react';
import type {RouteProp} from '@react-navigation/native';
import {ScrollView, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import PrimaryView from '../atoms/PrimaryView';
import AppHeader from '../atoms/AppHeader';
import CustomInput from '../atoms/CustomInput';
import PrimaryText from '../atoms/PrimaryText';
import PrimaryButton from '../atoms/PrimaryButton';
import DatePicker from '../atoms/DatePicker';
import AmountInput from '../atoms/AmountInput';
import CategoryContainer from './CategoryContainer';
import useThemeColors from '../../hooks/useThemeColors';
import {goBack, navigate} from '../../utils/navigationUtils';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {fetchCategories, selectActiveCategories} from '../../redux/slice/categoryDataSlice';
import {fetchIncomesByMonth, invalidateIncomeCache} from '../../redux/slice/incomeDataSlice';
import {createIncome, updateIncomeById} from '../../watermelondb/services';
import {formatDate, getISODateTime} from '../../utils/dateUtils';
import {ensureYearInCache} from '../../utils/availableYearsCache';
import {incomeAmountSchema, incomeSchema} from '../../utils/validationSchema';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {gs} from '../../styles/globalStyles';
import type {CategoryData} from '../../watermelondb/services';
import type {HomeStackParamList} from '../../navigation/types';

interface IncomeEntryProps {
  type?: 'Add' | 'Update';
  route?: RouteProp<HomeStackParamList, 'UpdateIncomeScreen'>;
}

const IncomeEntry: React.FC<IncomeEntryProps> = ({type = 'Add', route}) => {
  const {t} = useTranslation();
  const isAddButton = type === 'Add';
  const incomeData = route?.params;
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const categories = useAppSelector(selectActiveCategories).filter(category => category.kind === 'income');
  const [title, setTitle] = useState(isAddButton ? '' : (incomeData?.incomeTitle ?? ''));
  const [amount, setAmount] = useState(isAddButton ? '' : String(incomeData?.incomeAmount ?? ''));
  const [date, setDate] = useState(isAddButton ? getISODateTime() : (incomeData?.incomeDate ?? getISODateTime()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<CategoryData[]>([]);

  const yearMonth = formatDate(date, 'YYYY-MM');
  const valid = incomeSchema.safeParse(title).success && incomeAmountSchema.safeParse(Number(amount)).success;

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  useEffect(() => {
    if (isAddButton || !incomeData?.incomeCategoryId || selectedCategories.length > 0) return;
    const match = categories.find(category => category.id === incomeData.incomeCategoryId);
    if (match) setSelectedCategories([match]);
  }, [categories, incomeData?.incomeCategoryId, isAddButton, selectedCategories.length]);

  const toggleCategorySelection = useCallback((category: CategoryData) => {
    setSelectedCategories(current => (current.some(item => item.id === category.id) ? [] : [category]));
  }, []);

  const submit = useCallback(async () => {
    if (!valid || selectedCategories.length !== 1) return;
    try {
      if (isAddButton) {
        await createIncome(userId, title.trim(), Number(amount), selectedCategories[0].id, date);
      } else if (incomeData?.incomeId) {
        await updateIncomeById(incomeData.incomeId, selectedCategories[0].id, title.trim(), Number(amount), date);
      } else {
        return;
      }
      ensureYearInCache(userId, Number(yearMonth.slice(0, 4)));
      dispatch(invalidateIncomeCache());
      const previousYearMonth = incomeData?.incomeDate ? formatDate(incomeData.incomeDate, 'YYYY-MM') : null;
      await Promise.all([
        dispatch(fetchIncomesByMonth(yearMonth)),
        previousYearMonth && previousYearMonth !== yearMonth
          ? dispatch(fetchIncomesByMonth(previousYearMonth))
          : Promise.resolve(),
      ]);
      goBack();
    } catch (error) {
      if (__DEV__) console.error(`Error ${isAddButton ? 'creating' : 'updating'} income:`, error);
    }
  }, [
    amount,
    date,
    dispatch,
    incomeData?.incomeDate,
    incomeData?.incomeId,
    isAddButton,
    selectedCategories,
    title,
    userId,
    valid,
    yearMonth,
  ]);

  return (
    <PrimaryView colors={colors} dismissKeyboardOnTouch>
      <View style={[gs.mb20, gs.mt20]}>
        <AppHeader onPress={goBack} colors={colors} text={isAddButton ? t('income.addTitle') : t('income.editTitle')} />
      </View>
      <CustomInput
        colors={colors}
        input={title}
        setInput={setTitle}
        testID="add-entry-income-title"
        placeholder={t('income.titlePlaceholder')}
        label={t('income.titleLabel')}
        schema={incomeSchema}
      />
      <PrimaryText size={12} color={colors.secondaryText} style={gs.mb5}>
        {t('income.amountLabel')}
      </PrimaryText>
      <AmountInput
        value={amount}
        onChangeText={setAmount}
        testID="add-entry-income-amount"
        accessibilityLabel={t('income.amountLabel')}
        style={gs.mb15}
      />
      <DatePicker
        setShowDatePicker={setShowDatePicker}
        createdAt={date}
        showDatePicker={showDatePicker}
        setCreatedAt={setDate}
        testID="add-entry-income-date"
        accessibilityLabel={t('income.dateLabel')}
        label={t('income.dateLabel')}
      />
      <PrimaryText size={12} color={colors.secondaryText} style={gs.mb8}>
        {t('income.categoryLabel')}
      </PrimaryText>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <CategoryContainer
          categories={categories}
          colors={colors}
          toggleCategorySelection={toggleCategorySelection}
          selectedCategories={selectedCategories}
        />
        <PrimaryButton
          onPress={() => navigate('AddCategoryScreen', {kind: 'income'})}
          colors={colors}
          testID="add-entry-income-category"
          buttonTitle={t('income.addCategoryButton')}
          variant="ghost"
          size="sm"
          fullWidth={false}
        />
      </ScrollView>
      <View style={gs.mt5}>
        <PrimaryButton
          onPress={submit}
          colors={colors}
          testID="add-entry-income-submit"
          buttonTitle={isAddButton ? t('common.add') : t('common.update')}
          disabled={!valid || selectedCategories.length !== 1}
        />
      </View>
    </PrimaryView>
  );
};

export default memo(IncomeEntry);

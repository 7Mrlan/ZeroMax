import React, {memo, useCallback, useEffect, useState} from 'react';
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
import {createIncome} from '../../watermelondb/services';
import {formatDate, getISODateTime} from '../../utils/dateUtils';
import {incomeAmountSchema, incomeSchema} from '../../utils/validationSchema';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {gs} from '../../styles/globalStyles';
import type {CategoryData} from '../../watermelondb/services';

const IncomeEntry = () => {
  const {t} = useTranslation();
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const categories = useAppSelector(selectActiveCategories).filter(category => category.kind === 'income');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getISODateTime());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<CategoryData[]>([]);

  const yearMonth = formatDate(date, 'YYYY-MM');
  const valid = incomeSchema.safeParse(title).success && incomeAmountSchema.safeParse(Number(amount)).success;

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  const toggleCategorySelection = useCallback((category: CategoryData) => {
    setSelectedCategories(current => (current.some(item => item.id === category.id) ? [] : [category]));
  }, []);

  const submit = useCallback(async () => {
    if (!valid || selectedCategories.length !== 1) return;
    await createIncome(userId, title.trim(), Number(amount), selectedCategories[0].id, date);
    dispatch(invalidateIncomeCache());
    await dispatch(fetchIncomesByMonth(yearMonth));
    goBack();
  }, [amount, date, dispatch, selectedCategories, title, userId, valid, yearMonth]);

  return (
    <PrimaryView colors={colors} dismissKeyboardOnTouch>
      <View style={[gs.mb20, gs.mt20]}>
        <AppHeader onPress={goBack} colors={colors} text={t('income.addTitle')} />
      </View>
      <CustomInput
        colors={colors}
        input={title}
        setInput={setTitle}
        placeholder={t('income.titlePlaceholder')}
        label={t('income.titleLabel')}
        schema={incomeSchema}
      />
      <PrimaryText size={12} color={colors.secondaryText} style={gs.mb5}>
        {t('income.amountLabel')}
      </PrimaryText>
      <AmountInput value={amount} onChangeText={setAmount} style={gs.mb15} />
      <DatePicker
        setShowDatePicker={setShowDatePicker}
        createdAt={date}
        showDatePicker={showDatePicker}
        setCreatedAt={setDate}
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
          buttonTitle={t('common.add')}
          disabled={!valid || selectedCategories.length !== 1}
        />
      </View>
    </PrimaryView>
  );
};

export default memo(IncomeEntry);

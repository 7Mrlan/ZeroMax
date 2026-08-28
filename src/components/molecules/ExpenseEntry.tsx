import {ScrollView, View} from 'react-native';
import React, {useCallback, useEffect, useMemo, useState, memo} from 'react';
import type {RouteProp} from '@react-navigation/native';
import {useTranslation} from 'react-i18next';
import type {HomeStackParamList} from '../../navigation/types';
import PrimaryView from '../atoms/PrimaryView';
import AppHeader from '../atoms/AppHeader';
import CustomInput from '../atoms/CustomInput';
import PrimaryText from '../atoms/PrimaryText';
import Icon from '../atoms/Icons';
import CategoryContainer from './CategoryContainer';
import PrimaryButton from '../atoms/PrimaryButton';
import useThemeColors from '../../hooks/useThemeColors';
import useFormatAmount from '../../hooks/useFormatAmount';
import {goBack, navigate} from '../../utils/navigationUtils';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {fetchCategories, selectActiveCategories} from '../../redux/slice/categoryDataSlice';
import {createExpense, updateExpenseById, getAllExpensesByMonth, type CategoryData as CategoryDocType} from '../../watermelondb/services';
import {fetchExpensesByMonth, invalidateExpenseCache} from '../../redux/slice/expenseDataSlice';
import {fetchBudgetsByMonth, selectCurrentBudget} from '../../redux/slice/budgetDataSlice';
import DatePicker from '../atoms/DatePicker';
import {getISODateTime, formatDate, getDaysInMonthByYearMonth} from '../../utils/dateUtils';
import {computeDailyAllowance} from '../../utils/budgetMath';
import {ensureYearInCache} from '../../utils/availableYearsCache';
import {expenseAmountSchema, expenseDescriptionSchema, expenseSchema} from '../../utils/validationSchema';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {gs} from '../../styles/globalStyles';
import AmountInput from '../atoms/AmountInput';

interface ExpenseEntryProps {
  type: string;
  route?: RouteProp<HomeStackParamList, 'UpdateTransactionScreen'>;
}

const ExpenseEntry: React.FC<ExpenseEntryProps> = ({type, route}) => {
  const {t} = useTranslation();
  const expenseData = route?.params;
  const isAddButton = type === 'Add';
  const [hasInteracted, setHasInteracted] = useState(false);
  const categories = useAppSelector(selectActiveCategories);
  const [selectedCategories, setSelectedCategories] = useState<CategoryDocType[]>(
    isAddButton
      ? []
      : categories?.filter((category: CategoryDocType) => category?.name === expenseData?.category?.name) ?? [],
  );

  const [createdAt, setCreatedAt] = useState(isAddButton ? getISODateTime() : expenseData?.expenseDate ?? getISODateTime());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState(isAddButton ? '' : expenseData?.expenseTitle ?? '');
  const [expenseDescription, setExpenseDescription] = useState(isAddButton ? '' : expenseData?.expenseDescription ?? '');
  const [expenseAmount, setExpenseAmount] = useState(isAddButton ? '' : String(expenseData?.expenseAmount ?? ''));

  const expenseAmountError = hasInteracted
    ? expenseAmountSchema?.safeParse(Number(expenseAmount)).error?.issues || []
    : [];

  const isValid =
    expenseSchema.safeParse(expenseTitle).success &&
    expenseDescriptionSchema.safeParse(expenseDescription).success &&
    expenseAmountSchema.safeParse(Number(expenseAmount)).success;

  const userId = useAppSelector(selectUserId);
  const dispatch = useAppDispatch();

  const colors = useThemeColors();
  const formatAmount = useFormatAmount();
  const currentBudget = useAppSelector(selectCurrentBudget);

  const expenseYearMonth = formatDate(createdAt, 'YYYY-MM');
  const expenseDateStr = formatDate(createdAt, 'YYYY-MM-DD');

  useEffect(() => {
    dispatch(fetchCategories());
    dispatch(fetchBudgetsByMonth(expenseYearMonth));
  }, [dispatch, expenseYearMonth]);

  // In edit mode the initial state above runs before the category slice is
  // populated, which would leave the expense looking uncategorised (and the
  // Update button disabled). Re-sync once the categories actually arrive.
  const editingCategoryName = expenseData?.category?.name;
  useEffect(() => {
    if (isAddButton || !editingCategoryName) {
      return;
    }
    setSelectedCategories(current => {
      if (current.length > 0) {
        return current;
      }
      const match = categories?.filter(
        (category: CategoryDocType) => category?.name === editingCategoryName,
      );
      return match?.length ? match : current;
    });
  }, [isAddButton, editingCategoryName, categories]);

  // One month query yields BOTH the entry-day's spend and the spend before
  // that day — the adaptive allowance needs the latter, and this replaces the
  // previous per-day query without adding one.
  const [monthSpend, setMonthSpend] = useState({daySpend: 0, spentBeforeDay: 0});
  useEffect(() => {
    let cancelled = false;
    getAllExpensesByMonth(userId, expenseYearMonth)
      .then(expenses => {
        if (cancelled) {
          return;
        }
        let day = 0;
        let before = 0;
        for (const expense of expenses) {
          const expenseDay = expense.date.slice(0, 10);
          if (expenseDay === expenseDateStr) {
            day += expense.amount;
          } else if (expenseDay < expenseDateStr) {
            before += expense.amount;
          }
        }
        setMonthSpend({daySpend: day, spentBeforeDay: before});
      })
      .catch(error => {
        if (__DEV__) {
          console.error('Error loading month spend:', error);
        }
      });
    return () => { cancelled = true; };
  }, [userId, expenseYearMonth, expenseDateStr]);

  const dailyBudgetInfo = useMemo(() => {
    if (!currentBudget) {return null;}

    const dayOfMonth = Number.parseInt(expenseDateStr.slice(8, 10), 10) || 1;
    const daysInMonthCount = getDaysInMonthByYearMonth(expenseYearMonth);
    // The allowance adapts only when the entry's month is the real current
    // month — a backdated or future entry gets the plain monthly average.
    const isEntryInCurrentMonth = expenseYearMonth === formatDate(new Date(), 'YYYY-MM');

    // When editing, the stored amount is already inside the fetched spend —
    // subtract it so the amount in the input isn't counted twice.
    const originalAmount = isAddButton ? 0 : Number(expenseData?.expenseAmount ?? 0);
    const originalOnEntryDay = expenseDateStr === (expenseData?.expenseDate ?? '').slice(0, 10) ? originalAmount : 0;
    const otherSpendToday = Math.max(monthSpend.daySpend - originalOnEntryDay, 0);
    const spentBefore = Math.max(monthSpend.spentBeforeDay - (originalAmount - originalOnEntryDay), 0);

    const {allowance} = computeDailyAllowance({
      monthlyBudget: currentBudget.amount,
      spentBeforeToday: spentBefore,
      dayOfMonth,
      daysInMonth: daysInMonthCount,
      isCurrentMonth: isEntryInCurrentMonth,
    });

    const enteredAmount = Number.parseFloat(expenseAmount) || 0;
    const dailyRemaining = allowance - otherSpendToday - enteredAmount;

    return {dailyBudget: allowance, dailyRemaining, exceeded: dailyRemaining < 0};
  }, [currentBudget, expenseYearMonth, expenseDateStr, monthSpend, expenseAmount, isAddButton, expenseData?.expenseAmount, expenseData?.expenseDate]);

  const handleAddCategory = useCallback(() => {
    navigate('AddCategoryScreen');
  }, []);

  // Gates validation errors: don't flag an amount until the user has left the
  // field, so "0." mid-typing doesn't render as an error.
  const handleAmountBlur = useCallback(() => {
    setHasInteracted(true);
  }, []);

  const handleAddExpense = useCallback(async () => {
    if (!isValid || selectedCategories.length === 0) {
      return;
    }
    const categoryId = selectedCategories[0].id;
    try {
      await createExpense(userId, expenseTitle, Number(expenseAmount), expenseDescription, categoryId, createdAt);

      const yearMonth = formatDate(createdAt, 'YYYY-MM');
      const year = Number.parseInt(formatDate(createdAt, 'YYYY'), 10);
      ensureYearInCache(userId, year);
      dispatch(invalidateExpenseCache());
      await dispatch(fetchExpensesByMonth(yearMonth));
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error creating expense:', error);
      }
    }
  }, [isValid, selectedCategories, userId, expenseTitle, expenseAmount, expenseDescription, createdAt, dispatch]);

  const handleUpdateExpense = useCallback(async () => {
    if (!isValid || selectedCategories.length === 0 || !expenseData?.expenseId) {
      return;
    }
    const categoryId = selectedCategories[0].id;
    try {
      await updateExpenseById(
        expenseData.expenseId,
        categoryId,
        expenseTitle,
        Number(expenseAmount),
        expenseDescription,
        createdAt,
      );

      const yearMonth = formatDate(createdAt, 'YYYY-MM');
      const year = Number.parseInt(formatDate(createdAt, 'YYYY'), 10);
      ensureYearInCache(userId, year);
      dispatch(invalidateExpenseCache());
      await dispatch(fetchExpensesByMonth(yearMonth));
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error updating expense:', error);
      }
    }
  }, [
    isValid,
    selectedCategories,
    expenseData?.expenseId,
    expenseTitle,
    expenseAmount,
    expenseDescription,
    createdAt,
    dispatch,
    userId,
  ]);

  const toggleCategorySelection = useCallback((category: CategoryDocType) => {
    // Compare by id, not object identity: fetchCategories() replaces the array
    // with fresh objects, and reference equality would then fail to deselect.
    setSelectedCategories(current =>
      current.some(selected => selected.id === category.id) ? [] : [category],
    );
  }, []);

  return (
    <PrimaryView colors={colors}>
      <View style={[gs.mb20, gs.mt20]}>
        <AppHeader onPress={() => goBack()} colors={colors} text={isAddButton ? t('transaction.addTitle') : t('transaction.editTitle')} />
      </View>

      <CustomInput
        colors={colors}
        input={expenseTitle}
        setInput={setExpenseTitle}
        placeholder={t('transaction.titlePlaceholder')}
        label={t('transaction.titleLabel')}
        schema={expenseSchema}
      />
      <CustomInput
        colors={colors}
        input={expenseDescription}
        setInput={setExpenseDescription}
        placeholder={t('transaction.descriptionPlaceholder')}
        label={t('transaction.descriptionLabel')}
        schema={expenseDescriptionSchema}
      />

      <PrimaryText size={12} color={colors.secondaryText} style={gs.mb5}>{t('transaction.amountLabel')}</PrimaryText>
      <AmountInput
        value={expenseAmount}
        onChangeText={setExpenseAmount}
        onBlur={handleAmountBlur}
        style={{marginBottom: expenseAmountError.length > 0 ? 5 : 15}}
      />
      {expenseAmountError.length > 0 && (
        <View style={gs.mb10}>
          {expenseAmountError.map((error: {message: string}) => (
            <View key={error.message}>
              <PrimaryText size={12} color={colors.accentRed}>
                {error.message}
              </PrimaryText>
            </View>
          ))}
        </View>
      )}

      {dailyBudgetInfo ? (
        <View style={[gs.rowCenter, gs.gap6, gs.mb10]}>
          <Icon
            name="target"
            size={13}
            color={dailyBudgetInfo.exceeded ? colors.accentOrange : colors.accentGreen}
          />
          <PrimaryText size={11} variant="number" color={colors.secondaryText}>
            {t('transaction.dailyBudget', {amount: formatAmount(Math.round(dailyBudgetInfo.dailyBudget))})}
          </PrimaryText>
          <PrimaryText size={11} color={colors.secondaryText}>·</PrimaryText>
          <PrimaryText
            size={11}
            variant="number"
            color={dailyBudgetInfo.exceeded ? colors.accentOrange : colors.accentGreen}>
            {dailyBudgetInfo.exceeded
              ? t('transaction.dailyExceeded', {amount: formatAmount(Math.round(Math.abs(dailyBudgetInfo.dailyRemaining)))})
              : t('transaction.dailyRemaining', {amount: formatAmount(Math.round(dailyBudgetInfo.dailyRemaining))})}
          </PrimaryText>
        </View>
      ) : null}

      <DatePicker
        setShowDatePicker={setShowDatePicker}
        createdAt={createdAt}
        showDatePicker={showDatePicker}
        setCreatedAt={setCreatedAt}
        label={t('transaction.dateLabel')}
      />

      <PrimaryText size={12} color={colors.secondaryText} style={gs.mb8}>{t('transaction.categoryLabel')}</PrimaryText>
      {/* keyboardShouldPersistTaps + keyboardDismissMode replace the
          screen-wide TouchableWithoutFeedback: they dismiss the keyboard
          without taking the touch responder away from this ScrollView. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <CategoryContainer
          categories={categories}
          colors={colors}
          toggleCategorySelection={toggleCategorySelection}
          selectedCategories={selectedCategories}
        />
        <PrimaryButton
          onPress={handleAddCategory}
          colors={colors}
          buttonTitle={t('transaction.addCategoryButton')}
          variant="ghost"
          size="sm"
          fullWidth={false}
        />
      </ScrollView>
      <View style={gs.mt5}>
        <PrimaryButton
          onPress={isAddButton ? handleAddExpense : handleUpdateExpense}
          colors={colors}
          buttonTitle={isAddButton ? t('common.add') : t('common.update')}
          disabled={!isValid || selectedCategories.length === 0}
        />
      </View>
    </PrimaryView>
  );
};

export default memo(ExpenseEntry);

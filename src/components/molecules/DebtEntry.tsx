import React, {useState, memo, useCallback} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import AppHeader from '../../components/atoms/AppHeader';
import CustomInput from '../../components/atoms/CustomInput';
import PrimaryButton from '../../components/atoms/PrimaryButton';
import PrimaryView from '../../components/atoms/PrimaryView';
import {goBack} from '../../utils/navigationUtils';
import useThemeColors from '../../hooks/useThemeColors';
import {createDebt, updateDebtById} from '../../watermelondb/services';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {fetchAllDebts, fetchDebtsByDebtor} from '../../redux/slice/debtDataSlice';
import DatePicker from '../atoms/DatePicker';
import {DebtsScreenProp} from '../../screens/AddDebtsScreen';
import {getISODateTime} from '../../utils/dateUtils';
import {expenseAmountSchema, expenseSchema} from '../../utils/validationSchema';
import PrimaryText from '../atoms/PrimaryText';
import {gs} from '../../styles/globalStyles';
import AmountInput from '../atoms/AmountInput';

interface DebtEntryProps {
  buttonText: string;
  route: DebtsScreenProp;
}

const DebtEntry: React.FC<DebtEntryProps> = ({buttonText, route}) => {
  const {t} = useTranslation();
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const {debtId = '', debtDescription = '', amount = 0, debtorName = '', debtDate = '', debtorId = '', debtType = 'Borrow'} = route.params ?? {};
  const isAddButton = buttonText === 'Add';
  const [hasInteracted, setHasInteracted] = useState(false);
  const [debtName, setDebtName] = useState(isAddButton ? '' : debtDescription);
  const [debtAmount, setDebtAmount] = useState(isAddButton ? '' : String(amount));
  const [createdAt, setCreatedAt] = useState(isAddButton ? getISODateTime() : debtDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [debtsType, setDebtsType] = useState(isAddButton ? 'Borrow' : debtType);
  const userId = useAppSelector(selectUserId);

  const debtAmountError = hasInteracted ? expenseAmountSchema?.safeParse(Number(debtAmount)).error?.issues || [] : [];

  const isValid =
    expenseSchema.safeParse(debtName).success && expenseAmountSchema.safeParse(Number(debtAmount)).success;

  const handleAddDebt = useCallback(async () => {
    if (!isValid) {
      return;
    }
    try {
      await createDebt(userId, Number(debtAmount), debtName, debtorId, createdAt, debtsType);
      dispatch(fetchAllDebts());
      dispatch(fetchDebtsByDebtor(debtorId));
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error creating debt:', error);
      }
    }
  }, [isValid, userId, debtAmount, debtName, debtorId, createdAt, debtsType, dispatch]);

  const handleUpdateDebt = useCallback(async () => {
    if (!isValid) {
      return;
    }
    try {
      await updateDebtById(debtId, Number(debtAmount), debtName, createdAt, debtsType);

      dispatch(fetchAllDebts());
      dispatch(fetchDebtsByDebtor(debtorId));
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error updating debt:', error);
      }
    }
  }, [isValid, debtId, debtorId, debtAmount, debtName, createdAt, debtsType, dispatch]);

  // Gates validation errors until the user leaves the field (see ExpenseEntry).
  const handleAmountBlur = useCallback(() => {
    setHasInteracted(true);
  }, []);

  return (
    <PrimaryView colors={colors} style={gs.justifyBetween} dismissKeyboardOnTouch>
      <View>
        <View style={[gs.mb20, gs.mt20]}>
          <AppHeader onPress={goBack} colors={colors} text={isAddButton ? t('debt.addTitle') : t('debt.editTitle')} />
        </View>

        <PrimaryText size={12} color={colors.secondaryText} style={gs.mb8}>
          {debtorName}
        </PrimaryText>
        <View style={[gs.row, gs.gap8, gs.mb15]}>
          {(['Borrow', 'Lend'] as const).map(debtTypeOption => {
            const isSelected = debtsType === debtTypeOption;
            const label = debtTypeOption === 'Borrow' ? t('debts.borrowing') : t('debts.lending');
            let bgColor = colors.secondaryAccent;
            if (isSelected && debtTypeOption === 'Borrow') {
              bgColor = colors.accentOrange;
            } else if (isSelected) {
              bgColor = colors.accentGreen;
            }
            return (
              <TouchableOpacity
                key={debtTypeOption}
                onPress={() => setDebtsType(debtTypeOption)}
                activeOpacity={0.7}
                style={[
                  gs.py8,
                  gs.px14,
                  gs.rounded12,
                  gs.center,
                  {backgroundColor: bgColor},
                ]}>
                <PrimaryText
                  size={13}
                  weight={isSelected ? 'semibold' : 'regular'}
                  color={isSelected ? colors.buttonText : colors.primaryText}>
                  {label}
                </PrimaryText>
              </TouchableOpacity>
            );
          })}
        </View>

        <CustomInput
          colors={colors}
          input={debtName}
          setInput={setDebtName}
          placeholder={t('debt.descriptionPlaceholder')}
          label={t('transaction.descriptionLabel')}
          schema={expenseSchema}
        />

        <PrimaryText size={12} color={colors.secondaryText} style={gs.mb5}>{t('transaction.amountLabel')}</PrimaryText>
        <AmountInput
          value={debtAmount}
          onChangeText={setDebtAmount}
          onBlur={handleAmountBlur}
          style={{marginBottom: debtAmountError.length > 0 ? 5 : 15}}
        />
        {debtAmountError.length > 0 && (
          <View style={gs.mb10}>
            {debtAmountError.map((error: {message: string}) => (
              <View key={error.message}>
                <PrimaryText size={12} color={colors.accentRed}>
                  {error.message}
                </PrimaryText>
              </View>
            ))}
          </View>
        )}

        <DatePicker
          setShowDatePicker={setShowDatePicker}
          createdAt={createdAt}
          showDatePicker={showDatePicker}
          setCreatedAt={setCreatedAt}
          label={t('transaction.dateLabel')}
        />
      </View>

      <View style={gs.mb10p}>
        <PrimaryButton
          onPress={isAddButton ? handleAddDebt : handleUpdateDebt}
          colors={colors}
          buttonTitle={isAddButton ? t('common.add') : t('common.update')}
          disabled={!isValid}
        />
      </View>
    </PrimaryView>
  );
};

export default memo(DebtEntry);

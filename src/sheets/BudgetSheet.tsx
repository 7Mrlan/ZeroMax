import {Switch, TextInput, TouchableOpacity, View} from 'react-native';
import React, {useCallback, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {SheetManager, SheetProps} from 'react-native-actions-sheet';
import useThemeColors from '../hooks/useThemeColors';
import {CustomBottomSheet} from '../components/atoms/CustomBottomSheet';
import PrimaryButton from '../components/atoms/PrimaryButton';
import PrimaryText from '../components/atoms/PrimaryText';
import Icon from '../components/atoms/Icons';
import {isCurrencySymbolSuffix} from '../utils/numberUtils';
import {normalizeAmountInput} from '../utils/amountInput';
import {gs} from '../styles/globalStyles';

const BudgetSheet: React.FC<SheetProps<'budget-sheet'>> = React.memo(props => {
  const {t} = useTranslation();
  const colors = useThemeColors();
  const currentAmount = props.payload?.currentAmount;
  const isRecurring = props.payload?.isRecurring ?? false;
  const [amount, setAmount] = useState(currentAmount ? String(currentAmount) : '');
  const [everyMonth, setEveryMonth] = useState(isRecurring);

  const parsedAmount = Number.parseFloat(amount);
  const isValid = !Number.isNaN(parsedAmount) && parsedAmount > 0;

  const handleSave = useCallback(() => {
    if (isValid) {
      props.payload?.onSave?.(parsedAmount, everyMonth);
    }
    void SheetManager.hide(props.sheetId);
  }, [props, isValid, parsedAmount, everyMonth]);

  const handleRemove = useCallback(() => {
    props.payload?.onRemove?.();
    void SheetManager.hide(props.sheetId);
  }, [props]);

  // Shared with AmountInput. The old inline version stripped every character
  // outside [0-9.], which turned a European "12,50" into 1250 — a silent 100x
  // budget with nothing on screen to indicate it.
  const handleAmountChange = useCallback((text: string) => {
    setAmount(normalizeAmountInput(text));
  }, []);

  // Symbol sits on the side the user's locale puts it. Without a currency
  // code in the payload the check returns false — the old prefix behaviour.
  const symbolIsSuffix = isCurrencySymbolSuffix(props.payload?.currencyCode);
  const budgetSymbol = (
    <PrimaryText size={16} color={colors.secondaryText} style={symbolIsSuffix ? gs.ml8 : gs.mr8}>
      {props.payload?.currencySymbol ?? '$'}
    </PrimaryText>
  );

  return (
    <CustomBottomSheet
      sheetId={props.sheetId}
      header={{
        title: t('sheets.setBudget'),
        showCloseButton: true,
        onClosePress: () => void SheetManager.hide(props.sheetId),
      }}
      gestureEnabled>
      <View style={[gs.px20, gs.pb10, gs.pt5]}>
        {props.payload?.monthLabel ? (
          <PrimaryText size={12} color={colors.secondaryText} style={gs.mb10}>
            {everyMonth
              ? t('sheets.budgetForEveryMonth')
              : t('sheets.budgetForMonth', {month: props.payload.monthLabel})}
          </PrimaryText>
        ) : null}
        <PrimaryText size={12} color={colors.secondaryText} style={gs.mb5}>
          {t('sheets.monthlyBudgetLabel')}
        </PrimaryText>

        <View
          style={[
            gs.h48,
            gs.rounded12,
            gs.px15,
            gs.rowCenter,
            {backgroundColor: colors.secondaryAccent, borderWidth: 1.5, borderColor: 'transparent'},
          ]}>
          {!symbolIsSuffix && budgetSymbol}
          <TextInput
            style={[gs.flex1, gs.h48, gs.fontMedium, gs.noFontPadding, {color: colors.primaryText, fontSize: 16}]}
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0"
            placeholderTextColor={colors.secondaryText}
            keyboardType="decimal-pad"
            autoFocus
          />
          {symbolIsSuffix && budgetSymbol}
        </View>

        {/* One accessible node, not two: the row used to be a TouchableOpacity
            wrapping a Switch, which produced a duplicate a11y target and two
            toggle paths. The row is now the switch. */}
        <TouchableOpacity
          onPress={() => setEveryMonth(prev => !prev)}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{checked: everyMonth}}
          accessibilityLabel={t('sheets.everyMonth')}
          accessibilityHint={t('sheets.everyMonthHint')}
          style={[gs.rowBetweenCenter, gs.mt15, gs.px3]}>
          <View style={gs.flex1}>
            <PrimaryText size={13} weight="medium">
              {t('sheets.everyMonth')}
            </PrimaryText>
            <PrimaryText size={11} color={colors.secondaryText} style={gs.mt2}>
              {t('sheets.everyMonthHint')}
            </PrimaryText>
          </View>
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
            <Switch
              value={everyMonth}
              trackColor={{false: colors.secondaryAccent, true: colors.accentGreen}}
            />
          </View>
        </TouchableOpacity>

        <View style={gs.mt20}>
          <PrimaryButton
            onPress={handleSave}
            colors={colors}
            buttonTitle={currentAmount ? t('common.update') : t('sheets.setBudgetButton')}
            disabled={!isValid}
          />
        </View>

        {currentAmount ? (
          <TouchableOpacity onPress={handleRemove} style={[gs.center, gs.mt15]}>
            <View style={gs.rowCenter}>
              <Icon name="trash-2" size={14} color={colors.accentOrange} />
              <PrimaryText size={13} color={colors.accentOrange} style={gs.ml8}>
                {t('sheets.removeBudget')}
              </PrimaryText>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </CustomBottomSheet>
  );
});

export default BudgetSheet;

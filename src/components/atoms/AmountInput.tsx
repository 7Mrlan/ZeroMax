import React, {useCallback} from 'react';
import {StyleProp, TextInput, View, ViewStyle} from 'react-native';
import PrimaryText from './PrimaryText';
import useThemeColors from '../../hooks/useThemeColors';
import {useAppSelector} from '../../redux/hooks';
import {selectCurrencyCode, selectCurrencySymbol} from '../../redux/slice/currencyDataSlice';
import {isCurrencySymbolSuffix} from '../../utils/numberUtils';
import {normalizeAmountInput} from '../../utils/amountInput';
import {gs} from '../../styles/globalStyles';

interface AmountInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  /** Outer container additions (e.g. the error-dependent bottom margin). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Amount input with the currency symbol on the side the user's locale puts it
 * — "$ 1234" but "1234 kr". Previously ExpenseEntry and DebtEntry each
 * hardcoded the symbol as a prefix, disagreeing with the (already
 * locale-correct) formatted display strings for suffix currencies.
 */
const AmountInput: React.FC<AmountInputProps> = ({value, onChangeText, onBlur, style}) => {
  const colors = useThemeColors();
  // Numeric keyboards emit a comma as the decimal key in most of Europe and
  // Latin America; every consumer parses with Number(), which needs a dot.
  // Normalising here means the user sees the dot appear as they type.
  const handleChangeText = useCallback(
    (text: string) => onChangeText(normalizeAmountInput(text)),
    [onChangeText],
  );
  const currencySymbol = useAppSelector(selectCurrencySymbol);
  const currencyCode = useAppSelector(selectCurrencyCode);
  const suffix = isCurrencySymbolSuffix(currencyCode);

  const symbol = (
    <PrimaryText size={15} variant="number" color={colors.secondaryText}>
      {currencySymbol}
    </PrimaryText>
  );

  return (
    <View
      style={[
        gs.h48,
        gs.itemsCenter,
        gs.rounded12,
        gs.row,
        suffix ? gs.pr10 : gs.pl10,
        {backgroundColor: colors.secondaryAccent},
        style,
      ]}>
      {!suffix && symbol}
      <TextInput
        style={[gs.px15, gs.h48, gs.flex1, gs.numMedium, gs.noFontPadding, {color: colors.primaryText}]}
        value={value}
        onChangeText={handleChangeText}
        placeholder={'0'}
        onBlur={onBlur}
        placeholderTextColor={colors.secondaryText}
        keyboardType="decimal-pad"
      />
      {suffix && symbol}
    </View>
  );
};

export default React.memo(AmountInput);

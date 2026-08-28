import React from 'react';
import {View} from 'react-native';
import type {TFunction} from 'i18next';
import PrimaryText from './PrimaryText';
import {Colors} from '../../hooks/useThemeColors';
import {gs} from '../../styles/globalStyles';

interface DailyBudgetRowProps {
  dailyBudget: number;
  dailyLeft: number;
  isCurrentMonth: boolean;
  colors: Colors;
  formatAmount: (n: number) => string;
  t: TFunction;
}

const DailyBudgetRow = React.memo(({dailyBudget, dailyLeft, isCurrentMonth, colors, formatAmount, t}: DailyBudgetRowProps) => {
  const exceeded = dailyLeft < 0;
  const dailyLabel = `~${formatAmount(Math.round(dailyBudget))}/${t('home.perDay')}`;

  if (!isCurrentMonth) {
    return (
      <PrimaryText size={11} variant="number" color={colors.secondaryText}>
        {dailyLabel}
      </PrimaryText>
    );
  }

  return (
    <View style={gs.rowCenter}>
      <PrimaryText size={11} variant="number" color={colors.secondaryText}>
        {dailyLabel}
      </PrimaryText>
      <PrimaryText size={11} color={colors.secondaryText}>{' · '}</PrimaryText>
      <PrimaryText
        size={11}
        weight="semibold"
        variant="number"
        color={exceeded ? colors.accentOrange : colors.accentGreen}>
        {exceeded
          ? formatAmount(Math.round(Math.abs(dailyLeft))) + ' ' + t('home.overToday')
          : formatAmount(Math.round(dailyLeft)) + ' ' + t('home.leftToday')}
      </PrimaryText>
    </View>
  );
});

export default DailyBudgetRow;

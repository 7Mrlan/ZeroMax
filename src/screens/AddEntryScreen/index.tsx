import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import ExpenseEntry from '../../components/molecules/ExpenseEntry';
import IncomeEntry from '../../components/molecules/IncomeEntry';
import useThemeColors from '../../hooks/useThemeColors';
import {useTranslation} from 'react-i18next';
import {gs} from '../../styles/globalStyles';

type EntryMode = 'expense' | 'income';

const AddEntryScreen = () => {
  const colors = useThemeColors();
  const {t} = useTranslation();
  const [mode, setMode] = useState<EntryMode>('expense');

  return (
    <View style={gs.flex1}>
      <View style={[gs.rowCenter, gs.px16, gs.pt10, {backgroundColor: colors.primaryBackground}]}>
        <Pressable
          onPress={() => setMode('expense')}
          style={[
            gs.flex1,
            gs.py8,
            gs.rounded12,
            {backgroundColor: mode === 'expense' ? colors.primaryText : colors.secondaryAccent},
          ]}>
          <Text style={[gs.textCenter, {color: mode === 'expense' ? colors.buttonText : colors.primaryText}]}>
            {t('entry.expense')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('income')}
          style={[
            gs.flex1,
            gs.py8,
            gs.rounded12,
            gs.ml8,
            {backgroundColor: mode === 'income' ? colors.primaryText : colors.secondaryAccent},
          ]}>
          <Text style={[gs.textCenter, {color: mode === 'income' ? colors.buttonText : colors.primaryText}]}>
            {t('entry.income')}
          </Text>
        </Pressable>
      </View>
      {mode === 'expense' ? <ExpenseEntry type="Add" /> : <IncomeEntry />}
    </View>
  );
};

export default AddEntryScreen;

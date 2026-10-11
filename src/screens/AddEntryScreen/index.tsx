import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import ExpenseEntry from '../../components/molecules/ExpenseEntry';
import IncomeEntry from '../../components/molecules/IncomeEntry';
import useThemeColors from '../../hooks/useThemeColors';
import {useTranslation} from 'react-i18next';
import {gs} from '../../styles/globalStyles';

type EntryMode = 'expense' | 'income';

const entryStyles = StyleSheet.create({
  segment: {borderRadius: 12},
  indicator: {position: 'absolute', top: 10, height: 34, borderRadius: 12},
  transparent: {backgroundColor: 'transparent'},
});

const AddEntryScreen = () => {
  const colors = useThemeColors();
  const {t} = useTranslation();
  const [mode, setMode] = useState<EntryMode>('expense');
  const [segmentWidth, setSegmentWidth] = useState(0);
  const indicatorProgress = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  const switchMode = (nextMode: EntryMode) => {
    if (nextMode === mode) return;
    indicatorProgress.value = withTiming(nextMode === 'income' ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
    contentOpacity.value = 0;
    setMode(nextMode);
    requestAnimationFrame(() => {
      contentOpacity.value = withTiming(1, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      });
    });
  };

  const indicatorStyle = useAnimatedStyle(
    () => ({
      opacity: segmentWidth > 0 ? 1 : 0,
      width: segmentWidth / 2 - 4,
      backgroundColor: colors.primaryText,
      transform: [{translateX: indicatorProgress.value * (segmentWidth / 2)}],
    }),
    [colors.primaryText, segmentWidth],
  );
  const contentStyle = useAnimatedStyle(() => ({opacity: contentOpacity.value}));

  return (
    <View style={gs.flex1}>
      <View
        onLayout={event => setSegmentWidth(event.nativeEvent.layout.width)}
        style={[gs.rowCenter, gs.px16, gs.pt10, entryStyles.segment]}>
        <Animated.View pointerEvents="none" style={[entryStyles.indicator, indicatorStyle]} />
        <Pressable
          onPress={() => switchMode('expense')}
          testID="add-entry-expense-tab"
          accessibilityRole="tab"
          accessibilityLabel={t('entry.expense')}
          accessibilityState={{selected: mode === 'expense'}}
          style={[gs.flex1, gs.py8, gs.rounded12, entryStyles.transparent]}>
          <Text style={[gs.textCenter, {color: mode === 'expense' ? colors.buttonText : colors.primaryText}]}>
            {t('entry.expense')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => switchMode('income')}
          testID="add-entry-income-tab"
          accessibilityRole="tab"
          accessibilityLabel={t('entry.income')}
          accessibilityState={{selected: mode === 'income'}}
          style={[gs.flex1, gs.py8, gs.rounded12, gs.ml8, entryStyles.transparent]}>
          <Text style={[gs.textCenter, {color: mode === 'income' ? colors.buttonText : colors.primaryText}]}>
            {t('entry.income')}
          </Text>
        </Pressable>
      </View>
      <Animated.View style={[gs.flex1, contentStyle]}>
        {mode === 'expense' ? <ExpenseEntry type="Add" /> : <IncomeEntry />}
      </Animated.View>
    </View>
  );
};

export default AddEntryScreen;

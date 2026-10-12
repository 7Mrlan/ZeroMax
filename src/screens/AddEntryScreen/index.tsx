import React, {useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import ExpenseEntry from '../../components/molecules/ExpenseEntry';
import IncomeEntry from '../../components/molecules/IncomeEntry';
import useThemeColors from '../../hooks/useThemeColors';
import {useTranslation} from 'react-i18next';
import {gs} from '../../styles/globalStyles';
import useAnimationFrameSession from '../../hooks/useAnimationFrameSession';

type EntryMode = 'expense' | 'income';

const entryStyles = StyleSheet.create({
  segment: {borderRadius: 12},
  indicator: {position: 'absolute', top: 10, height: 34, borderRadius: 12},
  transparent: {backgroundColor: 'transparent'},
  formViewport: {flex: 1, position: 'relative'},
  formLayer: StyleSheet.absoluteFill,
});

const AddEntryScreen = () => {
  const colors = useThemeColors();
  const {t} = useTranslation();
  const [mode, setMode] = useState<EntryMode>('expense');
  const [visitedModes, setVisitedModes] = useState<Record<EntryMode, boolean>>({expense: true, income: false});
  const [segmentWidth, setSegmentWidth] = useState(0);
  const modeProgress = useSharedValue(0);
  const {start: startAnimationSession} = useAnimationFrameSession('animation.entry_switch');

  const switchMode = useCallback(
    (nextMode: EntryMode) => {
      if (nextMode === mode) return;
      startAnimationSession();
      modeProgress.value = withTiming(nextMode === 'income' ? 1 : 0, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      });
      setVisitedModes(current => (current[nextMode] ? current : {...current, [nextMode]: true}));
      setMode(nextMode);
    },
    [mode, modeProgress, startAnimationSession],
  );

  const indicatorStyle = useAnimatedStyle(
    () => ({
      opacity: segmentWidth > 0 ? 1 : 0,
      width: segmentWidth / 2 - 4,
      backgroundColor: colors.primaryText,
      transform: [{translateX: modeProgress.value * (segmentWidth / 2)}],
    }),
    [colors.primaryText, modeProgress, segmentWidth],
  );
  const expenseFormStyle = useAnimatedStyle(() => ({
    opacity: interpolate(modeProgress.value, [0, 1], [1, 0]),
    transform: [{translateX: interpolate(modeProgress.value, [0, 1], [0, -12])}],
  }));
  const incomeFormStyle = useAnimatedStyle(() => ({
    opacity: interpolate(modeProgress.value, [0, 1], [0, 1]),
    transform: [{translateX: interpolate(modeProgress.value, [0, 1], [12, 0])}],
  }));

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
      <View style={entryStyles.formViewport}>
        {visitedModes.expense ? (
          <Animated.View
            style={[entryStyles.formLayer, expenseFormStyle]}
            pointerEvents={mode === 'expense' ? 'auto' : 'none'}
            accessibilityElementsHidden={mode !== 'expense'}
            importantForAccessibility={mode === 'expense' ? 'yes' : 'no-hide-descendants'}>
            <ExpenseEntry type="Add" />
          </Animated.View>
        ) : null}
        {visitedModes.income ? (
          <Animated.View
            style={[entryStyles.formLayer, incomeFormStyle]}
            pointerEvents={mode === 'income' ? 'auto' : 'none'}
            accessibilityElementsHidden={mode !== 'income'}
            importantForAccessibility={mode === 'income' ? 'yes' : 'no-hide-descendants'}>
            <IncomeEntry />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
};

export default AddEntryScreen;

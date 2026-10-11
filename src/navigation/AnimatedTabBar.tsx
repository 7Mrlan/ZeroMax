import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import useThemeColors from '../hooks/useThemeColors';

const styles = StyleSheet.create({
  bar: {position: 'relative', flexDirection: 'row', paddingHorizontal: 8, paddingTop: 6},
  item: {flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58, zIndex: 1},
  indicator: {position: 'absolute', top: 6, bottom: 6, borderRadius: 16},
});

const AnimatedTabBar = ({state, descriptors, navigation}: BottomTabBarProps) => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = useSharedValue(state.index);
  const tabWidth = barWidth > 0 ? barWidth / state.routes.length : 0;

  useEffect(() => {
    activeIndex.value = withTiming(state.index, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [activeIndex, state.index]);

  const indicatorStyle = useAnimatedStyle(
    () => ({
      width: Math.max(tabWidth - 12, 0),
      opacity: tabWidth > 0 ? 1 : 0,
      backgroundColor: colors.secondaryAccent,
      transform: [{translateX: activeIndex.value * tabWidth + 6}],
    }),
    [colors.secondaryAccent, tabWidth],
  );

  return (
    <View
      onLayout={event => setBarWidth(event.nativeEvent.layout.width)}
      style={[styles.bar, {backgroundColor: colors.containerColor, paddingBottom: Math.max(insets.bottom, 8)}]}>
      <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        const options = descriptor.options;
        const focused = state.index === index;
        const color = focused ? colors.accentGreen : colors.primaryText;
        const onPress = () => {
          const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        };
        const onLongPress = () => navigation.emit({type: 'tabLongPress', target: route.key});

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={focused ? {selected: true} : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.item}>
            {options.tabBarIcon?.({focused, color, size: 24})}
          </Pressable>
        );
      })}
    </View>
  );
};

export default AnimatedTabBar;

import {TouchableOpacity} from 'react-native-gesture-handler';
import React, {useCallback, useMemo, useRef, memo} from 'react';
import {View, type AccessibilityActionEvent} from 'react-native';
import Animated, {SharedValue, useAnimatedStyle, interpolate} from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type {SwipeableMethods} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from './Icons';
import {gs} from '../../styles/globalStyles';
import {useTranslation} from 'react-i18next';

const ACTION_WIDTH = 50;
const EDGE_INSET = 16;

interface SwipeableRowProps {
  onEdit?: () => void;
  onDelete?: () => void;
  /** Screen-reader labels; swipe is otherwise the only affordance. */
  editLabel?: string;
  deleteLabel?: string;
  children: React.ReactNode;
  colors: {
    accentGreen: string;
    accentOrange: string;
    lightAccent: string;
  };
  swipeRef?: React.RefObject<SwipeableMethods | null>;
  openSwipeableRef?: React.RefObject<{close: () => void} | null>;
  edgeToEdge?: boolean;
}

const SwipeAction = memo(({
  progress,
  iconName,
  iconColor,
  backgroundColor,
  side,
  onPress,
  accessibilityLabel,
  edgeToEdge = false,
}: {
  progress: SharedValue<number>;
  iconName: string;
  iconColor: string;
  backgroundColor: string;
  side: 'left' | 'right';
  onPress: () => void;
  accessibilityLabel: string;
  edgeToEdge?: boolean;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6, 1], [0, 0.8, 1]),
    transform: [{scale: interpolate(progress.value, [0, 1], [0.6, 1])}],
  }));

  const extraPadding = edgeToEdge ? EDGE_INSET : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        gs.center,
        {
          flex: 1,
          width: ACTION_WIDTH + extraPadding,
          paddingLeft: side === 'left' ? extraPadding : 0,
          paddingRight: side === 'right' ? extraPadding : 0,
        },
      ]}>
      <Animated.View style={[gs.size40, gs.roundedFull, gs.center, animatedStyle, {backgroundColor}]}>
        <Icon name={iconName} size={18} color={iconColor} />
      </Animated.View>
    </TouchableOpacity>
  );
});

const SwipeableRow: React.FC<SwipeableRowProps> = memo(({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  children,
  colors,
  swipeRef,
  openSwipeableRef,
  edgeToEdge = false,
}) => {
  const {t} = useTranslation();
  const localRef = useRef<SwipeableMethods | null>(null);
  const combinedRef = swipeRef ?? localRef;

  const handleSwipeWillOpen = useCallback(() => {
    if (openSwipeableRef?.current && openSwipeableRef.current !== combinedRef.current) {
      openSwipeableRef.current.close();
    }
    if (openSwipeableRef) {
      openSwipeableRef.current = combinedRef.current;
    }
  }, [openSwipeableRef, combinedRef]);

  /**
   * Accessibility actions are the ONLY way a screen-reader user can reach edit
   * and delete. The action buttons behind the row are labelled, but they are
   * revealed by a pan gesture that TalkBack and VoiceOver intercept, so
   * without this the rows were read-only for anyone using one — in an app
   * where swipe is the sole affordance for both operations.
   *
   * With this, VoiceOver exposes them via the rotor's Actions and TalkBack via
   * its local context menu.
   */
  const accessibilityActions = useMemo(() => {
    const actions: Array<{name: string; label: string}> = [];
    if (onEdit) {
      actions.push({name: 'edit', label: editLabel ?? t('common.edit')});
    }
    if (onDelete) {
      actions.push({name: 'delete', label: deleteLabel ?? t('common.delete')});
    }
    return actions;
  }, [onEdit, onDelete, editLabel, deleteLabel, t]);

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'edit') {
        onEdit?.();
      } else if (event.nativeEvent.actionName === 'delete') {
        onDelete?.();
      }
    },
    [onEdit, onDelete],
  );

  const content =
    accessibilityActions.length > 0 ? (
      <View
        accessible={false}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}>
        {children}
      </View>
    ) : (
      children
    );

  return (
    <ReanimatedSwipeable
      ref={combinedRef}
      renderLeftActions={
        onEdit
          ? (progress, _translation, swipeableMethods) => (
              <SwipeAction
                progress={progress}
                iconName="pencil"
                iconColor={colors.accentGreen}
                backgroundColor={colors.lightAccent}
                side="left"
                accessibilityLabel={editLabel ?? t('common.edit')}
                edgeToEdge={edgeToEdge}
                onPress={() => {
                  onEdit();
                  swipeableMethods.close();
                }}
              />
            )
          : undefined
      }
      renderRightActions={
        onDelete
          ? (progress, _translation, swipeableMethods) => (
              <SwipeAction
                progress={progress}
                iconName="trash-2"
                iconColor={colors.accentOrange}
                backgroundColor={colors.lightAccent}
                side="right"
                accessibilityLabel={deleteLabel ?? t('common.delete')}
                edgeToEdge={edgeToEdge}
                onPress={() => {
                  onDelete();
                  swipeableMethods.close();
                }}
              />
            )
          : undefined
      }
      onSwipeableWillOpen={handleSwipeWillOpen}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      overshootFriction={8}>
      {content}
    </ReanimatedSwipeable>
  );
});

export default SwipeableRow;
export type {SwipeableRowProps};

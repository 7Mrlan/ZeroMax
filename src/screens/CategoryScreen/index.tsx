import {RefreshControl, View} from 'react-native';
import {TouchableOpacity} from 'react-native-gesture-handler';
import React, {useCallback, useMemo, useRef, useState, memo} from 'react';
import {useTranslation} from 'react-i18next';
import type {SwipeableMethods} from 'react-native-gesture-handler/ReanimatedSwipeable';
import {navigate} from '../../utils/navigationUtils';
import Icon from '../../components/atoms/Icons';
import HeaderContainer from '../../components/molecules/HeaderContainer';
import useCategory from './useCategory';
import useSwipeTutorial from '../../hooks/useSwipeTutorial';
import SwipeTutorialTooltip from '../../components/atoms/SwipeTutorialTooltip';
import PrimaryView from '../../components/atoms/PrimaryView';
import PrimaryText from '../../components/atoms/PrimaryText';
import SwipeableRow from '../../components/atoms/SwipeableRow';
import {CategoryData as Category} from '../../watermelondb/services';
import EmptyState from '../../components/atoms/EmptyState';
import {Colors} from '../../hooks/useThemeColors';
import {FlashList} from '@shopify/flash-list';
import {gs, hitSlop} from '../../styles/globalStyles';
import {hexToRgba} from '../../utils/colorUtils';

const CategoryRow = memo(
  ({
    category,
    colors,
    onEdit,
    onDelete,
    onToggle,
    depth,
    hasChildren,
    expanded,
    openSwipeableRef,
    tutorialSwipeRef,
  }: {
    category: Category;
    colors: Colors;
    onEdit: (id: string, name: string, icon: string, color: string) => void;
    onDelete: (id: string) => void;
    onToggle: () => void;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    openSwipeableRef: React.RefObject<{close: () => void} | null>;
    tutorialSwipeRef?: React.RefObject<SwipeableMethods | null>;
  }) => {
    const handleEdit = useCallback(() => {
      onEdit(String(category.id), category.name, category.icon ?? '', category.color ?? colors.primaryText);
    }, [onEdit, category, colors.primaryText]);

    const handleDelete = useCallback(() => {
      onDelete(category.id);
    }, [onDelete, category.id]);

    return (
      <View style={gs.mb5}>
        <SwipeableRow
          onEdit={handleEdit}
          onDelete={handleDelete}
          colors={colors}
          swipeRef={tutorialSwipeRef}
          openSwipeableRef={openSwipeableRef}>
          <View
            style={[
              gs.rounded12,
              gs.rowCenter,
              gs.px14,
              gs.py12,
              {backgroundColor: colors.containerColor, marginLeft: depth * 18},
            ]}>
            <View
              style={[
                gs.size36,
                gs.rounded10,
                gs.center,
                {backgroundColor: hexToRgba(category.color || colors.primaryText, 0.094)},
              ]}>
              <Icon name={category.icon || 'shapes'} size={18} color={category.color || colors.primaryText} />
            </View>
            <TouchableOpacity
              onPress={onToggle}
              disabled={!hasChildren}
              style={[gs.rowCenter, gs.flex1]}
              testID={`category-row-${String(category.id)}`}
              accessibilityRole={hasChildren ? 'button' : 'text'}
              accessibilityLabel={category.name}
              accessibilityState={hasChildren ? {expanded} : undefined}>
              <PrimaryText weight="medium" size={14} style={gs.ml12} numberOfLines={1}>
                {category.name}
              </PrimaryText>
              {hasChildren ? <Icon name="chevron-down" size={16} color={colors.secondaryText} /> : null}
            </TouchableOpacity>
          </View>
        </SwipeableRow>
      </View>
    );
  },
);

const CategoryScreen = () => {
  const {colors, refreshing, onRefresh, categories, handleEdit, handleDelete} = useCategory();
  const {t} = useTranslation();
  const openSwipeableRef = useRef<{close: () => void} | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const visibleCategories = useMemo(() => {
    const childrenByParent = new Map<string, Category[]>();
    for (const category of categories) {
      if (category.parentId) {
        childrenByParent.set(category.parentId, [...(childrenByParent.get(category.parentId) ?? []), category]);
      }
    }
    return categories.flatMap(category => {
      if (category.parentId) return [];
      const children = childrenByParent.get(category.id) ?? [];
      const root = {category, depth: 0, hasChildren: children.length > 0};
      return expandedIds.has(category.id)
        ? [root, ...children.map(child => ({category: child, depth: 1, hasChildren: false}))]
        : [root];
    });
  }, [categories, expandedIds]);
  const {shouldShowTutorial, tutorialRef, dismissTutorial} = useSwipeTutorial({
    screen: 'category',
    itemCount: categories.length,
  });

  const renderCategoryItem = useCallback(
    ({item, index}: {item: (typeof visibleCategories)[number]; index: number}) => (
      <CategoryRow
        category={item.category}
        colors={colors}
        onEdit={handleEdit}
        onDelete={handleDelete}
        depth={item.depth}
        hasChildren={item.hasChildren}
        expanded={expandedIds.has(item.category.id)}
        onToggle={() =>
          setExpandedIds(current => {
            const next = new Set(current);
            if (next.has(item.category.id)) next.delete(item.category.id);
            else next.add(item.category.id);
            return next;
          })
        }
        openSwipeableRef={openSwipeableRef}
        tutorialSwipeRef={index === 0 ? tutorialRef : undefined}
      />
    ),
    [colors, expandedIds, handleEdit, handleDelete, tutorialRef],
  );

  const ListEmptyComponent = useCallback(
    () => <EmptyState colors={colors} type={'Categories'} style={gs.mt30p} />,
    [colors],
  );

  return (
    <>
      <PrimaryView colors={colors} useSidePadding={false} useBottomPadding={false}>
        <View style={[gs.mb15, gs.px16]}>
          <HeaderContainer testID="categories-screen-header" headerText={t('categories.title')} />
        </View>
        {shouldShowTutorial && <SwipeTutorialTooltip onDismiss={dismissTutorial} />}
        <View style={gs.flex1}>
          <FlashList
            data={visibleCategories}
            renderItem={renderCategoryItem}
            keyExtractor={item => String(item.category.id)}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={ListEmptyComponent}
            contentContainerStyle={{...gs.px16, ...gs.pb100}}
          />
        </View>
      </PrimaryView>
      <View style={[gs.absolute, gs.bottom15, gs.right15, gs.zIndex1]}>
        <TouchableOpacity
          style={[gs.size50, gs.roundedFull, gs.center, {backgroundColor: colors.primaryText}]}
          onPress={() => navigate('AddCategoryScreen', {})}
          testID="categories-add"
          hitSlop={hitSlop}
          accessibilityLabel={t('categories.addCategory')}
          accessibilityRole="button">
          <Icon name="plus" size={24} color={colors.buttonText} />
        </TouchableOpacity>
      </View>
    </>
  );
};

export default CategoryScreen;

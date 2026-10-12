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
import useFormatAmount from '../../hooks/useFormatAmount';

const CategoryRow = memo(
  ({
    category,
    colors,
    onEdit,
    onDelete,
    onOpen,
    onRestore,
    onToggle,
    depth,
    hasChildren,
    expanded,
    openSwipeableRef,
    tutorialSwipeRef,
    totalAmount,
    formatAmount,
    isDeleted,
  }: {
    category: Category;
    colors: Colors;
    onEdit?: (id: string, name: string, icon: string, color: string) => void;
    onDelete?: (id: string) => void;
    onOpen: (id: string, name: string, icon: string, color: string, kind: 'expense' | 'income') => void;
    onRestore: (id: string) => void;
    onToggle: () => void;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    openSwipeableRef: React.RefObject<{close: () => void} | null>;
    tutorialSwipeRef?: React.RefObject<SwipeableMethods | null>;
    totalAmount: number;
    formatAmount: (amount: number) => string;
    isDeleted: boolean;
  }) => {
    const {t} = useTranslation();
    const handleEdit = useCallback(() => {
      onEdit?.(String(category.id), category.name, category.icon ?? '', category.color ?? colors.primaryText);
    }, [onEdit, category, colors.primaryText]);

    const handleDelete = useCallback(() => {
      onDelete?.(category.id);
    }, [onDelete, category.id]);
    const handleRestore = useCallback(() => {
      onRestore(category.id);
    }, [category.id, onRestore]);
    const handleOpen = useCallback(() => {
      onOpen(category.id, category.name, category.icon ?? '', category.color ?? colors.primaryText, category.kind);
    }, [category, colors.primaryText, onOpen]);

    return (
      <View style={gs.mb5}>
        <SwipeableRow
          onEdit={isDeleted ? undefined : handleEdit}
          onDelete={isDeleted ? undefined : handleDelete}
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
              isDeleted && gs.opacity60,
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
            {totalAmount > 0 ? (
              <PrimaryText size={12} color={colors.secondaryText} variant="number" style={gs.mr5}>
                {formatAmount(totalAmount)}
              </PrimaryText>
            ) : null}
            {isDeleted ? (
              <TouchableOpacity
                onPress={handleRestore}
                style={[gs.size32, gs.center]}
                testID={`category-restore-${String(category.id)}`}
                accessibilityRole="button"
                accessibilityLabel={t('categories.restore', {name: category.name})}>
                <Icon name="undo-2" size={16} color={colors.accentGreen} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleOpen}
              style={[gs.size32, gs.center]}
              testID={`category-details-${String(category.id)}`}
              accessibilityRole="button"
              accessibilityLabel={t('categories.openDetails', {name: category.name})}>
              <Icon name="chevron-right" size={16} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>
        </SwipeableRow>
      </View>
    );
  },
);

const CategoryScreen = () => {
  const {
    colors,
    refreshing,
    onRefresh,
    categories,
    allCategories,
    deletedCategories,
    categoryTotals,
    handleEdit,
    handleOpen,
    handleDelete,
    handleRestore,
  } = useCategory();
  const {t} = useTranslation();
  const formatAmount = useFormatAmount();
  const openSwipeableRef = useRef<{close: () => void} | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showDeleted, setShowDeleted] = useState(false);
  const sourceCategories = showDeleted ? allCategories : categories;
  const visibleCategories = useMemo(() => {
    const childrenByParent = new Map<string, Category[]>();
    for (const category of sourceCategories) {
      if (category.parentId) {
        childrenByParent.set(category.parentId, [...(childrenByParent.get(category.parentId) ?? []), category]);
      }
    }
    return sourceCategories.flatMap(category => {
      if (category.parentId) return [];
      const children = childrenByParent.get(category.id) ?? [];
      const root = {category, depth: 0, hasChildren: children.length > 0};
      return expandedIds.has(category.id)
        ? [root, ...children.map(child => ({category: child, depth: 1, hasChildren: false}))]
        : [root];
    });
  }, [expandedIds, sourceCategories]);
  const {shouldShowTutorial, tutorialRef, dismissTutorial} = useSwipeTutorial({
    screen: 'category',
    itemCount: sourceCategories.length,
  });

  const renderCategoryItem = useCallback(
    ({item, index}: {item: (typeof visibleCategories)[number]; index: number}) => (
      <CategoryRow
        category={item.category}
        colors={colors}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onOpen={handleOpen}
        onRestore={handleRestore}
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
        totalAmount={categoryTotals.get(item.category.id) ?? 0}
        formatAmount={formatAmount}
        isDeleted={!item.category.categoryStatus}
      />
    ),
    [
      categoryTotals,
      colors,
      expandedIds,
      formatAmount,
      handleDelete,
      handleEdit,
      handleOpen,
      handleRestore,
      tutorialRef,
    ],
  );

  const ListEmptyComponent = useCallback(
    () => <EmptyState colors={colors} type={'Categories'} style={gs.mt30p} />,
    [colors],
  );

  return (
    <>
      <PrimaryView colors={colors} useSidePadding={false} useBottomPadding={false}>
        <View style={[gs.mb15, gs.px16]}>
          <View style={gs.rowBetweenCenter}>
            <View style={gs.flex1}>
              <HeaderContainer testID="categories-screen-header" headerText={t('categories.title')} />
            </View>
            {deletedCategories.length > 0 ? (
              <TouchableOpacity
                onPress={() => setShowDeleted(current => !current)}
                testID="categories-toggle-deleted"
                accessibilityRole="button"
                accessibilityState={{expanded: showDeleted}}
                accessibilityLabel={t(showDeleted ? 'categories.hideDeleted' : 'categories.showDeleted', {
                  count: deletedCategories.length,
                })}>
                <PrimaryText size={11} color={colors.secondaryText}>
                  {t(showDeleted ? 'categories.hideDeleted' : 'categories.showDeleted', {
                    count: deletedCategories.length,
                  })}
                </PrimaryText>
              </TouchableOpacity>
            ) : null}
          </View>
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

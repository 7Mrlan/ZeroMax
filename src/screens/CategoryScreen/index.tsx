import {RefreshControl, View} from 'react-native';
import {TouchableOpacity} from 'react-native-gesture-handler';
import React, {useCallback, useRef, memo} from 'react';
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

const CategoryRow = memo(({
  category,
  colors,
  onEdit,
  onDelete,
  openSwipeableRef,
  tutorialSwipeRef,
}: {
  category: Category;
  colors: Colors;
  onEdit: (id: string, name: string, icon: string, color: string) => void;
  onDelete: (id: string) => void;
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
            {backgroundColor: colors.containerColor},
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
          <PrimaryText weight="medium" size={14} style={gs.ml12} numberOfLines={1}>
            {category.name}
          </PrimaryText>
        </View>
      </SwipeableRow>
    </View>
  );
});

const CategoryScreen = () => {
  const {colors, refreshing, onRefresh, categories, handleEdit, handleDelete} = useCategory();
  const {t} = useTranslation();
  const openSwipeableRef = useRef<{close: () => void} | null>(null);
  const {shouldShowTutorial, tutorialRef, dismissTutorial} = useSwipeTutorial({screen: 'category', itemCount: categories.length});

  const renderCategoryItem = useCallback(
    ({item: category, index}: {item: Category; index: number}) => (
      <CategoryRow
        category={category}
        colors={colors}
        onEdit={handleEdit}
        onDelete={handleDelete}
        openSwipeableRef={openSwipeableRef}
        tutorialSwipeRef={index === 0 ? tutorialRef : undefined}
      />
    ),
    [colors, handleEdit, handleDelete, tutorialRef],
  );

  const ListEmptyComponent = useCallback(
    () => <EmptyState colors={colors} type={'Categories'} style={gs.mt30p} />,
    [colors],
  );

  return (
    <>
      <PrimaryView colors={colors} useSidePadding={false} useBottomPadding={false}>
        <View style={[gs.mb15, gs.px16]}>
          <HeaderContainer headerText={t('categories.title')} />
        </View>
        {shouldShowTutorial && <SwipeTutorialTooltip onDismiss={dismissTutorial} />}
        <View style={gs.flex1}>
          <FlashList
            data={categories}
            renderItem={renderCategoryItem}
            keyExtractor={item => String(item.id)}
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
          onPress={() => navigate('AddCategoryScreen')}
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

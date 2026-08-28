import {TouchableOpacity, View} from 'react-native';
import React, {useCallback, useMemo, useState, memo} from 'react';
import type {RouteProp} from '@react-navigation/native';
import {useTranslation} from 'react-i18next';
import {useDialog} from '../../context/DialogContext';
import type {HomeStackParamList} from '../../navigation/types';
import PrimaryView from '../atoms/PrimaryView';
import AppHeader from '../atoms/AppHeader';
import CustomInput from '../atoms/CustomInput';
import PrimaryText from '../atoms/PrimaryText';
import Icon from '../atoms/Icons';
import PrimaryButton from '../atoms/PrimaryButton';
import useThemeColors from '../../hooks/useThemeColors';
import {goBack} from '../../utils/navigationUtils';
import {selectUserId} from '../../redux/slice/userIdSlice';
import {createCategory, updateCategoryById} from '../../watermelondb/services';
import {fetchCategories, selectCategoryData} from '../../redux/slice/categoryDataSlice';
import {categorySchema} from '../../utils/validationSchema';
import defaultCategories from '../../../assets/jsons/defaultCategories.json';
import {FlashList} from '@shopify/flash-list';
import {SheetManager} from 'react-native-actions-sheet';
import {useAppDispatch, useAppSelector} from '../../redux/hooks';
import {gs} from '../../styles/globalStyles';

interface CategorySelection {
  name: string;
  icon?: string;
  color?: string;
}

interface CategoryEntryProps {
  type: string;
  route?: RouteProp<HomeStackParamList, 'UpdateCategoryScreen'>;
}

const CategoryEntry: React.FC<CategoryEntryProps> = ({type, route}) => {
  const {t} = useTranslation();
  const {showAlert} = useDialog();
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const categoryData = route?.params;
  const isAddButton = type === 'Add';

  const [categoryName, setCategoryName] = useState(isAddButton ? '' : categoryData?.categoryName ?? '');

  const resolveIconParam = (val?: string): string | null => {
    // 'null' is a legacy sentinel that older rows/params may still carry.
    if (!val || val === 'null' || val === '') { return null; }
    return val;
  };

  const [selectedIcon, setSelectedIcon] = useState<string | null>(
    isAddButton ? null : resolveIconParam(categoryData?.categoryIcon),
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    isAddButton ? '#808080' : resolveIconParam(categoryData?.categoryColor),
  );
  const [selectedCategories, setSelectedCategories] = useState<Array<CategorySelection>>([]);

  const selectedCategoryNames = useMemo(() => new Set(selectedCategories.map(c => c.name)), [selectedCategories]);

  const allCategories = useAppSelector(selectCategoryData);
  const existingCategoryNamesSet = useMemo(
    () => new Set((allCategories ?? []).map((category: CategorySelection) => category.name)),
    [allCategories],
  );
  const filteredCategories = useMemo(
    () => defaultCategories.filter(category => !existingCategoryNamesSet.has(category.name)),
    [existingCategoryNamesSet],
  );

  const userId = useAppSelector(selectUserId);
  const isValid = categorySchema.safeParse(categoryName).success;

  const handleAddCategory = useCallback(async () => {
    try {
      await createCategory(categoryName, userId, selectedIcon, selectedColor);
      dispatch(fetchCategories());
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error creating category:', error);
      }
    }
  }, [categoryName, userId, selectedIcon, selectedColor, dispatch]);

  const handleAddFromDefaultCategory = useCallback(async () => {
    // Was the one handler here with no try/catch: a rejected createCategory
    // skipped both the refetch and goBack, leaving the user on a screen that
    // looked like the tap did nothing at all.
    try {
      for (const category of selectedCategories) {
        await createCategory(category.name, userId, category.icon ?? null, category.color ?? null);
      }
      dispatch(fetchCategories());
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error creating default categories:', error);
      }
      // Some may have been created before the failure; refetch so the screen
      // reflects what actually landed.
      dispatch(fetchCategories());
      await showAlert({type: 'error', message: t('category.createFailed')});
    }
  }, [selectedCategories, userId, dispatch, showAlert, t]);

  const handleUpdateCategory = useCallback(async () => {
    if (!categoryData?.categoryId) { return; }
    try {
      await updateCategoryById(categoryData.categoryId, categoryName, selectedIcon ?? undefined, selectedColor ?? undefined);
      dispatch(fetchCategories());
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error updating category:', error);
      }
    }
  }, [categoryData?.categoryId, categoryName, selectedIcon, selectedColor, dispatch]);

  /** Creates the picked default chips AND the typed name, in one pass. */
  const handleAddBothDefaultsAndTyped = useCallback(async () => {
    try {
      for (const category of selectedCategories) {
        await createCategory(category.name, userId, category.icon ?? null, category.color ?? null);
      }
      await createCategory(categoryName.trim(), userId, selectedIcon, selectedColor);
      dispatch(fetchCategories());
      goBack();
    } catch (error) {
      if (__DEV__) {
        console.error('Error creating categories:', error);
      }
      dispatch(fetchCategories());
      await showAlert({type: 'error', message: t('category.createFailed')});
    }
  }, [selectedCategories, categoryName, userId, selectedIcon, selectedColor, dispatch, showAlert, t]);

  /**
   * A typed name and picked default chips are two different intents, and this
   * used to resolve the ambiguity by silently preferring the chips — the user
   * typed a category name, tapped Add, and got something else with no
   * explanation. Now both are honoured: the chips are created AND the typed
   * name is created alongside them.
   */
  const handleAddFromDefaultOrAddCategory = useCallback(async () => {
    if (!isAddButton) {
      await handleUpdateCategory();
      return;
    }

    const hasTypedName = categoryName.trim().length > 0 && isValid;

    if (selectedCategories.length === 0) {
      await handleAddCategory();
      return;
    }

    if (hasTypedName && !selectedCategoryNames.has(categoryName.trim())) {
      await handleAddBothDefaultsAndTyped();
      return;
    }

    await handleAddFromDefaultCategory();
  }, [
    isAddButton,
    categoryName,
    isValid,
    selectedCategories.length,
    selectedCategoryNames,
    handleAddBothDefaultsAndTyped,
    handleAddFromDefaultCategory,
    handleAddCategory,
    handleUpdateCategory,
  ]);

  const handleOpenIconPicker = useCallback(() => {
    SheetManager.show('icon-picker-sheet', {
      payload: {
        selectedIcon: selectedIcon ?? undefined,
        onSelect: (icon: string) => {
          setSelectedIcon(icon);
          SheetManager.hide('icon-picker-sheet');
        },
      },
    });
  }, [selectedIcon]);

  const handleOpenColorPicker = useCallback(() => {
    SheetManager.show('color-picker-sheet', {
      payload: {
        selectedColor: selectedColor ?? undefined,
        onSelect: (color: string) => {
          setSelectedColor(color);
          SheetManager.hide('color-picker-sheet');
        },
      },
    });
  }, [selectedColor]);

  const toggleCategorySelection = useCallback(
    (category: CategorySelection) => {
      if (selectedCategoryNames.has(category.name)) {
        setSelectedCategories(prev => prev.filter(item => item.name !== category.name));
      } else {
        setSelectedCategories(prev => [...prev, category]);
      }
    },
    [selectedCategoryNames],
  );

  const renderDefaultCategoryItem = useCallback(
    ({item: category}: {item: CategorySelection}) => {
      const isSelected = selectedCategoryNames.has(category.name);

      return (
        <TouchableOpacity onPress={() => toggleCategorySelection(category)} activeOpacity={0.7}>
          <View
            style={[
              gs.py8,
              gs.px14,
              gs.mr8,
              gs.mt5,
              gs.rounded12,
              gs.rowCenter,
              gs.gap6,
              {backgroundColor: isSelected ? colors.primaryText : colors.secondaryAccent},
            ]}>
            {category.icon ? (
              <Icon
                name={category.icon}
                size={16}
                color={isSelected ? colors.buttonText : (category.color ?? colors.secondaryText)}
              />
            ) : null}
            <PrimaryText
              size={13}
              weight={isSelected ? 'semibold' : 'regular'}
              color={isSelected ? colors.buttonText : colors.primaryText}>
              {category.name}
            </PrimaryText>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, selectedCategoryNames, toggleCategorySelection],
  );

  return (
    <PrimaryView colors={colors} style={gs.justifyBetween} dismissKeyboardOnTouch>
      <View>
        <View style={[gs.mb20, gs.mt20]}>
          <AppHeader onPress={goBack} colors={colors} text={isAddButton ? t('category.addTitle') : t('category.editTitle')} />
        </View>

        <CustomInput
          colors={colors}
          input={categoryName}
          setInput={setCategoryName}
          placeholder={t('category.namePlaceholder')}
          label={t('category.nameLabel')}
          schema={categorySchema}
        />

        <PrimaryText size={12} color={colors.secondaryText} style={gs.mb8}>{t('category.appearanceLabel')}</PrimaryText>
        <View style={[gs.row, gs.gap8, gs.mb15]}>
          <TouchableOpacity
            onPress={handleOpenIconPicker}
            activeOpacity={0.7}
            style={[
              gs.py10,
              gs.px14,
              gs.rounded12,
              gs.rowCenter,
              gs.gap8,
              gs.flex1,
              {backgroundColor: colors.secondaryAccent},
            ]}>
            <View
              style={[
                gs.size32,
                gs.roundedFull,
                gs.center,
                {backgroundColor: colors.containerColor},
              ]}>
              <Icon
                name={selectedIcon ?? 'shapes'}
                size={16}
                color={colors.primaryText}
              />
            </View>
            <View style={gs.flex1}>
              <PrimaryText size={11} color={colors.secondaryText}>{t('category.iconLabel')}</PrimaryText>
              <PrimaryText size={13} weight="medium">
                {selectedIcon ? t('common.change') : t('common.choose')}
              </PrimaryText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenColorPicker}
            activeOpacity={0.7}
            style={[
              gs.py10,
              gs.px14,
              gs.rounded12,
              gs.rowCenter,
              gs.gap8,
              gs.flex1,
              {backgroundColor: colors.secondaryAccent},
            ]}>
            <View
              style={[
                gs.size32,
                gs.roundedFull,
                gs.center,
                {backgroundColor: selectedColor ?? colors.accentGreen},
              ]}
            />
            <View style={gs.flex1}>
              <PrimaryText size={11} color={colors.secondaryText}>{t('category.colorLabel')}</PrimaryText>
              <PrimaryText size={13} weight="medium">
                {selectedColor ? t('common.change') : t('common.choose')}
              </PrimaryText>
            </View>
          </TouchableOpacity>
        </View>

        {filteredCategories.length !== 0 && isAddButton ? (
          <>
            <View style={[gs.rowCenter, gs.gap8, gs.mb8]}>
              <View style={[gs.flex1, {height: 0.5, backgroundColor: colors.secondaryAccent}]} />
              <PrimaryText size={11} color={colors.secondaryText}>{t('category.orPickFromDefaults')}</PrimaryText>
              <View style={[gs.flex1, {height: 0.5, backgroundColor: colors.secondaryAccent}]} />
            </View>
            <View style={[gs.minH55, gs.mt5]}>
              <FlashList
                data={filteredCategories}
                renderItem={renderDefaultCategoryItem}
                keyExtractor={item => item.name}
                scrollEnabled={false}
                horizontal
              />
            </View>
          </>
        ) : null}
      </View>

      <PrimaryButton
        onPress={handleAddFromDefaultOrAddCategory}
        colors={colors}
        buttonTitle={isAddButton ? t('common.add') : t('common.update')}
        disabled={!isValid && selectedCategories.length === 0}
      />
    </PrimaryView>
  );
};

export default memo(CategoryEntry);

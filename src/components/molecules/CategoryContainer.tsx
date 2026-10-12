import {TouchableOpacity, View} from 'react-native';
import React from 'react';
import Icon from '../atoms/Icons';
import PrimaryText from '../atoms/PrimaryText';
import {Colors} from '../../hooks/useThemeColors';
import {gs} from '../../styles/globalStyles';
import {formatCategoryLabel} from '../../utils/categoryLabel';

interface Category {
  id?: string;
  _id?: string;
  name: string;
  icon?: string;
  color?: string;
  categoryStatus?: boolean;
  userId?: string;
  parentName?: string | null;
}

interface CategoryContainerProps {
  categories: Array<Category>;
  toggleCategorySelection(category: Category): void;
  colors: Colors;
  selectedCategories: Array<Category>;
}

const CategoryContainer: React.FC<CategoryContainerProps> = React.memo(
  ({categories, colors, toggleCategorySelection, selectedCategories}) => {
    const selectedKey = selectedCategories[0]
      ? String(selectedCategories[0].id || selectedCategories[0]._id || selectedCategories[0].name)
      : null;

    return (
      <View style={[gs.row, gs.wrap]}>
        {categories.map(category => {
          const categoryKey = String(category.id || category._id || category.name);
          const isSelected = categoryKey === selectedKey;
          const label = formatCategoryLabel(category.name, category.parentName);

          return (
            <TouchableOpacity
              key={categoryKey}
              onPress={() => toggleCategorySelection(category)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{selected: isSelected}}>
              <View
                style={[
                  gs.py8,
                  gs.px14,
                  gs.mr8,
                  gs.mb8,
                  gs.rounded12,
                  gs.rowCenter,
                  gs.gap6,
                  {backgroundColor: isSelected ? colors.primaryText : colors.secondaryAccent},
                ]}>
                {!!category.icon && (
                  <Icon
                    name={category.icon}
                    size={16}
                    color={isSelected ? colors.buttonText : category.color || colors.secondaryText}
                  />
                )}
                <PrimaryText
                  size={13}
                  weight={isSelected ? 'semibold' : 'regular'}
                  color={isSelected ? colors.buttonText : colors.primaryText}>
                  {label}
                </PrimaryText>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  },
);

export default CategoryContainer;

import {ScrollView, TouchableOpacity, View} from 'react-native';
import React from 'react';
import {useTranslation} from 'react-i18next';
import PrimaryButton from '../../components/atoms/PrimaryButton';
import defaultCategories from '../../../assets/jsons/defaultCategories.json';
import useOnboarding from './useOnboarding';
import PrimaryView from '../../components/atoms/PrimaryView';
import PrimaryText from '../../components/atoms/PrimaryText';
import Icon from '../../components/atoms/Icons';
import {gs} from '../../styles/globalStyles';

interface CategoryData {
  name: string;
  icon?: string;
  color?: string;
}

const defaultCategoryKeys: Record<string, string> = {
  Food: 'food',
  Transportation: 'transportation',
  Entertainment: 'entertainment',
  Healthcare: 'healthcare',
  Shopping: 'shopping',
  Travel: 'travel',
  Utilities: 'utilities',
  Education: 'education',
  Gifts: 'gifts',
  Other: 'other',
};
type DefaultCategoryKey =
  | 'food'
  | 'transportation'
  | 'entertainment'
  | 'healthcare'
  | 'shopping'
  | 'travel'
  | 'utilities'
  | 'education'
  | 'gifts'
  | 'other';

const OnboardingScreen = () => {
  const {colors, handleSkip, handleSubmit, isSubmitting, toggleCategorySelection, isCategorySelected} = useOnboarding();
  const {t} = useTranslation();
  const localizedDefaults: Record<DefaultCategoryKey, string> = {
    food: t('defaultCategories.food'),
    transportation: t('defaultCategories.transportation'),
    entertainment: t('defaultCategories.entertainment'),
    healthcare: t('defaultCategories.healthcare'),
    shopping: t('defaultCategories.shopping'),
    travel: t('defaultCategories.travel'),
    utilities: t('defaultCategories.utilities'),
    education: t('defaultCategories.education'),
    gifts: t('defaultCategories.gifts'),
    other: t('defaultCategories.other'),
  };

  return (
    <PrimaryView colors={colors} style={gs.justifyBetween}>
      <View style={gs.flex1}>
        <TouchableOpacity style={[gs.selfEnd, gs.pt5p]} onPress={handleSkip}>
          <PrimaryText size={13} weight="medium" color={colors.secondaryText}>
            {t('common.skip')}
          </PrimaryText>
        </TouchableOpacity>

        <View style={gs.pt10p}>
          <PrimaryText size={28} weight="bold">
            {t('onboarding.title')}
          </PrimaryText>
          <PrimaryText size={28} weight="bold">
            {t('onboarding.titleSuffix')}
          </PrimaryText>
        </View>

        <PrimaryText size={14} color={colors.secondaryText} style={[gs.mt6, gs.mb20]}>
          {t('onboarding.subtitle')}
        </PrimaryText>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[gs.row, gs.wrap, gs.pb80]}>
          {defaultCategories?.map((category: CategoryData) => {
            const defaultKey = defaultCategoryKeys[category.name] as DefaultCategoryKey | undefined;
            const localizedName = defaultKey ? localizedDefaults[defaultKey] : category.name;
            const isSelected = isCategorySelected(localizedName);
            const stableId = category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            return (
              <TouchableOpacity
                key={category.name}
                onPress={() => toggleCategorySelection({...category, name: localizedName})}
                activeOpacity={0.7}
                testID={`onboarding-category-${stableId}`}
                accessibilityRole="checkbox"
                accessibilityLabel={localizedName}
                accessibilityState={{checked: isSelected}}>
                <View
                  style={[
                    gs.py8,
                    gs.px14,
                    gs.mr8,
                    gs.mt10,
                    gs.rounded12,
                    gs.rowCenter,
                    gs.gap6,
                    {
                      backgroundColor: isSelected ? colors.primaryText : colors.secondaryAccent,
                    },
                  ]}>
                  {category.icon !== undefined && (
                    <Icon
                      name={category.icon}
                      size={16}
                      color={isSelected ? colors.buttonText : (category.color ?? colors.secondaryText)}
                    />
                  )}
                  <PrimaryText
                    size={13}
                    weight={isSelected ? 'semibold' : 'regular'}
                    color={isSelected ? colors.buttonText : colors.primaryText}>
                    {localizedName}
                  </PrimaryText>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <PrimaryButton
        testID="onboarding-categories-continue"
        onPress={handleSubmit}
        colors={colors}
        buttonTitle={t('common.continue')}
        disabled={isSubmitting}
      />
    </PrimaryView>
  );
};

export default OnboardingScreen;

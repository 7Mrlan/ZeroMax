import {ScrollView, TextInput, View} from 'react-native';
import React from 'react';
import {useTranslation} from 'react-i18next';
import Icon from '../../components/atoms/Icons';
import PrimaryButton from '../../components/atoms/PrimaryButton';
import useChooseCurrency from './useChooseCurrency';
import PrimaryView from '../../components/atoms/PrimaryView';
import PrimaryText from '../../components/atoms/PrimaryText';
import CurrencySymbolPicker from '../../components/molecules/CurrencySymbolPicker';
import {gs} from '../../styles/globalStyles';

const ChooseCurrencyScreen = () => {
  const {colors, search, filteredCurrencies, selectedCurrency, isSubmitting, handleCurrencySubmit, handleSearch, handleCurrencySelect} =
    useChooseCurrency();
  const {t} = useTranslation();

  return (
    <PrimaryView colors={colors}>
      <View style={gs.pt15p}>
        <PrimaryText size={28} weight="bold">{t('chooseCurrency.title')}</PrimaryText>
        <PrimaryText size={28} weight="bold">{t('chooseCurrency.titleSuffix')}</PrimaryText>
      </View>

      <PrimaryText size={14} color={colors.secondaryText} style={gs.mt6}>
        {t('chooseCurrency.subtitle')}
      </PrimaryText>

      <View
        style={[
          gs.h48,
          gs.itemsCenter,
          gs.mt20,
          gs.mb15,
          gs.rounded12,
          gs.pl10,
          gs.justifyStart,
          gs.row,
          {backgroundColor: colors.secondaryAccent},
        ]}>
        <Icon name="search" size={18} color={colors.secondaryText} />
        <TextInput
          style={[gs.px15, gs.h48, gs.wFull, gs.fontMedium, gs.noFontPadding, {color: colors.primaryText}]}
          value={search}
          onChangeText={handleSearch}
          placeholder={t('chooseCurrency.searchPlaceholder')}
          placeholderTextColor={colors.secondaryText}
        />
      </View>

      {/* keyboardShouldPersistTaps + keyboardDismissMode replace the
          screen-wide TouchableWithoutFeedback: they dismiss the keyboard
          without taking the touch responder away from this ScrollView. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <CurrencySymbolPicker
          filteredCurrencies={filteredCurrencies}
          selectedCurrency={selectedCurrency}
          handleCurrencySelect={handleCurrencySelect}
        />
      </ScrollView>

      <PrimaryButton
        onPress={handleCurrencySubmit}
        colors={colors}
        buttonTitle={t('common.continue')}
        disabled={!selectedCurrency || isSubmitting}
      />
    </PrimaryView>
  );
};

export default ChooseCurrencyScreen;

import React, {useEffect, useState} from 'react';
import {Alert, Switch, TextInput, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import AppHeader from '../../components/atoms/AppHeader';
import PrimaryText from '../../components/atoms/PrimaryText';
import PrimaryButton from '../../components/atoms/PrimaryButton';
import PrimaryView from '../../components/atoms/PrimaryView';
import useThemeColors from '../../hooks/useThemeColors';
import {
  createNativeAiSecretStore,
  getAiSettings,
  saveAiSecret,
  saveAiSettings,
  clearAiSettings,
  type AiSecretStore,
} from '../../backend/ai/settings';
import {goBack, navigate} from '../../utils/navigationUtils';
import {gs} from '../../styles/globalStyles';

const AiSettingsScreen = () => {
  const colors = useThemeColors();
  const {t} = useTranslation();
  const current = getAiSettings();
  const [enabled, setEnabled] = useState(current.enabled);
  const [baseUrl, setBaseUrl] = useState(current.apiBaseUrl);
  const [model, setModel] = useState(current.modelName);
  const [apiKey, setApiKey] = useState('');
  const [secretStore, setSecretStore] = useState<AiSecretStore | null>(null);

  useEffect(() => {
    try {
      setSecretStore(createNativeAiSecretStore());
    } catch {
      setSecretStore(null);
    }
  }, []);

  const save = async () => {
    try {
      if (apiKey.trim()) {
        if (!secretStore) throw new Error(t('ai.secureStorageUnavailable'));
        await saveAiSecret(secretStore, apiKey);
      }
      saveAiSettings({enabled, apiBaseUrl: baseUrl, modelName: model});
      setApiKey('');
      Alert.alert(t('ai.savedTitle'), t('ai.savedMessage'));
    } catch (error) {
      setEnabled(false);
      saveAiSettings({enabled: false, apiBaseUrl: baseUrl, modelName: model});
      Alert.alert(t('ai.secureStorageUnavailable'), error instanceof Error ? error.message : t('ai.saveFailed'));
    }
  };

  const clear = async () => {
    await secretStore?.clear();
    clearAiSettings();
    setEnabled(false);
    setApiKey('');
  };

  return (
    <PrimaryView colors={colors}>
      <AppHeader onPress={goBack} colors={colors} text={t('ai.settingsTitle')} />
      <PrimaryText testID="ai-settings-privacy-notice" size={12} color={colors.secondaryText} style={gs.mt10}>
        {t('ai.privacyNotice')}
      </PrimaryText>
      <View style={[gs.rowBetweenCenter, gs.mt20]}>
        <PrimaryText weight="semibold">{t('ai.enable')}</PrimaryText>
        <Switch
          testID="ai-settings-enable"
          value={enabled}
          onValueChange={setEnabled}
          disabled={!secretStore}
          accessibilityLabel={t('ai.enable')}
          accessibilityRole="switch"
        />
      </View>
      <PrimaryText size={12} color={colors.secondaryText} style={gs.mt15}>
        {t('ai.endpointLabel')}
      </PrimaryText>
      <TextInput
        testID="ai-settings-endpoint"
        accessibilityLabel={t('ai.endpointLabel')}
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://api.example.com/v1"
        placeholderTextColor={colors.secondaryText}
        style={[
          gs.mt5,
          gs.px12,
          gs.py10,
          gs.rounded8,
          {color: colors.primaryText, backgroundColor: colors.containerColor},
        ]}
      />
      <PrimaryText size={12} color={colors.secondaryText} style={gs.mt15}>
        {t('ai.modelLabel')}
      </PrimaryText>
      <TextInput
        testID="ai-settings-model"
        accessibilityLabel={t('ai.modelLabel')}
        value={model}
        onChangeText={setModel}
        autoCapitalize="none"
        placeholder="model"
        placeholderTextColor={colors.secondaryText}
        style={[
          gs.mt5,
          gs.px12,
          gs.py10,
          gs.rounded8,
          {color: colors.primaryText, backgroundColor: colors.containerColor},
        ]}
      />
      <PrimaryText size={12} color={colors.secondaryText} style={gs.mt15}>
        {t('ai.apiKeyLabel')}
      </PrimaryText>
      <TextInput
        testID="ai-settings-api-key"
        accessibilityLabel={t('ai.apiKeyLabel')}
        value={apiKey}
        onChangeText={setApiKey}
        autoCapitalize="none"
        secureTextEntry
        placeholder={t('ai.apiKeyPlaceholder')}
        placeholderTextColor={colors.secondaryText}
        style={[
          gs.mt5,
          gs.px12,
          gs.py10,
          gs.rounded8,
          {color: colors.primaryText, backgroundColor: colors.containerColor},
        ]}
      />
      <View style={gs.mt20}>
        <PrimaryButton
          testID="ai-settings-save"
          onPress={save}
          colors={colors}
          buttonTitle={t('ai.save')}
          disabled={!secretStore}
        />
        <PrimaryButton
          testID="ai-settings-clear"
          onPress={clear}
          colors={colors}
          buttonTitle={t('ai.clearKey')}
          variant="ghost"
        />
        <PrimaryButton
          testID="ai-settings-queue"
          onPress={() => navigate('AiQueueScreen')}
          colors={colors}
          buttonTitle={t('ai.queueTitle')}
          variant="outline"
        />
      </View>
    </PrimaryView>
  );
};

export default AiSettingsScreen;
